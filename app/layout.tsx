import type { Metadata, Viewport } from "next";
import { Exo_2, Orbitron, Raleway } from "next/font/google";
import Script from "next/script";
import { auth } from "@/auth";
import { AppChrome } from "@/src/components/ui/app-chrome";
import { BRAND } from "@/src/lib/brand";
import { absoluteUrl, getSiteUrl } from "@/src/lib/site-url";
import { isTraknioAssistantEnabled } from "@/src/server/assistant/assistant-access";
import { getOnboardingSnapshot } from "@/src/server/onboarding-actions";
import "./globals.css";

const exo2 = Exo_2({ variable: "--font-exo-2", subsets: ["latin"], display: "swap" });
const orbitron = Orbitron({ variable: "--font-orbitron", subsets: ["latin"], display: "swap" });
const raleway = Raleway({ variable: "--font-raleway", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  applicationName: BRAND.name,
  title: {
    default: BRAND.name,
    template: `%s | ${BRAND.name}`,
  },
  description: BRAND.description,
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/",
  },
  keywords: [
    "fitness",
    "musculation",
    "coach sportif",
    "Wear OS",
    "suivi entraînement",
    "programme musculation",
  ],
  authors: [{ name: BRAND.name }],
  creator: BRAND.name,
  publisher: BRAND.name,
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: BRAND.shortName,
  },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: "/",
    siteName: BRAND.name,
    title: BRAND.name,
    description: "Pilote tes entraînements, ton historique et ta montre Wear OS depuis un compte sécurisé.",
    images: [
      {
        url: absoluteUrl("/icons/icon-512.png"),
        width: 512,
        height: 512,
        alt: `Logo ${BRAND.name}`,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: BRAND.name,
    description: "Application fitness premium avec historique, programmes et synchronisation Wear OS.",
    images: [absoluteUrl("/icons/icon-512.png")],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0f14",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth().catch(() => null);
  const isConnected = Boolean(session?.user?.email);
  const onboarding = isConnected ? await getOnboardingSnapshot().catch(() => null) : null;

  return (
    <html lang="fr" className={`${exo2.variable} ${orbitron.variable} ${raleway.variable}`}>
      <body>
        <AppChrome isConnected={isConnected} assistantEnabled={isTraknioAssistantEnabled()} onboarding={onboarding}>{children}</AppChrome>
        <Script id="pwa-sw-register" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function () {
                navigator.serviceWorker.register('/sw.js').catch(function () {});
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
