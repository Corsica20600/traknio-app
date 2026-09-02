import type { Metadata } from "next";
import { BRAND } from "@/src/lib/brand";
import { PublicLegalPage } from "../public-legal-page";

const sections = [
  {
    title: "Demander une suppression",
    ordered: true,
    items: [
      `Connecte-toi au compte Google utilisé dans ${BRAND.name}.`,
      "Vérifie que les données affichées correspondent au compte concerné.",
      "Écris au support en demandant la suppression du compte et des données associées.",
      "Après vérification raisonnable de la demande, Traknio traite la suppression du profil, des séances, des programmes et des mesures associées.",
    ],
  },
  {
    title: "Données supprimées",
    items: [
      `Profil ${BRAND.name} et adresse e-mail associée.`,
      "Programmes, séances, séries et historiques d'entraînement.",
      "Mesures de progression enregistrées.",
      "Préférences liées aux intégrations activées.",
    ],
  },
  {
    title: "Données pouvant être conservées",
    items: [
      "Données nécessaires aux obligations légales, comptables ou antifraude, si elles existent.",
      "Données anonymisées ne permettant plus d'identifier le compte.",
      "Traces techniques temporaires nécessaires à la sécurité du service.",
    ],
  },
] as const;

export const metadata: Metadata = {
  title: "Suppression des données - Traknio",
  description: `Procédure publique de suppression des données ${BRAND.name}.`,
  alternates: { canonical: "/legal/data-deletion" },
};

export default function DataDeletionPage() {
  return (
    <PublicLegalPage
      eyebrow="Données"
      title="Suppression des données"
      description="Cette page explique comment demander la suppression d'un compte et des données associées."
      updatedAt="2 septembre 2026"
      lead="La demande manuelle peut être envoyée à l'adresse support officielle de Traknio."
      sections={sections}
      noteTitle="Avant suppression"
      note="L'utilisateur peut exporter ses données depuis l'application avant de demander la suppression définitive. Cette page ne déclenche pas une suppression automatique."
    />
  );
}
