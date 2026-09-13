import test from "node:test";
import assert from "node:assert/strict";
import { ACCOUNT_TRIAL_MS, accountTrialEnd, hasPremiumAccess, hasSubscriptionAccess } from "./premium-access-rules";
import { canAccessExistingWorkout, ownsAccessibleWorkout } from "../server/workout-access";
import { readFileSync } from "node:fs";

const start = new Date("2026-09-28T12:00:00Z");
const end = new Date(start.getTime() + ACCOUNT_TRIAL_MS);
const free = { id: "owner", email: "trial-test@example.invalid", subscriptionStatus: "FREE", subscriptionCurrentPeriodEnd: null };
const trial = { ...free, trialStartedAt: start, trialEndsAt: end };

test("trial is explicit and expires at exactly seven days across month boundaries", () => {
  assert.equal(hasPremiumAccess(free, start.getTime()), false);
  assert.equal(hasPremiumAccess(trial, start.getTime() - 1), false);
  assert.equal(hasPremiumAccess(trial, start.getTime()), true);
  assert.equal(hasPremiumAccess(trial, end.getTime() - 1), true);
  assert.equal(hasPremiumAccess(trial, end.getTime()), false);
  assert.equal(accountTrialEnd({ ...trial, trialEndsAt: new Date(end.getTime() + ACCOUNT_TRIAL_MS) }), end.getTime());
});
test("existing active subscribers retain access; billing trial must have an unexpired end", () => {
  assert.equal(hasSubscriptionAccess({ ...free, subscriptionStatus: "ACTIVE" }), true);
  assert.equal(hasSubscriptionAccess({ ...free, subscriptionStatus: "TRIALING" }), false);
  assert.equal(hasSubscriptionAccess({ ...free, subscriptionStatus: "TRIALING", subscriptionCurrentPeriodEnd: end }, end.getTime()), false);
  assert.equal(hasSubscriptionAccess({ ...free, subscriptionStatus: "CANCELED", subscriptionCurrentPeriodEnd: end }, start.getTime()), true);
});
test("post-trial continuation is scoped to owner, existing session and trial start window", async () => {
  let query: unknown;
  const db = { workoutSession: { findFirst: async (args: unknown) => { query = args; return { id: "session" }; } } } as unknown as Parameters<typeof canAccessExistingWorkout>[3];
  assert.equal(await canAccessExistingWorkout(trial, "session", false, db), true);
  assert.deepEqual(query, { where: { id: "session", userProfileId: "owner", status: "IN_PROGRESS", startedAt: { gte: start, lt: end } }, select: { id: true } });
  assert.equal(await canAccessExistingWorkout(free, "session", false, db), false);
  assert.equal(await ownsAccessibleWorkout(free, "", false, db), false);
});
test("subscribed users still need to own the requested workout", async () => {
  const db = { workoutSession: { findFirst: async () => null } } as unknown as Parameters<typeof ownsAccessibleWorkout>[3];
  assert.equal(await ownsAccessibleWorkout({ ...free, subscriptionStatus: "ACTIVE" }, "foreign", false, db), false);
});
test("AI quota uses an account lifetime trial bucket and locks before counting", () => {
  const source = readFileSync("src/server/ai-generation-limits.ts", "utf8");
  assert.match(source, /trial \? "ACCOUNT_TRIAL"/);
  assert.match(source, /trial \? 1 : AI_PROGRAM_GENERATION_MONTHLY_LIMIT/);
  assert.ok(source.indexOf("FOR UPDATE") < source.indexOf("aiProgramGeneration.count"));
  assert.match(source, /status: "RESERVED", createdAt:/);
  assert.match(source, /where: \{ id: usageId, status: "RESERVED" \}/);
});
test("screen wake is opt-in, session-scoped and released on cleanup", () => {
  const phone = readFileSync("src/components/workout/keep-screen-setting.tsx", "utf8");
  const wear = readFileSync("android-private/traknio-android/wear/src/main/java/com/traknio/watch/MainActivity.kt", "utf8");
  assert.match(phone, /enabled && active && document.visibilityState === "visible"/);
  assert.match(phone, /setScreenAwake\?\.\(false\)/);
  assert.match(wear, /activeSessionId != null && prefs.getBoolean\("keep_awake", false\)/);
});

test("AI preview can be restored and saving is serialized and owned", () => {
  const route = readFileSync("app/api/programs/save-ai/route.ts", "utf8");
  assert.match(route, /FOR UPDATE/);
  assert.match(route, /id: generationId, userProfileId: profile.id, status: "SUCCESS"/);
  assert.match(route, /if \(generation.savedProgramId\) return/);
  assert.match(route, /generation.generatedProgram as unknown as ValidGeneratedProgram/);
  const source = readFileSync("src/components/programs/ai-program-generator-panel.tsx", "utf8");
  assert.match(source, /data\?\.generation\?\.generatedProgram/);
  assert.doesNotMatch(source, /setResult\(null\)/);
});

test("trial completion permits phone reconciliation but never the start-session route", () => {
  const source = readFileSync("src/server/watch-auth.ts", "utf8");
  const allowed = source.slice(source.indexOf("const existingRoutes"), source.indexOf("if (!existingRoutes"));
  for (const route of ["syncWorkoutState", "current-session", "complete-session", "session-metrics", "validate-set"]) assert.ok(allowed.includes(`"${route}"`));
  assert.doesNotMatch(allowed, /"start-session"|"programs"/);
  assert.match(source, /body\?\.sessionId \?\? body\?\.workoutSessionId/);
});
