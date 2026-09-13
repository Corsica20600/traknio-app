import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getLatestWeightByExercise, validateWatchSet, getWatchBootstrapPayload } from "@/src/server/watch-mobile";
import { watchImagePath } from "./watch-image";

test("watch bootstrap reads one latest weight only for the exercises it needs", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    $queryRaw: async (query: { strings: readonly string[]; values: unknown[] }) => {
      calls.push({ sql: query.strings.join("?"), values: query.values });
      return [
        { exerciseId: "bench", actualWeightKg: 82.5 },
        { exerciseId: "row", actualWeightKg: 45 },
      ];
    },
  } as never;

  const weights = await getLatestWeightByExercise("profile", ["bench", "row", "bench"], db);

  assert.deepEqual([...weights.entries()], [["bench", 82.5], ["row", 45]]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /DISTINCT ON/);
  assert.doesNotMatch(calls[0].sql, /LIMIT|take:\s*500/i);
  assert.deepEqual(calls[0].values, ["profile", "bench", "row"]);
});

test("watch raster selection ignores unsupported and unsafe image URLs", () => {
  assert.equal(watchImagePath("/image.svg", "/media/exercise.jpg"), "/media/exercise.jpg");
  for (const url of ["//host/image.png", "http://host/image.png", "data:image/png;base64,abc", "https://user:pass@host/image.png", "a".repeat(2049)]) {
    assert.equal(watchImagePath(url), null);
  }
});

test("bootstrap reads only the owned selected day and carries a raster URL without extra media queries", async () => {
  let dayReads = 0;
  const db = {
    workoutSession: { findUnique: async () => ({ id: "session", userProfileId: "owner", programId: "program", programDayId: "day", notes: null,
      sets: [], watchSession: null, title: "Push", status: "IN_PROGRESS", updatedAt: new Date("2026-09-13T10:00:00Z") }) },
    programDay: { findFirst: async (query: { where: unknown }) => {
      dayReads++;
      assert.deepEqual(query.where, { programId: "program", program: { userProfileId: "owner" }, id: "day" });
      return { exercises: [{ id: "pe", exerciseId: "bench", sets: 3, repsMin: 8, repsMax: 8, repsText: "100 kg", restSeconds: 90,
        exercise: { id: "bench", slug: "test-bench", name: "Bench", nameFr: "Développé", equipment: [], equipmentFr: [], fallbackThumbnailPath: "/thumb.jpg", fallbackImagePath: "/image.jpg" } }] };
    } },
    $queryRaw: async () => [],
  } as never;
  const payload = await getWatchBootstrapPayload("session", "owner", db);
  assert.equal(dayReads, 1);
  assert.equal(payload?.exercises[0].imageUrl, "/thumb.jpg");
  assert.equal(payload?.totalExercises, 1);
});

test("legacy watch routes cannot receive a successful access result without an owner", () => {
  const source = readFileSync(resolve(process.cwd(), "src/server/watch-auth.ts"), "utf8");
  assert.match(source, /userProfileId: string/);
  assert.doesNotMatch(source, /return \{ ok: true, mode: "session", profileEmail: email \}/);
  assert.match(source, /watch_profile_required/);
});

for (const weight of [42.5, undefined]) {
  test(`validation reads private weight history only when needed (weight=${weight})`, async () => {
    const reads: Array<{ where: { workoutSession?: { userProfileId: string } } }> = [];
    const stop = new Error("stop_before_write");
    const db = {
      workoutSession: { findUnique: async () => ({
        id: "session", userProfileId: "owner", programId: null, programDayId: null, notes: null,
        watchSession: { currentExerciseIndex: 0, currentSetIndex: 1 },
        sets: [{ exerciseId: "bench", exercise: { id: "bench", slug: "bench", name: "Bench", nameFr: null, equipment: [], equipmentFr: [] } }],
      }) },
      $queryRaw: async () => [],
      workoutSet: {
        findFirst: async (args: typeof reads[number]) => { reads.push(args); return null; },
        create: async () => { throw stop; },
      },
    } as never;
    await assert.rejects(validateWatchSet({ sessionId: "session", userProfileId: "owner", actualReps: 8, weight }, db), error => error === stop);
    assert.equal(reads.length, weight == null ? 3 : 1);
    if (weight == null) assert.deepEqual(reads[2].where.workoutSession, { userProfileId: "owner" });
  });
}

test("an exercise outside the current session cannot affect watch bootstrap weights", async () => {
  const db = {
    $queryRaw: async () => [{ exerciseId: "active", actualWeightKg: 40 }],
  } as never;

  const weights = await getLatestWeightByExercise("profile", ["active"], db);

  assert.equal(weights.get("active"), 40);
  assert.equal(weights.has("outside"), false);
});

test("the targeted Wear actions reuse their ordered exercises for the final bootstrap", () => {
  const source = readFileSync(resolve(process.cwd(), "src/server/watch-mobile.ts"), "utf8");
  for (const expectedCall of [
    "getWatchBootstrapPayload(session.id, userProfileId, db, ordered)",
    "getWatchBootstrapPayload(session.id, input.userProfileId, db, ordered)",
    "getWatchBootstrapPayload(state.sessionId, userProfileId, db, context.ordered)",
  ]) {
    assert.ok(source.includes(expectedCall), `missing shared bootstrap input: ${expectedCall}`);
  }
});
