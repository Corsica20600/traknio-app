import assert from "node:assert/strict";
import test from "node:test";
import { requiredMediaChecks, resolveMediaReadiness, TRAKNIO_CHARACTER_LOCK } from "./exercise-media-policy";

test("a media set cannot become READY without all character and movement checks", () => {
  const complete = Object.fromEntries(requiredMediaChecks.map((check) => [check, true]));
  assert.equal(resolveMediaReadiness("NONE", complete), "READY");
  assert.equal(resolveMediaReadiness("NONE", { ...complete, MOVEMENT_PATH_VALID: false }), "MEDIA_REVIEW_REQUIRED");
});

test("machine reference review always blocks automatic readiness", () => {
  const complete = Object.fromEntries(requiredMediaChecks.map((check) => [check, true]));
  assert.equal(resolveMediaReadiness("REFERENCE_REQUIRED", complete), "MEDIA_REVIEW_REQUIRED");
  assert.equal(resolveMediaReadiness("REFERENCE_REVIEW", complete), "MEDIA_REVIEW_REQUIRED");
  assert.equal(TRAKNIO_CHARACTER_LOCK, "TRAKNIO_MALE_V1");
});
