/**
 * Stable pedagogical anatomy contract. These are not exercise demonstrations
 * and must never use the TRAKNIO_MALE_V1 character profile. A future approved
 * base silhouette is registered once per view; exercises reference the view and
 * muscle overlays rather than generating a different anatomy body each time.
 */
export const ANATOMY_REFERENCE_PROFILE = "ANATOMY_REFERENCE_V1" as const;

export const anatomyReferenceViews = {
  ANATOMY_MALE_FRONT: { label: "Vue avant", baseMedia: null },
  ANATOMY_MALE_BACK: { label: "Vue dos", baseMedia: null },
  ANATOMY_MALE_SIDE: { label: "Vue latérale", baseMedia: null },
  ANATOMY_MALE_3Q_FRONT: { label: "Vue trois-quarts avant", baseMedia: null },
  ANATOMY_MALE_3Q_BACK: { label: "Vue trois-quarts dos", baseMedia: null },
} as const;

export type AnatomyReferenceView = keyof typeof anatomyReferenceViews;
export type AnatomyMuscleRole = "PRIMARY" | "SECONDARY";

/** Approved muscle keys. Deep muscles, notably transverse abdominis, remain
 * text-only until a medically valid depiction is supplied. */
export const anatomyMuscleKeys = [
  "pectoralis_major", "anterior_deltoid", "lateral_deltoid", "posterior_deltoid",
  "latissimus_dorsi", "teres_major", "trapezius_upper", "trapezius_middle_lower", "rhomboids",
  "biceps_brachii", "brachialis", "brachioradialis", "triceps_brachii", "anconeus",
  "rectus_abdominis", "obliques", "iliopsoas", "serratus_anterior",
  "quadriceps", "gluteus_maximus", "gluteus_medius", "hamstrings", "adductors", "gastrocnemius", "erector_spinae",
] as const;

export type AnatomyOverlay = {
  view: AnatomyReferenceView;
  role: AnatomyMuscleRole;
  muscleKeys: readonly (typeof anatomyMuscleKeys)[number][];
  color: "#FF4D5A" | "#2D7DFF";
  reviewRequired: boolean;
};

export const anatomyColorByRole = {
  PRIMARY: "#FF4D5A",
  SECONDARY: "#2D7DFF",
} as const;
