import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/src/lib/prisma";
import { categoryToFr } from "@/src/lib/exercise-i18n";
import { getExerciseDisplayName } from "@/src/lib/exercise-overrides";
import { getOrCreateDemoProfile } from "@/src/server/fitness-queries";
import { parseSessionNotesMeta, serializeSessionNotesMeta } from "@/src/server/session-exercise-replacements";

type ExerciseOption = {
  id: string;
  slug: string;
  name: string;
  nameFr: string | null;
  category: string;
  categoryFr: string;
  movementType: string;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  primaryMuscles: string[];
  primaryMusclesFr: string[];
  equipment: string[];
  equipmentFr: string[];
  fallbackThumbnailPath: string;
  fallbackImagePath: string;
  fallbackAnimationPath: string;
  media: Array<{
    id: string;
    type: "IMAGE" | "THUMBNAIL" | "ANIMATION";
    publicUrl: string;
    url: string | null;
    format: string;
  }>;
};

function toExerciseOption(exercise: Omit<ExerciseOption, "categoryFr">): ExerciseOption {
  const displayName = getExerciseDisplayName(exercise);

  return {
    ...exercise,
    name: displayName,
    nameFr: displayName,
    categoryFr: categoryToFr(exercise.category),
  };
}

function scoreAlternative(current: ExerciseOption, candidate: ExerciseOption) {
  let score = 0;
  const currentMuscles = new Set([...current.primaryMusclesFr, ...current.primaryMuscles].map((item) => item.toLowerCase()));
  const candidateMuscles = [...candidate.primaryMusclesFr, ...candidate.primaryMuscles].map((item) => item.toLowerCase());
  const currentEquipment = new Set([...current.equipmentFr, ...current.equipment].map((item) => item.toLowerCase()));
  const candidateEquipment = [...candidate.equipmentFr, ...candidate.equipment].map((item) => item.toLowerCase());

  if (candidate.category === current.category) score += 100;
  if (candidate.movementType === current.movementType) score += 20;
  if (candidateMuscles.some((muscle) => currentMuscles.has(muscle))) score += 35;
  if (candidateEquipment.some((equipment) => currentEquipment.has(equipment))) score += 15;
  return score;
}

async function findSessionForUser(sessionId: string) {
  const profile = await getOrCreateDemoProfile({ sessionId });
  return prisma.workoutSession.findFirst({
    where: { id: sessionId, userProfileId: profile.id, status: "IN_PROGRESS" },
    include: { watchSession: true },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = String(searchParams.get("sessionId") ?? "").trim();
  const exerciseId = String(searchParams.get("exerciseId") ?? "").trim();

  if (!sessionId || !exerciseId) {
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  }

  const session = await findSessionForUser(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Séance introuvable." }, { status: 404 });
  }

  const current = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    include: { media: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }] } },
  });

  if (!current) {
    return NextResponse.json({ error: "Exercice introuvable." }, { status: 404 });
  }

  const candidates = await prisma.exercise.findMany({
    where: {
      isActive: true,
      id: { not: current.id },
      category: current.category,
    },
    include: { media: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }] } },
    orderBy: [{ name: "asc" }],
    take: 80,
  });

  const currentOption = toExerciseOption(current);
  const alternatives = candidates
    .map(toExerciseOption)
    .map((candidate) => ({ candidate, score: scoreAlternative(currentOption, candidate) }))
    .sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name, "fr"))
    .slice(0, 12)
    .map(({ candidate }) => candidate);

  return NextResponse.json({
    current: currentOption,
    alternatives,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    sessionId?: string;
    programExerciseId?: string | null;
    currentExerciseId?: string;
    targetExerciseId?: string;
    currentExerciseIndex?: number;
    currentSetIndex?: number;
  };
  const sessionId = String(body.sessionId ?? "").trim();
  const programExerciseId = String(body.programExerciseId ?? "").trim();
  const currentExerciseId = String(body.currentExerciseId ?? "").trim();
  const targetExerciseId = String(body.targetExerciseId ?? "").trim();

  if (!sessionId || !currentExerciseId || !targetExerciseId) {
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  }

  const session = await findSessionForUser(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Séance introuvable." }, { status: 404 });
  }

  const targetExercise = await prisma.exercise.findUnique({
    where: { id: targetExerciseId },
    include: { media: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }] } },
  });
  const currentExercise = await prisma.exercise.findUnique({
    where: { id: currentExerciseId },
    select: { id: true, category: true },
  });

  if (!targetExercise || !currentExercise || targetExercise.category !== currentExercise.category) {
    return NextResponse.json({ error: "Choisis un exercice de la même gamme." }, { status: 400 });
  }

  if (programExerciseId) {
    if (!session.programId) {
      return NextResponse.json({ error: "Cette séance n'est pas liée à un programme." }, { status: 400 });
    }

    const programExercise = await prisma.programExercise.findFirst({
      where: {
        id: programExerciseId,
        programDay: {
          ...(session.programDayId ? { id: session.programDayId } : {}),
          program: { id: session.programId, userProfileId: session.userProfileId },
        },
      },
      select: { id: true },
    });

    if (!programExercise) {
      return NextResponse.json({ error: "Exercice de séance introuvable." }, { status: 404 });
    }
  }

  const key = programExerciseId || `exercise:${currentExerciseId}`;
  const meta = parseSessionNotesMeta(session.notes);
  const previousReplacement = meta.exerciseReplacements?.[key] ?? null;
  const exerciseReplacements = {
    ...(meta.exerciseReplacements ?? {}),
    [key]: {
      exerciseId: targetExercise.id,
      originalExerciseId: previousReplacement?.originalExerciseId ?? currentExerciseId,
      replacedAt: new Date().toISOString(),
    },
  };

  await prisma.workoutSession.update({
    where: { id: session.id },
    data: {
      notes: serializeSessionNotesMeta({ ...meta, exerciseReplacements }),
    },
  });

  if (body.currentExerciseIndex != null || body.currentSetIndex != null) {
    await prisma.watchSession.upsert({
      where: { workoutSessionId: session.id },
      update: {
        currentExerciseIndex: Math.max(0, Math.floor(Number(body.currentExerciseIndex ?? session.watchSession?.currentExerciseIndex ?? 0))),
        currentSetIndex: Math.max(1, Math.floor(Number(body.currentSetIndex ?? session.watchSession?.currentSetIndex ?? 1))),
        status: "ACTIVE",
        lastSyncAt: new Date(),
      },
      create: {
        workoutSessionId: session.id,
        currentExerciseIndex: Math.max(0, Math.floor(Number(body.currentExerciseIndex ?? 0))),
        currentSetIndex: Math.max(1, Math.floor(Number(body.currentSetIndex ?? 1))),
        status: "ACTIVE",
        lastSyncAt: new Date(),
      },
    });
  }

  revalidatePath("/workout");
  revalidatePath("/dashboard");

  return NextResponse.json({
    ok: true,
    replacement: exerciseReplacements[key],
    exercise: toExerciseOption(targetExercise),
  });
}
