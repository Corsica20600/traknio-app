import { randomUUID } from "crypto";
import { BlobNotFoundError, del, get, put } from "@vercel/blob";
import { getVercelOidcToken } from "@vercel/oidc";
import { prisma } from "@/src/lib/prisma";
import type { ProgressPhotoItem } from "@/src/types/body-evolution";

export const PROGRESS_PHOTO_VIEWS = ["FRONT", "SIDE", "BACK", "FREE"] as const;
export type ProgressPhotoViewValue = (typeof PROGRESS_PHOTO_VIEWS)[number];

// Browser-side preparation keeps the request below Vercel Functions' payload limit.
const MAX_SERVER_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_IMAGE_EDGE = 1600;
const isProgressPhotoDebug = process.env.NODE_ENV !== "production";

type ProfileRef = { id: string };
type BlobOidcOptions = { storeId: string; oidcToken: string };

function logProgressPhotoPipeline(stage: string, details: Record<string, unknown> = {}) {
  if (!isProgressPhotoDebug) return;
  console.info("PROGRESS_PHOTO_PIPELINE", { stage, ...details });
}

function getProgressPhotoFailureReason(error: unknown) {
  if (!(error instanceof Error)) return "unknown";
  if ([
    "BLOB_STORE_NOT_CONFIGURED",
    "BLOB_OIDC_NOT_CONFIGURED",
    "INVALID_PHOTO_VIEW",
    "INVALID_PHOTO_SIZE",
    "INVALID_PHOTO_MIME",
    "INVALID_PHOTO_SIGNATURE",
    "INVALID_PHOTO_DATE",
  ].includes(error.message)) {
    return error.message;
  }

  // Keep production diagnostics useful without recording provider messages or file metadata.
  if (error.name.startsWith("Blob")) return error.name;
  if (error.name === "PrismaClientKnownRequestError") return "PRISMA_KNOWN_REQUEST_ERROR";
  if (error.name === "PrismaClientUnknownRequestError") return "PRISMA_UNKNOWN_REQUEST_ERROR";
  return error.name || "unexpected";
}

function getSafeProgressPhotoFailureDetails(error: unknown) {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : null;
  const rawMessage = error instanceof Error ? error.message : "";
  // Provider messages can contain URLs or authorization details. Keep only a compact diagnostic.
  const message = rawMessage
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\b(?:token|authorization|bearer)\b[^\s,;]*/gi, "[redacted]")
    .slice(0, 240);

  return {
    reason: getProgressPhotoFailureReason(error),
    errorCode: typeof record?.code === "string" ? record.code.slice(0, 80) : null,
    statusCode: typeof record?.statusCode === "number"
      ? record.statusCode
      : typeof record?.status === "number"
        ? record.status
        : null,
    message: message || null,
  };
}

async function getPrivateBlobOidcOptions(): Promise<BlobOidcOptions> {
  const storeId = process.env.BLOB_STORE_ID?.trim();
  if (!storeId) throw new Error("BLOB_STORE_NOT_CONFIGURED");

  try {
    // Vercel provides this short-lived token per Function request, or via `vercel env pull` locally.
    return { storeId, oidcToken: await getVercelOidcToken() };
  } catch {
    throw new Error("BLOB_OIDC_NOT_CONFIGURED");
  }
}

async function deleteBlobIfPresent(blobPath: string, oidc: BlobOidcOptions) {
  try {
    await del(blobPath, oidc);
  } catch (error) {
    if (error instanceof BlobNotFoundError) return;
    throw error;
  }
}

function hasBytes(value: Buffer, signature: number[]) {
  return signature.every((byte, index) => value[index] === byte);
}

export function detectProgressPhotoMimeType(buffer: Buffer) {
  if (hasBytes(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg" as const;
  if (hasBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png" as const;
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp" as const;
  }
  return null;
}

function parseRecordedAt(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("INVALID_PHOTO_DATE");
  const recordedAt = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(recordedAt.getTime())) throw new Error("INVALID_PHOTO_DATE");
  return recordedAt;
}

function toProgressPhotoItem(photo: {
  id: string;
  recordedAt: Date;
  view: ProgressPhotoViewValue;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
}): ProgressPhotoItem {
  return {
    id: photo.id,
    recordedAt: photo.recordedAt.toISOString(),
    view: photo.view,
    mimeType: photo.mimeType,
    byteSize: photo.byteSize,
    width: photo.width,
    height: photo.height,
    imageUrl: `/api/evolution/photos/${encodeURIComponent(photo.id)}/content`,
  };
}

export function serializeProgressPhotos(photos: Array<{
  id: string;
  recordedAt: Date;
  view: ProgressPhotoViewValue;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
}>): ProgressPhotoItem[] {
  return photos.map(toProgressPhotoItem);
}

export async function createProgressPhoto(
  profile: ProfileRef,
  input: { file: File; recordedAt: string; view: string },
) {
  let stage = "validation";
  let oidc: BlobOidcOptions | null = null;
  let uploadedBlobPath: string | null = null;
  logProgressPhotoPipeline("server_validation_started", {
    fileNameLength: input.file.name.length,
    mimeType: input.file.type || "unknown",
    byteSize: input.file.size,
  });
  if (!PROGRESS_PHOTO_VIEWS.includes(input.view as ProgressPhotoViewValue)) throw new Error("INVALID_PHOTO_VIEW");
  if (!input.file.size || input.file.size > MAX_SERVER_UPLOAD_BYTES) throw new Error("INVALID_PHOTO_SIZE");
  if (!["image/jpeg", "image/png", "image/webp"].includes(input.file.type)) {
    throw new Error("INVALID_PHOTO_MIME");
  }

  const recordedAt = parseRecordedAt(input.recordedAt);
  try {
    stage = "read_source";
    const source = Buffer.from(await input.file.arrayBuffer());
    const detectedMimeType = detectProgressPhotoMimeType(source);
    if (!detectedMimeType || detectedMimeType !== input.file.type) throw new Error("INVALID_PHOTO_SIGNATURE");
    logProgressPhotoPipeline("server_signature_verified", { mimeType: detectedMimeType, byteSize: source.byteLength });

    stage = "optimize";
    // Do not load the native image processor for pages that only need photo metadata.
    // Vercel loads this module lazily on the upload route, where it is actually used.
    const { default: sharp } = await import("sharp");
    const optimized = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .rotate()
      .resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    logProgressPhotoPipeline("server_optimized", {
      byteSize: optimized.info.size,
      width: optimized.info.width ?? null,
      height: optimized.info.height ?? null,
    });

    stage = "blob_upload";
    oidc = await getPrivateBlobOidcOptions();
    // sharp can return a Buffer backed by SharedArrayBuffer, which undici rejects as a fetch body.
    const uploadBytes = new Uint8Array(optimized.data.byteLength);
    uploadBytes.set(optimized.data);
    const blob = await put(`progress-photos/${randomUUID()}.webp`, uploadBytes.buffer, {
      ...oidc,
      access: "private",
      addRandomSuffix: false,
      contentType: "image/webp",
      cacheControlMaxAge: 60,
      maximumSizeInBytes: MAX_SERVER_UPLOAD_BYTES,
    });
    const blobPath = blob.url;
    uploadedBlobPath = blobPath;
    logProgressPhotoPipeline("server_blob_uploaded", { byteSize: optimized.info.size });

    stage = "metadata_create";
    const photo = await prisma.progressPhoto.create({
      data: {
        userProfileId: profile.id,
        recordedAt,
        view: input.view as ProgressPhotoViewValue,
        blobPath,
        mimeType: "image/webp",
        byteSize: optimized.info.size,
        width: optimized.info.width ?? null,
        height: optimized.info.height ?? null,
      },
    });
    return toProgressPhotoItem(photo);
  } catch (error) {
    logProgressPhotoPipeline("server_pipeline_failed", { stage, code: error instanceof Error ? error.message : "unknown" });
    console.error("PROGRESS_PHOTO_PIPELINE_FAILED", {
      operation: "create",
      stage,
      ...getSafeProgressPhotoFailureDetails(error),
    });
    if (uploadedBlobPath && oidc) {
      try {
        await deleteBlobIfPresent(uploadedBlobPath, oidc);
      } catch {
        console.error("PROGRESS_PHOTO_ORPHAN_CLEANUP_FAILED", { operation: "create" });
      }
    }
    throw error;
  }
}

export async function getProgressPhotoContent(profileId: string, photoId: string) {
  const photo = await prisma.progressPhoto.findFirst({
    where: { id: photoId, userProfileId: profileId },
    select: { blobPath: true, mimeType: true },
  });
  if (!photo) return null;

  const blob = await get(photo.blobPath, { access: "private", ...(await getPrivateBlobOidcOptions()) });
  if (!blob || blob.statusCode !== 200) return null;
  return { stream: blob.stream, mimeType: photo.mimeType };
}

export async function deleteProgressPhoto(profileId: string, photoId: string) {
  const photo = await prisma.progressPhoto.findFirst({
    where: { id: photoId, userProfileId: profileId },
    select: { id: true, blobPath: true },
  });
  if (!photo) return false;

  await deleteBlobIfPresent(photo.blobPath, await getPrivateBlobOidcOptions());
  const deleted = await prisma.progressPhoto.deleteMany({ where: { id: photo.id, userProfileId: profileId } });
  if (deleted.count !== 1) {
    console.error("PROGRESS_PHOTO_METADATA_DELETE_FAILED", { operation: "delete" });
    throw new Error("PROGRESS_PHOTO_DELETE_FAILED");
  }
  return true;
}

export async function purgeProgressPhotoBlobs(profileId: string) {
  const photos = await prisma.progressPhoto.findMany({
    where: { userProfileId: profileId },
    select: { blobPath: true },
  });
  if (photos.length === 0) return;

  const oidc = await getPrivateBlobOidcOptions();
  const results = await Promise.allSettled(photos.map((photo) => deleteBlobIfPresent(photo.blobPath, oidc)));
  if (results.some((result) => result.status === "rejected")) {
    console.error("PROGRESS_PHOTO_ACCOUNT_PURGE_FAILED", { operation: "account_delete", count: photos.length });
    throw new Error("PROGRESS_PHOTO_PURGE_FAILED");
  }
}
