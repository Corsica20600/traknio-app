import { requirePremiumAccess } from "@/src/server/premium-access";
import Link from "next/link";
import { ActiveFilterChips } from "@/src/components/exercise/active-filter-chips";
import { ExerciseCard } from "@/src/components/exercise/exercise-card";
import { ExerciseFilters } from "@/src/components/exercise/exercise-filters";
import { EmptyState } from "@/src/components/ui/empty-state";
import { GlassCard } from "@/src/components/ui/glass-card";
import { PageHeader } from "@/src/components/ui/page-header";
import { SectionTitle } from "@/src/components/ui/section-title";
import { privatePageMetadata } from "@/src/lib/private-page-metadata";
import { getActiveExercisesCount, getExerciseFilterOptions, getExercisesCatalogPage } from "@/src/server/fitness-queries";

const PAGE_SIZE = 24;
const VALID_DIFFICULTIES = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;

export const metadata = privatePageMetadata(
  "Exercices",
  "Catalogue privé des exercices Traknio, filtres et fiches détaillées.",
);

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function sanitizeDifficulty(value: string) {
  return VALID_DIFFICULTIES.includes(value as (typeof VALID_DIFFICULTIES)[number]) ? value : "";
}

function withQuery(
  page: number,
  filters: { search: string; muscle: string; equipment: string; difficulty: string },
) {
  const params = new URLSearchParams();
  if (filters.search) params.set("q", filters.search);
  if (filters.muscle) params.set("muscle", filters.muscle);
  if (filters.equipment) params.set("equipment", filters.equipment);
  if (filters.difficulty) params.set("difficulty", filters.difficulty);
  params.set("page", String(page));
  return `/exercises?${params.toString()}`;
}

function Pagination({
  page,
  totalPages,
  filters,
}: {
  page: number;
  totalPages: number;
  filters: { search: string; muscle: string; equipment: string; difficulty: string };
}) {
  const previousPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);

  return (
    <nav className="card workout-footer exercise-pagination" aria-label="Pagination des exercices">
      {page <= 1 ? (
        <span className="ghost-btn disabled" aria-disabled="true">Page précédente</span>
      ) : (
        <Link href={withQuery(previousPage, filters)} className="ghost-btn">Page précédente</Link>
      )}

      <span className="muted" aria-current="page">
        Page {page} / {totalPages}
      </span>

      {page >= totalPages ? (
        <span className="primary-button disabled" aria-disabled="true">Page suivante</span>
      ) : (
        <Link href={withQuery(nextPage, filters)} className="primary-button">Page suivante</Link>
      )}
    </nav>
  );
}

export default async function ExercisesPage(props: PageProps<"/exercises">) {
  await requirePremiumAccess();
  const searchParams = await props.searchParams;
  const search = firstParam(searchParams.q).trim();
  const muscle = firstParam(searchParams.muscle).trim();
  const equipment = firstParam(searchParams.equipment).trim();
  const difficulty = sanitizeDifficulty(firstParam(searchParams.difficulty).trim());
  const page = Math.max(1, Number(firstParam(searchParams.page) || 1) || 1);
  const activeFilters = { search, muscle, equipment, difficulty };

  let filters: Awaited<ReturnType<typeof getExerciseFilterOptions>> = {
    muscles: [],
    equipment: [],
    difficulties: [],
  };
  let result: Awaited<ReturnType<typeof getExercisesCatalogPage>> = {
    page,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
    exercises: [],
  };
  let catalogTotal = 0;

  try {
    const [filterOptions, catalogPage, activeExercisesCount] = await Promise.all([
      getExerciseFilterOptions(),
      getExercisesCatalogPage({ search, muscle, equipment, difficulty, page, pageSize: PAGE_SIZE }),
      getActiveExercisesCount(),
    ]);
    filters = filterOptions;
    result = catalogPage;
    catalogTotal = activeExercisesCount;
  } catch (error) {
    console.error("[exercises-page] failed to load exercises catalog", error);
  }

  const firstResult = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const lastResult = Math.min(result.total, result.page * result.pageSize);
  const hasActiveFilters = Boolean(search || muscle || equipment || difficulty);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Catalogue premium"
        title="Exercices"
        description={`${catalogTotal} exercices actifs, filtrés côté serveur pour garder une navigation fluide même avec un gros catalogue.`}
      />

      <GlassCard elevated>
        <Link href="/workout" className="primary-button premium-glow full-width">
          Démarrer une séance guidée
        </Link>
      </GlassCard>

      <GlassCard className="exercises-toolbar">
        <SectionTitle
          eyebrow="Recherche"
          title="Trouver le bon mouvement"
        />
        <ExerciseFilters
          search={search}
          muscle={muscle}
          equipment={equipment}
          difficulty={difficulty}
          filters={filters}
        />
        <ActiveFilterChips {...activeFilters} />
      </GlassCard>

      <SectionTitle
        eyebrow="Résultats"
        title={
          result.total > 0
            ? `${firstResult}-${lastResult} sur ${result.total} exercices`
            : "Aucun exercice trouvé"
        }
        action={hasActiveFilters ? <Link href="/exercises" className="outline-link">Réinitialiser</Link> : null}
      />

      {result.exercises.length > 0 ? (
        <>
          <section className="exercise-grid" aria-label="Liste des exercices">
            {result.exercises.map((exercise) => (
              <ExerciseCard key={exercise.id} exercise={exercise} />
            ))}
          </section>

          <Pagination page={result.page} totalPages={result.totalPages} filters={activeFilters} />
        </>
      ) : (
        <EmptyState
          title="Aucun exercice trouvé"
          description="Aucun mouvement ne correspond à ces filtres. Essaie une recherche plus courte ou retire un filtre."
          action={<Link href="/exercises" className="outline-link">Réinitialiser les filtres</Link>}
        />
      )}
    </div>
  );
}
