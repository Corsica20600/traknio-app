import Link from "next/link";
import { ExerciseAddToProgram } from "@/src/components/exercise/exercise-add-to-program";
import { ExerciseAnatomy } from "@/src/components/exercise/exercise-anatomy";
import { ExerciseBreathingTempo } from "@/src/components/exercise/exercise-breathing-tempo";
import { ExerciseDemo } from "@/src/components/exercise/exercise-demo";
import { ExerciseExecution } from "@/src/components/exercise/exercise-execution";
import { ExerciseHero } from "@/src/components/exercise/exercise-hero";
import { ExerciseMistakes } from "@/src/components/exercise/exercise-mistakes";
import { ExerciseTips } from "@/src/components/exercise/exercise-tips";
import { ExerciseWhy } from "@/src/components/exercise/exercise-why";
import type { ExerciseGuidePilot } from "@/src/lib/exercise-pilots";
import styles from "./lat-pulldown-machine-pilot.module.css";

type ProgramOption = { id: string; name: string; days: Array<{ id: string; dayIndex: number; title: string }> };

export function ExerciseTechnicalSheet({
  guide,
  exerciseId,
  programs = [],
  addToProgramAction,
}: {
  guide: ExerciseGuidePilot;
  exerciseId?: string;
  programs?: ProgramOption[];
  addToProgramAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <article className={`trk-public technicalSheetPilot ${styles.screen}`} aria-label={`Fiche technique ${guide.canonicalName}`}>
      <ExerciseHero canonicalName={guide.canonicalName} displayNameFr={guide.displayNameFr} badges={[guide.category, guide.equipment, guide.movementPattern, guide.exerciseType]} showBranding={false} />
      <div className={styles.flow}>
        <ExerciseWhy>{guide.why}</ExerciseWhy>
        <ExerciseDemo start={guide.mediaStart} end={guide.mediaEnd} animation={guide.mediaAnimation} idPrefix={guide.slug} />
        <ExerciseAnatomy primaryMuscles={guide.primaryMuscles} secondaryMuscles={guide.secondaryMuscles} primaryMedia={guide.anatomyPrimaryMedia} secondaryMedia={guide.anatomySecondaryMedia} status={guide.anatomyStatus} />
        <ExerciseExecution steps={guide.steps} />
        <ExerciseBreathingTempo breathing={guide.breathing} tempo={guide.tempo} />
        <div className={styles.guidanceGrid}><ExerciseTips items={guide.tips} /><ExerciseMistakes items={guide.mistakes} /></div>
        <ExerciseAddToProgram exerciseId={exerciseId} programs={programs} action={addToProgramAction} />
      </div>
      <footer className={styles.footer}><span>TRAKNIO</span><p>Fitness <i /> Santé <i /> Progression <i /> Liberté</p><Link href="/exercises" className={styles.backLink}>Retour catalogue</Link></footer>
    </article>
  );
}
