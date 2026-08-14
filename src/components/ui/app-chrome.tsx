"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TraknioAssistant } from "@/src/components/assistant/traknio-assistant";
import { BottomNav } from "@/src/components/ui/bottom-nav";
import { InitialOnboarding } from "@/src/components/onboarding/initial-onboarding";
import { BRAND } from "@/src/lib/brand";
import type { OnboardingSnapshot } from "@/src/lib/onboarding";

export function AppChrome({
  children,
  isConnected,
  assistantEnabled,
  onboarding,
}: {
  children: ReactNode;
  isConnected: boolean;
  assistantEnabled: boolean;
  onboarding: OnboardingSnapshot | null;
}) {
  const pathname = usePathname();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isPublicLanding = pathname === "/";

  if (isAdminRoute) {
    return <div className="admin-root-shell">{children}</div>;
  }

  if (isPublicLanding) {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-brand" aria-label={BRAND.name}>
          <Image
            src="/brand/traknio-site-lockup-v2.png"
            alt="Traknio - Train smarter. Progress further."
            width={1614}
            height={311}
            className="app-brand-logo"
            priority
          />
        </div>
        {isConnected ? (
          <Link href="/settings" prefetch={false} className="settings-top-link" aria-label="Ouvrir les paramètres">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M19.4 13.5c.1-.5.1-1 .1-1.5s0-1-.1-1.5l2-1.5-2-3.5-2.4 1a8 8 0 0 0-2.6-1.5L14 2h-4l-.4 2.5A8 8 0 0 0 7 6L4.6 5 2.6 8.5l2 1.5c-.1.5-.1 1-.1 1.5s0 1 .1 1.5l-2 1.5 2 3.5L7 18a8 8 0 0 0 2.6 1.5L10 22h4l.4-2.5A8 8 0 0 0 17 18l2.4 1 2-3.5-2-1.5ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />
            </svg>
          </Link>
        ) : null}
      </header>
      <main className="screen">{children}</main>
      {isConnected && assistantEnabled ? <TraknioAssistant /> : null}
      {isConnected ? <BottomNav /> : null}
      {isConnected ? <InitialOnboarding onboarding={onboarding} /> : null}
    </div>
  );
}
