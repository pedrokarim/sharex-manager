"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Download, ExternalLink, Film, Link2, Plus, ShieldAlert, Unplug, X } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { ShimmerText } from "@/components/loading";
import { ActionStatus, FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { MediaSource } from "../engine/types";
import {
  assetToSource,
  cancelRemoteImport,
  listRemoteImports,
  probeRemoteVideo,
  startRemoteImport,
  type RemoteImportJob,
  type RemoteProbe,
} from "../lib/client";
import { formatClock, parseClock } from "../lib/clock";
import { MEDIA_DRAG_TYPE } from "./timeline";

/** Passage le plus long, comme le serveur (`REMOTE_LIMITS.maxSectionSeconds`). */
const MAX_SECTION = 20 * 60;

const PHASES: Record<RemoteImportJob["phase"], string> = {
  probe: "Lecture de l’adresse…",
  download: "Téléchargement du passage…",
  convert: "Mise au format pour le montage…",
  save: "Rangement dans Mes médias…",
};

/** Adresse lue et passage choisi, gardés entre deux ouvertures de l'onglet. */
let snapshot: { url: string; probe: RemoteProbe | null; range: [number, number] | null } | null = null;
/** Travaux écartés de la liste par « Fermer ». */
const dismissed = new Set<string>();
/** Travaux montrés : ceux en cours et ceux terminés depuis l'ouverture de l'éditeur. */
const openedAt = Date.now();

function initialRange(probe: RemoteProbe): [number, number] | null {
  if (!probe.duration) return null;
  const start = Math.min(Math.max(0, Math.floor(probe.startHint ?? 0)), Math.max(0, Math.floor(probe.duration) - 1));
  return [start, Math.min(probe.duration, start + MAX_SECTION)];
}

export function RemoteImportPanel({
  onAdd,
  onImported,
  addLabel,
}: {
  onAdd: (source: MediaSource) => void;
  onImported: () => void;
  /** Texte du bouton d'une vidéo récupérée ; « Ajouter au clip » par défaut. */
  addLabel?: string;
}) {
  const [url, setUrl] = useState(snapshot?.url ?? "");
  const [probe, setProbe] = useState<RemoteProbe | null>(snapshot?.probe ?? null);
  const [range, setRange] = useState<[number, number] | null>(snapshot?.range ?? null);
  /** Lien direct (durée inconnue) : début et fin saisis, fin facultative. */
  const [freeStart, setFreeStart] = useState("");
  const [freeEnd, setFreeEnd] = useState("");
  const [reading, setReading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [jobs, setJobs] = useState<RemoteImportJob[]>([]);
  const probeFeedback = useFeedback();
  const startFeedback = useFeedback();
  const known = useRef(new Map<string, RemoteImportJob["status"]>());
  /** Travail tout juste lancé : sa carte est amenée sous les yeux une fois dépliée. */
  const reveal = useRef<string | null>(null);

  useEffect(() => {
    snapshot = { url, probe, range };
  }, [url, probe, range]);

  const refresh = useCallback(async () => {
    const list = await listRemoteImports();
    let finished = false;
    for (const job of list) {
      const before = known.current.get(job.id);
      if (before === "running" && job.status === "done") finished = true;
      known.current.set(job.id, job.status);
    }
    if (finished) onImported();
    setJobs(list.filter((job) => !dismissed.has(job.id) && (job.status === "running" || (job.finishedAt ?? job.createdAt) >= openedAt)));
    return list;
  }, [onImported]);

  const running = jobs.some((job) => job.status === "running");
  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 1000);
    return () => window.clearInterval(timer);
  }, [running, refresh]);

  const read = async () => {
    const text = url.trim();
    probeFeedback.clear();
    startFeedback.clear();
    if (!text) {
      probeFeedback.error("Collez l’adresse d’une vidéo YouTube, Twitch, ou d’un fichier vidéo.");
      return;
    }
    setReading(true);
    try {
      const result = await probeRemoteVideo(text);
      setProbe(result);
      setRange(initialRange(result));
      setFreeStart(result.startHint ? formatClock(result.startHint) : "");
      setFreeEnd("");
    } catch (error) {
      setProbe(null);
      probeFeedback.error(errorMessage(error, "Cette adresse n’a pas pu être lue. Vérifiez-la, puis réessayez."));
    } finally {
      setReading(false);
    }
  };

  /** Passage à demander, ou le message qui dit pourquoi il est refusé. */
  const section = ((): { start?: number; end?: number } | string => {
    if (!probe) return "";
    if (range) {
      const [start, end] = range;
      if (end - start < 1) return "Le passage doit durer au moins une seconde.";
      if (end - start > MAX_SECTION) return "Le passage dépasse 20 minutes : choisissez-en un plus court.";
      return { start, end };
    }
    const start = freeStart.trim() ? parseClock(freeStart) : 0;
    const end = freeEnd.trim() ? parseClock(freeEnd) : undefined;
    if (start === null || end === null) return "Écrivez les instants comme 1:05 ou 1:02:03.";
    if (end !== undefined && end <= start) return "La fin doit venir après le début.";
    if (end !== undefined && end - start > MAX_SECTION) return "Le passage dépasse 20 minutes : choisissez-en un plus court.";
    return { start, ...(end !== undefined ? { end } : {}) };
  })();

  const start = async () => {
    if (!probe || typeof section === "string") return;
    startFeedback.clear();
    setStarting(true);
    try {
      const job = await startRemoteImport({ url: probe.url, ...section });
      known.current.set(job.id, job.status);
      reveal.current = job.id;
      setJobs((current) => [job, ...current.filter((entry) => entry.id !== job.id)]);
    } catch (error) {
      startFeedback.error(errorMessage(error, "La récupération n’a pas pu démarrer. Réessayez."));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-3 p-3">
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
              if (probeFeedback.state?.tone === "error") probeFeedback.clear();
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
        <Button type="submit" size="sm" className="h-8 shrink-0 px-2.5 text-xs" loading={reading}>
          Lire
        </Button>
      </form>
      <FormStatus state={probeFeedback.state} />

      {!probe && !reading && jobs.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-2 py-6 text-center text-xs text-muted-foreground">
          <Link2 className="h-6 w-6 opacity-40" />
          <span className="break-words">
            Une vidéo YouTube ou un short, un clip ou une VOD Twitch, ou un lien direct vers un fichier vidéo. Seul le passage
            choisi est récupéré, 20&nbsp;minutes au plus.
          </span>
        </div>
      )}

      {/* Récupérations au-dessus de la vidéo lue ; un travail lancé défile jusqu’à sa carte, pour que la progression se voie. */}
      <AnimatePresence initial={false}>
        {jobs.map((job) => (
          <motion.div
            key={job.id}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="min-w-0 overflow-hidden"
            id={`remote-job-${job.id}`}
            onAnimationComplete={() => {
              if (reveal.current !== job.id) return;
              reveal.current = null;
              document.getElementById(`remote-job-${job.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }}
          >
            <JobCard
              job={job}
              onAdd={onAdd}
              addLabel={addLabel}
              onDismiss={() => {
                dismissed.add(job.id);
                setJobs((current) => current.filter((entry) => entry.id !== job.id));
              }}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {probe && (
        <motion.section
          key={probe.url}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex min-w-0 flex-col gap-2.5 rounded-lg border p-2.5"
          aria-label="Vidéo lue"
        >
          <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
            {probe.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={probe.thumbnail} alt="" className="h-full w-full max-w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                <Film className="h-6 w-6 text-muted-foreground" />
              </span>
            )}
            {probe.duration ? (
              <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 py-px text-[10px] text-white tabular-nums">
                {formatClock(probe.duration)}
              </span>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <p className="line-clamp-2 min-w-0 text-xs font-medium break-words" title={probe.title}>
              {probe.title}
            </p>
            <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              {probe.site === "youtube" && <BrandLogo brand="youtube" className="size-3.5" />}
              {probe.site === "twitch" && <BrandLogo brand="twitch" className="size-3.5" />}
              {probe.site === "web" && <Unplug className="h-3.5 w-3.5 shrink-0" />}
              <span className="min-w-0 truncate" title={probe.author}>
                {probe.author ?? (probe.site === "youtube" ? "YouTube" : probe.site === "twitch" ? "Twitch" : "Lien direct")}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={probe.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Ouvrir la vidéo sur son site"
                    className="ml-auto inline-flex shrink-0 items-center rounded p-0.5 hover:bg-muted hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-64 break-all">
                  {probe.url}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {range && probe.duration ? (
            <RangePicker duration={probe.duration} range={range} onChange={setRange} />
          ) : (
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
                <label className="flex min-w-0 flex-col gap-1 text-[11px] text-muted-foreground">
                  Début
                  <Input value={freeStart} onChange={(event) => setFreeStart(event.target.value)} placeholder="0:00" className="h-7 text-xs tabular-nums" />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-[11px] text-muted-foreground">
                  Fin (facultative)
                  <Input value={freeEnd} onChange={(event) => setFreeEnd(event.target.value)} placeholder="fin" className="h-7 text-xs tabular-nums" />
                </label>
              </div>
              <p className="text-[11px] leading-snug break-words text-muted-foreground">
                Durée connue une fois le fichier reçu&nbsp;: sans fin, le passage court jusqu’à la fin de la vidéo, 20&nbsp;minutes au plus.
              </p>
            </div>
          )}

          <p className="flex min-w-0 items-start gap-1.5 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
            <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words">Droits à vérifier avant de publier&nbsp;: la mention de la source suit la vidéo.</span>
          </p>

          {typeof section === "string" && section && <p className="text-[11px] break-words text-destructive">{section}</p>}
          <FormStatus state={startFeedback.state} />
          <Button type="button" size="sm" className="h-8 text-xs" loading={starting} disabled={typeof section === "string"} onClick={() => void start()}>
            <Download className="h-3.5 w-3.5" />
            Récupérer
          </Button>
        </motion.section>
      )}

    </div>
  );
}

/**
 * Choix du passage : curseur à deux poignées et instants modifiables à la
 * main. `maxSeconds` : passage le plus long (20 minutes, deux heures pour une
 * vidéo à découper).
 */
export function RangePicker({
  duration,
  range,
  onChange,
  maxSeconds = MAX_SECTION,
}: {
  duration: number;
  range: [number, number];
  onChange: (range: [number, number]) => void;
  maxSeconds?: number;
}) {
  const [start, end] = range;
  const max = Math.max(1, Math.floor(duration));

  const change = ([nextStart, nextEnd]: number[]) => {
    // Un passage trop long tire l'autre poignée avec lui.
    if (nextEnd - nextStart > maxSeconds) {
      if (nextStart !== start) nextEnd = nextStart + maxSeconds;
      else nextStart = nextEnd - maxSeconds;
    }
    onChange([Math.max(0, nextStart), Math.min(duration, nextEnd)]);
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Slider
        value={[start, Math.min(end, max)]}
        min={0}
        max={max}
        step={1}
        minStepsBetweenThumbs={1}
        onValueChange={change}
        aria-label="Passage à récupérer"
        className="py-1"
      />
      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
        <ClockField label="Début" value={start} onCommit={(value) => change([Math.min(value, end - 1), end])} />
        <ClockField label="Fin" value={end} onCommit={(value) => change([start, Math.max(start + 1, Math.min(value, duration))])} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Passage&nbsp;: <span className="tabular-nums text-foreground">{formatClock(end - start)}</span>
        {end - start >= maxSeconds ? " (le plus long possible)" : ""}
      </p>
    </div>
  );
}

function ClockField({ label, value, onCommit }: { label: string; value: number; onCommit: (seconds: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    if (draft === null) return;
    const parsed = parseClock(draft);
    if (parsed === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft(null);
    onCommit(parsed);
  };
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] text-muted-foreground">
      {label}
      <Input
        value={draft ?? formatClock(value)}
        onChange={(event) => {
          setDraft(event.target.value);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        aria-invalid={invalid || undefined}
        className="h-7 text-xs tabular-nums"
      />
      {invalid && <span className="text-[10px] text-destructive">Par exemple 1:05</span>}
    </label>
  );
}

function JobCard({
  job,
  onAdd,
  onDismiss,
  addLabel = "Ajouter au clip",
}: {
  job: RemoteImportJob;
  onAdd: (source: MediaSource) => void;
  onDismiss: () => void;
  addLabel?: string;
}) {
  const cancelFeedback = useFeedback();
  const [canceling, setCanceling] = useState(false);
  const source = job.asset ? assetToSource(job.asset) : null;
  const percent = job.progress !== undefined ? Math.round(job.progress * 100) : null;
  const title = job.title ?? job.url;

  return (
    <div
      className={cn("flex min-w-0 flex-col gap-1.5 rounded-md border px-2.5 py-2", source && "cursor-grab active:cursor-grabbing")}
      draggable={Boolean(source)}
      onDragStart={(event) => {
        if (!source) return;
        event.dataTransfer.setData(MEDIA_DRAG_TYPE, JSON.stringify(source));
        event.dataTransfer.effectAllowed = "copy";
      }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {job.status === "done" && (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="h-2.5 w-2.5" />
          </span>
        )}
        <p className="min-w-0 flex-1 truncate text-xs font-medium" title={title}>
          {title}
        </p>
        {job.status === "running" ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label="Annuler la récupération"
                loading={canceling}
                onClick={async () => {
                  setCanceling(true);
                  cancelFeedback.clear();
                  try {
                    await cancelRemoteImport(job.id);
                  } catch (error) {
                    cancelFeedback.error(errorMessage(error, "L’annulation a échoué. Réessayez."));
                    setCanceling(false);
                  }
                }}
              >
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Annuler</TooltipContent>
          </Tooltip>
        ) : (
          <Button type="button" size="icon-xs" variant="ghost" aria-label="Retirer de la liste" onClick={onDismiss}>
            <X />
          </Button>
        )}
      </div>

      {job.status === "running" && (
        <>
          <div className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <ShimmerText className="min-w-0 truncate">{PHASES[job.phase]}</ShimmerText>
            {percent !== null && <span className="shrink-0 tabular-nums">{percent}&nbsp;%</span>}
          </div>
          <Progress value={percent ?? 0} className="h-1" />
          <ActionStatus state={cancelFeedback.state} className="text-[10px] empty:hidden" />
        </>
      )}

      {job.status === "done" && source && (
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 text-[11px] leading-tight break-words text-muted-foreground">
            Dans Mes médias{source.durationMs ? ` · ${formatClock(source.durationMs / 1000)}` : ""}
          </span>
          <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" onClick={() => onAdd(source)}>
            <Plus className="h-3.5 w-3.5" />
            {addLabel}
          </Button>
        </div>
      )}

      {(job.status === "error" || job.status === "canceled") && (
        <p className={cn("text-[11px] break-words", job.status === "error" ? "text-destructive" : "text-muted-foreground")}>
          {job.error ?? (job.status === "canceled" ? "Récupération annulée." : "La vidéo n’a pas pu être récupérée.")}
        </p>
      )}
    </div>
  );
}
