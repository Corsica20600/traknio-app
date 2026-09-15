/**
 * Stable, pedagogical anatomy contract. It is completely separate from
 * TRAKNIO_MALE_V1 exercise demonstrations.
 *
 * The raster layers below are approved reference artwork. The renderer only
 * crops, recolours when a role requires it, and composites these local layers;
 * it never invokes an image model or reads from the database.
 */
export const ANATOMY_REFERENCE_PROFILE = "ANATOMY_REFERENCE_V1" as const;

export const anatomyReferenceViews = {
  ANATOMY_MALE_FRONT: { label: "Vue avant", baseMedia: "/media/anatomy-reference/anatomy-male-front.webp" },
  ANATOMY_MALE_BACK: { label: "Vue dos", baseMedia: "/media/anatomy-reference/anatomy-male-back.webp" },
  ANATOMY_MALE_SIDE: { label: "Vue latérale", baseMedia: "/media/anatomy-reference/anatomy-male-side.webp" },
  ANATOMY_MALE_3Q_FRONT: { label: "Vue trois-quarts avant", baseMedia: "/media/anatomy-reference/anatomy-male-3q-front.webp" },
  ANATOMY_MALE_3Q_BACK: { label: "Vue trois-quarts dos", baseMedia: "/media/anatomy-reference/anatomy-male-3q-back.webp" },
} as const;

export type AnatomyReferenceView = keyof typeof anatomyReferenceViews;
export type AnatomyMuscleRole = "PRIMARY" | "SECONDARY";

export const anatomyMuscleKeys = [
  "pectoralis_major", "anterior_deltoid", "lateral_deltoid", "posterior_deltoid",
  "latissimus_dorsi", "teres_major", "trapezius_upper", "trapezius_middle_lower", "rhomboids",
  "biceps_brachii", "brachialis", "brachioradialis", "triceps_brachii", "anconeus",
  "rectus_abdominis", "obliques", "iliopsoas", "serratus_anterior",
  "quadriceps", "gluteus_maximus", "gluteus_medius", "hamstrings", "adductors", "gastrocnemius", "erector_spinae",
] as const;

export type AnatomyMuscleKey = (typeof anatomyMuscleKeys)[number];

export const anatomyColorByRole = {
  PRIMARY: "#FF4D5A",
  SECONDARY: "#2D7DFF",
} as const;

/** A deterministic high-detail source layer from the approved V1 library. */
export type AnatomyReferenceLayer = {
  source: string;
  view: AnatomyReferenceView;
  visibleMuscles: readonly AnatomyMuscleKey[];
  /** Normalised crop [left, top, width, height]. */
  crop?: readonly [number, number, number, number];
  sourceTone: "PRIMARY" | "SECONDARY";
};

export const anatomyReferenceLayers = {
  lowerFrontPrimary: {
    source: "/media/anatomy-reference/approved-layers/front-quadriceps-primary.webp",
    view: "ANATOMY_MALE_3Q_FRONT", visibleMuscles: ["quadriceps"], crop: [0.12, 0.22, 0.76, 0.66], sourceTone: "PRIMARY",
  },
  lowerFrontSecondary: {
    source: "/media/anatomy-reference/approved-layers/front-lower-secondary.webp",
    view: "ANATOMY_MALE_3Q_FRONT", visibleMuscles: ["adductors", "gastrocnemius"], crop: [0.12, 0.22, 0.76, 0.66], sourceTone: "SECONDARY",
  },
  sideGluteusMaximus: {
    source: "/media/anatomy-reference/approved-layers/side-gluteus-maximus-primary.webp",
    view: "ANATOMY_MALE_SIDE", visibleMuscles: ["gluteus_maximus"], crop: [0.12, 0.18, 0.76, 0.70], sourceTone: "PRIMARY",
  },
  sideHamstrings: {
    source: "/media/anatomy-reference/approved-layers/side-hamstrings-secondary.webp",
    view: "ANATOMY_MALE_SIDE", visibleMuscles: ["hamstrings"], crop: [0.12, 0.18, 0.76, 0.70], sourceTone: "SECONDARY",
  },
  backPosteriorChain: {
    source: "/media/anatomy-reference/approved-layers/back-posterior-chain-primary.webp",
    view: "ANATOMY_MALE_3Q_BACK", visibleMuscles: ["gluteus_maximus", "hamstrings"], crop: [0.12, 0.20, 0.76, 0.66], sourceTone: "PRIMARY",
  },
  backErectorSpinae: {
    source: "/media/anatomy-reference/approved-layers/back-erector-spinae-source.webp",
    view: "ANATOMY_MALE_3Q_BACK", visibleMuscles: ["erector_spinae"], crop: [0.18, 0.02, 0.64, 0.46], sourceTone: "PRIMARY",
  },
  frontRectusAbdominis: {
    source: "/media/anatomy-reference/approved-layers/front-rectus-abdominis-primary.webp",
    view: "ANATOMY_MALE_FRONT", visibleMuscles: ["rectus_abdominis"], crop: [0.08, 0.05, 0.84, 0.88], sourceTone: "PRIMARY",
  },
  frontObliques: {
    source: "/media/anatomy-reference/approved-layers/front-obliques-secondary.webp",
    view: "ANATOMY_MALE_FRONT", visibleMuscles: ["obliques"], crop: [0.14, 0.28, 0.72, 0.56], sourceTone: "SECONDARY",
  },
} as const satisfies Record<string, AnatomyReferenceLayer>;

export type AnatomyReferenceLayerKey = keyof typeof anatomyReferenceLayers;

export type AnatomyOverlayRecipe = {
  slug: string;
  view: AnatomyReferenceView;
  primaryMuscles: readonly AnatomyMuscleKey[];
  secondaryMuscles: readonly AnatomyMuscleKey[];
  primaryLayer: AnatomyReferenceLayerKey;
  secondaryLayer: AnatomyReferenceLayerKey;
  /** Muscles listed natively but intentionally not coloured from this view. */
  textOnlyMuscles?: readonly string[];
};

export const blockedExerciseAnatomyRecipes: readonly AnatomyOverlayRecipe[] = [
  { slug: "barbell-lunge", view: "ANATOMY_MALE_3Q_FRONT", primaryMuscles: ["quadriceps", "gluteus_maximus"], secondaryMuscles: ["adductors", "gastrocnemius"], primaryLayer: "lowerFrontPrimary", secondaryLayer: "lowerFrontSecondary", textOnlyMuscles: ["Grand fessier — masqué sur la vue avant", "Ischio-jambiers", "Érecteurs du rachis"] },
  { slug: "barbell-hip-thrust", view: "ANATOMY_MALE_SIDE", primaryMuscles: ["gluteus_maximus"], secondaryMuscles: ["hamstrings"], primaryLayer: "sideGluteusMaximus", secondaryLayer: "sideHamstrings", textOnlyMuscles: ["Moyen fessier", "Adducteurs", "Érecteurs du rachis"] },
  { slug: "romanian-deadlift", view: "ANATOMY_MALE_3Q_BACK", primaryMuscles: ["hamstrings", "gluteus_maximus"], secondaryMuscles: ["erector_spinae", "adductors"], primaryLayer: "backPosteriorChain", secondaryLayer: "backErectorSpinae", textOnlyMuscles: ["Adducteurs — non isolables précisément sur cette vue"] },
  { slug: "leg-press", view: "ANATOMY_MALE_3Q_FRONT", primaryMuscles: ["quadriceps"], secondaryMuscles: ["adductors", "gastrocnemius"], primaryLayer: "lowerFrontPrimary", secondaryLayer: "lowerFrontSecondary", textOnlyMuscles: ["Grand fessier", "Ischio-jambiers"] },
  { slug: "hanging-leg-raise", view: "ANATOMY_MALE_FRONT", primaryMuscles: ["rectus_abdominis"], secondaryMuscles: ["obliques"], primaryLayer: "frontRectusAbdominis", secondaryLayer: "frontObliques", textOnlyMuscles: ["Fléchisseurs de hanche — structure profonde, texte uniquement"] },
];
