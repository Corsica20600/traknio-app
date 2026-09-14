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
  mediaAnimation?: { webm: string; webp: string; alt: string; captions?: string };
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
    captions: "/media/exercises/lat-pulldown-machine/animation.fr.vtt",
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

export const ALTERNATE_HAMMER_CURL_PILOT: ExerciseGuidePilot = {
  slug: "alternate-hammer-curl",
  canonicalName: "Alternate Hammer Curl",
  displayNameFr: "Curl marteau alterné",
  watchDisplayName: "Curl marteau",
  category: "Biceps",
  equipment: "Haltères",
  movementPattern: "Flexion du coude · prise neutre",
  exerciseType: "Isolation",
  why: "Le curl marteau alterné développe les bras en sollicitant particulièrement le brachial et le brachio-radial, tout en faisant intervenir le biceps brachial. La prise neutre propose un travail différent du curl classique et contribue à développer l'épaisseur du bras.",
  mediaStart: {
    src: "/media/exercises/alternate-hammer-curl/start.webp",
    alt: "Curl marteau alterné : position de départ debout, bras le long du corps, haltères en prise neutre.",
  },
  mediaEnd: {
    src: "/media/exercises/alternate-hammer-curl/contraction.webp",
    alt: "Curl marteau alterné : bras droit en contraction, bras gauche bas, coude près du corps et prise neutre.",
  },
  mediaAnimation: {
    webm: "/media/exercises/alternate-hammer-curl/animation.webm",
    webp: "/media/exercises/alternate-hammer-curl/animation.webp",
    alt: "Animation d'un curl marteau alterné : bras droit puis bras gauche, avec retour contrôlé.",
  },
  anatomyPrimaryMedia: "/media/exercises/alternate-hammer-curl/anatomy-primary.webp",
  anatomySecondaryMedia: "/media/exercises/alternate-hammer-curl/anatomy-secondary.webp",
  anatomyStatus: "REVIEW_REQUIRED",
  primaryMuscles: ["Brachial", "Brachio-radial", "Biceps brachial"],
  secondaryMuscles: ["Long extenseur radial du carpe", "Fléchisseur radial du carpe", "Fléchisseur superficiel des doigts", "Rond pronateur"],
  steps: [
    "Tenez-vous debout, un haltère dans chaque main, paumes tournées vers le corps.",
    "Gardez les coudes près du torse et le tronc stable.",
    "Fléchissez un coude en conservant la prise neutre, sans avancer l'épaule.",
    "Contractez le bras en haut du mouvement sans décoller le coude du corps.",
    "Redescendez lentement, puis répétez avec l'autre bras.",
  ],
  breathing: "Expirez pendant la montée. Inspirez pendant la descente contrôlée.",
  tempo: {
    value: "2 - 1 - 3",
    detail: ["2 secondes de montée", "1 seconde de contraction", "3 secondes de descente contrôlée"],
  },
  tips: [
    "Gardez les poignets en position neutre.",
    "Maintenez les coudes près du corps.",
    "Gardez les épaules stables.",
    "Contrôlez toute la descente.",
    "Utilisez une amplitude complète sans balancer le buste.",
  ],
  mistakes: [
    "Balancer le buste pour monter l'haltère.",
    "Avancer le coude pendant la flexion.",
    "Tourner excessivement le poignet.",
    "Monter l'épaule avec l'haltère.",
    "Utiliser une charge empêchant un retour contrôlé.",
  ],
};

export function getExerciseGuidePilot(slug: string) {
  return [LAT_PULLDOWN_MACHINE_PILOT, ALTERNATE_HAMMER_CURL_PILOT].find((guide) => guide.slug === slug) ?? null;
}
