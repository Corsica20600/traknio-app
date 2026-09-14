export type ExerciseGuidePilot = {
  slug: string;
  canonicalName: string;
  displayNameFr: string;
  watchDisplayName: string;
  category: string;
  equipment: string;
  movementPattern: string;
  exerciseType: string;
  why: string;
  mediaStart: { src: string; alt: string };
  mediaEnd: { src: string; alt: string };
  mediaAnimation?: { webm: string; webp: string; alt: string };
  anatomyPrimaryMedia?: string;
  anatomySecondaryMedia?: string;
  anatomyStatus: "READY" | "REVIEW_REQUIRED";
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  steps: readonly string[];
  breathing: string;
  tempo: {
    value: string;
    detail: readonly string[];
  };
  tips: readonly string[];
  mistakes: readonly string[];
};

/**
 * Pilot content deliberately kept outside Prisma until the exercise and media
 * are approved. The template therefore uses production-like structured data
 * without altering the historic pulldown records that use a cable-and-bar setup.
 */
export const LAT_PULLDOWN_MACHINE_PILOT: ExerciseGuidePilot = {
  slug: "lat-pulldown-machine",
  canonicalName: "Lat Pulldown Machine",
  displayNameFr: "Tirage vertical à la machine",
  watchDisplayName: "Lat Pulldown",
  category: "Dos",
  equipment: "Machine à leviers indépendants",
  movementPattern: "Tirage vertical",
  exerciseType: "Polyarticulaire",
  why: "Le Lat Pulldown Machine développe principalement les grands dorsaux avec une trajectoire guidée et stable. Les bras indépendants permettent de travailler chaque côté de manière équilibrée et facilitent la concentration sur la contraction du dos.",
  mediaStart: {
    src: "/media/exercises/lat-pulldown-machine/position-start.webp",
    alt: "Tirage vertical sur machine à leviers indépendants, bras tendus et épaules basses.",
  },
  mediaEnd: {
    src: "/media/exercises/lat-pulldown-machine/position-contraction.webp",
    alt: "Tirage vertical sur machine à leviers indépendants, coudes descendus et dorsaux contractés.",
  },
  mediaAnimation: {
    webm: "/media/exercises/lat-pulldown-machine/animation.webm",
    webp: "/media/exercises/lat-pulldown-machine/animation.webp",
    alt: "Animation d'un tirage vertical sur machine à leviers indépendants.",
  },
  anatomyPrimaryMedia: "/media/exercises/lat-pulldown-machine/anatomy-primary.webp",
  anatomySecondaryMedia: "/media/exercises/lat-pulldown-machine/anatomy-secondary.webp",
  // Les deux médias sont intégrés au pilote, mais doivent encore être approuvés
  // par un référent anatomique avant de devenir la référence médicale.
  anatomyStatus: "REVIEW_REQUIRED",
  primaryMuscles: ["Grand dorsal"],
  secondaryMuscles: ["Grand rond", "Trapèze moyen et inférieur", "Rhomboïdes", "Biceps", "Brachial"],
  steps: [
    "Régler le siège et les supports de cuisses.",
    "Saisir les poignées avec les bras tendus et les épaules basses.",
    "Garder la poitrine légèrement sortie et le tronc stable.",
    "Tirer les coudes vers le bas jusqu'à contracter les dorsaux.",
    "Revenir lentement à la position de départ sans relâcher brutalement la charge.",
  ],
  breathing: "Expirez pendant le tirage. Inspirez pendant le retour contrôlé.",
  tempo: {
    value: "2 - 1 - 3",
    detail: ["2 secondes de tirage", "1 seconde de contraction", "3 secondes de retour contrôlé"],
  },
  tips: [
    "Ne pas tirer uniquement avec les bras.",
    "Garder les épaules basses.",
    "Éviter de basculer le buste.",
    "Contrôler toute la phase de retour.",
    "Adapter la prise à la machine et à votre confort articulaire.",
  ],
  mistakes: [
    "Charge trop lourde.",
    "Balancement du buste.",
    "Épaules remontées.",
    "Amplitude incomplète.",
    "Retour trop rapide.",
  ],
};

export function getExerciseGuidePilot(slug: string) {
  return slug === LAT_PULLDOWN_MACHINE_PILOT.slug ? LAT_PULLDOWN_MACHINE_PILOT : null;
}
