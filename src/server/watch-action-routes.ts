import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  adjustWatchRest,
  completeWatchSession,
  submitWatchSessionMetrics,
  nextWatchExercise,
  pauseWatchRest,
  previousWatchExercise,
  selectWatchExercise,
  resumeWatchRest,
  skipWatchRest,
  validateWatchSet,
  updateWatchLiveTarget,
} from "@/src/server/watch-mobile";
import { runIdempotentWatchAction, type WatchActionOperation, type WatchActionResult } from "@/src/server/watch-action-idempotency";

type WatchAccess = { userProfileId?: string };

function revalidateWatchPaths(operation: WatchActionOperation) {
  if (["validate-set", "update-live-target", "skip-rest", "adjust-rest", "pause-rest", "resume-rest", "select-exercise", "complete-session", "submit-session-metrics"].includes(operation)) {
    revalidatePath("/workout");
    revalidatePath("/dashboard");
    revalidatePath("/history");
  }
}

export async function executeWatchActionRoute(input: {
  request: Request;
  access: WatchAccess;
  operation: WatchActionOperation;
}) {
  const body = await input.request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  const sessionId = String(body.sessionId ?? "").trim();
  if (!sessionId) return NextResponse.json({ error: "missing_session_id" }, { status: 400 });

  const userProfileId = input.access.userProfileId;
  if (!userProfileId) return NextResponse.json({ error: "watch_profile_required" }, { status: 401 });
  const requestId = input.request.headers.get("x-traknio-action-id");
  const canonicalPayload = {
    sessionId,
    actualReps: body.actualReps == null ? null : Number(body.actualReps),
    weight: body.weight == null ? null : Number(body.weight),
    deltaSeconds: body.deltaSeconds == null ? null : Number(body.deltaSeconds),
    exerciseIndex: body.exerciseIndex == null ? null : Number(body.exerciseIndex),
    averageHeartRateBpm: body.averageHeartRateBpm == null ? null : Number(body.averageHeartRateBpm),
    sessionCaloriesKcal: body.sessionCaloriesKcal == null ? null : Number(body.sessionCaloriesKcal),
  };

  const result = await runIdempotentWatchAction({
    userProfileId,
    requestId,
    operation: input.operation,
    payload: canonicalPayload,
    execute: async (tx): Promise<WatchActionResult<unknown>> => {
      const payload = await (async () => {
        switch (input.operation) {
          case "validate-set":
            return validateWatchSet({
              sessionId,
              actualReps: canonicalPayload.actualReps,
              weight: canonicalPayload.weight,
              userProfileId,
            }, tx);
          case "update-live-target":
            return updateWatchLiveTarget({
              sessionId,
              targetReps: canonicalPayload.actualReps,
              weight: canonicalPayload.weight,
              userProfileId,
            }, tx);
          case "skip-rest": return skipWatchRest(sessionId, userProfileId, tx);
          case "adjust-rest": return adjustWatchRest(sessionId, Number.isFinite(canonicalPayload.deltaSeconds) ? canonicalPayload.deltaSeconds! : 0, userProfileId, tx);
          case "pause-rest": return pauseWatchRest(sessionId, userProfileId, tx);
          case "resume-rest": return resumeWatchRest(sessionId, userProfileId, tx);
          case "next-exercise": return nextWatchExercise(sessionId, userProfileId, tx);
          case "previous-exercise": return previousWatchExercise(sessionId, userProfileId, tx);
          case "select-exercise": return selectWatchExercise(sessionId, canonicalPayload.exerciseIndex ?? 0, userProfileId, tx);
          case "complete-session": return completeWatchSession(sessionId, userProfileId, tx);
          case "submit-session-metrics": return submitWatchSessionMetrics({
            sessionId,
            averageHeartRateBpm: canonicalPayload.averageHeartRateBpm,
            sessionCaloriesKcal: canonicalPayload.sessionCaloriesKcal,
            userProfileId,
          }, tx);
        }
      })();
      return payload
        ? { status: 200, body: { payload } }
        : { status: 404, body: { error: "session_not_found" } };
    },
  });

  if (result.status >= 200 && result.status <= 299) revalidateWatchPaths(input.operation);
  return NextResponse.json(result.body, { status: result.status });
}
