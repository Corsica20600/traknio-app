import type { Prisma } from "@prisma/client";

export class WorkoutStartError extends Error {}

/** Both phone and watch must call this inside a transaction. */
export async function startOrResumeWorkout(tx: Prisma.TransactionClient, input: {
  userProfileId: string;
  programId?: string;
  programDayId?: string;
  title?: string;
  requireProgramDay?: boolean;
  allowedProgramId?: string | null;
}) {
  if (input.allowedProgramId !== undefined && (!input.allowedProgramId || input.programId !== input.allowedProgramId)) throw new WorkoutStartError("trial_program_required");
  // One profile lock, even if two devices submit different request IDs simultaneously.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`workout-start:${input.userProfileId}`}, 0))`;
  const active = await tx.workoutSession.findFirst({
    where: { userProfileId: input.userProfileId, status: "IN_PROGRESS" },
    orderBy: { createdAt: "desc" }, select: { id: true, ...(input.allowedProgramId !== undefined ? { programId: true } : {}) },
  });
  if (active) {
    if (input.allowedProgramId !== undefined && active.programId !== input.allowedProgramId) throw new WorkoutStartError("trial_program_required");
    return { sessionId: active.id, resumed: true };
  }

  const program = input.programId ? await tx.program.findFirst({
    where: { id: input.programId, userProfileId: input.userProfileId,
      ...(input.requireProgramDay ? { status: { not: "ARCHIVED" as const } } : {}) },
    select: { id: true, name: true, days: { orderBy: { dayIndex: "asc" },
      ...(input.requireProgramDay ? { where: { id: input.programDayId }, take: 1 } : {}),
      select: { id: true, title: true, _count: { select: { exercises: true } } } } },
  }) : null;
  const exactDay = program?.days.find(day => day.id === input.programDayId);
  if (input.requireProgramDay && (!program || !exactDay)) throw new WorkoutStartError("program_day_not_found");
  const day = exactDay ?? program?.days[0];
  if (input.allowedProgramId !== undefined && (!program || !day?._count.exercises)) throw new WorkoutStartError("program_day_empty");
  if (input.requireProgramDay && !day?._count.exercises) throw new WorkoutStartError("program_day_empty");
  const title = input.title?.trim();
  const session = await tx.workoutSession.create({
    data: {
      userProfileId: input.userProfileId, programId: program?.id ?? null, programDayId: day?.id ?? null,
      title: input.requireProgramDay ? day!.title : (title && title.toLowerCase() !== "seance libre" ? title : program?.name || "Seance libre"),
      status: "IN_PROGRESS", startedAt: new Date(),
      watchSession: { create: { currentExerciseIndex: 0, currentSetIndex: 1, status: "ACTIVE", lastSyncAt: new Date() } },
    }, select: { id: true },
  });
  return { sessionId: session.id, resumed: false };
}
