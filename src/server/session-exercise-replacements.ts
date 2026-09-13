import { prisma } from "@/src/lib/prisma";

export type SessionExerciseReplacement = {
  exerciseId: string;
  originalExerciseId?: string | null;
  replacedAt: string;
};

export type SessionLiveTarget = {
  exerciseId: string;
  setIndex: number;
  targetReps?: number | null;
  targetWeightKg?: number | null;
  updatedAt: string;
};

type SessionNotesMeta = {
  watchFeedback?: { rating: number; note: string; submittedAt: string };
  text?: string | null;
  exerciseReplacements?: Record<string, SessionExerciseReplacement>;
  liveTargets?: Record<string, SessionLiveTarget>;
};

export function parseSessionNotesMeta(notes?: string | null): SessionNotesMeta {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes) as SessionNotesMeta;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    return { text: notes };
  }
  return {};
}

export function getSessionExerciseReplacements(notes?: string | null) {
  return parseSessionNotesMeta(notes).exerciseReplacements ?? {};
}

export function getSessionLiveTargets(notes?: string | null) {
  return parseSessionNotesMeta(notes).liveTargets ?? {};
}

export function serializeSessionNotesMeta(meta: SessionNotesMeta) {
  const normalized: SessionNotesMeta = {};
  if (meta.watchFeedback) normalized.watchFeedback = meta.watchFeedback;
  if (meta.text?.trim()) normalized.text = meta.text.trim();
  if (meta.exerciseReplacements && Object.keys(meta.exerciseReplacements).length > 0) {
    normalized.exerciseReplacements = meta.exerciseReplacements;
  }
  if (meta.liveTargets && Object.keys(meta.liveTargets).length > 0) {
    normalized.liveTargets = meta.liveTargets;
  }
  return Object.keys(normalized).length > 0 ? JSON.stringify(normalized) : null;
}

export async function resolveReplacementExercises(notes?: string | null) {
  const replacements = getSessionExerciseReplacements(notes);
  const ids = [...new Set(Object.values(replacements).map((item) => item.exerciseId).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const exercises = await prisma.exercise.findMany({
    where: { id: { in: ids }, isActive: true },
    include: { media: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }] } },
  });

  return new Map(exercises.map((exercise) => [exercise.id, exercise]));
}
