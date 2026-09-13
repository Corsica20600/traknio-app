import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasPremiumAccess } from "@/src/lib/premium-access-rules";
import { prisma } from "@/src/lib/prisma";
import { hashWatchDeviceToken } from "@/src/lib/watch-device-token";

type WatchAccessResult =
  | { ok: true; mode: "session" | "device"; userProfileId: string; profileEmail?: string | null }
  | { ok: false; response: NextResponse };

export async function requireWatchAccess(request: Request): Promise<WatchAccessResult> {
  const session = await auth().catch(() => null);
  if (session?.user?.email) {
    const email = session.user.email.trim().toLowerCase();
    const profile = await prisma.userProfile.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
      },
    });

    if (profile) {
      if (!hasPremiumAccess(profile)) {
        return {
          ok: false,
          response: NextResponse.json({ error: "premium_required" }, { status: 402 }),
        };
      }
      return { ok: true, mode: "session", userProfileId: profile.id, profileEmail: profile.email };
    }

    // Never let legacy routes call optional-owner helpers with no owner filter.
    return { ok: false, response: NextResponse.json({ error: "watch_profile_required" }, { status: 401 }) };
  }

  const deviceToken = request.headers.get("x-watch-device-token")?.trim() || "";
  if (deviceToken) {
    const device = await prisma.watchDevice.findUnique({
      where: { tokenHash: hashWatchDeviceToken(deviceToken) },
      select: {
        id: true,
        lastSeenAt: true,
        revokedAt: true,
        userProfileId: true,
        userProfile: {
          select: {
            email: true,
            subscriptionStatus: true,
            subscriptionCurrentPeriodEnd: true,
          },
        },
      },
    });

    if (device && !device.revokedAt) {
      if (!hasPremiumAccess(device.userProfile)) {
        return {
          ok: false,
          response: NextResponse.json({ error: "premium_required" }, { status: 402 }),
        };
      }

      const now = Date.now();
      const lastSeenAtMs = device.lastSeenAt?.getTime() ?? 0;
      if (now - lastSeenAtMs > 60_000) {
        await prisma.watchDevice.update({
          where: { id: device.id },
          data: { lastSeenAt: new Date(now) },
        });
      }

      return {
        ok: true,
        mode: "device",
        userProfileId: device.userProfileId,
        profileEmail: device.userProfile.email,
      };
    }
  }

  return {
    ok: false,
    response: NextResponse.json(
      { error: "watch_pairing_required" },
      { status: 401 },
    ),
  };
}
