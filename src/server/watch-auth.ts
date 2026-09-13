import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasPremiumAccess } from "@/src/lib/premium-access-rules";
import { prisma } from "@/src/lib/prisma";
import { hashWatchDeviceToken } from "@/src/lib/watch-device-token";
import { touchWatchPresence } from "./watch-presence";
import { canAccessExistingWorkout } from "./workout-access";
import type { AccessProfile } from "@/src/lib/premium-access-rules";

async function hasWatchRouteAccess(request: Request, profile: AccessProfile & { id: string }) {
  if (hasPremiumAccess(profile)) return true;
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/watch/history") return true;
  const existingRoutes = new Set(["current-session", "getCurrentWorkoutState", "syncWorkoutState", "nextExercise", "updateSetCompleted", "validate-set", "update-live-target", "skip-rest", "adjust-rest", "pause-rest", "resume-rest", "select-exercise", "next-exercise", "previous-exercise", "complete-session", "session-metrics", "feedback"]);
  if (!existingRoutes.has(url.pathname.replace("/api/watch/", ""))) return false;
  const body = request.method === "GET" ? null : await request.clone().json().catch(() => null);
  const sessionId = request.method === "GET" ? (url.searchParams.get("sessionId") ?? url.searchParams.get("workoutSessionId")) : (body?.sessionId ?? body?.workoutSessionId);
  if (!sessionId && request.method === "GET" && ["/api/watch/current-session", "/api/watch/getCurrentWorkoutState"].includes(url.pathname)) return canAccessExistingWorkout(profile);
  if (typeof sessionId !== "string" || !sessionId) return false;
  const includeCompleted = ["/api/watch/current-session", "/api/watch/getCurrentWorkoutState", "/api/watch/complete-session", "/api/watch/session-metrics", "/api/watch/feedback"].includes(url.pathname);
  return canAccessExistingWorkout(profile, sessionId, includeCompleted);
}

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
        trialStartedAt: true,
        trialEndsAt: true,
      },
    });

    if (profile) {
      if (!await hasWatchRouteAccess(request, profile)) {
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
            trialStartedAt: true,
            trialEndsAt: true,
          },
        },
      },
    });

    if (device && !device.revokedAt) {
      if (!await hasWatchRouteAccess(request, { ...device.userProfile, id: device.userProfileId })) {
        return {
          ok: false,
          response: NextResponse.json({ error: "premium_required" }, { status: 402 }),
        };
      }

      await touchWatchPresence(device);

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
