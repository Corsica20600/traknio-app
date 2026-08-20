import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { syncProgramExerciseTargets } from "@/src/server/program-target-sync";

export async function POST(request: Request) {
  const body = await request.json();

  const sessionId = String(body.sessionId ?? "").trim();
  const exerciseId = String(body.exerciseId ?? "").trim();
  const programExerciseId = String(body.programExerciseId ?? "").trim();
  const setIndex = Number(body.setIndex ?? 0);
  const currentExerciseIndex = body.currentExerciseIndex == null ? null : Number(body.currentExerciseIndex);
  const totalSetsForExercise = body.totalSetsForExercise == null ? null : Number(body.totalSetsForExercise);
  const targetReps = Number(body.targetReps ?? 0);
  const actualReps = body.actualReps == null ? null : Number(body.actualReps);
  const actualWeightKg = body.actualWeightKg == null ? null : Number(body.actualWeightKg);
  const restSeconds = Number(body.restSeconds ?? 90);

  if (!sessionId || !exerciseId || !Number.isFinite(setIndex) || setIndex < 1) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const existing = await prisma.workoutSet.findFirst({
    where: { workoutSessionId: sessionId, exerciseId, setIndex },
    orderBy: { createdAt: "desc" },
  });
  const latestPositiveWeightInSession = await prisma.workoutSet.findFirst({
    where: {
      workoutSessionId: sessionId,
      exerciseId,
      actualWeightKg: { gt: 0 },
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: { actualWeightKg: true },
  });
  const latestPositiveWeightGlobal = await prisma.workoutSet.findFirst({
    where: {
      exerciseId,
      actualWeightKg: { gt: 0 },
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: { actualWeightKg: true },
  });
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
  });

  const saved = await prisma.$transaction(async (tx) => {
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
    return { completedSet, watchState };
  });

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
    state: {
      sessionId,
      revision: saved.watchState.lastSyncAt.toISOString(),
      status: "IN_PROGRESS",
      exerciseIndex: saved.watchState.currentExerciseIndex,
      setIndex: saved.watchState.currentSetIndex,
      targetReps: null,
      weight: null,
      restRemaining: saved.watchState.restRemainingSeconds,
      restStatus: saved.watchState.restStatus,
      restUpdatedAt: saved.watchState.restUpdatedAt?.toISOString() ?? null,
    },
  });
}
