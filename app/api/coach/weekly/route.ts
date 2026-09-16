import { NextResponse } from "next/server";
import { hasFullAccess } from "@/src/lib/premium-access-rules";
import { hasTraknioCoachAccess } from "@/src/server/coach/coach-access";
import {
  generateCurrentCoachWeeklyReport,
  getCurrentCoachWeeklyReport,
  saveCoachWeeklyFeedback,
} from "@/src/server/coach/coach-weekly-report";
import { getAuthenticatedUserProfile } from "@/src/server/fitness-queries";

export const dynamic = "force-dynamic";

async function getCoachAccess() {
  const profile = await getAuthenticatedUserProfile().catch(() => null);
  if (!profile) return { ok: false as const, response: NextResponse.json({ error: "auth_required" }, { status: 401 }) };
  if (!hasFullAccess(profile)) {
    return { ok: false as const, response: NextResponse.json({ error: "premium_required" }, { status: 402 }) };
  }
  if (!hasTraknioCoachAccess(profile)) {
    return { ok: false as const, response: NextResponse.json({ error: "coach_unavailable" }, { status: 404 }) };
  }
  return { ok: true as const, profile };
}

export async function GET() {
  const access = await getCoachAccess();
  if (!access.ok) return access.response;

  const { report, period } = await getCurrentCoachWeeklyReport(access.profile);
  return NextResponse.json(
    {
      ok: true,
      report,
      period: {
        key: period.key,
        start: period.start.toISOString(),
        end: period.end.toISOString(),
        nextAvailableAt: period.nextAvailableAt.toISOString(),
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function POST() {
  const access = await getCoachAccess();
  if (!access.ok) return access.response;

  const result = await generateCurrentCoachWeeklyReport(access.profile);
  const status = result.report.status === "PENDING" ? 202 : result.report.status === "FAILED" ? 502 : 200;
  return NextResponse.json({ ok: result.report.status === "COMPLETED", created: result.created, report: result.report }, { status });
}

export async function PATCH(request: Request) {
  const access = await getCoachAccess();
  if (!access.ok) return access.response;

  const body = await request.json().catch(() => null) as { feedback?: unknown; reportId?: unknown } | null;
  const feedback = body?.feedback;
  const reportId = typeof body?.reportId === "string" ? body.reportId.trim() : undefined;
  if (feedback !== "USEFUL" && feedback !== "NOT_USEFUL") {
    return NextResponse.json({ ok: false, error: "invalid_feedback" }, { status: 400 });
  }

  const report = await saveCoachWeeklyFeedback(access.profile, feedback, reportId || undefined);
  if (!report) return NextResponse.json({ ok: false, error: "coach_report_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, report });
}
