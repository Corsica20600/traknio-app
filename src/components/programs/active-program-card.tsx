import Link from "next/link";
import { PrimaryButton } from "@/src/components/ui/primary-button";

type ActiveProgramCardProps = {
  program: {
    id: string;
    name: string;
    description: string | null;
    sessionsPerWeek: number;
    days: Array<{ id: string; title: string }>;
  } | null;
  totalExercises: number;
  nextSessionTitle?: string | null;
};

export function ActiveProgramCard({ program, totalExercises, nextSessionTitle }: ActiveProgramCardProps) {
  if (!program) {
    return (
      <section className="active-program-card active-program-card--empty">
        <p className="eyebrow">Programme actif</p>
        <h2>Aucun programme actif</h2>
        <p className="muted">Active un programme pour retrouver rapidement ta structure d&apos;entraînement.</p>
      </section>
    );
  }

  return (
    <section className="active-program-card">
      <div>
        <p className="eyebrow">Programme actif</p>
        <h2>{program.name}</h2>
        {program.description ? <p className="muted">{program.description}</p> : null}
      </div>
      <div className="program-card-metrics">
        <span><b>{program.days.length}</b> séances</span>
        <span><b>{totalExercises}</b> exercices</span>
        <span><b>{program.sessionsPerWeek}</b> / semaine</span>
        <span><b>{nextSessionTitle ?? "N/A"}</b> prochaine</span>
      </div>
      <div className="grid-2">
        <Link href="/workout">
          <PrimaryButton className="premium-glow">Continuer</PrimaryButton>
        </Link>
        <a href={`#program-${program.id}`} className="outline-link">Voir le programme</a>
      </div>
    </section>
  );
}
