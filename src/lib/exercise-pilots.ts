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

export const BARBELL_BENCH_PRESS_PILOT: ExerciseGuidePilot = {
  slug: "barbell-bench-press-medium-grip",
  canonicalName: "Barbell Bench Press - Medium Grip",
  displayNameFr: "Développé couché avec barre",
  watchDisplayName: "Développé couché",
  category: "Pectoraux",
  equipment: "Barre olympique · banc plat",
  movementPattern: "Poussée horizontale",
  exerciseType: "Polyarticulaire",
  why: "Le développé couché avec barre développe principalement les pectoraux. Les triceps et les deltoïdes antérieurs participent à la poussée, tandis que le banc offre un appui stable pour progresser avec une charge maîtrisée.",
  mediaStart: { src: "/media/exercises/barbell-bench-press-medium-grip/start.webp", alt: "Développé couché avec barre : bras tendus au-dessus de la poitrine, pieds ancrés au sol." },
  mediaEnd: { src: "/media/exercises/barbell-bench-press-medium-grip/contraction.webp", alt: "Développé couché avec barre : phase basse contrôlée, barre proche du milieu de la poitrine." },
  mediaAnimation: { webm: "/media/exercises/barbell-bench-press-medium-grip/animation.webm", webp: "/media/exercises/barbell-bench-press-medium-grip/animation.webp", alt: "Animation d'un développé couché avec barre, de la position haute à la descente contrôlée." },
  anatomyPrimaryMedia: "/media/exercises/barbell-bench-press-medium-grip/anatomy-primary.webp",
  anatomySecondaryMedia: "/media/exercises/barbell-bench-press-medium-grip/anatomy-secondary.webp",
  anatomyStatus: "REVIEW_REQUIRED",
  primaryMuscles: ["Grand pectoral"],
  secondaryMuscles: ["Triceps brachial", "Deltoïde antérieur"],
  steps: ["Installez-vous sur le banc, pieds fermement au sol et omoplates stables.", "Saisissez la barre avec une prise légèrement plus large que les épaules.", "Descendez la barre de façon contrôlée vers le milieu de la poitrine.", "Poussez la barre en gardant les poignets alignés au-dessus des avant-bras.", "Replacez la barre sur le rack avec contrôle à la fin de la série."],
  breathing: "Inspirez pendant la descente. Expirez pendant la poussée.",
  tempo: { value: "3 - 0 - 1", detail: ["3 secondes de descente", "pas de rebond sur la poitrine", "1 seconde de poussée contrôlée"] },
  tips: ["Gardez les omoplates serrées contre le banc.", "Conservez les pieds en appui pendant toute la série.", "Maintenez les poignets dans l'axe des avant-bras.", "Choisissez une amplitude confortable pour les épaules.", "Utilisez un pareur pour les charges lourdes."],
  mistakes: ["Écarter excessivement les coudes.", "Faire rebondir la barre sur la poitrine.", "Laisser la trajectoire devenir incontrôlée.", "Perdre la stabilité des épaules sur le banc.", "Choisir une charge incompatible avec une exécution maîtrisée."],
};

export const ONE_ARM_DUMBBELL_ROW_PILOT: ExerciseGuidePilot = {
  slug: "one-arm-dumbbell-row",
  canonicalName: "One-Arm Dumbbell Row",
  displayNameFr: "Rowing unilatéral avec haltère",
  watchDisplayName: "Rowing unilatéral",
  category: "Dos",
  equipment: "Haltère · banc plat",
  movementPattern: "Tirage horizontal unilatéral",
  exerciseType: "Polyarticulaire",
  why: "Le rowing unilatéral avec haltère cible le grand dorsal et le milieu du dos tout en permettant de travailler chaque côté séparément. L'appui sur le banc aide à conserver une trajectoire stable et à sentir le coude se diriger vers la hanche.",
  mediaStart: { src: "/media/exercises/one-arm-dumbbell-row/start.webp", alt: "Rowing unilatéral avec haltère : bras actif tendu sous l'épaule, main et genou opposés en appui sur un banc." },
  mediaEnd: { src: "/media/exercises/one-arm-dumbbell-row/contraction.webp", alt: "Rowing unilatéral avec haltère : coude tiré vers la hanche, haltère près du flanc." },
  mediaAnimation: { webm: "/media/exercises/one-arm-dumbbell-row/animation.webm", webp: "/media/exercises/one-arm-dumbbell-row/animation.webp", alt: "Animation d'un rowing unilatéral avec haltère, du bras tendu au coude tiré vers la hanche." },
  anatomyPrimaryMedia: "/media/exercises/one-arm-dumbbell-row/anatomy-primary.webp",
  anatomySecondaryMedia: "/media/exercises/one-arm-dumbbell-row/anatomy-secondary.webp",
  anatomyStatus: "REVIEW_REQUIRED",
  primaryMuscles: ["Grand dorsal", "Trapèze moyen"],
  secondaryMuscles: ["Rhomboïdes", "Deltoïde postérieur", "Biceps brachial", "Brachial"],
  steps: ["Placez un genou et la main du même côté sur le banc.", "Gardez le dos neutre et l'haltère suspendu sous l'épaule.", "Tirez le coude vers l'arrière et en direction de la hanche.", "Marquez une courte contraction sans tourner le buste.", "Redescendez l'haltère lentement puis changez de côté."],
  breathing: "Expirez pendant le tirage. Inspirez pendant la descente contrôlée.",
  tempo: { value: "2 - 1 - 2", detail: ["2 secondes de tirage", "1 seconde de contraction", "2 secondes de retour contrôlé"] },
  tips: ["Gardez la colonne stable du début à la fin.", "Guidez le mouvement avec le coude plutôt qu'avec la main.", "Évitez de hausser l'épaule active.", "Choisissez un banc suffisamment stable.", "Travaillez la même qualité de mouvement des deux côtés."],
  mistakes: ["Tourner le buste pour monter l'haltère.", "Tirer le coude vers l'épaule au lieu de la hanche.", "Arrondir le dos.", "Laisser tomber l'haltère en bas du mouvement.", "Utiliser une charge qui empêche le contrôle."],
};

export const BARBELL_SQUAT_PILOT: ExerciseGuidePilot = {
  slug: "barbell-squat",
  canonicalName: "Barbell Squat",
  displayNameFr: "Squat avec barre",
  watchDisplayName: "Squat barre",
  category: "Jambes",
  equipment: "Barre olympique · rack",
  movementPattern: "Flexion de genoux et de hanches",
  exerciseType: "Polyarticulaire",
  why: "Le squat avec barre développe prioritairement les quadriceps et les fessiers. Il sollicite aussi les muscles qui stabilisent le bassin et le tronc, ce qui en fait un mouvement complet à progresser avec méthode.",
  mediaStart: { src: "/media/exercises/barbell-squat/start.webp", alt: "Squat avec barre : position debout stable, barre sur le haut du dos, pieds à largeur d'épaules." },
  mediaEnd: { src: "/media/exercises/barbell-squat/contraction.webp", alt: "Squat avec barre : position basse contrôlée, genoux dans l'axe des pieds et tronc neutre." },
  mediaAnimation: { webm: "/media/exercises/barbell-squat/animation.webm", webp: "/media/exercises/barbell-squat/animation.webp", alt: "Animation d'un squat avec barre, de la position debout à la position basse contrôlée." },
  anatomyPrimaryMedia: "/media/exercises/barbell-squat/anatomy-primary.webp",
  anatomySecondaryMedia: "/media/exercises/barbell-squat/anatomy-secondary.webp",
  anatomyStatus: "REVIEW_REQUIRED",
  primaryMuscles: ["Quadriceps", "Grand fessier"],
  secondaryMuscles: ["Ischio-jambiers", "Adducteurs", "Mollets", "Érecteurs du rachis"],
  steps: ["Réglez le rack et placez la barre sur le haut du dos, jamais sur la nuque.", "Écartez les pieds à largeur d'épaules, pointes légèrement ouvertes.", "Descendez en fléchissant hanches et genoux, tronc gainé.", "Gardez les genoux dans l'axe des orteils et les talons au sol.", "Poussez le sol pour revenir debout sans perdre la neutralité du dos."],
  breathing: "Inspirez et gainez-vous avant la descente. Expirez en remontant après le point difficile.",
  tempo: { value: "3 - 1 - 2", detail: ["3 secondes de descente", "1 seconde de contrôle en bas", "2 secondes de remontée maîtrisée"] },
  tips: ["Commencez avec une charge facile à contrôler.", "Gardez le regard dans une direction naturelle.", "Conservez une pression égale sous les deux pieds.", "Adaptez la profondeur à votre mobilité sans perdre le gainage.", "Utilisez les sécurités du rack si nécessaire."],
  mistakes: ["Laisser les genoux s'effondrer vers l'intérieur.", "Perdre la neutralité du tronc.", "Décoller les talons.", "Descendre au-delà de la profondeur contrôlée.", "Utiliser une charge excessive."],
};

export const AB_ROLLER_PILOT: ExerciseGuidePilot = {
  slug: "ab-roller",
  canonicalName: "Ab Roller",
  displayNameFr: "Roulette abdominale",
  watchDisplayName: "Roulette abdos",
  category: "Abdominaux",
  equipment: "Roulette abdominale",
  movementPattern: "Extension anti-extension du tronc",
  exerciseType: "Polyarticulaire",
  why: "La roulette abdominale renforce le droit de l'abdomen et le gainage global. Le mouvement demande de résister à l'extension du bas du dos pendant que les épaules et le grand dorsal stabilisent la trajectoire.",
  mediaStart: { src: "/media/exercises/ab-roller/start.webp", alt: "Roulette abdominale à genoux : roue proche du corps, mains sous les épaules et tronc gainé." },
  mediaEnd: { src: "/media/exercises/ab-roller/contraction.webp", alt: "Roulette abdominale à genoux : position étendue, bras devant le corps et colonne maintenue neutre." },
  mediaAnimation: { webm: "/media/exercises/ab-roller/animation.webm", webp: "/media/exercises/ab-roller/animation.webp", alt: "Animation d'une roulette abdominale à genoux, de la position regroupée à l'extension contrôlée." },
  anatomyPrimaryMedia: "/media/exercises/ab-roller/anatomy-primary.webp",
  anatomySecondaryMedia: "/media/exercises/ab-roller/anatomy-secondary.webp",
  anatomyStatus: "REVIEW_REQUIRED",
  primaryMuscles: ["Droit de l'abdomen"],
  secondaryMuscles: ["Obliques", "Transverse de l'abdomen", "Grand dorsal", "Deltoïde antérieur"],
  steps: ["Placez-vous à genoux, les deux mains sur la roulette sous les épaules.", "Gainez le tronc et gardez le bassin légèrement rétroversé.", "Faites rouler la roue vers l'avant aussi loin que votre contrôle le permet.", "Maintenez une ligne stable des épaules aux genoux sans cambrer le bas du dos.", "Ramenez la roue en utilisant le gainage, sans tirer uniquement avec les bras."],
  breathing: "Inspirez pendant l'aller contrôlé. Expirez en ramenant la roulette.",
  tempo: { value: "3 - 1 - 2", detail: ["3 secondes d'aller", "1 seconde de contrôle en extension", "2 secondes de retour gainé"] },
  tips: ["Limitez l'amplitude tant que le bassin reste stable.", "Progressez par petites amplitudes avant d'aller plus loin.", "Gardez les épaules actives au-dessus de la roue.", "Utilisez un tapis confortable sous les genoux.", "Préférez la qualité de gainage au nombre de répétitions."],
  mistakes: ["Cambrer excessivement le bas du dos.", "Laisser le bassin s'effondrer.", "Aller plus loin que votre capacité de gainage.", "Tirer uniquement avec les bras au retour.", "Faire le mouvement trop vite."],
};

export function getExerciseGuidePilot(slug: string) {
  return [
    LAT_PULLDOWN_MACHINE_PILOT,
    ALTERNATE_HAMMER_CURL_PILOT,
    BARBELL_BENCH_PRESS_PILOT,
    ONE_ARM_DUMBBELL_ROW_PILOT,
    BARBELL_SQUAT_PILOT,
    AB_ROLLER_PILOT,
  ].find((guide) => guide.slug === slug) ?? null;
}
