import { NextResponse } from "next/server";
import { hasFullAccess } from "@/src/lib/premium-access-rules";
import { getAuthenticatedUserProfile } from "@/src/server/fitness-queries";
import { hasTraknioAssistantAccess } from "@/src/server/assistant/assistant-access";
import { askTraknioAssistant } from "@/src/server/assistant/assistant-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const profile = await getAuthenticatedUserProfile().catch(() => null);
  if (!profile) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  if (!hasFullAccess(profile)) return NextResponse.json({ error: "premium_required" }, { status: 402 });
  if (!hasTraknioAssistantAccess(profile)) return NextResponse.json({ error: "assistant_unavailable" }, { status: 404 });

  const body = await request.json().catch(() => null) as { question?: unknown; routeContext?: unknown } | null;
  const result = await askTraknioAssistant(profile, body?.question, body?.routeContext);
  if (!result.ok) {
    const status = result.error === "invalid_question" ? 400 : result.error === "rate_limited" ? 429 : 503;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(
    { ok: true, type: result.type, answer: result.answer },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
