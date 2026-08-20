import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getLatestWeightByExercise } from "@/src/server/watch-mobile";

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
