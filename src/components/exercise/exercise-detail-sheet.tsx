import Image from "next/image";
import type { ReactNode } from "react";
import { ExerciseVisual } from "@/src/components/exercise/exercise-visual";
import { BRAND } from "@/src/lib/brand";

type MediaLike = {
  type: "IMAGE" | "THUMBNAIL" | "ANIMATION";
  publicUrl?: string | null;
  url?: string | null;
  format?: string | null;
};

type ExerciseDetailSheetProps = {
  title: string;
  subtitle: string;
  categoryLabel: string;
  difficultyLabel: string;
  muscles: {
    primary: string[];
    secondary: string[];
  };
  equipment: string[];
  visual: {
    media: MediaLike[];
    fallbackImage?: string | null;
    fallbackAnimation?: string | null;
    frameAnimationUrls?: string[];
    frameIntervalMs?: number;
    detailImage?: string | null;
  };
  content: {
    sourceNote: string;
    stepTitles: string[];
    steps: string[];
    keyPoints: string[];
    mistakes: string[];
  };
  tips: string[];
  addToProgramSlot: ReactNode;
  backSlot: ReactNode;
};

function PanelList({ items, tone = "blue" }: { items: string[]; tone?: "blue" | "green" | "gold" | "red" }) {
  return (
    <ul className={`exercise-tech-list exercise-tech-list--${tone}`}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function ExerciseDetailSheet({
  title,
  subtitle,
  categoryLabel,
  difficultyLabel,
  muscles,
  equipment,
  visual,
  content,
  tips,
  addToProgramSlot,
  backSlot,
}: ExerciseDetailSheetProps) {
  const mainMuscle = muscles.primary[0] || "Full body";
  const summaryItems = [
    { label: "Objectif", value: categoryLabel },
    { label: "Niveau", value: difficultyLabel },
    { label: "Cible", value: mainMuscle },
    { label: "Matériel", value: equipment.join(" · ") || "Poids du corps" },
  ];

  return (
    <div className="stack exercise-detail-screen">
      <section className="exercise-tech-hero">
        <div className="exercise-tech-hero__copy">
          <p className="exercise-tech-brand">{BRAND.name} · Fiche technique</p>
          <h1>
            {title}
            <span>{mainMuscle}</span>
          </h1>
          <p>{subtitle}</p>
          <div className="exercise-tech-pills" aria-label="Résumé exercice">
            {summaryItems.map((item) => (
              <span key={item.label}>
                <strong>{item.label}</strong>
                {item.value}
              </span>
            ))}
          </div>
        </div>
        <div className="exercise-tech-hero__visual">
          <ExerciseVisual
            media={visual.media}
            fallbackAnimation={visual.fallbackAnimation}
            fallbackImage={visual.fallbackImage}
            frameAnimationUrls={visual.frameAnimationUrls}
            frameIntervalMs={visual.frameIntervalMs ?? 700}
            context="TECHNICAL_SHEET"
            title={title}
          />
        </div>
      </section>

      <section className="exercise-tech-summary">
        {summaryItems.map((item) => (
          <article key={item.label} className="exercise-tech-mini-card">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      {visual.detailImage ? (
        <section className="exercise-tech-panel exercise-tech-visual-guide">
          <div className="exercise-tech-section-head">
            <span>Guide visuel</span>
            <h2>Lecture rapide du mouvement</h2>
          </div>
          <Image
            src={visual.detailImage}
            alt={`Guide visuel ${title}`}
            className="exercise-guide-infographic"
            width={1280}
            height={720}
          />
        </section>
      ) : null}

      <section className="exercise-tech-panel">
        <div className="exercise-tech-section-head">
          <span>Exécution</span>
          <h2>Étapes du mouvement</h2>
        </div>
        <div className="exercise-steps-grid">
          {content.steps.map((step, index) => (
            <article key={`${content.stepTitles[index] ?? "Étape"}-${step}`} className="exercise-step-card">
              <div className="exercise-step-badge">{index + 1}</div>
              <p className="exercise-step-title">{content.stepTitles[index] ?? `Étape ${index + 1}`}</p>
              <p>{step}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="exercise-pro-panels">
        <article className="exercise-tech-panel exercise-tech-panel--green">
          <div className="exercise-tech-section-head">
            <span>À retenir</span>
            <h2>Points clés</h2>
          </div>
          <PanelList items={content.keyPoints} tone="green" />
        </article>

        <article className="exercise-tech-panel exercise-tech-panel--blue">
          <div className="exercise-tech-section-head">
            <span>Anatomie</span>
            <h2>Muscles sollicités</h2>
          </div>
          <div className="exercise-muscle-stack">
            <p><strong>Principaux</strong>{muscles.primary.join(" · ") || "Full body"}</p>
            <p><strong>Secondaires</strong>{muscles.secondary.join(" · ") || "Aucun"}</p>
          </div>
        </article>

        <article className="exercise-tech-panel exercise-tech-panel--gold">
          <div className="exercise-tech-section-head">
            <span>Réglages</span>
            <h2>Conseils pratiques</h2>
          </div>
          <PanelList items={tips} tone="gold" />
        </article>

        <article className="exercise-tech-panel exercise-tech-panel--red">
          <div className="exercise-tech-section-head">
            <span>Sécurité</span>
            <h2>Erreurs à éviter</h2>
          </div>
          <PanelList items={content.mistakes} tone="red" />
        </article>
      </section>

      <section className="exercise-tech-panel exercise-program-panel">
        <div className="exercise-tech-section-head">
          <span>Programme</span>
          <h2>Ajouter cet exercice</h2>
        </div>
        {addToProgramSlot}
        {backSlot}
      </section>
    </div>
  );
}
