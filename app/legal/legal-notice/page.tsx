import type { Metadata } from "next";
import { BRAND } from "@/src/lib/brand";
import { PublicLegalPage } from "../public-legal-page";

const sections = [
  { title: "Éditeur du service", items: ["Traknio est édité par CorsaiManager.", "Contact : contact@traknio.com. Assistance : support@traknio.com.", "Adresse du siège social, forme juridique, numéro d'immatriculation, numéro de TVA intracommunautaire et nom du directeur de publication : informations à compléter par l'éditeur avant publication définitive de ces mentions."] },
  { title: "Hébergement", items: ["Le site et le service utilisent une infrastructure de déploiement Vercel et une base de données PostgreSQL hébergée par Neon, selon la configuration technique actuelle.", "Les coordonnées légales complètes des hébergeurs sont accessibles sur leurs sites respectifs. L'éditeur doit vérifier et compléter, si nécessaire, les informations légalement requises avant publication définitive."] },
  { title: "Propriété intellectuelle", items: ["La marque Traknio, les éléments graphiques, les textes, le code et les contenus du service sont protégés. Toute réutilisation non autorisée est interdite, sauf exception légale."] },
  { title: "Données personnelles", items: ["Les informations sur les traitements de données et vos droits figurent dans la Politique de confidentialité. Une procédure publique de suppression de compte et de données est également disponible."] },
] as const;

export const metadata: Metadata = { title: "Mentions légales - Traknio", description: `Mentions légales du site ${BRAND.name}.`, alternates: { canonical: "/legal/legal-notice" } };

export default function LegalNoticePage() { return <PublicLegalPage eyebrow="Légal" title="Mentions légales" description="Informations relatives à l'éditeur et à l'hébergement du service Traknio." updatedAt="2 septembre 2026" lead="Certaines informations d'identification professionnelle doivent être complétées par l'éditeur avant publication définitive." sections={sections} noteTitle="Contact" note="Pour toute demande relative au site ou au service, écrivez à contact@traknio.com." />; }
