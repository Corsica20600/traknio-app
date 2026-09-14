"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type DemoMedia = { src: string; alt: string };
type AnimationMedia = { webm: string; webp: string; alt: string };
type DemoMode = "animation" | "start" | "end";

export function ExerciseDemo({ start, end, animation }: { start: DemoMedia; end: DemoMedia; animation?: AnimationMedia }) {
  const [mode, setMode] = useState<DemoMode>(animation ? "animation" : "start");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [inView, setInView] = useState(true);
  const [webmFailed, setWebmFailed] = useState(false);
  const [animationFailed, setAnimationFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !window.IntersectionObserver) return;
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), { threshold: 0.15 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (mode === "animation" && inView && !reducedMotion) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [inView, mode, reducedMotion, webmFailed]);

  const animationAvailable = Boolean(animation && !animationFailed);
  const activeMode = reducedMotion && mode === "animation" ? "start" : mode;
  const activeStatic = activeMode === "end" ? end : start;
  const tabId = (next: DemoMode) => `lat-pulldown-demo-${next}`;

  return (
    <section className="exerciseDemo" aria-labelledby="exercise-demo-title">
      <div className="sectionHeading">
        <span>Démonstration</span>
        <h2 id="exercise-demo-title">Le mouvement</h2>
      </div>
      <div className="demoTabs" role="tablist" aria-label="Position du mouvement">
        {animationAvailable ? <button id={tabId("animation")} role="tab" type="button" aria-selected={mode === "animation"} aria-controls="lat-pulldown-demo-panel" onClick={() => setMode("animation")}>Animation</button> : null}
        <button id={tabId("start")} role="tab" type="button" aria-selected={mode === "start"} aria-controls="lat-pulldown-demo-panel" onClick={() => setMode("start")}>Départ</button>
        <button id={tabId("end")} role="tab" type="button" aria-selected={mode === "end"} aria-controls="lat-pulldown-demo-panel" onClick={() => setMode("end")}>Contraction</button>
      </div>
      <div ref={containerRef} id="lat-pulldown-demo-panel" className="demoMedia" role="tabpanel" aria-labelledby={tabId(mode)}>
        {activeMode === "animation" && animation ? (
          <video
            ref={videoRef}
            key={webmFailed ? animation.webp : animation.webm}
            className="demoVideo"
            src={webmFailed ? animation.webp : animation.webm}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            aria-label={animation.alt}
            aria-describedby="lat-pulldown-animation-description"
            onError={() => webmFailed ? setAnimationFailed(true) : setWebmFailed(true)}
          ><track kind="captions" src="/media/exercises/lat-pulldown-machine/animation.fr.vtt" srcLang="fr" label="Description de l'animation" /></video>
        ) : (
          <Image src={activeStatic.src} alt={activeStatic.alt} width={1000} height={1250} priority className="demoImage" />
        )}
      </div>
      <p id="lat-pulldown-animation-description" className="srOnly">Animation silencieuse : tirage vertical sur machine à leviers indépendants, des bras tendus à la contraction puis retour contrôlé.</p>
      {reducedMotion && mode === "animation" ? <p className="motionNote">Animation désactivée selon les préférences de votre appareil.</p> : null}
    </section>
  );
}
