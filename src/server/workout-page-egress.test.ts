import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workspace = process.cwd();

test("returning to an active workout reconciles lightweight state without a Server Component refresh", () => {
  const source = readFileSync(resolve(workspace, "src/components/workout/guided-workout-client.tsx"), "utf8");
  const lifecycleBlock = source.slice(
    source.indexOf("const pullFreshState = () =>"),
    source.indexOf("const onVisibleAgain = () =>"),
  );

  assert.match(lifecycleBlock, /void pullWatchState\(\)/);
  assert.doesNotMatch(lifecycleBlock, /router\.refresh\(\)/);
});

test("active workout page fetches only its program day and targeted exercise weights", () => {
  const source = readFileSync(resolve(workspace, "src/server/fitness-queries.ts"), "utf8");
  const workoutPageBlock = source.slice(
    source.indexOf("export async function getWorkoutPageData"),
    source.indexOf("export async function getDashboardDataForDemoUser"),
  );

  assert.match(workoutPageBlock, /getLatestWeightByExerciseForWorkout/);
  assert.match(workoutPageBlock, /prisma\.programDay\.findFirst/);
  assert.match(workoutPageBlock, /if \(sessionExercises\.length === 0\)/);
  assert.doesNotMatch(workoutPageBlock, /take:\s*500/);
  assert.doesNotMatch(workoutPageBlock, /prisma\.program\.findFirst\([\s\S]*include:\s*\{[\s\S]*days:/);
});

test("starting a workout cannot create a parallel in-progress session", () => {
  const source = readFileSync(resolve(workspace, "src/server/fitness-actions.ts"), "utf8");
  const startBlock = source.slice(
    source.indexOf("export async function startWorkoutSessionAction"),
    source.indexOf("export async function logWorkoutSetAction"),
  );

  assert.match(startBlock, /status: "IN_PROGRESS"/);
  assert.match(startBlock, /if \(activeSession\) redirect\("\/workout"\)/);
});
