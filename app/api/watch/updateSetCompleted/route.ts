import { NextResponse } from "next/server";
import { updateSetCompleted } from "@/src/server/workout-sync";
import { requireWatchAccess } from "@/src/server/watch-auth";

export async function POST(request: Request) {
  const access = await requireWatchAccess(request);
  if (!access.ok) return access.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  const workoutSessionId = String(body.workoutSessionId ?? "").trim();
  const exerciseId = String(body.exerciseId ?? "").trim();
  const setIndex = Number(body.setIndex ?? 0);

  if (!workoutSessionId || !exerciseId || !Number.isInteger(setIndex) || setIndex < 1) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const state = await updateSetCompleted({
    workoutSessionId,
    exerciseId,
    setIndex,
    targetReps: body.targetReps == null ? null : Number(body.targetReps),
    actualReps: body.actualReps == null ? null : Number(body.actualReps),
    actualWeightKg: body.actualWeightKg == null ? null : Number(body.actualWeightKg),
    restSeconds: body.restSeconds == null ? null : Number(body.restSeconds),
    userProfileId: access.userProfileId,
  });

  if (!state) return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  return NextResponse.json({ state });
}
