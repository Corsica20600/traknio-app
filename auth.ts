import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { getReviewerCredentials, verifyReviewerCredentials } from "@/src/server/reviewer-credentials";

export const PRIMARY_USER_EMAIL = "longin.erwan@gmail.com";
export const LEGACY_DEMO_EMAIL = "demo@traknio.local";

function getAllowedEmails() {
  return new Set(
    (process.env.TRAKNIO_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google,
    Credentials({
      name: "Google Play reviewer",
      credentials: {
        email: { label: "Adresse e-mail", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      authorize(credentials) {
        const reviewer = verifyReviewerCredentials(credentials);
        if (!reviewer) return null;

        return {
          id: "google-play-reviewer",
          name: "Google Play Reviewer / Traknio Review",
          email: reviewer.email,
        };
      },
    }),
  ],
  callbacks: {
    authorized() {
      return true;
    },
    async signIn({ account, profile, user }) {
      if (account?.provider === "credentials") {
        const reviewer = getReviewerCredentials();
        return Boolean(reviewer && user.email?.toLowerCase() === reviewer.email);
      }

      const email = profile?.email?.toLowerCase();
      if (!email) return false;

      const googleProfile = profile as { email_verified?: boolean } | undefined;
      if (googleProfile?.email_verified === false) return false;

      const allowedEmails = getAllowedEmails();
      if (allowedEmails.size > 0) {
        return allowedEmails.has(email);
      }

      return true;
    },
    async session({ session, token }) {
      if (session.user && token.email) {
        session.user.email = String(token.email).toLowerCase();
      }
      return session;
    },
  },
});
