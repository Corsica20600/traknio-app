"use client";

import { useEffect, useSyncExternalStore } from "react";

const KEY = "traknio.keep-screen-awake";
function snapshot() { try { return localStorage.getItem(KEY) === "true"; } catch { return false; } }
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("traknio:screen-setting", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("traknio:screen-setting", callback); };
}
export function KeepScreenSetting() {
  const enabled = useSyncExternalStore(subscribe, snapshot, () => false);
  return <div className="settings-footnote"><label>
    <input type="checkbox" checked={enabled} onChange={event => {
      try { localStorage.setItem(KEY, String(event.target.checked)); } catch { return; }
      window.dispatchEvent(new Event("traknio:screen-setting"));
    }} /> Garder l’écran allumé pendant la séance
    <small className="muted"> Sur cet appareil uniquement, lorsque Traknio est visible. Consomme davantage de batterie.</small>
  </label></div>;
}

export function useWorkoutScreenAwake(active: boolean) {
  const enabled = useSyncExternalStore(subscribe, snapshot, () => false);
  useEffect(() => {
    let disposed = false;
    let generation = 0;
    let lock: WakeLockSentinel | undefined;
    const bridge = (window as unknown as { TraknioWorkout?: { setScreenAwake?: (active: boolean) => void } }).TraknioWorkout;
    const refresh = async () => {
      const revision = ++generation;
      const keep = !disposed && enabled && active && document.visibilityState === "visible";
      bridge?.setScreenAwake?.(keep);
      const previous = lock;
      lock = undefined;
      if (previous) await previous.release().catch(() => undefined);
      if (!keep || disposed || revision !== generation || bridge?.setScreenAwake || !("wakeLock" in navigator)) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (disposed || revision !== generation) await next.release();
        else lock = next;
      } catch { /* The OS may decline in battery saver mode. */ }
    };
    void refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("traknio:app-resume", refresh);
    return () => {
      disposed = true; ++generation;
      bridge?.setScreenAwake?.(false);
      void lock?.release().catch(() => undefined);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("traknio:app-resume", refresh);
    };
  }, [active, enabled]);
}
