import test from "node:test";
import assert from "node:assert/strict";
import { startOrResumeWorkout, WorkoutStartError } from "./workout-start";
import { syncWorkoutState } from "./workout-sync";

test("compact sync performs one scoped read and one combined write without reloading sets", async () => {
  let reads = 0;
  let writes = 0;
  const before = { id: "watch", currentExerciseIndex: 0, currentSetIndex: 1, status: "ACTIVE", lastSyncAt: new Date(), restStatus: "IDLE", restRemainingSeconds: 0, restUpdatedAt: null };
  const db = { workoutSession: { findUnique: async (args: { where: unknown }) => {
    reads++;
    assert.deepEqual(args.where, { id: "session", userProfileId: "owner" });
    return { id: "session", watchSession: before };
  } }, watchSession: { update: async (args: { data: object }) => {
    writes++;
    return { ...before, ...args.data };
  } } } as never;
  const result = await syncWorkoutState({ workoutSessionId: "session", userProfileId: "owner", currentSetIndex: 2, restRemaining: 90, compact: true }, db);
  assert.equal(reads, 1);
  assert.equal(writes, 1);
  assert.equal(result?.deviceSession.currentSetIndex, 2);
  assert.equal(result?.deviceSession.restRemainingSeconds, 90);
  assert.equal(result?.deviceSession.restStatus, "ACTIVE");
  assert.equal("exercises" in result!, false);
});

function fixture(options: { active?: boolean; missing?: boolean; empty?: boolean } = {}) {
  const calls: Array<{ name: string; args: unknown }> = [];
  const tx = {
    $executeRaw: async (...args: unknown[]) => { calls.push({ name: "lock", args }); },
    workoutSession: {
      findFirst: async (args: unknown) => { calls.push({ name: "active", args }); return options.active ? { id: "existing" } : null; },
      create: async (args: unknown) => { calls.push({ name: "create", args }); return { id: "new" }; },
    },
    program: { findFirst: async (args: unknown) => {
      calls.push({ name: "program", args });
      return options.missing ? null : { id: "program", name: "Push", days: [{ id: "day", title: "Pectoraux", _count: { exercises: options.empty ? 0 : 3 } }] };
    } },
  };
  return { tx: tx as never, calls };
}
const selection = { userProfileId: "owner", programId: "program", programDayId: "day", requireProgramDay: true };

test("watch resumes the active session before reading or creating a program session", async () => {
  const { tx, calls } = fixture({ active: true });
  assert.deepEqual(await startOrResumeWorkout(tx, selection), { sessionId: "existing", resumed: true });
  assert.deepEqual(calls.map(c => c.name), ["lock", "active"]);
  assert.deepEqual(calls[1].args, { where: { userProfileId: "owner", status: "IN_PROGRESS" }, orderBy: { createdAt: "desc" }, select: { id: true } });
});
test("watch reads only the selected owned nonarchived day and creates both session records", async () => {
  const { tx, calls } = fixture();
  assert.deepEqual(await startOrResumeWorkout(tx, selection), { sessionId: "new", resumed: false });
  const query = calls.find(c => c.name === "program")!.args as { where: unknown; select: { days: { where: unknown; take: number } } };
  assert.deepEqual(query.where, { id: "program", userProfileId: "owner", status: { not: "ARCHIVED" } });
  assert.deepEqual(query.select.days.where, { id: "day" });
  assert.equal(query.select.days.take, 1);
  const created = calls.find(c => c.name === "create")!.args as { data: { title: string; watchSession: { create: { currentSetIndex: number } } } };
  assert.equal(created.data.title, "Pectoraux");
  assert.equal(created.data.watchSession.create.currentSetIndex, 1);
});
for (const options of [{ missing: true }, { empty: true }]) {
  test(`invalid program selection creates nothing: ${JSON.stringify(options)}`, async () => {
    const { tx, calls } = fixture(options);
    await assert.rejects(startOrResumeWorkout(tx, selection), WorkoutStartError);
    assert.equal(calls.some(c => c.name === "create"), false);
  });
}
test("a day outside the selected program is rejected", async () => {
  const { tx, calls } = fixture();
  await assert.rejects(startOrResumeWorkout(tx, { ...selection, programDayId: "foreign" }), /program_day_not_found/);
  assert.equal(calls.some(c => c.name === "create"), false);
});
