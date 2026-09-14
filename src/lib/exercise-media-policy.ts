export const TRAKNIO_CHARACTER_LOCK = "TRAKNIO_MALE_V1" as const;

export const requiredExerciseMedia = ["start.webp", "contraction.webp", "animation.webm", "animation.webp"] as const;

export const requiredMediaChecks = [
  "CHARACTER_CONSISTENCY",
  "EQUIPMENT_CONSISTENCY",
  "CAMERA_CONSISTENCY",
  "START_POSITION_VALID",
  "END_POSITION_VALID",
  "MOVEMENT_PATH_VALID",
  "ANIMATION_LOOP_VALID",
] as const;

export type MediaCheck = (typeof requiredMediaChecks)[number];
export type ReferenceStatus = "NONE" | "REFERENCE_REQUIRED" | "REFERENCE_REVIEW";
export type MediaReadiness = "READY" | "MEDIA_REVIEW_REQUIRED";
export type MediaValidation = Partial<Record<MediaCheck, boolean>>;

export function resolveMediaReadiness(referenceStatus: ReferenceStatus, validation: MediaValidation): MediaReadiness {
  if (referenceStatus !== "NONE") return "MEDIA_REVIEW_REQUIRED";
  return requiredMediaChecks.every((check) => validation[check] === true)
    ? "READY"
    : "MEDIA_REVIEW_REQUIRED";
}

export function characterLockPrompt() {
  return [
    `CHARACTER_LOCK = ${TRAKNIO_CHARACTER_LOCK}.`,
    "Use the official Traknio male reference character unchanged: face, hairstyle, hair colour, morphology, proportions, apparent age, outfit, shoes and TRAKNIO branding are locked.",
    "Only posture, joint positions, body orientation, equipment, machine and movement-required framing may vary.",
    "For this exercise, generate start.webp, contraction.webp, animation.webm and animation.webp from the same character, equipment, camera, lighting and setting.",
    "The end position must be biomechanically compatible with the start position. Do not mark media READY until every required validation check passes.",
  ].join(" ");
}
