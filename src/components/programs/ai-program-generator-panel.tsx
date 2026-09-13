"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandSelect } from "@/src/components/ui/brand-select";
import { PrimaryButton } from "@/src/components/ui/primary-button";

type GeneratedProgram = {
  programName: string;
  goal: string;
  days: Array<{
    dayIndex: number;
    title: string;
    notes: string;
    exercises: Array<{
      exerciseSlug: string;
      displayName?: string;
      sets: number;
      reps: string;
      restSeconds: number;
      tempo?: string;
      notes?: string;
    }>;
  }>;
  exercises: string[];
  notes: string;
};

export function AiProgramGeneratorPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GeneratedProgram | null>(null);
  const [savedText, setSavedText] = useState("");
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  useEffect(() => {
    let alive = true;
    void fetch("/api/programs/generate-ai", { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(data => {
      if (alive && data?.generation?.generatedProgram) {
        setResult(data.generation.generatedProgram);
        setGenerationId(data.generation.id);
      }
    }).catch(() => undefined).finally(() => { if (alive) setRestoring(false); });
    return () => { alive = false; };
  }, []);

  async function onGenerate(formData: FormData) {
    if (restoring || loading) return;
    setLoading(true);
    setError("");
    setSavedText("");
    // Keep the previous successful preview if a retry is refused or fails.

    const payload = {
      goal: String(formData.get("goal") ?? "MUSCLE_GAIN"),
      level: String(formData.get("level") ?? "INTERMEDIATE"),
      daysPerWeek: 1,
      sessionDurationMin: Number(formData.get("sessionDurationMin") ?? 60),
      availableEquipment: String(formData.get("availableEquipment") ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      priorityMuscles: String(formData.get("priorityMuscles") ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      restrictions: String(formData.get("restrictions") ?? "").trim(),
    };

    try {
      const response = await fetch("/api/programs/generate-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        if (data?.error === "ai_generation_limit_reached") {
          setError(data.periodKey === "ACCOUNT_TRIAL"
            ? "Ton programme IA inclus dans l’essai a déjà été généré ou est en cours de génération. Tu peux modifier ton programme manuellement."
            : `Limite mensuelle atteinte : ${data.used}/${data.limit} programmes IA générés ce mois-ci.`);
          return;
        }
        if (data?.error === "missing_api_key") {
          setError("Generation IA indisponible : la cle OpenAI n'est pas configuree sur le serveur.");
          return;
        }
        if (data?.error === "openai_error" || data?.error === "openai_exception") {
          setError("Generation IA indisponible : OpenAI n'a pas repondu correctement.");
          return;
        }
        setError(`Generation impossible (${data?.error ?? "unknown_error"})`);
        return;
      }
      setResult(data.program);
      setGenerationId(data.usage.usageId);
    } catch {
      setError("Erreur reseau pendant la generation IA.");
    } finally {
      setLoading(false);
    }
  }

  async function onSave() {
    if (!result) return;
    setSaving(true);
    setError("");
    setSavedText("");
    try {
      const response = await fetch("/api/programs/save-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ program: result, generationId }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        setError(`Sauvegarde impossible (${data?.error ?? "unknown_error"})`);
        return;
      }
      setSavedText(`Programme sauvegarde: ${data.programName}`);
      router.refresh();
    } catch {
      setError("Erreur reseau pendant la sauvegarde.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <p className="eyebrow">IA programme</p>
      <p className="muted">Essai de 7 jours : 1 génération réussie incluse. Abonnement : 4 générations par mois. Les modifications manuelles restent disponibles pendant ton accès.</p>
      <form action={onGenerate} className="form-grid">
        <BrandSelect
          name="goal"
          defaultValue="MUSCLE_GAIN"
          options={[
            { value: "MUSCLE_GAIN", label: "Prise de muscle" },
            { value: "FAT_LOSS", label: "Perte de gras" },
            { value: "STRENGTH", label: "Force" },
            { value: "RECOMPOSITION", label: "Recomposition" },
          ]}
        />
        <BrandSelect
          name="level"
          defaultValue="INTERMEDIATE"
          options={[
            { value: "BEGINNER", label: "Debutant" },
            { value: "INTERMEDIATE", label: "Intermediaire" },
            { value: "ADVANCED", label: "Avance" },
          ]}
        />
        <input name="sessionDurationMin" type="number" min={25} max={120} defaultValue={60} className="input" placeholder="Duree seance (min)" />
        <input name="availableEquipment" className="input" placeholder="Materiel (csv) ex: halteres, barre, machine" />
        <input name="priorityMuscles" className="input" placeholder="Muscles prioritaires (csv)" />
        <input name="restrictions" className="input" placeholder="Douleurs / restrictions" />
        <PrimaryButton type="submit" disabled={loading || restoring || saving}>{restoring ? "Récupération…" : loading ? "Génération…" : "Générer avec l’IA"}</PrimaryButton>
      </form>

      {error && <p className="muted mt-10">{error}</p>}
      {savedText && <p className="mt-10">{savedText}</p>}

      {result && (
        <div className="stack mt-10">
          <h3 className="section-title">{result.programName}</h3>
          {result.days.map((day) => (
            <section key={day.dayIndex} className="card">
              <p className="eyebrow">Seance</p>
              <h4 className="section-title">{day.title}</h4>
              <p className="muted">{day.notes}</p>
              <div className="stack mt-10">
                {day.exercises.map((ex, idx) => (
                  <p key={`${day.dayIndex}-${idx}`} className="muted">
                    {idx + 1}. {ex.displayName || ex.exerciseSlug} · {ex.sets}x{ex.reps} · repos {ex.restSeconds}s{ex.tempo ? ` · tempo ${ex.tempo}` : ""}
                  </p>
                ))}
              </div>
            </section>
          ))}
          <PrimaryButton type="button" onClick={onSave} disabled={saving || loading}>
            {saving ? "Sauvegarde..." : "Sauvegarder ce programme"}
          </PrimaryButton>
        </div>
      )}
    </section>
  );
}
