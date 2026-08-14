import assert from "node:assert/strict";
import test from "node:test";
import { parseOnboardingState } from "@/src/lib/onboarding";

test("keeps only recognised completed walkthrough steps", () => {
  assert.deepEqual(
    parseOnboardingState({ initialCompleted: true, reorderSeen: true, unknown: true, programDaySeen: false }),
    { initialCompleted: true, reorderSeen: true },
  );
});

test("accepts empty, nullable and malformed legacy onboarding state", () => {
  assert.deepEqual(parseOnboardingState(null), {});
  assert.deepEqual(parseOnboardingState(["programCreateSeen"]), {});
  assert.deepEqual(parseOnboardingState("invalid"), {});
});
