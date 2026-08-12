import { NextResponse } from "next/server";
import { syncWorkoutState } from "@/src/server/workout-sync";
import { requireWatchAccess } from "@/src/server/watch-auth";

export async function POST(request: Request) {
  const access = await requireWatchAccess(request);
  if (!access.ok) return access.response;

  const body = await request.json();
  const workoutSessionId = String(body.workoutSessionId ?? "").trim();
  if (!workoutSessionId) return NextResponse.json({ error: "missing_workout_session_id" }, { status: 400 });

  const state = await syncWorkoutState({
    workoutSessionId,
    currentExerciseIndex: body.currentExerciseIndex == null ? undefined : Number(body.currentExerciseIndex),
    currentSetIndex: body.currentSetIndex == null ? undefined : Number(body.currentSetIndex),
    restRemaining: body.restRemaining == null ? undefined : Number(body.restRemaining),
    restStatus: body.restStatus,
    status: body.status,
    lastSyncAt: body.lastSyncAt,
    userProfileId: access.userProfileId,
  });

  if (!state) return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  return NextResponse.json({ state });
}
