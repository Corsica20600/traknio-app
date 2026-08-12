import test from "node:test";
import assert from "node:assert/strict";
import { getSharedRestRemaining, normalizeSharedRest } from "@/src/server/shared-rest-timer";

test("active shared rest counts down from its server update", () => {
  const updatedAt = new Date("2026-08-12T10:00:00.000Z");
  assert.equal(getSharedRestRemaining({ status: "ACTIVE", remainingSeconds: 90, updatedAt }, new Date("2026-08-12T10:00:15.000Z")), 75);
});

test("paused shared rest keeps the exact remaining duration", () => {
  const updatedAt = new Date("2026-08-12T10:00:00.000Z");
  assert.equal(getSharedRestRemaining({ status: "PAUSED", remainingSeconds: 47, updatedAt }, new Date("2026-08-12T10:04:00.000Z")), 47);
});

test("a resumed shared rest starts from the preserved paused duration", () => {
  const resumedAt = new Date("2026-08-12T10:04:00.000Z");
  assert.equal(
    getSharedRestRemaining({ status: "ACTIVE", remainingSeconds: 47, updatedAt: resumedAt }, new Date("2026-08-12T10:04:12.000Z")),
    35,
  );
});

test("an expired active rest becomes idle", () => {
  const result = normalizeSharedRest({ status: "ACTIVE", remainingSeconds: 10, updatedAt: new Date("2026-08-12T10:00:00.000Z") }, new Date("2026-08-12T10:00:11.000Z"));
  assert.deepEqual(result.status, "IDLE");
  assert.equal(result.remainingSeconds, 0);
});
