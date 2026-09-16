import test from "node:test";
import assert from "node:assert/strict";
import { googlePlayEntitlement } from "./google-play-entitlement";
import { hasFullAccess, hasPremiumAccess } from "./premium-access-rules";

const now = Date.parse("2026-09-16T12:00:00Z");
const item = { expiryTime: "2026-09-20T12:00:00Z", offerDetails: { offerId: "trial-7-days" } };
test("Google Play current phase overrides the original trial offer on paid renewals", () => {
  const paid = googlePlayEntitlement("SUBSCRIPTION_STATE_ACTIVE", { ...item, offerPhase: { basePrice: {} } }, undefined, now);
  assert.equal(paid.status, "ACTIVE");
  const trial = googlePlayEntitlement("SUBSCRIPTION_STATE_ACTIVE", { ...item, offerPhase: { freeTrial: {} } }, undefined, now);
  assert.equal(trial.status, "TRIALING");
});
test("canceling during trial preserves limited access until expiry", () => {
  const result = googlePlayEntitlement("SUBSCRIPTION_STATE_CANCELED", { ...item, offerPhase: { freeTrial: {} } }, undefined, now);
  assert.equal(result.active, true);
  assert.equal(result.cancelAtPeriodEnd, true);
  const profile = { email: null, subscriptionStatus: result.status, subscriptionCurrentPeriodEnd: result.currentPeriodEnd };
  assert.equal(hasPremiumAccess(profile, now), true);
  assert.equal(hasFullAccess(profile, now), false);
});
test("missing, invalid and expired entitlement dates never grant access", () => {
  for (const expiryTime of [undefined, "invalid", new Date(now).toISOString()]) {
    const result = googlePlayEntitlement("SUBSCRIPTION_STATE_ACTIVE", { expiryTime }, undefined, now);
    assert.equal(result.active, false);
    assert.equal(result.status, "FREE");
  }
});
test("older responses infer trial only within its original seven-day window", () => {
  assert.equal(googlePlayEntitlement("SUBSCRIPTION_STATE_ACTIVE", item, "2026-09-14T12:00:00Z", now).status, "TRIALING");
  assert.equal(googlePlayEntitlement("SUBSCRIPTION_STATE_ACTIVE", item, "2026-08-14T12:00:00Z", now).status, "ACTIVE");
});
test("paused and held subscriptions never authorize training", () => {
  for (const state of ["SUBSCRIPTION_STATE_ON_HOLD", "SUBSCRIPTION_STATE_PAUSED", "SUBSCRIPTION_STATE_PENDING", "SUBSCRIPTION_STATE_EXPIRED"]) {
    assert.equal(googlePlayEntitlement(state, item, undefined, now).active, false);
  }
});
