import type { Metadata } from "next";
import { PublicLegalPage } from "../legal/public-legal-page";

const sections = [
  { title: "Nous contacter", items: ["Question générale, presse ou données personnelles : contact@traknio.com.", "Aide sur le compte, les entraînements, la montre ou les intégrations : support@traknio.com.", "Pour faciliter le traitement d'une demande liée à un compte, indiquez l'adresse e-mail associée au compte sans communiquer de mot de passe, de code de connexion ou de donnée de paiement."] },
  { title: "Demandes liées aux données", items: ["Pour demander l'accès, la rectification, l'effacement, la limitation, l'opposition ou la portabilité lorsque applicable, contactez contact@traknio.com.", "La procédure de suppression de compte et de données est accessible sur une page publique dédiée, sans connexion préalable."] },
] as const;

export const metadata: Metadata = { title: "Contact - Traknio", description: "Contacter l'équipe Traknio pour une question produit, support ou données personnelles.", alternates: { canonical: "/contact" } };

export default function ContactPage() { return <PublicLegalPage eyebrow="Contact" title="Contacter Traknio" description="Une question sur le service, votre compte ou vos données ?" updatedAt="2 septembre 2026" lead="Nous utilisons ces adresses pour les demandes relatives au service Traknio." sections={sections} />; }
