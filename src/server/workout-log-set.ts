import type { Prisma } from "@prisma/client";
import { syncProgramExerciseTargets } from "./program-target-sync";
import { lockWorkoutForSet } from "./workout-set-lock";

export class WorkoutSetError extends Error {}

export type PhoneWorkoutSetInput = {
  sessionId: string; userProfileId: string; exerciseId: string; programExerciseId: string;
  setIndex: number; currentExerciseIndex: number | null; totalSetsForExercise: number | null;
  targetReps: number; actualReps: number | null; actualWeightKg: number | null; restSeconds: number;
};

/** Uses the existing set as the idempotency record, without a receipt write. */
export async function logPhoneWorkoutSet(tx: Prisma.TransactionClient, input: PhoneWorkoutSetInput) {
  const { sessionId, userProfileId, exerciseId, programExerciseId, setIndex, currentExerciseIndex,
    totalSetsForExercise, targetReps, actualReps, actualWeightKg, restSeconds } = input;
  const session = await lockWorkoutForSet(tx, sessionId, userProfileId);
  if (!session) throw new WorkoutSetError("workout_not_found");
  const existing = await tx.workoutSet.findFirst({
    where: { workoutSessionId: sessionId, exerciseId, setIndex },
    orderBy: { createdAt: "desc" },
  });
  // A completed series is immutable here: retries must not restart rest or regress position.
  if (existing?.isCompleted) {
    const watchState = await tx.watchSession.findUnique({ where: { workoutSessionId: sessionId } });
    return { completedSet: existing, watchState, sessionStatus: session.status, replay: true };
  }
  if (session.status !== "IN_PROGRESS") throw new WorkoutSetError("workout_completed");
  const needsWeightHistory = !(actualWeightKg != null && actualWeightKg > 0) && !((existing?.actualWeightKg ?? 0) > 0);
  const latestPositiveWeightInSession = needsWeightHistory ? await tx.workoutSet.findFirst({
    where: {
      workoutSessionId: sessionId,
      exerciseId,
      actualWeightKg: { gt: 0 },
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: { actualWeightKg: true },
  }) : null;
  const latestPositiveWeightGlobal = needsWeightHistory && !latestPositiveWeightInSession ? await tx.workoutSet.findFirst({
    where: {
      workoutSession: { userProfileId },
      exerciseId,
      actualWeightKg: { gt: 0 },
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: { actualWeightKg: true },
  }) : null;
  const resolvedWeight = (() => {
    const incoming = Number.isFinite(actualWeightKg as number) && (actualWeightKg as number) >= 0 ? (actualWeightKg as number) : null;
    if (incoming != null && incoming > 0) return incoming;
    if ((existing?.actualWeightKg ?? 0) > 0) return existing!.actualWeightKg!;
    if ((latestPositiveWeightInSession?.actualWeightKg ?? 0) > 0) return latestPositiveWeightInSession!.actualWeightKg!;
    if ((latestPositiveWeightGlobal?.actualWeightKg ?? 0) > 0) return latestPositiveWeightGlobal!.actualWeightKg!;
    return incoming;
  })();

  const payload = {
    targetRepsMin: Number.isFinite(targetReps) && targetReps > 0 ? targetReps : null,
    targetRepsMax: Number.isFinite(targetReps) && targetReps > 0 ? targetReps : null,
    actualReps: Number.isFinite(actualReps as number) && (actualReps as number) > 0 ? (actualReps as number) : null,
    actualWeightKg: resolvedWeight,
    restSeconds: Number.isFinite(restSeconds) ? Math.max(0, restSeconds) : 90,
    isCompleted: true,
    completedAt: new Date(),
  };
  const syncedProgramExerciseId = await syncProgramExerciseTargets({
    workoutSessionId: sessionId,
    exerciseId,
    programExerciseId: programExerciseId || null,
    actualReps: payload.actualReps,
    actualWeightKg: payload.actualWeightKg,
  }, tx, session.programId);

  const completedSet = existing
    ? await tx.workoutSet.update({
      where: { id: existing.id },
      data: {
        ...payload,
        ...(syncedProgramExerciseId ? { programExerciseId: syncedProgramExerciseId } : {}),
      },
    })
    : await tx.workoutSet.create({
      data: {
        workoutSessionId: sessionId,
        exerciseId,
        programExerciseId: syncedProgramExerciseId,
        setIndex,
        ...payload,
      },
    });

  const exerciseFinished =
  Number.isFinite(totalSetsForExercise as number) &&
  (totalSetsForExercise as number) > 0 &&
  completedSet.setIndex >= Math.floor(totalSetsForExercise as number);
  const baseExerciseIndex = Number.isFinite(currentExerciseIndex as number) ? Math.max(0, Math.floor(currentExerciseIndex as number)) : 0;
  const nextExerciseIndex = exerciseFinished ? baseExerciseIndex + 1 : baseExerciseIndex;
  const nextSetIndex = exerciseFinished ? 1 : Math.max(1, completedSet.setIndex + 1);

  const watchState = await tx.watchSession.upsert({
  where: { workoutSessionId: sessionId },
  update: {
    currentExerciseIndex: nextExerciseIndex,
    currentSetIndex: nextSetIndex,
    status: "ACTIVE",
    restStatus: payload.restSeconds > 0 ? "ACTIVE" : "IDLE",
    restRemainingSeconds: payload.restSeconds,
    restUpdatedAt: new Date(),
    lastSyncAt: new Date(),
  },
  create: {
    workoutSessionId: sessionId,
    currentExerciseIndex: nextExerciseIndex,
    currentSetIndex: nextSetIndex,
    status: "ACTIVE",
    restStatus: payload.restSeconds > 0 ? "ACTIVE" : "IDLE",
    restRemainingSeconds: payload.restSeconds,
    restUpdatedAt: new Date(),
    lastSyncAt: new Date(),
  },
  });
  return { completedSet, watchState, sessionStatus: session.status, replay: false };
}
