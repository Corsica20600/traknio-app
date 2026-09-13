import { NextResponse } from "next/server";
import { goToNextExercise } from "@/src/server/workout-sync";
import { requireWatchAccess } from "@/src/server/watch-auth";

export async function POST(request: Request) {
  const access = await requireWatchAccess(request);
  if (!access.ok) return access.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  const workoutSessionId = String(body.workoutSessionId ?? "").trim();
  if (!workoutSessionId) return NextResponse.json({ error: "missing_workout_session_id" }, { status: 400 });

  const state = await goToNextExercise(workoutSessionId, access.userProfileId);
  if (!state) return NextResponse.json({ error: "session_not_found" }, { status: 404 });

  return NextResponse.json({ state });
}
