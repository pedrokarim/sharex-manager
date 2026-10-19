"use client";

/**
 * Créations à partir d'une vidéo (dossier 01, V4), sur la page « Nouveau
 * clip » : « Sous-titrer un clip » et « Découper une vidéo ».
 *
 * Le panneau porte tout le parcours de son mode : choix de la source
 * (adresse lue par V2, média du module, fichier envoyé), cadrage, suivi des
 * étapes du travail, puis pour la découpe la revue des passages proposés et
 * la liste des clips créés. Le travail en cours est retrouvé à la
 * réouverture de la fenêtre.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Captions,
  Check,
  ExternalLink,
  Film,
  FolderOpen,
  Link2,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  ShieldAlert,
  Unplug,
  Upload,
  X,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Orb } from "@/components/loading";
import { FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { AspectPreset, ClipAsset } from "../engine/types";
import type { ClipFraming } from "../engine/video-templates";
import {
  callModule,
  cancelClipJob,
  createClipsFromMoments,
  getClipJob,
  importLocalFile,
  probeRemoteVideo,
  startClipping,
  startSubtitleClip,
  type ClipJob,
  type ClipMoment,
  type ClipOptions,
  type RemoteProbe,
} from "../lib/client";
import { formatClock, parseClock } from "../lib/clock";
import { MOMENT_LIMITS } from "../lib/clip-moments";
import { RangePicker } from "./remote-import-panel";

export type ClipModeKind = "subtitle" | "clipping";

/** Passage le plus long récupéré par adresse : 20 minutes pour un clip, deux heures pour une vidéo à découper. */
const MAX_SECONDS: Record<ClipModeKind, number> = { subtitle: 20 * 60, clipping: 2 * 60 * 60 };
const MAX_LABEL: Record<ClipModeKind, string> = { subtitle: "20 minutes", clipping: "2 heures" };
const JOB_KEY = (kind: ClipModeKind) => `clip-studio:clip-job:${kind}`;

function rememberJob(kind: ClipModeKind, id: string | null) {
  try {
    if (id) localStorage.setItem(JOB_KEY(kind), id);
    else localStorage.removeItem(JOB_KEY(kind));
  } catch {
    // Stockage indisponible : le travail se suit tant que la fenêtre reste ouverte.
  }
}

function rememberedJob(kind: ClipModeKind): string | null {
  try {
    return localStorage.getItem(JOB_KEY(kind));
  } catch {
    return null;
  }
}

/** « 38 s », « 1 min 05 ». */
function lengthLabel(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")}`;
}

// ─── Source ──────────────────────────────────────────────────────

export type PickedSource =
  | { type: "url"; probe: RemoteProbe; range: [number, number] | null; freeStart: string; freeEnd: string }
  | { type: "asset"; asset: ClipAsset; uploaded: boolean };

type SourceTab = "url" | "media" | "file";

const SOURCE_TABS: { id: SourceTab; label: string; icon: typeof Link2 }[] = [
  { id: "url", label: "Adresse", icon: Link2 },
  { id: "media", label: "Mes médias", icon: FolderOpen },
  { id: "file", label: "Fichier", icon: Upload },
];

/** Source à envoyer au serveur, ou le message qui dit ce qui manque. */
export function sourceRequest(source: PickedSource | null, kind: ClipModeKind): ClipOptions["source"] | string {
  if (!source) return "Choisissez une vidéo.";
  if (source.type === "asset") return { assetFile: source.asset.file, ...(source.uploaded ? { uploaded: true } : {}) };
  const max = MAX_SECONDS[kind];
  if (source.range) {
    const [start, end] = source.range;
    if (end - start < 1) return "Le passage doit durer au moins une seconde.";
    if (end - start > max) return `Le passage dépasse ${MAX_LABEL[kind]} : choisissez-en un plus court.`;
    return { url: source.probe.url, start, end };
  }
  const start = source.freeStart.trim() ? parseClock(source.freeStart) : 0;
  const end = source.freeEnd.trim() ? parseClock(source.freeEnd) : undefined;
  if (start === null || end === null) return "Écrivez les instants comme 1:05 ou 1:02:03.";
  if (end !== undefined && end <= start) return "La fin doit venir après le début.";
  if (end !== undefined && end - start > max) return `Le passage dépasse ${MAX_LABEL[kind]} : choisissez-en un plus court.`;
  return { url: source.probe.url, start, ...(end !== undefined ? { end } : {}) };
}

/** Titre de la source : celui de la vidéo lue, ou le nom du fichier sans extension. */
export function sourceTitle(source: PickedSource | null): string {
  if (!source) return "";
  if (source.type === "url") return source.probe.title;
  return (source.asset.origin?.title ?? source.asset.originalName).replace(/\.[a-z0-9]{2,4}$/i, "");
}

export function SourcePicker({
  kind,
  value,
  onChange,
  embedded = false,
}: {
  kind: ClipModeKind;
  value: PickedSource | null;
  onChange: (source: PickedSource | null) => void;
  /** Dans un panneau de la page : ni cadre ni filet, le contenu suit l'en-tête. */
  embedded?: boolean;
}) {
  const [tab, setTab] = useState<SourceTab>(value?.type === "asset" ? (value.uploaded ? "file" : "media") : "url");
  return (
    <section className={cn("min-w-0", !embedded && "rounded-lg border")} aria-label="Vidéo source">
      <header className={cn("flex min-w-0 flex-wrap items-center justify-between gap-2", embedded ? "pb-2" : "border-b px-3 py-2")}>
        <span className="text-sm font-medium">Vidéo source</span>
        <div className="flex max-w-full flex-wrap gap-0.5 rounded-md bg-muted p-0.5" role="tablist" aria-label="Origine de la vidéo">
          {SOURCE_TABS.map((entry) => {
            const Icon = entry.icon;
            const active = tab === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(entry.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors",
                  active ? "bg-background font-medium text-foreground shadow-sm" : "text-foreground/70 hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {entry.label}
              </button>
            );
          })}
        </div>
      </header>
      <div className={cn("min-w-0", !embedded && "p-3")}>
        {tab === "url" && <UrlSource kind={kind} value={value?.type === "url" ? value : null} onChange={onChange} />}
        {tab === "media" && <MediaList kind={kind} value={value?.type === "asset" && !value.uploaded ? value.asset : null} onChange={(asset) => onChange(asset ? { type: "asset", asset, uploaded: false } : null)} />}
        {tab === "file" && <FileSource value={value?.type === "asset" && value.uploaded ? value.asset : null} onChange={(asset) => onChange(asset ? { type: "asset", asset, uploaded: true } : null)} />}
      </div>
    </section>
  );
}

function UrlSource({
  kind,
  value,
  onChange,
}: {
  kind: ClipModeKind;
  value: Extract<PickedSource, { type: "url" }> | null;
  onChange: (source: PickedSource | null) => void;
}) {
  const [url, setUrl] = useState(value?.probe.url ?? "");
  const [reading, setReading] = useState(false);
  const feedback = useFeedback();
  const max = MAX_SECONDS[kind];

  const read = async () => {
    const text = url.trim();
    feedback.clear();
    if (!text) {
      feedback.error("Collez l’adresse d’une vidéo YouTube, Twitch, ou d’un fichier vidéo.");
      return;
    }
    setReading(true);
    try {
      const probe = await probeRemoteVideo(text);
      const start = probe.duration ? Math.min(Math.max(0, Math.floor(probe.startHint ?? 0)), Math.max(0, Math.floor(probe.duration) - 1)) : 0;
      onChange({
        type: "url",
        probe,
        range: probe.duration ? [start, Math.min(probe.duration, start + max)] : null,
        freeStart: probe.startHint ? formatClock(probe.startHint) : "",
        freeEnd: "",
      });
    } catch (error) {
      onChange(null);
      feedback.error(errorMessage(error, "Cette adresse n’a pas pu être lue. Vérifiez-la, puis réessayez."));
    } finally {
      setReading(false);
    }
  };

  const probe = value?.probe;
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <form
        className="flex min-w-0 gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          void read();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              if (feedback.state?.tone === "error") feedback.clear();
            }}
            placeholder="Collez l’adresse d’une vidéo"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            maxLength={2000}
            aria-label="Adresse de la vidéo"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Button type="submit" size="sm" className="h-8 shrink-0 px-3 text-xs" loading={reading}>
          Lire
        </Button>
      </form>
      <FormStatus state={feedback.state} />

      {!probe && !reading && (
        <p className="text-xs break-words text-muted-foreground">
          Un clip ou une VOD Twitch, une vidéo YouTube, ou un lien direct vers un fichier vidéo. Seul le passage choisi est récupéré,{" "}
          {MAX_LABEL[kind]} au plus{kind === "clipping" ? ", en 720p" : ""}.
        </p>
      )}

      {probe && value && (
        <motion.div key={probe.url} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex min-w-0 flex-col gap-2.5">
          <div className="grid min-w-0 grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3">
            <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
              {probe.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={probe.thumbnail} alt="" className="h-full w-full max-w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <Film className="h-5 w-5 text-muted-foreground" />
                </span>
              )}
              {probe.duration ? (
                <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 py-px text-[10px] text-white tabular-nums">{formatClock(probe.duration)}</span>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="line-clamp-2 min-w-0 text-sm font-medium break-words" title={probe.title}>
                {probe.title}
              </p>
              <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                {probe.site === "youtube" && <BrandLogo brand="youtube" className="size-3.5" />}
                {probe.site === "twitch" && <BrandLogo brand="twitch" className="size-3.5" />}
                {probe.site === "web" && <Unplug className="h-3.5 w-3.5 shrink-0" />}
                <span className="min-w-0 truncate" title={probe.author}>
                  {probe.author ?? (probe.site === "youtube" ? "YouTube" : probe.site === "twitch" ? "Twitch" : "Lien direct")}
                </span>
                <a
                  href={probe.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Ouvrir la vidéo sur son site"
                  title={probe.url}
                  className="ml-auto inline-flex shrink-0 items-center rounded p-0.5 hover:bg-muted hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>

          {value.range && probe.duration ? (
            <RangePicker duration={probe.duration} range={value.range} maxSeconds={max} onChange={(range) => onChange({ ...value, range })} />
          ) : (
            <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
              <label className="flex min-w-0 flex-col gap-1 text-[11px] text-muted-foreground">
                Début
                <Input value={value.freeStart} onChange={(event) => onChange({ ...value, freeStart: event.target.value })} placeholder="0:00" className="h-7 text-xs tabular-nums" />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-[11px] text-muted-foreground">
                Fin (facultative)
                <Input value={value.freeEnd} onChange={(event) => onChange({ ...value, freeEnd: event.target.value })} placeholder="fin" className="h-7 text-xs tabular-nums" />
              </label>
            </div>
          )}

          <p className="flex min-w-0 items-start gap-1.5 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
            <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words">Droits à vérifier avant de publier&nbsp;: la mention de la source suit la vidéo.</span>
          </p>
        </motion.div>
      )}
    </div>
  );
}

function MediaList({ kind, value, onChange }: { kind: ClipModeKind; value: ClipAsset | null; onChange: (asset: ClipAsset | null) => void }) {
  const [assets, setAssets] = useState<ClipAsset[] | null>(null);
  const feedback = useFeedback();
  useEffect(() => {
    let alive = true;
    callModule<ClipAsset[]>("listAssets")
      .then((list) => alive && setAssets(list.filter((asset) => asset.kind === "video")))
      .catch((error) => {
        if (!alive) return;
        setAssets([]);
        feedback.error(errorMessage(error, "Vos médias n’ont pas pu être lus. Réessayez."));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lecture unique à l'ouverture de l'onglet
  }, []);

  if (assets === null) {
    return (
      <div className="flex h-24 items-center justify-center" aria-live="polite">
        <Orb size="sm" state="composing" className="text-primary" />
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <FormStatus state={feedback.state} />
      {assets.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Aucune vidéo dans Mes médias pour l’instant.</p>
      ) : (
        <ul className="flex max-h-56 min-w-0 flex-col gap-1 overflow-y-auto overscroll-contain pr-0.5" role="listbox" aria-label="Vidéos de Mes médias">
          {assets.map((asset) => {
            const selected = value?.file === asset.file;
            // Sous-titrer un clip : une vidéo de plus de 20 minutes se découpe plutôt.
            const tooLong = kind === "subtitle" && (asset.durationMs ?? 0) > MAX_SECONDS.subtitle * 1000;
            const name = asset.origin?.title ?? asset.originalName;
            return (
              <li key={asset.file} className="min-w-0">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={tooLong}
                  onClick={() => onChange(selected ? null : asset)}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    selected ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted"
                  )}
                >
                  <Film className={cn("h-4 w-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm" title={name}>
                      {name}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {asset.durationMs ? formatClock(asset.durationMs / 1000) : "Durée inconnue"}
                      {asset.transcript ? " · transcrite" : ""}
                      {tooLong ? " · plus de 20 minutes, à découper" : ""}
                    </span>
                  </span>
                  {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FileSource({ value, onChange }: { value: ClipAsset | null; onChange: (asset: ClipAsset | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const feedback = useFeedback();

  const send = async (file: File) => {
    feedback.clear();
    setProgress(0);
    try {
      const asset = await importLocalFile(file, (ratio) => setProgress(ratio));
      if (asset.kind !== "video") {
        onChange(null);
        feedback.error("Ce fichier n’est pas une vidéo.");
        return;
      }
      onChange(asset);
    } catch (error) {
      feedback.error(errorMessage(error, "L’envoi a échoué. Réessayez."));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv,.m4v"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void send(file);
        }}
      />
      {value && progress === null ? (
        <div className="flex min-w-0 items-center gap-2.5 rounded-md border px-2.5 py-2">
          <Film className="h-4 w-4 shrink-0 text-primary" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm" title={value.originalName}>
              {value.originalName}
            </span>
            <span className="text-[11px] text-muted-foreground">{value.durationMs ? formatClock(value.durationMs / 1000) : "Durée inconnue"} · envoyée</span>
          </span>
          <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" onClick={() => input.current?.click()}>
            Changer
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={progress !== null}
          onClick={() => input.current?.click()}
          className="flex min-w-0 flex-col items-center gap-1.5 rounded-md border border-dashed px-3 py-5 text-center text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-wait"
        >
          <Upload className="h-5 w-5" />
          <span className="break-words">{progress === null ? "Choisir une vidéo sur cet appareil (500 Mo au plus)" : "Envoi en cours…"}</span>
        </button>
      )}
      {progress !== null && (
        <div className="flex min-w-0 items-center gap-2" aria-live="polite">
          <Progress value={Math.round(progress * 100)} className="h-1 min-w-0 flex-1" />
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{Math.round(progress * 100)}&nbsp;%</span>
        </div>
      )}
      <FormStatus state={feedback.state} />
    </div>
  );
}

// ─── Cadrage ─────────────────────────────────────────────────────

const FRAMINGS: { id: ClipFraming; label: string; description: string }[] = [
  { id: "crop", label: "Recadrer", description: "La vidéo remplit le cadre, coupée au centre." },
  { id: "blur", label: "Image entière sur fond flou", description: "Toute l’image, posée sur sa propre copie floue et assombrie." },
];

/** Petit schéma d'un cadrage : un cadre vertical et une vidéo large. */
function FramingSketch({ framing, selected }: { framing: ClipFraming; selected: boolean }) {
  const tone = selected ? "bg-primary" : "bg-muted-foreground/60";
  return (
    <span className="relative flex h-12 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[3px] border-2 border-current" aria-hidden>
      {framing === "crop" ? (
        <span className={cn("h-full w-full", tone)} />
      ) : (
        <>
          <span className={cn("absolute inset-0 opacity-30 blur-[1px]", tone)} />
          <span className={cn("relative h-3 w-full", tone)} />
        </>
      )}
    </span>
  );
}

function FramingPicker({ value, onChange }: { value: ClipFraming; onChange: (value: ClipFraming) => void }) {
  return (
    <div className="space-y-2">
      <span className="block text-sm">
        Cadrage
        <span className="block text-xs text-muted-foreground">Quand la vidéo n’a pas le format du clip&nbsp;; au même format, elle remplit le cadre.</span>
      </span>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
        {FRAMINGS.map((entry) => {
          const selected = value === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(entry.id)}
              className={cn(
                "flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                selected ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
              )}
            >
              <FramingSketch framing={entry.id} selected={selected} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">{entry.label}</span>
                <span className={cn("text-xs leading-4", selected ? "text-foreground/70" : "text-muted-foreground")}>{entry.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Étapes du travail ───────────────────────────────────────────

export function JobSteps({ job }: { job: { steps: { id: string; label: string; state: string; detail?: string }[] } }) {
  return (
    <ol className="space-y-2" aria-label="Étapes">
      {job.steps.map((step) => (
        <motion.li key={step.id} layout className="flex min-w-0 items-start gap-3 rounded-lg border px-3 py-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
            {step.state === "running" && <Orb size="xs" state="composing" className="text-primary" />}
            {step.state === "done" && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
                <Check className="h-4 w-4 text-emerald-500" />
              </motion.span>
            )}
            {step.state === "error" && <X className="h-4 w-4 text-destructive" />}
            {(step.state === "pending" || step.state === "skipped") && <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />}
          </span>
          <span className="min-w-0 flex-1 pt-0.5">
            <span className={cn("block text-sm", step.state === "skipped" && "text-muted-foreground line-through", step.state === "pending" && "text-muted-foreground")}>
              {step.label}
            </span>
            {step.detail && <span className="mt-0.5 block text-xs text-pretty text-muted-foreground [overflow-wrap:anywhere]">{step.detail}</span>}
          </span>
        </motion.li>
      ))}
    </ol>
  );
}

/** En-tête d'un travail : la vidéo traitée. */
function JobHeader({ job }: { job: ClipJob }) {
  const Icon = job.kind === "subtitle" ? Captions : Scissors;
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/30 px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-muted-foreground">{job.kind === "subtitle" ? "Sous-titrer un clip" : "Découper une vidéo"}</span>
        <span className="truncate text-sm font-medium" title={job.title}>
          {job.title ?? "Vidéo"}
        </span>
      </span>
    </div>
  );
}

// ─── Revue des passages ──────────────────────────────────────────

interface MomentDraft extends ClipMoment {
  checked: boolean;
}

/** Lecteur d'un passage : la vidéo source, lue de son début à sa fin. */
function MomentPlayer({ url, moment }: { url: string; moment: MomentDraft | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const start = (moment?.startMs ?? 0) / 1000;
  const end = (moment?.endMs ?? 0) / 1000;

  useEffect(() => {
    const element = video.current;
    if (!element || !moment) return;
    element.pause();
    setPlaying(false);
    const seek = () => {
      element.currentTime = start;
      setTime(start);
    };
    if (element.readyState >= 1) seek();
    else element.addEventListener("loadedmetadata", seek, { once: true });
    return () => element.removeEventListener("loadedmetadata", seek);
    // Seules les bornes comptent : renommer le passage ne relance pas la lecture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment?.id, start, end]);

  const toggle = () => {
    const element = video.current;
    if (!element || !moment) return;
    if (!element.paused) {
      element.pause();
      return;
    }
    if (element.currentTime < start - 0.05 || element.currentTime >= end - 0.05) element.currentTime = start;
    void element.play().catch(() => setPlaying(false));
  };

  const ratio = moment && end > start ? Math.min(1, Math.max(0, (time - start) / (end - start))) : 0;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="relative aspect-video max-h-64 w-full overflow-hidden rounded-lg bg-black">
        <video
          ref={video}
          src={url}
          preload="metadata"
          playsInline
          className="h-full w-full max-w-full object-contain"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => {
            const element = event.currentTarget;
            setTime(element.currentTime);
            if (moment && element.currentTime >= end) {
              element.pause();
              element.currentTime = start;
            }
          }}
        />
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Button type="button" size="icon-sm" variant="outline" onClick={toggle} disabled={!moment} aria-label={playing ? "Mettre en pause" : "Lire le passage"}>
          {playing ? <Pause /> : <Play />}
        </Button>
        <Progress value={Math.round(ratio * 100)} className="h-1 min-w-0 flex-1" />
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {moment ? `${formatClock(Math.max(0, time - start))} / ${formatClock(end - start)}` : "–"}
        </span>
      </div>
    </div>
  );
}

/** Décalage d'une borne, d'une seconde : le passage reste dans la vidéo et dans ses bornes de durée. */
function nudge(moment: MomentDraft, edge: "start" | "end", deltaMs: number, durationMs: number): MomentDraft {
  if (edge === "start") {
    const startMs = Math.max(0, Math.max(moment.endMs - MOMENT_LIMITS.editMaxMs, Math.min(moment.startMs + deltaMs, moment.endMs - MOMENT_LIMITS.editMinMs)));
    return { ...moment, startMs };
  }
  const endMs = Math.min(durationMs, Math.min(moment.startMs + MOMENT_LIMITS.editMaxMs, Math.max(moment.endMs + deltaMs, moment.startMs + MOMENT_LIMITS.editMinMs)));
  return { ...moment, endMs };
}

function NudgeButtons({ label, onNudge }: { label: string; onNudge: (deltaMs: number) => void }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border" role="group" aria-label={label}>
      <button type="button" onClick={() => onNudge(-1000)} className="px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`${label} : une seconde plus tôt`}>
        −1&nbsp;s
      </button>
      <span className="border-x px-1.5 py-0.5 text-[11px]">{label}</span>
      <button type="button" onClick={() => onNudge(1000)} className="px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`${label} : une seconde plus tard`}>
        +1&nbsp;s
      </button>
    </span>
  );
}

function MomentsReview({
  job,
  drafts,
  onChange,
  keepSource,
  onKeepSource,
}: {
  job: ClipJob;
  drafts: MomentDraft[];
  onChange: (drafts: MomentDraft[]) => void;
  keepSource: boolean;
  onKeepSource: (keep: boolean) => void;
}) {
  const [previewId, setPreviewId] = useState<string | null>(drafts[0]?.id ?? null);
  const preview = drafts.find((draft) => draft.id === previewId) ?? null;
  const durationMs = job.source?.durationMs ?? Number.MAX_SAFE_INTEGER;
  const checked = drafts.filter((draft) => draft.checked).length;
  const update = (id: string, change: (draft: MomentDraft) => MomentDraft) => onChange(drafts.map((draft) => (draft.id === id ? change(draft) : draft)));

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {job.source && <MomentPlayer url={job.source.url} moment={preview} />}
      <section className="min-w-0 rounded-lg border" aria-label="Passages proposés">
        <header className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-sm font-medium">
            {drafts.length} passage{drafts.length > 1 ? "s" : ""} proposé{drafts.length > 1 ? "s" : ""}
          </span>
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => onChange(drafts.map((draft) => ({ ...draft, checked: checked < drafts.length })))}
          >
            {checked < drafts.length ? "Tout cocher" : "Tout décocher"}
          </button>
        </header>
        <ol className="divide-y">
          {drafts.map((draft, index) => (
            <li key={draft.id} className={cn("flex min-w-0 gap-2.5 px-3 py-2.5", previewId === draft.id && "bg-muted/40")}>
              <Checkbox
                checked={draft.checked}
                onCheckedChange={(next) => update(draft.id, (current) => ({ ...current, checked: next === true }))}
                aria-label={`Garder le passage ${index + 1}`}
                className="mt-2"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    value={draft.title}
                    onChange={(event) => update(draft.id, (current) => ({ ...current, title: event.target.value }))}
                    maxLength={90}
                    aria-label={`Titre du passage ${index + 1}`}
                    className="h-8 min-w-0 flex-1 text-sm font-medium"
                  />
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums" title="Note de Codex">
                    {String(draft.score).replace(".", ",")}/10
                  </span>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={previewId === draft.id ? "secondary" : "ghost"}
                    className="h-6 gap-1 px-1.5 text-[11px]"
                    onClick={() => setPreviewId(draft.id)}
                    aria-label={`Voir le passage ${index + 1}`}
                  >
                    <Play className="h-3 w-3" />
                    <span className="tabular-nums">
                      {formatClock(draft.startMs / 1000)} → {formatClock(draft.endMs / 1000)}
                    </span>
                  </Button>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{lengthLabel(draft.endMs - draft.startMs)}</span>
                  <span className="flex min-w-0 flex-wrap gap-1.5">
                    <NudgeButtons label="Début" onNudge={(delta) => update(draft.id, (current) => nudge(current, "start", delta, durationMs))} />
                    <NudgeButtons label="Fin" onNudge={(delta) => update(draft.id, (current) => nudge(current, "end", delta, durationMs))} />
                  </span>
                </div>
                {draft.reason && <p className="text-xs break-words text-muted-foreground">{draft.reason}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>
      {job.source?.owned && (
        <label className="flex min-w-0 items-start gap-2.5 rounded-lg border px-3 py-2.5">
          <Checkbox checked={keepSource} onCheckedChange={(next) => onKeepSource(next === true)} className="mt-0.5" />
          <span className="min-w-0 text-sm">
            Garder la vidéo source
            <span className="block text-xs text-muted-foreground">Sinon, elle est effacée de Mes médias une fois les extraits coupés.</span>
          </span>
        </label>
      )}
    </div>
  );
}

/** Clips créés par une découpe, chacun ouvrable dans l'éditeur. */
function CreatedClips({ job, onOpen }: { job: ClipJob; onOpen: (projectId: string) => void }) {
  if (!job.clips?.length) return null;
  return (
    <section className="min-w-0 rounded-lg border" aria-label="Clips créés">
      <header className="border-b px-3 py-2 text-sm font-medium">
        {job.clips.length} clip{job.clips.length > 1 ? "s" : ""} créé{job.clips.length > 1 ? "s" : ""}
      </header>
      <ul className="divide-y">
        {job.clips.map((clip) => (
          <li key={clip.projectId} className="flex min-w-0 items-center gap-2.5 px-3 py-2">
            <Film className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm" title={clip.name}>
                {clip.name}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">{lengthLabel(clip.durationMs)}</span>
            </span>
            <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 px-2.5 text-xs" onClick={() => onOpen(clip.projectId)}>
              Ouvrir
            </Button>
          </li>
        ))}
      </ul>
      {job.sourceRemoved && <p className="border-t px-3 py-2 text-xs text-muted-foreground">La vidéo source a été effacée de Mes médias.</p>}
    </section>
  );
}

// ─── Panneau d'un mode ───────────────────────────────────────────

/**
 * Boutons du panneau : posés dans `target` (la colonne des réglages de la
 * page) quand il est donné, sinon au pied du panneau. `null` : la cible n'est
 * pas encore montée, rien n'est posé.
 */
export function PanelActions({ target, children }: { target?: HTMLElement | null; children: ReactNode }) {
  const actions = <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">{children}</div>;
  if (target === undefined) return <div className="border-t pt-4">{actions}</div>;
  return target ? createPortal(actions, target) : null;
}

export function ClipModePanel({
  kind,
  aspect,
  brandKitId,
  aspectPicker,
  onCreated,
  onClose,
  onActiveChange,
  actionsTarget,
}: {
  kind: ClipModeKind;
  aspect: AspectPreset;
  brandKitId: string | null;
  /** Choix du format, posé avant les boutons ; absent quand la page le porte dans ses réglages. */
  aspectPicker?: ReactNode;
  onCreated: (projectId: string) => void;
  onClose: () => void;
  /** Un travail est suivi : la fenêtre masque le choix du mode et de la marque. */
  onActiveChange: (active: boolean) => void;
  /** Où poser les boutons (colonne des réglages) ; absent : au pied du panneau. */
  actionsTarget?: HTMLElement | null;
}) {
  const [source, setSource] = useState<PickedSource | null>(null);
  const [framing, setFraming] = useState<ClipFraming>("crop");
  const [withHook, setWithHook] = useState(true);
  const [hook, setHook] = useState("");
  const [hookEdited, setHookEdited] = useState(false);
  const [job, setJob] = useState<ClipJob | null>(null);
  const [drafts, setDrafts] = useState<MomentDraft[]>([]);
  const [keepSource, setKeepSource] = useState(false);
  const [starting, setStarting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const startFeedback = useFeedback();
  const reviewFeedback = useFeedback();
  const openedFor = useRef<string | null>(null);

  // Travail laissé en cours ou en attente de choix : retrouvé à la réouverture.
  useEffect(() => {
    const id = rememberedJob(kind);
    if (!id) return;
    let alive = true;
    void getClipJob(id)
      .then((found) => {
        if (!alive) return;
        if (found && (found.status === "running" || found.status === "review")) setJob(found);
        else rememberJob(kind, null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [kind]);

  useEffect(() => onActiveChange(job !== null), [job, onActiveChange]);

  // L'accroche reprend le titre de la vidéo tant qu'on ne l'a pas réécrite.
  const title = sourceTitle(source);
  useEffect(() => {
    if (!hookEdited) setHook(title.slice(0, 120));
  }, [title, hookEdited]);

  // Passages proposés : tous cochés au départ.
  const momentsKey = job?.status === "review" ? job.moments?.map((moment) => `${moment.id}:${moment.startMs}:${moment.endMs}`).join("|") : "";
  useEffect(() => {
    if (job?.status === "review" && job.moments) setDrafts(job.moments.map((moment) => ({ ...moment, checked: true })));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la clé résume les passages
  }, [momentsKey]);

  const poll = useCallback(async (id: string) => {
    const next = await getClipJob(id).catch(() => null);
    if (!next) return;
    setJob(next);
    if (next.status !== "running" && next.status !== "review") rememberJob(next.kind, null);
    if (next.kind === "subtitle" && next.status === "done" && next.projectId && openedFor.current !== next.id) {
      openedFor.current = next.id;
      onCreated(next.projectId);
    }
  }, [onCreated]);

  useEffect(() => {
    if (!job || job.status !== "running") return;
    const timer = window.setInterval(() => void poll(job.id), 1500);
    return () => window.clearInterval(timer);
  }, [job, poll]);

  const request = sourceRequest(source, kind);

  const start = async () => {
    if (typeof request === "string") return;
    startFeedback.clear();
    setStarting(true);
    try {
      const options: ClipOptions = {
        source: request,
        aspect,
        framing,
        ...(brandKitId ? { brandKitId } : {}),
        ...(kind === "subtitle" && withHook && hook.trim() ? { hook: hook.trim() } : {}),
      };
      const started = kind === "subtitle" ? await startSubtitleClip(options) : await startClipping(options);
      rememberJob(kind, started.id);
      setJob(started);
    } catch (error) {
      startFeedback.error(errorMessage(error, "La création n’a pas pu démarrer. Réessayez."));
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    if (!job) return;
    setCanceling(true);
    try {
      await cancelClipJob(job.id);
      await poll(job.id);
    } finally {
      setCanceling(false);
    }
  };

  const createClips = async () => {
    if (!job) return;
    reviewFeedback.clear();
    const chosen = drafts.filter((draft) => draft.checked);
    if (chosen.some((draft) => !draft.title.trim())) {
      reviewFeedback.error("Donnez un titre à chaque passage coché.");
      return;
    }
    setCreating(true);
    try {
      const next = await createClipsFromMoments({
        jobId: job.id,
        moments: chosen.map(({ id, startMs, endMs, title: name }) => ({ id, startMs, endMs, title: name.trim() })),
        keepSource,
      });
      setJob(next);
    } catch (error) {
      reviewFeedback.error(errorMessage(error, "Les clips n’ont pas pu être créés. Réessayez."));
    } finally {
      setCreating(false);
    }
  };

  const reset = () => {
    rememberJob(kind, null);
    setJob(null);
    setDrafts([]);
    startFeedback.clear();
    reviewFeedback.clear();
  };

  const checkedCount = drafts.filter((draft) => draft.checked).length;
  const detail = useMemo(
    () =>
      kind === "subtitle"
        ? "La vidéo garde son son ; ses paroles deviennent des sous-titres animés à la marque, avec le filigrane et le carton de fin."
        : "Une longue vidéo (2 heures au plus) est transcrite, puis Codex y repère les passages forts de 15 à 60 secondes. Vous choisissez ceux à garder : chacun devient un clip sous-titré.",
    [kind]
  );

  if (job) {
    const running = job.status === "running";
    const review = job.status === "review";
    return (
      <>
        <div className="flex min-w-0 flex-col gap-3">
          <JobHeader job={job} />
          {review ? <MomentsReview job={job} drafts={drafts} onChange={setDrafts} keepSource={keepSource} onKeepSource={setKeepSource} /> : <JobSteps job={job} />}
          {(job.status === "error" || job.status === "canceled") && job.error && (
            <p className={cn("rounded-lg p-3 text-sm break-words", job.status === "error" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>{job.error}</p>
          )}
          <CreatedClips job={job} onOpen={onCreated} />
          {running && (
            <Button type="button" variant="outline" size="sm" className="self-start" loading={canceling} onClick={() => void cancel()}>
              Annuler la création
            </Button>
          )}
          <FormStatus state={reviewFeedback.state} />
        </div>
        <PanelActions target={actionsTarget}>
          {review ? (
            <>
              <Button variant="ghost" loading={canceling} onClick={() => void cancel()}>
                Abandonner
              </Button>
              <Button onClick={() => void createClips()} loading={creating} disabled={checkedCount === 0} className="gap-2">
                <Scissors className="h-4 w-4" />
                {checkedCount > 1 ? `Créer ${checkedCount} clips` : checkedCount === 1 ? "Créer 1 clip" : "Cochez un passage"}
              </Button>
            </>
          ) : (
            <>
              {!running && (
                <Button variant="ghost" onClick={reset} className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Nouvelle vidéo
                </Button>
              )}
              <Button variant={running ? "ghost" : "default"} onClick={onClose}>
                {running ? "Continuer en arrière-plan" : "Fermer"}
              </Button>
            </>
          )}
        </PanelActions>
      </>
    );
  }

  return (
    <>
      <div className="flex min-w-0 flex-col gap-5">
        {actionsTarget === undefined ? <p className="text-xs break-words text-muted-foreground">{detail}</p> : null}
        <SourcePicker kind={kind} value={source} onChange={setSource} embedded={actionsTarget !== undefined} />
        {kind === "subtitle" && (
          <div className={cn("min-w-0 space-y-2", actionsTarget === undefined && "rounded-lg border p-3")}>
            <label className="flex items-start justify-between gap-3">
              <span className="min-w-0 text-sm">
                Titre d’accroche
                <span className="block text-xs text-muted-foreground">Posé en haut du clip pendant les trois premières secondes.</span>
              </span>
              <Switch checked={withHook} onCheckedChange={setWithHook} />
            </label>
            <AnimatePresence initial={false}>
              {withHook && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                  <Input
                    value={hook}
                    onChange={(event) => {
                      setHook(event.target.value);
                      setHookEdited(true);
                    }}
                    maxLength={120}
                    placeholder="Une accroche courte"
                    aria-label="Titre d’accroche"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        <FramingPicker value={framing} onChange={setFraming} />
        {aspectPicker}
        <FormStatus state={startFeedback.state} />
        {typeof request === "string" && source && <p className="text-xs break-words text-destructive">{request}</p>}
      </div>
      <PanelActions target={actionsTarget}>
        <Button variant="ghost" onClick={onClose} disabled={starting}>
          Annuler
        </Button>
        <Button onClick={() => void start()} loading={starting} disabled={typeof request === "string"} className="gap-2">
          {kind === "subtitle" ? <Captions className="h-4 w-4" /> : <Scissors className="h-4 w-4" />}
          {kind === "subtitle" ? "Sous-titrer" : "Trouver les moments forts"}
        </Button>
      </PanelActions>
    </>
  );
}
