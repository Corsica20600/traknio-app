"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completeInitialOnboardingAction } from "@/src/server/onboarding-actions";
import { ONBOARDING_VERSION, type OnboardingSnapshot } from "@/src/lib/onboarding";

const slides = [
  { title: "Programmes", text: "Crée ou adapte ton programme d’entraînement." },
  { title: "Séance", text: "Suis tes séries, répétitions, charges et temps de repos." },
  { title: "Progression", text: "Retrouve ton historique, ton évolution et tes recommandations." },
] as const;

export function InitialOnboarding({ onboarding }: { onboarding: OnboardingSnapshot | null }) {
  const router = useRouter();
  const shouldShow = Boolean(onboarding && onboarding.version < ONBOARDING_VERSION && !onboarding.state.initialCompleted);
  const [open, setOpen] = useState(shouldShow);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const replay = () => {
      setSlide(0);
      setOpen(true);
    };
    window.addEventListener("traknio:onboarding-replay", replay);
    return () => window.removeEventListener("traknio:onboarding-replay", replay);
  }, []);

  if (!open) return null;

  async function finish(goToPrograms = false) {
    setOpen(false);
    await completeInitialOnboardingAction();
    if (goToPrograms) router.push("/programs");
  }

  const current = slides[slide];
  const last = slide === slides.length - 1;
  return (
    <div className="onboarding-initial-backdrop" role="presentation">
      <section className="onboarding-initial-card" role="dialog" aria-modal="true" aria-labelledby="onboarding-initial-title">
        <p className="eyebrow">Bienvenue sur Traknio</p>
        <div className="onboarding-initial-progress" aria-label={`Étape ${slide + 1} sur ${slides.length}`}>
          {slides.map((item, index) => <span key={item.title} className={index <= slide ? "is-active" : ""} />)}
        </div>
        <h2 id="onboarding-initial-title">{current.title}</h2>
        <p>{current.text}</p>
        <div className="onboarding-initial-actions">
          <button type="button" className="ghost-btn" onClick={() => { void finish(); }}>Passer</button>
          {last ? (
            <button type="button" className="primary-button" onClick={() => { void finish(true); }}>Commencer</button>
          ) : (
            <button type="button" className="primary-button" onClick={() => setSlide((value) => value + 1)}>Suivant</button>
          )}
        </div>
      </section>
    </div>
  );
}
