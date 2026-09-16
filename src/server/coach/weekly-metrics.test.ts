import assert from "node:assert/strict";
import test from "node:test";

import type { CoachWorkoutSession } from "./coach-types";
import { calculateCoachWeeklyMetrics } from "./weekly-metrics";
import { getRecoverySnapshot } from "./coach-weekly-report";

const period = {
  key: "2026-02-02",
  start: new Date("2026-01-05T00:00:00.000Z"),
  end: new Date("2026-02-02T00:00:00.000Z"),
  nextAvailableAt: new Date("2026-02-09T00:00:00.000Z"),
};

function completedSession(
  id: string,
  date: string,
  exerciseId: string,
  exerciseName: string,
  muscleGroup: string,
  reps: number,
  weight: number,
): CoachWorkoutSession {
  return {
    id,
    status: "COMPLETED",
    occurredAt: new Date(date),
    durationSeconds: 3_600,
    sets: [{ exerciseId, exerciseName, muscleGroup, actualReps: reps, actualWeightKg: weight, isCompleted: true }],
  };
}

test("calculates totals, muscle volume, progression, stagnation and performance drops", () => {
  const sessions: CoachWorkoutSession[] = [
    completedSession("bench-1", "2026-01-05T12:00:00.000Z", "bench", "Developpe couche", "Pectoraux", 10, 60),
    completedSession("bench-2", "2026-01-12T12:00:00.000Z", "bench", "Developpe couche", "Pectoraux", 10, 60),
    completedSession("bench-3", "2026-01-19T12:00:00.000Z", "bench", "Developpe couche", "Pectoraux", 10, 65),
    completedSession("squat-1", "2026-01-06T12:00:00.000Z", "squat", "Squat", "Jambes", 10, 100),
    completedSession("squat-2", "2026-01-13T12:00:00.000Z", "squat", "Squat", "Jambes", 10, 100),
    completedSession("squat-3", "2026-01-20T12:00:00.000Z", "squat", "Squat", "Jambes", 10, 100),
    completedSession("row-1", "2026-01-07T12:00:00.000Z", "row", "Row", "Dos", 10, 80),
    completedSession("row-2", "2026-01-14T12:00:00.000Z", "row", "Row", "Dos", 10, 80),
    completedSession("row-3", "2026-01-21T12:00:00.000Z", "row", "Row", "Dos", 8, 70),
    completedSession("outside", "2026-02-03T12:00:00.000Z", "outside", "Outside", "Autres", 10, 100),
    { id: "skipped", status: "SKIPPED", occurredAt: new Date("2026-01-22T12:00:00.000Z"), durationSeconds: null, sets: [] },
  ];

  const metrics = calculateCoachWeeklyMetrics({
    period,
    plannedSessions: 10,
    sessions,
    recovery: { sleepMinutes: 450, restingHeartRate: 58 },
    limitations: [{ label: "Epaule sensible", declaredAt: new Date("2026-01-15T08:00:00.000Z") }],
  });

  assert.deepEqual(metrics.sessions, { planned: 10, completed: 9, skipped: 1, missed: 1 });
  assert.deepEqual(metrics.totals, { volumeKg: 7010, repetitions: 88, completedSets: 9, durationSeconds: 32400 });
  assert.deepEqual(metrics.volumeByMuscleGroup, [
    { muscleGroup: "Jambes", volumeKg: 3000, completedSets: 3 },
    { muscleGroup: "Dos", volumeKg: 2160, completedSets: 3 },
    { muscleGroup: "Pectoraux", volumeKg: 1850, completedSets: 3 },
  ]);
  assert.deepEqual(metrics.progressingExerciseIds, ["bench"]);
  assert.deepEqual(metrics.stagnantExerciseIds, ["squat"]);
  assert.deepEqual(metrics.performanceDrops, [{ exerciseId: "row", exerciseName: "Row", loadDeltaKg: -10, repsDelta: -2 }]);
  assert.deepEqual(metrics.recovery, { sleepMinutes: 450, restingHeartRate: 58 });
  assert.equal(metrics.limitations[0].label, "Epaule sensible");
});

test("does not label an exercise as stagnant before three completed exposures", () => {
  const metrics = calculateCoachWeeklyMetrics({
    period,
    plannedSessions: null,
    sessions: [
      completedSession("press-1", "2026-01-05T12:00:00.000Z", "press", "Presse", "Epaules", 10, 30),
      completedSession("press-2", "2026-01-12T12:00:00.000Z", "press", "Presse", "Epaules", 10, 30),
    ],
  });

  assert.equal(metrics.exerciseProgress[0].trend, "INSUFFICIENT_DATA");
  assert.deepEqual(metrics.stagnantExerciseIds, []);
  assert.equal(metrics.sessions.missed, null);
});

test("progression uses the last recorded load, including zero, rather than the maximum", () => {
  const session = completedSession("bench", "2026-01-05T12:00:00Z", "bench", "Bench", "Pectoraux", 10, 80);
  session.sets.push({ ...session.sets[0], actualWeightKg: 50 }, { ...session.sets[0], actualWeightKg: null });
  const input = { period, plannedSessions: null, sessions: [session] };
  assert.equal(calculateCoachWeeklyMetrics(input).exerciseProgress[0].latestWeightKg, 50);
  session.sets.push({ ...session.sets[0], actualWeightKg: 0 });
  assert.equal(calculateCoachWeeklyMetrics(input).exerciseProgress[0].latestWeightKg, 0);
});

test("imported heart rate remains an average and is never labeled resting heart rate", () => {
  const measuredAt = new Date("2026-09-16T08:00:00Z");
  assert.deepEqual(getRecoverySnapshot([
    { value: 78.4, measuredAt, notes: JSON.stringify({ metric: "heart_rate" }) },
    { value: 450, measuredAt, notes: JSON.stringify({ metric: "sleep_minutes" }) },
  ]), { averageHeartRate: 78, sleepMinutes: 450 });
});
