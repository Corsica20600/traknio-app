import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { getExerciseDisplayName } from "@/src/lib/exercise-overrides";
import { getOrCreateDemoProfile } from "@/src/server/fitness-queries";
import { getSessionExerciseReplacements, getSessionLiveTargets, parseSessionNotesMeta, resolveReplacementExercises, serializeSessionNotesMeta } from "@/src/server/session-exercise-replacements";
import { clampRestSeconds, getSharedRestRemaining } from "@/src/server/shared-rest-timer";

const DEFAULT_REPS = [12, 10, 10];

type WatchPayload = {
  sessionId: string;
  workoutTitle: string;
  exerciseName: string;
  exerciseIndex: number;
  totalExercises: number;
  setIndex: number;
  totalSets: number;
  targetReps: number;
  weight: number | null;
  activeWeight: number | null;
  proposedWeight: number | null;
  weightConfirmationRequired: boolean;
  isBodyweight: boolean;
  restRemaining: number;
  restStatus: "IDLE" | "ACTIVE" | "PAUSED";
  restUpdatedAt: string | null;
  revision: string;
  status: string;
  summary?: WatchSessionSummary;
  exercises: WatchExerciseSummary[];
};

type WatchExerciseSummary = {
  index: number;
  name: string;
  totalSets: number;
  completedSets: number;
  activeSetIndex: number;
  targetReps: number;
  weight: number | null;
};

type WatchSessionSummary = {
  durationSeconds: number | null;
  volumeKg: number;
  exercises: number;
  sets: number;
  averageHeartRateBpm: number | null;
  sessionCaloriesKcal: number | null;
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
  equipment: string[];
  equipmentFr: string[];
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

export type CompletedWatchSet = {
  exerciseId: string;
  actualReps: number | null;
  actualWeightKg: number | null;
};

export function calculateCompletedWatchSessionStats(sets: CompletedWatchSet[]) {
  const volumeKg = sets.reduce((total, set) => {
    const reps = Math.max(0, set.actualReps ?? 0);
    const weight = Math.max(0, set.actualWeightKg ?? 0);
    // A bodyweight exercise has no external load, so it must not inflate volume.
    return total + reps * weight;
  }, 0);

  return {
    volumeKg: Math.round(volumeKg),
    exercises: new Set(sets.map((set) => set.exerciseId)).size,
    sets: sets.length,
  };
}

async function getWatchSessionSummary(session: {
  id: string;
  userProfileId: string;
  durationSeconds: number | null;
  averageHeartRateBpm: number | null;
  sessionCaloriesKcal: number | null;
  status: string;
}, db: WatchDatabase): Promise<WatchSessionSummary | undefined> {
  if (session.status !== "COMPLETED") return undefined;

  const [sets, completedSessionsCount] = await Promise.all([
    db.workoutSet.findMany({
      where: { workoutSessionId: session.id, isCompleted: true },
      select: { exerciseId: true, actualReps: true, actualWeightKg: true },
    }),
    db.workoutSession.count({
      where: { userProfileId: session.userProfileId, status: "COMPLETED" },
    }),
  ]);

  const stats = calculateCompletedWatchSessionStats(sets);
  const previousLevel = getLevelFromXp(Math.max(0, completedSessionsCount - 1) * 100);
  const level = getLevelFromXp(completedSessionsCount * 100);

  return {
    durationSeconds: session.durationSeconds,
    volumeKg: stats.volumeKg,
    exercises: stats.exercises,
    sets: stats.sets,
    averageHeartRateBpm: session.averageHeartRateBpm,
    sessionCaloriesKcal: session.sessionCaloriesKcal,
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
          include: { exercise: { select: { id: true, slug: true, name: true, nameFr: true, equipment: true, equipmentFr: true } } },
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
        include: { exercise: { select: { id: true, slug: true, name: true, nameFr: true, equipment: true, equipmentFr: true } } },
        orderBy: [{ createdAt: "asc" }, { setIndex: "asc" }],
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLatestWeightByExercise(
  userProfileId: string,
  exerciseIds: string[],
  db: WatchDatabase = prisma,
) {
  const uniqueExerciseIds = [...new Set(exerciseIds.filter(Boolean))];
  if (uniqueExerciseIds.length === 0) return new Map<string, number>();

  const rows = await db.$queryRaw<Array<{ exerciseId: string; actualWeightKg: number }>>(Prisma.sql`
    SELECT DISTINCT ON (sets."exerciseId")
      sets."exerciseId",
      sets."actualWeightKg"
    FROM "WorkoutSet" AS sets
    INNER JOIN "WorkoutSession" AS sessions ON sessions.id = sets."workoutSessionId"
    WHERE sessions."userProfileId" = ${userProfileId}
      AND sets."exerciseId" IN (${Prisma.join(uniqueExerciseIds)})
      AND sets."actualWeightKg" > 0
    ORDER BY sets."exerciseId", sets."createdAt" DESC
  `);

  return new Map(rows.map((row) => [row.exerciseId, row.actualWeightKg]));
}

async function getOrderedExercisesForSession(session: {
  id: string;
  userProfileId: string;
  programId: string | null;
  programDayId: string | null;
  notes: string | null;
  sets: Array<{ exerciseId: string; exercise: { id: string; slug: string; name: string; nameFr: string | null; equipment: string[]; equipmentFr: string[] } }>;
}, db: WatchDatabase) {
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
                  select: { id: true, slug: true, name: true, nameFr: true, equipment: true, equipmentFr: true },
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
        const exerciseIds = dayForToday.exercises.map((item) => replacements[item.id]?.exerciseId ?? item.exerciseId);
        const latestWeightByExercise = await getLatestWeightByExercise(session.userProfileId, exerciseIds, db);
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
            equipment: effectiveExercise.equipment,
            equipmentFr: effectiveExercise.equipmentFr,
          };
        });
        if (fromProgramDay.length > 0) return fromProgramDay;
      }
    }
  }

  const distinctFromSets = new Map<string, OrderedExercise>();
  const latestWeightByExercise = await getLatestWeightByExercise(
    session.userProfileId,
    session.sets.map((set) => set.exerciseId),
    db,
  );
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
        equipment: set.exercise.equipment,
        equipmentFr: set.exercise.equipmentFr,
      });
    }
  }
  if (distinctFromSets.size > 0) return [...distinctFromSets.values()];

  const fallback = await db.exercise.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true, nameFr: true, equipment: true, equipmentFr: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 6,
  });
  const fallbackWeights = await getLatestWeightByExercise(session.userProfileId, fallback.map((item) => item.id), db);
  return fallback.map((item) => ({
    exerciseId: item.id,
    programExerciseId: null,
    exerciseName: getExerciseDisplayName(item),
    totalSets: 3,
    targetReps: DEFAULT_REPS[0],
    restSeconds: 90,
    plannedWeightKg: fallbackWeights.get(item.id) ?? null,
    equipment: item.equipment,
    equipmentFr: item.equipmentFr,
  }));
}

function isBodyweightExercise(exercise: Pick<OrderedExercise, "equipment" | "equipmentFr">) {
  const equipment = [...exercise.equipment, ...exercise.equipmentFr]
    .map((item) => item.trim().toLocaleLowerCase("fr-FR"))
    .filter(Boolean);
  return equipment.length > 0 && equipment.every((item) => ["poids du corps", "bodyweight", "body only", "aucun", "none"].includes(item));
}

async function buildWatchBootstrapPayload(
  session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>,
  ordered: OrderedExercise[],
  db: WatchDatabase,
): Promise<WatchPayload> {
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
  const currentSetWeight = (latestSetForCurrent?.actualWeightKg ?? 0) > 0 ? latestSetForCurrent!.actualWeightKg! : null;
  const liveTargetWeight = liveTarget?.exerciseId === currentExercise.exerciseId && liveTarget.setIndex === setIndex
    ? liveTarget.targetWeightKg ?? null
    : null;
  const activeWeight = currentSetWeight ?? currentExercise.plannedWeightKg;
  const proposedWeight = liveTargetWeight != null && liveTargetWeight > 0 && currentSetWeight !== liveTargetWeight
    ? liveTargetWeight
    : null;
  const watchRest = session.watchSession
    ? {
        status: session.watchSession.restStatus,
        remainingSeconds: session.watchSession.restRemainingSeconds,
        updatedAt: session.watchSession.restUpdatedAt,
      }
    : { status: "IDLE" as const, remainingSeconds: 0, updatedAt: null };
  const restRemaining = getSharedRestRemaining(watchRest);
  const restStatus = restRemaining > 0 ? watchRest.status : "IDLE";
  const exercises = ordered.map((item, index) => {
    const completedSets = session.sets.filter((set) => set.exerciseId === item.exerciseId && set.isCompleted).length;
    const itemTarget = liveTargets[item.programExerciseId ?? `exercise:${item.exerciseId}`];
    const activeSetIndex = Math.min(item.totalSets, Math.max(1, completedSets + 1));
    return {
      index,
      name: item.exerciseName,
      totalSets: item.totalSets,
      completedSets: Math.min(item.totalSets, completedSets),
      activeSetIndex,
      targetReps: itemTarget?.targetReps ?? item.targetReps,
      weight: itemTarget?.targetWeightKg ?? item.plannedWeightKg,
    };
  });

  return {
    sessionId: session.id,
    workoutTitle: session.title,
    exerciseName: currentExercise.exerciseName,
    exerciseIndex: exerciseIndex + 1,
    totalExercises,
    setIndex: Math.min(setIndex, totalSets),
    totalSets,
    targetReps,
    weight: currentSetWeight ?? liveTargetWeight ?? activeWeight ?? null,
    activeWeight,
    proposedWeight,
    weightConfirmationRequired: proposedWeight != null,
    isBodyweight: isBodyweightExercise(currentExercise),
    restRemaining,
    restStatus,
    restUpdatedAt: watchRest.updatedAt?.toISOString() ?? null,
    revision: session.watchSession?.lastSyncAt?.toISOString() ?? session.updatedAt.toISOString(),
    status: session.status === "IN_PROGRESS" && session.watchSession?.status === "PAUSED" ? "READY_TO_COMPLETE" : session.status,
    summary: await getWatchSessionSummary(session, db),
    exercises,
  };
}

/** Full snapshot for bootstrap and user-initiated actions, never for polling. */
export async function getWatchBootstrapPayload(
  sessionId?: string,
  userProfileId?: string,
  db: WatchDatabase = prisma,
  ordered?: OrderedExercise[],
): Promise<WatchPayload | null> {
  const session = await resolveSession(sessionId, userProfileId, db);
  if (!session) return null;
  return buildWatchBootstrapPayload(session, ordered ?? await getOrderedExercisesForSession(session, db), db);
}

async function getWatchBootstrapContext(sessionId: string, userProfileId: string | undefined, db: WatchDatabase) {
  const session = await resolveSession(sessionId, userProfileId, db);
  if (!session) return null;
  const ordered = await getOrderedExercisesForSession(session, db);
  return { session, ordered, payload: await buildWatchBootstrapPayload(session, ordered, db) };
}

/** Bounded state snapshot for high-frequency fallback polling. */
export async function getWatchPayload(sessionId?: string, userProfileId?: string, db: WatchDatabase = prisma): Promise<WatchPayload | null> {
  const session = sessionId
    ? await db.workoutSession.findUnique({
        where: userProfileId ? { id: sessionId, userProfileId } : { id: sessionId },
        select: { id: true, title: true, status: true, notes: true, programDayId: true, updatedAt: true, watchSession: { select: { currentExerciseIndex: true, currentSetIndex: true, status: true, restStatus: true, restRemainingSeconds: true, restUpdatedAt: true, lastSyncAt: true } } },
      })
    : await db.workoutSession.findFirst({
        where: { userProfileId: userProfileId ?? (await getOrCreateDemoProfile()).id, status: "IN_PROGRESS" },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, status: true, notes: true, programDayId: true, updatedAt: true, watchSession: { select: { currentExerciseIndex: true, currentSetIndex: true, status: true, restStatus: true, restRemainingSeconds: true, restUpdatedAt: true, lastSyncAt: true } } },
      });
  if (!session) return null;

  // A manually started session has no ProgramDay. Keep its fallback equally
  // bounded instead of falling back to the historical bootstrap query.
  if (!session.programDayId) {
    const exercises = await db.exercise.findMany({
      where: { isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }], take: 6,
      select: { id: true, name: true, nameFr: true, equipment: true, equipmentFr: true },
    });
    const exerciseIndex = Math.max(0, Math.min(exercises.length - 1, session.watchSession?.currentExerciseIndex ?? 0));
    const exercise = exercises[exerciseIndex];
    if (!exercise) return null;
    const setIndex = Math.max(1, session.watchSession?.currentSetIndex ?? 1);
    const currentSet = await db.workoutSet.findFirst({
      where: { workoutSessionId: session.id, exerciseId: exercise.id, setIndex }, orderBy: { createdAt: "desc" }, select: { actualWeightKg: true },
    });
    const watchRest = session.watchSession
      ? { status: session.watchSession.restStatus, remainingSeconds: session.watchSession.restRemainingSeconds, updatedAt: session.watchSession.restUpdatedAt }
      : { status: "IDLE" as const, remainingSeconds: 0, updatedAt: null };
    const restRemaining = getSharedRestRemaining(watchRest);
    return {
      sessionId: session.id, workoutTitle: session.title, exerciseName: getExerciseDisplayName(exercise), exerciseIndex: exerciseIndex + 1,
      totalExercises: exercises.length, setIndex, totalSets: 3, targetReps: DEFAULT_REPS[Math.min(DEFAULT_REPS.length - 1, setIndex - 1)] ?? DEFAULT_REPS[0],
      weight: currentSet?.actualWeightKg ?? null, activeWeight: currentSet?.actualWeightKg ?? null, proposedWeight: null, weightConfirmationRequired: false,
      isBodyweight: isBodyweightExercise(exercise), restRemaining, restStatus: restRemaining > 0 ? watchRest.status : "IDLE", restUpdatedAt: watchRest.updatedAt?.toISOString() ?? null,
      revision: session.watchSession?.lastSyncAt?.toISOString() ?? session.updatedAt.toISOString(),
      status: session.status, exercises: [],
    };
  }

  const exerciseIndex = Math.max(0, session.watchSession?.currentExerciseIndex ?? 0);
  const [totalExercises, programExercise] = await Promise.all([
    db.programExercise.count({ where: { programDayId: session.programDayId } }),
    db.programExercise.findFirst({
      where: { programDayId: session.programDayId }, orderBy: { orderIndex: "asc" }, skip: exerciseIndex,
      select: { id: true, exerciseId: true, sets: true, repsMin: true, repsMax: true, repsText: true, exercise: { select: { name: true, nameFr: true, equipment: true, equipmentFr: true } } },
    }),
  ]);
  if (!programExercise) return null;

  const setIndex = Math.max(1, session.watchSession?.currentSetIndex ?? 1);
  const liveTarget = getSessionLiveTargets(session.notes)[programExercise.id];
  const currentSet = await db.workoutSet.findFirst({
    where: { workoutSessionId: session.id, exerciseId: programExercise.exerciseId, setIndex },
    orderBy: { createdAt: "desc" }, select: { actualWeightKg: true },
  });
  const watchRest = session.watchSession
    ? { status: session.watchSession.restStatus, remainingSeconds: session.watchSession.restRemainingSeconds, updatedAt: session.watchSession.restUpdatedAt }
    : { status: "IDLE" as const, remainingSeconds: 0, updatedAt: null };
  const restRemaining = getSharedRestRemaining(watchRest);
  const plannedWeight = parseWeightKgFromText(programExercise.repsText);
  const targetReps = liveTarget?.exerciseId === programExercise.exerciseId && liveTarget.setIndex === setIndex
    ? (liveTarget.targetReps ?? programExercise.repsMin ?? programExercise.repsMax ?? DEFAULT_REPS[0])
    : (programExercise.repsMin ?? programExercise.repsMax ?? DEFAULT_REPS[0]);
  const liveWeight = liveTarget?.exerciseId === programExercise.exerciseId && liveTarget.setIndex === setIndex ? liveTarget.targetWeightKg : null;
  const activeWeight = currentSet?.actualWeightKg ?? plannedWeight ?? null;

  return {
    sessionId: session.id, workoutTitle: session.title, exerciseName: getExerciseDisplayName(programExercise.exercise),
    exerciseIndex: exerciseIndex + 1, totalExercises: Math.max(1, totalExercises), setIndex: Math.min(setIndex, Math.max(1, programExercise.sets)), totalSets: Math.max(1, programExercise.sets), targetReps,
    weight: currentSet?.actualWeightKg ?? liveWeight ?? activeWeight, activeWeight,
    proposedWeight: liveWeight != null && liveWeight > 0 && currentSet?.actualWeightKg !== liveWeight ? liveWeight : null,
    weightConfirmationRequired: liveWeight != null && liveWeight > 0 && currentSet?.actualWeightKg !== liveWeight,
    isBodyweight: isBodyweightExercise(programExercise.exercise), restRemaining, restStatus: restRemaining > 0 ? watchRest.status : "IDLE", restUpdatedAt: watchRest.updatedAt?.toISOString() ?? null,
    revision: session.watchSession?.lastSyncAt?.toISOString() ?? session.updatedAt.toISOString(),
    status: session.status === "IN_PROGRESS" && session.watchSession?.status === "PAUSED" ? "READY_TO_COMPLETE" : session.status,
    exercises: [],
  };
}

export async function selectWatchExercise(sessionId: string, exerciseIndex: number, userProfileId?: string, db: WatchDatabase = prisma) {
  const session = await resolveSession(sessionId, userProfileId, db);
  if (!session) return null;
  const ordered = await getOrderedExercisesForSession(session, db);
  if (!Number.isInteger(exerciseIndex) || exerciseIndex < 0 || exerciseIndex >= ordered.length) return null;
  const index = exerciseIndex;
  if (!ordered[index]) return null;
  const completedSets = session.sets.filter((set) => set.exerciseId === ordered[index].exerciseId && set.isCompleted).length;
  await db.watchSession.upsert({
    where: { workoutSessionId: session.id },
    update: { currentExerciseIndex: index, currentSetIndex: Math.min(ordered[index].totalSets, Math.max(1, completedSets + 1)), status: "ACTIVE", lastSyncAt: new Date() },
    create: { workoutSessionId: session.id, currentExerciseIndex: index, currentSetIndex: Math.min(ordered[index].totalSets, Math.max(1, completedSets + 1)), status: "ACTIVE", lastSyncAt: new Date() },
  });
  return getWatchBootstrapPayload(session.id, userProfileId, db, ordered);
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
        restStatus: "IDLE",
        restRemainingSeconds: 0,
        restUpdatedAt: new Date(),
        lastSyncAt: new Date(),
      },
      create: {
        workoutSessionId: session.id,
        currentExerciseIndex: exerciseIndex,
        currentSetIndex: totalSetsForExercise,
        status: "COMPLETED",
        restStatus: "IDLE",
        restRemainingSeconds: 0,
        restUpdatedAt: new Date(),
        lastSyncAt: new Date(),
      },
    });
    const final = await getWatchBootstrapPayload(session.id, input.userProfileId, db, ordered);
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
      restStatus: "ACTIVE",
      restRemainingSeconds: clampRestSeconds(currentExercise.restSeconds),
      restUpdatedAt: new Date(),
      lastSyncAt: new Date(),
    },
    create: {
      workoutSessionId: session.id,
      currentExerciseIndex: nextExerciseIndex,
      currentSetIndex: nextSetIndex,
      status: "ACTIVE",
      restStatus: "ACTIVE",
      restRemainingSeconds: clampRestSeconds(currentExercise.restSeconds),
      restUpdatedAt: new Date(),
      lastSyncAt: new Date(),
    },
  });

  return getWatchBootstrapPayload(session.id, input.userProfileId, db, ordered);
}

export async function updateWatchLiveTarget(input: {
  sessionId: string;
  targetReps?: number | null;
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
  const key = currentExercise.programExerciseId ?? `exercise:${currentExercise.exerciseId}`;
  const existing = getSessionLiveTargets(session.notes)[key];
  const targetReps = input.targetReps == null
    ? existing?.targetReps ?? currentExercise.targetReps
    : Math.max(1, Math.floor(input.targetReps));
  const targetWeightKg = input.weight == null
    ? existing?.targetWeightKg ?? currentExercise.plannedWeightKg ?? null
    : Math.max(0, input.weight);
  const meta = parseSessionNotesMeta(session.notes);
  await db.workoutSession.update({
    where: { id: session.id },
    data: {
      notes: serializeSessionNotesMeta({
        ...meta,
        liveTargets: {
          ...(meta.liveTargets ?? {}),
          [key]: {
            exerciseId: currentExercise.exerciseId,
            setIndex,
            targetReps,
            targetWeightKg,
            updatedAt: new Date().toISOString(),
          },
        },
      }),
    },
  });
  await db.watchSession.upsert({
    where: { workoutSessionId: session.id },
    update: { currentExerciseIndex: exerciseIndex, currentSetIndex: setIndex, status: "ACTIVE", lastSyncAt: new Date() },
    create: { workoutSessionId: session.id, currentExerciseIndex: exerciseIndex, currentSetIndex: setIndex, status: "ACTIVE", lastSyncAt: new Date() },
  });
  return getWatchBootstrapPayload(session.id, input.userProfileId, db, ordered);
}

export async function nextWatchExercise(sessionId: string, userProfileId?: string, db: WatchDatabase = prisma) {
  const state = await getWatchBootstrapPayload(sessionId, userProfileId, db);
  if (!state) return null;
  await db.watchSession.upsert({
    where: { workoutSessionId: state.sessionId },
    update: {
      currentExerciseIndex: state.exerciseIndex,
      currentSetIndex: 1,
      status: "ACTIVE",
      restStatus: "IDLE",
      restRemainingSeconds: 0,
      restUpdatedAt: new Date(),
      lastSyncAt: new Date(),
    },
    create: {
      workoutSessionId: state.sessionId,
      currentExerciseIndex: state.exerciseIndex,
      currentSetIndex: 1,
      status: "ACTIVE",
      restStatus: "IDLE",
      restRemainingSeconds: 0,
      restUpdatedAt: new Date(),
      lastSyncAt: new Date(),
    },
  });
  return getWatchBootstrapPayload(state.sessionId, userProfileId, db);
}

export async function previousWatchExercise(sessionId: string, userProfileId?: string, db: WatchDatabase = prisma) {
  const state = await getWatchBootstrapPayload(sessionId, userProfileId, db);
  if (!state) return null;
  await db.watchSession.upsert({
    where: { workoutSessionId: state.sessionId },
    update: {
      currentExerciseIndex: Math.max(0, state.exerciseIndex - 2),
      currentSetIndex: 1,
      status: "ACTIVE",
      restStatus: "IDLE",
      restRemainingSeconds: 0,
      restUpdatedAt: new Date(),
      lastSyncAt: new Date(),
    },
    create: {
      workoutSessionId: state.sessionId,
      currentExerciseIndex: Math.max(0, state.exerciseIndex - 2),
      currentSetIndex: 1,
      status: "ACTIVE",
      restStatus: "IDLE",
      restRemainingSeconds: 0,
      restUpdatedAt: new Date(),
      lastSyncAt: new Date(),
    },
  });
  return getWatchBootstrapPayload(state.sessionId, userProfileId, db);
}

export async function skipWatchRest(sessionId: string, userProfileId?: string, db: WatchDatabase = prisma) {
  const context = await getWatchBootstrapContext(sessionId, userProfileId, db);
  if (!context) return null;
  const state = context.payload;
  await db.watchSession.updateMany({
    where: { workoutSessionId: state.sessionId },
    data: { restStatus: "IDLE", restRemainingSeconds: 0, restUpdatedAt: new Date(), lastSyncAt: new Date() },
  });
  return getWatchBootstrapPayload(state.sessionId, userProfileId, db, context.ordered);
}

export async function adjustWatchRest(sessionId: string, deltaSeconds: number, userProfileId?: string, db: WatchDatabase = prisma) {
  const context = await getWatchBootstrapContext(sessionId, userProfileId, db);
  if (!context) return null;
  const state = context.payload;
  const nextRest = clampRestSeconds(state.restRemaining + Math.trunc(deltaSeconds));
  const nextStatus = nextRest <= 0 ? "IDLE" : state.restStatus === "PAUSED" ? "PAUSED" : "ACTIVE";
  await db.watchSession.updateMany({
    where: { workoutSessionId: state.sessionId },
    data: { restStatus: nextStatus, restRemainingSeconds: nextRest, restUpdatedAt: new Date(), lastSyncAt: new Date() },
  });

  return getWatchBootstrapPayload(state.sessionId, userProfileId, db, context.ordered);
}

export async function pauseWatchRest(sessionId: string, userProfileId?: string, db: WatchDatabase = prisma) {
  const state = await getWatchBootstrapPayload(sessionId, userProfileId, db);
  if (!state) return null;
  const remaining = clampRestSeconds(state.restRemaining);
  await db.watchSession.updateMany({
    where: { workoutSessionId: state.sessionId },
    data: {
      restStatus: remaining > 0 ? "PAUSED" : "IDLE",
      restRemainingSeconds: remaining,
      restUpdatedAt: new Date(),
      lastSyncAt: new Date(),
    },
  });
  return getWatchBootstrapPayload(state.sessionId, userProfileId, db);
}

export async function resumeWatchRest(sessionId: string, userProfileId?: string, db: WatchDatabase = prisma) {
  const state = await getWatchBootstrapPayload(sessionId, userProfileId, db);
  if (!state) return null;
  const remaining = clampRestSeconds(state.restRemaining);
  await db.watchSession.updateMany({
    where: { workoutSessionId: state.sessionId },
    data: {
      restStatus: remaining > 0 ? "ACTIVE" : "IDLE",
      restRemainingSeconds: remaining,
      restUpdatedAt: new Date(),
      lastSyncAt: new Date(),
    },
  });
  return getWatchBootstrapPayload(state.sessionId, userProfileId, db);
}

export async function completeWatchSession(sessionId: string, userProfileId?: string, db: WatchDatabase = prisma) {
  const state = await getWatchBootstrapPayload(sessionId, userProfileId, db);
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
    data: {
      status: "COMPLETED",
      restStatus: "IDLE",
      restRemainingSeconds: 0,
      restUpdatedAt: new Date(),
      lastSyncAt: new Date(),
    },
  });
  const final = await getWatchBootstrapPayload(state.sessionId, userProfileId, db);
  return final ? { ...final, status: "COMPLETED", restRemaining: 0 } : null;
}

export async function submitWatchSessionMetrics(input: {
  sessionId: string;
  averageHeartRateBpm?: number | null;
  sessionCaloriesKcal?: number | null;
  userProfileId?: string;
}, db: WatchDatabase = prisma) {
  const session = await resolveSession(input.sessionId, input.userProfileId, db);
  if (!session) return null;

  const averageHeartRateBpm = input.averageHeartRateBpm != null && Number.isFinite(input.averageHeartRateBpm)
    ? Math.max(1, Math.round(input.averageHeartRateBpm))
    : null;
  const sessionCaloriesKcal = input.sessionCaloriesKcal != null && Number.isFinite(input.sessionCaloriesKcal)
    ? Math.max(0, input.sessionCaloriesKcal)
    : null;

  // A replay never erases a previously accepted measurement with an absent metric.
  await db.workoutSession.update({
    where: { id: session.id },
    data: {
      ...(averageHeartRateBpm != null ? { averageHeartRateBpm } : {}),
      ...(sessionCaloriesKcal != null ? { sessionCaloriesKcal } : {}),
    },
  });
  return getWatchBootstrapPayload(session.id, input.userProfileId, db);
}
