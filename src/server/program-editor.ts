import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { ProgramDraft } from "@/src/lib/program-draft";

export class ProgramEditorError extends Error {}

export const editorInclude = { days: { orderBy: { dayIndex: "asc" }, include: { exercises: { orderBy: { orderIndex: "asc" }, include: { exercise: { select: { name: true, nameFr: true, fallbackThumbnailPath: true } } } } } } } satisfies Prisma.ProgramInclude;
type StoredProgram = Prisma.ProgramGetPayload<{ include: typeof editorInclude }>;
export function toProgramDraft(program: StoredProgram): ProgramDraft {
  return {
    id: program.id, revision: createHash("sha256").update(JSON.stringify(program)).digest("hex"), name: program.name, goal: program.goal, level: program.level, status: program.status,
    days: program.days.map(day => ({ id: day.id, title: day.title, focus: day.focus, exercises: day.exercises.map(ex => ({ id: ex.id, exerciseId: ex.exerciseId, name: ex.exercise.nameFr || ex.exercise.name, image: ex.exercise.fallbackThumbnailPath, sets: ex.sets, repsMin: ex.repsMin, repsMax: ex.repsMax, repsText: ex.repsText, restSeconds: ex.restSeconds, tempo: ex.tempo })) })),
  };
}

export async function persistProgramDraft(tx: Prisma.TransactionClient, userProfileId: string, draft: ProgramDraft, activate: boolean) {
  // Serializes creations/activation across tabs for this account.
  await tx.$queryRaw`SELECT id FROM "UserProfile" WHERE id = ${userProfileId} FOR UPDATE`;
  const stored = await tx.program.findUnique({ where: { id: draft.id }, include: editorInclude });
  if (stored && stored.userProfileId !== userProfileId) throw new ProgramEditorError("Programme inaccessible.");
  if (stored && draft.revision === null) return toProgramDraft(stored); // Retry of a creation: never duplicate.
  if ((!stored && draft.revision !== null) || (stored && toProgramDraft(stored).revision !== draft.revision)) throw new ProgramEditorError("Ce programme a changé ailleurs. Ferme l’éditeur et rouvre-le avant de réessayer. Ton brouillon reste disponible.");
  if (await tx.workoutSession.findFirst({ where: { userProfileId, programId: draft.id, status: "IN_PROGRESS" }, select: { id: true } })) throw new ProgramEditorError("Termine la séance en cours avant de modifier ce programme.");
  if ((activate || stored?.status === "ACTIVE") && draft.days.some(day => !day.exercises.length)) throw new ProgramEditorError("Ajoute au moins un exercice à chaque séance d’un programme actif.");
  const exerciseIds = [...new Set(draft.days.flatMap(day => day.exercises.map(ex => ex.exerciseId)))];
  const existingExerciseIds = new Set(stored?.days.flatMap(day => day.exercises.map(ex => ex.exerciseId)) ?? []);
  const addedExerciseIds = exerciseIds.filter(id => !existingExerciseIds.has(id));
  if (addedExerciseIds.length) {
    const available = await tx.exercise.findMany({ where: { id: { in: addedExerciseIds }, isActive: true }, select: { id: true } });
    if (available.length !== addedExerciseIds.length) throw new ProgramEditorError("Un exercice n’est plus disponible. Remplace-le avant d’enregistrer.");
  }
  const oldDays = new Map(stored?.days.map(day => [day.id, day]) ?? []);
  const oldExercises = new Map(stored?.days.flatMap(day => day.exercises.map(ex => [ex.id, ex] as const)) ?? []);
  for (const day of draft.days) {
    if (!oldDays.has(day.id) && !day.id.startsWith("new_")) throw new ProgramEditorError("Séance invalide.");
    for (const ex of day.exercises) {
      if (!oldExercises.has(ex.id) && !ex.id.startsWith("new_")) throw new ProgramEditorError("Exercice invalide.");
      if (oldExercises.has(ex.id) && oldExercises.get(ex.id)!.programDayId !== day.id) throw new ProgramEditorError("Déplacement entre séances non pris en charge. Duplique plutôt la séance.");
    }
  }
  if (activate) await tx.program.updateMany({ where: { userProfileId, status: "ACTIVE", id: { not: draft.id } }, data: { status: "DRAFT" } });
  const data = { name: draft.name.trim(), goal: draft.goal, level: draft.level, sessionsPerWeek: draft.days.length, status: activate ? "ACTIVE" as const : stored?.status ?? "DRAFT" as const };
  if (!stored) await tx.program.create({ data: { id: draft.id, userProfileId, ...data } });
  else await tx.program.update({ where: { id: draft.id }, data });
  // Only offset positions that actually change. Editing a name must not rewrite every exercise.
  const daysReordered = draft.days.some((day, i) => oldDays.has(day.id) && oldDays.get(day.id)!.dayIndex !== i + 1);
  const reorderedDayIds = draft.days.filter(day => day.exercises.some((ex, i) => oldExercises.has(ex.id) && oldExercises.get(ex.id)!.orderIndex !== i + 1)).map(day => day.id);
  if (daysReordered) {
    await tx.programDay.updateMany({ where: { programId: draft.id }, data: { dayIndex: { increment: 10000 } } });
  }
  if (reorderedDayIds.length) await tx.programExercise.updateMany({ where: { programDayId: { in: reorderedDayIds } }, data: { orderIndex: { increment: 10000 } } });
  const removedDays = [...oldDays.keys()].filter(id => !draft.days.some(day => day.id === id));
  if (removedDays.length) await tx.programDay.deleteMany({ where: { programId: draft.id, id: { in: removedDays } } });
  for (const [index, day] of draft.days.entries()) {
    const dayData = { title: day.title.trim(), focus: day.focus, dayIndex: index + 1 };
    const previousDay = oldDays.get(day.id);
    if (!previousDay) await tx.programDay.create({ data: { id: day.id, programId: draft.id, ...dayData } });
    else if (daysReordered || previousDay.title !== dayData.title || previousDay.focus !== dayData.focus) await tx.programDay.update({ where: { id: day.id }, data: dayData });
    const removedExercises = previousDay?.exercises.filter(ex => !day.exercises.some(next => next.id === ex.id)).map(ex => ex.id) ?? [];
    if (removedExercises.length) await tx.programExercise.deleteMany({ where: { programDayId: day.id, id: { in: removedExercises } } });
    const additions: Prisma.ProgramExerciseCreateManyInput[] = [];
    for (const [order, ex] of day.exercises.entries()) {
      const exData = { exerciseId: ex.exerciseId, orderIndex: order + 1, sets: ex.sets, repsMin: ex.repsMin, repsMax: ex.repsMax, repsText: ex.repsText, restSeconds: ex.restSeconds, tempo: ex.tempo };
      const previous = oldExercises.get(ex.id);
      if (!previous) additions.push({ id: ex.id, programDayId: day.id, ...exData });
      else if (reorderedDayIds.includes(day.id) || Object.entries(exData).some(([key, value]) => previous[key as keyof typeof exData] !== value)) await tx.programExercise.update({ where: { id: ex.id }, data: exData });
    }
    if (additions.length) await tx.programExercise.createMany({ data: additions });
  }
  return toProgramDraft(await tx.program.findUniqueOrThrow({ where: { id: draft.id }, include: editorInclude }));
}
