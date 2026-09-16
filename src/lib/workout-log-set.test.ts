import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { logPhoneWorkoutSet, WorkoutSetError, type PhoneWorkoutSetInput } from "../server/workout-log-set";

const input: PhoneWorkoutSetInput = {
  sessionId: "session", userProfileId: "owner", exerciseId: "bench", programExerciseId: "pe",
  setIndex: 1, currentExerciseIndex: 0, totalSetsForExercise: 3, targetReps: 10,
  actualReps: 10, actualWeightKg: 50, restSeconds: 90,
};

function fixture(status = "IN_PROGRESS") {
  const calls: string[] = [];
  let saved: Record<string, unknown> | null = null;
  let state: Record<string, unknown> | null = null;
  const tx = {
    $queryRaw: async () => { calls.push("lock"); return [{ id: "session", programId: "program", status }]; },
    workoutSet: {
      findFirst: async (args: { select?: unknown }) => {
        calls.push(args.select ? "history" : "set");
        return args.select ? { actualWeightKg: 45 } : saved;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => { calls.push("create"); saved = { ...data, id: "set", createdAt: new Date() }; return saved; },
      update: async () => { throw new Error("completed set must not be rewritten"); },
    },
    programExercise: {
      findFirst: async () => { calls.push("program"); return { id: "pe" }; },
      update: async () => { calls.push("target"); },
    },
    watchSession: {
      findUnique: async () => { calls.push("state"); return state; },
      upsert: async ({ create }: { create: Record<string, unknown> }) => { calls.push("advance"); state = create; return state; },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, calls, getState: () => state, setStatus: (value: string) => { status = value; } };
}

test("new phone series locks before reading, reuses program ID, and skips weight history", async () => {
  const db = fixture();
  const saved = await logPhoneWorkoutSet(db.tx, input);
  assert.equal(saved.completedSet.actualWeightKg, 50);
  assert.deepEqual(db.calls, ["lock", "set", "program", "target", "create", "advance"]);
});

test("a repeated series performs no writes and preserves the timer and position, even with another action payload", async () => {
  const db = fixture();
  const original = await logPhoneWorkoutSet(db.tx, input);
  const state = db.getState();
  db.calls.length = 0;
  const repeated = await logPhoneWorkoutSet(db.tx, { ...input, actualWeightKg: 80, restSeconds: 180 });
  assert.equal(repeated.replay, true);
  assert.deepEqual(repeated.completedSet, original.completedSet);
  assert.equal(repeated.watchState, state);
  assert.deepEqual(db.calls, ["lock", "set", "state"]);
});

test("retry after completion returns the original set but cannot insert another set", async () => {
  const db = fixture();
  await logPhoneWorkoutSet(db.tx, input);
  db.setStatus("COMPLETED");
  assert.equal((await logPhoneWorkoutSet(db.tx, input)).sessionStatus, "COMPLETED");
  await assert.rejects(logPhoneWorkoutSet(fixture("COMPLETED").tx, input), WorkoutSetError);
});

test("fallback weight reads stop as soon as a session weight exists", async () => {
  const db = fixture();
  const saved = await logPhoneWorkoutSet(db.tx, { ...input, actualWeightKg: null });
  assert.equal(saved.completedSet.actualWeightKg, 45);
  assert.equal(db.calls.filter(call => call === "history").length, 1);
});
