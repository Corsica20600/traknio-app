import { prisma } from "@/src/lib/prisma";
import { getExerciseDisplayName } from "@/src/lib/exercise-overrides";
import { getOrCreateDemoProfile } from "@/src/server/fitness-queries";
import type { Prisma } from "@prisma/client";

type AiGoal = "MUSCLE_GAIN" | "FAT_LOSS" | "STRENGTH" | "RECOMPOSITION";
type AiLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

export type AiProgramInput = {
  goal: AiGoal;
  level: AiLevel;
  daysPerWeek: number;
  sessionDurationMin: number;
  availableEquipment: string[];
  priorityMuscles: string[];
  restrictions: string;
};

export type ValidGeneratedProgram = {
  programName: string;
  goal: AiGoal;
  days: Array<{
    dayIndex: number;
    title: string;
    notes: string;
    exercises: Array<{
      exerciseSlug: string;
      displayName?: string;
      sets: number;
      reps: string;
      restSeconds: number;
      tempo?: string;
      notes?: string;
    }>;
  }>;
  exercises: string[];
  notes: string;
};

type OpenAiResponsePayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
};

const generatedProgramSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    programName: { type: "string" },
    goal: { type: "string", enum: ["MUSCLE_GAIN", "FAT_LOSS", "STRENGTH", "RECOMPOSITION"] },
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          dayIndex: { type: "integer" },
          title: { type: "string" },
          notes: { type: "string" },
          exercises: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                exerciseSlug: { type: "string" },
                sets: { type: "integer" },
                reps: { type: "string" },
                restSeconds: { type: "integer" },
                tempo: { type: ["string", "null"] },
                notes: { type: ["string", "null"] },
              },
              required: ["exerciseSlug", "sets", "reps", "restSeconds", "tempo", "notes"],
            },
          },
        },
        required: ["dayIndex", "title", "notes", "exercises"],
      },
    },
    exercises: {
      type: "array",
      items: { type: "string" },
    },
    notes: { type: "string" },
  },
  required: ["programName", "goal", "days", "exercises", "notes"],
} as const;

function toProgramGoal(goal: AiGoal): "HYPERTROPHY" | "FAT_LOSS" | "STRENGTH" | "GENERAL_FITNESS" {
  if (goal === "MUSCLE_GAIN") return "HYPERTROPHY";
  if (goal === "FAT_LOSS") return "FAT_LOSS";
  if (goal === "STRENGTH") return "STRENGTH";
  return "GENERAL_FITNESS";
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function extractJsonBlock(raw: string): string {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last < 0 || last <= first) return raw;
  return raw.slice(first, last + 1);
}

function getOpenAiResponseText(payload: OpenAiResponsePayload) {
  const directText = payload.output_text?.trim();
  if (directText) return directText;

  return payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join("\n")
    .trim() ?? "";
}

async function requestOpenAiProgram(apiKey: string, prompt: string, structured: boolean) {
  return fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: prompt,
      text: {
        format: structured
          ? {
              type: "json_schema",
              name: "traknio_generated_program",
              strict: true,
              schema: generatedProgramSchema,
            }
          : { type: "json_object" },
      },
    }),
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateGeneratedProgram(data: unknown): { valid: true; value: ValidGeneratedProgram } | { valid: false; reason: string } {
  if (!data || typeof data !== "object") return { valid: false, reason: "root_not_object" };
  const root = data as Record<string, unknown>;

  if (!isNonEmptyString(root.programName) || root.programName.length > 100) return { valid: false, reason: "missing_program_name" };
  if (!["MUSCLE_GAIN", "FAT_LOSS", "STRENGTH", "RECOMPOSITION"].includes(String(root.goal))) {
    return { valid: false, reason: "invalid_goal" };
  }
  if (!Array.isArray(root.days) || root.days.length === 0 || root.days.length > 7) return { valid: false, reason: "invalid_days" };
  if (!Array.isArray(root.exercises)) return { valid: false, reason: "invalid_exercises_list" };
  if (!isNonEmptyString(root.notes)) return { valid: false, reason: "missing_notes" };

  const days = root.days as Array<Record<string, unknown>>;
  const normalizedDays: ValidGeneratedProgram["days"] = [];

  for (const day of days) {
    if (!day || typeof day !== "object") return { valid: false, reason: "invalid_day" };
    if (!Number.isInteger(Number(day.dayIndex)) || Number(day.dayIndex) < 1 || Number(day.dayIndex) > 7) return { valid: false, reason: "invalid_day_index" };
    if (!isNonEmptyString(day.title) || day.title.length > 100) return { valid: false, reason: "invalid_day_title" };
    if (!isNonEmptyString(day.notes) || day.notes.length > 5000) return { valid: false, reason: "invalid_day_notes" };
    if (!Array.isArray(day.exercises) || day.exercises.length === 0 || day.exercises.length > 30) return { valid: false, reason: "invalid_day_exercises" };

    const exercises = day.exercises as Array<Record<string, unknown>>;
    const normalizedExercises: ValidGeneratedProgram["days"][number]["exercises"] = [];
    for (const ex of exercises) {
      if (!ex || typeof ex !== "object") return { valid: false, reason: "invalid_exercise" };
      if (!isNonEmptyString(ex.exerciseSlug)) return { valid: false, reason: "invalid_exercise_slug" };
      if (!Number.isInteger(Number(ex.sets)) || Number(ex.sets) < 1 || Number(ex.sets) > 12) return { valid: false, reason: "invalid_sets" };
      if (!isNonEmptyString(ex.reps) || ex.reps.length > 500 || (isNonEmptyString(ex.tempo) && ex.tempo.length > 100)) return { valid: false, reason: "invalid_reps" };
      if (!Number.isInteger(Number(ex.restSeconds)) || Number(ex.restSeconds) < 15 || Number(ex.restSeconds) > 600) return { valid: false, reason: "invalid_rest" };

      normalizedExercises.push({
        exerciseSlug: String(ex.exerciseSlug).trim(),
        sets: Math.floor(Number(ex.sets)),
        reps: String(ex.reps).trim(),
        restSeconds: Math.floor(Number(ex.restSeconds)),
        tempo: isNonEmptyString(ex.tempo) ? String(ex.tempo).trim() : undefined,
        notes: isNonEmptyString(ex.notes) ? String(ex.notes).trim() : undefined,
      });
    }

    normalizedDays.push({
      dayIndex: Math.floor(Number(day.dayIndex)),
      title: String(day.title).trim(),
      notes: String(day.notes).trim(),
      exercises: normalizedExercises,
    });
  }

  const normalized: ValidGeneratedProgram = {
    programName: String(root.programName).trim(),
    goal: String(root.goal).trim() as AiGoal,
    days: normalizedDays.sort((a, b) => a.dayIndex - b.dayIndex),
    exercises: (root.exercises as unknown[]).map((x) => String(x)).filter((x) => x.trim().length > 0),
    notes: String(root.notes).trim(),
  };

  if (normalized.days.some((day, index) => day.dayIndex !== index + 1)) return { valid: false, reason: "invalid_day_order" };

  return { valid: true, value: normalized };
}

export async function generateAiProgram(input: AiProgramInput) {
  const catalog = await prisma.exercise.findMany({
    where: { isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      nameFr: true,
      difficulty: true,
      primaryMuscles: true,
      primaryMusclesFr: true,
      equipment: true,
      equipmentFr: true,
    },
    orderBy: [{ name: "asc" }],
    take: 220,
  });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[AI_PROGRAM] OPENAI_API_KEY missing");
    return { ok: false as const, error: "missing_api_key" };
  }

  const exerciseSummary = catalog.map((exercise) => ({
    slug: exercise.slug,
    name: exercise.nameFr || exercise.name,
    level: exercise.difficulty,
    primaryMuscles: exercise.primaryMusclesFr.length ? exercise.primaryMusclesFr : exercise.primaryMuscles,
    equipment: exercise.equipmentFr.length ? exercise.equipmentFr : exercise.equipment,
  }));

  const prompt = [
    "Tu es un coach expert.",
    "Genere un programme strictement en JSON valide.",
    "Ne renvoie AUCUN texte hors JSON.",
    "Utilise UNIQUEMENT les exerciseSlug de la liste fournie.",
    "Format exact attendu:",
    JSON.stringify({
      programName: "string",
      goal: "MUSCLE_GAIN | FAT_LOSS | STRENGTH | RECOMPOSITION",
      days: [
        {
          dayIndex: 1,
          title: "string",
          notes: "string",
          exercises: [
            {
              exerciseSlug: "string",
              sets: 4,
              reps: "6-8",
              restSeconds: 90,
              tempo: "optional",
              notes: "optional",
            },
          ],
        },
      ],
      exercises: ["slug-a", "slug-b"],
      notes: "string",
    }),
    `Contrainte jours/semaine: ${input.daysPerWeek}`,
    `Le programme doit contenir exactement ${input.daysPerWeek} entrees dans days, une seance complete par jour, avec dayIndex de 1 a ${input.daysPerWeek}.`,
    "Limites : nom et titre 100 caracteres, 1 a 12 series, repos 15 a 600 secondes, au maximum 30 exercices par seance.",
    `Duree cible par seance (min): ${input.sessionDurationMin}`,
    `Objectif: ${input.goal}`,
    `Niveau: ${input.level}`,
    `Materiel dispo: ${input.availableEquipment.join(", ") || "non precise"}`,
    `Muscles prioritaires: ${input.priorityMuscles.join(", ") || "non precise"}`,
    `Restrictions/douleurs: ${input.restrictions || "aucune"}`,
    "Catalogue exercices (slug obligatoire):",
    JSON.stringify(exerciseSummary),
  ].join("\n");

  try {
    let response = await requestOpenAiProgram(apiKey, prompt, true);
    if (!response.ok && response.status === 400) {
      console.warn("[AI_PROGRAM] Structured output refused, retrying JSON mode");
      response = await requestOpenAiProgram(apiKey, prompt, false);
    }

    if (!response.ok) {
      console.error("[AI_PROGRAM] OpenAI error", response.status);
      return { ok: false as const, error: "openai_error" };
    }

    const payload = await response.json() as OpenAiResponsePayload;
    const text = getOpenAiResponseText(payload);
    const parsed = safeJsonParse(extractJsonBlock(text));
    const valid = validateGeneratedProgram(parsed);
    if (!valid.valid) {
      console.error("[AI_PROGRAM] JSON invalide", valid.reason);
      return { ok: false as const, error: "invalid_json", reason: valid.reason };
    }
    if (valid.value.days.length !== input.daysPerWeek) return { ok: false as const, error: "invalid_json", reason: "incorrect_day_count" };

    const exerciseBySlug = new Map(catalog.map((item) => [item.slug, item]));
    const known = new Set(catalog.map((item) => item.slug));
    const unknownSlugs = valid.value.days
      .flatMap((d) => d.exercises.map((e) => e.exerciseSlug))
      .filter((slug) => !known.has(slug));

    if (unknownSlugs.length > 0) {
      console.error("[AI_PROGRAM] Exercices introuvables", unknownSlugs.join(", "));
      return { ok: false as const, error: "unknown_exercises", unknownSlugs };
    }

    const localizedProgram: ValidGeneratedProgram = {
      ...valid.value,
      exercises: valid.value.exercises.map((slug) => {
        const exercise = exerciseBySlug.get(slug);
        return exercise ? getExerciseDisplayName(exercise) : slug;
      }),
      days: valid.value.days.map((day) => ({
        ...day,
        exercises: day.exercises.map((exercise) => {
          const catalogExercise = exerciseBySlug.get(exercise.exerciseSlug);
          return {
            ...exercise,
            displayName: catalogExercise ? getExerciseDisplayName(catalogExercise) : exercise.exerciseSlug,
          };
        }),
      })),
    };

    console.info("[AI_PROGRAM] Generation succes");
    return { ok: true as const, program: localizedProgram };
  } catch (error) {
    console.error("[AI_PROGRAM] OpenAI exception", error);
    return { ok: false as const, error: "openai_exception" };
  }
}

export async function saveGeneratedProgram(program: ValidGeneratedProgram, scope?: { userProfileId: string; db: Prisma.TransactionClient; level?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" }) {
  const checked = validateGeneratedProgram(program);
  if (!checked.valid) return { ok: false as const, error: "invalid_program_payload" };
  program = checked.value;
  const userProfileId = scope?.userProfileId ?? (await getOrCreateDemoProfile()).id;
  const db = scope?.db ?? prisma;

  const uniqueSlugs = [...new Set(program.days.flatMap((d) => d.exercises.map((e) => e.exerciseSlug)))];
  const exercises = await db.exercise.findMany({
    where: { slug: { in: uniqueSlugs }, isActive: true },
    select: { id: true, slug: true },
  });
  const slugToId = new Map(exercises.map((item) => [item.slug, item.id]));
  const missing = uniqueSlugs.filter((slug) => !slugToId.has(slug));
  if (missing.length > 0) {
    console.error("[AI_PROGRAM] Exercices introuvables au save", missing.join(", "));
    return { ok: false as const, error: "unknown_exercises", missing };
  }

  const created = await db.program.create({
    data: {
      userProfileId,
      name: program.programName,
      goal: toProgramGoal(program.goal),
      level: scope?.level ?? "INTERMEDIATE",
      sessionsPerWeek: program.days.length,
      description: program.notes,
      status: "DRAFT",
      days: {
        create: program.days.map((day, index) => ({
          dayIndex: index + 1,
          title: day.title || program.programName,
          focus: day.notes,
          exercises: {
            create: day.exercises.map((ex, idx) => ({
              exerciseId: slugToId.get(ex.exerciseSlug)!,
              orderIndex: idx + 1,
              sets: ex.sets,
              ...parseGeneratedReps(ex.reps),
              repsText: ex.reps,
              restSeconds: ex.restSeconds,
              tempo: ex.tempo ?? null,
            })),
          },
        })),
      },
    },
    select: { id: true, name: true },
  });

  console.info("[AI_PROGRAM] Sauvegarde succes", created.id);
  return { ok: true as const, programId: created.id, programName: created.name };
}

function parseGeneratedReps(reps: string) {
  const match = reps.match(/^(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/);
  if (!match) return {};
  const repsMin = Number(match[1]);
  const repsMax = Number(match[2] ?? match[1]);
  return repsMin >= 1 && repsMax >= repsMin && repsMax <= 100 ? { repsMin, repsMax } : {};
}
