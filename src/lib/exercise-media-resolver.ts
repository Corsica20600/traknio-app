export type ExerciseMediaContext = "CATALOG" | "PROGRAM" | "PHONE_WORKOUT" | "HISTORY" | "WATCH" | "TECHNICAL_SHEET";

export type ResolvableExerciseMedia = {
  type: "IMAGE" | "THUMBNAIL" | "ANIMATION";
  role?: string | null;
  mediaStatus?: string | null;
  humanReviewStatus?: string | null;
  format?: string | null;
  publicUrl?: string | null;
  url?: string | null;
  isPrimary?: boolean;
  sortOrder?: number;
};

export type ResolvableExercise = {
  media?: readonly ResolvableExerciseMedia[] | null;
  fallbackImagePath?: string | null;
  fallbackThumbnailPath?: string | null;
  fallbackAnimationPath?: string | null;
  primaryAnimationPath?: string | null;
};

const IMAGE_ROLES: Record<ExerciseMediaContext, readonly string[]> = {
  CATALOG: ["THUMBNAIL", "START", "CONTRACTION"],
  PROGRAM: ["THUMBNAIL", "START", "CONTRACTION"],
  PHONE_WORKOUT: ["START", "THUMBNAIL", "CONTRACTION"],
  HISTORY: ["THUMBNAIL", "START", "CONTRACTION"],
  WATCH: ["THUMBNAIL", "START", "CONTRACTION"],
  TECHNICAL_SHEET: ["THUMBNAIL", "START", "MID", "MID_2", "MID_3", "CONTRACTION"],
};

function sourceOf(media: ResolvableExerciseMedia) {
  return media.publicUrl || media.url || null;
}

function usable(source?: string | null) {
  return Boolean(source && !source.startsWith("//") && source.length <= 2048);
}

/** A role marks generated technical media. Old imports deliberately have no role. */
export function isUsableTechnicalMedia(media: ResolvableExerciseMedia) {
  const source = sourceOf(media);
  return Boolean(
    media.role &&
    usable(source) &&
    media.mediaStatus !== "MISSING" &&
    media.mediaStatus !== "GENERATING" &&
    media.mediaStatus !== "REJECTED" &&
    media.humanReviewStatus !== "REJECTED",
  );
}

function technicalByRole(media: readonly ResolvableExerciseMedia[], roles: readonly string[]) {
  for (const role of roles) {
    const found = media.find((item) => item.role === role && isUsableTechnicalMedia(item));
    const source = found ? sourceOf(found) : null;
    if (source) return source;
  }
  return null;
}

function historicalImage(media: readonly ResolvableExerciseMedia[]) {
  const found = media.find((item) => !item.role && item.type === "THUMBNAIL" && usable(sourceOf(item)))
    ?? media.find((item) => !item.role && item.type === "IMAGE" && usable(sourceOf(item)));
  return found ? sourceOf(found) : null;
}

function historicalAnimation(media: readonly ResolvableExerciseMedia[]) {
  const found = media.find((item) => !item.role && item.type === "ANIMATION" && usable(sourceOf(item)));
  return found ? sourceOf(found) : null;
}

/**
 * Canonical exercise-media precedence used by all consumer surfaces.  Technical
 * roles win only when usable; historic imports remain a safe last fallback.
 */
export function resolveExerciseMedia(exercise: ResolvableExercise, context: ExerciseMediaContext) {
  const media = exercise.media ?? [];
  const image =
    technicalByRole(media, IMAGE_ROLES[context]) ||
    technicalByRole(media, ["THUMBNAIL", "START", "CONTRACTION"]) ||
    (usable(exercise.fallbackThumbnailPath) ? exercise.fallbackThumbnailPath! : null) ||
    (usable(exercise.fallbackImagePath) ? exercise.fallbackImagePath! : null) ||
    historicalImage(media);
  // Animation belongs to the full technical sheet only. Compact surfaces must
  // not fetch a WebM/WebP simply to display a catalogue/program preview.
  const animation = context === "TECHNICAL_SHEET"
    ? (
      technicalByRole(media, ["ANIMATION"]) ||
      (usable(exercise.primaryAnimationPath) ? exercise.primaryAnimationPath! : null) ||
      (usable(exercise.fallbackAnimationPath) ? exercise.fallbackAnimationPath! : null) ||
      historicalAnimation(media)
    )
    : null;

  return { image, animation };
}
