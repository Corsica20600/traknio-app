import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { getOrCreateDemoProfile } from "@/src/server/fitness-queries";

type ProgramExerciseContext = {
  params: Promise<{ programId: string; programExerciseId: string }>;
};

function normalizePositiveNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value ?? fallback);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}

async function findOwnedProgramExercise(programId: string, programExerciseId: string, userProfileId: string) {
  return prisma.programExercise.findFirst({
    where: {
      id: programExerciseId,
      programDay: {
        programId,
        program: { userProfileId },
      },
    },
    select: { id: true },
  });
}

export async function PATCH(request: Request, context: ProgramExerciseContext) {
  try {
    const profile = await getOrCreateDemoProfile();
    const params = await context.params;
    const programId = String(params.programId ?? "").trim();
    const programExerciseId = String(params.programExerciseId ?? "").trim();
    const body = (await request.json().catch(() => ({}))) as {
      sets?: number;
      repetitions?: number;
      restSeconds?: number;
      targetWeightKg?: number;
    };

    if (!programId || !programExerciseId) {
      return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
    }

    const exists = await findOwnedProgramExercise(programId, programExerciseId, profile.id);
    if (!exists) {
      return NextResponse.json({ error: "Exercice du programme introuvable." }, { status: 404 });
    }

    const sets = normalizePositiveNumber(body.sets, 3, 1, 12);
    const repetitions = normalizePositiveNumber(body.repetitions, 10, 1, 60);
    const restSeconds = normalizePositiveNumber(body.restSeconds, 60, 15, 300);
    const targetWeightKg = Number(body.targetWeightKg ?? 0);
    const repsText = Number.isFinite(targetWeightKg) && targetWeightKg > 0 ? `${targetWeightKg} kg` : null;

    const updated = await prisma.programExercise.update({
      where: { id: programExerciseId },
      data: {
        sets,
        repsMin: repetitions,
        repsMax: repetitions,
        restSeconds,
        repsText,
      },
      select: {
        id: true,
        sets: true,
        repsMin: true,
        repsText: true,
        restSeconds: true,
      },
    });

    return NextResponse.json({ ok: true, exercise: updated });
  } catch {
    return NextResponse.json({ error: "Erreur serveur lors de la modification." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: ProgramExerciseContext) {
  try {
    const profile = await getOrCreateDemoProfile();
    const params = await context.params;
    const programId = String(params.programId ?? "").trim();
    const programExerciseId = String(params.programExerciseId ?? "").trim();

    if (!programId || !programExerciseId) {
      return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
    }

    const exists = await prisma.programExercise.findFirst({
      where: {
        id: programExerciseId,
        programDay: {
          programId,
          program: { userProfileId: profile.id },
        },
      },
      select: { id: true, programDayId: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "Exercice du programme introuvable." }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.programExercise.delete({ where: { id: programExerciseId } });

      const remainingExercises = await tx.programExercise.findMany({
        where: { programDayId: exists.programDayId },
        orderBy: { orderIndex: "asc" },
        select: { id: true, orderIndex: true },
      });
      const needsNormalization = remainingExercises.some((exercise, index) => exercise.orderIndex !== index + 1);
      if (!needsNormalization) return;

      const maxOrderIndex = remainingExercises.reduce((max, exercise) => Math.max(max, exercise.orderIndex), 0);
      for (const [index, exercise] of remainingExercises.entries()) {
        await tx.programExercise.update({
          where: { id: exercise.id },
          data: { orderIndex: maxOrderIndex + index + 1 },
        });
      }
      for (const [index, exercise] of remainingExercises.entries()) {
        await tx.programExercise.update({
          where: { id: exercise.id },
          data: { orderIndex: index + 1 },
        });
      }
    });
    return NextResponse.json({ ok: true, programExerciseId });
  } catch {
    return NextResponse.json({ error: "Erreur serveur lors de la suppression." }, { status: 500 });
  }
}
