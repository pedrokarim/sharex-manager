"use client";

/**
 * « Monter ma prise » (dossier 01, V6), sur la page « Nouveau clip » : les
 * prises à monter (adresse, Mes médias, fichier), les réglages de la coupe
 * (vitesse, reprises, blancs, musique), puis le suivi du travail et son
 * bilan : ce qui a été coupé, les temps forts posés. Le projet s'ouvre dans
 * l'éditeur dès qu'il est prêt ; le bilan reste ici jusqu'à la prise
 * suivante.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, Check, Clapperboard, Film, LayoutPanelTop, ListPlus, Maximize, Music, RotateCcw, Scissors, ScanFace, Trash2, X } from "lucide-react";
import { FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { AspectPreset } from "../engine/types";
import { cancelTakeEdit, getTakeEditJob, startTakeEdit, type ClipSourceInput, type TakeEditJob, type TakeReport } from "../lib/client";
import { JobSteps, PanelActions, SourcePicker, sourceRequest, sourceTitle, type PickedSource } from "./clip-modes";

/** Icône du mode, reprise par la carte de la page « Nouveau clip ». */
export const TAKE_MODE_ICON = ScanFace;

const JOB_KEY = "clip-studio:take-job";
const MAX_TAKES = 5;

function rememberJob(id: string | null) {
  try {
    if (id) localStorage.setItem(JOB_KEY, id);
    else localStorage.removeItem(JOB_KEY);
  } catch {
    // Stockage indisponible : le travail se suit tant que la page reste ouverte.
  }
}

function rememberedJob(): string | null {
  try {
    return localStorage.getItem(JOB_KEY);
  } catch {
    return null;
  }
}

const SPEEDS: { value: string; label: string }[] = [
  { value: "1", label: "×1" },
  { value: "1.1", label: "×1,1" },
  { value: "1.2", label: "×1,2" },
  { value: "1.3", label: "×1,3" },
];

const SILENCES: { value: "soft" | "normal" | "tight"; label: string; help: string }[] = [
  { value: "soft", label: "Doux", help: "Seuls les blancs de plus de 0,6 s partent : la respiration reste." },
  { value: "normal", label: "Normal", help: "Les blancs de plus de 0,35 s partent, une marge de 0,1 s gardée autour de la parole." },
  { value: "tight", label: "Serré", help: "Le rythme d’un short : tout blanc de plus de 0,22 s part." },
];

/** « 38 s », « 1 min 05 ». */
function lengthLabel(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")}`;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;

interface ListedTake {
  key: string;
  source: PickedSource;
  request: ClipSourceInput;
  title: string;
}

/** Une prise ajoutée à la liste : son nom, sa provenance, ses gestes (monter, descendre, retirer). */
function TakeRow({ take, index, count, onMove, onRemove }: { take: ListedTake; index: number; count: number; onMove: (delta: number) => void; onRemove: () => void }) {
  const origin = take.source.type === "url" ? "Adresse" : take.source.uploaded ? "Fichier envoyé" : "Mes médias";
  const duration = take.source.type === "asset" ? take.source.asset.durationMs : take.source.range ? (take.source.range[1] - take.source.range[0]) * 1000 : undefined;
  return (
    <motion.li layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="flex min-w-0 items-center gap-2.5 rounded-lg border px-2.5 py-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium tabular-nums">{index + 1}</span>
      <Film className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm" title={take.title}>
          {take.title || "Prise"}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {origin}
          {duration ? ` · ${lengthLabel(duration)}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5">
        <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Monter la prise ${index + 1}`}>
          <ArrowUp />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Descendre la prise ${index + 1}`}>
          <ArrowDown />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Retirer la prise ${index + 1}`}>
          <Trash2 />
        </Button>
      </span>
    </motion.li>
  );
}

/** Réglage en ligne : un titre, une aide, et son contrôle à droite (dessous sur un écran étroit). */
function OptionRow({ title, help, children }: { title: string; help: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
      <span className="min-w-0 flex-1 basis-56">
        <span className="block text-sm">{title}</span>
        <span className="block text-xs text-pretty text-muted-foreground">{help}</span>
      </span>
      <span className="flex min-w-0 shrink-0 items-center">{children}</span>
    </div>
  );
}

// ─── Bilan ───────────────────────────────────────────────────────

const BOARD_LABELS: Record<string, string> = {
  title: "Titre",
  quote: "Phrase forte",
  counter: "Compteur",
  logo: "Logo",
  list: "Liste",
  compare: "Avant / après",
};

const RETAKE_LABELS: Record<string, string> = {
  restart: "Faux départ",
  filler: "Hésitation",
  marker: "Reprise annoncée",
  stutter: "Mot répété",
};

/** Ce que le montage a fait : durées, coupes, reprises retirées, temps forts posés. */
function TakeReportView({ report }: { report: TakeReport }) {
  const kept = report.sourceMs > 0 ? Math.min(1, report.editMs / report.sourceMs) : 1;
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Bilan du montage">
      <div className="grid min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))]">
        {[
          ["Prise", lengthLabel(report.sourceMs)],
          ["Montage", lengthLabel(report.editMs)],
          ["Blancs coupés", seconds(report.silenceMs)],
          ["Reprises coupées", seconds(report.retakeMs)],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-lg bg-muted/50 px-3 py-2">
            <span className="block truncate text-[11px] text-muted-foreground">{label}</span>
            <span className="block truncate text-base font-semibold tabular-nums">{value}</span>
          </div>
        ))}
      </div>
      <div className="flex min-w-0 items-center gap-2" aria-hidden>
        <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
          <motion.span className="block h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${Math.round(kept * 100)}%` }} transition={{ duration: 0.6 }} />
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{Math.round(kept * 100)}&nbsp;% gardés</span>
      </div>

      {report.retakes.length > 0 ? (
        <div className="min-w-0">
          <p className="mb-1.5 text-xs font-medium">Reprises retirées</p>
          <ul className="flex min-w-0 flex-col gap-1">
            {report.retakes.slice(0, 12).map((retake, index) => (
              <li key={index} className="flex min-w-0 items-baseline gap-2 text-xs">
                <span className="shrink-0 text-muted-foreground">{RETAKE_LABELS[retake.reason] ?? "Reprise"}</span>
                <span className="min-w-0 break-words line-through decoration-muted-foreground/60">«&nbsp;{retake.text}&nbsp;»</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.beats.length > 0 ? (
        <div className="min-w-0">
          <p className="mb-1.5 text-xs font-medium">Temps forts</p>
          <ol className="flex min-w-0 flex-col gap-1">
            {report.beats.map((beat, index) => (
              <li key={index} className="flex min-w-0 items-center gap-2 text-xs">
                <span className="w-10 shrink-0 text-muted-foreground tabular-nums">{seconds(beat.atMs)}</span>
                {beat.layout === "full" ? <Maximize className="size-3.5 shrink-0 text-muted-foreground" aria-label="Plein cadre" /> : <LayoutPanelTop className="size-3.5 shrink-0 text-muted-foreground" aria-label="Planche et caméra" />}
                <span className="shrink-0 font-medium">{beat.layout === "full" ? "Plein cadre" : BOARD_LABELS[beat.board ?? ""] ?? "Planche"}</span>
                {beat.text ? (
                  <span className="min-w-0 truncate text-muted-foreground" title={beat.text}>
                    {beat.text}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <ul className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex min-w-0 items-center gap-1.5">
          <ScanFace className="size-3.5 shrink-0" />
          {report.faces.some(Boolean) ? "Cadré sur le visage" : "Cadré au centre"}
        </li>
        {report.music ? (
          <li className="flex min-w-0 items-center gap-1.5">
            <Music className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate" title={report.music}>
              {report.music}
            </span>
          </li>
        ) : null}
        {report.logos.map((logo) => (
          <li key={logo.name} className="flex min-w-0 items-center gap-1.5">
            {logo.found ? <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" /> : <X className="size-3.5 shrink-0" />}
            <span className="min-w-0 truncate" title={logo.name}>
              Logo {logo.name}
              {logo.found ? "" : " : nom écrit à la place"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Panneau ─────────────────────────────────────────────────────

export function TakeEditPanel({
  aspect,
  brandKitId,
  onCreated,
  onClose,
  onActiveChange,
  actionsTarget,
}: {
  aspect: AspectPreset;
  brandKitId: string | null;
  onCreated: (projectId: string) => void;
  onClose: () => void;
  /** Un travail est suivi : la page masque le choix du mode et les réglages. */
  onActiveChange: (active: boolean) => void;
  actionsTarget?: HTMLElement | null;
}) {
  const [draft, setDraft] = useState<PickedSource | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [takes, setTakes] = useState<ListedTake[]>([]);
  const [speed, setSpeed] = useState("1.1");
  const [removeRetakes, setRemoveRetakes] = useState(true);
  const [silence, setSilence] = useState<"soft" | "normal" | "tight">("normal");
  const [music, setMusic] = useState(true);
  const [job, setJob] = useState<TakeEditJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const feedback = useFeedback();
  const openedFor = useRef<string | null>(null);

  // Travail laissé en cours (ou fini, avec son bilan) : retrouvé à la réouverture.
  useEffect(() => {
    const id = rememberedJob();
    if (!id) return;
    let alive = true;
    void getTakeEditJob(id)
      .then((found) => {
        if (!alive) return;
        if (found) {
          // Déjà ouvert une fois : le retour ici montre le bilan sans repartir vers l'éditeur.
          if (found.status === "done") openedFor.current = found.id;
          setJob(found);
        } else rememberJob(null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => onActiveChange(job !== null), [job, onActiveChange]);

  const poll = useCallback(
    async (id: string) => {
      const next = await getTakeEditJob(id).catch(() => null);
      if (!next) return;
      setJob(next);
      if (next.status === "done" && next.projectId && openedFor.current !== next.id) {
        openedFor.current = next.id;
        onCreated(next.projectId);
      }
    },
    [onCreated]
  );

  useEffect(() => {
    if (!job || job.status !== "running") return;
    const timer = window.setInterval(() => void poll(job.id), 1500);
    return () => window.clearInterval(timer);
  }, [job, poll]);

  const draftRequest = sourceRequest(draft, "subtitle");
  const draftValid = typeof draftRequest !== "string";
  const all = [...takes.map((take) => take.request), ...(draftValid ? [draftRequest] : [])];

  const addDraft = () => {
    if (!draft || typeof draftRequest === "string" || takes.length >= MAX_TAKES) return;
    setTakes((list) => [...list, { key: `${Date.now()}-${list.length}`, source: draft, request: draftRequest, title: sourceTitle(draft) }]);
    setDraft(null);
    setPickerKey((key) => key + 1);
  };

  const move = (index: number, delta: number) =>
    setTakes((list) => {
      const next = [...list];
      const [entry] = next.splice(index, 1);
      next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, entry);
      return next;
    });

  const start = async () => {
    if (all.length === 0) return;
    feedback.clear();
    setStarting(true);
    try {
      const started = await startTakeEdit({
        sources: all.slice(0, MAX_TAKES),
        aspect,
        ...(brandKitId ? { brandKitId } : {}),
        speed: Number(speed),
        removeRetakes,
        silence,
        music,
      });
      rememberJob(started.id);
      setJob(started);
    } catch (error) {
      feedback.error(errorMessage(error, "Le montage n’a pas pu démarrer. Réessayez."));
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    if (!job) return;
    setCanceling(true);
    try {
      await cancelTakeEdit(job.id);
      await poll(job.id);
    } finally {
      setCanceling(false);
    }
  };

  const reset = () => {
    rememberJob(null);
    setJob(null);
    feedback.clear();
  };

  if (job) {
    const running = job.status === "running";
    return (
      <>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/30 px-3 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <TAKE_MODE_ICON className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-xs text-muted-foreground">Monter ma prise</span>
              <span className="truncate text-sm font-medium" title={job.title}>
                {job.title ?? "Prise"}
              </span>
            </span>
          </div>
          <JobSteps job={job} />
          {(job.status === "error" || job.status === "canceled") && job.error ? (
            <p className={cn("rounded-lg p-3 text-sm break-words", job.status === "error" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>{job.error}</p>
          ) : null}
          {job.status === "done" && job.report ? <TakeReportView report={job.report} /> : null}
          {running ? (
            <Button type="button" variant="outline" size="sm" className="self-start" loading={canceling} onClick={() => void cancel()}>
              Annuler le montage
            </Button>
          ) : null}
        </div>
        <PanelActions target={actionsTarget}>
          {!running ? (
            <Button variant="ghost" onClick={reset} className="gap-2">
              <RotateCcw className="size-4" />
              Nouvelle prise
            </Button>
          ) : null}
          {job.status === "done" && job.projectId ? (
            <Button onClick={() => onCreated(job.projectId!)} className="gap-2">
              <Clapperboard className="size-4" />
              Ouvrir dans l’éditeur
            </Button>
          ) : (
            <Button variant={running ? "ghost" : "default"} onClick={onClose}>
              {running ? "Continuer en arrière-plan" : "Fermer"}
            </Button>
          )}
        </PanelActions>
      </>
    );
  }

  const full = takes.length >= MAX_TAKES;
  return (
    <>
      <div className="flex min-w-0 flex-col gap-5">
        <section className="flex min-w-0 flex-col gap-2" aria-label="Prises à monter">
          <AnimatePresence initial={false}>
            {takes.length > 0 ? (
              <motion.ol key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-w-0 flex-col gap-1.5">
                <AnimatePresence initial={false}>
                  {takes.map((take, index) => (
                    <TakeRow key={take.key} take={take} index={index} count={takes.length} onMove={(delta) => move(index, delta)} onRemove={() => setTakes((list) => list.filter((entry) => entry.key !== take.key))} />
                  ))}
                </AnimatePresence>
              </motion.ol>
            ) : null}
          </AnimatePresence>
          {!full ? (
            <>
              <SourcePicker key={pickerKey} kind="subtitle" value={draft} onChange={setDraft} embedded={actionsTarget !== undefined} />
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 flex-1 basis-56 text-xs text-pretty text-muted-foreground">
                  {takes.length === 0
                    ? "Une prise suffit. Plusieurs prises se suivent dans l’ordre de la liste (cinq au plus, 20 minutes en tout)."
                    : draftValid
                      ? `Cette vidéo sera la prise ${takes.length + 1}.`
                      : `Choisissez une autre prise, ou lancez le montage ${takes.length === 1 ? "de la prise listée" : `des ${takes.length} prises listées`}.`}
                </p>
                <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" disabled={!draftValid} onClick={addDraft}>
                  <ListPlus className="size-4" />
                  Ajouter et en choisir une autre
                </Button>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Cinq prises au plus par montage.</p>
          )}
        </section>

        <section className="min-w-0 divide-y rounded-lg border px-3 py-3" aria-label="Réglages de la coupe">
          <OptionRow title="Vitesse" help="La prise entière est accélérée, sans changer la hauteur de la voix.">
            <ToggleGroup type="single" variant="outline" size="sm" value={speed} onValueChange={(value) => value && setSpeed(value)} aria-label="Vitesse du montage">
              {SPEEDS.map((entry) => (
                <ToggleGroupItem key={entry.value} value={entry.value} className="px-2.5 text-xs tabular-nums">
                  {entry.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </OptionRow>
          <OptionRow title="Blancs" help={SILENCES.find((entry) => entry.value === silence)!.help}>
            <ToggleGroup type="single" variant="outline" size="sm" value={silence} onValueChange={(value) => value && setSilence(value as typeof silence)} aria-label="Seuil des blancs">
              {SILENCES.map((entry) => (
                <ToggleGroupItem key={entry.value} value={entry.value} className="px-2.5 text-xs">
                  {entry.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </OptionRow>
          <OptionRow title="Couper les reprises" help="Faux départs et phrases reprises : seule la dernière tentative complète reste.">
            <Switch checked={removeRetakes} onCheckedChange={setRemoveRetakes} aria-label="Couper les reprises" />
          </OptionRow>
          <OptionRow title="Musique de fond" help="Choisie d’après l’émotion de l’accroche, effacée sous la voix.">
            <Switch checked={music} onCheckedChange={setMusic} aria-label="Musique de fond" />
          </OptionRow>
        </section>
        <FormStatus state={feedback.state} />
      </div>
      <PanelActions target={actionsTarget}>
        <Button variant="ghost" onClick={onClose} disabled={starting}>
          Annuler
        </Button>
        <Button onClick={() => void start()} loading={starting} disabled={all.length === 0} className="gap-2">
          <Scissors className="size-4" />
          {all.length > 1 ? `Monter les ${all.length} prises` : "Monter ma prise"}
        </Button>
      </PanelActions>
    </>
  );
}
