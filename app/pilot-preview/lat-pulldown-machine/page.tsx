import { LatPulldownMachinePilot } from "@/src/components/exercise/lat-pulldown-machine-pilot";
import { addExerciseToProgramDayAction } from "@/src/server/fitness-actions";

export const metadata = {
  title: "Pilote V2 · Lat Pulldown Machine · Traknio",
  robots: { index: false, follow: false },
};

/** Isolated, unauthenticated visual review route. It does not expose catalog data or create program entries. */
export default function LatPulldownMachinePilotPreview() {
  return <LatPulldownMachinePilot addToProgramAction={addExerciseToProgramDayAction} />;
}
