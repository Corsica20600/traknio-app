import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { logPhoneWorkoutSet, WorkoutSetError } from "@/src/server/workout-log-set";
import { getSharedRestRemaining } from "@/src/server/shared-rest-timer";
import { logSyncMetric } from "@/src/server/sync-metrics";
import { getAuthenticatedUserProfile } from "@/src/server/fitness-queries";
import { ownsAccessibleWorkout } from "@/src/server/workout-access";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const sessionId = String(body.sessionId ?? "").trim();
  const profile = await getAuthenticatedUserProfile();
  if (!await ownsAccessibleWorkout(profile, sessionId, true)) return NextResponse.json({ error: "workout_access_denied" }, { status: 403 });
  const exerciseId = String(body.exerciseId ?? "").trim();
  const programExerciseId = String(body.programExerciseId ?? "").trim();
  const setIndex = Number(body.setIndex ?? 0);
  const currentExerciseIndex = body.currentExerciseIndex == null ? null : Number(body.currentExerciseIndex);
  const totalSetsForExercise = body.totalSetsForExercise == null ? null : Number(body.totalSetsForExercise);
  const targetReps = Number(body.targetReps ?? 0);
  const actualReps = body.actualReps == null ? null : Number(body.actualReps);
  const actualWeightKg = body.actualWeightKg == null ? null : Number(body.actualWeightKg);
  const restSeconds = Number(body.restSeconds ?? 90);

  if (!sessionId || !exerciseId || !Number.isInteger(setIndex) || setIndex < 1) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if ([currentExerciseIndex, totalSetsForExercise, targetReps, actualReps, actualWeightKg, restSeconds].some(value => value != null && (!Number.isFinite(value) || value < 0)) ||
      (actualReps != null && (!Number.isInteger(actualReps) || actualReps < 1)) ||
      (currentExerciseIndex != null && !Number.isInteger(currentExerciseIndex)) ||
      (totalSetsForExercise != null && (!Number.isInteger(totalSetsForExercise) || totalSetsForExercise < 1))) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const actionId = request.headers.get("x-traknio-action-id")?.trim() || undefined;
  logSyncMetric({ event: "API_RECEIVED", sessionId, actionId, action: "validate-set", origin: "PHONE", transport: "HTTPS_PHONE" });

  const transactionStartedAt = Date.now();
  logSyncMetric({ event: "DB_TRANSACTION_STARTED", sessionId, actionId, action: "validate-set", origin: "PHONE", transport: "HTTPS_PHONE" });
  let saved;
  try {
    saved = await prisma.$transaction(tx => logPhoneWorkoutSet(tx, {
      sessionId, userProfileId: profile.id, exerciseId, programExerciseId, setIndex,
      currentExerciseIndex, totalSetsForExercise, targetReps, actualReps, actualWeightKg, restSeconds,
    }));
  } catch (error) {
    if (error instanceof WorkoutSetError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
  logSyncMetric({ event: "DB_COMMITTED", sessionId, actionId, action: "validate-set", origin: "PHONE", transport: "HTTPS_PHONE", durationMs: Date.now() - transactionStartedAt });

  logSyncMetric({ event: "API_CONFIRMED", sessionId, actionId, action: "validate-set", origin: "PHONE", transport: "HTTPS_PHONE", status: 200 });
  return NextResponse.json({
    set: {
      id: saved.completedSet.id,
      exerciseId: saved.completedSet.exerciseId,
      setIndex: saved.completedSet.setIndex,
      targetRepsMin: saved.completedSet.targetRepsMin,
      actualReps: saved.completedSet.actualReps,
      actualWeightKg: saved.completedSet.actualWeightKg,
      createdAt: saved.completedSet.createdAt.toISOString(),
    },
    state: saved.watchState ? {
      sessionId,
      revision: saved.watchState.lastSyncAt.toISOString(),
      status: saved.sessionStatus === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
      exerciseIndex: saved.watchState.currentExerciseIndex,
      setIndex: saved.watchState.currentSetIndex,
      targetReps: null,
      weight: null,
      restRemaining: getSharedRestRemaining({ status: saved.watchState.restStatus, remainingSeconds: saved.watchState.restRemainingSeconds, updatedAt: saved.watchState.restUpdatedAt }),
      restStatus: saved.watchState.restStatus,
      restUpdatedAt: saved.watchState.restUpdatedAt?.toISOString() ?? null,
    } : undefined,
  });
}
