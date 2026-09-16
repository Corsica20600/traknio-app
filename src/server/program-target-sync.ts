import { prisma } from "@/src/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function syncProgramExerciseTargets(input: {
  workoutSessionId: string;
  exerciseId: string;
  programExerciseId?: string | null;
  actualReps?: number | null;
  actualWeightKg?: number | null;
}, db: Prisma.TransactionClient = prisma, knownProgramId?: string | null) {
  if (!input.workoutSessionId || !input.exerciseId) return null;

  const session = knownProgramId !== undefined ? { programId: knownProgramId } : await db.workoutSession.findUnique({
    where: { id: input.workoutSessionId },
    select: { programId: true },
  });
  if (!session?.programId) return null;

  const programExercise = input.programExerciseId
    ? await db.programExercise.findFirst({
        where: {
          id: input.programExerciseId,
          exerciseId: input.exerciseId,
          programDay: { programId: session.programId },
        },
        select: { id: true },
      })
    : await db.programExercise.findFirst({
        where: {
          exerciseId: input.exerciseId,
          programDay: { programId: session.programId },
        },
        orderBy: [{ programDay: { dayIndex: "asc" } }, { orderIndex: "asc" }],
        select: { id: true },
      });

  if (!programExercise) return null;

  const actualReps = Number.isFinite(input.actualReps as number) && (input.actualReps as number) > 0
    ? Math.floor(input.actualReps as number)
    : null;
  const actualWeightKg = Number.isFinite(input.actualWeightKg as number) && (input.actualWeightKg as number) > 0
    ? input.actualWeightKg as number
    : null;

  await db.programExercise.update({
    where: { id: programExercise.id },
    data: {
      ...(actualReps ? { repsMin: actualReps, repsMax: actualReps } : {}),
      repsText: actualWeightKg ? `${actualWeightKg} kg` : null,
    },
  });

  return programExercise.id;
}
