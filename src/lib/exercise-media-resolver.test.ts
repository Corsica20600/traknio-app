import assert from "node:assert/strict";
import test from "node:test";
import { resolveExerciseMedia } from "./exercise-media-resolver";

const technical = (role: string, url: string, type: "IMAGE" | "THUMBNAIL" | "ANIMATION" = "IMAGE") => ({
  role, type, publicUrl: url, mediaStatus: "READY", humanReviewStatus: "APPROVED",
});

test("technical thumbnail wins over an equally ordered historic JPG", () => {
  const resolved = resolveExerciseMedia({
    fallbackThumbnailPath: "/media/exercises/ab-roller/start.webp",
    media: [
      { type: "THUMBNAIL", publicUrl: "/media/exercises/ab-roller/0.jpg" },
      technical("THUMBNAIL", "/media/exercises/ab-roller/start.webp", "THUMBNAIL"),
    ],
  }, "CATALOG");
  assert.equal(resolved.image, "/media/exercises/ab-roller/start.webp");
});

test("phone workout prefers START while Watch prefers THUMBNAIL", () => {
  const exercise = { media: [
    technical("THUMBNAIL", "/technical/thumb.webp", "THUMBNAIL"),
    technical("START", "/technical/start.webp"),
  ] };
  assert.equal(resolveExerciseMedia(exercise, "PHONE_WORKOUT").image, "/technical/start.webp");
  assert.equal(resolveExerciseMedia(exercise, "WATCH").image, "/technical/thumb.webp");
});

test("rejected technical media never blocks a functional historical fallback", () => {
  const resolved = resolveExerciseMedia({
    fallbackThumbnailPath: "/historic/0.jpg",
    media: [{ ...technical("THUMBNAIL", "/technical/rejected.webp", "THUMBNAIL"), humanReviewStatus: "REJECTED" }],
  }, "HISTORY");
  assert.equal(resolved.image, "/historic/0.jpg");
});

test("compact contexts never resolve an animation asset", () => {
  const exercise = { media: [
    technical("THUMBNAIL", "/technical/thumb.webp", "THUMBNAIL"),
    technical("ANIMATION", "/technical/animation.webm", "ANIMATION"),
  ] };
  assert.equal(resolveExerciseMedia(exercise, "CATALOG").animation, null);
  assert.equal(resolveExerciseMedia(exercise, "PROGRAM").animation, null);
  assert.equal(resolveExerciseMedia(exercise, "PHONE_WORKOUT").animation, null);
  assert.equal(resolveExerciseMedia(exercise, "TECHNICAL_SHEET").animation, "/technical/animation.webm");
});
