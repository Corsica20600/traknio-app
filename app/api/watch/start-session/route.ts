import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireWatchAccess } from "@/src/server/watch-auth";
import { runIdempotentWatchAction } from "@/src/server/watch-action-idempotency";
import { getWatchBootstrapPayload } from "@/src/server/watch-mobile";
import { startOrResumeWorkout, WorkoutStartError } from "@/src/server/workout-start";

export async function POST(request: Request) {
  const access = await requireWatchAccess(request);
  if (!access.ok) return access.response;
  if (!access.userProfileId) return NextResponse.json({ error: "watch_profile_required" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const requestId = request.headers.get("x-traknio-action-id")?.trim();
  if (!requestId || typeof body?.programId !== "string" || typeof body?.programDayId !== "string" ||
      !body.programId.trim() || !body.programDayId.trim() || body.programId.length > 128 || body.programDayId.length > 128) {
    return NextResponse.json({ error: "invalid_start_request" }, { status: 400 });
  }
  const selection = { programId: body.programId.trim(), programDayId: body.programDayId.trim() };
  try {
    const result = await runIdempotentWatchAction<{ sessionId: string; resumed: boolean }>({
      userProfileId: access.userProfileId, requestId, operation: "start-session", payload: selection,
      execute: async tx => ({ status: 200, body: { payload: await startOrResumeWorkout(tx, {
        ...selection, userProfileId: access.userProfileId!, requireProgramDay: true,
      }) } }),
    });
    if (result.status !== 200 || !result.body.payload) return NextResponse.json(result.body, { status: result.status });
    const payload = await getWatchBootstrapPayload(result.body.payload.sessionId, access.userProfileId);
    if (!payload) return NextResponse.json({ error: "session_not_found" }, { status: 404 });
    revalidatePath("/workout");
    revalidatePath("/dashboard");
    return NextResponse.json({ payload }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof WorkoutStartError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
