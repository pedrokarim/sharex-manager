"use client";

/**
 * Écran Exporter (dossier 01 ter, § 3.1) : `/m/clip-studio/export?project=<id>`.
 *
 * À gauche l'aperçu du clip, en lecture seule ; à droite le rendu, les
 * vérifications calculées dans le navigateur (polices, médias, droits,
 * limites des comptes liés à la marque), les réglages (volume, plage,
 * sous-titres) et les crédits. Le rendu est celui de l'ancienne fenêtre :
 * même appel à `exportProject`, sur le projet entier ou ramené à la plage.
 * Fini, l'écran passe à la fiche du nouvel export.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  AudioLines,
  CircleAlert,
  Check,
  CircleCheck,
  CircleDashed,
  Copy,
  CopyX,
  Film,
  ImageIcon,
  Info,
  Mic,
  Music,
  ShieldAlert,
  Sparkles,
  Subtitles,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FormStatus, useFeedback, type FeedbackState } from "@/components/feedback";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import {
  StepTimeline,
  StepTimelineContent,
  StepTimelineDescription,
  StepTimelineIndicator,
  StepTimelineItem,
  StepTimelineTitle,
  type StepState,
} from "@/components/ui/step-timeline";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ServiceLogo } from "@/components/connections/shared";
import { cn } from "@/lib/utils";
import type { BrandKit } from "@/modules/brand-kit/lib/types";
import { canExportInBrowser, exportProject, integratedLoudness, type ExportProgress } from "../engine/export";
import { formatTimecode, projectDuration } from "../engine/timeline";
import type { ClipProject } from "../engine/types";
import { callAnyModule, callModule, saveExport } from "../lib/client";
import { projectCreditList, unverifiedSources, type ProjectCredit } from "../lib/credits";
import {
  canRender,
  clampRange,
  creditsText,
  formatRemaining,
  isWholeRange,
  preRenderChecks,
  remainingSeconds,
  sliceProject,
  type CheckTone,
  type FrameRange,
  type LimitTarget,
  type MissingMedia,
  type PreRenderCheck,
} from "../lib/export-screens";
import { ensureProjectFonts } from "../lib/fonts";
import { projectToSrt, projectWords } from "../lib/subtitles";
import { ClipPlayer, type ClipPlayerHandle } from "../components/clip-player";
import type { PublishTargets } from "../components/publish-shared";
import { ScreenHeader } from "../components/screen-header";

export default function ExportPage() {
  const params = useSearchParams();
  const id = params.get("project");
  const [project, setProject] = useState<ClipProject | null | undefined>(undefined);

  useEffect(() => {
    if (!id) {
      setProject(null);
      return;
    }
    let alive = true;
    setProject(undefined);
    callModule<ClipProject | null>("getProject", id)
      .then((next) => alive && setProject(next))
      .catch(() => alive && setProject(null));
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <MotionConfig reducedMotion="user">
      {project === undefined ? (
        <ExportSkeleton />
      ) : project === null ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Film />
            </EmptyMedia>
            <EmptyTitle>{id ? "Projet introuvable" : "Aucun projet choisi"}</EmptyTitle>
            <EmptyDescription>{id ? "Il a peut-être été supprimé." : "Ouvrez un projet, puis « Exporter » dans l’éditeur."}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link href="/m/clip-studio">Retour aux projets</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ExportScreen key={project.id} project={project} />
      )}
    </MotionConfig>
  );
}

function ExportSkeleton() {
  return (
    <div className="flex min-h-full shrink-0 flex-col gap-6" aria-busy>
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-xl" />
        <div className="grid gap-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <Skeleton className="aspect-video w-full rounded-lg" />
        <div className="grid content-start gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}

// ─── Rendu ───────────────────────────────────────────────────────

type RenderStep = ExportProgress["phase"] | "upload";

const STEPS: { id: RenderStep; label: string }[] = [
  { id: "prepare", label: "Préparation des médias" },
  { id: "audio", label: "Mixage du son" },
  { id: "video", label: "Rendu des images" },
  { id: "finalize", label: "Finalisation du fichier" },
  { id: "upload", label: "Envoi sur le serveur" },
];

type Stage =
  | { kind: "ready" }
  | { kind: "running"; step: RenderStep; ratio: number; frame?: number; totalFrames?: number; stepStartedAt: number; startedAt: number }
  | { kind: "error"; message: string };

/** Médias du projet qui ne répondent plus. */
async function findMissingMedia(project: ClipProject): Promise<MissingMedia[]> {
  const sources = new Map<string, MissingMedia>();
  for (const track of project.tracks) {
    for (const item of track.items) {
      if ("source" in item && item.source.url) sources.set(item.source.url, { name: item.source.name || item.source.url, kind: item.source.kind });
    }
  }
  const results = await Promise.all(
    [...sources].map(async ([url, media]) => {
      try {
        let response = await fetch(url, { method: "HEAD", cache: "no-store" });
        // Une route qui ne connaît pas HEAD : on demande le premier octet.
        if (response.status === 405) response = await fetch(url, { headers: { Range: "bytes=0-0" }, cache: "no-store" });
        return response.ok ? null : media;
      } catch {
        return media;
      }
    })
  );
  return results.filter((media): media is MissingMedia => media !== null);
}

/** Volume intégré et crête du fichier rendu, lus dans sa piste son ; `undefined` sans son. */
async function measureLoudness(blob: Blob): Promise<{ lufs: number; peakDb: number } | undefined> {
  try {
    const context = new OfflineAudioContext(2, 1, 48_000);
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const lufs = integratedLoudness(buffer);
    let peak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < data.length; index++) peak = Math.max(peak, Math.abs(data[index]));
    }
    if (!Number.isFinite(lufs) || peak <= 0) return undefined;
    return { lufs, peakDb: 20 * Math.log10(peak) };
  } catch {
    return undefined;
  }
}

function ExportScreen({ project }: { project: ClipProject }) {
  const router = useRouter();
  const total = projectDuration(project);
  const playerRef = useRef<ClipPlayerHandle | null>(null);
  const [cursor, setCursor] = useState(0);

  // ─── Marque et comptes liés ────────────────────────────────────
  const [kit, setKit] = useState<BrandKit | null | undefined>(project.brandKitId ? undefined : null);
  const [targets, setTargets] = useState<PublishTargets | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    if (project.brandKitId) {
      void callAnyModule<{ kit: BrandKit } | null>("brand-kit", "getKit", project.brandKitId)
        .then((result) => alive && setKit(result?.kit ?? null))
        .catch(() => alive && setKit(null));
    }
    void callModule<PublishTargets>("listPublishTargets")
      .then((result) => alive && setTargets(result))
      .catch(() => alive && setTargets(null));
    return () => {
      alive = false;
    };
  }, [project.brandKitId]);

  // ─── Vérifications ─────────────────────────────────────────────
  const [missingFonts, setMissingFonts] = useState<string[] | null>(null);
  const [missingMedia, setMissingMedia] = useState<MissingMedia[] | null>(null);
  useEffect(() => {
    let alive = true;
    void ensureProjectFonts(project)
      .catch(() => [] as string[])
      .then((missing) => alive && setMissingFonts(missing));
    void findMissingMedia(project).then((missing) => alive && setMissingMedia(missing));
    return () => {
      alive = false;
    };
  }, [project]);

  // ─── Réglages ──────────────────────────────────────────────────
  const [normalize, setNormalize] = useState(true);
  const [rangeMode, setRangeMode] = useState<"all" | "range">("all");
  const [range, setRange] = useState<FrameRange>({ from: 0, to: total });
  const effectiveRange = rangeMode === "range" ? clampRange(range, total) : { from: 0, to: total };
  const partial = !isWholeRange(effectiveRange, total);
  const frameCount = effectiveRange.to - effectiveRange.from;
  const durationMs = (frameCount / project.fps) * 1000;
  const language = kit?.language || "fr";

  const wordCount = useMemo(() => projectWords(project).length, [project]);
  const subtitleSource = useMemo(() => (project.tracks.some((track) => track.items.some((item) => item.type === "text" && item.karaoke?.words?.length)) ? "captions" : "voice"), [project]);
  const [subtitles, setSubtitles] = useState(false);
  const srt = useMemo(
    () => (wordCount > 0 ? projectToSrt(project, partial ? { range: { fromMs: (effectiveRange.from / project.fps) * 1000, toMs: (effectiveRange.to / project.fps) * 1000 } } : {}) : ""),
    [project, wordCount, partial, effectiveRange.from, effectiveRange.to]
  );
  const cueCount = srt ? srt.trim().split(/\n{2,}/).length : 0;

  const credits = useMemo(() => projectCreditList(project, language), [project, language]);
  const unverified = useMemo(() => unverifiedSources(project), [project]);

  const linkedTargets: LimitTarget[] = useMemo(() => {
    const ids = kit?.publishing?.accountIds ?? [];
    if (!targets || ids.length === 0) return [];
    return targets.accounts
      .filter((account) => ids.includes(account.id))
      .map((account) => {
        const connector = targets.connectors.find((item) => item.id === account.connector);
        return {
          accountId: account.id,
          accountName: account.displayName,
          connectorLabel: connector?.label ?? account.connectorLabel,
          logo: connector?.logo ?? account.logo,
          limits: account.limits?.video ?? connector?.limits?.video,
          shortForm: connector?.shortForm,
        };
      });
  }, [kit, targets]);

  const checks = preRenderChecks({
    missingFonts,
    missingMedia,
    unverifiedImages: unverified,
    frame: { width: project.width, height: project.height, durationMs },
    targets: linkedTargets,
    brandName: kit?.name,
  });
  const linksPending = targets === undefined || kit === undefined;

  // ─── Rendu ─────────────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>({ kind: "ready" });
  const controller = useRef<AbortController | null>(null);
  // « Rendu annulé » se lit dans le panneau de rendu, à la place du suivi.
  const renderNotice = useFeedback();
  const { clear: clearRenderNotice, info: showRenderNotice } = renderNotice;
  const busy = stage.kind === "running";

  // Quitter l'onglet pendant le rendu demande confirmation : tout serait perdu.
  useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy]);

  const start = useCallback(async () => {
    clearRenderNotice();
    const unsupported = await canExportInBrowser();
    if (unsupported) {
      setStage({ kind: "error", message: unsupported });
      return;
    }
    playerRef.current?.pause();
    const run = new AbortController();
    controller.current = run;
    const startedAt = Date.now();
    let current: Stage & { kind: "running" } = { kind: "running", step: "prepare", ratio: 0, stepStartedAt: startedAt, startedAt };
    const advance = (step: RenderStep, ratio: number, extra: { frame?: number; totalFrames?: number } = {}) => {
      // Un rendu annulé finit sa préparation en silence : il ne repeint plus l'écran.
      if (run.signal.aborted) return;
      const now = Date.now();
      current = { ...current, ...extra, step, ratio, stepStartedAt: step === current.step ? current.stepStartedAt : now };
      setStage(current);
    };
    const stopIfCancelled = () => {
      if (run.signal.aborted) throw new DOMException("Export annulé", "AbortError");
    };
    setStage(current);
    try {
      // Polices du catalogue et de la marque : aucune image ne sort avec la police de repli sans le dire.
      const missing = await ensureProjectFonts(project);
      stopIfCancelled();
      if (missing.length) {
        // Le rendu dure : l'avertissement doit rester lisible même si l'on est ailleurs.
        toast.warning(missing.length > 1 ? `${missing.length} polices de la marque n’ont pas pu être chargées.` : "Une police de la marque n’a pas pu être chargée.", {
          description: "Le clip est exporté avec une police de repli.",
        });
      }
      const source = partial ? sliceProject(project, effectiveRange) : project;
      const { blob, durationMs: renderedMs } = await exportProject(source, {
        signal: run.signal,
        normalize,
        onProgress: (progress) => advance(progress.phase, progress.ratio, { frame: progress.frame, totalFrames: progress.totalFrames }),
      });
      stopIfCancelled();
      advance("upload", 0);
      // Volume relu dans le fichier rendu : la fiche de l'export montre ce qui a vraiment été produit.
      const loudness = await measureLoudness(blob);
      stopIfCancelled();
      const result = await saveExport(project, blob, renderedMs, (ratio) => advance("upload", ratio), {
        credits: credits.map((credit) => credit.text),
        ...(loudness ? { loudness } : {}),
        ...(subtitles && srt.trim() ? { subtitles: { srt, language } } : {}),
        ...(project.brandKitId ? { brandKitId: project.brandKitId } : {}),
        projectUpdatedAt: project.updatedAt,
      });
      // Fin d'un travail long, et l'écran change : le toast reste.
      toast.success("Clip rendu.", { description: "Voici sa fiche : couverture, textes et publication." });
      router.replace(`/m/clip-studio/exports?id=${encodeURIComponent(result.id)}`);
    } catch (error) {
      // Annulé : « Annuler » a déjà rendu la main et prévenu (voir `cancel`).
      if (run.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      setStage({ kind: "error", message: error instanceof Error ? error.message : "Export impossible" });
    } finally {
      if (controller.current === run) controller.current = null;
    }
  }, [project, partial, effectiveRange, normalize, credits, subtitles, srt, language, router, clearRenderNotice]);

  /**
   * Annuler rend la main tout de suite : la préparation des médias ne s'interrompt
   * pas en cours de route, mais son résultat est ignoré et rien n'est enregistré.
   */
  const cancel = useCallback(() => {
    const run = controller.current;
    if (!run) return;
    run.abort();
    controller.current = null;
    setStage({ kind: "ready" });
    showRenderNotice("Rendu annulé : rien n’a été enregistré.");
  }, [showRenderNotice]);

  const editorHref = `/m/clip-studio/edit?id=${encodeURIComponent(project.id)}`;
  const blocked = !canRender(checks);

  return (
    <div className="flex min-h-full shrink-0 flex-col gap-6">
      <ScreenHeader
        back={busy ? undefined : { href: editorHref, label: "Retour à l’éditeur" }}
        icon={Film}
        title={`Exporter « ${project.name} »`}
        fullTitle={project.name}
        description={
          <>
            MP4 {project.width} × {project.height}, {project.fps} i/s, {formatTimecode(frameCount, project.fps).split(".")[0]}
            {partial ? " (plage)" : ""}. Le rendu se fait dans ce navigateur&nbsp;: gardez l’onglet ouvert.
          </>
        }
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
        <section className="min-w-0 lg:sticky lg:top-0 lg:self-start" aria-label="Aperçu">
          <ClipPlayer project={project} range={effectiveRange} onFrame={setCursor} handleRef={playerRef} />
        </section>

        <div className="grid min-w-0 content-start gap-6">
          <RenderPanel stage={stage} notice={renderNotice.state} blocked={blocked} onStart={() => void start()} onCancel={cancel} frameCount={frameCount} fps={project.fps} />

          <Separator />

          <section className="grid min-w-0 gap-3" aria-labelledby="export-checks">
            <div className="flex min-w-0 items-baseline justify-between gap-2">
              <h2 id="export-checks" className="text-sm font-semibold">
                Vérifications
              </h2>
              {kit ? (
                <span className="min-w-0 truncate text-xs text-muted-foreground" title={kit.name}>
                  Comptes de la marque « {kit.name} »
                </span>
              ) : null}
            </div>
            <ul className="grid min-w-0 gap-2.5">
              <AnimatePresence initial={false}>
                {checks.map((check) => (
                  <motion.li key={check.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="min-w-0">
                    <CheckRow check={check} editorHref={editorHref} />
                  </motion.li>
                ))}
              </AnimatePresence>
              {linksPending ? (
                <li className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Spinner className="size-3.5" aria-hidden />
                  Lecture des comptes liés à la marque…
                </li>
              ) : !kit && project.brandKitId === undefined ? (
                <li className="text-xs text-pretty text-muted-foreground">Sans image de marque, aucun compte n’est lié au projet : les limites des services seront vérifiées à la publication.</li>
              ) : kit && linkedTargets.length === 0 ? (
                <li className="text-xs text-pretty text-muted-foreground">Aucun compte lié à la marque « {kit.name} » ne publie de vidéo : les limites seront vérifiées à la publication.</li>
              ) : null}
            </ul>
          </section>

          <Separator />

          <section className="grid min-w-0 gap-5" aria-labelledby="export-settings">
            <h2 id="export-settings" className="text-sm font-semibold">
              Réglages
            </h2>

            <div className="flex min-w-0 items-start justify-between gap-4">
              <div className="grid min-w-0 gap-0.5">
                <Label htmlFor="export-normalize">Volume normalisé</Label>
                <p className="text-xs text-pretty text-muted-foreground">
                  Niveau moyen ramené vers −14&nbsp;LUFS, crête à −1&nbsp;dB au plus&nbsp;: un seul gain pour tout le clip, sans écraser ses nuances.
                </p>
              </div>
              <Switch id="export-normalize" checked={normalize} onCheckedChange={setNormalize} disabled={busy} />
            </div>

            <div className="grid min-w-0 gap-2">
              <Label id="export-range-label">Plage à exporter</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                aria-labelledby="export-range-label"
                value={rangeMode}
                onValueChange={(value) => value && setRangeMode(value as "all" | "range")}
                disabled={busy}
                className="flex w-full"
              >
                <ToggleGroupItem value="all" className="min-w-0 flex-1">
                  Tout le clip
                </ToggleGroupItem>
                <ToggleGroupItem value="range" className="min-w-0 flex-1">
                  De l’entrée à la sortie
                </ToggleGroupItem>
              </ToggleGroup>
              <AnimatePresence initial={false}>
                {rangeMode === "range" ? (
                  <motion.div key="range" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="grid min-w-0 gap-3 overflow-hidden pt-1">
                    <Slider
                      value={[effectiveRange.from, effectiveRange.to]}
                      min={0}
                      max={total}
                      step={1}
                      minStepsBetweenThumbs={1}
                      disabled={busy}
                      onValueChange={([from, to]) => {
                        const next = clampRange({ from, to }, total);
                        playerRef.current?.seek(next.from !== effectiveRange.from ? next.from : Math.max(next.from, next.to - 1));
                        setRange(next);
                      }}
                      aria-label="Entrée et sortie"
                    />
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                      <span>
                        De {formatTimecode(effectiveRange.from, project.fps)} à {formatTimecode(effectiveRange.to, project.fps)}
                      </span>
                      <span>{(durationMs / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}&nbsp;s</span>
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={busy || cursor >= effectiveRange.to} onClick={() => setRange(clampRange({ from: cursor, to: effectiveRange.to }, total))}>
                        Entrée au curseur
                      </Button>
                      <Button type="button" variant="outline" size="sm" disabled={busy || cursor <= effectiveRange.from} onClick={() => setRange(clampRange({ from: effectiveRange.from, to: cursor + 1 }, total))}>
                        Sortie au curseur
                      </Button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="grid min-w-0 gap-2">
              <div className="flex min-w-0 items-start justify-between gap-4">
                <div className="grid min-w-0 gap-0.5">
                  <Label htmlFor="export-subtitles">Sous-titres en fichier .srt</Label>
                  <p className="text-xs text-pretty text-muted-foreground">
                    {wordCount === 0
                      ? "Le projet n’a ni sous-titres ni voix off minutée : rien à écrire."
                      : `${subtitleSource === "captions" ? "À partir des sous-titres du projet" : "À partir des mots de la voix off"}, rangé à côté de la vidéo : ${cueCount} ligne${cueCount > 1 ? "s" : ""}, en ${language}.`}
                  </p>
                </div>
                <Switch id="export-subtitles" checked={subtitles && wordCount > 0} onCheckedChange={setSubtitles} disabled={busy || wordCount === 0} />
              </div>
              {subtitles && cueCount > 0 ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="link" size="sm" className="h-auto justify-self-start gap-1.5 p-0 text-xs">
                      <Subtitles className="size-3.5" />
                      Voir les sous-titres
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] p-0">
                    <ScrollArea className="h-72">
                      <pre className="p-3 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">{srt}</pre>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
          </section>

          <Separator />

          <CreditsSection credits={credits} />
        </div>
      </div>
    </div>
  );
}

// ─── Panneau de rendu ────────────────────────────────────────────

function RenderPanel({
  stage,
  notice,
  blocked,
  onStart,
  onCancel,
  frameCount,
  fps,
}: {
  stage: Stage;
  /** Message du dernier geste sur le rendu (annulation). */
  notice: FeedbackState | null;
  blocked: boolean;
  onStart: () => void;
  onCancel: () => void;
  frameCount: number;
  fps: number;
}) {
  // Pendant le rendu, « commencé il y a… » avance chaque seconde, même quand une étape ne rend pas de progression.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (stage.kind !== "running") return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [stage.kind]);

  if (stage.kind !== "running") {
    return (
      <section className="grid min-w-0 gap-3" aria-label="Rendu">
        <FormStatus state={notice} />
        {stage.kind === "error" ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Le rendu a échoué</AlertTitle>
            <AlertDescription className="[overflow-wrap:anywhere]">{stage.message}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 basis-48 text-sm text-pretty text-muted-foreground">
            {blocked
              ? "Réglez d’abord les points bloquants ci-dessous."
              : `${frameCount.toLocaleString("fr-FR")} images à calculer, comme dans l’aperçu, puis encodées en H.264 avec le son mixé.`}
          </p>
          <Button onClick={onStart} disabled={blocked} className="shrink-0 gap-2">
            <Film className="size-4" />
            {stage.kind === "error" ? "Réessayer" : "Lancer le rendu"}
          </Button>
        </div>
      </section>
    );
  }

  const index = STEPS.findIndex((step) => step.id === stage.step);
  const elapsed = Date.now() - stage.stepStartedAt;
  const remaining = stage.step === "video" || stage.step === "upload" ? remainingSeconds(stage.ratio, elapsed) : null;
  return (
    <section className="grid min-w-0 gap-3" aria-label="Rendu en cours" aria-live="polite">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Rendu en cours</h2>
        {stage.step !== "upload" && stage.step !== "finalize" ? (
          <Button variant="outline" size="sm" onClick={onCancel}>
            Annuler
          </Button>
        ) : null}
      </div>
      <StepTimeline>
        {STEPS.map((step, position) => {
          const state: StepState = position < index ? "done" : position === index ? "running" : "pending";
          const showProgress = position === index && (step.id === "video" || step.id === "upload");
          return (
            <StepTimelineItem key={step.id} state={state}>
              <StepTimelineIndicator />
              <StepTimelineContent className="min-w-0">
                <StepTimelineTitle state={state} className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{step.label}</span>
                  {showProgress ? <span className="shrink-0 font-mono text-xs font-normal text-muted-foreground tabular-nums">{Math.round(stage.ratio * 100)} %</span> : null}
                </StepTimelineTitle>
                {showProgress ? <Progress value={stage.ratio * 100} className="h-1.5" aria-label={step.label} /> : null}
                {position === index && step.id === "video" && stage.totalFrames ? (
                  <StepTimelineDescription className="tabular-nums">
                    Image {(stage.frame ?? 0).toLocaleString("fr-FR")} sur {stage.totalFrames.toLocaleString("fr-FR")}
                    {remaining !== null ? ` · ${formatRemaining(remaining)} restantes` : ""}
                  </StepTimelineDescription>
                ) : null}
                {position === index && step.id === "upload" && remaining !== null ? <StepTimelineDescription>{formatRemaining(remaining)} restantes</StepTimelineDescription> : null}
              </StepTimelineContent>
            </StepTimelineItem>
          );
        })}
      </StepTimeline>
      <p className="text-xs text-muted-foreground tabular-nums">
        {formatTimecode(frameCount, fps).split(".")[0]} de clip · commencé il y a {Math.max(0, Math.round((Date.now() - stage.startedAt) / 1000))}&nbsp;s
      </p>
    </section>
  );
}

// ─── Lignes de vérification ──────────────────────────────────────

const TONE_ICON: Record<CheckTone, { icon: typeof CircleCheck; className: string; label: string }> = {
  ok: { icon: CircleCheck, className: "text-emerald-600 dark:text-emerald-400", label: "Bon" },
  pending: { icon: CircleDashed, className: "animate-pulse text-muted-foreground", label: "En cours" },
  info: { icon: Info, className: "text-sky-600 dark:text-sky-400", label: "À savoir" },
  warning: { icon: ShieldAlert, className: "text-amber-600 dark:text-amber-400", label: "À vérifier" },
  blocked: { icon: CircleAlert, className: "text-destructive", label: "Bloquant" },
};

function CheckRow({ check, editorHref }: { check: PreRenderCheck; editorHref: string }) {
  const { icon: Icon, className, label } = TONE_ICON[check.tone];
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon className={cn("mt-0.5 size-4 shrink-0", className)} aria-label={label} />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          {check.logo ? <ServiceLogo logo={check.logo} className="size-3.5" /> : null}
          <span className="min-w-0 [overflow-wrap:anywhere]">{check.title}</span>
        </p>
        {check.detail ? <p className="text-xs text-pretty text-muted-foreground [overflow-wrap:anywhere]">{check.detail}</p> : null}
        {check.fix ? (
          <p className={cn("text-xs text-pretty [overflow-wrap:anywhere]", check.tone === "blocked" ? "text-destructive" : "text-muted-foreground")}>
            {check.fix}
            {check.inEditor ? (
              <>
                {" "}
                <Link href={editorHref} className="inline-flex items-center gap-0.5 font-medium text-foreground underline underline-offset-2">
                  Ouvrir l’éditeur
                  <ArrowRight className="size-3" />
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ─── Crédits ─────────────────────────────────────────────────────

const CREDIT_ICON: Record<ProjectCredit["kind"], typeof Music> = {
  music: Music,
  voice: Mic,
  image: ImageIcon,
  video: Video,
  generated: Sparkles,
};

const CREDIT_LABEL: Record<ProjectCredit["kind"], string> = {
  music: "Musique",
  voice: "Voix",
  image: "Image",
  video: "Vidéo",
  generated: "Images générées",
};

function CreditsSection({ credits }: { credits: ProjectCredit[] }) {
  const text = creditsText(credits.map((credit) => credit.text));
  // Le bouton dit lui-même si la copie a réussi.
  const { hasCopied, copyFailed, copyToClipboard } = useCopyToClipboard();
  return (
    <section className="grid min-w-0 gap-3" aria-labelledby="export-credits">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h2 id="export-credits" className="text-sm font-semibold">
          Crédits
        </h2>
        {credits.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => void copyToClipboard(text)}
            aria-live="polite"
          >
            {hasCopied ? (
              <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : copyFailed ? (
              <CopyX className="size-3.5 text-destructive" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {hasCopied ? "Copié" : copyFailed ? "Copie impossible" : "Copier"}
          </Button>
        ) : null}
      </div>
      {credits.length === 0 ? (
        <p className="text-xs text-pretty text-muted-foreground">Aucune mention à reprendre : le projet n’utilise que vos médias.</p>
      ) : (
        <>
          <ul className="grid min-w-0 gap-1.5">
            {credits.map((credit) => {
              const Icon = CREDIT_ICON[credit.kind];
              return (
                <li key={credit.text} className="flex min-w-0 items-start gap-2 text-xs">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Icon className="mt-px size-3.5 shrink-0 text-muted-foreground" aria-label={CREDIT_LABEL[credit.kind]} />
                    </TooltipTrigger>
                    <TooltipContent>{CREDIT_LABEL[credit.kind]}</TooltipContent>
                  </Tooltip>
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {credit.text}
                    {credit.unverified ? <span className="text-amber-700 dark:text-amber-400"> · droits à vérifier</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="flex items-start gap-1.5 text-xs text-pretty text-muted-foreground">
            <AudioLines className="mt-px size-3.5 shrink-0" aria-hidden />
            Ils sont figés avec l’export et repris dans la description à la publication.
          </p>
        </>
      )}
    </section>
  );
}
