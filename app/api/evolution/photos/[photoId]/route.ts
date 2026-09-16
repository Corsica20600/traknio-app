import { NextResponse } from "next/server";
import { hasFullAccess } from "@/src/lib/premium-access-rules";
import { deleteProgressPhoto } from "@/src/server/progress-photos";
import { getAuthenticatedUserProfile } from "@/src/server/fitness-queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ photoId: string }> }) {
  const profile = await getAuthenticatedUserProfile().catch(() => null);
  if (!profile) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  if (!hasFullAccess(profile)) return NextResponse.json({ error: "premium_required" }, { status: 402 });

  const { photoId } = await context.params;
  if (!photoId) return NextResponse.json({ ok: false, error: "invalid_photo" }, { status: 400 });

  try {
    const deleted = await deleteProgressPhoto(profile.id, photoId);
    if (!deleted) return NextResponse.json({ ok: false, error: "photo_not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    console.error("PROGRESS_PHOTO_DELETE_FAILED", { operation: "delete" });
    return NextResponse.json({ ok: false, error: "photo_delete_failed" }, { status: 500 });
  }
}
