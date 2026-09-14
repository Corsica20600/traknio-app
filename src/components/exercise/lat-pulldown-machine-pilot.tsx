import { ExerciseTechnicalSheet } from "@/src/components/exercise/exercise-technical-sheet";
import { LAT_PULLDOWN_MACHINE_PILOT, type ExerciseGuidePilot } from "@/src/lib/exercise-pilots";

type ProgramOption = { id: string; name: string; days: Array<{ id: string; dayIndex: number; title: string }> };

export function LatPulldownMachinePilot({
  guide = LAT_PULLDOWN_MACHINE_PILOT,
  exerciseId,
  programs = [],
  addToProgramAction,
}: {
  guide?: ExerciseGuidePilot;
  exerciseId?: string;
  programs?: ProgramOption[];
  addToProgramAction: (formData: FormData) => void | Promise<void>;
}) {
  return <ExerciseTechnicalSheet guide={guide} exerciseId={exerciseId} programs={programs} addToProgramAction={addToProgramAction} />;
}
