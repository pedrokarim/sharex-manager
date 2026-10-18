"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AudioLines, Captions, Clapperboard, FileVideo, Move, Music, Ruler, Upload, X, type LucideIcon } from "lucide-react";
import { ActionStatus, FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { ThinkingStatus } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { DropZone } from "@/components/ui/drop-zone";
import { Progress } from "@/components/ui/progress";
import { SHORT_SAFE_ZONE } from "@/modules/clip-studio/engine/brand";
import { MIN_APPLIED_CONFIDENCE, measuredPlan, type MeasuredPart, type MeasuredStyle } from "@/modules/clip-studio/engine/measured-style";
import { readPace } from "@/modules/clip-studio/engine/rhythm";
import { uploadFile } from "@/modules/clip-studio/lib/client";
import { cn } from "@/lib/utils";
import { MODULE_NAME, api, type StyleJob } from "../../lib/client";
import { FieldGroup, SectionHeading } from "../fields";
import type { FileSectionProps } from "./types";

/** Vidéos acceptées : le serveur vérifie de toute façon le type réel. */
const ACCEPT = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm";
const isVideo = (file: File) => /^video\/(mp4|quicktime|webm)$/.test(file.type) || /\.(mp4|mov|webm)$/i.test(file.name);
const MAX_BYTES = 200 * 1024 * 1024;

const number = (value: number, digits = 1) => value.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: digits });
const seconds = (value: number) => `${number(value)} s`;
const percent = (value: number) => `${Math.round(value * 100)} %`;
const date = (value: number) => new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

const PHASES: Record<StyleJob["phase"], string> = {
  video: "Lecture des images",
  audio: "Écoute des bruitages",
  compute: "Calcul du relevé",
};

/**
 * Style mesuré sur une vidéo de référence (dossier 07 sexies, D4) : dépôt de
 * la vidéo, analyse suivie pas à pas, relevé structuré, puis « Appliquer à la
 * marque ». La vidéo est effacée par le serveur dès la fin de l'analyse.
 */
export function ReferenceStyleSection({ kit, update, runOperation }: FileSectionProps) {
  const [job, setJob] = useState<StyleJob | null>(null);
  const [upload, setUpload] = useState<{ name: string; ratio: number } | null>(null);
  const [applying, setApplying] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const intake = useFeedback();
  const applied = useFeedback();
  const input = useRef<HTMLInputElement>(null);
  const kitId = kit.id;

  // Un travail en cours ou un relevé pas encore appliqué, retrouvé à l'ouverture de la section.
  useEffect(() => {
    let cancelled = false;
    api
      .listStyleJobs(kitId)
      .then((jobs) => {
        if (!cancelled) setJob(jobs[0] ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [kitId]);

  // Suivi de l'analyse tant qu'elle tourne.
  const running = job?.status === "running";
  const jobId = job?.id;
  useEffect(() => {
    if (!running || !jobId) return;
    const timer = window.setInterval(() => {
      api
        .getStyleJob(jobId)
        .then((next) => {
          if (next) setJob(next);
        })
        .catch(() => undefined);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [running, jobId]);

  const start = useCallback(
    async (file: File) => {
      intake.clear();
      applied.clear();
      if (!isVideo(file)) return intake.error("Choisissez une vidéo MP4, MOV ou WebM.");
      if (file.size > MAX_BYTES) return intake.error("Vidéo trop lourde : 200 Mo au plus.");
      setUpload({ name: file.name, ratio: 0 });
      try {
        const sent = await uploadFile(file, file.name, (ratio) => setUpload({ name: file.name, ratio }), MODULE_NAME);
        if (sent.kind !== "video") throw new Error("Ce fichier n’est pas une vidéo.");
        setJob(await api.startStyleAnalysis(kitId, { file: sent.file, name: file.name }));
      } catch (error) {
        intake.error(errorMessage(error, "La vidéo n’a pas pu être envoyée. Réessayez."));
      } finally {
        setUpload(null);
      }
    },
    [kitId, intake, applied]
  );

  const cancel = async () => {
    if (!job) return;
    setCanceling(true);
    try {
      await api.cancelStyleAnalysis(job.id);
      const next = await api.getStyleJob(job.id);
      if (next) setJob(next);
    } catch (error) {
      intake.error(errorMessage(error, "L’analyse n’a pas pu être arrêtée."));
    } finally {
      setCanceling(false);
    }
  };

  const apply = async () => {
    if (!job) return;
    setApplying(true);
    applied.clear();
    try {
      await runOperation(() => api.applyStyleAnalysis(kitId, job.id));
      setJob(null);
      applied.success("Appliqué : les prochains clips de la marque suivent ce style.");
    } catch (error) {
      applied.error(errorMessage(error, "Le relevé n’a pas pu être appliqué. Réessayez."));
    } finally {
      setApplying(false);
    }
  };

  const remove = () => {
    applied.clear();
    update((draft) => {
      const { measuredStyle: _style, ...rest } = draft;
      return { ...rest, pace: readPace(draft.pace) === "measured" ? "normal" : draft.pace };
    });
    applied.info("Style retiré : la marque revient au rythme normal.");
  };

  const fresh = job?.status === "done" && job.style ? job.style : null;
  const shown = fresh ?? kit.measuredStyle ?? null;
  const busy = Boolean(upload) || running;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Style de référence"
        text="Déposez un short dont le montage vous plaît : le serveur relève la durée de ses plans, ses zooms, la place et la taille de ses sous-titres et ses bruitages. Les clips de la marque peuvent ensuite suivre ce style, sans jamais sortir des règles de lisibilité."
      />

      <FieldGroup title="Vidéo de référence" text="MP4, MOV ou WebM, 3 minutes et 200 Mo au plus. Seul le relevé est gardé : la vidéo est effacée après l’analyse.">
        <DropZone onFiles={(files) => void start(files[0])} accept={isVideo} disabled={busy} label="Déposer pour analyser cette vidéo" className="rounded-lg">
          <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-dashed px-4 py-3">
            <FileVideo aria-hidden className="size-5 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">Glissez une vidéo ici, ou choisissez-la sur l’ordinateur.</p>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void start(file);
              }}
            />
            <Button size="sm" variant="outline" className="gap-2" onClick={() => input.current?.click()} disabled={busy}>
              <Upload className="size-4" />
              Choisir une vidéo
            </Button>
          </div>
        </DropZone>
        <FormStatus state={intake.state} />

        <AnimatePresence initial={false}>
          {(upload || running) && (
            <motion.div key="progress" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="grid gap-2 rounded-lg border px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <ThinkingStatus
                    className="min-w-0 flex-1"
                    messages={upload ? `Envoi de la vidéo : ${percent(upload.ratio)}` : `${PHASES[job!.phase]}${job!.phase === "video" ? ` : ${percent(job!.progress)}` : ""}`}
                  />
                  {running && (
                    <Button size="sm" variant="ghost" className="shrink-0 gap-1.5" onClick={() => void cancel()} loading={canceling}>
                      <X className="size-4" />
                      Annuler
                    </Button>
                  )}
                </div>
                <Progress value={Math.round((upload ? upload.ratio : job!.phase === "video" ? job!.progress * 0.85 : job!.phase === "audio" ? 0.9 : 0.97) * 100)} aria-label="Avancement" />
                <p className="truncate text-xs text-muted-foreground" title={upload?.name ?? job?.referenceName}>
                  {upload?.name ?? job?.referenceName}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {job && (job.status === "error" || job.status === "canceled") && (
          <p role="status" className={cn("text-xs", job.status === "error" ? "text-destructive" : "text-muted-foreground")}>
            {job.status === "error" ? job.error ?? "L’analyse a échoué." : "Analyse annulée."}
          </p>
        )}
      </FieldGroup>

      {shown && (
        <FieldGroup title={fresh ? "Relevé de la vidéo" : "Style appliqué à la marque"}>
          <StylePanel style={shown} />
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {fresh ? (
              <Button size="sm" className="gap-2" onClick={() => void apply()} loading={applying}>
                <Ruler className="size-4" />
                Appliquer à la marque
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="gap-2" onClick={remove}>
                <X className="size-4" />
                Retirer ce style
              </Button>
            )}
            <ActionStatus state={applied.state} className="min-w-0" />
          </div>
          {!fresh && readPace(kit.pace) !== "measured" && (
            <p className="text-xs text-muted-foreground">Le rythme du montage n’est pas « D’après la vidéo de référence » : ce style attend, sans s’appliquer (section « Vidéo »).</p>
          )}
        </FieldGroup>
      )}
    </div>
  );
}

// ─── Relevé ──────────────────────────────────────────────────────

const PART_LABELS: Record<MeasuredPart, { label: string; icon: LucideIcon }> = {
  shots: { label: "Plans", icon: Clapperboard },
  motion: { label: "Mouvements", icon: Move },
  captions: { label: "Sous-titres", icon: Captions },
  beats: { label: "Bruitages", icon: AudioLines },
  music: { label: "Musique", icon: Music },
};

/** Fiabilité d'une mesure, et si elle s'applique. */
function Reliability({ confidence }: { confidence: number }) {
  const used = confidence >= MIN_APPLIED_CONFIDENCE;
  return (
    <span className={cn("text-[11px] whitespace-nowrap tabular-nums", used ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400")}>
      {used ? `fiabilité ${percent(confidence)}` : `trop incertain (${percent(confidence)}), non appliqué`}
    </span>
  );
}

/**
 * Le relevé dans un panneau d'outil : une ligne par mesure, son dessin
 * (histogramme des plans, répartition des mouvements, silhouette d'écran),
 * ses valeurs alignées, sa fiabilité ; ce qui n'a pas pu être mesuré le dit.
 * En bas, ce que les clips reprendront réellement, une fois les règles
 * appliquées.
 */
export function StylePanel({ style }: { style: MeasuredStyle }) {
  const plan = measuredPlan(style, { width: 1080, height: 1920 }, SHORT_SAFE_ZONE);
  const { reference } = style;
  const rows: { part: MeasuredPart; body: React.ReactNode; confidence?: number }[] = [];
  if (style.shots) {
    const shots = style.shots;
    rows.push({
      part: "shots",
      confidence: shots.confidence,
      body: (
        <div className="flex min-w-0 flex-wrap items-end gap-x-4 gap-y-2">
          <ShotHistogram histogram={shots.histogram} />
          <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-muted-foreground">Médiane</dt>
            <dd className="tabular-nums">{seconds(shots.median)}</dd>
            <dt className="text-muted-foreground">La moitié</dt>
            <dd className="tabular-nums">
              de {seconds(shots.q1)} à {seconds(shots.q3)}
            </dd>
            <dt className="text-muted-foreground">Plus long</dt>
            <dd className="tabular-nums">{seconds(shots.longest)}</dd>
            <dt className="text-muted-foreground">Plans</dt>
            <dd className="tabular-nums">{shots.count}</dd>
          </dl>
        </div>
      ),
    });
  }
  if (style.motion) {
    const motion = style.motion;
    const still = Math.max(0, 1 - motion.zoomShare - motion.panShare);
    rows.push({
      part: "motion",
      confidence: motion.confidence,
      body: (
        <div className="grid min-w-0 gap-2">
          <div className="flex h-2.5 w-full max-w-72 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className="h-full bg-primary" style={{ width: `${motion.zoomShare * 100}%` }} />
            <span className="h-full bg-primary/50" style={{ width: `${motion.panShare * 100}%` }} />
          </div>
          <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full bg-primary" aria-hidden />
              Zooms
            </dt>
            <dd className="tabular-nums">
              {percent(motion.zoomShare)}
              {motion.typicalZoom ? `, ×${number(motion.typicalZoom, 2)} en moyenne` : ""}
            </dd>
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full bg-primary/50" aria-hidden />
              Panoramiques
            </dt>
            <dd className="tabular-nums">{percent(motion.panShare)}</dd>
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full bg-muted-foreground/30" aria-hidden />
              Plans fixes
            </dt>
            <dd className="tabular-nums">{percent(still)}</dd>
          </dl>
        </div>
      ),
    });
  }
  if (style.captions) {
    const captions = style.captions;
    rows.push({
      part: "captions",
      confidence: captions.confidence,
      body: (
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <ScreenSilhouette top={captions.top} bottom={captions.bottom} applied={plan?.caption?.y} />
          <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-muted-foreground">Centre</dt>
            <dd className="tabular-nums">à {percent(captions.center)} de la hauteur</dd>
            <dt className="text-muted-foreground">Ligne</dt>
            <dd className="tabular-nums">{number(captions.lineHeight * 100, 1)}&nbsp;% de la hauteur</dd>
            <dt className="text-muted-foreground">Mots</dt>
            <dd className="tabular-nums">{captions.words ? `${number(captions.words, 0)} à l’écran` : "non comptés (fond trop chargé)"}</dd>
            <dt className="text-muted-foreground">Présence</dt>
            <dd className="tabular-nums">{percent(captions.presence)} des images</dd>
          </dl>
        </div>
      ),
    });
  }
  if (style.beats) {
    const beats = style.beats;
    rows.push({
      part: "beats",
      confidence: beats.confidence,
      body: (
        <p className="text-xs tabular-nums">
          {number(beats.perMinute)} par minute{" "}
          <span className="text-muted-foreground">
            ({beats.count} en {seconds(reference.durationSeconds)})
          </span>
        </p>
      ),
    });
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 border-b bg-muted/40 px-3 py-2">
        <FileVideo aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 basis-32 truncate text-sm font-medium" title={reference.name}>
          {reference.name}
        </span>
        <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          {seconds(reference.durationSeconds)} · {reference.width}×{reference.height} · {date(reference.analyzedAt)}
        </span>
      </div>
      <div className="divide-y">
        {rows.map((row) => (
          <PanelRow key={row.part} part={row.part} trailing={row.confidence !== undefined ? <Reliability confidence={row.confidence} /> : null}>
            {row.body}
          </PanelRow>
        ))}
        {(Object.keys(PART_LABELS) as MeasuredPart[])
          .filter((part) => !rows.some((row) => row.part === part) && style.missing?.[part])
          .map((part) => (
            <PanelRow key={part} part={part} muted>
              <p className="text-xs text-muted-foreground">Non mesuré. {style.missing![part]}</p>
            </PanelRow>
          ))}
      </div>
      <div className="border-t bg-muted/20 px-3 py-2.5">
        <p className="text-xs font-medium">Ce que les clips reprendront</p>
        {plan ? (
          <ul className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
            {plan.shots && (
              <li>
                Plans de {seconds(plan.shots.target)}, jamais plus de {seconds(plan.shots.upper)} (au plus 2,5&nbsp;s sans changement).
              </li>
            )}
            {plan.motion && <li>{percent(plan.motion.animatedShare)} des plans animés, avec les zooms du moteur (×1,15 ou ×1,3).</li>}
            {plan.caption && (
              <li>
                Sous-titres à {percent(plan.caption.y)} de la hauteur (dans la zone visible d’un short), police de {number(plan.caption.size * 100, 1)}&nbsp;%, {plan.caption.groupSize}{" "}
                {plan.caption.groupSize > 1 ? "mots" : "mot"} à la fois ; contour et contraste restent ceux de la marque.
              </li>
            )}
            {plan.beats && <li>Environ {number(plan.beats.perMinute)} bruitages par minute, seulement sur les temps forts et les coupes.</li>}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Aucune mesure assez sûre : les clips garderaient le rythme normal.</p>
        )}
      </div>
    </div>
  );
}

function PanelRow({ part, trailing, muted = false, children }: { part: MeasuredPart; trailing?: React.ReactNode; muted?: boolean; children: React.ReactNode }) {
  const { label, icon: Icon } = PART_LABELS[part];
  return (
    <div className="grid min-w-0 gap-2 px-3 py-2.5 @md/form:grid-cols-[8.5rem_minmax(0,1fr)]">
      <div className="flex min-w-0 items-center gap-2 @md/form:items-start">
        <Icon aria-hidden className={cn("size-4 shrink-0", muted ? "text-muted-foreground/60" : "text-muted-foreground")} />
        <span className={cn("text-sm", muted && "text-muted-foreground")}>{label}</span>
      </div>
      <div className="grid min-w-0 gap-1">
        {children}
        {trailing}
      </div>
    </div>
  );
}

/** Durée des plans : une barre par tranche de 0,5 s, de 0 à 4 s et plus. */
function ShotHistogram({ histogram }: { histogram: number[] }) {
  const max = Math.max(1, ...histogram);
  return (
    <figure className="grid shrink-0 gap-1" aria-label="Durée des plans par tranche de 0,5 seconde">
      <div className="flex h-12 items-end gap-0.5">
        {histogram.map((count, index) => (
          <span
            key={index}
            title={`${index === histogram.length - 1 ? "4 s et plus" : `${number(index * 0.5)} à ${number(index * 0.5 + 0.5)} s`} : ${count} plan${count > 1 ? "s" : ""}`}
            className={cn("w-3 rounded-t-sm", count ? "bg-primary/70" : "bg-muted")}
            style={{ height: `${Math.max(6, (count / max) * 100)}%` }}
          />
        ))}
      </div>
      <figcaption className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>0</span>
        <span>2&nbsp;s</span>
        <span>4&nbsp;s+</span>
      </figcaption>
    </figure>
  );
}

/**
 * Silhouette d'un écran 9:16 : la zone visible d'un short en pointillés, la
 * bande des sous-titres de la référence, et le trait où le moteur les posera.
 */
function ScreenSilhouette({ top, bottom, applied }: { top: number; bottom: number; applied?: number }) {
  return (
    <div className="relative aspect-[9/16] w-16 shrink-0 overflow-hidden rounded-md border bg-muted/40" role="img" aria-label={`Sous-titres de ${percent(top)} à ${percent(bottom)} de la hauteur`}>
      <span
        aria-hidden
        className="absolute inset-x-1 rounded-sm border border-dashed border-muted-foreground/40"
        style={{ top: `${SHORT_SAFE_ZONE.top * 100}%`, bottom: `${(1 - SHORT_SAFE_ZONE.bottom) * 100}%` }}
      />
      <span aria-hidden className="absolute inset-x-1.5 rounded-sm bg-primary/70" style={{ top: `${top * 100}%`, height: `${Math.max(1.5, (bottom - top) * 100)}%` }} />
      {applied !== undefined && <span aria-hidden className="absolute inset-x-0 h-px bg-foreground/70" style={{ top: `${applied * 100}%` }} />}
    </div>
  );
}
