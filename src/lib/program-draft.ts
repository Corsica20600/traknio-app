export const PROGRAM_GOALS = ["HYPERTROPHY", "STRENGTH", "ENDURANCE", "FAT_LOSS", "GENERAL_FITNESS"] as const;
export const PROGRAM_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export type DraftExercise = { id: string; exerciseId: string; name: string; image: string; sets: number; repsMin: number | null; repsMax: number | null; repsText: string | null; restSeconds: number; tempo: string | null };
export type DraftDay = { id: string; title: string; focus: string | null; exercises: DraftExercise[] };
export type ProgramDraft = { id: string; revision: string | null; name: string; goal: typeof PROGRAM_GOALS[number]; level: typeof PROGRAM_LEVELS[number]; status: "DRAFT" | "ACTIVE" | "ARCHIVED"; days: DraftDay[] };

export function validateProgramDraft(value: unknown, incomplete = false): value is ProgramDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as ProgramDraft;
  const text = (s: unknown, max: number) => typeof s === "string" && s.length <= max;
  const id = (s: unknown) => text(s, 100) && /^[a-zA-Z0-9_-]+$/.test(s as string);
  const integer = (n: unknown, min: number, max: number) => typeof n === "number" && Number.isFinite(n) && (incomplete || (Number.isInteger(n) && n >= min && n <= max));
  if (!id(d.id) || !(d.revision === null || text(d.revision, 64)) || !text(d.name, 100) || (!incomplete && !d.name.trim()) || !PROGRAM_GOALS.includes(d.goal) || !PROGRAM_LEVELS.includes(d.level) || !["DRAFT", "ACTIVE", "ARCHIVED"].includes(d.status)) return false;
  if (!Array.isArray(d.days) || !d.days.length || d.days.length > 7) return false;
  const ids = new Set<string>();
  for (const day of d.days) {
    if (!day || !id(day.id) || ids.has(day.id) || !text(day.title, 100) || (!incomplete && !day.title.trim()) || !(day.focus === null || text(day.focus, 5000)) || !Array.isArray(day.exercises) || day.exercises.length > 30) return false;
    ids.add(day.id);
    for (const ex of day.exercises) {
      if (!ex || !id(ex.id) || ids.has(ex.id) || !id(ex.exerciseId) || !text(ex.name, 500) || !text(ex.image, 2000) || !integer(ex.sets, 1, 12) || !(ex.repsMin === null || integer(ex.repsMin, 1, 100)) || !(ex.repsMax === null || integer(ex.repsMax, 1, 100)) || (!incomplete && ex.repsMin !== null && ex.repsMax !== null && ex.repsMax < ex.repsMin) || !integer(ex.restSeconds, 15, 600) || !(ex.repsText === null || text(ex.repsText, 500)) || !(ex.tempo === null || text(ex.tempo, 100))) return false;
      ids.add(ex.id);
    }
  }
  return true;
}

export function moveDraftExercise(day: DraftDay, from: number, to: number): DraftDay {
  if (from < 0 || to < 0 || from >= day.exercises.length || to >= day.exercises.length) return day;
  const exercises = [...day.exercises];
  exercises.splice(to, 0, exercises.splice(from, 1)[0]);
  return { ...day, exercises };
}
