import { prisma } from "@/src/lib/prisma";
import { ACCOUNT_TRIAL_MS, accountTrialEnd, hasFullAccess, hasPremiumAccess, type AccessProfile } from "@/src/lib/premium-access-rules";
import { getTrialProgramId } from "./trial-program-access";

export async function canAccessExistingWorkout(profile: AccessProfile & { id: string }, sessionId?: string, includeCompleted = false, db = prisma) {
  const billingTrialEnd = profile.subscriptionStatus === "TRIALING" ? profile.subscriptionCurrentPeriodEnd?.getTime() ?? 0 : 0;
  const end = billingTrialEnd || accountTrialEnd(profile);
  const start = billingTrialEnd ? new Date(billingTrialEnd - ACCOUNT_TRIAL_MS) : profile.trialStartedAt;
  if (!end || !start) return false;
  const programId = await getTrialProgramId(db, profile.id);
  if (!programId) return false;
  // This exception never authorizes creating a workout or generating a program.
  return !!await db.workoutSession.findFirst({
    where: {
      ...(sessionId ? { id: sessionId } : {}), userProfileId: profile.id, programId,
      status: includeCompleted ? { in: ["IN_PROGRESS", "COMPLETED"] } : "IN_PROGRESS",
      startedAt: { gte: start, lt: new Date(end) },
    },
    select: { id: true },
  });
}

export async function ownsAccessibleWorkout(profile: AccessProfile & { id: string }, sessionId: string, includeCompleted = false, db = prisma) {
  if (!sessionId) return false;
  if (!hasPremiumAccess(profile)) return canAccessExistingWorkout(profile, sessionId, includeCompleted, db);
  const programId = hasFullAccess(profile) ? undefined : await getTrialProgramId(db, profile.id);
  if (programId === null) return false;
  return !!await db.workoutSession.findFirst({
    where: { id: sessionId, userProfileId: profile.id, ...(programId ? { programId } : {}), status: includeCompleted ? { in: ["IN_PROGRESS", "COMPLETED"] } : "IN_PROGRESS" },
    select: { id: true },
  });
}
