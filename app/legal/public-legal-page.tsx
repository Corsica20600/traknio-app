import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/src/lib/brand";
import { PublicHeader } from "../public-header";

type LegalSection = {
  title: string;
  items: readonly string[];
  ordered?: boolean;
};

type PublicLegalPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  updatedAt: string;
  lead: string;
  sections: readonly LegalSection[];
  noteTitle?: string;
  note?: string;
};

export function PublicLegalPage({
  eyebrow,
  title,
  description,
  updatedAt,
  lead,
  sections,
  noteTitle,
  note,
}: PublicLegalPageProps) {
  return (
    <main className="trk-public trk-public-legal">
      <PublicHeader />

      <section className="trk-legal-hero">
        <div className="trk-legal-hero__copy">
          <p className="trk-section-kicker">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="trk-legal-status" aria-label="Informations du document">
          <span>Dernière mise à jour</span>
          <strong>{updatedAt}</strong>
          <p>{lead}</p>
        </div>
      </section>

      <section className="trk-legal-grid" aria-label={title}>
        {sections.map((section) => {
          const ListTag = section.ordered ? "ol" : "ul";
          return (
            <article className="trk-legal-card" key={section.title}>
              <h2>{section.title}</h2>
              <ListTag>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ListTag>
            </article>
          );
        })}
      </section>

      {noteTitle || note ? (
        <section className="trk-legal-note">
          {noteTitle ? <h2>{noteTitle}</h2> : null}
          {note ? <p>{note}</p> : null}
          <div>
            <a href="mailto:contact@traknio.com">contact@traknio.com</a>
            <a href="mailto:support@traknio.com">support@traknio.com</a>
          </div>
        </section>
      ) : null}

      <footer className="trk-footer">
        <div className="trk-footer__intro">
          <div className="trk-footer__brand">
            <Image src="/brand/traknio-logo-mark-exact.png" alt="" width={170} height={90} />
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
  );
}
