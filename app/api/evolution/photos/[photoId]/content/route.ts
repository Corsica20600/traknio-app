import { NextResponse } from "next/server";
import { hasFullAccess } from "@/src/lib/premium-access-rules";
import { getProgressPhotoContent } from "@/src/server/progress-photos";
import { getAuthenticatedUserProfile } from "@/src/server/fitness-queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ photoId: string }> }) {
  const profile = await getAuthenticatedUserProfile().catch(() => null);
  if (!profile) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  if (!hasFullAccess(profile)) return NextResponse.json({ error: "premium_required" }, { status: 402 });

  const { photoId } = await context.params;
  if (!photoId) return NextResponse.json({ error: "photo_not_found" }, { status: 404 });

  try {
    const content = await getProgressPhotoContent(profile.id, photoId);
    if (!content) return NextResponse.json({ error: "photo_not_found" }, { status: 404 });
    return new Response(content.stream, {
      headers: {
        "Content-Type": content.mimeType,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    console.error("PROGRESS_PHOTO_READ_FAILED", { operation: "read" });
    return NextResponse.json({ error: "photo_read_failed" }, { status: 500 });
  }
}
