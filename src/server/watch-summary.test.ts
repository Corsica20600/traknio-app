import test from "node:test";
import assert from "node:assert/strict";
import { calculateCompletedWatchSessionStats } from "@/src/server/watch-mobile";

test("the final watch summary counts distinct exercises and completed sets", () => {
  const stats = calculateCompletedWatchSessionStats([
    { exerciseId: "bench", actualReps: 10, actualWeightKg: 80 },
    { exerciseId: "bench", actualReps: 8, actualWeightKg: 80 },
    { exerciseId: "row", actualReps: 12, actualWeightKg: 36 },
  ]);

  assert.deepEqual(stats, { volumeKg: 1_872, exercises: 2, sets: 3 });
});

test("the final watch summary does not create volume for bodyweight sets", () => {
  const stats = calculateCompletedWatchSessionStats([
    { exerciseId: "push-up", actualReps: 20, actualWeightKg: null },
    { exerciseId: "squat", actualReps: 12, actualWeightKg: 0 },
  ]);

  assert.deepEqual(stats, { volumeKg: 0, exercises: 2, sets: 2 });
});
