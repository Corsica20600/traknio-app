import assert from "node:assert/strict";
import test from "node:test";
import { hashWatchActionPayload } from "@/src/server/watch-action-idempotency";

test("hashWatchActionPayload is stable when JSON key order changes", () => {
  const first = hashWatchActionPayload({ sessionId: "session-a", actualReps: 10, weight: 42.5 });
  const reordered = hashWatchActionPayload({ weight: 42.5, actualReps: 10, sessionId: "session-a" });

  assert.equal(first, reordered);
});

test("hashWatchActionPayload changes when a watch action payload changes", () => {
  const original = hashWatchActionPayload({ sessionId: "session-a", deltaSeconds: 15 });
  const changed = hashWatchActionPayload({ sessionId: "session-a", deltaSeconds: 30 });

  assert.notEqual(original, changed);
});
