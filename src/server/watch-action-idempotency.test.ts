import assert from "node:assert/strict";
import test from "node:test";
import { hashWatchActionPayload } from "@/src/server/watch-action-idempotency";
import { logSyncMetric, withSyncMetricContext } from "@/src/server/sync-metrics";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

test("sync metrics are best effort and preserve their correlation context", async () => {
  const originalInfo = console.info;
  const entries: unknown[][] = [];
  console.info = (...args: unknown[]) => { entries.push(args); };
  try {
    await withSyncMetricContext(
      { sessionId: "session-a", actionId: "action-a", action: "validate-set", origin: "WATCH" },
      async () => logSyncMetric({ event: "API_RECEIVED", transport: "HTTPS_WATCH_DIRECT" }),
    );
  } finally {
    console.info = originalInfo;
  }

  assert.equal(entries.length, 1);
  assert.equal(entries[0][0], "TRAKNIO_SYNC_METRIC");
  assert.match(String(entries[0][1]), /"sessionId":"session-a"/);
  assert.match(String(entries[0][1]), /"actionId":"action-a"/);
});

test("sync metrics never throw when the log sink is unavailable", () => {
  const originalInfo = console.info;
  console.info = () => { throw new Error("log sink unavailable"); };
  try {
    assert.doesNotThrow(() => logSyncMetric({ event: "API_RECEIVED" }));
  } finally {
    console.info = originalInfo;
  }
});

test("sync metric helper has no database dependency and phone rest actions keep their existing idempotency behavior", () => {
  const metricSource = readFileSync(resolve(process.cwd(), "src/server/sync-metrics.ts"), "utf8");
  const workoutSource = readFileSync(resolve(process.cwd(), "src/components/workout/guided-workout-client.tsx"), "utf8");
  const skipBlock = workoutSource.slice(workoutSource.indexOf('fetch("/api/watch/skip-rest"'), workoutSource.indexOf("async function onAdjustRest"));
  const adjustBlock = workoutSource.slice(workoutSource.indexOf('fetch("/api/watch/adjust-rest"'), workoutSource.indexOf("const applyRestPayload"));

  assert.doesNotMatch(metricSource, /prisma|fetch\(/i);
  assert.doesNotMatch(skipBlock, /x-traknio-action-id/);
  assert.doesNotMatch(adjustBlock, /x-traknio-action-id/);
});
