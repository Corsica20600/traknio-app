import { NextResponse } from "next/server";
import { hasFullAccess } from "@/src/lib/premium-access-rules";
import { createProgressPhoto } from "@/src/server/progress-photos";
import { getAuthenticatedUserProfile } from "@/src/server/fitness-queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const isProgressPhotoDebug = process.env.NODE_ENV !== "production";

function logProgressPhotoUpload(stage: string, details: Record<string, unknown> = {}) {
  if (!isProgressPhotoDebug) return;
  console.info("PROGRESS_PHOTO_PIPELINE", { stage, ...details });
}

async function getAccess() {
  const profile = await getAuthenticatedUserProfile().catch(() => null);
  if (!profile) return { ok: false as const, response: NextResponse.json({ error: "auth_required" }, { status: 401 }) };
  if (!hasFullAccess(profile)) return { ok: false as const, response: NextResponse.json({ error: "premium_required" }, { status: 402 }) };
  return { ok: true as const, profile };
}

function toClientError(error: unknown) {
  if (!(error instanceof Error)) return "photo_upload_failed";
  if (error.message === "INVALID_PHOTO_SIZE") return "photo_too_large";
  if (["INVALID_PHOTO_MIME", "INVALID_PHOTO_SIGNATURE"].includes(error.message)) return "invalid_photo_type";
  if (error.message === "INVALID_PHOTO_DATE") return "invalid_photo_date";
  if (error.message === "INVALID_PHOTO_VIEW") return "invalid_photo_view";
  return "photo_upload_failed";
}

export async function POST(request: Request) {
  const access = await getAccess();
  if (!access.ok) return access.response;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const recordedAt = String(formData?.get("recordedAt") ?? "");
  const view = String(formData?.get("view") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "invalid_photo_file" }, { status: 400 });
  logProgressPhotoUpload("server_received", {
    fileNameLength: file.name.length,
    mimeType: file.type || "unknown",
    byteSize: file.size,
  });

  try {
    const photo = await createProgressPhoto(access.profile, { file, recordedAt, view });
    logProgressPhotoUpload("server_completed", { mimeType: photo.mimeType, byteSize: photo.byteSize });
    return NextResponse.json({ ok: true, photo }, { status: 201 });
  } catch (error) {
    const code = toClientError(error);
    logProgressPhotoUpload("server_failed", { code, sourceCode: error instanceof Error ? error.message : "unknown" });
    console.error("PROGRESS_PHOTO_CREATE_FAILED", { operation: "upload", code });
    return NextResponse.json({ ok: false, error: code }, { status: code === "photo_upload_failed" ? 500 : 400 });
  }
}
