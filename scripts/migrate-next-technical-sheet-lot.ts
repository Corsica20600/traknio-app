import { MediaFormat, Prisma } from "@prisma/client";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/src/lib/prisma";

/**
 * The production pipeline for new technical sheets.  Content belongs in Neon;
 * this file is an idempotent import manifest rather than a runtime override.
 * Run with --apply only after every declared local media asset has been checked.
 */
const apply = process.argv.includes("--apply");

type Sheet = {
  slug: string; nameFr: string; watchDisplayName: string; equipmentFr: string[];
  movementPatternFr: string; exerciseTypeFr: string; primary: string[]; secondary: string[];
  why: string; steps: string[]; breathing: string; tempo: { value: string; detail: string[] };
  tips: string[]; mistakes: string[];
};

const sheets: Sheet[] = [
  {
    slug: "dumbbell-flyes", nameFr: "Écartés couchés avec haltères", watchDisplayName: "Écartés haltères",
    equipmentFr: ["Haltères", "Banc plat"], movementPatternFr: "Adduction horizontale", exerciseTypeFr: "Isolation",
    primary: ["Grand pectoral"], secondary: ["Deltoïde antérieur", "Dentelé antérieur"],
    why: "Les écartés couchés isolent davantage les pectoraux grâce à une grande amplitude d’adduction. Les haltères permettent d’ajuster naturellement la trajectoire et de ressentir l’étirement de la poitrine.",
    steps: ["Allongez-vous sur le banc, haltères au-dessus de la poitrine et paumes face à face.", "Gardez une légère flexion des coudes, stable pendant tout le mouvement.", "Ouvrez les bras en arc de cercle jusqu’à un étirement confortable des pectoraux.", "Ramenez les haltères au-dessus de la poitrine en rapprochant les bras.", "Arrêtez-vous sans cogner les haltères et recommencez avec contrôle."],
    breathing: "Inspirez pendant l’ouverture. Expirez en rapprochant les haltères.", tempo: { value: "3 - 1 - 2", detail: ["3 secondes d’ouverture", "1 seconde d’étirement contrôlé", "2 secondes de retour"] },
    tips: ["Conservez le même angle de coude.", "Limitez l’amplitude à la mobilité de vos épaules.", "Gardez les omoplates stables sur le banc.", "Choisissez une charge légère à modérée.", "Visualisez les bras qui se referment autour de la poitrine."],
    mistakes: ["Plier puis tendre les coudes comme lors d’un développé.", "Descendre trop bas et perdre le contrôle des épaules.", "Utiliser une charge trop lourde.", "Faire rebondir les haltères en haut.", "Décoller les épaules du banc."],
  },
  {
    slug: "cable-crossover", nameFr: "Crossover à la poulie", watchDisplayName: "Crossover poulie",
    equipmentFr: ["Poulie vis-à-vis"], movementPatternFr: "Adduction horizontale", exerciseTypeFr: "Isolation",
    primary: ["Grand pectoral"], secondary: ["Deltoïde antérieur", "Dentelé antérieur", "Biceps brachial"],
    why: "Le crossover maintient une tension régulière sur les pectoraux grâce aux poulies. La trajectoire libre permet d’adapter le geste à votre morphologie tout en ciblant la contraction de la poitrine.",
    steps: ["Réglez les poulies à hauteur d’épaules et avancez un pied pour vous stabiliser.", "Saisissez les poignées, bras ouverts avec les coudes légèrement fléchis.", "Gardez le buste gainé et les épaules basses.", "Rapprochez les poignées devant la poitrine en suivant un arc régulier.", "Revenez lentement jusqu’à sentir un étirement confortable."],
    breathing: "Expirez lorsque les mains se rapprochent. Inspirez au retour.", tempo: { value: "2 - 1 - 3", detail: ["2 secondes de rapprochement", "1 seconde de contraction", "3 secondes de retour"] },
    tips: ["Gardez les poignets dans l’axe des avant-bras.", "Conservez une légère flexion des coudes.", "Réglez la position des poulies selon la zone de poitrine visée.", "Stabilisez votre bassin avec une fente courte.", "Cherchez la contraction, pas la charge maximale."],
    mistakes: ["Arrondir les épaules vers l’avant.", "Tirer avec les bras plutôt qu’avec la poitrine.", "Balancer le buste.", "Tendre complètement les coudes.", "Laisser les charges claquer au retour."],
  },
  {
    slug: "pullups", nameFr: "Tractions", watchDisplayName: "Tractions",
    equipmentFr: ["Barre de traction", "Poids du corps"], movementPatternFr: "Tirage vertical", exerciseTypeFr: "Polyarticulaire",
    primary: ["Grand dorsal"], secondary: ["Grand rond", "Trapèze moyen et inférieur", "Rhomboïdes", "Biceps brachial", "Brachial"],
    why: "Les tractions développent le dos et les bras avec le poids du corps. Elles demandent de coordonner les omoplates et les coudes, ce qui en fait un mouvement de tirage complet et très transférable.",
    steps: ["Suspendez-vous à la barre avec une prise légèrement plus large que les épaules.", "Abaissez les épaules avant de tirer pour engager le dos.", "Tirez les coudes vers les côtes sans donner d’élan.", "Amenez le menton au niveau de la barre avec le tronc gainé.", "Redescendez lentement jusqu’à une suspension contrôlée."],
    breathing: "Expirez pendant la montée. Inspirez pendant la descente contrôlée.", tempo: { value: "2 - 1 - 3", detail: ["2 secondes de tirage", "1 seconde en haut", "3 secondes de descente"] },
    tips: ["Commencez avec une assistance si nécessaire.", "Gardez les jambes calmes et le bassin gainé.", "Pensez à rapprocher les coudes des côtes.", "Évitez de hausser les épaules.", "Conservez une amplitude maîtrisée."],
    mistakes: ["Utiliser un balancement pour franchir la barre.", "Tirer seulement avec les biceps.", "Raccourcir la descente.", "Projeter excessivement la tête en avant.", "Perdre le gainage du tronc."],
  },
  {
    slug: "barbell-deadlift", nameFr: "Soulevé de terre avec barre", watchDisplayName: "Soulevé de terre",
    equipmentFr: ["Barre olympique", "Disques"], movementPatternFr: "Charnière de hanche", exerciseTypeFr: "Polyarticulaire",
    primary: ["Grand fessier", "Ischio-jambiers", "Érecteurs du rachis"], secondary: ["Quadriceps", "Grand dorsal", "Trapèzes", "Fléchisseurs des avant-bras"],
    why: "Le soulevé de terre entraîne l’extension de hanche et le gainage sous charge. Il sollicite toute la chaîne postérieure tout en apprenant à déplacer une charge lourde avec une colonne stable.",
    steps: ["Placez vos pieds sous la barre, largeur de hanches.", "Poussez les hanches vers l’arrière et saisissez la barre près des tibias.", "Verrouillez le tronc, gardez le dos neutre et engagez les dorsaux.", "Poussez le sol pour monter la barre près du corps jusqu’à vous tenir droit.", "Ramenez les hanches vers l’arrière et reposez la barre avec contrôle."],
    breathing: "Inspirez et gainez avant de décoller la barre. Expirez après le passage du point difficile, en gardant le tronc stable.", tempo: { value: "2 - 1 - 3", detail: ["2 secondes de montée", "1 seconde debout, sans hyperextension", "3 secondes de descente contrôlée"] },
    tips: ["Gardez la barre proche des jambes.", "Poussez le sol plutôt que de tirer avec le bas du dos.", "Fixez la colonne avant chaque répétition.", "Utilisez une charge compatible avec une technique stable.", "Réinitialisez votre placement au sol si nécessaire."],
    mistakes: ["Arrondir le bas du dos.", "Éloigner la barre du corps.", "Tirer avec des hanches trop basses ou trop hautes.", "Hyperétendre le dos en haut.", "Rebondir la barre au sol."],
  },
  {
    slug: "barbell-shoulder-press", nameFr: "Développé militaire avec barre", watchDisplayName: "Développé militaire",
    equipmentFr: ["Barre olympique", "Rack"], movementPatternFr: "Poussée verticale", exerciseTypeFr: "Polyarticulaire",
    primary: ["Deltoïde antérieur", "Deltoïde latéral"], secondary: ["Triceps brachial", "Trapèze supérieur", "Dentelé antérieur"],
    why: "Le développé militaire avec barre renforce les épaules et les triceps en poussée verticale. Réalisé debout, il demande aussi une bonne stabilité du tronc et du bassin.",
    steps: ["Placez la barre à hauteur du haut de poitrine, mains légèrement plus larges que les épaules.", "Serrez les fessiers et gainez le tronc avant de pousser.", "Poussez la barre verticalement en laissant la tête passer sous la barre.", "Terminez bras tendus, sans cambrer le bas du dos.", "Redescendez la barre sous contrôle au niveau des clavicules."],
    breathing: "Inspirez et gainez avant la poussée. Expirez en passant le point difficile, sans perdre le gainage.", tempo: { value: "2 - 1 - 3", detail: ["2 secondes de poussée", "1 seconde de stabilité en haut", "3 secondes de descente"] },
    tips: ["Gardez les côtes basses.", "Montez la barre près du visage, sans la contourner largement.", "Utilisez un rack pour un départ sûr.", "Serrez les fessiers pendant toute la répétition.", "Choisissez une prise qui laisse les avant-bras verticaux."],
    mistakes: ["Cambrer excessivement le bas du dos.", "Pousser la barre loin devant vous.", "Hausser les épaules sans contrôle.", "Utiliser les jambes pour transformer le mouvement en push press.", "Descendre la barre trop vite."],
  },
  {
    slug: "side-lateral-raise", nameFr: "Élévation latérale avec haltères", watchDisplayName: "Élévations latérales",
    equipmentFr: ["Haltères"], movementPatternFr: "Abduction de l’épaule", exerciseTypeFr: "Isolation",
    primary: ["Deltoïde latéral"], secondary: ["Supra-épineux", "Trapèze supérieur", "Dentelé antérieur"],
    why: "L’élévation latérale cible le deltoïde latéral, indispensable pour développer la largeur des épaules. Une charge modérée et une trajectoire contrôlée sont plus efficaces qu’un mouvement lourd et balancé.",
    steps: ["Tenez-vous debout, haltères le long du corps et paumes face aux cuisses.", "Gainez le tronc et laissez les épaules basses.", "Élevez les bras sur les côtés avec les coudes légèrement fléchis.", "Arrêtez-vous près de la hauteur des épaules sans hausser les trapèzes.", "Redescendez les haltères lentement jusqu’à la position de départ."],
    breathing: "Expirez pendant l’élévation. Inspirez pendant la descente contrôlée.", tempo: { value: "2 - 1 - 3", detail: ["2 secondes de montée", "1 seconde de contrôle en haut", "3 secondes de descente"] },
    tips: ["Gardez les poignets neutres.", "Montez dans le plan des omoplates, légèrement vers l’avant.", "Conservez le buste immobile.", "Utilisez une charge qui ne vous fait pas hausser les épaules.", "Préférez une amplitude propre à une amplitude forcée."],
    mistakes: ["Balancer le buste.", "Lever les haltères au-dessus de la ligne des épaules.", "Hausser les épaules vers les oreilles.", "Verrouiller les coudes.", "Utiliser une charge trop lourde."],
  },
  {
    slug: "barbell-curl", nameFr: "Curl avec barre", watchDisplayName: "Curl barre",
    equipmentFr: ["Barre droite"], movementPatternFr: "Flexion du coude", exerciseTypeFr: "Isolation",
    primary: ["Biceps brachial", "Brachial"], secondary: ["Brachio-radial", "Fléchisseurs de l’avant-bras"],
    why: "Le curl avec barre permet de travailler les fléchisseurs du coude avec une charge stable. La barre facilite une progression régulière, à condition de garder les coudes et le buste fixes.",
    steps: ["Tenez la barre devant les cuisses avec une prise supination, mains largeur d’épaules.", "Gardez les coudes proches du torse et le tronc gainé.", "Fléchissez les coudes pour monter la barre sans avancer les épaules.", "Contractez les biceps en haut sans vous pencher en arrière.", "Redescendez la barre lentement jusqu’aux cuisses."],
    breathing: "Expirez pendant la montée. Inspirez pendant la descente.", tempo: { value: "2 - 1 - 3", detail: ["2 secondes de montée", "1 seconde de contraction", "3 secondes de descente"] },
    tips: ["Gardez les poignets dans l’axe.", "Évitez de verrouiller les genoux.", "Choisissez une prise confortable pour les poignets.", "Contrôlez le bas du mouvement.", "Gardez les épaules en arrière et basses."],
    mistakes: ["Balancer le buste.", "Avancer les coudes pour aider la barre.", "Casser les poignets.", "Utiliser une amplitude partielle.", "Descendre la barre trop vite."],
  },
  {
    slug: "concentration-curls", nameFr: "Curl concentration", watchDisplayName: "Curl concentration",
    equipmentFr: ["Haltère", "Banc"], movementPatternFr: "Flexion unilatérale du coude", exerciseTypeFr: "Isolation",
    primary: ["Biceps brachial", "Brachial"], secondary: ["Brachio-radial", "Fléchisseurs de l’avant-bras"],
    why: "Le curl concentration réduit l’aide du buste en stabilisant le coude contre la cuisse. Il aide à ressentir précisément le travail du biceps bras par bras.",
    steps: ["Asseyez-vous, jambes écartées, avec un haltère dans une main.", "Placez le coude du bras actif contre l’intérieur de la cuisse.", "Laissez le bras s’allonger sans verrouiller brusquement le coude.", "Montez l’haltère en gardant l’épaule et le coude fixes.", "Contractez en haut puis redescendez avec contrôle avant de changer de côté."],
    breathing: "Expirez en montant l’haltère. Inspirez à la descente.", tempo: { value: "2 - 1 - 3", detail: ["2 secondes de montée", "1 seconde de contraction", "3 secondes de descente"] },
    tips: ["Garder le dos stable, sans vous tordre.", "Ne décollez pas le coude de la cuisse.", "Utilisez une charge légère à modérée.", "Gardez le poignet neutre.", "Faites le même nombre de répétitions de chaque côté."],
    mistakes: ["Décoller le coude de la cuisse.", "Tirer avec l’épaule.", "Balancer l’haltère.", "Tourner excessivement le poignet.", "Raccourcir la descente."],
  },
  {
    slug: "triceps-pushdown", nameFr: "Extension triceps à la poulie", watchDisplayName: "Triceps poulie",
    equipmentFr: ["Poulie haute", "Barre droite"], movementPatternFr: "Extension du coude", exerciseTypeFr: "Isolation",
    primary: ["Triceps brachial"], secondary: ["Anconé", "Deltoïde postérieur", "Extenseurs de l’avant-bras"],
    why: "L’extension à la poulie maintient une résistance régulière sur les triceps. Elle permet de travailler l’extension du coude sans charger lourdement les épaules.",
    steps: ["Placez-vous face à la poulie haute et saisissez la barre.", "Gardez les coudes serrés contre les côtes et le buste stable.", "Commencez avec les avant-bras fléchis, mains près du bas de poitrine.", "Tendez les coudes jusqu’à amener la barre vers les cuisses.", "Remontez lentement sans laisser les coudes partir vers l’avant."],
    breathing: "Expirez lorsque vous tendez les coudes. Inspirez au retour.", tempo: { value: "2 - 1 - 3", detail: ["2 secondes d’extension", "1 seconde de contraction", "3 secondes de retour"] },
    tips: ["Fixez les bras le long du corps.", "Gardez les poignets neutres.", "Avancez légèrement un pied si cela stabilise votre posture.", "Laissez les épaules basses.", "Contrôlez le retour de la charge."],
    mistakes: ["Écarter les coudes.", "Se pencher sur la charge.", "Utiliser le buste pour pousser.", "Casser les poignets.", "Laisser la pile de poids claquer."],
  },
  {
    slug: "lying-triceps-press", nameFr: "Extension triceps allongé avec barre EZ", watchDisplayName: "Extension EZ",
    equipmentFr: ["Barre EZ", "Banc plat"], movementPatternFr: "Extension du coude", exerciseTypeFr: "Isolation",
    primary: ["Triceps brachial"], secondary: ["Anconé", "Deltoïde postérieur", "Extenseurs de l’avant-bras"],
    why: "L’extension triceps allongée permet de solliciter les triceps avec une grande amplitude de flexion du coude. La barre EZ offre une prise souvent plus confortable pour les poignets.",
    steps: ["Allongez-vous sur un banc, bras tendus et barre EZ au-dessus des épaules.", "Gardez les bras supérieurs stables, légèrement inclinés vers l’arrière si nécessaire.", "Fléchissez les coudes pour descendre la barre de façon contrôlée près du front.", "Tendez les coudes pour ramener la barre au-dessus des épaules.", "Gardez les épaules calées sur le banc pendant toute la série."],
    breathing: "Inspirez pendant la descente. Expirez en tendant les coudes.", tempo: { value: "3 - 1 - 2", detail: ["3 secondes de descente", "1 seconde de contrôle bas", "2 secondes d’extension"] },
    tips: ["Utilisez les angles de la barre EZ les plus confortables.", "Gardez les coudes orientés vers le plafond.", "Travaillez avec une charge contrôlable.", "Préservez une trajectoire régulière.", "Utilisez un observateur si vous approchez de l’échec."],
    mistakes: ["Écarter les coudes.", "Descendre la barre trop vite vers le visage.", "Déplacer les épaules pour aider la répétition.", "Choisir une charge excessive.", "Perdre la prise sur la barre."],
  },
];

function format(path: string): MediaFormat { return path.endsWith(".webp") ? "WEBP" : "OTHER"; }
function entries(slug: string) {
  const root = `/media/exercises/${slug}`;
  return [
    ["THUMBNAIL", `${root}/thumbnail.webp`], ["START", `${root}/start.webp`], ["MID", `${root}/mid.webp`],
    ["CONTRACTION", `${root}/contraction.webp`], ["ANIMATION", `${root}/animation.webm`], ["ANIMATION", `${root}/animation.webp`],
    ["ANATOMY_PRIMARY", `${root}/anatomy-primary.webp`], ["ANATOMY_SECONDARY", `${root}/anatomy-secondary.webp`],
  ] as const;
}

async function main() {
  const report: Array<{ slug: string; action: string; media: number }> = [];
  for (const sheet of sheets) {
    const exercise = await prisma.exercise.findUnique({ where: { slug: sheet.slug }, select: { id: true } });
    const assets = entries(sheet.slug);
    const missing = assets.filter(([, path]) => !existsSync(join(process.cwd(), "public", path)));
    if (!exercise) { report.push({ slug: sheet.slug, action: "missing-exercise", media: 0 }); continue; }
    if (missing.length) { report.push({ slug: sheet.slug, action: `missing-media:${missing.length}`, media: 0 }); continue; }
    if (apply) await prisma.$transaction(async (tx) => {
      await tx.exercise.update({ where: { id: exercise.id }, data: {
        nameFr: sheet.nameFr, watchDisplayName: sheet.watchDisplayName, equipmentFr: sheet.equipmentFr,
        movementPatternFr: sheet.movementPatternFr, exerciseTypeFr: sheet.exerciseTypeFr,
        primaryMusclesFr: sheet.primary, secondaryMuscles: sheet.secondary, whyFr: sheet.why,
        executionStepsFr: sheet.steps, breathingFr: sheet.breathing, technicalTempo: sheet.tempo as Prisma.InputJsonValue,
        tipsFr: sheet.tips, commonMistakesFr: sheet.mistakes, technicalSheetStatus: "READY",
        fallbackThumbnailPath: `/media/exercises/${sheet.slug}/thumbnail.webp`, fallbackImagePath: `/media/exercises/${sheet.slug}/start.webp`,
        fallbackAnimationPath: `/media/exercises/${sheet.slug}/animation.webp`, primaryAnimationPath: `/media/exercises/${sheet.slug}/animation.webm`,
      } });
      for (const [index, [role, publicUrl]] of entries(sheet.slug).entries()) {
        const anatomy = role === "ANATOMY_PRIMARY" || role === "ANATOMY_SECONDARY";
        const data = { type: role === "THUMBNAIL" ? "THUMBNAIL" as const : role === "ANIMATION" ? "ANIMATION" as const : "IMAGE" as const,
          role, format: format(publicUrl), storagePath: publicUrl.slice(1), publicUrl, mediaStatus: anatomy ? "REVIEW_REQUIRED" as const : "READY" as const,
          humanReviewStatus: anatomy ? "PENDING" as const : "APPROVED" as const, characterProfile: anatomy ? null : "TRAKNIO_MALE_V1",
          brandingRequired: !anatomy, isPrimary: role === "THUMBNAIL", isLoop: role === "ANIMATION", sortOrder: index };
        await tx.exerciseMedia.upsert({ where: { exerciseId_role_format: { exerciseId: exercise.id, role, format: format(publicUrl) } }, create: { exerciseId: exercise.id, ...data }, update: data });
      }
    });
    report.push({ slug: sheet.slug, action: apply ? "upserted" : "would-upsert", media: assets.length });
  }
  console.table(report);
}
main().finally(() => prisma.$disconnect());
