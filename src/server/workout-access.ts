import { prisma } from "@/src/lib/prisma";
import { accountTrialEnd, hasPremiumAccess, type AccessProfile } from "@/src/lib/premium-access-rules";

export async function canAccessExistingWorkout(profile: AccessProfile & { id: string }, sessionId?: string, includeCompleted = false, db = prisma) {
  const end = accountTrialEnd(profile);
  if (!end || !profile.trialStartedAt) return false;
  // This exception never authorizes creating a workout or generating a program.
  return !!await db.workoutSession.findFirst({
    where: {
      ...(sessionId ? { id: sessionId } : {}), userProfileId: profile.id,
      status: includeCompleted ? { in: ["IN_PROGRESS", "COMPLETED"] } : "IN_PROGRESS",
      startedAt: { gte: profile.trialStartedAt, lt: new Date(end) },
    },
    select: { id: true },
  });
}

export async function ownsAccessibleWorkout(profile: AccessProfile & { id: string }, sessionId: string, includeCompleted = false, db = prisma) {
  if (!sessionId) return false;
  if (!hasPremiumAccess(profile)) return canAccessExistingWorkout(profile, sessionId, includeCompleted, db);
  return !!await db.workoutSession.findFirst({
    where: { id: sessionId, userProfileId: profile.id, status: includeCompleted ? { in: ["IN_PROGRESS", "COMPLETED"] } : "IN_PROGRESS" },
    select: { id: true },
  });
}
