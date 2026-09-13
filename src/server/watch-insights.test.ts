import test from "node:test";
import assert from "node:assert/strict";
import { decodeHistoryCursor, getWatchHistory, getWatchStatistics } from "./watch-insights";
import { parseSessionNotesMeta, serializeSessionNotesMeta } from "./session-exercise-replacements";

test("history cursor rejects malformed, oversized and invalid dates", () => {
  assert.equal(decodeHistoryCursor(null), null);
  for (const value of ["broken", "a".repeat(513), Buffer.from(JSON.stringify({ id: "a", createdAt: "yesterday" })).toString("base64url")]) {
    assert.throws(() => decodeHistoryCursor(value), /invalid_cursor/);
  }
});
test("history returns ten aggregates and a stable cursor; query is owner-scoped and bounded", async () => {
  const rows = Array.from({ length: 11 }, (_, index) => ({ id: `session-${index}`, title: "Push", createdAt: new Date("2026-09-12T08:00:00Z"), endedAt: null, durationSeconds: null, volumeKg: 12.5, sets: 1, exercises: 1 }));
  const db = { $queryRaw: async (query: { strings: string[]; values: unknown[] }) => {
    assert.match(query.strings.join("?"), /LIMIT 11/);
    assert.deepEqual(query.values, ["owner"]);
    assert.match(query.strings.join("?"), /"isCompleted" = true/);
    return rows;
  } } as never;
  const result = await getWatchHistory("owner", null, db);
  assert.equal(result.history.length, 10);
  assert.equal(result.history[0].volumeKg, 13);
  assert.deepEqual(decodeHistoryCursor(result.nextCursor), { id: "session-9", createdAt: rows[9].createdAt });
});
test("weekly statistics return seven days, exclude previous sessions from totals, and compare volume", async () => {
  const db = { $queryRaw: async (query: { values: unknown[] }) => {
    assert.deepEqual(query.values, ["owner", new Date("2026-08-30T22:00:00Z"), new Date("2026-09-13T22:00:00Z")]);
    return [{ day: "2026-09-01", sessions: 2, volumeKg: 100 }, { day: "2026-09-08", sessions: 1, volumeKg: 125 }];
  } } as never;
  const { statistics } = await getWatchStatistics("owner", new Date("2026-09-13T12:00:00Z"), db);
  assert.equal(statistics.days.length, 7);
  assert.equal(statistics.days[0].day, "2026-09-07");
  assert.equal(statistics.days[1].sessions, 1);
  assert.equal(statistics.sessions, 1);
  assert.equal(statistics.volumeChangePercent, 25);
});
test("empty statistics do not invent progression", async () => {
  const { statistics } = await getWatchStatistics("owner", new Date("2026-09-13T12:00:00Z"), { $queryRaw: async () => [] } as never);
  assert.equal(statistics.sessions, 0);
  assert.equal(statistics.volumeChangePercent, null);
  assert.ok(statistics.days.every(day => day.sessions === 0));
});
test("feedback survives notes serialization alongside existing training metadata", () => {
  const feedback = { rating: 3, note: "Très bonne séance", submittedAt: "2026-09-13T12:00:00Z" };
  const original = parseSessionNotesMeta("Une ancienne note");
  const saved = serializeSessionNotesMeta({ ...original, watchFeedback: feedback });
  assert.deepEqual(parseSessionNotesMeta(saved), { text: "Une ancienne note", watchFeedback: feedback });
});
