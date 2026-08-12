import { prisma } from "@/src/lib/prisma";
import { syncProgramExerciseTargets } from "@/src/server/program-target-sync";

export type WorkoutStatePayload = {
  session: {
    id: string;
    title: string;
    status: string;
    startedAt: string | null;
    endedAt: string | null;
  };
  deviceSession: {
    id: string;
    status: "ACTIVE" | "PAUSED" | "COMPLETED";
    currentExerciseIndex: number;
    currentSetIndex: number;
    lastSyncAt: string;
    restStatus: "IDLE" | "ACTIVE" | "PAUSED";
    restRemainingSeconds: number;
    restUpdatedAt: string | null;
  };
  exercises: Array<{
    exerciseId: string;
    name: string;
    completedSets: number;
    lastSetIndex: number;
    totalVolume: number;
  }>;
  totals: {
    exerciseCount: number;
    setCount: number;
    volumeTotal: number;
  };
};

async function ensureDeviceSession(workoutSessionId: string) {
  return prisma.watchSession.upsert({
    where: { workoutSessionId },
    update: { lastSyncAt: new Date() },
    create: {
      workoutSessionId,
      currentExerciseIndex: 0,
      currentSetIndex: 1,
      status: "ACTIVE",
      lastSyncAt: new Date(),
    },
  });
}

export async function getCurrentWorkoutState(workoutSessionId: string): Promise<WorkoutStatePayload | null> {
  return getCurrentWorkoutStateForProfile(workoutSessionId);
}

export async function getCurrentWorkoutStateForProfile(workoutSessionId: string, userProfileId?: string): Promise<WorkoutStatePayload | null> {
  if (!workoutSessionId) return null;

  const session = await prisma.workoutSession.findUnique({
    where: userProfileId ? { id: workoutSessionId, userProfileId } : { id: workoutSessionId },
    include: {
      sets: {
        include: {
          exercise: {
            select: { id: true, name: true, nameFr: true },
          },
        },
        orderBy: [{ createdAt: "asc" }, { setIndex: "asc" }],
      },
    },
  });

  if (!session) return null;
  const deviceSession = await ensureDeviceSession(workoutSessionId);

  const byExercise = new Map<string, {
    exerciseId: string;
    name: string;
    completedSets: number;
    lastSetIndex: number;
    totalVolume: number;
  }>();

  for (const set of session.sets) {
    const current = byExercise.get(set.exerciseId) ?? {
      exerciseId: set.exerciseId,
      name: set.exercise.nameFr || set.exercise.name,
      completedSets: 0,
      lastSetIndex: 0,
      totalVolume: 0,
    };
    current.completedSets += 1;
    current.lastSetIndex = Math.max(current.lastSetIndex, set.setIndex);
    current.totalVolume += (set.actualReps ?? 0) * (set.actualWeightKg ?? 0);
    byExercise.set(set.exerciseId, current);
  }

  const exercises = [...byExercise.values()];
  const totals = {
    exerciseCount: exercises.length,
    setCount: session.sets.length,
    volumeTotal: exercises.reduce((acc, item) => acc + item.totalVolume, 0),
  };

  return {
    session: {
      id: session.id,
      title: session.title,
      status: session.status,
      startedAt: session.startedAt ? session.startedAt.toISOString() : null,
      endedAt: session.endedAt ? session.endedAt.toISOString() : null,
    },
    deviceSession: {
      id: deviceSession.id,
      status: deviceSession.status,
      currentExerciseIndex: deviceSession.currentExerciseIndex,
      currentSetIndex: deviceSession.currentSetIndex,
      lastSyncAt: deviceSession.lastSyncAt.toISOString(),
      restStatus: deviceSession.restStatus,
      restRemainingSeconds: deviceSession.restRemainingSeconds,
      restUpdatedAt: deviceSession.restUpdatedAt?.toISOString() ?? null,
    },
    exercises,
    totals,
  };
}

export async function updateSetCompleted(input: {
  workoutSessionId: string;
  exerciseId: string;
  setIndex: number;
  targetReps?: number | null;
  actualReps?: number | null;
  actualWeightKg?: number | null;
  restSeconds?: number | null;
  userProfileId?: string;
}) {
  const { workoutSessionId, exerciseId, setIndex } = input;
  if (!workoutSessionId || !exerciseId || !Number.isFinite(setIndex) || setIndex < 1) return null;

  const session = input.userProfileId
    ? await prisma.workoutSession.findUnique({
        where: { id: workoutSessionId, userProfileId: input.userProfileId },
        select: { id: true },
      })
    : await prisma.workoutSession.findUnique({
        where: { id: workoutSessionId },
        select: { id: true },
      });

  if (!session) return null;

  const existing = await prisma.workoutSet.findFirst({
    where: { workoutSessionId, exerciseId, setIndex },
    orderBy: { createdAt: "desc" },
  });

  const payload = {
    targetRepsMin: Number.isFinite(input.targetReps as number) && (input.targetReps as number) > 0 ? Math.floor(input.targetReps as number) : null,
    targetRepsMax: Number.isFinite(input.targetReps as number) && (input.targetReps as number) > 0 ? Math.floor(input.targetReps as number) : null,
    actualReps: Number.isFinite(input.actualReps as number) && (input.actualReps as number) > 0 ? Math.floor(input.actualReps as number) : null,
    actualWeightKg: Number.isFinite(input.actualWeightKg as number) && (input.actualWeightKg as number) >= 0 ? input.actualWeightKg as number : null,
    restSeconds: Number.isFinite(input.restSeconds as number) && (input.restSeconds as number) >= 0 ? Math.floor(input.restSeconds as number) : null,
    isCompleted: true,
    completedAt: new Date(),
  };
  const syncedProgramExerciseId = await syncProgramExerciseTargets({
    workoutSessionId,
    exerciseId,
    actualReps: payload.actualReps,
    actualWeightKg: payload.actualWeightKg,
  });

  if (existing) {
    await prisma.workoutSet.update({
      where: { id: existing.id },
      data: {
        ...payload,
        ...(syncedProgramExerciseId ? { programExerciseId: syncedProgramExerciseId } : {}),
      },
    });
  } else {
    await prisma.workoutSet.create({
      data: {
        workoutSessionId,
        exerciseId,
        programExerciseId: syncedProgramExerciseId,
        setIndex,
        ...payload,
      },
    });
  }

  await prisma.watchSession.upsert({
    where: { workoutSessionId },
    update: {
      currentSetIndex: setIndex + 1,
      status: "ACTIVE",
      lastSyncAt: new Date(),
    },
    create: {
      workoutSessionId,
      currentExerciseIndex: 0,
      currentSetIndex: setIndex + 1,
      status: "ACTIVE",
      lastSyncAt: new Date(),
    },
  });

  return getCurrentWorkoutStateForProfile(workoutSessionId, input.userProfileId);
}

export async function goToNextExercise(workoutSessionId: string, userProfileId?: string) {
  if (!workoutSessionId) return null;
  const session = userProfileId
    ? await prisma.workoutSession.findUnique({ where: { id: workoutSessionId, userProfileId }, select: { id: true } })
    : await prisma.workoutSession.findUnique({ where: { id: workoutSessionId }, select: { id: true } });

  if (!session) return null;

  const current = await ensureDeviceSession(workoutSessionId);

  await prisma.watchSession.update({
    where: { id: current.id },
    data: {
      currentExerciseIndex: current.currentExerciseIndex + 1,
      currentSetIndex: 1,
      status: "ACTIVE",
      lastSyncAt: new Date(),
    },
  });

  return getCurrentWorkoutStateForProfile(workoutSessionId, userProfileId);
}

export async function syncWorkoutState(input: {
  workoutSessionId: string;
  currentExerciseIndex?: number;
  currentSetIndex?: number;
  restRemaining?: number;
  restStatus?: "IDLE" | "ACTIVE" | "PAUSED";
  status?: "ACTIVE" | "PAUSED" | "COMPLETED";
  lastSyncAt?: string;
  userProfileId?: string;
}) {
  if (!input.workoutSessionId) return null;
  const session = input.userProfileId
    ? await prisma.workoutSession.findUnique({ where: { id: input.workoutSessionId, userProfileId: input.userProfileId }, select: { id: true } })
    : await prisma.workoutSession.findUnique({ where: { id: input.workoutSessionId }, select: { id: true } });

  if (!session) return null;

  const fallback = await ensureDeviceSession(input.workoutSessionId);
  const syncDate = input.lastSyncAt ? new Date(input.lastSyncAt) : new Date();
  const currentExerciseIndex = Number.isFinite(input.currentExerciseIndex as number)
    ? Math.max(0, Math.floor(input.currentExerciseIndex as number))
    : fallback.currentExerciseIndex;
  const currentSetIndex = Number.isFinite(input.currentSetIndex as number)
    ? Math.max(1, Math.floor(input.currentSetIndex as number))
    : fallback.currentSetIndex;
  const currentScore = (fallback.currentExerciseIndex * 1000) + fallback.currentSetIndex;
  const incomingScore = (currentExerciseIndex * 1000) + currentSetIndex;
  const shouldPreventRollback = (input.status ?? fallback.status) === "ACTIVE" && incomingScore < currentScore;

  await prisma.watchSession.update({
    where: { id: fallback.id },
    data: {
      currentExerciseIndex: shouldPreventRollback ? fallback.currentExerciseIndex : currentExerciseIndex,
      currentSetIndex: shouldPreventRollback ? fallback.currentSetIndex : currentSetIndex,
      status: input.status ?? fallback.status,
      lastSyncAt: Number.isNaN(syncDate.getTime()) ? new Date() : syncDate,
    },
  });

  if (Number.isFinite(input.restRemaining)) {
    const restRemainingSeconds = Math.max(0, Math.min(600, Math.floor(input.restRemaining as number)));
    const restStatus = restRemainingSeconds <= 0 ? "IDLE" : input.restStatus === "PAUSED" ? "PAUSED" : "ACTIVE";
    await prisma.watchSession.update({
      where: { id: fallback.id },
      data: { restStatus, restRemainingSeconds, restUpdatedAt: new Date(), lastSyncAt: new Date() },
    });
  }

  return getCurrentWorkoutStateForProfile(input.workoutSessionId, input.userProfileId);
}
