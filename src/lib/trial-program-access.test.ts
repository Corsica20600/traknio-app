import test from "node:test";
import assert from "node:assert/strict";
import { accessibleProgramWhere, assertProgramAccess, TrialProgramAccessError } from "../server/trial-program-access";

const now = Date.now();
const profile = { id: "owner", email: null, subscriptionStatus: "FREE", subscriptionCurrentPeriodEnd: null, trialStartedAt: new Date(now - 1000), trialEndsAt: new Date(now + 60000) };
function fixture(selected: string | null) {
  return { program: { findFirst: async (args: { where: unknown; orderBy: unknown }) => {
    assert.deepEqual(args.where, { userProfileId: "owner" });
    assert.deepEqual(args.orderBy, [{ createdAt: "asc" }, { id: "asc" }]);
    return selected ? { id: selected } : null;
  } } } as unknown as Parameters<typeof assertProgramAccess>[0];
}
test("trial creates its first program, edits or retries it, and rejects a second", async () => {
  await assertProgramAccess(fixture(null), profile, "new", true);
  await assertProgramAccess(fixture("first"), profile, "first");
  await assertProgramAccess(fixture("first"), profile, "first", true);
  await assert.rejects(assertProgramAccess(fixture("first"), profile, "second", true), TrialProgramAccessError);
  await assert.rejects(assertProgramAccess(fixture("first"), profile, "second"), TrialProgramAccessError);
});
test("trial program listing fails closed when no program exists", async () => {
  assert.deepEqual(await accessibleProgramWhere(fixture(null), profile), { userProfileId: "owner", id: { in: [] } });
  assert.deepEqual(await accessibleProgramWhere(fixture("first"), profile), { userProfileId: "owner", id: { in: ["first"] } });
});
test("paid accounts can create more programs; expired accounts cannot save", async () => {
  await assertProgramAccess(fixture("first"), { ...profile, subscriptionStatus: "ACTIVE", subscriptionCurrentPeriodEnd: new Date(now + 60000) }, "second", true);
  await assert.rejects(assertProgramAccess(fixture("first"), { ...profile, trialEndsAt: new Date(now - 1) }, "first"), /expiré/);
});
