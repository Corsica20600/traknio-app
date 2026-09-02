import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { BRAND } from "@/src/lib/brand";
import { PublicHeader } from "./public-header";

const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.traknio.app";
const GOOGLE_PLAY_BADGE_URL = "https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png";

const proofItems = [
  {
    title: "Programme IA personnalisé",
    text: "Objectif, niveau, matériel, exercices et progression construits pour ton rythme.",
  },
  {
    title: "Charges mémorisées",
    text: "Chaque poids modifié pendant la séance devient ta nouvelle référence.",
  },
  {
    title: "Galaxy Watch synchronisée",
    text: "Validation, repos, poids et séries restent alignés entre téléphone et montre.",
  },
  {
    title: "Health Connect + Spotify",
    text: "Récupération quotidienne et contrôle musical intégrés à l'expérience.",
  },
] as const;

const programPoints = [
  "Objectifs et niveau pris en compte",
  "Exercices adaptés à ton matériel",
  "Séries, répétitions et temps de repos",
  "Évolution progressive du programme",
] as const;

const watchPoints = [
  "Exercice actuel, séries et répétitions",
  "Validation depuis la montre",
  "Modification des charges",
  "Minuterie de repos avec +15 s et -15 s",
] as const;

const recoveryMetrics = [
  { label: "Sommeil", value: "7 h 24" },
  { label: "FC repos", value: "58 bpm" },
  { label: "Calories", value: "2 140 kcal" },
  { label: "Score", value: "82" },
] as const;

const pricingFeatures = [
  "Programme IA personnalisé",
  "Séances illimitées",
  "Suivi des charges",
  "Galaxy Watch",
  "Health Connect",
  "Statistiques complètes",
  "Connecteur Spotify",
  "Améliorations incluses",
] as const;

const advantageItems = [
  {
    title: "Poids synchronisés instantanément",
    text: "Tu changes une charge sur le téléphone ou la montre, l'autre écran suit sans attendre.",
  },
  {
    title: "Exercice remplaçable en séance",
    text: "Machine occupée, douleur, matériel manquant : tu adaptes le programme sans repartir de zéro.",
  },
  {
    title: "Dernières valeurs reprises",
    text: "La séance suivante repart automatiquement sur les poids que tu as réellement utilisés.",
  },
  {
    title: "Séance au poignet",
    text: "Valide tes séries, ajuste le repos et garde le rythme sans manipuler le téléphone.",
  },
  {
    title: "Récupération contextualisée",
    text: "Sommeil, fréquence cardiaque, calories et distance donnent une lecture rapide de ton état du jour.",
  },
  {
    title: "Progression gamifiée",
    text: "Historique, volume, séries, XP et records rendent tes efforts lisibles au fil des semaines.",
  },
] as const;

const faqItems = [
  {
    question: "Traknio fonctionne-t-il sans Galaxy Watch ?",
    answer: "Oui. La montre enrichit la séance au poignet, mais le suivi complet reste disponible sur smartphone.",
  },
  {
    question: "Les charges modifiées sont-elles conservées ?",
    answer: "Oui. Quand tu ajustes une charge pendant un exercice, Traknio la reprend automatiquement à la séance suivante.",
  },
  {
    question: "Puis-je modifier un programme créé par l'IA ?",
    answer: "Oui. Tu peux adapter exercices, séries, répétitions et repos sans perdre la cohérence du programme.",
  },
  {
    question: "Quelles données Health Connect sont utilisées ?",
    answer: "Traknio peut utiliser le sommeil, la fréquence cardiaque, les calories totales brûlées et la distance pour éclairer la récupération.",
  },
  {
    question: "Traknio fonctionne-t-il sans Spotify ?",
    answer: "Oui. Spotify est optionnel et sert uniquement à garder le contrôle de ta musique pendant l'entraînement.",
  },
  {
    question: "Puis-je résilier mon abonnement à tout moment ?",
    answer: "Oui. La gestion de l'abonnement se fait depuis la plateforme de paiement utilisée lors de l'inscription.",
  },
  {
    question: "Mes données sont-elles privées ?",
    answer: "Oui. Les données servent à ton suivi sportif et aux fonctionnalités que tu actives. Tu peux consulter la politique de confidentialité.",
  },
] as const;

export const metadata: Metadata = {
  title: "Traknio - Coach IA de musculation et suivi sportif",
  description:
    "Application premium de musculation avec programmes IA, suivi des charges, Galaxy Watch, Health Connect, Spotify et statistiques de progression.",
  alternates: {
    canonical: "https://www.traknio.com",
  },
  openGraph: {
    type: "website",
    url: "https://www.traknio.com",
    siteName: "Traknio",
    title: "Traknio - Progresse à chaque séance",
    description:
      "Traknio crée ton programme, suit tes performances et synchronise tes séances avec ta Galaxy Watch.",
    images: [
      {
        url: "/icons/icon-512.png",
        width: 512,
        height: 512,
        alt: "Logo Traknio",
      },
    ],
  },
};

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="trk-section-label">
      <span aria-hidden="true" />
      {children}
    </p>
  );
}

function CheckItem({ children }: { children: ReactNode }) {
  return (
    <li>
      <span aria-hidden="true">✓</span>
      {children}
    </li>
  );
}

function PhoneShot({
  src,
  alt,
  className = "",
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div className={`trk-phone-shot ${className}`}>
      <Image src={src} alt={alt} width={260} height={462} priority={priority} />
    </div>
  );
}

export default async function HomePage() {
  const session = await auth().catch(() => null);

  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: BRAND.name,
    applicationCategory: "HealthApplication",
    operatingSystem: "Android, Wear OS",
    offers: {
      "@type": "Offer",
      price: "4.99",
      priceCurrency: "EUR",
      description: "4,99 €/mois ou 39,99 €/an",
    },
    description:
      "Application premium de musculation avec programmes IA, suivi des charges, Galaxy Watch, Health Connect et Spotify.",
    url: "https://www.traknio.com",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <main className="trk-public">
        <PublicHeader isAuthenticated={Boolean(session?.user?.email)} />

        <section className="trk-hero" aria-labelledby="hero-title">
          <div className="trk-hero__copy">
            <p className="trk-badge">Ton entraînement. Ta progression. Ton application.</p>
            <h1 id="hero-title">
              <span>Progresse à chaque</span>
              <span>séance avec</span>
              <span>un coach qui</span>
              <span className="trk-gradient">se souvient de tout</span>
            </h1>
            <p className="trk-lead">
              Traknio crée ton programme, suit tes performances, mémorise tes charges et synchronise
              instantanément tes séances avec ta Galaxy Watch.
            </p>
            <div className="trk-actions">
              <a className="trk-button trk-button--primary" href="#tarifs">
                Voir les tarifs
              </a>
              <a className="trk-button trk-button--ghost" href="#fonctionnalites">
                Découvrir Traknio
              </a>
            </div>
            <a href={GOOGLE_PLAY_URL} aria-label="Télécharger Traknio sur Google Play">
              <Image src={GOOGLE_PLAY_BADGE_URL} alt="Disponible sur Google Play" width={178} height={53} />
            </a>
            <ul className="trk-trust" aria-label="Informations clés">
              <li>Programme personnalisé par IA</li>
              <li>Synchronisation Health Connect</li>
              <li>Compatible Galaxy Watch</li>
            </ul>
          </div>

          <div className="trk-hero__visual" aria-label="Aperçus de l'application Traknio">
            <div className="trk-orbit trk-orbit--blue" />
            <div className="trk-orbit trk-orbit--violet" />
            <PhoneShot
              src="/brand/traknio-phone-hero-v2.png"
              alt="Aperçu smartphone de Traknio"
              className="trk-phone-shot--hero trk-phone-shot--transparent"
              priority
            />
            <div className="trk-watch-shot">
              <Image
                src="/brand/traknio-watch-transparent.png"
                alt="Aperçu Galaxy Watch de Traknio"
                width={1024}
                height={1024}
                priority
              />
            </div>
          </div>
        </section>

        <section className="trk-proof-band" aria-label="Preuves produit">
          {proofItems.map((item) => (
            <article key={item.title}>
              <span aria-hidden="true" />
              <strong>{item.title}</strong>
              <p>{item.text}</p>
            </article>
          ))}
        </section>

        <section id="fonctionnalites" className="trk-split trk-grid-section">
          <div className="trk-section-copy trk-reveal">
            <SectionLabel>Le programme</SectionLabel>
            <h2>
              Un programme réellement <span>adapté à toi</span>
            </h2>
            <p>
              Traknio génère des séances selon ton objectif, ton niveau, ton matériel et tes
              préférences. Tu peux ensuite tout modifier sans perdre la cohérence de ton programme.
            </p>
            <ul className="trk-check-list">
              {programPoints.map((point) => (
                <CheckItem key={point}>{point}</CheckItem>
              ))}
            </ul>
          </div>
          <div className="trk-dashboard-card trk-reveal">
            <div className="trk-dashboard-card__head">
              <div>
                <strong>Semaine active</strong>
                <span>Objectif hypertrophie</span>
              </div>
              <b>IA</b>
            </div>
            <div className="trk-bars" aria-hidden="true">
              <span style={{ "--h": "62%" } as CSSProperties} />
              <span style={{ "--h": "84%" } as CSSProperties} />
              <span style={{ "--h": "48%" } as CSSProperties} />
              <span style={{ "--h": "74%" } as CSSProperties} />
              <span style={{ "--h": "58%" } as CSSProperties} />
            </div>
            <div className="trk-workout-row">
              <strong>Pecs + dos</strong>
              <span>5 exercices</span>
            </div>
            <div className="trk-workout-row">
              <strong>Jambes</strong>
              <span>Repos 120 s</span>
            </div>
          </div>
        </section>

        <section className="trk-memory trk-reveal">
          <SectionLabel>Mémoire des charges</SectionLabel>
          <div className="trk-memory__head">
            <h2>
              Ta prochaine séance reprend exactement là où tu t&apos;étais arrêté
            </h2>
            <p>
              Lorsque tu modifies une charge pendant un exercice, Traknio la conserve automatiquement
              pour la séance suivante. Plus besoin de corriger les mêmes poids à chaque entraînement.
            </p>
          </div>
          <div className="trk-memory-flow" aria-label="Démonstration de mémorisation des charges">
            <article>
              <span>Séance précédente</span>
              <strong>60 kg</strong>
            </article>
            <article className="is-active">
              <span>Modification</span>
              <strong>62,5 kg</strong>
            </article>
            <article>
              <span>Séance suivante</span>
              <strong>62,5 kg</strong>
              <small>automatiquement</small>
            </article>
          </div>
        </section>

        <section className="trk-advantages trk-reveal">
          <div className="trk-section-head">
            <SectionLabel>Avantages Traknio</SectionLabel>
            <h2>
              Les détails qui changent vraiment <span>une séance réelle</span>
            </h2>
            <p>
              Traknio ne se contente pas de générer un programme. L&apos;application garde le fil pendant
              l&apos;effort, mémorise tes ajustements et synchronise tes actions entre téléphone et montre.
            </p>
          </div>
          <div className="trk-advantages-grid">
            {advantageItems.map((item) => (
              <article className="trk-advantage-card" key={item.title}>
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="montre" className="trk-watch-section trk-split trk-split--reverse">
          <div className="trk-device-stage trk-reveal">
            <PhoneShot src="/brand/traknio-launch-reference.png" alt="Application mobile Traknio" />
            <div className="trk-watch-shot trk-watch-shot--large">
              <Image
                src="/brand/traknio-watch-transparent.png"
                alt="Interface Traknio sur Galaxy Watch"
                width={1024}
                height={1024}
              />
            </div>
          </div>
          <div className="trk-section-copy trk-reveal">
            <SectionLabel>Galaxy Watch</SectionLabel>
            <h2>
              Ta séance <span>au poignet</span>
            </h2>
            <p>
              Valide tes séries, ajuste les charges et garde le tempo sans sortir le téléphone. La
              synchronisation avec Traknio reste immédiate.
            </p>
            <ul className="trk-check-list">
              {watchPoints.map((point) => (
                <CheckItem key={point}>{point}</CheckItem>
              ))}
            </ul>
          </div>
        </section>

        <section className="trk-recovery trk-split">
          <div className="trk-section-copy trk-reveal">
            <SectionLabel>Récupération</SectionLabel>
            <h2>
              Entraîne-toi aussi selon ton état de <span>récupération</span>
            </h2>
            <p>
              Traknio met en contexte tes séances avec les données Health Connect que tu choisis de
              connecter : sommeil, fréquence cardiaque, calories totales brûlées et distance. Ce score reste un
              indicateur sportif, pas un diagnostic médical.
            </p>
          </div>
          <div className="trk-recovery-card trk-reveal">
            <div className="trk-score-ring">
              <span>82</span>
            </div>
            <strong>Bonne journée pour pousser fort.</strong>
            <div className="trk-recovery-grid">
              {recoveryMetrics.map((metric) => (
                <div key={metric.label}>
                  <span>{metric.label}</span>
                  <b>{metric.value}</b>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="progression" className="trk-progress-section">
          <div className="trk-section-head trk-reveal">
            <SectionLabel>Progression</SectionLabel>
            <h2>
              Vois clairement ce qui <span>progresse</span>
            </h2>
          </div>
          <div className="trk-progress-grid">
            <div className="trk-progress-main trk-reveal">
              <div className="trk-dashboard-card__head">
                <div>
                  <strong>Volume hebdomadaire</strong>
                  <span>Historique et records</span>
                </div>
                <b>+12%</b>
              </div>
              <div className="trk-bars trk-bars--wide" aria-hidden="true">
                <span style={{ "--h": "46%" } as CSSProperties} />
                <span style={{ "--h": "61%" } as CSSProperties} />
                <span style={{ "--h": "54%" } as CSSProperties} />
                <span style={{ "--h": "78%" } as CSSProperties} />
                <span style={{ "--h": "68%" } as CSSProperties} />
                <span style={{ "--h": "88%" } as CSSProperties} />
                <span style={{ "--h": "72%" } as CSSProperties} />
              </div>
            </div>
            {["Records", "Muscles travaillés", "XP et séries", "Historique"].map((item) => (
              <article className="trk-mini-stat trk-reveal" key={item}>
                <span>{item}</span>
                <strong>{item === "XP et séries" ? "Niveau 12" : "Suivi clair"}</strong>
              </article>
            ))}
          </div>
        </section>

        <section className="trk-ecosystem trk-reveal">
          <SectionLabel>Écosystème</SectionLabel>
          <h2>
            Tout ton entraînement dans un seul <span>écosystème</span>
          </h2>
          <div className="trk-ecosystem-line">
            {["Smartphone", "Galaxy Watch", "Health Connect", "Spotify"].map((item) => (
              <div key={item}>
                <span aria-hidden="true" />
                <strong>{item}</strong>
              </div>
            ))}
          </div>
        </section>

        <section id="tarifs" className="trk-pricing trk-reveal">
          <SectionLabel>Tarifs</SectionLabel>
          <h2>Une expérience premium, simple à lancer</h2>
          <article className="trk-price-card">
            <div className="trk-price-card__head">
              <span>Traknio Premium</span>
              <div className="trk-price-options" aria-label="Prix Traknio Premium">
                <div>
                  <strong>4,99 €</strong>
                  <small>/ mois</small>
                </div>
                <div>
                  <strong>39,99 €</strong>
                  <small>/ an</small>
                </div>
              </div>
            </div>
            <ul className="trk-check-list trk-check-list--price">
              {pricingFeatures.map((feature) => (
                <CheckItem key={feature}>{feature}</CheckItem>
              ))}
            </ul>
            <Link className="trk-button trk-button--primary" href="/login">
              Accéder à Traknio
            </Link>
          </article>
        </section>

        <section id="faq" className="trk-faq">
          <div className="trk-section-head trk-reveal">
            <SectionLabel>FAQ</SectionLabel>
            <h2>Les réponses avant ta première séance</h2>
          </div>
          <div className="trk-faq-list">
            {faqItems.map((item) => (
              <details className="trk-faq-item trk-reveal" key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="trk-final-cta trk-reveal">
          <div>
            <h2>Ta prochaine progression commence avec ta prochaine séance</h2>
            <Link className="trk-button trk-button--light" href="/login">
              Découvrir l&apos;application
            </Link>
          </div>
          <PhoneShot
            src="/brand/traknio-phone-hero-v2.png"
            alt="Aperçu final de Traknio"
            className="trk-phone-shot--transparent"
          />
        </section>

        <footer className="trk-footer">
          <div className="trk-footer__intro">
            <div className="trk-footer__brand">
              <Image
                src="/brand/traknio-logo-mark-exact.png"
                alt=""
                width={170}
                height={90}
              />
              <Image
                src="/brand/traknio-wordmark-tagline-v2.png"
                alt={`${BRAND.name} - ${BRAND.tagline}`}
                width={408}
                height={98}
              />
            </div>
            <p>Application premium de musculation et de suivi sportif.</p>
          </div>
          <div className="trk-footer__columns">
            <nav aria-label="Liens légaux">
              <strong>Légal</strong>
              <Link href="/legal/privacy">Confidentialité</Link>
              <Link href="/legal/terms">Conditions d&apos;utilisation</Link>
              <Link href="/legal/legal-notice">Mentions légales</Link>
              <Link href="/legal/data-deletion">Suppression des données</Link>
            </nav>
            <nav aria-label="Contact Traknio">
              <strong>Contact</strong>
              <Link href="/contact">Nous contacter</Link>
              <a href="mailto:contact@traknio.com">contact@traknio.com</a>
              <a href="mailto:support@traknio.com">support@traknio.com</a>
            </nav>
          </div>
          <div className="trk-footer__meta">
            <p>Édité par CorsaiManager</p>
            <span>Traknio © 2026</span>
          </div>
        </footer>
      </main>
    </>
  );
}
