"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PrimaryButton } from "@/src/components/ui/primary-button";
import { AiProgramGeneratorPanel } from "./ai-program-generator-panel";
import { deleteProgramEditor, loadProgramEditor, saveProgramEditor } from "@/src/server/program-editor-actions";
import { moveDraftExercise, validateProgramDraft, type DraftDay, type DraftExercise, type ProgramDraft } from "@/src/lib/program-draft";
import styles from "./program-builder.module.css";

type CatalogExercise = { id: string; name: string; image: string; muscle: string };
type CatalogResult = { exercises: CatalogExercise[]; hasMore: boolean };
const catalogCache = new Map<string, { time: number; result: CatalogResult }>();
const uid = () => `new_${crypto.randomUUID()}`;
const goalLabels = { HYPERTROPHY: "Prise de muscle", STRENGTH: "Force", ENDURANCE: "Endurance", FAT_LOSS: "Perte de gras", GENERAL_FITNESS: "Remise en forme" };
const levelLabels = { BEGINNER: "Débutant", INTERMEDIATE: "Intermédiaire", ADVANCED: "Avancé" };

function exerciseSummary(ex: DraftExercise) {
  const weight = /^\d+(?:[.,]\d+)?\s*kg$/.test(ex.repsText ?? "") ? ex.repsText : null;
  const reps = ex.repsMin !== null ? `${ex.repsMin}${ex.repsMax && ex.repsMax !== ex.repsMin ? `–${ex.repsMax}` : ""} reps` : !weight && ex.repsText ? ex.repsText : "10 reps";
  return `${ex.sets} séries · ${reps} · ${ex.restSeconds} s${weight ? ` · ${weight}` : ""}`;
}

function ExercisePicker({ accountId, onAdd, onClose, single = false }: { accountId: string; onAdd: (items: CatalogExercise[]) => void; onClose: () => void; single?: boolean }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<CatalogResult>({ exercises: [], hasMore: false });
  const [selected, setSelected] = useState<CatalogExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      const key = `${accountId}:${query}:${page}`;
      try {
        const cached = catalogCache.get(key);
        let next: CatalogResult;
        if (cached && Date.now() - cached.time < 120000) next = cached.result;
        else {
          const response = await fetch(`/api/programs/catalog?q=${encodeURIComponent(query)}&page=${page}`, { signal: controller.signal });
          if (!response.ok) throw new Error("Catalogue indisponible. Réessaie dans un instant.");
          next = await response.json();
          if (catalogCache.size >= 30) catalogCache.clear();
          catalogCache.set(key, { time: Date.now(), result: next });
        }
        if (!controller.signal.aborted) setResult(next);
      } catch { if (!controller.signal.aborted) setError("Catalogue indisponible. Vérifie ta connexion puis réessaie."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [accountId, query, page, retry]);
  return <section className={styles.picker} aria-label="Sélection d’exercices">
    <div className={styles.row}><h3>Choisir les exercices</h3><button type="button" onClick={onClose}>Fermer</button></div>
    <label className="field-label">Rechercher un exercice ou un muscle<input autoFocus className="input" value={query} onChange={e => { setQuery(e.target.value); setPage(0); setLoading(true); }} placeholder="Ex. squat, pectoraux…" /></label>
    <p className="muted">{single ? "Choisis le nouvel exercice. Les réglages de séries et de repos sont conservés." : "Coche plusieurs exercices. Tu régleras ensuite les séries et les poids."}</p>
    {error ? <p role="alert">{error} <button type="button" onClick={() => setRetry(n => n + 1)}>Réessayer</button></p> : null}
    {loading ? <p role="status">Recherche…</p> : <div className={styles.results}>{result.exercises.map(ex => <label key={ex.id} className={styles.result}>
      <input type="checkbox" checked={selected.some(item => item.id === ex.id)} onChange={e => setSelected(items => e.target.checked ? single ? [ex] : [...items, ex] : items.filter(item => item.id !== ex.id))} />
      {/* Thumbnails only: never load a grid of animations. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {ex.image ? <img src={ex.image} alt="" width={52} height={52} loading="lazy" /> : null}
      <span>{ex.name}<small>{ex.muscle}</small></span>
    </label>)}</div>}
    {!loading && !result.exercises.length && !error ? <p>Aucun résultat. Essaie un autre nom.</p> : null}
    <div className={styles.row}><button type="button" disabled={loading || page === 0} onClick={() => { setPage(n => n - 1); setLoading(true); }}>Précédent</button><span>Page {page + 1}</span><button type="button" disabled={loading || !result.hasMore} onClick={() => { setPage(n => n + 1); setLoading(true); }}>Suivant</button></div>
    <PrimaryButton type="button" disabled={!selected.length} onClick={() => onAdd(selected)}>{single ? "Remplacer l’exercice" : `Ajouter ${selected.length || "les"} exercice${selected.length === 1 ? "" : "s"}`}</PrimaryButton>
  </section>;
}

function ExerciseRow({ ex, index, total, update, move, remove, replace }: { ex: DraftExercise; index: number; total: number; update: (ex: DraftExercise) => void; move: (direction: number) => void; remove: () => void; replace: () => void }) {
  const [open, setOpen] = useState(false);
  const weight = /^\d+(?:[.,]\d+)?\s*kg$/.test(ex.repsText ?? "") ? Number(ex.repsText!.replace("kg", "").replace(",", ".").trim()) : 0;
  const numberField = (label: string, value: number, min: number, max: number, change: (n: number) => void, step = 1) => <label className="field-label">{label}<input className="input" type="number" inputMode="decimal" min={min} max={max} step={step} value={value} onChange={e => change(Number(e.target.value))} /></label>;
  return <article className={styles.exercise}>
    <button type="button" className={styles.exerciseTitle} aria-expanded={open} onClick={() => setOpen(v => !v)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {ex.image ? <img src={ex.image} alt="" width={52} height={52} loading="lazy" /> : null}
      <span><strong>{index + 1}. {ex.name}</strong><small>{exerciseSummary(ex)}</small></span><span>{open ? "−" : "+"}</span>
    </button>
    <div className={styles.row}><button type="button" aria-label={`Monter ${ex.name}`} disabled={index === 0} onClick={() => move(-1)}>↑</button><button type="button" aria-label={`Descendre ${ex.name}`} disabled={index === total - 1} onClick={() => move(1)}>↓</button><button type="button" onClick={remove}>Retirer</button></div>
    {open ? <div className={styles.settings}>
      <button type="button" onClick={replace}>Remplacer cet exercice</button>
      {numberField("Séries", ex.sets, 1, 12, sets => update({ ...ex, sets }))}
      {numberField("Répétitions minimum", ex.repsMin ?? 10, 1, 100, repsMin => update({ ...ex, repsMin, repsMax: Math.max(repsMin, ex.repsMax ?? repsMin) }))}
      {numberField("Répétitions maximum", ex.repsMax ?? ex.repsMin ?? 10, 1, 100, repsMax => update({ ...ex, repsMax }))}
      {numberField("Repos en secondes", ex.restSeconds, 15, 600, restSeconds => update({ ...ex, restSeconds }))}
      <div className={styles.presets}>{[30, 60, 90, 120].map(restSeconds => <button type="button" key={restSeconds} aria-pressed={ex.restSeconds === restSeconds} onClick={() => update({ ...ex, restSeconds })}>{restSeconds} s</button>)}</div>
      {numberField("Poids facultatif (kg)", weight, 0, 500, n => update({ ...ex, repsText: n > 0 ? `${n} kg` : null }), 0.1)}
      <div className={styles.row}><button type="button" onClick={() => update({ ...ex, repsText: `${Math.max(0, weight - 1)} kg` })}>−1 kg</button><button type="button" onClick={() => update({ ...ex, repsText: `${Math.min(500, weight + 1)} kg` })}>+1 kg</button></div>
      <details><summary>Réglages avancés</summary><label className="field-label">Consigne / répétitions libres<input className="input" maxLength={500} value={ex.repsText ?? ""} onChange={e => update({ ...ex, repsText: e.target.value || null })} placeholder="Ex. 30 secondes, ou poids en kg" /></label><label className="field-label">Tempo<input className="input" maxLength={100} value={ex.tempo ?? ""} onChange={e => update({ ...ex, tempo: e.target.value || null })} placeholder="Ex. 3-0-1" /></label></details>
    </div> : null}
  </article>;
}

export function ProgramBuilder({ accountId, profile, programId }: { accountId: string; profile: { goal: string; level: string; sessionsPerWeek: number }; programId?: string }) {
  const router = useRouter();
  const storageKey = `traknio.program-draft.v1:${accountId}:${programId ?? "new"}`;
  const [opened, setOpened] = useState(false);
  const [mode, setMode] = useState<"choice" | "manual" | "ai">("choice");
  const [draft, setDraft] = useState<ProgramDraft | null>(null);
  const [step, setStep] = useState(1);
  const [dayIndex, setDayIndex] = useState(0);
  const [picker, setPicker] = useState(false);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!draft || !dirty) return;
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify(draft)); } catch { setStorageError(true); }
    }, 0);
    return () => clearTimeout(timer);
  }, [draft, storageKey, dirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const edit = (next: ProgramDraft) => { setDirty(true); setDraft(next); setNotice(""); };
  async function openEditor(id?: string) {
    if (busyRef.current) return;
    setOpened(true); setError(""); setNotice("");
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && !id) {
        const recovered: unknown = JSON.parse(saved);
        if (validateProgramDraft(recovered, true)) { setDraft(recovered); setDirty(true); setMode("manual"); setStep(2); setNotice("Brouillon récupéré sur cet appareil. Il n’est pas encore enregistré sur ton compte."); return; }
      }
    } catch { setStorageError(true); }
    if (id || programId) {
      busyRef.current = true; setBusy(true);
      try {
        const result = await loadProgramEditor(id || programId!);
        if (result.draft) { setDraft(result.draft); setMode("manual"); setStep(2); setDirty(false); }
        else setError(result.error ?? "Chargement impossible.");
      } catch { setError("Connexion interrompue. Réessaie."); }
      finally { busyRef.current = false; setBusy(false); }
    } else { setMode("choice"); }
  }
  function create(titles: string[]) {
    edit({ id: uid(), revision: null, name: titles.length > 1 ? "Mon programme" : titles[0], goal: (profile.goal in goalLabels ? profile.goal : "HYPERTROPHY") as ProgramDraft["goal"], level: (profile.level in levelLabels ? profile.level : "BEGINNER") as ProgramDraft["level"], status: "DRAFT", days: titles.map(title => ({ id: uid(), title, focus: null, exercises: [] })) });
    setDayIndex(0); setMode("manual"); setStep(1);
  }
  async function save(activate: boolean) {
    if (!draft || busyRef.current) return;
    if (!validateProgramDraft(draft)) { setError("Vérifie les noms et les valeurs : 1–12 séries, 1–100 répétitions, 15–600 secondes de repos."); return; }
    busyRef.current = true; setBusy(true); setError("");
    try {
      const result = await saveProgramEditor(draft, activate);
      if (result.error) { setError(result.error); return; }
      if (result.draft) {
        setDirty(false); setDraft(result.draft);
        try { localStorage.removeItem(storageKey); } catch { /* Saving on the server succeeded. */ }
        setNotice(activate ? "Programme enregistré et activé. Disponible pour ta prochaine séance." : "Programme enregistré sur ton compte.");
        router.refresh();
      }
    } catch { setError("Connexion interrompue. Ton brouillon est conservé ; tu peux réessayer sans recréer le programme."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const day = draft?.days[Math.min(dayIndex, draft.days.length - 1)];
  function changeDay(next: DraftDay) { if (draft) edit({ ...draft, days: draft.days.map(item => item.id === next.id ? next : item) }); }
  return <section className={styles.builder} data-onboarding-target={programId ? "program-exercise" : "program-create"}>
    {!opened ? <PrimaryButton type="button" onClick={() => void openEditor()}>{programId ? "Modifier le programme" : "+ Créer un programme"}</PrimaryButton> : <>
      <div className={styles.row}><h2>{programId ? "Personnaliser le programme" : "Créer mon programme"}</h2><button type="button" disabled={busy} onClick={() => { setOpened(false); setPicker(false); }}>Fermer</button></div>
      {busy ? <p role="status">En cours…</p> : null}
      {error ? <p role="alert" className="status-danger">{error}</p> : null}
      {notice ? <p role="status" className="status-success">{notice}</p> : null}
      {storageError ? <p role="alert">La sauvegarde locale n’est pas disponible. Enregistre avant de fermer cette page.</p> : null}
      <fieldset disabled={busy} className={styles.fieldset}>
      {mode === "choice" ? <div className={styles.choices}>
        <button type="button" onClick={() => setMode("ai")}><strong>Avec l’IA</strong><small>Un programme adapté à ton rythme</small></button>
        <button type="button" onClick={() => create(["Ma séance"])}><strong>Programme vide</strong><small>Choisis tes propres exercices</small></button>
        <details><summary>Depuis un modèle de structure</summary><p className="muted">Séances prénommées, exercices à choisir selon ton matériel.</p>{[["Full body"], ["Haut du corps", "Bas du corps"], ["Push", "Pull", "Jambes"]].map(titles => <button type="button" key={titles.join()} onClick={() => create(titles)}>{titles.join(" / ")}</button>)}</details>
      </div> : null}
      {mode === "ai" ? <><button type="button" onClick={() => setMode("choice")}>← Choisir une autre base</button><AiProgramGeneratorPanel profile={profile} onSaved={id => void openEditor(id)} /></> : null}
      {mode === "manual" && draft ? <>
        <nav className={styles.steps} aria-label="Étapes de création">{["1. Ma base", "2. Mes séances", "3. Vérifier"].map((label, i) => <button type="button" key={label} aria-current={step === i + 1 ? "step" : undefined} onClick={() => { setStep(i + 1); setPicker(false); }}>{label}</button>)}</nav>
        <p className="muted">{dirty ? "Brouillon local · pense à enregistrer sur ton compte." : "Programme enregistré"}</p>
        {step === 1 ? <div className={styles.settings}>
          <label className="field-label">Nom du programme<input className="input" maxLength={100} value={draft.name} onChange={e => edit({ ...draft, name: e.target.value })} /></label>
          <label className="field-label">Objectif<select className="input" value={draft.goal} onChange={e => edit({ ...draft, goal: e.target.value as ProgramDraft["goal"] })}>{Object.entries(goalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field-label">Niveau<select className="input" value={draft.level} onChange={e => edit({ ...draft, level: e.target.value as ProgramDraft["level"] })}>{Object.entries(levelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <PrimaryButton type="button" onClick={() => setStep(2)}>Composer mes séances →</PrimaryButton>
        </div> : null}
        {step === 2 && day ? <>
          <div className={styles.tabs}>{draft.days.map((item, i) => <button type="button" key={item.id} aria-pressed={day.id === item.id} onClick={() => { setDayIndex(i); setPicker(false); }}>{item.title || `Séance ${i + 1}`} · {item.exercises.length}</button>)}</div>
          <label className="field-label">Nom de cette séance<input className="input" maxLength={100} value={day.title} onChange={e => changeDay({ ...day, title: e.target.value })} /></label>
          <div className={styles.row}>
            <button type="button" disabled={draft.days.length >= 7} onClick={() => { edit({ ...draft, days: [...draft.days, { id: uid(), title: `Séance ${draft.days.length + 1}`, focus: null, exercises: [] }] }); setDayIndex(draft.days.length); }}>+ Séance</button>
            <button type="button" disabled={draft.days.length >= 7} onClick={() => { edit({ ...draft, days: [...draft.days, { ...day, id: uid(), title: `${day.title.slice(0, 90)} (copie)`, exercises: day.exercises.map(ex => ({ ...ex, id: uid() })) }] }); setDayIndex(draft.days.length); }}>Dupliquer</button>
            <button type="button" disabled={draft.days.length <= 1} onClick={() => { if (window.confirm("Retirer cette séance du brouillon ? Ton historique d’entraînement reste conservé.")) { edit({ ...draft, days: draft.days.filter(item => item.id !== day.id) }); setDayIndex(0); } }}>Retirer la séance</button>
          </div>
          <div className={styles.list}>{day.exercises.map((ex, index) => <ExerciseRow key={ex.id} ex={ex} index={index} total={day.exercises.length} update={next => changeDay({ ...day, exercises: day.exercises.map(item => item.id === next.id ? next : item) })} move={direction => changeDay(moveDraftExercise(day, index, index + direction))} remove={() => changeDay({ ...day, exercises: day.exercises.filter(item => item.id !== ex.id) })} replace={() => { setReplacing(ex.id); setPicker(true); }} />)}</div>
          {!day.exercises.length ? <p className="muted">Choisis les exercices de cette séance en une seule fois.</p> : null}
          {picker ? <ExercisePicker key={replacing ?? "add"} single={!!replacing} accountId={accountId} onClose={() => setPicker(false)} onAdd={items => {
            if (replacing) {
              const replacement = items[0];
              changeDay({ ...day, exercises: day.exercises.map(ex => ex.id === replacing ? { ...ex, id: uid(), exerciseId: replacement.id, name: replacement.name, image: replacement.image, repsText: null } : ex) });
              setPicker(false); setReplacing(null); setError(""); return;
            }
            if (day.exercises.length + items.length > 30) { setError("Maximum 30 exercices par séance."); return; }
            changeDay({ ...day, exercises: [...day.exercises, ...items.map(ex => ({ id: uid(), exerciseId: ex.id, name: ex.name, image: ex.image, sets: 3, repsMin: 10, repsMax: 10, repsText: null, restSeconds: 60, tempo: null }))] }); setPicker(false); setError("");
          }} /> : <PrimaryButton type="button" onClick={() => { setReplacing(null); setPicker(true); }}>+ Choisir des exercices</PrimaryButton>}
          <button type="button" className={styles.next} onClick={() => { setStep(3); setPicker(false); }}>Vérifier mon programme →</button>
        </> : null}
        {step === 3 ? <div className={styles.list}><h3>{draft.name}</h3>{draft.days.map(item => <section className={styles.exercise} key={item.id}><h4>{item.title}</h4>{item.exercises.length ? item.exercises.map(ex => <p key={ex.id}>{ex.name} · {exerciseSummary(ex)}</p>) : <p>Séance vide : ajoute des exercices pour l’activer.</p>}</section>)}<p className="muted">« Activer » remplace ton programme actif pour les prochaines séances, sans effacer ton historique.</p></div> : null}
        <div className={styles.footer}><button type="button" onClick={() => void save(false)}>Enregistrer</button>{step === 3 ? <PrimaryButton type="button" onClick={() => void save(true)}>Enregistrer et activer</PrimaryButton> : null}</div>
        {draft.revision ? <button type="button" onClick={() => { if (window.confirm("Recharger la version enregistrée ? Les modifications locales seront abandonnées.")) { try { localStorage.removeItem(storageKey); } catch { setStorageError(true); } void openEditor(draft.id); } }}>Recharger la version enregistrée</button> : null}
        {programId ? <details><summary>Supprimer ce programme</summary><p>L’historique des entraînements sera conservé.</p><button type="button" onClick={async () => {
          if (busyRef.current || !window.confirm("Supprimer définitivement ce programme ? Tes entraînements passés sont conservés.")) return;
          busyRef.current = true; setBusy(true);
          try {
            const result = await deleteProgramEditor(programId);
            if (result.error) setError(result.error);
            else { setDirty(false); try { localStorage.removeItem(storageKey); } catch { setStorageError(true); } setOpened(false); router.refresh(); }
          } catch { setError("Suppression impossible. Vérifie ta connexion."); }
          finally { busyRef.current = false; setBusy(false); }
        }}>Confirmer la suppression</button></details> : null}
        <button type="button" onClick={() => { if (window.confirm("Abandonner ce brouillon local ? Les données déjà enregistrées sur ton compte restent intactes.")) { try { localStorage.removeItem(storageKey); } catch { setStorageError(true); } setDirty(false); setDraft(null); setOpened(false); setMode("choice"); } }}>Abandonner le brouillon</button>
      </> : null}
      </fieldset>
    </>}
  </section>;
}
