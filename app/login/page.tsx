import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signIn } from "@/auth";
import { getReviewerCredentials } from "@/src/server/reviewer-credentials";
import { AppShell } from "@/src/components/ui/app-shell";
import { GlassCard } from "@/src/components/ui/glass-card";
import { BRAND } from "@/src/lib/brand";

function getSafeCallbackUrl(value: string | string[] | undefined) {
  const callbackUrl = Array.isArray(value) ? value[0] : value;

  if (!callbackUrl || !callbackUrl.startsWith("/") || callbackUrl.startsWith("//")) {
    return "/dashboard";
  }

  return callbackUrl;
}

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
};

export const metadata: Metadata = {
  title: "Connexion",
  description: `Connecte ton compte Google à ${BRAND.name} pour retrouver ton historique et sécuriser tes entraînements.`,
  alternates: {
    canonical: "/login",
  },
};

export default async function LoginPage(props: LoginPageProps) {
  const session = await auth().catch(() => null);
  const searchParams = await props.searchParams;
  const callbackUrl = getSafeCallbackUrl(searchParams.callbackUrl);
  const reviewerCredentialsConfigured = Boolean(getReviewerCredentials());

  if (session?.user?.email) {
    redirect(callbackUrl);
  }

  return (
    <AppShell className="login-page login-page--reference">
      <GlassCard className="login-reference-card" elevated>
        <h1 className="sr-only">Connexion {BRAND.name}</h1>
        <form
          className="login-reference-form"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: callbackUrl });
          }}
        >
          <button type="submit" className="login-reference-button" aria-label={`Se connecter à ${BRAND.name} avec Google`}>
            <Image
              src="/brand/traknio-phone-hero-v2.png"
              alt={`${BRAND.name} - ${BRAND.tagline}`}
              width={228}
              height={436}
              className="login-reference-image"
              priority
            />
          </button>
        </form>
        {reviewerCredentialsConfigured ? (
          <form
            className="reviewer-login-form"
            action={async (formData) => {
              "use server";
              await signIn("credentials", formData);
            }}
          >
            <input type="hidden" name="redirectTo" value={callbackUrl} />
            <p>Accès réservé à la vérification Google Play</p>
            <label>
              Adresse e-mail
              <input className="input" name="email" type="email" autoComplete="username" required />
            </label>
            <label>
              Mot de passe
              <input className="input" name="password" type="password" autoComplete="current-password" required />
            </label>
            <button type="submit" className="primary-button full-width">Se connecter</button>
          </form>
        ) : null}
        <div className="legal-link-row" aria-label="Documents légaux">
          <Link href="/privacy">Confidentialité</Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms">Conditions</Link>
          <span aria-hidden="true">·</span>
          <Link href="/data-deletion">Données</Link>
        </div>
      </GlassCard>
    </AppShell>
  );
}
