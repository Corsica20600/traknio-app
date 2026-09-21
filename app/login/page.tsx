import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signIn } from "@/auth";
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
          <Image
            src="/brand/traknio-phone-hero-v2.png"
            alt={`${BRAND.name} - ${BRAND.tagline}`}
            width={228}
            height={436}
            className="login-reference-image"
            priority
          />
          <button type="submit" className="login-google-button">
            Se connecter avec Google
          </button>
        </form>
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
