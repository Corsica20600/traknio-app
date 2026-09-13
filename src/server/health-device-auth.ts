import { NextResponse } from "next/server";
import { hasPremiumAccess } from "@/src/lib/premium-access-rules";
import { prisma } from "@/src/lib/prisma";
import { hashDeviceToken } from "@/src/lib/device-token";

type HealthAccessResult =
  | { ok: true; mode: "device"; userProfileId: string }
  | { ok: false; response: NextResponse };

export async function requireHealthSyncAccess(
  request: Request,
  provider: "health_connect" | "samsung_health",
): Promise<HealthAccessResult> {
  void provider;

  const deviceToken = request.headers.get("x-health-device-token")?.trim() || "";
  if (deviceToken) {
    const device = await prisma.healthDevice.findUnique({
      where: { tokenHash: hashDeviceToken(deviceToken) },
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
            trialStartedAt: true,
            trialEndsAt: true,
          },
        },
      },
    });

    if (device && !device.revokedAt) {
      if (!hasPremiumAccess(device.userProfile)) {
        return {
          ok: false,
          response: NextResponse.json({ ok: false, error: "premium_required" }, { status: 402 }),
        };
      }

      const now = Date.now();
      const lastSeenAtMs = device.lastSeenAt?.getTime() ?? 0;
      if (now - lastSeenAtMs > 60_000) {
        await prisma.healthDevice.update({
          where: { id: device.id },
          data: { lastSeenAt: new Date(now) },
        });
      }

      return { ok: true, mode: "device", userProfileId: device.userProfileId };
    }
  }

  return {
    ok: false,
    response: NextResponse.json({ ok: false, error: "health_device_pairing_required" }, { status: 401 }),
  };
}
