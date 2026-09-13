import { NextResponse } from "next/server";
import { requireWatchAccess } from "@/src/server/watch-auth";
import { getWatchStatistics } from "@/src/server/watch-insights";

export async function GET(request: Request) {
  const access = await requireWatchAccess(request);
  if (!access.ok) return access.response;
  if (!access.userProfileId) return NextResponse.json({ error: "watch_profile_required" }, { status: 401 });
  return NextResponse.json({ payload: await getWatchStatistics(access.userProfileId) }, { headers: { "Cache-Control": "no-store" } });
}
