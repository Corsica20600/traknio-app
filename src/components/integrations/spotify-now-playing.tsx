"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PlaybackState = {
  connected?: boolean;
  playing?: boolean;
  title?: string | null;
  artist?: string | null;
  imageUrl?: string | null;
};

type SpotifyNowPlayingProps = {
  displayName?: string | null;
};

export function SpotifyNowPlaying({ displayName }: SpotifyNowPlayingProps) {
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const refreshController = useRef<AbortController | null>(null);
  const actionTimers = useRef<Set<number>>(new Set());
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    if (!mounted.current || document.visibilityState !== "visible" || refreshController.current) return;
    const controller = new AbortController();
    refreshController.current = controller;
    try {
      const response = await fetch("/api/integrations/spotify/playback", { cache: "no-store", signal: controller.signal });
      if (!response.ok) return;
      const data = await response.json() as PlaybackState;
      if (controller.signal.aborted || !mounted.current) return;
      setPlayback(data);
    } catch {
      if (!controller.signal.aborted && mounted.current) setPlayback((current) => current ?? { connected: true, playing: false });
    } finally {
      if (refreshController.current === controller) refreshController.current = null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const timers = actionTimers.current;
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
      else {
        refreshController.current?.abort();
        refreshController.current = null;
      }
    };
    const bootId = window.setTimeout(() => void refresh(), 0);
    const id = window.setInterval(() => void refresh(), 20000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mounted.current = false;
      refreshController.current?.abort();
      refreshController.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(bootId);
      window.clearInterval(id);
      timers.forEach(timer => window.clearTimeout(timer));
      timers.clear();
    };
  }, [refresh]);

  async function perform(action: "previous" | "play" | "pause" | "next") {
    setBusyAction(action);
    try {
      const response = await fetch("/api/integrations/spotify/playback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok || !mounted.current) return;
      if (action === "play" || action === "pause") {
        setPlayback((current) => current ? { ...current, playing: action === "play" } : current);
      }
      for (const delay of [300, 1200]) {
        const timer = window.setTimeout(() => {
          actionTimers.current.delete(timer);
          void refresh();
        }, delay);
        actionTimers.current.add(timer);
      }
    } catch {
      // Keep the last confirmed playback state if the command fails.
    } finally {
      if (mounted.current) setBusyAction(null);
    }
  }

  const title = playback?.title || "Spotify connecté";
  const artist = playback?.artist || displayName || "Lecture prête";
  const playPauseAction = playback?.playing ? "pause" : "play";

  return (
    <section className="spotify-now-playing" aria-label="Spotify Now Playing">
      <div className="spotify-now-playing__art">
        {playback?.imageUrl ? (
          <span className="spotify-now-playing__cover" style={{ backgroundImage: `url(${playback.imageUrl})` }} aria-hidden="true" />
        ) : (
          <span aria-hidden="true">♪</span>
        )}
      </div>
      <div className="spotify-now-playing__text">
        <p className="eyebrow">Now Playing</p>
        <strong>{title}</strong>
        <small>{artist}</small>
      </div>
      <div className="spotify-now-playing__controls" aria-label="Contrôles Spotify">
        <button type="button" aria-label="Titre précédent" disabled={busyAction != null} onClick={() => void perform("previous")}>{"<<"}</button>
        <button
          type="button"
          aria-label={playback?.playing ? "Mettre Spotify en pause" : "Reprendre Spotify"}
          disabled={busyAction != null}
          onClick={() => void perform(playPauseAction)}
        >
          {playback?.playing ? "||" : ">"}
        </button>
        <button type="button" aria-label="Titre suivant" disabled={busyAction != null} onClick={() => void perform("next")}>{">>"}</button>
      </div>
    </section>
  );
}
