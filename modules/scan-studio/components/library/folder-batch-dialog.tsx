"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { AnalyzePages } from "../../lib/analysis/contract";
import { api, uploadImage } from "../../lib/client";
import {
  analyzeRunner,
  estimateFolderTranslation,
  renderRunner,
  runBatch,
  translateRunner,
  type BatchProgress,
  type BatchResult,
  type BatchRunner,
  type FolderEstimate,
} from "../../lib/folder-batch";
import { planChapterArchive } from "../../lib/library-archive";
import { describeChapterExport, exportChapterPages, renderPageExport } from "../../lib/page-export";
import { ENGINES_PATH, chapterLabel, charactersLabel, countLabel, errorMessage, formatNumber } from "../../lib/library-helpers";
import { translateChapter } from "../../lib/translate-pages";
import type { ChapterSettings, ChapterSummary } from "../../lib/types";
import { buildChapterArchive, saveBlob } from "./archive-export";
import { EngineName } from "./engine-logo";
import { PageTaskList, type PageTask } from "./page-task-list";

export type FolderBatchAction = "analyze" | "translate" | "render" | "archive";

interface FolderBatchDialogProps {
  /** L'action à lancer ; `null` : la fenêtre est fermée. */
  action: FolderBatchAction | null;
  onClose: () => void;
  /** Chapitres du dossier, dans l'ordre d'affichage. */
  chapters: ChapterSummary[];
  /** L'analyse du module (`lib/analysis`), passée par la page. */
  analyze: AnalyzePages;
  /** Pourquoi un chapitre ne peut pas être analysé automatiquement ; `null` s'il le peut. */
  analysisBlocker: (settings: ChapterSettings) => string | null;
  /** Des chapitres ont changé : la liste doit se rafraîchir. */
  onChanged: () => void;
}

type Phase = "confirm" | "running" | "done";

const TITLES: Record<FolderBatchAction, string> = {
  analyze: "Analyser le dossier",
  translate: "Traduire le dossier",
  render: "Rendre les pages du dossier",
  archive: "Exporter le dossier en .cbz",
};

const RUN_LABELS: Record<FolderBatchAction, string> = { analyze: "Analyser", translate: "Traduire", render: "Rendre", archive: "Exporter" };

/** Export d'un chapitre du lot : une archive `.cbz`, proposée au téléchargement dès qu'elle est prête. */
const archiveRunner: BatchRunner = async (chapter, { signal, report }) => {
  const view = await api.getChapter(chapter.id);
  if (planChapterArchive(view.pages).pages.length === 0) return { state: "skipped", detail: "Aucune page exportée" };
  const archive = await buildChapterArchive(view, { signal, onPage: (done, total) => report(`Page ${done} sur ${total}`, done / total) });
  saveBlob(archive.blob, archive.fileName);
  const missing = archive.plan.missing > 0 ? `, ${countLabel(archive.plan.missing, "page pas encore exportée", "pages pas encore exportées")}` : "";
  return { state: "done", detail: `${countLabel(archive.plan.pages.length, "page", "pages")}${missing}` };
};

/**
 * Lot sur un dossier : la même action, chapitre après chapitre, dans une file
 * visible qu'on arrête quand on veut. Rien ne part avant le bouton de cette
 * fenêtre ; pour une traduction, elle montre d'abord ce que le dossier entier
 * représente.
 */
export function FolderBatchDialog({ action, onClose, chapters, analyze, analysisBlocker, onChanged }: FolderBatchDialogProps) {
  const open = action !== null;
  // L'action reste affichée pendant la fermeture de la fenêtre.
  const [shown, setShown] = useState<FolderBatchAction>("analyze");
  const [phase, setPhase] = useState<Phase>("confirm");
  const [option, setOption] = useState(false);
  const [estimate, setEstimate] = useState<FolderEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [tasks, setTasks] = useState<PageTask[]>([]);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [stopping, setStopping] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const runLock = useRef(false);

  // Un chapitre sans page n'a rien à traiter : il n'entre pas dans la file.
  const queue = useMemo(() => chapters.filter((chapter) => chapter.pageCount > 0), [chapters]);
  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    if (action === null) return;
    setShown(action);
    setPhase("confirm");
    setOption(false);
    setEstimate(null);
    setTasks([]);
    setResult(null);
    setStopping(false);
  }, [action]);

  // Estimation d'une traduction : les pages sont lues sur ce serveur, qui dit
  // ce que le dossier entier coûterait. Aucun moteur n'est appelé ici.
  useEffect(() => {
    if (action !== "translate" || phase !== "confirm") return;
    const abort = new AbortController();
    setEstimating(true);
    void (async () => {
      try {
        const next = await estimateFolderTranslation(
          queueRef.current.map((chapter) => chapter.id),
          { getChapter: api.getChapter, getPage: api.getPage, estimateTranslation: api.estimateTranslation },
          { retranslate: option, signal: abort.signal }
        );
        if (!abort.signal.aborted) setEstimate(next);
      } catch (error) {
        if (abort.signal.aborted) return;
        setEstimate(null);
        toast.error(errorMessage(error, "Estimation impossible."));
      } finally {
        if (!abort.signal.aborted) setEstimating(false);
      }
    })();
    return () => abort.abort();
  }, [action, phase, option]);

  // La fenêtre disparaît avec la page : le lot s'arrête après ce qui est en cours.
  useEffect(() => () => controller.current?.abort(), []);

  const onProgress = useCallback((progress: BatchProgress) => {
    setTasks((previous) =>
      previous.map((task) => (task.id === progress.chapterId ? { ...task, state: progress.state, detail: progress.detail, progress: progress.progress } : task))
    );
  }, []);

  const run = async () => {
    if (action === null || queue.length === 0 || runLock.current) return;
    runLock.current = true;
    const runner =
      action === "analyze"
        ? analyzeRunner({ getChapter: api.getChapter, analyze, blocker: analysisBlocker }, { replace: option })
        : action === "translate"
          ? translateRunner({ getChapter: api.getChapter, translateChapter }, { retranslate: option })
          : action === "render"
            ? renderRunner({
                getChapter: api.getChapter,
                exportPages: (pageIds, options) =>
                  exportChapterPages(pageIds, { getPage: api.getPage, render: renderPageExport, upload: uploadImage, register: api.registerExport }, options),
                describe: describeChapterExport,
              })
            : archiveRunner;
    const batch = queue.map((chapter) => ({ id: chapter.id, label: chapterLabel(chapter) }));
    controller.current = new AbortController();
    setTasks(batch.map((chapter) => ({ id: chapter.id, label: chapter.label, state: "waiting" })));
    setStopping(false);
    setPhase("running");
    try {
      setResult(await runBatch(batch, runner, { signal: controller.current.signal, onProgress }));
    } catch (error) {
      toast.error(errorMessage(error, "Le lot s’est interrompu."));
    } finally {
      controller.current = null;
      runLock.current = false;
      setPhase("done");
      if (action !== "archive") onChanged();
    }
  };

  const stop = () => {
    controller.current?.abort();
    setStopping(true);
  };

  const settled = tasks.filter((task) => task.state === "done" || task.state === "skipped" || task.state === "error").length;
  const nothingToTranslate = estimate !== null && estimate.regions === 0;
  const noEngine = estimate !== null && estimate.toSend > 0 && !estimate.engine;
  const blocked = queue.length === 0 || (shown === "translate" && (estimating || estimate === null || nothingToTranslate || noEngine));
  const exportable = queue.filter((chapter) => chapter.progress.exported > 0).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Un lot en cours ne se ferme pas par mégarde : on l'arrête d'abord.
        if (!next && phase !== "running") onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl" showCloseButton={phase !== "running"}>
        <DialogHeader>
          <DialogTitle>{TITLES[shown]}</DialogTitle>
          <DialogDescription>
            {phase === "confirm"
              ? `${countLabel(queue.length, "chapitre", "chapitres")} dans la file, traités l’un après l’autre. Rien ne part tant que vous n’avez pas confirmé.`
              : phase === "running"
                ? "Un chapitre à la fois. Gardez cet onglet ouvert ; l’arrêt laisse finir ce qui est en cours."
                : "Ce qui a été fait reste fait ; ce qui attendait se relance d’ici."}
          </DialogDescription>
        </DialogHeader>

        {phase === "confirm" && queue.length === 0 && <p className="text-sm text-muted-foreground">Aucun chapitre de ce dossier n’a de page.</p>}

        {phase === "confirm" && queue.length > 0 && shown === "analyze" && (
          <div className="grid gap-4">
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                L’analyse tourne dans ce navigateur, avec des moteurs locaux : rien ne part chez un service extérieur. Les chapitres dont la langue
                ou le niveau ne permettent pas l’analyse automatique sont passés.
              </span>
            </p>
            <div className="flex items-start justify-between gap-4">
              <Label htmlFor="scan-studio-batch-option" className="flex flex-col items-start gap-0.5 font-normal">
                <span className="font-medium">Remplacer les zones déjà présentes</span>
                <span className="text-xs leading-snug text-muted-foreground">Une zone corrigée à la main n’est jamais écrasée.</span>
              </Label>
              <Switch id="scan-studio-batch-option" checked={option} onCheckedChange={setOption} />
            </div>
          </div>
        )}

        {phase === "confirm" && queue.length > 0 && shown === "translate" && (
          <div className="grid gap-4">
            {estimate === null ? (
              estimating ? (
                <div className="grid gap-2" aria-busy="true" aria-label="Estimation en cours">
                  <Skeleton className="h-4 w-64" />
                  <Skeleton className="h-4 w-full max-w-sm" />
                  <Skeleton className="h-4 w-full max-w-xs" />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">L’estimation n’a pas pu être faite. Fermez cette fenêtre et réessayez.</p>
              )
            ) : nothingToTranslate ? (
              <p className="text-sm">
                Aucune zone à traduire dans ce dossier.{" "}
                <span className="text-muted-foreground">
                  Les zones sans texte lu, les onomatopées, le texte du décor et les traductions corrigées ou validées ne partent jamais.
                </span>
              </p>
            ) : (
              <div className={estimating ? "grid gap-3 opacity-60 transition-opacity" : "grid gap-3 transition-opacity"} aria-busy={estimating}>
                <p className="text-sm tabular-nums">
                  {countLabel(estimate.regions, "zone", "zones")} sur {countLabel(estimate.pages, "page", "pages")}, dans{" "}
                  {countLabel(estimate.chapters, "chapitre", "chapitres")}
                </p>
                <p className="text-sm leading-6 tabular-nums">
                  <span className="font-medium">{charactersLabel(estimate.characters)}</span>, dont {formatNumber(estimate.known)} déjà connus (glossaire,
                  mémoire, cache) ;{" "}
                  {estimate.toSend === 0 ? (
                    "rien à envoyer à un moteur."
                  ) : estimate.engine ? (
                    <>
                      <span className="font-medium">{formatNumber(estimate.toSend)}</span> à envoyer à <EngineName engine={estimate.engine} />.
                    </>
                  ) : (
                    <>
                      <span className="font-medium">{formatNumber(estimate.toSend)}</span> à envoyer.
                    </>
                  )}
                </p>
                {noEngine ? (
                  <p className="flex items-start gap-2 text-sm text-destructive">
                    <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Aucun moteur de traduction n’est disponible pour l’instant.{" "}
                      <Link href={ENGINES_PATH} className="font-medium underline underline-offset-2">
                        Voir l’état des moteurs
                      </Link>
                    </span>
                  </p>
                ) : (
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Les pages partent une à une, une requête par page, avec les mêmes écarts et le même plafond que pour un chapitre. Si plus aucun
                      moteur ne répond, le lot s’arrête au lieu d’insister.
                    </span>
                  </p>
                )}
                {(estimate.blockedChapters > 0 || estimate.unreadable > 0) && (
                  <p className="text-sm text-muted-foreground">
                    {estimate.blockedChapters > 0 &&
                      `${countLabel(estimate.blockedChapters, "chapitre passé", "chapitres passés")} : leur niveau interdit la traduction automatique. `}
                    {estimate.unreadable > 0 && `${countLabel(estimate.unreadable, "page illisible", "pages illisibles")}, hors du lot.`}
                  </p>
                )}
              </div>
            )}
            <div className="flex items-start justify-between gap-4">
              <Label htmlFor="scan-studio-batch-option" className="flex flex-col items-start gap-0.5 font-normal">
                <span className="font-medium">Reprendre aussi les zones déjà proposées</span>
                <span className="text-xs leading-snug text-muted-foreground">Les traductions corrigées à la main ou validées ne sont jamais reprises.</span>
              </Label>
              <Switch id="scan-studio-batch-option" checked={option} onCheckedChange={setOption} disabled={estimating} />
            </div>
          </div>
        )}

        {phase === "confirm" && queue.length > 0 && shown === "render" && (
          <p className="text-sm leading-6 text-muted-foreground">
            Chaque page traduite est rendue comme le fait le bouton « Exporter » de l’atelier, et remplace son rendu précédent. Les pages sans zone,
            sans traduction ou « laissées telles quelles » ne sont pas touchées. Tout se passe dans cet onglet : rien ne part vers un service.
          </p>
        )}

        {phase === "confirm" && queue.length > 0 && shown === "archive" && (
          <p className="text-sm leading-6 text-muted-foreground">
            Une archive <span className="font-medium text-foreground">.cbz</span> par chapitre, proposée au téléchargement dès qu’elle est prête :{" "}
            {countLabel(exportable, "chapitre a", "chapitres ont")} des pages exportées. Chaque archive range les pages exportées dans l’ordre de lecture,
            et telles quelles les pages « laissées telles quelles ». Votre navigateur peut demander d’autoriser plusieurs téléchargements.
          </p>
        )}

        {phase !== "confirm" && (
          <div className="grid gap-3">
            {phase === "running" && (
              <div className="flex items-center gap-3">
                <p className="shrink-0 text-sm font-medium tabular-nums" aria-live="polite">
                  {stopping ? "Arrêt après le chapitre en cours…" : `${settled} sur ${tasks.length}`}
                </p>
                <Progress value={tasks.length === 0 ? 0 : Math.round((settled / tasks.length) * 100)} aria-label="Avancement du lot" className="h-1.5" />
              </div>
            )}
            {phase === "done" && result && (
              <div className="grid gap-1 text-sm" aria-live="polite">
                <p className="font-medium">
                  {result.stopped === "halted" ? "Lot interrompu" : result.stopped === "aborted" ? "Lot arrêté à votre demande" : "Lot terminé"}
                </p>
                <p className="tabular-nums text-muted-foreground">
                  {countLabel(result.chapters.filter((chapter) => chapter.state === "done").length, "chapitre traité", "chapitres traités")}
                  {result.remaining.length > 0 && `, ${countLabel(result.remaining.length, "chapitre non lancé", "chapitres non lancés")}`}.
                </p>
                {result.stopped === "halted" && (
                  <p className="text-destructive">{result.stopReason} Relancez le lot à la main quand un moteur répond de nouveau.</p>
                )}
              </div>
            )}
            <PageTaskList tasks={tasks} label="Avancement chapitre par chapitre" />
          </div>
        )}

        <DialogFooter>
          {phase === "confirm" && (
            <>
              <Button type="button" variant="ghost" onClick={onClose}>
                Annuler
              </Button>
              <Button type="button" disabled={blocked} onClick={() => void run()}>
                {RUN_LABELS[shown]}
              </Button>
            </>
          )}
          {phase === "running" && (
            <Button type="button" variant="outline" disabled={stopping} onClick={stop}>
              {stopping ? "Arrêt…" : "Arrêter"}
            </Button>
          )}
          {phase === "done" && (
            <Button type="button" onClick={onClose}>
              Fermer
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
