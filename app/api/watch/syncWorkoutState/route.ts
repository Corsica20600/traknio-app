import { NextResponse } from "next/server";
import { syncWorkoutState } from "@/src/server/workout-sync";
import { requireWatchAccess } from "@/src/server/watch-auth";
import { logSyncMetric } from "@/src/server/sync-metrics";

export async function POST(request: Request) {
  const access = await requireWatchAccess(request);
  if (!access.ok) return access.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  if ((body.status != null && !["ACTIVE", "PAUSED", "COMPLETED"].includes(body.status)) ||
      (body.restStatus != null && !["IDLE", "ACTIVE", "PAUSED"].includes(body.restStatus)) ||
      [body.currentExerciseIndex, body.currentSetIndex, body.restRemaining].some(value => value != null && !Number.isFinite(Number(value)))) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const workoutSessionId = String(body.workoutSessionId ?? "").trim();
  if (!workoutSessionId) return NextResponse.json({ error: "missing_workout_session_id" }, { status: 400 });
  const actionId = request.headers.get("x-traknio-action-id")?.trim() || undefined;
  logSyncMetric({ event: "API_RECEIVED", sessionId: workoutSessionId, actionId, action: "sync-workout-state", origin: "PHONE", transport: "HTTPS_PHONE" });

  const state = await syncWorkoutState({
    workoutSessionId,
    compact: body.compact === true,
    currentExerciseIndex: body.currentExerciseIndex == null ? undefined : Number(body.currentExerciseIndex),
    currentSetIndex: body.currentSetIndex == null ? undefined : Number(body.currentSetIndex),
    restRemaining: body.restRemaining == null ? undefined : Number(body.restRemaining),
    restStatus: body.restStatus,
    status: body.status,
    lastSyncAt: body.lastSyncAt,
    userProfileId: access.userProfileId,
  });

  if (!state) return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  logSyncMetric({ event: "API_CONFIRMED", sessionId: workoutSessionId, actionId, action: "sync-workout-state", origin: "PHONE", transport: "HTTPS_PHONE", status: 200 });
  return NextResponse.json({ state });
}
