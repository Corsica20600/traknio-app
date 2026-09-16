import test from "node:test";
import assert from "node:assert/strict";
import { parseGooglePlayNotification } from "./google-play-notification";
import { syncGooglePlayPurchase, GooglePlaySyncError } from "../server/google-play-sync";
import { hashGooglePlayPurchaseToken, type VerifiedGooglePlaySubscription } from "../server/google-play-billing";

const envelope = (payload: unknown) => ({ message: { data: Buffer.from(JSON.stringify(payload)).toString("base64") } });
test("RTDN accepts subscription/refund and test messages only for the configured package", () => {
  for (const event of [{ subscriptionNotification: { purchaseToken: "token" } }, { voidedPurchaseNotification: { productType: 1, purchaseToken: "token" } }]) {
    assert.deepEqual(parseGooglePlayNotification(envelope({ packageName: "app", ...event }), "app"), { purchaseToken: "token" });
  }
  assert.deepEqual(parseGooglePlayNotification(envelope({ packageName: "app", testNotification: {} }), "app"), {});
  assert.equal(parseGooglePlayNotification(envelope({ packageName: "foreign", testNotification: {} }), "app"), null);
  assert.equal(parseGooglePlayNotification({ message: { data: "garbage" } }, "app"), null);
  assert.equal(parseGooglePlayNotification(envelope({ packageName: "app", subscriptionNotification: { purchaseToken: 7 } }), "app"), null);
});

const input = { userProfileId: "owner", packageName: "app", productId: "premium", purchaseToken: "token", existingOnly: true };
const result: VerifiedGooglePlaySubscription = { active: true, status: "ACTIVE", cancelAtPeriodEnd: false, productId: "premium", basePlanId: "monthly", offerId: "trial-7-days", orderId: "order", currentPeriodEnd: new Date("2026-10-16"), rawState: "SUBSCRIPTION_STATE_ACTIVE" };
function fixture(hash = hashGooglePlayPurchaseToken("token")) {
  const events: string[] = [];
  const updates: unknown[] = [];
  const tx = { $queryRaw: async () => { events.push("lock"); }, userProfile: {
    findUnique: async () => ({ googlePlayPurchaseTokenHash: hash }),
    update: async (args: unknown) => { events.push("update"); updates.push(args); },
  } };
  const db = { $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } as unknown as Parameters<typeof syncGooglePlayPurchase>[1];
  return { db, events, updates };
}
test("renewal refreshes entitlement under a lock and duplicate messages remain harmless", async () => {
  const { db, events, updates } = fixture();
  const verify = async () => { events.push("verify"); return result; };
  await syncGooglePlayPurchase(input, db, verify);
  await syncGooglePlayPurchase(input, db, verify);
  assert.deepEqual(events, ["lock", "verify", "update", "lock", "verify", "update"]);
  assert.deepEqual(updates[0], updates[1]);
  assert.ok(!JSON.stringify(updates).includes('"purchaseToken"'));
});
test("delayed messages for a replaced token cannot overwrite the new purchase", async () => {
  const { db, events } = fixture("replaced");
  assert.equal(await syncGooglePlayPurchase(input, db, async () => { throw new Error("must not verify"); }), null);
  assert.deepEqual(events, ["lock"]);
});
test("a wrong product or temporary verification failure never changes entitlement", async () => {
  const { db, updates } = fixture();
  await assert.rejects(syncGooglePlayPurchase(input, db, async () => ({ ...result, productId: "foreign" })), GooglePlaySyncError);
  await assert.rejects(syncGooglePlayPurchase(input, db, async () => { throw new Error("temporary"); }), /temporary/);
  assert.equal(updates.length, 0);
});
