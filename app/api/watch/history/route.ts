import { NextResponse } from "next/server";
import { requireWatchAccess } from "@/src/server/watch-auth";
import { decodeHistoryCursor, getWatchHistory } from "@/src/server/watch-insights";

export async function GET(request: Request) {
  const access = await requireWatchAccess(request);
  if (!access.ok) return access.response;
  if (!access.userProfileId) return NextResponse.json({ error: "watch_profile_required" }, { status: 401 });
  let cursor;
  try { cursor = decodeHistoryCursor(new URL(request.url).searchParams.get("cursor")); }
  catch { return NextResponse.json({ error: "invalid_cursor" }, { status: 400 }); }
  return NextResponse.json({ payload: await getWatchHistory(access.userProfileId, cursor) }, { headers: { "Cache-Control": "no-store" } });
}
