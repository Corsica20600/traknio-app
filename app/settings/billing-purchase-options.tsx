"use client";

import { useSyncExternalStore, type ReactNode } from "react";

function useNativeAndroidApp() {
  return useSyncExternalStore(
    () => () => undefined,
    () => /Android/i.test(navigator.userAgent) && "TraknioWorkout" in window,
    () => null,
  );
}

/** Play prices and trial eligibility are deliberately resolved by BillingClient, not the web view. */
export function BillingPurchaseOptions({ children }: { children: ReactNode }) {
  const android = useNativeAndroidApp();
  if (android === null) return null;
  if (android) {
    return (
      <div className="settings-stripe-plan-grid">
        <a className="primary-button full-line" href="traknio://billing/google-play?plan=monthly">Voir l’offre mensuelle Google Play</a>
        <a className="ghost-btn full-line" href="traknio://billing/google-play?plan=yearly">Voir l’offre annuelle Google Play</a>
      </div>
    );
  }
  return <>{children}</>;
}

/** Legacy web trials must never be offered by the Android WebView. */
export function WebOnly({ children }: { children: ReactNode }) {
  const android = useNativeAndroidApp();
  if (android !== false) return null;
  return <>{children}</>;
}
