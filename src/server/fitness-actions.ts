"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/src/lib/prisma";
import { getOrCreateDemoProfile } from "@/src/server/fitness-queries";
import { markOnboardingStepForProfile } from "@/src/server/onboarding-actions";

export async function createSimpleProgramAction(formData: FormData) {
  const profile = await getOrCreateDemoProfile();
  const name = String(formData.get("name") ?? "Programme MVP").trim();
  const programName = name.length ? name : "Programme MVP";
  const goal = String(formData.get("goal") ?? "HYPERTROPHY");
  const level = String(formData.get("level") ?? "INTERMEDIATE");

  await prisma.program.create({
    data: {
      userProfileId: profile.id,
      name: programName,
      goal: goal as never,
      level: level as never,
      sessionsPerWeek: 1,
      status: "DRAFT",
      // Preserve the established product flow: a new program is immediately
      // usable and starts with one editable session.
      days: {
        create: [
          { dayIndex: 1, title: programName, focus: "A personnaliser" },
        ],
      },
    },
  });
  await markOnboardingStepForProfile(profile.id, "programCreateSeen");

  revalidatePath("/programs");
}

export async function startWorkoutSessionAction(formData: FormData) {
  const profile = await getOrCreateDemoProfile();
  const programIdRaw = String(formData.get("programId") ?? "").trim();
  const programDayIdRaw = String(formData.get("programDayId") ?? "").trim();
  const title = String(formData.get("title") ?? "Seance libre").trim();
  const selectedProgram = programIdRaw.length
    ? await prisma.program.findFirst({
        where: { id: programIdRaw, userProfileId: profile.id },
        select: {
          id: true,
          name: true,
          days: {
            select: { id: true, title: true },
            orderBy: { dayIndex: "asc" },
          },
        },
      })
    : null;
  const selectedDay = selectedProgram?.days.find((day) => day.id === programDayIdRaw) ?? selectedProgram?.days[0] ?? null;
  const defaultTitle = selectedProgram?.name?.trim() || "Seance libre";
  const sessionTitle = title.length && title.toLowerCase() !== "seance libre"
    ? title
    : defaultTitle;

  const session = await prisma.workoutSession.create({
    data: {
      userProfileId: profile.id,
      programId: selectedProgram?.id ?? null,
      programDayId: selectedDay?.id ?? null,
      title: sessionTitle,
      status: "IN_PROGRESS",
      startedAt: new Date(),
    },
  });

  await prisma.watchSession.create({
    data: {
      workoutSessionId: session.id,
      currentExerciseIndex: 0,
      currentSetIndex: 1,
      status: "ACTIVE",
      lastSyncAt: new Date(),
    },
  });

  revalidatePath("/workout");
  revalidatePath("/dashboard");
  revalidatePath("/history");
}

export async function logWorkoutSetAction(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const exerciseId = String(formData.get("exerciseId") ?? "").trim();
  const reps = Number(formData.get("actualReps") ?? 0);
  const weight = Number(formData.get("actualWeightKg") ?? 0);

  if (!sessionId || !exerciseId) return;

  const countForExercise = await prisma.workoutSet.count({
    where: { workoutSessionId: sessionId, exerciseId },
  });

  await prisma.workoutSet.create({
    data: {
      workoutSessionId: sessionId,
      exerciseId,
      setIndex: countForExercise + 1,
      actualReps: Number.isFinite(reps) && reps > 0 ? reps : null,
      actualWeightKg: Number.isFinite(weight) && weight > 0 ? weight : null,
      isCompleted: true,
      completedAt: new Date(),
      restSeconds: 90,
    },
  });

  revalidatePath("/workout");
  revalidatePath("/dashboard");
  revalidatePath("/history");
}

export async function completeWorkoutSessionAction(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  if (!sessionId) return;

  const started = await prisma.workoutSession.findUnique({ where: { id: sessionId } });
  const endedAt = new Date();

  await prisma.workoutSession.update({
    where: { id: sessionId },
    data: {
      status: "COMPLETED",
      endedAt,
      durationSeconds: started?.startedAt ? Math.max(60, Math.floor((endedAt.getTime() - started.startedAt.getTime()) / 1000)) : null,
    },
  });

  await prisma.watchSession.updateMany({
    where: { workoutSessionId: sessionId },
    data: {
      status: "COMPLETED",
      lastSyncAt: new Date(),
    },
  });

  revalidatePath("/workout");
  revalidatePath("/dashboard");
  revalidatePath("/history");
}

export async function addExerciseToProgramDayAction(formData: FormData) {
  const profile = await getOrCreateDemoProfile();
  const programId = String(formData.get("programId") ?? "").trim();
  const dayId = String(formData.get("dayId") ?? "").trim();
  const exerciseId = String(formData.get("exerciseId") ?? "").trim();
  const sets = Number(formData.get("sets") ?? 4);
  const reps = Number(formData.get("repetitions") ?? 10);
  const restSeconds = Number(formData.get("restSeconds") ?? 90);
  const targetWeightKg = Number(formData.get("targetWeightKg") ?? 0);

  if (!dayId || !exerciseId) return;

  const day = await prisma.programDay.findFirst({
    where: {
      id: dayId,
      ...(programId ? { programId } : {}),
      program: { userProfileId: profile.id },
    },
    select: { id: true, programId: true },
  });

  if (!day) return;

  const last = await prisma.programExercise.findFirst({
    where: { programDayId: dayId },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });

  await prisma.programExercise.create({
    data: {
      programDayId: dayId,
      exerciseId,
      orderIndex: (last?.orderIndex ?? 0) + 1,
      sets: Number.isFinite(sets) ? Math.max(1, Math.min(12, sets)) : 4,
      repsMin: Number.isFinite(reps) ? Math.max(1, Math.min(60, reps)) : 10,
      repsMax: Number.isFinite(reps) ? Math.max(1, Math.min(60, reps)) : 10,
      repsText: Number.isFinite(targetWeightKg) && targetWeightKg > 0 ? `${targetWeightKg} kg` : null,
      restSeconds: Number.isFinite(restSeconds) ? Math.max(15, Math.min(300, restSeconds)) : 90,
    },
  });
  await markOnboardingStepForProfile(profile.id, "programExerciseSeen");

  revalidatePath("/programs");
}

export async function addProgramDayAction(formData: FormData) {
  const profile = await getOrCreateDemoProfile();
  const programId = String(formData.get("programId") ?? "").trim();
  if (!programId) return;

  const program = await prisma.program.findFirst({
    where: { id: programId, userProfileId: profile.id },
    include: { days: { select: { dayIndex: true }, orderBy: { dayIndex: "desc" }, take: 1 } },
  });
  if (!program) return;

  const nextDayIndex = (program.days[0]?.dayIndex ?? 0) + 1;
  await prisma.programDay.create({
    data: {
      programId: program.id,
      dayIndex: nextDayIndex,
      title: `Jour ${nextDayIndex}`,
      focus: "A personnaliser",
    },
  });
  await markOnboardingStepForProfile(profile.id, "programDaySeen");

  revalidatePath("/programs");
}

export async function renameProgramDayAction(formData: FormData) {
  const profile = await getOrCreateDemoProfile();
  const programId = String(formData.get("programId") ?? "").trim();
  const dayId = String(formData.get("dayId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const focus = String(formData.get("focus") ?? "").trim();
  if (!programId || !dayId) return;

  const day = await prisma.programDay.findFirst({
    where: { id: dayId, programId, program: { userProfileId: profile.id } },
    select: { id: true },
  });
  if (!day) return;

  await prisma.programDay.update({
    where: { id: dayId },
    data: {
      title: title || "Seance",
      focus: focus || null,
    },
  });

  revalidatePath("/programs");
}

export async function deleteProgramDayAction(formData: FormData) {
  const profile = await getOrCreateDemoProfile();
  const programId = String(formData.get("programId") ?? "").trim();
  const dayId = String(formData.get("dayId") ?? "").trim();
  if (!programId || !dayId) return;

  const program = await prisma.program.findFirst({
    where: { id: programId, userProfileId: profile.id },
    include: { days: { select: { id: true, dayIndex: true }, orderBy: { dayIndex: "asc" } } },
  });
  if (!program || program.days.length <= 1) return;

  const dayExists = program.days.find((d) => d.id === dayId);
  if (!dayExists) return;

  await prisma.programDay.delete({ where: { id: dayId } });

  const remainingDays = await prisma.programDay.findMany({
    where: { programId: program.id },
    orderBy: { dayIndex: "asc" },
    select: { id: true },
  });

  await Promise.all(
    remainingDays.map((day, idx) =>
      prisma.programDay.update({
        where: { id: day.id },
        data: { dayIndex: idx + 1 },
      }),
    ),
  );

  revalidatePath("/programs");
}

export async function resetProgramStructureAction() {
  const profile = await getOrCreateDemoProfile();

  const programs = await prisma.program.findMany({
    where: { userProfileId: profile.id },
    include: { days: { select: { id: true } } },
  });

  for (const program of programs) {
    await prisma.programExercise.deleteMany({
      where: { programDay: { programId: program.id } },
    });
    await prisma.programDay.deleteMany({ where: { programId: program.id } });
    await prisma.programDay.create({
      data: {
        programId: program.id,
        dayIndex: 1,
        title: "Jour 1",
        focus: "A personnaliser",
      },
    });
    await prisma.program.update({
      where: { id: program.id },
      data: { sessionsPerWeek: 1 },
    });
  }

  revalidatePath("/programs");
}

export async function duplicateProgramDayExercisesAction(formData: FormData) {
  const profile = await getOrCreateDemoProfile();
  const programId = String(formData.get("programId") ?? "").trim();
  const sourceDayId = String(formData.get("sourceDayId") ?? "").trim();
  const targetDayId = String(formData.get("targetDayId") ?? "").trim();
  if (!programId || !sourceDayId || !targetDayId || sourceDayId === targetDayId) return;

  const program = await prisma.program.findFirst({
    where: { id: programId, userProfileId: profile.id },
    include: {
      days: {
        where: { id: { in: [sourceDayId, targetDayId] } },
        include: { exercises: { orderBy: { orderIndex: "asc" } } },
      },
    },
  });
  if (!program || program.days.length < 2) return;

  const sourceDay = program.days.find((d) => d.id === sourceDayId);
  const targetDay = program.days.find((d) => d.id === targetDayId);
  if (!sourceDay || !targetDay) return;

  await prisma.programExercise.deleteMany({ where: { programDayId: targetDayId } });

  if (sourceDay.exercises.length > 0) {
    await prisma.programExercise.createMany({
      data: sourceDay.exercises.map((ex, idx) => ({
        programDayId: targetDayId,
        exerciseId: ex.exerciseId,
        orderIndex: idx + 1,
        sets: ex.sets,
        repsMin: ex.repsMin,
        repsMax: ex.repsMax,
        repsText: ex.repsText,
        restSeconds: ex.restSeconds,
        tempo: ex.tempo,
      })),
    });
  }

  revalidatePath("/programs");
}

export async function setProgramStatusAction(formData: FormData) {
  const profile = await getOrCreateDemoProfile();
  const programId = String(formData.get("programId") ?? "").trim();
  const nextStatus = String(formData.get("status") ?? "").trim();
  if (!programId || !["DRAFT", "ACTIVE", "ARCHIVED"].includes(nextStatus)) return;

  const program = await prisma.program.findFirst({
    where: { id: programId, userProfileId: profile.id },
    select: { id: true },
  });
  if (!program) return;

  await prisma.program.update({
    where: { id: programId },
    data: { status: nextStatus as "DRAFT" | "ACTIVE" | "ARCHIVED" },
  });

  revalidatePath("/programs");
}

export async function deleteProgramAction(formData: FormData) {
  const profile = await getOrCreateDemoProfile();
  const programId = String(formData.get("programId") ?? "").trim();
  if (!programId) return;

  const program = await prisma.program.findFirst({
    where: { id: programId, userProfileId: profile.id },
    select: {
      id: true,
      days: { select: { id: true } },
    },
  });
  if (!program) return;

  const dayIds = program.days.map((day) => day.id);
  await prisma.$transaction([
    prisma.programExercise.deleteMany({ where: { programDayId: { in: dayIds } } }),
    prisma.programDay.deleteMany({ where: { programId } }),
    prisma.program.delete({ where: { id: programId } }),
  ]);

  revalidatePath("/programs");
}

export async function updateProgramExerciseAction(formData: FormData) {
  const profile = await getOrCreateDemoProfile();
  const programId = String(formData.get("programId") ?? "").trim();
  const programExerciseId = String(formData.get("programExerciseId") ?? "").trim();
  const sets = Number(formData.get("sets") ?? 3);
  const repetitions = Number(formData.get("repetitions") ?? 10);
  const restSeconds = Number(formData.get("restSeconds") ?? 60);
  const targetWeightKg = Number(formData.get("targetWeightKg") ?? 0);
  if (!programId || !programExerciseId) return;

  const exists = await prisma.programExercise.findFirst({
    where: {
      id: programExerciseId,
      programDay: { programId, program: { userProfileId: profile.id } },
    },
    select: { id: true },
  });
  if (!exists) return;

  await prisma.programExercise.update({
    where: { id: programExerciseId },
    data: {
      sets: Number.isFinite(sets) ? Math.max(1, Math.min(12, sets)) : 3,
      repsMin: Number.isFinite(repetitions) ? Math.max(1, Math.min(60, repetitions)) : 10,
      repsMax: Number.isFinite(repetitions) ? Math.max(1, Math.min(60, repetitions)) : 10,
      restSeconds: Number.isFinite(restSeconds) ? Math.max(15, Math.min(300, restSeconds)) : 60,
      repsText: Number.isFinite(targetWeightKg) && targetWeightKg > 0 ? `${targetWeightKg} kg` : null,
    },
  });

  revalidatePath("/programs");
}

export async function deleteProgramExerciseAction(formData: FormData) {
  const profile = await getOrCreateDemoProfile();
  const programId = String(formData.get("programId") ?? "").trim();
  const programExerciseId = String(formData.get("programExerciseId") ?? "").trim();
  if (!programId || !programExerciseId) return;

  const exists = await prisma.programExercise.findFirst({
    where: {
      id: programExerciseId,
      programDay: { programId, program: { userProfileId: profile.id } },
    },
    select: { id: true },
  });
  if (!exists) return;

  await prisma.programExercise.delete({ where: { id: programExerciseId } });
  revalidatePath("/programs");
}

export async function replaceProgramExerciseAction(formData: FormData) {
  const profile = await getOrCreateDemoProfile();
  const programId = String(formData.get("programId") ?? "").trim();
  const programExerciseId = String(formData.get("programExerciseId") ?? "").trim();
  const exerciseId = String(formData.get("exerciseId") ?? "").trim();
  if (!programId || !programExerciseId || !exerciseId) return;

  const exists = await prisma.programExercise.findFirst({
    where: {
      id: programExerciseId,
      programDay: { programId, program: { userProfileId: profile.id } },
    },
    select: { id: true },
  });
  if (!exists) return;

  await prisma.programExercise.update({
    where: { id: programExerciseId },
    data: { exerciseId },
  });

  revalidatePath("/programs");
}

export async function moveProgramExercisePositionAction(formData: FormData) {
  const profile = await getOrCreateDemoProfile();
  const programId = String(formData.get("programId") ?? "").trim();
  const programExerciseId = String(formData.get("programExerciseId") ?? "").trim();
  const direction = String(formData.get("direction") ?? "").trim();
  if (!programId || !programExerciseId || !["up", "down"].includes(direction)) return;

  const current = await prisma.programExercise.findFirst({
    where: {
      id: programExerciseId,
      programDay: { programId, program: { userProfileId: profile.id } },
    },
    select: { id: true, programDayId: true, orderIndex: true },
  });
  if (!current) return;

  const swapWith = await prisma.programExercise.findFirst({
    where: {
      programDayId: current.programDayId,
      orderIndex: direction === "up" ? current.orderIndex - 1 : current.orderIndex + 1,
    },
    select: { id: true, orderIndex: true },
  });
  if (!swapWith) return;

  await prisma.$transaction([
    prisma.programExercise.update({
      where: { id: current.id },
      data: { orderIndex: swapWith.orderIndex },
    }),
    prisma.programExercise.update({
      where: { id: swapWith.id },
      data: { orderIndex: current.orderIndex },
    }),
  ]);

  revalidatePath("/programs");
}

export async function applyWeeklyTemplateAction(formData: FormData) {
  const profile = await getOrCreateDemoProfile();
  const programId = String(formData.get("programId") ?? "").trim();
  const sourceDayId = String(formData.get("sourceDayId") ?? "").trim();
  const selectedWeekdays = formData.getAll("weekdays").map((v) => String(v)).filter(Boolean);
  if (!programId || !sourceDayId || selectedWeekdays.length === 0) return;

  const labels: Record<string, string> = {
    MONDAY: "Lundi",
    TUESDAY: "Mardi",
    WEDNESDAY: "Mercredi",
    THURSDAY: "Jeudi",
    FRIDAY: "Vendredi",
    SATURDAY: "Samedi",
    SUNDAY: "Dimanche",
  };

  const program = await prisma.program.findFirst({
    where: { id: programId, userProfileId: profile.id },
    include: {
      days: {
        include: {
          exercises: { orderBy: { orderIndex: "asc" } },
        },
      },
    },
  });
  if (!program) return;

  const source = program.days.find((d) => d.id === sourceDayId);
  if (!source) return;

  await prisma.programExercise.deleteMany({ where: { programDay: { programId } } });
  await prisma.programDay.deleteMany({ where: { programId } });

  for (let i = 0; i < selectedWeekdays.length; i += 1) {
    const code = selectedWeekdays[i]!;
    const title = labels[code] ?? `Jour ${i + 1}`;
    const newDay = await prisma.programDay.create({
      data: {
        programId,
        dayIndex: i + 1,
        title,
        focus: program.days.find((d) => d.id === sourceDayId)?.focus || "Routine",
      },
    });

    if (source.exercises.length > 0) {
      await prisma.programExercise.createMany({
        data: source.exercises.map((ex, idx) => ({
          programDayId: newDay.id,
          exerciseId: ex.exerciseId,
          orderIndex: idx + 1,
          sets: ex.sets,
          repsMin: ex.repsMin,
          repsMax: ex.repsMax,
          repsText: ex.repsText,
          restSeconds: ex.restSeconds,
          tempo: ex.tempo,
        })),
      });
    }
  }

  await prisma.program.update({
    where: { id: programId },
    data: { sessionsPerWeek: selectedWeekdays.length },
  });

  revalidatePath("/programs");
}
