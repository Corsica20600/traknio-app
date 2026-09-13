import { NextResponse } from "next/server";
import { getWatchBootstrapPayload, getWatchPayload } from "@/src/server/watch-mobile";
import { requireWatchAccess } from "@/src/server/watch-auth";
import { logSyncMetric, withSyncMetricContext } from "@/src/server/sync-metrics";

export async function GET(request: Request) {
  const access = await requireWatchAccess(request);
  if (!access.ok) return access.response;

  const { searchParams } = new URL(request.url);
  const sessionId = String(searchParams.get("sessionId") ?? "").trim();
  const bootstrap = searchParams.get("bootstrap") === "1";
  const origin = request.headers.get("x-watch-device-token") ? "WATCH" : "PHONE";
  const transport = origin === "WATCH"
    ? "HTTPS_WATCH_DIRECT"
    : (request.headers.get("x-traknio-sync-transport") === "PHONE_RELAY" ? "PHONE_RELAY" : "UNKNOWN");
  return withSyncMetricContext({ sessionId: sessionId || undefined, origin, transport }, async () => {
  logSyncMetric({ event: "POLL", bootstrap });
  const payload = await (bootstrap ? getWatchBootstrapPayload : getWatchPayload)(
    sessionId || undefined,
    access.userProfileId,
  );
  if (!payload) return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  logSyncMetric({ event: "API_CONFIRMED", status: 200, bootstrap });
  return NextResponse.json(
    { payload },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
  });
}
