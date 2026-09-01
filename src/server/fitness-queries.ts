import { auth, LEGACY_DEMO_EMAIL, PRIMARY_USER_EMAIL } from "@/auth";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getExerciseDisplayName } from "@/src/lib/exercise-overrides";
import { hasPremiumAccess } from "@/src/lib/premium-access-rules";
import { getSessionExerciseReplacements, resolveReplacementExercises } from "@/src/server/session-exercise-replacements";

function normalizeEmail(email?: string | null) {
  const normalized = email?.trim().toLowerCase();
  return normalized && normalized.includes("@") ? normalized : null;
}

type ExerciseWithFrCompat = {
  id: string;
  slug: string;
  name: string;
  nameFr: string | null;
  category: string;
  movementType: string;
  primaryMuscles: string[];
  primaryMusclesFr: string[];
  secondaryMuscles: string[];
  equipment: string[];
  equipmentFr: string[];
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  objectives: string[];
  shortTechnicalCues: string[];
  detailedInstructions: string;
  instructionsFr: string | null;
  commonMistakes: string[];
  commonMistakesFr: string[];
  variants: string[];
  alternatives: string[];
  tags: string[];
  contraindications: string[];
  primaryAnimationPath: string | null;
  fallbackImagePath: string;
  fallbackThumbnailPath: string;
  fallbackAnimationPath: string;
  isCompound: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  media: Array<{
    id: string;
    type: "IMAGE" | "THUMBNAIL" | "ANIMATION";
    format: string;
    publicUrl: string;
    url: string | null;
    storagePath: string;
    mimeType: string | null;
    width: number | null;
    height: number | null;
    durationSeconds: number | null;
    isLoop: boolean;
    sourceName: string | null;
    sourceUrl: string | null;
    license: string | null;
    isPrimary: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
    exerciseId: string;
  }>;
};

export type SessionWorkoutExercise = ExerciseWithFrCompat & {
  plan?: {
    sets: number | null;
    repsMin: number | null;
    repsMax: number | null;
    plannedWeightKg: number | null;
    restSeconds: number | null;
    orderDayIndex: number | null;
    orderExerciseIndex: number | null;
    programExerciseId: string | null;
  };
};

function parseWeightKgFromText(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

async function getLatestWeightByExerciseForWorkout(
  userProfileId: string,
  exerciseIds: string[],
) {
  const uniqueExerciseIds = [...new Set(exerciseIds.filter(Boolean))];
  if (uniqueExerciseIds.length === 0) return new Map<string, number>();

  const rows = await prisma.$queryRaw<Array<{ exerciseId: string; actualWeightKg: number }>>(Prisma.sql`
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

function isMissingColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("does not exist in the current database") ||
    message.includes("does not exist") ||
    message.includes("Unknown field") ||
    message.includes("Unknown argument") ||
    message.includes("P2022")
  );
}

function toFrCompat<T extends {
  slug?: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  name: string;
  detailedInstructions: string;
  commonMistakes: string[];
}>(exercise: T): T & {
  nameFr: string | null;
  primaryMusclesFr: string[];
  equipmentFr: string[];
  instructionsFr: string | null;
  commonMistakesFr: string[];
} {
  return {
    ...exercise,
    nameFr: getExerciseDisplayName(exercise),
    primaryMusclesFr: [],
    equipmentFr: [],
    instructionsFr: null,
    commonMistakesFr: [],
  };
}

function getParisWeekStart(input = new Date()) {
  const date = new Date(input);
  const day = date.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diffToMonday);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getParisDayStart(input = new Date()) {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getPreviousWeekStart(input = new Date()) {
  const date = getParisWeekStart(input);
  date.setDate(date.getDate() - 7);
  return date;
}

function formatUserFirstName(displayName: string) {
  const firstName = displayName.trim().split(/\s+/)[0]?.trim();
  if (firstName && ["athlete", "demo"].includes(firstName.toLowerCase())) return null;
  return firstName || null;
}

function getSessionVolume(sets: Array<{ actualReps: number | null; actualWeightKg: number | null }>) {
  return sets.reduce((acc, set) => acc + (set.actualReps ?? 0) * (set.actualWeightKg ?? 0), 0);
}

function estimateProgramDayMinutes(day: {
  exercises: Array<{ sets: number; restSeconds: number | null }>;
}) {
  if (day.exercises.length === 0) return null;
  return Math.max(
    8,
    Math.round(
      day.exercises.reduce((acc, item) => acc + item.sets * ((item.restSeconds ?? 60) + 45), 0) / 60,
    ),
  );
}

function getProgramDayMuscles(day: {
  exercises: Array<{
    exercise: {
      primaryMuscles: string[];
      primaryMusclesFr: string[];
    };
  }>;
}) {
  return [
    ...new Set(
      day.exercises
        .flatMap((item) => item.exercise.primaryMusclesFr.length ? item.exercise.primaryMusclesFr : item.exercise.primaryMuscles)
        .filter(Boolean),
    ),
  ].slice(0, 3);
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

  const xpInLevel = totalXp - xpSpent;
  const progressPercent = Math.round((xpInLevel / nextRequirement) * 100);
  const sessionsToNextLevel = Math.max(1, Math.ceil((nextRequirement - xpInLevel) / 100));

  return {
    level,
    totalXp,
    xpInLevel,
    xpForNextLevel: nextRequirement,
    progressPercent,
    sessionsToNextLevel,
  };
}

function getCompletedWeeksStreak(sessions: Array<{ startedAt: Date | null; createdAt: Date }>, now = new Date()) {
  const weekStarts = new Set(
    sessions.map((session) => getParisWeekStart(session.startedAt ?? session.createdAt).getTime()),
  );
  let cursor = getParisWeekStart(now);
  let streak = 0;

  while (weekStarts.has(cursor.getTime())) {
    streak += 1;
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() - 7);
  }

  return streak;
}

function getCoachInsight(input: {
  weeklySessions: number;
  weeklyGoal: number | null;
  weeklyVolume: number;
  previousWeeklyVolume: number;
  streakWeeks: number;
  lastSessionAt: Date | null;
  mostFrequentExerciseName: string | null;
}) {
  const daysSinceLastSession = input.lastSessionAt
    ? Math.floor((Date.now() - input.lastSessionAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const weeklyGoal = input.weeklyGoal ?? 3;
  const volumeDelta =
    input.previousWeeklyVolume > 0
      ? ((input.weeklyVolume - input.previousWeeklyVolume) / input.previousWeeklyVolume) * 100
      : null;

  if (!input.lastSessionAt || (daysSinceLastSession != null && daysSinceLastSession >= 7)) {
    return {
      title: "Reprise intelligente",
      message: "Aucune séance récente détectée. Lance une séance légère pour relancer la machine sans te cramer.",
      tone: "warning" as const,
    };
  }

  if (volumeDelta != null && volumeDelta >= 45) {
    return {
      title: "Volume en forte hausse",
      message: "Ta semaine monte vite en volume. Garde une exécution propre et surveille la récupération.",
      tone: "orange" as const,
    };
  }

  if (input.weeklySessions >= weeklyGoal) {
    return {
      title: "Objectif semaine atteint",
      message: `Tu as déjà validé ${input.weeklySessions} séances cette semaine. Maintiens le cap avec une séance technique ou mobilité.`,
      tone: "success" as const,
    };
  }

  if (input.streakWeeks >= 2) {
    return {
      title: "Régularité solide",
      message: `Tu tiens une série de ${input.streakWeeks} semaines. Une séance bien placée peut prolonger cette dynamique.`,
      tone: "accent" as const,
    };
  }

  if (input.mostFrequentExerciseName && input.weeklySessions >= 2) {
    return {
      title: "Variation utile",
      message: `${input.mostFrequentExerciseName} revient souvent. Pense à varier l'angle ou le tempo si la séance le permet.`,
      tone: "violet" as const,
    };
  }

  return {
    title: "Objectif accessible",
    message: `Tu as ${input.weeklySessions} séance${input.weeklySessions > 1 ? "s" : ""} cette semaine. Une prochaine séance propre te rapproche de ton rythme cible.`,
    tone: "accent" as const,
  };
}

async function getOrCreateProfileForEmail(activeEmail: string, displayName: string) {
  const existing = await prisma.userProfile.findUnique({
    where: { email: activeEmail },
  });

  if (existing) return existing;

  const legacyProfile = activeEmail === PRIMARY_USER_EMAIL
    ? await prisma.userProfile.findUnique({
        where: { email: LEGACY_DEMO_EMAIL },
      })
    : null;

  if (legacyProfile) {
    return prisma.userProfile.update({
      where: { id: legacyProfile.id },
      data: {
        displayName: "Erwan",
        email: activeEmail,
      },
    });
  }

  return prisma.userProfile.create({
    data: {
      displayName,
      email: activeEmail,
      // Existing profiles receive the schema default (v1) during the additive
      // migration. New accounts deliberately start at v0 so the brief welcome
      // walkthrough can run exactly once.
      onboardingVersion: 0,
      trainingLevel: "INTERMEDIATE",
      primaryGoal: "HYPERTROPHY",
      sessionsPerWeek: 4,
      age: 30,
      heightCm: 178,
      weightKg: 78,
    },
  });
}

function parseProgressMetricName(notes: string | null) {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as { metric?: string };
    return typeof parsed.metric === "string" ? parsed.metric : null;
  } catch {
    return null;
  }
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreSleep(minutes: number | null) {
  if (minutes == null) return null;
  if (minutes >= 420 && minutes <= 540) return 40;
  if (minutes >= 390 && minutes < 420) return 34;
  if (minutes > 540 && minutes <= 600) return 34;
  if (minutes >= 330 && minutes < 390) return 25;
  if (minutes > 600) return 24;
  return 14;
}

function scoreRestingHeartRate(bpm: number | null) {
  if (bpm == null) return null;
  if (bpm <= 60) return 30;
  if (bpm <= 68) return 24;
  if (bpm <= 76) return 17;
  return 9;
}

function scoreActivity(calories: number | null) {
  if (calories == null) return null;
  return clampPercent(Math.min(20, (calories / 600) * 20));
}

function scoreLastSession(latestCompletedAt: Date | null) {
  if (!latestCompletedAt) return 6;
  const hoursSince = (Date.now() - latestCompletedAt.getTime()) / 36e5;
  if (hoursSince >= 36 && hoursSince <= 96) return 10;
  if (hoursSince >= 18) return 7;
  if (hoursSince > 96) return 8;
  return 4;
}

function getRecoveryTone(score: number): "success" | "accent" | "orange" | "danger" {
  if (score >= 80) return "success";
  if (score >= 60) return "accent";
  if (score >= 40) return "orange";
  return "danger";
}

function getRecoveryRecommendation(score: number, targetMuscles: string[]) {
  const preferred = targetMuscles.slice(0, 2).join(" ou ");
  if (score >= 80) return preferred ? `Tu es en forme. Une séance ${preferred.toLowerCase()} est idéale aujourd'hui.` : "Tu es en forme pour une séance intensive.";
  if (score >= 60) return "Séance correcte aujourd'hui : garde une marge propre et surveille les temps de repos.";
  if (score >= 40) return "Récupération moyenne : privilégie une séance technique, plus courte ou moins chargée.";
  return "Repos conseillé aujourd'hui : mobilité, marche légère ou récupération active.";
}

function formatSleep(minutes: number | null) {
  if (minutes == null) return null;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours} h ${String(mins).padStart(2, "0")}`;
}

function getProfileDisplayName(name: string | null | undefined, email: string) {
  const sessionName = name?.trim();
  if (sessionName) return sessionName;

  const emailName = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  return emailName || "Utilisateur Traknio";
}

export async function getOrCreateDemoProfile() {
  const session = await auth().catch(() => null);
  const activeEmail = normalizeEmail(session?.user?.email) ?? PRIMARY_USER_EMAIL;
  const displayName = session?.user?.email
    ? getProfileDisplayName(session.user.name, activeEmail)
    : "Erwan";

  const profile = await getOrCreateProfileForEmail(activeEmail, displayName);
  if (!hasPremiumAccess(profile)) {
    redirect("/settings?access=premium");
  }

  return profile;
}

export async function getCurrentUserProfile() {
  return getOrCreateDemoProfile();
}

export async function getAuthenticatedUserProfile() {
  const session = await auth().catch(() => null);
  const activeEmail = normalizeEmail(session?.user?.email);

  if (!activeEmail) {
    throw new Error("AUTH_REQUIRED");
  }

  return getOrCreateProfileForEmail(activeEmail, getProfileDisplayName(session?.user?.name, activeEmail));
}

export async function getAccountSettingsData() {
  const profile = await getAuthenticatedUserProfile();

  const [workoutSessions, completedSessions, programs, progressMetrics, latestSession, watchDevices, integrations] = await Promise.all([
    prisma.workoutSession.count({ where: { userProfileId: profile.id } }),
    prisma.workoutSession.count({ where: { userProfileId: profile.id, status: "COMPLETED" } }),
    prisma.program.count({ where: { userProfileId: profile.id } }),
    prisma.progressMetric.count({ where: { userProfileId: profile.id } }),
    prisma.workoutSession.findFirst({
      where: { userProfileId: profile.id },
      orderBy: [{ endedAt: "desc" }, { startedAt: "desc" }, { createdAt: "desc" }],
      select: {
        title: true,
        status: true,
        startedAt: true,
        endedAt: true,
        createdAt: true,
      },
    }),
    prisma.watchDevice.findMany({
      where: { userProfileId: profile.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        label: true,
        lastSeenAt: true,
        createdAt: true,
      },
    }),
    prisma.integrationConnection.findMany({
      where: { userProfileId: profile.id },
      select: {
        provider: true,
        status: true,
        displayName: true,
        scopes: true,
        lastSyncAt: true,
        connectedAt: true,
        disconnectedAt: true,
        tokenExpiresAt: true,
        metadata: true,
      },
    }),
  ]);

  return {
    profile,
    stats: {
      workoutSessions,
      completedSessions,
      programs,
      progressMetrics,
    },
    latestSession,
    watchDevices,
    integrations,
  };
}

export async function getAccountExportData() {
  const profile = await getAuthenticatedUserProfile();

  const [programs, workoutSessions, progressMetrics, watchDevices, integrations] = await Promise.all([
    prisma.program.findMany({
      where: { userProfileId: profile.id },
      orderBy: { createdAt: "desc" },
      include: {
        days: {
          orderBy: { dayIndex: "asc" },
          include: {
            exercises: {
              orderBy: { orderIndex: "asc" },
              include: {
                exercise: {
                  select: {
                    id: true,
                    slug: true,
                    name: true,
                    nameFr: true,
                    category: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.workoutSession.findMany({
      where: { userProfileId: profile.id },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
      include: {
        sets: {
          orderBy: [{ completedAt: "asc" }, { createdAt: "asc" }],
          include: {
            exercise: {
              select: {
                id: true,
                slug: true,
                name: true,
                nameFr: true,
                category: true,
              },
            },
          },
        },
      },
    }),
    prisma.progressMetric.findMany({
      where: { userProfileId: profile.id },
      orderBy: { measuredAt: "desc" },
    }),
    prisma.watchDevice.findMany({
      where: { userProfileId: profile.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        label: true,
        lastSeenAt: true,
        revokedAt: true,
        createdAt: true,
      },
    }),
    prisma.integrationConnection.findMany({
      where: { userProfileId: profile.id },
      orderBy: { createdAt: "desc" },
      select: {
        provider: true,
        status: true,
        displayName: true,
        scopes: true,
        lastSyncAt: true,
        connectedAt: true,
        disconnectedAt: true,
        tokenExpiresAt: true,
        metadata: true,
      },
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      id: profile.id,
      displayName: profile.displayName,
      email: profile.email,
      age: profile.age,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      trainingLevel: profile.trainingLevel,
      primaryGoal: profile.primaryGoal,
      sessionsPerWeek: profile.sessionsPerWeek,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    },
    programs,
    workoutSessions,
    progressMetrics,
    watchDevices,
    integrations,
  };
}

export async function getExercisesCatalog() {
  return prisma.exercise.findMany({
    where: { isActive: true },
    include: { media: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }] } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export async function getActiveExercisesCount() {
  return prisma.exercise.count({ where: { isActive: true } });
}

export async function getExerciseFilterOptions() {
  let rows: Array<{
    primaryMuscles: string[];
    primaryMusclesFr: string[];
    equipment: string[];
    equipmentFr: string[];
    difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  }>;

  try {
    rows = await prisma.exercise.findMany({
      where: { isActive: true },
      select: { primaryMuscles: true, primaryMusclesFr: true, equipment: true, equipmentFr: true, difficulty: true },
    });
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    const fallbackRows = await prisma.exercise.findMany({
      where: { isActive: true },
      select: { primaryMuscles: true, equipment: true, difficulty: true },
    });
    rows = fallbackRows.map((item) => ({
      ...item,
      primaryMusclesFr: [],
      equipmentFr: [],
    }));
  }

  const muscleSet = new Set<string>();
  const equipmentSet = new Set<string>();
  const difficultySet = new Set<"BEGINNER" | "INTERMEDIATE" | "ADVANCED">();

  for (const row of rows) {
    for (const muscle of (row.primaryMusclesFr.length ? row.primaryMusclesFr : row.primaryMuscles)) muscleSet.add(muscle);
    for (const item of (row.equipmentFr.length ? row.equipmentFr : row.equipment)) equipmentSet.add(item);
    difficultySet.add(row.difficulty);
  }

  return {
    muscles: [...muscleSet].sort((a, b) => a.localeCompare(b, "fr")),
    equipment: [...equipmentSet].sort((a, b) => a.localeCompare(b, "fr")),
    difficulties: (["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const).filter((item) => difficultySet.has(item)),
  };
}

export async function getExercisesCatalogPage(input: {
  search?: string;
  muscle?: string;
  equipment?: string;
  difficulty?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.max(12, Math.min(60, input.pageSize ?? 24));

  const andClauses: Array<Record<string, unknown>> = [];
  if (input.search) {
    andClauses.push({
      OR: [
        { name: { contains: input.search, mode: "insensitive" as const } },
        { nameFr: { contains: input.search, mode: "insensitive" as const } },
      ],
    });
  }
  if (input.muscle) {
    andClauses.push({
      OR: [
        { primaryMuscles: { has: input.muscle } },
        { primaryMusclesFr: { has: input.muscle } },
      ],
    });
  }
  if (input.equipment) {
    andClauses.push({
      OR: [
        { equipment: { has: input.equipment } },
        { equipmentFr: { has: input.equipment } },
      ],
    });
  }
  if (input.difficulty && ["BEGINNER", "INTERMEDIATE", "ADVANCED"].includes(input.difficulty)) {
    andClauses.push({ difficulty: input.difficulty });
  }

  const where = andClauses.length
    ? { isActive: true, AND: andClauses }
    : { isActive: true };

  let total = 0;
  let exercises: ExerciseWithFrCompat[] = [];

  try {
    const response = await Promise.all([
      prisma.exercise.count({ where }),
      prisma.exercise.findMany({
        where,
        include: { media: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }] } },
        orderBy: [{ name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    total = response[0];
    exercises = response[1] as ExerciseWithFrCompat[];
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;

    const fallbackClauses: Array<Record<string, unknown>> = [];
    if (input.search) {
      fallbackClauses.push({
        name: { contains: input.search, mode: "insensitive" as const },
      });
    }
    if (input.muscle) {
      fallbackClauses.push({ primaryMuscles: { has: input.muscle } });
    }
    if (input.equipment) {
      fallbackClauses.push({ equipment: { has: input.equipment } });
    }
    if (input.difficulty && ["BEGINNER", "INTERMEDIATE", "ADVANCED"].includes(input.difficulty)) {
      fallbackClauses.push({ difficulty: input.difficulty });
    }

    const fallbackWhere = fallbackClauses.length
      ? { isActive: true, AND: fallbackClauses }
      : { isActive: true };

    const response = await Promise.all([
      prisma.exercise.count({ where: fallbackWhere }),
      prisma.exercise.findMany({
        where: fallbackWhere,
        include: { media: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }] } },
        orderBy: [{ name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    total = response[0];
    exercises = response[1].map((item) => toFrCompat(item)) as ExerciseWithFrCompat[];
  }

  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    exercises,
  };
}

export async function getExerciseBySlug(slug: string) {
  try {
    return await prisma.exercise.findUnique({
      where: { slug },
      include: { media: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }] } },
    });
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    const fallback = await prisma.exercise.findUnique({
      where: { slug },
      include: { media: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }] } },
    });
    return fallback ? toFrCompat(fallback) : null;
  }
}

export async function getProgramsForDemoUser() {
  const profile = await getOrCreateDemoProfile();

  return prisma.program.findMany({
    where: { userProfileId: profile.id },
    include: {
      days: {
        include: {
          exercises: {
            include: { exercise: { include: { media: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }] } } } },
            orderBy: { orderIndex: "asc" },
          },
        },
        orderBy: { dayIndex: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getExerciseOptionsForPrograms(limit = 300) {
  return prisma.exercise.findMany({
    where: { isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      nameFr: true,
      primaryAnimationPath: true,
      primaryMuscles: true,
      primaryMusclesFr: true,
      fallbackThumbnailPath: true,
      fallbackImagePath: true,
    },
    orderBy: [{ name: "asc" }],
    take: Math.max(60, Math.min(800, limit)),
  });
}

export async function getWorkoutHistoryForDemoUser() {
  const profile = await getOrCreateDemoProfile();

  return prisma.workoutSession.findMany({
    where: { userProfileId: profile.id },
    include: {
      sets: {
        include: {
          exercise: {
            select: {
              id: true,
              slug: true,
              name: true,
              nameFr: true,
              primaryMuscles: true,
              primaryMusclesFr: true,
              fallbackThumbnailPath: true,
              fallbackImagePath: true,
            },
          },
        },
        orderBy: [{ createdAt: "asc" }],
      },
      program: true,
    },
    orderBy: [{ createdAt: "desc" }],
    take: 60,
  });
}

export async function getWorkoutHistorySummaryForDemoUser() {
  const sessions = await getWorkoutHistoryForDemoUser();

  const now = new Date();
  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const enriched = sessions.map((session) => {
    const totalVolume = session.sets.reduce((acc, set) => acc + (set.actualReps ?? 0) * (set.actualWeightKg ?? 0), 0);
    const exerciseCount = new Set(session.sets.map((set) => set.exerciseId)).size;
    const setsCount = session.sets.length;
    const muscleCounts = new Map<string, number>();
    for (const set of session.sets) {
      const muscle = set.exercise.primaryMusclesFr[0] || set.exercise.primaryMuscles[0] || "Full body";
      muscleCounts.set(muscle, (muscleCounts.get(muscle) ?? 0) + 1);
    }
    const primaryMuscles = [...muscleCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([muscle]) => muscle)
      .slice(0, 3);
    return {
      ...session,
      totalVolume,
      exerciseCount,
      setsCount,
      primaryMuscles,
    };
  });

  const weeklySessions = enriched.filter((session) => (session.startedAt ?? session.createdAt) >= startOfWeek);
  const weeklyVolume = weeklySessions.reduce((acc, item) => acc + item.totalVolume, 0);

  const bestRecentSession = enriched
    .filter((session) => session.status === "COMPLETED")
    .slice(0, 10)
    .sort((a, b) => b.totalVolume - a.totalVolume)[0] ?? null;

  return {
    sessions: enriched,
    stats: {
      weeklyVolume,
      weeklySessionsCount: weeklySessions.length,
      bestRecentSession,
    },
  };
}

export async function getHistoryVisualFallback() {
  const exercise = await prisma.exercise.findFirst({
    where: { isActive: true },
    select: { name: true, nameFr: true, fallbackThumbnailPath: true, fallbackImagePath: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!exercise) return null;
  return {
    title: exercise.nameFr || exercise.name,
    image: exercise.fallbackThumbnailPath || exercise.fallbackImagePath,
  };
}

export async function getWorkoutSessionDetailForDemoUser(sessionId: string) {
  const profile = await getOrCreateDemoProfile();

  const session = await prisma.workoutSession.findFirst({
    where: { id: sessionId, userProfileId: profile.id },
    include: {
      sets: {
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
              nameFr: true,
              primaryMuscles: true,
              primaryMusclesFr: true,
            },
          },
        },
        orderBy: [{ createdAt: "asc" }, { setIndex: "asc" }],
      },
    },
  });

  if (!session) return null;

  const groupsMap = new Map<string, {
    exerciseId: string;
    exerciseName: string;
    primaryMuscle: string;
    sets: Array<{
      id: string;
      setIndex: number;
      reps: number | null;
      weightKg: number | null;
      volume: number;
      completedAt: Date | null;
    }>;
    totalVolume: number;
  }>();

  for (const set of session.sets) {
    const key = set.exerciseId;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        exerciseId: set.exerciseId,
        exerciseName: getExerciseDisplayName(set.exercise),
        primaryMuscle: set.exercise.primaryMusclesFr[0] || set.exercise.primaryMuscles[0] || "Full body",
        sets: [],
        totalVolume: 0,
      });
    }

    const volume = (set.actualReps ?? 0) * (set.actualWeightKg ?? 0);
    const group = groupsMap.get(key)!;
    group.sets.push({
      id: set.id,
      setIndex: set.setIndex,
      reps: set.actualReps,
      weightKg: set.actualWeightKg,
      volume,
      completedAt: set.completedAt,
    });
    group.totalVolume += volume;
  }

  const exercises = [...groupsMap.values()];
  const totalVolume = exercises.reduce((acc, item) => acc + item.totalVolume, 0);
  const totalSets = exercises.reduce((acc, item) => acc + item.sets.length, 0);

  return {
    session,
    exercises,
    totalVolume,
    totalSets,
    totalExercises: exercises.length,
  };
}

export async function getWorkoutPageData() {
  const profile = await getOrCreateDemoProfile();

  let exercises: ExerciseWithFrCompat[] = [];
  const [programs, currentSession, latestProgramSession] = await Promise.all([
    prisma.program.findMany({
      where: { userProfileId: profile.id, status: { in: ["ACTIVE", "DRAFT"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, name: true, status: true },
    }),
    prisma.workoutSession.findFirst({
      where: { userProfileId: profile.id, status: "IN_PROGRESS" },
      select: {
        id: true,
        programId: true,
        programDayId: true,
        title: true,
        notes: true,
        startedAt: true,
        createdAt: true,
        program: { select: { name: true } },
        sets: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            exerciseId: true,
            setIndex: true,
            targetRepsMin: true,
            actualReps: true,
            actualWeightKg: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.workoutSession.findFirst({
      where: { userProfileId: profile.id, status: "COMPLETED", programId: { not: null } },
      select: { programId: true },
      orderBy: [{ endedAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const lastPerformedProgramId = latestProgramSession?.programId ?? null;

  let sessionExercises: SessionWorkoutExercise[] = [];
  if (currentSession?.programId) {
    const dayForToday = currentSession.programDayId
      ? await prisma.programDay.findFirst({
          where: { id: currentSession.programDayId, programId: currentSession.programId },
          include: {
            exercises: {
              orderBy: { orderIndex: "asc" },
              include: { exercise: { include: { media: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }] } } } },
            },
          },
        })
      : await prisma.programDay.findFirst({
          where: { programId: currentSession.programId },
          orderBy: { dayIndex: "asc" },
          include: {
            exercises: {
              orderBy: { orderIndex: "asc" },
              include: { exercise: { include: { media: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }] } } } },
            },
          },
        });

    if (dayForToday) {
      const replacements = getSessionExerciseReplacements(currentSession.notes);
      const replacementExercises = await resolveReplacementExercises(currentSession.notes);
      const latestWeightByExercise = await getLatestWeightByExerciseForWorkout(
        profile.id,
        dayForToday.exercises.map((item) => replacements[item.id]?.exerciseId ?? item.exerciseId),
      );
      sessionExercises = dayForToday.exercises.map((programExercise) => ({
        ...(toFrCompat(replacementExercises.get(replacements[programExercise.id]?.exerciseId ?? "") ?? programExercise.exercise) as ExerciseWithFrCompat),
        plan: {
          sets: programExercise.sets ?? null,
          repsMin: programExercise.repsMin ?? null,
          repsMax: programExercise.repsMax ?? null,
          plannedWeightKg:
            parseWeightKgFromText(programExercise.repsText) ??
            latestWeightByExercise.get(replacements[programExercise.id]?.exerciseId ?? programExercise.exerciseId) ??
            null,
          restSeconds: programExercise.restSeconds ?? null,
          orderDayIndex: dayForToday.dayIndex,
          orderExerciseIndex: programExercise.orderIndex,
          programExerciseId: programExercise.id,
        },
      }));
    }
  }

  if (sessionExercises.length === 0) {
    // The catalogue is only required for a free workout or a recovery from an
    // invalid/empty session. An active program already provides its exercises.
    try {
      exercises = await prisma.exercise.findMany({
        where: { isActive: true },
        include: { media: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }] } },
        orderBy: [{ category: "asc" }, { name: "asc" }],
        take: 120,
      }) as ExerciseWithFrCompat[];
    } catch (error) {
      if (!isMissingColumnError(error)) throw error;
      const fallbackExercises = await prisma.exercise.findMany({
        where: { isActive: true },
        include: { media: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }] } },
        orderBy: [{ category: "asc" }, { name: "asc" }],
        take: 120,
      });
      exercises = fallbackExercises.map((item) => toFrCompat(item)) as ExerciseWithFrCompat[];
    }
    const shuffled = [...exercises].sort(() => Math.random() - 0.5);
    sessionExercises = shuffled.slice(0, 6).map((exercise) => ({ ...exercise, plan: undefined }));
  }

  const spotifyConnection = await prisma.integrationConnection.findUnique({
    where: { userProfileId_provider: { userProfileId: profile.id, provider: "SPOTIFY" } },
    select: {
      status: true,
      displayName: true,
      connectedAt: true,
    },
  });

  return { profile, programs, exercises, sessionExercises, currentSession, lastPerformedProgramId, spotifyConnection };
}

export async function getDashboardDataForDemoUser() {
  const profile = await getOrCreateDemoProfile();
  const now = new Date();
  const startOfWeek = getParisWeekStart(now);
  const previousWeekStart = getPreviousWeekStart(now);
  const startOfDay = getParisDayStart(now);
  const recentHealthStart = new Date(now.getTime() - 36 * 60 * 60 * 1000);

  const [programs, currentSession, completedSessions, favoriteProgramDayGroups, healthMetrics, healthIntegrations] = await Promise.all([
    prisma.program.findMany({
      where: { userProfileId: profile.id, status: { in: ["ACTIVE", "DRAFT"] } },
      include: {
        days: {
          orderBy: { dayIndex: "asc" },
          include: {
            exercises: {
              orderBy: { orderIndex: "asc" },
              include: {
                exercise: {
                  include: { media: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }] } },
                },
              },
            },
          },
        },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 8,
    }),
    prisma.workoutSession.findFirst({
      where: { userProfileId: profile.id, status: "IN_PROGRESS" },
      include: {
        program: true,
        sets: {
          include: {
            exercise: {
              select: {
                id: true,
                name: true,
                nameFr: true,
                primaryMuscles: true,
                primaryMusclesFr: true,
                fallbackImagePath: true,
                fallbackThumbnailPath: true,
                difficulty: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.workoutSession.findMany({
      where: { userProfileId: profile.id, status: "COMPLETED" },
      include: {
        program: true,
        sets: {
          include: {
            exercise: {
              select: {
                id: true,
                name: true,
                nameFr: true,
                primaryMuscles: true,
                primaryMusclesFr: true,
              },
            },
          },
        },
      },
      orderBy: [{ endedAt: "desc" }, { createdAt: "desc" }],
      take: 120,
    }),
    prisma.workoutSession.groupBy({
      by: ["programDayId"],
      where: {
        userProfileId: profile.id,
        status: "COMPLETED",
        programDayId: { not: null },
      },
      _count: { programDayId: true },
      _max: { endedAt: true, createdAt: true },
    }),
    prisma.progressMetric.findMany({
      where: {
        userProfileId: profile.id,
        metricType: "PERFORMANCE",
        measuredAt: { gte: recentHealthStart },
      },
      orderBy: { measuredAt: "desc" },
      take: 80,
      select: { value: true, unit: true, measuredAt: true, notes: true },
    }),
    prisma.integrationConnection.findMany({
      where: {
        userProfileId: profile.id,
        provider: { in: ["HEALTH_CONNECT", "SAMSUNG_HEALTH"] },
        status: { in: ["PENDING", "CONNECTED"] },
      },
      select: { provider: true, status: true, displayName: true, lastSyncAt: true },
      orderBy: [{ status: "asc" }, { lastSyncAt: "desc" }, { updatedAt: "desc" }],
    }),
  ]);

  const favoriteProgramDayId = favoriteProgramDayGroups
    .filter((group): group is typeof group & { programDayId: string } => Boolean(group.programDayId))
    .sort((a, b) => {
      const countDiff = b._count.programDayId - a._count.programDayId;
      if (countDiff !== 0) return countDiff;
      const bLatest = (b._max.endedAt ?? b._max.createdAt ?? new Date(0)).getTime();
      const aLatest = (a._max.endedAt ?? a._max.createdAt ?? new Date(0)).getTime();
      if (bLatest !== aLatest) return bLatest - aLatest;
      return a.programDayId.localeCompare(b.programDayId);
    })[0]?.programDayId ?? null;
  const favoriteProgramDayCount = favoriteProgramDayId
    ? (favoriteProgramDayGroups.find((group) => group.programDayId === favoriteProgramDayId)?._count.programDayId ?? 0)
    : 0;
  const favoriteProgramDay = favoriteProgramDayId
    ? await prisma.programDay.findFirst({
        where: { id: favoriteProgramDayId, program: { userProfileId: profile.id } },
        include: {
          program: true,
          exercises: {
            orderBy: { orderIndex: "asc" },
            include: {
              exercise: {
                include: { media: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }] } },
              },
            },
          },
        },
      })
    : null;
  const activeProgram = programs.find((program) => program.status === "ACTIVE") ?? programs[0] ?? null;
  const completedForActiveProgram = activeProgram
    ? completedSessions.filter((session) => session.programId === activeProgram.id).length
    : 0;
  const nextDay = activeProgram?.days.length
    ? activeProgram.days[completedForActiveProgram % activeProgram.days.length]
    : null;
  const selectedWorkout = favoriteProgramDay && favoriteProgramDay.exercises.length > 0
    ? {
        source: "mostFrequent" as const,
        eyebrow: "TA SÉANCE FAVORITE",
        program: favoriteProgramDay.program,
        day: favoriteProgramDay,
      }
    : activeProgram && nextDay && nextDay.exercises.length > 0
      ? {
          source: "activeProgram" as const,
          eyebrow: "PROCHAINE SÉANCE",
          program: activeProgram,
          day: nextDay,
        }
      : activeProgram?.days[0] && activeProgram.days[0].exercises.length > 0
        ? {
            source: "activeProgram" as const,
            eyebrow: "PROCHAINE SÉANCE",
            program: activeProgram,
            day: activeProgram.days[0],
          }
        : null;
  const selectedExercises = selectedWorkout?.day.exercises ?? [];
  const mainProgramExercise = selectedExercises[0] ?? null;
  const mainExercise = mainProgramExercise?.exercise ?? null;
  const workoutTitle = selectedWorkout?.day.title || selectedWorkout?.program.name || "Séance libre";
  const workoutImage =
    mainExercise?.fallbackImagePath ||
    mainExercise?.fallbackThumbnailPath ||
    "/media/exercises/air-bike/0.jpg";
  const targetMuscles = selectedWorkout ? getProgramDayMuscles(selectedWorkout.day) : [];
  const estimatedMinutes = selectedWorkout ? estimateProgramDayMinutes(selectedWorkout.day) : null;
  const difficulty = selectedWorkout?.program.level ?? mainExercise?.difficulty ?? null;

  const sessionsWithStats = completedSessions.map((session) => ({
    ...session,
    date: session.startedAt ?? session.createdAt,
    volume: getSessionVolume(session.sets),
    setCount: session.sets.length,
    exerciseCount: new Set(session.sets.map((set) => set.exerciseId)).size,
  }));

  const weeklySessions = sessionsWithStats.filter((session) => session.date >= startOfWeek);
  const previousWeekSessions = sessionsWithStats.filter(
    (session) => session.date >= previousWeekStart && session.date < startOfWeek,
  );
  const weeklyVolume = weeklySessions.reduce((acc, session) => acc + session.volume, 0);
  const previousWeeklyVolume = previousWeekSessions.reduce((acc, session) => acc + session.volume, 0);
  const weeklyDurationSeconds = weeklySessions.reduce((acc, session) => acc + (session.durationSeconds ?? 0), 0);
  const weeklySetCount = weeklySessions.reduce((acc, session) => acc + session.setCount, 0);
  const weeklyComparisonPercent =
    previousWeeklyVolume > 0 ? Math.round(((weeklyVolume - previousWeeklyVolume) / previousWeeklyVolume) * 100) : null;
  const streakWeeks = getCompletedWeeksStreak(sessionsWithStats, now);

  const exerciseFrequency = new Map<string, { name: string; count: number }>();
  for (const session of sessionsWithStats.slice(0, 20)) {
    for (const set of session.sets) {
      const item = exerciseFrequency.get(set.exerciseId) ?? {
        name: set.exercise.nameFr || set.exercise.name,
        count: 0,
      };
      item.count += 1;
      exerciseFrequency.set(set.exerciseId, item);
    }
  }
  const mostFrequentExercise = [...exerciseFrequency.values()].sort((a, b) => b.count - a.count)[0] ?? null;
  const totalCompletedSessions = sessionsWithStats.length;
  const level = getLevelFromXp(totalCompletedSessions * 100 + streakWeeks * 25);
  const coachInsight = getCoachInsight({
    weeklySessions: weeklySessions.length,
    weeklyGoal: profile.sessionsPerWeek,
    weeklyVolume,
    previousWeeklyVolume,
    streakWeeks,
    lastSessionAt: sessionsWithStats[0]?.date ?? null,
    mostFrequentExerciseName: mostFrequentExercise?.name ?? null,
  });
  const healthByMetric = new Map<string, { value: number; measuredAt: Date; unit: string }>();
  const todayHealthByMetric = new Map<string, { value: number; measuredAt: Date; unit: string }>();
  for (const metric of healthMetrics) {
    const metricName = parseProgressMetricName(metric.notes);
    if (!metricName) continue;
    if (metricName === "sleep_minutes" && (metric.value < 60 || metric.value > 12 * 60)) continue;
    if (!healthByMetric.has(metricName)) {
      healthByMetric.set(metricName, { value: metric.value, measuredAt: metric.measuredAt, unit: metric.unit });
    }
    if (metric.measuredAt >= startOfDay && !todayHealthByMetric.has(metricName)) {
      todayHealthByMetric.set(metricName, { value: metric.value, measuredAt: metric.measuredAt, unit: metric.unit });
    }
  }

  const sleepMinutes = healthByMetric.get("sleep_minutes")?.value != null ? Math.round(healthByMetric.get("sleep_minutes")!.value) : null;
  const restingHeartRate = healthByMetric.get("heart_rate")?.value != null ? Math.round(healthByMetric.get("heart_rate")!.value) : null;
  const caloriesToday = todayHealthByMetric.get("calories")?.value != null ? Math.round(todayHealthByMetric.get("calories")!.value) : null;
  const sleepPoints = scoreSleep(sleepMinutes);
  const heartPoints = scoreRestingHeartRate(restingHeartRate);
  const activityPoints = scoreActivity(caloriesToday);
  const sessionPoints = scoreLastSession(sessionsWithStats[0]?.date ?? null);
  const hasHealthReadinessData = sleepPoints != null || heartPoints != null || activityPoints != null;
  const availableMax = hasHealthReadinessData
    ? (sleepPoints == null ? 0 : 40) + (heartPoints == null ? 0 : 30) + (activityPoints == null ? 0 : 20) + 10
    : 0;
  const rawPoints = (sleepPoints ?? 0) + (heartPoints ?? 0) + (activityPoints ?? 0) + sessionPoints;
  const recoveryScore = availableMax > 0 ? clampPercent((rawPoints / availableMax) * 100) : null;
  const healthProvider = healthIntegrations.find((integration) => integration.status === "CONNECTED") ?? healthIntegrations[0] ?? null;
  const healthConnected = healthProvider?.status === "CONNECTED" || healthMetrics.length > 0;
  const healthPrepared = Boolean(healthProvider);
  const healthProviderLabel =
    healthProvider?.displayName ??
    (healthProvider?.provider === "HEALTH_CONNECT"
      ? "Health Connect"
      : healthProvider?.provider === "SAMSUNG_HEALTH"
        ? "Samsung Health"
        : "Health Connect");

  return {
    user: {
      firstName: formatUserFirstName(profile.displayName),
      sessionsPerWeek: profile.sessionsPerWeek,
      trainingLevel: profile.trainingLevel,
    },
    activeProgram: activeProgram
      ? {
          id: activeProgram.id,
          name: activeProgram.name,
          level: activeProgram.level,
          goal: activeProgram.goal,
          sessionsPerWeek: activeProgram.sessionsPerWeek,
          status: activeProgram.status,
        }
      : null,
    nextWorkout: selectedWorkout
      ? {
          source: selectedWorkout.source,
          eyebrow: selectedWorkout.eyebrow,
          programId: selectedWorkout.program.id,
          programDayId: selectedWorkout.day.id,
          programName: selectedWorkout.program.name,
          title: workoutTitle,
          image: workoutImage,
          imageAlt: mainExercise ? mainExercise.nameFr || mainExercise.name : workoutTitle,
          mainExerciseName: mainExercise ? mainExercise.nameFr || mainExercise.name : null,
          exerciseCount: selectedExercises.length,
          targetMuscles,
          estimatedMinutes,
          difficulty,
          isInProgress: currentSession?.programDayId === selectedWorkout.day.id,
          achievementLabel: selectedWorkout.source === "mostFrequent" && favoriteProgramDayCount > 0
            ? `${favoriteProgramDayCount} fois réalisée`
            : weeklySessions.length > 0
              ? `${weeklySessions.length}/${profile.sessionsPerWeek} cette semaine`
              : null,
        }
      : null,
    weeklyStats: {
      sessions: weeklySessions.length,
      volume: weeklyVolume,
      durationSeconds: weeklyDurationSeconds,
      sets: weeklySetCount,
      comparisonPercent: weeklyComparisonPercent,
    },
    previousWeekStats: {
      sessions: previousWeekSessions.length,
      volume: previousWeeklyVolume,
    },
    recentSessions: sessionsWithStats.slice(0, 5).map((session) => ({
      id: session.id,
      title: session.title,
      date: session.date,
      volume: session.volume,
      setCount: session.setCount,
    })),
    streak: {
      weeks: streakWeeks,
    },
    level,
    coachInsight,
    readiness: {
      connected: healthConnected,
      prepared: healthPrepared,
      providerLabel: healthProviderLabel,
      score: recoveryScore,
      tone: recoveryScore == null ? "accent" : getRecoveryTone(recoveryScore),
      sleepLabel: formatSleep(sleepMinutes),
      restingHeartRate,
      caloriesToday,
      recommendation: recoveryScore == null
        ? healthPrepared
          ? `${healthProviderLabel} est prêt. Lance une synchronisation pour afficher ta récupération quotidienne.`
          : "Connecte tes données santé pour afficher ta récupération quotidienne."
        : getRecoveryRecommendation(recoveryScore, targetMuscles),
      updatedAt: healthMetrics[0]?.measuredAt ?? healthProvider?.lastSyncAt ?? null,
    },
    motivation: {
      streakLabel: streakWeeks > 0 ? `Série de ${streakWeeks} semaine${streakWeeks > 1 ? "s" : ""}` : null,
      weeklyGoalLabel: `${weeklySessions.length}/${profile.sessionsPerWeek} séances cette semaine`,
      xpToday: weeklySessions.some((session) => session.date >= startOfDay) ? 25 : 0,
    },
  };
}

type ProgressPeriodKey = "7d" | "30d" | "3m" | "1y";

type ProgressBucketKind = "day" | "week" | "month";

const PROGRESS_PERIODS: Record<ProgressPeriodKey, { label: string; days: number; bucketKind: ProgressBucketKind }> = {
  "7d": { label: "7 jours", days: 7, bucketKind: "day" },
  "30d": { label: "30 jours", days: 30, bucketKind: "week" },
  "3m": { label: "3 mois", days: 90, bucketKind: "week" },
  "1y": { label: "1 an", days: 365, bucketKind: "month" },
};

function resolveProgressPeriod(period?: string): ProgressPeriodKey {
  return period === "7d" || period === "3m" || period === "1y" ? period : "30d";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfLocalMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatBucketLabel(date: Date, kind: ProgressBucketKind) {
  if (kind === "month") {
    return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", month: "short" }).format(date);
  }
  if (kind === "week") {
    return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short" }).format(date);
  }
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short" }).format(date);
}

function getBucketKey(date: Date, kind: ProgressBucketKind) {
  if (kind === "month") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  const bucketDate = kind === "week" ? getParisWeekStart(date) : startOfLocalDay(date);
  return bucketDate.toISOString().slice(0, 10);
}

function getBucketStart(date: Date, kind: ProgressBucketKind) {
  if (kind === "month") return startOfLocalMonth(date);
  if (kind === "week") return getParisWeekStart(date);
  return startOfLocalDay(date);
}

function buildProgressBuckets(start: Date, end: Date, kind: ProgressBucketKind) {
  const buckets: Array<{
    key: string;
    label: string;
    start: Date;
    sessions: number;
    volume: number;
    sets: number;
    reps: number;
    durationSeconds: number;
  }> = [];
  let cursor = getBucketStart(start, kind);

  while (cursor < end) {
    buckets.push({
      key: getBucketKey(cursor, kind),
      label: formatBucketLabel(cursor, kind),
      start: new Date(cursor),
      sessions: 0,
      volume: 0,
      sets: 0,
      reps: 0,
      durationSeconds: 0,
    });
    if (kind === "month") {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    } else if (kind === "week") {
      cursor = addDays(cursor, 7);
    } else {
      cursor = addDays(cursor, 1);
    }
  }

  return buckets;
}

function percentChange(current: number, previous: number) {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function normalizeMuscleGroup(value: string) {
  const lower = value.toLowerCase();
  if (["chest", "pectoraux", "poitrine"].some((token) => lower.includes(token))) return "Pectoraux";
  if (["back", "dos", "lats", "trapezes", "trapèzes"].some((token) => lower.includes(token))) return "Dos";
  if (["leg", "jamb", "quad", "hamstring", "ischio", "glute", "fessier", "calf", "mollet"].some((token) => lower.includes(token))) return "Jambes";
  if (["shoulder", "épaule", "epaule", "delto"].some((token) => lower.includes(token))) return "Épaules";
  if (["biceps", "triceps", "forearm", "avant-bras", "bras"].some((token) => lower.includes(token))) return "Bras";
  if (["ab", "abdomin", "core", "oblique"].some((token) => lower.includes(token))) return "Abdominaux";
  return "Autres";
}

export async function getProgressDataForDemoUser(periodOrExerciseId?: string) {
  const period = resolveProgressPeriod(periodOrExerciseId);
  const periodConfig = PROGRESS_PERIODS[period];
  const profile = await getOrCreateDemoProfile();
  const now = new Date();
  const currentEnd = now;
  const currentStart = startOfLocalDay(addDays(currentEnd, -periodConfig.days + 1));
  const previousEnd = currentStart;
  const previousStart = startOfLocalDay(addDays(previousEnd, -periodConfig.days));

  const sessions = await prisma.workoutSession.findMany({
    where: {
      userProfileId: profile.id,
      status: "COMPLETED",
      OR: [
        { startedAt: { gte: previousStart, lte: currentEnd } },
        { startedAt: null, createdAt: { gte: previousStart, lte: currentEnd } },
      ],
    },
    include: {
      sets: {
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
              nameFr: true,
              primaryMuscles: true,
              primaryMusclesFr: true,
            },
          },
        },
        orderBy: [{ createdAt: "asc" }],
      },
    },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    take: 500,
  });

  const enrichSession = (session: (typeof sessions)[number]) => {
    const date = session.startedAt ?? session.createdAt;
    const completedSets = session.sets.filter((set) => set.isCompleted || set.actualReps != null || set.actualWeightKg != null);
    const volume = completedSets.reduce((acc, set) => acc + (set.actualReps ?? 0) * (set.actualWeightKg ?? 0), 0);
    const reps = completedSets.reduce((acc, set) => acc + (set.actualReps ?? 0), 0);
    return {
      ...session,
      date,
      completedSets,
      volume,
      reps,
      setCount: completedSets.length,
      durationSeconds: session.durationSeconds ?? 0,
    };
  };

  const enriched = sessions.map(enrichSession);
  const currentSessions = enriched.filter((session) => session.date >= currentStart && session.date <= currentEnd);
  const previousSessions = enriched.filter((session) => session.date >= previousStart && session.date < previousEnd);

  const summarize = (items: typeof currentSessions) => ({
    sessions: items.length,
    volume: items.reduce((acc, session) => acc + session.volume, 0),
    durationSeconds: items.reduce((acc, session) => acc + session.durationSeconds, 0),
    sets: items.reduce((acc, session) => acc + session.setCount, 0),
    reps: items.reduce((acc, session) => acc + session.reps, 0),
  });

  const current = summarize(currentSessions);
  const previous = summarize(previousSessions);
  const volumeChangePercent = percentChange(current.volume, previous.volume);
  const sessionsChangePercent = percentChange(current.sessions, previous.sessions);
  const durationChangePercent = percentChange(current.durationSeconds, previous.durationSeconds);
  const setsChangePercent = percentChange(current.sets, previous.sets);

  const buckets = buildProgressBuckets(currentStart, currentEnd, periodConfig.bucketKind);
  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const session of currentSessions) {
    const bucket = bucketMap.get(getBucketKey(session.date, periodConfig.bucketKind));
    if (!bucket) continue;
    bucket.sessions += 1;
    bucket.volume += session.volume;
    bucket.sets += session.setCount;
    bucket.reps += session.reps;
    bucket.durationSeconds += session.durationSeconds;
  }

  const bestBucket = buckets.reduce((best, bucket) => (bucket.volume > best.volume ? bucket : best), buckets[0] ?? null);
  const allCurrentSets = currentSessions.flatMap((session) => session.completedSets.map((set) => ({ ...set, session })));

  const bestWeightSet = allCurrentSets
    .filter((set) => (set.actualWeightKg ?? 0) > 0)
    .sort((a, b) => (b.actualWeightKg ?? 0) - (a.actualWeightKg ?? 0))[0] ?? null;
  const bestVolumeSession = [...currentSessions].sort((a, b) => b.volume - a.volume)[0] ?? null;
  const longestSession = currentSessions
    .filter((session) => session.durationSeconds > 0)
    .sort((a, b) => b.durationSeconds - a.durationSeconds)[0] ?? null;
  const mostSetsSession = [...currentSessions].sort((a, b) => b.setCount - a.setCount)[0] ?? null;

  const exerciseUsage = new Map<string, { id: string; name: string; sets: number; volume: number }>();
  const muscleUsage = new Map<string, { group: string; sets: number; volume: number }>();
  for (const session of currentSessions) {
    for (const set of session.completedSets) {
      const exerciseName = set.exercise.nameFr || set.exercise.name;
      const setVolume = (set.actualReps ?? 0) * (set.actualWeightKg ?? 0);
      const exerciseItem = exerciseUsage.get(set.exerciseId) ?? { id: set.exerciseId, name: exerciseName, sets: 0, volume: 0 };
      exerciseItem.sets += 1;
      exerciseItem.volume += setVolume;
      exerciseUsage.set(set.exerciseId, exerciseItem);

      const muscles = set.exercise.primaryMusclesFr.length ? set.exercise.primaryMusclesFr : set.exercise.primaryMuscles;
      const primaryGroup = normalizeMuscleGroup(muscles[0] ?? "Autres");
      const muscleItem = muscleUsage.get(primaryGroup) ?? { group: primaryGroup, sets: 0, volume: 0 };
      muscleItem.sets += 1;
      muscleItem.volume += setVolume;
      muscleUsage.set(primaryGroup, muscleItem);
    }
  }

  const mostPracticedExercise = [...exerciseUsage.values()].sort((a, b) => b.sets - a.sets)[0] ?? null;
  const bestExerciseVolume = [...exerciseUsage.values()].sort((a, b) => b.volume - a.volume)[0] ?? null;
  const totalMuscleSets = [...muscleUsage.values()].reduce((acc, item) => acc + item.sets, 0);
  const muscleDistribution = [...muscleUsage.values()]
    .map((item) => ({
      ...item,
      percent: totalMuscleSets > 0 ? Math.round((item.sets / totalMuscleSets) * 100) : 0,
    }))
    .sort((a, b) => b.sets - a.sets);

  const currentWeekKeys = new Set(currentSessions.map((session) => getParisWeekStart(session.date).toISOString().slice(0, 10)));
  const activeWeeks = currentWeekKeys.size;
  const averageSessionsPerWeek = periodConfig.days > 0 ? Math.round((current.sessions / (periodConfig.days / 7)) * 10) / 10 : 0;
  const favoriteDay = [...currentSessions.reduce((map, session) => {
    const label = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long" }).format(session.date);
    map.set(label, (map.get(label) ?? 0) + 1);
    return map;
  }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  const completedSessionDates = enriched
    .filter((session) => session.date <= currentEnd)
    .map((session) => getParisWeekStart(session.date).getTime());
  const weeklyKeys = new Set(completedSessionDates);
  let bestStreakWeeks = 0;
  let currentStreak = 0;
  const minWeek = completedSessionDates.length ? Math.min(...completedSessionDates) : null;
  if (minWeek != null) {
    for (let cursor = getParisWeekStart(currentEnd).getTime(); cursor >= minWeek; cursor -= 7 * 24 * 60 * 60 * 1000) {
      if (weeklyKeys.has(cursor)) {
        currentStreak += 1;
        bestStreakWeeks = Math.max(bestStreakWeeks, currentStreak);
      } else {
        currentStreak = 0;
      }
    }
  }
  const latestSessions = [...currentSessions].sort((a, b) => b.date.getTime() - a.date.getTime());

  return {
    period: {
      key: period,
      label: periodConfig.label,
      start: currentStart,
      end: currentEnd,
      previousStart,
      previousEnd,
      bucketKind: periodConfig.bucketKind,
    },
    summary: {
      current,
      previous,
      changes: {
        volumePercent: volumeChangePercent,
        sessionsPercent: sessionsChangePercent,
        durationPercent: durationChangePercent,
        setsPercent: setsChangePercent,
      },
    },
    series: buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      sessions: bucket.sessions,
      volume: bucket.volume,
      sets: bucket.sets,
      reps: bucket.reps,
      durationSeconds: bucket.durationSeconds,
    })),
    bestBucket: bestBucket ? { label: bestBucket.label, volume: bestBucket.volume, sessions: bestBucket.sessions } : null,
    records: {
      bestWeight: bestWeightSet ? {
        value: bestWeightSet.actualWeightKg ?? 0,
        exerciseName: bestWeightSet.exercise.nameFr || bestWeightSet.exercise.name,
        date: bestWeightSet.session.date,
      } : null,
      bestExerciseVolume: bestExerciseVolume ? {
        exerciseId: bestExerciseVolume.id,
        name: bestExerciseVolume.name,
        volume: bestExerciseVolume.volume,
      } : null,
      bestSession: bestVolumeSession ? {
        sessionId: bestVolumeSession.id,
        title: bestVolumeSession.title,
        volume: bestVolumeSession.volume,
        date: bestVolumeSession.date,
      } : null,
      longestSession: longestSession ? {
        sessionId: longestSession.id,
        title: longestSession.title,
        durationSeconds: longestSession.durationSeconds,
        date: longestSession.date,
      } : null,
      mostSetsSession: mostSetsSession ? {
        sessionId: mostSetsSession.id,
        title: mostSetsSession.title,
        sets: mostSetsSession.setCount,
        date: mostSetsSession.date,
      } : null,
      mostPracticedExercise: mostPracticedExercise ? {
        exerciseId: mostPracticedExercise.id,
        name: mostPracticedExercise.name,
        sets: mostPracticedExercise.sets,
      } : null,
      bestStreakWeeks,
    },
    muscleDistribution,
    regularity: {
      activeWeeks,
      averageSessionsPerWeek,
      favoriteDay: favoriteDay ? { label: favoriteDay[0], sessions: favoriteDay[1] } : null,
      bestStreakWeeks,
      latestSessionAt: latestSessions[0]?.date ?? null,
    },
    recentSessions: latestSessions.slice(0, 8).map((session) => ({
      id: session.id,
      date: session.date,
      title: session.title,
      setCount: session.setCount,
      volume: session.volume,
      durationSeconds: session.durationSeconds,
    })),
    hasData: current.sessions > 0 || current.sets > 0 || current.volume > 0,
  };
}
