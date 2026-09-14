import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { moveDraftExercise, validateProgramDraft, type ProgramDraft } from "./program-draft";
import { persistProgramDraft, toProgramDraft } from "../server/program-editor";

const example = (): ProgramDraft => ({
  id: "new_program", revision: null, name: "Programme test", goal: "STRENGTH", level: "BEGINNER", status: "DRAFT",
  days: [{ id: "new_day", title: "Séance A", focus: null, exercises: [
    { id: "new_ex1", exerciseId: "squat", name: "Squat", image: "", sets: 3, repsMin: 8, repsMax: 12, repsText: "27 kg", restSeconds: 90, tempo: "3-0-1" },
    { id: "new_ex2", exerciseId: "press", name: "Développé", image: "", sets: 4, repsMin: 10, repsMax: 10, repsText: null, restSeconds: 60, tempo: null },
  ] }],
});

test("editor accepts ranges, optional weights and incomplete local drafts only on recovery", () => {
  const draft = example();
  assert.equal(validateProgramDraft(draft), true);
  draft.name = "";
  draft.days[0].exercises[0].sets = 0;
  assert.equal(validateProgramDraft(draft), false);
  assert.equal(validateProgramDraft(draft, true), true);
  draft.days[0].exercises[0].sets = Number.NaN;
  assert.equal(validateProgramDraft(draft, true), false);
});

test("editor rejects duplicate IDs, reversed ranges, excessive sizes and malformed objects", () => {
  const draft = example();
  draft.days[0].exercises[1].id = draft.days[0].exercises[0].id;
  assert.equal(validateProgramDraft(draft), false);
  const reversed = example(); reversed.days[0].exercises[0].repsMax = 2;
  assert.equal(validateProgramDraft(reversed), false);
  assert.equal(validateProgramDraft({ ...example(), days: Array(8).fill(example().days[0]) }), false);
  for (const value of [null, [], {}, { ...example(), days: [null] }]) assert.equal(validateProgramDraft(value), false);
});

test("reordering is local, immutable, bounded and retains exercise settings/IDs", () => {
  const day = example().days[0];
  const next = moveDraftExercise(day, 0, 1);
  assert.deepEqual(next.exercises.map(ex => ex.id), ["new_ex2", "new_ex1"]);
  assert.equal(next.exercises[1], day.exercises[0]);
  assert.equal(day.exercises[0].id, "new_ex1");
  assert.equal(moveDraftExercise(day, 0, -1), day);
});

const stored = () => ({
  id: "new_program", userProfileId: "owner", name: "Programme test", goal: "STRENGTH", level: "BEGINNER", status: "DRAFT", sessionsPerWeek: 1, description: null, createdAt: new Date(0), updatedAt: new Date(0),
  days: example().days.map((day, i) => ({ ...day, programId: "new_program", dayIndex: i + 1, createdAt: new Date(0), exercises: day.exercises.map((ex, j) => ({ ...ex, programDayId: day.id, orderIndex: j + 1, createdAt: new Date(0), updatedAt: new Date(0), exercise: { name: ex.name, nameFr: ex.name, fallbackThumbnailPath: ex.image } })) })),
}) as Parameters<typeof toProgramDraft>[0];

function database(existing: ReturnType<typeof stored> | null, running = false) {
  const writes: string[] = [];
  const tx = {
    $queryRaw: async () => [],
    program: { findUnique: async () => existing, findUniqueOrThrow: async () => stored(), create: async () => writes.push("program.create"), update: async () => writes.push("program.update"), updateMany: async () => writes.push("program.updateMany") },
    workoutSession: { findFirst: async () => running ? { id: "running" } : null },
    exercise: { findMany: async () => [{ id: "squat" }, { id: "press" }] },
    programDay: { updateMany: async () => writes.push("day.offset"), update: async () => writes.push("day.update"), create: async () => writes.push("day.create"), deleteMany: async () => writes.push("day.delete") },
    programExercise: { updateMany: async () => writes.push("exercise.offset"), update: async () => writes.push("exercise.update"), createMany: async () => writes.push("exercise.createMany"), deleteMany: async () => writes.push("exercise.delete") },
  } as unknown as Parameters<typeof persistProgramDraft>[0];
  return { tx, writes };
}

test("editor rejects foreign ownership, stale updates and active workouts before any writes", async () => {
  for (const kind of ["foreign", "stale", "running"] as const) {
    const record = stored(); const draft = toProgramDraft(record);
    if (kind === "foreign") record.userProfileId = "someone_else";
    if (kind === "stale") draft.revision = "stale";
    const db = database(record, kind === "running");
    await assert.rejects(persistProgramDraft(db.tx, "owner", draft, false));
    assert.deepEqual(db.writes, []);
  }
});

test("creation retry is idempotent and new exercises use one batch", async () => {
  const retry = database(stored());
  await persistProgramDraft(retry.tx, "owner", example(), false);
  assert.deepEqual(retry.writes, []);
  const fresh = database(null);
  await persistProgramDraft(fresh.tx, "owner", example(), false);
  assert.equal(fresh.writes.filter(value => value === "exercise.createMany").length, 1);
});

test("renaming a program does not rewrite unchanged days or exercises", async () => {
  const record = stored(); const draft = toProgramDraft(record); draft.name = "Nouveau nom";
  const db = database(record);
  await persistProgramDraft(db.tx, "owner", draft, false);
  assert.deepEqual(db.writes, ["program.update"]);
});

test("active programs cannot be saved empty and retained rows are reordered without recreation", async () => {
  const record = stored(); record.status = "ACTIVE";
  const empty = toProgramDraft(record); empty.days[0].exercises = [];
  const blocked = database(record);
  await assert.rejects(persistProgramDraft(blocked.tx, "owner", empty, false));
  assert.deepEqual(blocked.writes, []);
  const reordered = toProgramDraft(record); reordered.days[0] = moveDraftExercise(reordered.days[0], 0, 1);
  const db = database(record);
  await persistProgramDraft(db.tx, "owner", reordered, false);
  assert.ok(db.writes.indexOf("exercise.offset") < db.writes.indexOf("exercise.update"));
  assert.equal(db.writes.includes("exercise.createMany"), false);
});

test("AI preserves multiple days and validates their count; catalogue and account gates stay bounded", () => {
  const ai = readFileSync("src/server/ai-program-generator.ts", "utf8");
  assert.match(ai, /exactement \$\{input.daysPerWeek\}/);
  assert.match(ai, /valid.value.days.length !== input.daysPerWeek/);
  assert.match(ai, /sessionsPerWeek: program.days.length/);
  assert.doesNotMatch(ai, /days.slice\(0, 1\)/);
  assert.match(ai, /level: scope\?\.level/);
  const catalogue = readFileSync("app/api/programs/catalog/route.ts", "utf8");
  assert.match(catalogue, /hasPremiumAccess/);
  assert.match(catalogue, /take: 25/);
  const page = readFileSync("app/programs/page.tsx", "utf8");
  assert.doesNotMatch(page, /getExerciseOptionsForPrograms|getProgramsForDemoUser/);
});
