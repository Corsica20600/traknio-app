import { connection } from "next/server";
import { ActiveProgramCard } from "@/src/components/programs/active-program-card";
import { ProgramBuilder } from "@/src/components/programs/program-builder";
import { ProgramsOnboarding } from "@/src/components/programs/programs-onboarding";
import { parseOnboardingState } from "@/src/lib/onboarding";
import { PageHeader } from "@/src/components/ui/page-header";
import { prisma } from "@/src/lib/prisma";
import { getOrCreateDemoProfile } from "@/src/server/fitness-queries";
import { privatePageMetadata } from "@/src/lib/private-page-metadata";
import { accessibleProgramWhere } from "@/src/server/trial-program-access";
import { hasFullAccess } from "@/src/lib/premium-access-rules";
import { startWorkoutSessionAction } from "@/src/server/fitness-actions";

export const metadata = privatePageMetadata("Programmes", "Crée et personnalise tes séances Traknio.");

export default async function ProgramsPage() {
  await connection();
  const profile = await getOrCreateDemoProfile();
  const fullAccess = hasFullAccess(profile);
  // List only: details and exercise catalogue are loaded when the user opens them.
  const programs = await prisma.program.findMany({
    where: await accessibleProgramWhere(prisma, profile), orderBy: { createdAt: "desc" },
    select: { id: true, name: true, description: true, status: true, sessionsPerWeek: true, days: { orderBy: { dayIndex: "asc" }, select: { id: true, title: true, _count: { select: { exercises: true } } } } },
  });
  const active = programs.find(p => p.status === "ACTIVE") ?? null;
  const preferences = { goal: String(profile.primaryGoal), level: String(profile.trainingLevel), sessionsPerWeek: profile.sessionsPerWeek ?? 3 };
  return <div className="stack">
    <PageHeader eyebrow="Tes entraînements" title="Mes programmes" description="Choisis ton programme ou compose tes prochaines séances." />
    <ActiveProgramCard program={active} totalExercises={active?.days.reduce((n, d) => n + d._count.exercises, 0) ?? 0} nextSessionTitle={active?.days[0]?.title ?? null} />
    {!fullAccess ? <p className="card">Ton essai comprend un programme modifiable et ses séances sur téléphone et montre. Le catalogue complet, le coach et le suivi avancé sont réservés aux abonnés.</p> : null}
    {fullAccess || !programs.length ? <div className="card"><ProgramBuilder accountId={profile.id} profile={preferences} /></div> : null}
    {!programs.length ? <p className="muted">Ton premier programme commence ici : avec l’IA, un modèle de structure ou tes propres exercices.</p> : null}
    {programs.map(program => <section className="card" id={`program-${program.id}`} key={program.id}>
      <p className="eyebrow">{program.status === "ACTIVE" ? "Programme actif" : program.status === "ARCHIVED" ? "Archivé" : "Enregistré"}</p>
      <h2>{program.name}</h2>
      <p className="muted">{program.days.length} séance{program.days.length > 1 ? "s" : ""} · {program.days.reduce((n, d) => n + d._count.exercises, 0)} exercices</p>
      <div className="chips">{program.days.map(day => <span className="chip" key={day.id}>{day.title} · {day._count.exercises}</span>)}</div>
      <div className="stack">{program.days.filter(day => day._count.exercises > 0).map(day => <form action={startWorkoutSessionAction} key={day.id}>
        <input type="hidden" name="programId" value={program.id} />
        <input type="hidden" name="programDayId" value={day.id} />
        <button type="submit" className="ghost-btn">Démarrer {day.title}</button>
      </form>)}</div>
      <ProgramBuilder accountId={profile.id} profile={preferences} programId={program.id} canDelete={fullAccess} />
    </section>)}
    <ProgramsOnboarding onboarding={{ version: profile.onboardingVersion, state: parseOnboardingState(profile.onboardingState) }} programs={programs.length} exercises={programs.reduce((total, program) => total + program.days.reduce((n, day) => n + day._count.exercises, 0), 0)} />
  </div>;
}
