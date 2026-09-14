export type ExerciseOverride = {
  displayNameFr?: string;
  cueFr?: string;
  primaryMuscleFr?: string;
  cardImage?: string;
  detailImage?: string;
  frameAnimationUrls?: string[];
  frameIntervalMs?: number;
};

const WIDE_GRIP_LAT_PULLDOWN_FR = "Tirage vertical à la machine";

const overrides: Record<string, ExerciseOverride> = {
  "ab-roller": {
    displayNameFr: "Roulette abdominale",
    cueFr: "Saisis la roue à deux mains, garde le gainage et avance seulement sans creuser le bas du dos.",
    primaryMuscleFr: "Abdominaux",
    cardImage: "/media/exercises/ab-roller/start.webp",
  },
  "barbell-bench-press-medium-grip": {
    displayNameFr: "Développé couché avec barre",
    primaryMuscleFr: "Pectoraux",
    cardImage: "/media/exercises/barbell-bench-press-medium-grip/start.webp",
  },
  "one-arm-dumbbell-row": {
    displayNameFr: "Rowing unilatéral avec haltère",
    primaryMuscleFr: "Dos",
    cardImage: "/media/exercises/one-arm-dumbbell-row/start.webp",
  },
  "barbell-squat": {
    displayNameFr: "Squat avec barre",
    primaryMuscleFr: "Quadriceps",
    cardImage: "/media/exercises/barbell-squat/start.webp",
  },
  "clock-push-up": {
    displayNameFr: "Pompes horloge",
    cueFr: "Garde le corps gainé et déplace les mains progressivement autour de l'axe sans casser les hanches.",
    primaryMuscleFr: "Pectoraux",
  },
  "lat-pulldown": {
    displayNameFr: WIDE_GRIP_LAT_PULLDOWN_FR,
    cueFr: "Tire avec les coudes vers le bas, serre les omoplates et contrôle la remontée.",
    primaryMuscleFr: "Dos",
    cardImage: "/media/exercises/wide-grip-lat-pulldown/0.jpg",
  },
  "wide-grip-lat-pulldown": {
    displayNameFr: WIDE_GRIP_LAT_PULLDOWN_FR,
    cueFr: "Tire avec les coudes vers le bas, serre les omoplates et contrôle la remontée.",
    primaryMuscleFr: "Dos",
    cardImage: "/media/exercises/wide-grip-lat-pulldown/0.jpg",
  },
  "incline-dumbbell-press": {
    displayNameFr: "Développé incliné avec haltères",
    primaryMuscleFr: "Pectoraux",
  },
  "dumbbell-fly": {
    displayNameFr: "Écarté couché avec haltères",
    primaryMuscleFr: "Pectoraux",
  },
  "dumbbell-flyes": {
    displayNameFr: "Écarté couché avec haltères",
    primaryMuscleFr: "Pectoraux",
  },
  "stiff-legged-dumbbell-deadlift": {
    displayNameFr: "Soulevé de terre jambes tendues avec haltères",
    primaryMuscleFr: "Ischio-jambiers",
  },
  "single-arm-dumbbell-row": {
    displayNameFr: "Rowing haltère à un bras",
    primaryMuscleFr: "Dos",
  },
  "elevated-cable-row": {
    displayNameFr: "Rowing à la poulie en hauteur",
    primaryMuscleFr: "Dos",
  },
  "elevated-cable-rows": {
    displayNameFr: "Rowing à la poulie en hauteur",
    primaryMuscleFr: "Dos",
  },
  "standing-calf-raise": {
    displayNameFr: "Élévations mollets debout",
    primaryMuscleFr: "Mollets",
  },
};

const displayNameByEnglishName: Record<string, string> = {
  "incline dumbbell press": "Développé incliné avec haltères",
  "dumbbell fly": "Écarté couché avec haltères",
  "dumbbell flyes": "Écarté couché avec haltères",
  "stiff-legged dumbbell deadlift": "Soulevé de terre jambes tendues avec haltères",
  "stiff legged dumbbell deadlift": "Soulevé de terre jambes tendues avec haltères",
  "single arm dumbbell row": "Rowing haltère à un bras",
  "one-arm dumbbell row": "Rowing haltère à un bras",
  "one arm dumbbell row": "Rowing haltère à un bras",
  "elevated cable row": "Rowing à la poulie en hauteur",
  "elevated cable rows": "Rowing à la poulie en hauteur",
  "standing calf raise": "Élévations mollets debout",
};

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getExerciseOverride(slug: string): ExerciseOverride | null {
  return overrides[slug] ?? null;
}

export function getExerciseDisplayName(exercise: { slug?: string | null; name: string; nameFr?: string | null }) {
  if (exercise.slug) {
    const override = getExerciseOverride(exercise.slug);
    if (override?.displayNameFr) return override.displayNameFr;
  }
  if (exercise.nameFr?.trim()) return exercise.nameFr.trim();
  return displayNameByEnglishName[normalizeName(exercise.name)] ?? exercise.name;
}
