export type CoachAnalysisPeriod = {
  key: string;
  start: Date;
  end: Date;
  nextAvailableAt: Date;
};

export type CoachSessionStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";

export type CoachWorkoutSet = {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string | null;
  actualReps: number | null;
  actualWeightKg: number | null;
  isCompleted: boolean;
};

export type CoachWorkoutSession = {
  id: string;
  status: CoachSessionStatus;
  occurredAt: Date;
  durationSeconds: number | null;
  sets: CoachWorkoutSet[];
};

export type CoachRecoverySnapshot = {
  sleepMinutes?: number;
  restingHeartRate?: number;
  calories?: number;
};

export type CoachLimitation = {
  label: string;
  declaredAt: Date;
};

export type CoachExerciseTrend = "PROGRESSING" | "STAGNANT" | "DECLINING" | "INSUFFICIENT_DATA";

export type CoachExerciseProgress = {
  exerciseId: string;
  exerciseName: string;
  exposures: number;
  baselineWeightKg: number | null;
  latestWeightKg: number | null;
  baselineReps: number | null;
  latestReps: number | null;
  loadDeltaKg: number | null;
  repsDelta: number | null;
  trend: CoachExerciseTrend;
};

export type CoachWeeklyMetrics = {
  period: {
    key: string;
    start: string;
    end: string;
  };
  sessions: {
    planned: number | null;
    completed: number;
    skipped: number;
    missed: number | null;
  };
  totals: {
    volumeKg: number;
    repetitions: number;
    completedSets: number;
    durationSeconds: number;
  };
  volumeByMuscleGroup: Array<{
    muscleGroup: string;
    volumeKg: number;
    completedSets: number;
  }>;
  exerciseProgress: CoachExerciseProgress[];
  progressingExerciseIds: string[];
  stagnantExerciseIds: string[];
  performanceDrops: Array<{
    exerciseId: string;
    exerciseName: string;
    loadDeltaKg: number | null;
    repsDelta: number | null;
  }>;
  recovery: CoachRecoverySnapshot | null;
  limitations: Array<{
    label: string;
    declaredAt: string;
  }>;
};

export type CoachWeeklyMetricsInput = {
  period: CoachAnalysisPeriod;
  plannedSessions: number | null;
  sessions: CoachWorkoutSession[];
  recovery?: CoachRecoverySnapshot | null;
  limitations?: CoachLimitation[];
};

export type CoachRecommendation = {
  title: string;
  rationale: string;
  dataUsed: string[];
};

export type CoachStructuredResponse = {
  summary: string;
  positives: string[];
  watchouts: string[];
  recommendations: CoachRecommendation[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
};
