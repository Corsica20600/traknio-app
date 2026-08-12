import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { getExerciseDisplayName } from "@/src/lib/exercise-overrides";
import { getOrCreateDemoProfile } from "@/src/server/fitness-queries";
import { getSessionExerciseReplacements, getSessionLiveTargets, resolveReplacementExercises } from "@/src/server/session-exercise-replacements";

const DEFAULT_REPS = [12, 10, 10];

type WatchPayload = {
  sessionId: string;
  exerciseName: string;
  exerciseIndex: number;
  totalExercises: number;
  setIndex: number;
  totalSets: number;
  targetReps: number;
  weight: number | null;
  restRemaining: number;
  status: string;
  summary?: WatchSessionSummary;
};

type WatchSessionSummary = {
  durationSeconds: number | null;
  volumeKg: number;
  sets: number;
  calories: number | null;
  xpGained: number;
  level: number;
  levelReached: boolean;
};

type OrderedExercise = {
  exerciseId: string;
  programExerciseId: string | null;
  exerciseName: string;
  totalSets: number;
  targetReps: number;
  restSeconds: number;
  plannedWeightKg: number | null;
};

type WatchDatabase = Prisma.TransactionClient | typeof prisma;

function parseWeightKgFromText(text?: string | null) {
  if (!text) return null;
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getLevelFromXp(totalXp: number) {
  let level = 1;
  let xpSpent = 0;
  let nextRequirement = 300;

  while (totalXp >= xpSpent + nextRequirement) {
    xpSpent += nextRequirement;
    level += 1;
    nextRequirement = 300 + (level - 1) * 120;
  }

  return level;
}

async function getLatestCalories(userProfileId: string, db: WatchDatabase) {
  const metric = await db.progressMetric.findFirst({
    where: {
      userProfileId,
      metricType: "PERFORMANCE",
      unit: "kcal",
      notes: { contains: "\"metric\":\"calories\"" },
    },
    orderBy: { measuredAt: "desc" },
    select: { value: true },
  });
  return metric?.value == null ? null : Math.max(0, Math.round(metric.value));
}

async function getWatchSessionSummary(session: {
  id: string;
  userProfileId: string;
  durationSeconds: number | null;
  status: string;
}, db: WatchDatabase): Promise<WatchSessionSummary | undefined> {
  if (session.status !== "COMPLETED") return undefined;

  const [sets, completedSessionsCount, calories] = await Promise.all([
    db.workoutSet.findMany({
      where: { workoutSessionId: session.id, isCompleted: true },
      select: { actualReps: true, actualWeightKg: true },
    }),
    db.workoutSession.count({
      where: { userProfileId: session.userProfileId, status: "COMPLETED" },
    }),
    getLatestCalories(session.userProfileId, db),
  ]);

  const volumeKg = sets.reduce((acc, set) => acc + (set.actualReps ?? 0) * (set.actualWeightKg ?? 0), 0);
  const previousLevel = getLevelFromXp(Math.max(0, completedSessionsCount - 1) * 100);
  const level = getLevelFromXp(completedSessionsCount * 100);

  return {
    durationSeconds: session.durationSeconds,
    volumeKg: Math.round(volumeKg),
    sets: sets.length,
    calories,
    xpGained: 100,
    level,
    levelReached: level > previousLevel,
  };
}

async function resolveSession(sessionId?: string, userProfileId?: string, db: WatchDatabase = prisma) {
  if (sessionId) {
    return db.workoutSession.findUnique({
      where: userProfileId ? { id: sessionId, userProfileId } : { id: sessionId },
      include: {
        watchSession: true,
        sets: {
          include: { exercise: { select: { id: true, slug: true, name: true, nameFr: true } } },
          orderBy: [{ createdAt: "asc" }, { setIndex: "asc" }],
        },
      },
    });
  }

  const profile = userProfileId ? null : await getOrCreateDemoProfile();
  return db.workoutSession.findFirst({
    where: { userProfileId: userProfileId ?? profile!.id, status: "IN_PROGRESS" },
    include: {
      watchSession: true,
      sets: {
        include: { exercise: { select: { id: true, slug: true, name: true, nameFr: true } } },
        orderBy: [{ createdAt: "asc" }, { setIndex: "asc" }],
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function getOrderedExercisesForSession(session: {
  id: string;
  userProfileId: string;
  programId: string | null;
  programDayId: string | null;
  notes: string | null;
  sets: Array<{ exerciseId: string; exercise: { id: string; slug: string; name: string; nameFr: string | null } }>;
}, db: WatchDatabase) {
  const latestWeightsRows = await db.workoutSet.findMany({
    where: {
      workoutSession: { userProfileId: session.userProfileId },
      actualWeightKg: { gt: 0 },
    },
    orderBy: [{ createdAt: "desc" }],
    select: { exerciseId: true, actualWeightKg: true },
    take: 500,
  });
  const latestWeightByExercise = new Map<string, number>();
  for (const row of latestWeightsRows) {
    if (!latestWeightByExercise.has(row.exerciseId) && row.actualWeightKg != null) {
      latestWeightByExercise.set(row.exerciseId, row.actualWeightKg);
    }
  }

  if (session.programId) {
    const program = await db.program.findUnique({
      where: { id: session.programId },
      include: {
        days: {
          orderBy: { dayIndex: "asc" },
          include: {
            exercises: {
              orderBy: { orderIndex: "asc" },
              include: {
                exercise: {
                  select: { id: true, slug: true, name: true, nameFr: true },
                },
              },
            },
          },
        },
      },
    });

    if (program) {
      const dayForToday = session.programDayId
        ? (program.days.find((day) => day.id === session.programDayId) ?? program.days[0] ?? null)
        : (program.days[0] ?? null);

      if (dayForToday) {
        const replacements = getSessionExerciseReplacements(session.notes);
        const replacementExercises = await resolveReplacementExercises(session.notes);
        const fromProgramDay = dayForToday.exercises.map((item) => {
          const effectiveExerciseId = replacements[item.id]?.exerciseId ?? item.exerciseId;
          const effectiveExercise = replacementExercises.get(effectiveExerciseId) ?? item.exercise;
          return {
            exerciseId: effectiveExerciseId,
            programExerciseId: item.id,
            exerciseName: getExerciseDisplayName(effectiveExercise),
            totalSets: Math.max(1, item.sets ?? 3),
            targetReps: item.repsMin ?? item.repsMax ?? DEFAULT_REPS[0],
            restSeconds: item.restSeconds ?? 90,
            plannedWeightKg: parseWeightKgFromText(item.repsText) ?? latestWeightByExercise.get(effectiveExerciseId) ?? null,
          };
        });
        if (fromProgramDay.length > 0) return fromProgramDay;
      }
    }
  }

  const distinctFromSets = new Map<string, OrderedExercise>();
  for (const set of session.sets) {
    if (!distinctFromSets.has(set.exerciseId)) {
      distinctFromSets.set(set.exerciseId, {
        exerciseId: set.exerciseId,
        programExerciseId: null,
        exerciseName: getExerciseDisplayName(set.exercise),
        totalSets: 3,
        targetReps: DEFAULT_REPS[0],
        restSeconds: 90,
        plannedWeightKg: latestWeightByExercise.get(set.exerciseId) ?? null,
      });
    }
  }
  if (distinctFromSets.size > 0) return [...distinctFromSets.values()];

  const fallback = await db.exercise.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true, nameFr: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 6,
  });
  return fallback.map((item) => ({
    exerciseId: item.id,
    programExerciseId: null,
    exerciseName: getExerciseDisplayName(item),
    totalSets: 3,
    targetReps: DEFAULT_REPS[0],
    restSeconds: 90,
    plannedWeightKg: latestWeightByExercise.get(item.id) ?? null,
  }));
}

export async function getWatchPayload(sessionId?: string, userProfileId?: string, db: WatchDatabase = prisma): Promise<WatchPayload | null> {
  const session = await resolveSession(sessionId, userProfileId, db);
  if (!session) return null;

  const ordered = await getOrderedExercisesForSession(session, db);
  const totalExercises = Math.max(1, ordered.length);
  const exerciseIndexRaw = session.watchSession?.currentExerciseIndex ?? 0;
  const exerciseIndex = Math.max(0, Math.min(totalExercises - 1, exerciseIndexRaw));
  const currentExercise = ordered[exerciseIndex] ?? ordered[0];
  const setIndex = Math.max(1, session.watchSession?.currentSetIndex ?? 1);
  const totalSets = Math.max(1, currentExercise?.totalSets ?? 3);
  const liveTargets = getSessionLiveTargets(session.notes);
  const liveTarget = liveTargets[currentExercise.programExerciseId ?? `exercise:${currentExercise.exerciseId}`];
  const targetReps = liveTarget?.exerciseId === currentExercise.exerciseId && liveTarget.setIndex === setIndex && liveTarget.targetReps
    ? liveTarget.targetReps
    : (currentExercise?.targetReps ?? (DEFAULT_REPS[Math.min(totalSets - 1, setIndex - 1)] ?? DEFAULT_REPS[0]));

  const latestSetForCurrent = await db.workoutSet.findFirst({
    where: { workoutSessionId: session.id, exerciseId: currentExercise.exerciseId, setIndex },
    orderBy: { createdAt: "desc" },
  });
  const latestCompletedSet = await db.workoutSet.findFirst({
    where: { workoutSessionId: session.id, isCompleted: true, completedAt: { not: null } },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
  });
  const completedAtMs = latestCompletedSet?.completedAt ? latestCompletedSet.completedAt.getTime() : null;
  const nowMs = Date.now();
  const configuredRest = Math.max(0, latestCompletedSet?.restSeconds ?? currentExercise.restSeconds ?? 90);
  const restRemaining = completedAtMs == null
    ? 0
    : Math.max(0, configuredRest - Math.floor((nowMs - completedAtMs) / 1000));

  return {
    sessionId: session.id,
    exerciseName: currentExercise.exerciseName,
    exerciseIndex: exerciseIndex + 1,
    totalExercises,
    setIndex: Math.min(setIndex, totalSets),
    totalSets,
    targetReps,
    weight: latestSetForCurrent?.actualWeightKg ?? (liveTarget?.exerciseId === currentExercise.exerciseId && liveTarget.setIndex === setIndex ? liveTarget.targetWeightKg : null) ?? currentExercise.plannedWeightKg ?? null,
    restRemaining,
    status: session.status === "IN_PROGRESS" && session.watchSession?.status === "PAUSED" ? "READY_TO_COMPLETE" : session.status,
    summary: await getWatchSessionSummary(session, db),
  };
}

export async function validateWatchSet(input: {
  sessionId: string;
  actualReps?: number | null;
  weight?: number | null;
  userProfileId?: string;
}, db: WatchDatabase = prisma) {
  const session = await resolveSession(input.sessionId, input.userProfileId, db);
  if (!session) return null;
  const ordered = await getOrderedExercisesForSession(session, db);
  const exerciseIndex = Math.max(0, Math.min(ordered.length - 1, session.watchSession?.currentExerciseIndex ?? 0));
  const currentExercise = ordered[exerciseIndex];
  if (!currentExercise) return null;
  const setIndex = Math.max(1, session.watchSession?.currentSetIndex ?? 1);
  const totalSetsForExercise = Math.max(1, currentExercise.totalSets ?? 1);
  const liveTarget = getSessionLiveTargets(session.notes)[currentExercise.programExerciseId ?? `exercise:${currentExercise.exerciseId}`];
  const syncedTargetReps = liveTarget?.exerciseId === currentExercise.exerciseId && liveTarget.setIndex === setIndex && liveTarget.targetReps
    ? liveTarget.targetReps
    : currentExercise.targetReps;
  const syncedTargetWeight = liveTarget?.exerciseId === currentExercise.exerciseId && liveTarget.setIndex === setIndex
    ? liveTarget.targetWeightKg
    : null;

  const existing = await db.workoutSet.findFirst({
    where: { workoutSessionId: session.id, exerciseId: currentExercise.exerciseId, setIndex },
    orderBy: { createdAt: "desc" },
  });

  const latestPositiveWeightInSession = await db.workoutSet.findFirst({
    where: {
      workoutSessionId: session.id,
      exerciseId: currentExercise.exerciseId,
      actualWeightKg: { gt: 0 },
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: { actualWeightKg: true },
  });
  const latestPositiveWeightGlobal = await db.workoutSet.findFirst({
    where: {
      exerciseId: currentExercise.exerciseId,
      actualWeightKg: { gt: 0 },
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: { actualWeightKg: true },
  });
  const resolvedWeight = (() => {
    const incoming = input.weight == null ? (syncedTargetWeight == null ? null : Math.max(0, syncedTargetWeight)) : Math.max(0, input.weight);
    if (incoming != null && incoming > 0) return incoming;
    if ((existing?.actualWeightKg ?? 0) > 0) return existing!.actualWeightKg!;
    if ((latestPositiveWeightInSession?.actualWeightKg ?? 0) > 0) return latestPositiveWeightInSession!.actualWeightKg!;
    if ((latestPositiveWeightGlobal?.actualWeightKg ?? 0) > 0) return latestPositiveWeightGlobal!.actualWeightKg!;
    return incoming;
  })();

  const payload = {
    targetRepsMin: syncedTargetReps,
    targetRepsMax: syncedTargetReps,
    actualReps: input.actualReps == null ? Math.max(1, Math.floor(syncedTargetReps)) : Math.max(1, Math.floor(input.actualReps)),
    actualWeightKg: resolvedWeight == null ? null : Math.max(0, resolvedWeight),
    restSeconds: currentExercise.restSeconds,
    isCompleted: true,
    completedAt: new Date(),
  };

  if (existing) {
    await db.workoutSet.update({ where: { id: existing.id }, data: payload });
  } else {
    await db.workoutSet.create({
      data: {
        workoutSessionId: session.id,
        exerciseId: currentExercise.exerciseId,
        setIndex,
        ...payload,
      },
    });
  }

  const isExerciseFinished = setIndex >= totalSetsForExercise;
  const isLastExercise = exerciseIndex >= Math.max(0, ordered.length - 1);

  if (isExerciseFinished && isLastExercise) {
    const endedAt = new Date();
    await db.workoutSession.update({
      where: { id: session.id },
      data: {
        status: "COMPLETED",
        endedAt,
        durationSeconds: session.startedAt ? Math.max(60, Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000)) : null,
      },
    });
    await db.watchSession.upsert({
      where: { workoutSessionId: session.id },
      update: {
        status: "COMPLETED",
        lastSyncAt: new Date(),
      },
      create: {
        workoutSessionId: session.id,
        currentExerciseIndex: exerciseIndex,
        currentSetIndex: totalSetsForExercise,
        status: "COMPLETED",
        lastSyncAt: new Date(),
      },
    });
    const final = await getWatchPayload(session.id, input.userProfileId, db);
    return final ? { ...final, status: "COMPLETED", restRemaining: 0 } : null;
  }

  const nextExerciseIndex = isExerciseFinished && !isLastExercise ? exerciseIndex + 1 : exerciseIndex;
  const nextSetIndex = isExerciseFinished ? 1 : setIndex + 1;

  await db.watchSession.upsert({
    where: { workoutSessionId: session.id },
    update: {
      currentExerciseIndex: nextExerciseIndex,
      currentSetIndex: nextSetIndex,
      status: "ACTIVE",
      lastSyncAt: new Date(),
    },
    create: {
      workoutSessionId: session.id,
      currentExerciseIndex: nextExerciseIndex,
      currentSetIndex: nextSetIndex,
      status: "ACTIVE",
      lastSyncAt: new Date(),
    },
  });

  return getWatchPayload(session.id, input.userProfileId, db);
}

export async function nextWatchExercise(sessionId: string, userProfileId?: string, db: WatchDatabase = prisma) {
  const state = await getWatchPayload(sessionId, userProfileId, db);
  if (!state) return null;
  await db.watchSession.upsert({
    where: { workoutSessionId: state.sessionId },
    update: {
      currentExerciseIndex: state.exerciseIndex,
      currentSetIndex: 1,
      status: "ACTIVE",
      lastSyncAt: new Date(),
    },
    create: {
      workoutSessionId: state.sessionId,
      currentExerciseIndex: state.exerciseIndex,
      currentSetIndex: 1,
      status: "ACTIVE",
      lastSyncAt: new Date(),
    },
  });
  return getWatchPayload(state.sessionId, userProfileId, db);
}

export async function previousWatchExercise(sessionId: string, userProfileId?: string, db: WatchDatabase = prisma) {
  const state = await getWatchPayload(sessionId, userProfileId, db);
  if (!state) return null;
  await db.watchSession.upsert({
    where: { workoutSessionId: state.sessionId },
    update: {
      currentExerciseIndex: Math.max(0, state.exerciseIndex - 2),
      currentSetIndex: 1,
      status: "ACTIVE",
      lastSyncAt: new Date(),
    },
    create: {
      workoutSessionId: state.sessionId,
      currentExerciseIndex: Math.max(0, state.exerciseIndex - 2),
      currentSetIndex: 1,
      status: "ACTIVE",
      lastSyncAt: new Date(),
    },
  });
  return getWatchPayload(state.sessionId, userProfileId, db);
}

export async function skipWatchRest(sessionId: string, userProfileId?: string, db: WatchDatabase = prisma) {
  const state = await getWatchPayload(sessionId, userProfileId, db);
  if (!state) return null;
  const latestCompletedSet = await db.workoutSet.findFirst({
    where: { workoutSessionId: state.sessionId, isCompleted: true, completedAt: { not: null } },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
  });
  if (latestCompletedSet) {
    await db.workoutSet.update({
      where: { id: latestCompletedSet.id },
      data: { restSeconds: 0 },
    });
  }
  return { ...state, restRemaining: 0 };
}

export async function adjustWatchRest(sessionId: string, deltaSeconds: number, userProfileId?: string, db: WatchDatabase = prisma) {
  const state = await getWatchPayload(sessionId, userProfileId, db);
  if (!state) return null;
  const latestCompletedSet = await db.workoutSet.findFirst({
    where: { workoutSessionId: state.sessionId, isCompleted: true, completedAt: { not: null } },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
  });

  if (!latestCompletedSet) return state;

  const currentRest = Math.max(0, latestCompletedSet.restSeconds ?? 0);
  const nextRest = Math.max(0, Math.min(600, currentRest + Math.trunc(deltaSeconds)));
  await db.workoutSet.update({
    where: { id: latestCompletedSet.id },
    data: { restSeconds: nextRest },
  });

  return getWatchPayload(state.sessionId, userProfileId, db);
}

export async function completeWatchSession(sessionId: string, userProfileId?: string, db: WatchDatabase = prisma) {
  const state = await getWatchPayload(sessionId, userProfileId, db);
  if (!state) return null;
  const endedAt = new Date();
  const started = await db.workoutSession.findUnique({ where: { id: state.sessionId }, select: { startedAt: true } });
  await db.workoutSession.update({
    where: { id: state.sessionId },
    data: {
      status: "COMPLETED",
      endedAt,
      durationSeconds: started?.startedAt ? Math.max(60, Math.floor((endedAt.getTime() - started.startedAt.getTime()) / 1000)) : null,
    },
  });
  await db.watchSession.updateMany({
    where: { workoutSessionId: state.sessionId },
    data: { status: "COMPLETED", lastSyncAt: new Date() },
  });
  const final = await getWatchPayload(state.sessionId, userProfileId, db);
  return final ? { ...final, status: "COMPLETED", restRemaining: 0 } : null;
}
