import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { getReviewerCredentials } from "@/src/server/reviewer-credentials";
import { AppShell } from "@/src/components/ui/app-shell";
import { GlassCard } from "@/src/components/ui/glass-card";

function getSafeCallbackUrl(value: string | string[] | undefined) {
  const callbackUrl = Array.isArray(value) ? value[0] : value;

  if (!callbackUrl || !callbackUrl.startsWith("/") || callbackUrl.startsWith("//")) {
    return "/dashboard";
  }

  return callbackUrl;
}

type GooglePlayReviewPageProps = {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
};

export const metadata: Metadata = {
  title: "Accès Google Play",
  robots: { index: false, follow: false },
};

export default async function GooglePlayReviewPage(props: GooglePlayReviewPageProps) {
  const session = await auth().catch(() => null);
  const searchParams = await props.searchParams;
  const callbackUrl = getSafeCallbackUrl(searchParams.callbackUrl);

  if (session?.user?.email) {
    redirect(callbackUrl);
  }

  if (!getReviewerCredentials()) {
    redirect("/login");
  }

  return (
    <AppShell className="login-page">
      <GlassCard className="reviewer-login-card" elevated>
        <h1>Accès de vérification Google Play</h1>
        <p>Utilisez uniquement les identifiants fournis dans la Play Console.</p>
        <form
          className="reviewer-login-form"
          action={async (formData) => {
            "use server";
            await signIn("credentials", formData);
          }}
        >
          <input type="hidden" name="redirectTo" value={callbackUrl} />
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
      </GlassCard>
    </AppShell>
  );
}
