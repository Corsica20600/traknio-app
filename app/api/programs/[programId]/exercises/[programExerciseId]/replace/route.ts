import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { requirePremiumAccess } from "@/src/server/premium-access";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ programId: string; programExerciseId: string }> },
) {
  try {
    const profile = await requirePremiumAccess();
    const params = await context.params;
    const programId = String(params.programId ?? "").trim();
    const programExerciseId = String(params.programExerciseId ?? "").trim();
    const body = (await request.json().catch(() => ({}))) as { exerciseId?: string };
    const exerciseId = String(body.exerciseId ?? "").trim();

    if (!programId || !programExerciseId || !exerciseId) {
      return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
    }

    const programExercise = await prisma.programExercise.findFirst({
      where: {
        id: programExerciseId,
        programDay: {
          programId,
          program: { userProfileId: profile.id },
        },
      },
      select: { id: true },
    });

    if (!programExercise) {
      return NextResponse.json({ error: "Exercice du programme introuvable." }, { status: 404 });
    }

    const targetExercise = await prisma.exercise.findUnique({
      where: { id: exerciseId },
      select: {
        id: true,
        name: true,
        nameFr: true,
        fallbackThumbnailPath: true,
        fallbackImagePath: true,
        primaryAnimationPath: true,
        media: {
          orderBy: { sortOrder: "asc" },
          select: {
            type: true,
            publicUrl: true,
            url: true,
            format: true,
          },
        },
      },
    });

    if (!targetExercise) {
      return NextResponse.json({ error: "Exercice cible introuvable." }, { status: 404 });
    }

    await prisma.programExercise.update({
      where: { id: programExerciseId },
      data: { exerciseId },
    });

    return NextResponse.json({
      ok: true,
      programExerciseId,
      exerciseId: targetExercise.id,
      exercise: {
        id: targetExercise.id,
        name: targetExercise.name,
        nameFr: targetExercise.nameFr,
        fallbackThumbnailPath: targetExercise.fallbackThumbnailPath,
        fallbackImagePath: targetExercise.fallbackImagePath,
        primaryAnimationPath: targetExercise.primaryAnimationPath,
        media: targetExercise.media.map((item) => ({
          type: item.type,
          publicUrl: item.publicUrl,
          url: item.url,
          format: String(item.format || "").toLowerCase(),
        })),
      },
    });
  } catch {
    return NextResponse.json({ error: "Erreur serveur lors du remplacement." }, { status: 500 });
  }
}

