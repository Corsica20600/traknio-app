import type {
  CoachExerciseProgress,
  CoachWeeklyMetrics,
  CoachWeeklyMetricsInput,
  CoachWorkoutSet,
} from "./coach-types";

type ExerciseExposure = {
  date: Date;
  lastSetWeightKg: number | null;
  totalReps: number;
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function isCompletedSet(set: CoachWorkoutSet) {
  return set.isCompleted || set.actualReps !== null || set.actualWeightKg !== null;
}

function setVolume(set: CoachWorkoutSet) {
  return Math.max(set.actualReps ?? 0, 0) * Math.max(set.actualWeightKg ?? 0, 0);
}

function latestNonNull(values: Array<number | null>) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== null) return values[index];
  }
  return null;
}

function firstNonNull(values: Array<number | null>) {
  return values.find((value): value is number => value !== null) ?? null;
}

function getExerciseTrend(exposures: ExerciseExposure[]): CoachExerciseProgress {
  const first = exposures[0];
  const latest = exposures.at(-1)!;
  const baselineWeightKg = firstNonNull(exposures.map((exposure) => exposure.lastSetWeightKg));
  const latestWeightKg = latestNonNull(exposures.map((exposure) => exposure.lastSetWeightKg));
  const baselineReps = first.totalReps || null;
  const latestReps = latest.totalReps || null;
  const loadDeltaKg = baselineWeightKg !== null && latestWeightKg !== null
    ? round(latestWeightKg - baselineWeightKg)
    : null;
  const repsDelta = baselineReps !== null && latestReps !== null ? latestReps - baselineReps : null;

  let trend: CoachExerciseProgress["trend"] = "INSUFFICIENT_DATA";
  if (exposures.length >= 3) {
    if ((loadDeltaKg ?? 0) > 0 || (loadDeltaKg === 0 && (repsDelta ?? 0) > 0)) {
      trend = "PROGRESSING";
    } else if ((loadDeltaKg ?? 0) < 0 || (loadDeltaKg === 0 && (repsDelta ?? 0) < 0)) {
      trend = "DECLINING";
    } else {
      trend = "STAGNANT";
    }
  }

  return {
    exerciseId: "",
    exerciseName: "",
    exposures: exposures.length,
    baselineWeightKg,
    latestWeightKg,
    baselineReps,
    latestReps,
    loadDeltaKg,
    repsDelta,
    trend,
  };
}

export function calculateCoachWeeklyMetrics(input: CoachWeeklyMetricsInput): CoachWeeklyMetrics {
  const sessions = input.sessions.filter(
    (session) => session.occurredAt >= input.period.start && session.occurredAt < input.period.end,
  );
  const completedSessions = sessions.filter((session) => session.status === "COMPLETED");
  const skippedSessions = sessions.filter((session) => session.status === "SKIPPED");
  const volumeByMuscle = new Map<string, { volumeKg: number; completedSets: number }>();
  const exposuresByExercise = new Map<string, { name: string; exposures: ExerciseExposure[] }>();

  let volumeKg = 0;
  let repetitions = 0;
  let completedSets = 0;
  let durationSeconds = 0;

  for (const session of completedSessions) {
    durationSeconds += Math.max(session.durationSeconds ?? 0, 0);
    const sessionSetsByExercise = new Map<string, CoachWorkoutSet[]>();

    for (const set of session.sets.filter(isCompletedSet)) {
      const volume = setVolume(set);
      const reps = Math.max(set.actualReps ?? 0, 0);
      const muscleGroup = set.muscleGroup?.trim() || "Autres";
      volumeKg += volume;
      repetitions += reps;
      completedSets += 1;

      const currentMuscle = volumeByMuscle.get(muscleGroup) ?? { volumeKg: 0, completedSets: 0 };
      currentMuscle.volumeKg += volume;
      currentMuscle.completedSets += 1;
      volumeByMuscle.set(muscleGroup, currentMuscle);

      const exerciseSets = sessionSetsByExercise.get(set.exerciseId) ?? [];
      exerciseSets.push(set);
      sessionSetsByExercise.set(set.exerciseId, exerciseSets);
    }

    for (const [exerciseId, exerciseSets] of sessionSetsByExercise) {
      const record = exposuresByExercise.get(exerciseId) ?? {
        name: exerciseSets[0].exerciseName,
        exposures: [],
      };
      record.exposures.push({
        date: session.occurredAt,
        lastSetWeightKg: latestNonNull(exerciseSets.map((set) => set.actualWeightKg)),
        totalReps: exerciseSets.reduce((total, set) => total + Math.max(set.actualReps ?? 0, 0), 0),
      });
      exposuresByExercise.set(exerciseId, record);
    }
  }

  const exerciseProgress = [...exposuresByExercise.entries()]
    .map(([exerciseId, record]) => {
      const progress = getExerciseTrend(record.exposures.sort((left, right) => left.date.getTime() - right.date.getTime()));
      return { ...progress, exerciseId, exerciseName: record.name };
    })
    .sort((left, right) => left.exerciseName.localeCompare(right.exerciseName, "fr"));

  return {
    period: {
      key: input.period.key,
      start: input.period.start.toISOString(),
      end: input.period.end.toISOString(),
    },
    sessions: {
      planned: input.plannedSessions,
      completed: completedSessions.length,
      skipped: skippedSessions.length,
      missed: input.plannedSessions === null ? null : Math.max(input.plannedSessions - completedSessions.length, 0),
    },
    totals: {
      volumeKg: round(volumeKg),
      repetitions,
      completedSets,
      durationSeconds,
    },
    volumeByMuscleGroup: [...volumeByMuscle.entries()]
      .map(([muscleGroup, value]) => ({
        muscleGroup,
        volumeKg: round(value.volumeKg),
        completedSets: value.completedSets,
      }))
      .sort((left, right) => right.volumeKg - left.volumeKg || left.muscleGroup.localeCompare(right.muscleGroup, "fr")),
    exerciseProgress,
    progressingExerciseIds: exerciseProgress.filter((exercise) => exercise.trend === "PROGRESSING").map((exercise) => exercise.exerciseId),
    stagnantExerciseIds: exerciseProgress.filter((exercise) => exercise.trend === "STAGNANT").map((exercise) => exercise.exerciseId),
    performanceDrops: exerciseProgress
      .filter((exercise) => exercise.trend === "DECLINING")
      .map(({ exerciseId, exerciseName, loadDeltaKg, repsDelta }) => ({ exerciseId, exerciseName, loadDeltaKg, repsDelta })),
    recovery: input.recovery ?? null,
    limitations: (input.limitations ?? []).map((limitation) => ({
      label: limitation.label,
      declaredAt: limitation.declaredAt.toISOString(),
    })),
  };
}
