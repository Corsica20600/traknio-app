import { NextResponse } from "next/server";
import { requireWatchAccess } from "@/src/server/watch-auth";
import { runIdempotentWatchAction } from "@/src/server/watch-action-idempotency";
import { parseSessionNotesMeta, serializeSessionNotesMeta } from "@/src/server/session-exercise-replacements";

export async function POST(request: Request) {
  const access = await requireWatchAccess(request);
  if (!access.ok) return access.response;
  if (!access.userProfileId) return NextResponse.json({ error: "watch_profile_required" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const requestId = request.headers.get("x-traknio-action-id");
  if (!requestId || typeof body?.sessionId !== "string" || body.sessionId.length > 128 || !body.sessionId ||
      ![1, 2, 3].includes(body.rating) || typeof body.note !== "string" || body.note.length > 280) {
    return NextResponse.json({ error: "invalid_feedback" }, { status: 400 });
  }
  const result = await runIdempotentWatchAction({ userProfileId: access.userProfileId, sessionId: body.sessionId,
    requestId, operation: "session-feedback", payload: { sessionId: body.sessionId, rating: body.rating, note: body.note.trim() },
    execute: async tx => {
      await tx.$queryRaw`SELECT id FROM "WorkoutSession" WHERE id = ${body.sessionId} AND "userProfileId" = ${access.userProfileId} FOR UPDATE`;
      const session = await tx.workoutSession.findFirst({ where: { id: body.sessionId, userProfileId: access.userProfileId, status: "COMPLETED" }, select: { id: true, notes: true } });
      if (!session) return { status: 404, body: { error: "completed_session_not_found" } };
      await tx.workoutSession.update({ where: { id: session.id }, data: { notes: serializeSessionNotesMeta({
        ...parseSessionNotesMeta(session.notes), watchFeedback: { rating: body.rating, note: body.note.trim(), submittedAt: new Date().toISOString() },
      }) } });
      return { status: 200, body: { payload: { feedbackSaved: true } } };
    },
  });
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
