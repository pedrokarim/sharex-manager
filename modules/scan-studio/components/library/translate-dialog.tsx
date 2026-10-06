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
import { api } from "../../lib/client";
import { ENGINES_PATH, charactersLabel, countLabel, errorMessage, formatNumber } from "../../lib/library-helpers";
import {
  collectChapterTexts,
  translateChapter,
  type ChapterTexts,
  type ChapterTranslationResult,
  type PageTranslationOutcome,
  type TranslateProgress,
} from "../../lib/translate-pages";
import type { PageSummary, PageView, TranslationEstimate } from "../../lib/types";
import { EngineName } from "./engine-logo";
import { PageTaskList, type PageTask } from "./page-task-list";

interface TranslateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapterId: string;
  /** Pages du chapitre, dans l'ordre de lecture. */
  pages: PageSummary[];
  /** Des pages ont été enregistrées : la planche doit se rafraîchir. */
  onPagesChanged: () => void;
}

type Phase = "estimate" | "running" | "done";

const STEP_DETAILS: Partial<Record<TranslateProgress["step"], string>> = {
  reading: "Lecture de la page…",
  translating: "Traduction…",
  saving: "Enregistrement…",
};

function outcomeDetail(outcome: PageTranslationOutcome): string {
  if (outcome.state === "skipped") return "Rien à traduire";
  if (outcome.state === "error") return outcome.error ?? "Échec";
  const done = countLabel(outcome.translated, "zone traduite", "zones traduites");
  const missing = outcome.failed.length > 0 ? `, ${countLabel(outcome.failed.length, "zone sans réponse", "zones sans réponse")}` : "";
  return `${done}${missing}`;
}

/**
 * « Traduire » un chapitre : l'estimation d'abord, puis, après confirmation,
 * les pages une à une. Rien ne part chez un moteur avant le clic sur
 * « Traduire » de cette fenêtre.
 */
export function TranslateDialog({ open, onOpenChange, chapterId, pages, onPagesChanged }: TranslateDialogProps) {
  const [phase, setPhase] = useState<Phase>("estimate");
  const [retranslate, setRetranslate] = useState(false);
  const [texts, setTexts] = useState<ChapterTexts | null>(null);
  const [estimate, setEstimate] = useState<TranslationEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [tasks, setTasks] = useState<PageTask[]>([]);
  const [result, setResult] = useState<ChapterTranslationResult | null>(null);
  const [stopping, setStopping] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const runLock = useRef(false);
  /** Pages lues pour l'estimation : changer une option ne les relit pas. */
  const pageCache = useRef(new Map<string, PageView>());

  const pageLabels = useMemo(() => new Map(pages.map((page, index) => [page.id, `Page ${index + 1}`])), [pages]);
  const pageIds = useMemo(() => pages.map((page) => page.id), [pages]);
  const pageIdsRef = useRef(pageIds);
  useEffect(() => {
    pageIdsRef.current = pageIds;
  }, [pageIds]);

  // Ouverture : on repart de zéro. La fenêtre ne s'ouvre que d'un clic.
  useEffect(() => {
    if (!open) return;
    pageCache.current = new Map();
    setPhase("estimate");
    setRetranslate(false);
    setTexts(null);
    setEstimate(null);
    setResult(null);
    setTasks([]);
    setStopping(false);
  }, [open]);

  // Estimation : les pages sont lues sur ce serveur, puis le serveur dit ce
  // qu'un lot coûterait. Aucun moteur n'est appelé ici.
  useEffect(() => {
    if (!open || phase !== "estimate") return;
    const abort = new AbortController();
    setEstimating(true);
    const getPage = async (pageId: string) => {
      const known = pageCache.current.get(pageId);
      if (known) return known;
      const view = await api.getPage(pageId);
      pageCache.current.set(pageId, view);
      return view;
    };
    void (async () => {
      try {
        const collected = await collectChapterTexts(pageIdsRef.current, { retranslate, signal: abort.signal, deps: { getPage } });
        if (abort.signal.aborted) return;
        const next = collected.texts.length > 0 ? await api.estimateTranslation(chapterId, collected.texts) : { characters: 0, known: 0, toSend: 0 };
        if (abort.signal.aborted) return;
        setTexts(collected);
        setEstimate(next);
      } catch (error) {
        if (abort.signal.aborted) return;
        setTexts(null);
        setEstimate(null);
        toast.error(errorMessage(error, "Estimation impossible."));
      } finally {
        if (!abort.signal.aborted) setEstimating(false);
      }
    })();
    return () => abort.abort();
  }, [open, phase, retranslate, chapterId]);

  // La fenêtre disparaît avec la page : le lot s'arrête après la page en cours.
  useEffect(() => () => controller.current?.abort(), []);

  const onProgress = useCallback((progress: TranslateProgress) => {
    setTasks((previous) =>
      previous.map((task) => {
        if (task.id !== progress.pageId) return task;
        if (progress.outcome) return { ...task, state: progress.outcome.state, detail: outcomeDetail(progress.outcome) };
        return { ...task, state: "running", detail: STEP_DETAILS[progress.step] };
      })
    );
  }, []);

  const run = async () => {
    if (!texts || texts.pages.length === 0 || runLock.current) return;
    runLock.current = true;
    const ids = texts.pages.map((entry) => entry.pageId);
    controller.current = new AbortController();
    setTasks(ids.map((id) => ({ id, label: pageLabels.get(id) ?? "Page", state: "waiting" })));
    setStopping(false);
    setPhase("running");
    try {
      const outcome = await translateChapter(ids, { retranslate, signal: controller.current.signal, onProgress });
      setResult(outcome);
      if (outcome.translatedPages > 0) onPagesChanged();
    } catch (error) {
      toast.error(errorMessage(error, "La traduction s’est interrompue."));
    } finally {
      controller.current = null;
      runLock.current = false;
      setPhase("done");
    }
  };

  const stop = () => {
    controller.current?.abort();
    setStopping(true);
  };

  const settled = tasks.filter((task) => task.state === "done" || task.state === "skipped" || task.state === "error").length;
  const nothingToDo = texts !== null && texts.pages.length === 0;
  const noEngine = estimate !== null && estimate.toSend > 0 && !estimate.engine;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Un lot en cours ne se ferme pas par mégarde : on l'arrête d'abord.
        if (!next && phase === "running") return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl" showCloseButton={phase !== "running"}>
        <DialogHeader>
          <DialogTitle>Traduire le chapitre</DialogTitle>
          <DialogDescription>
            {phase === "estimate"
              ? "Voici ce que ce lot représente. Rien ne part tant que vous n’avez pas confirmé."
              : phase === "running"
                ? "Les pages partent l’une après l’autre, une requête par page."
                : "Les traductions sont posées comme des propositions, à relire dans l’atelier."}
          </DialogDescription>
        </DialogHeader>

        {phase === "estimate" && (
          <div className="grid gap-4">
            {texts === null || estimate === null ? (
              estimating ? (
                <div className="grid gap-2" aria-busy="true" aria-label="Estimation en cours">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-4 w-full max-w-sm" />
                  <Skeleton className="h-4 w-full max-w-xs" />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">L’estimation n’a pas pu être faite. Fermez cette fenêtre et réessayez.</p>
              )
            ) : nothingToDo ? (
              <p className="text-sm">
                Aucune zone à traduire dans ce chapitre.{" "}
                <span className="text-muted-foreground">
                  Les zones sans texte lu, les onomatopées, le texte du décor et les traductions corrigées ou validées ne partent jamais.
                </span>
              </p>
            ) : (
              <div className={estimating ? "grid gap-3 opacity-60 transition-opacity" : "grid gap-3 transition-opacity"} aria-busy={estimating}>
                <p className="text-sm tabular-nums">
                  {countLabel(texts.regionCount, "zone", "zones")} sur {countLabel(texts.pages.length, "page", "pages")}
                  <span className="text-muted-foreground"> · {countLabel(pages.length - texts.pages.length, "page", "pages")} sans rien à traduire</span>
                </p>
                <p className="text-sm leading-6 tabular-nums">
                  <span className="font-medium">{charactersLabel(estimate.characters)}</span>, dont {formatNumber(estimate.known)} déjà connus
                  (glossaire, mémoire, cache) ;{" "}
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
                      {estimate.toSend === 0
                        ? "Rien ne sort de ce serveur pour ce lot."
                        : "Seul le texte lu dans les bulles part chez le moteur. Les images des pages restent sur ce serveur. Si ce moteur ne répond pas, l’autre prend le relais et la fenêtre le dira."}
                    </span>
                  </p>
                )}
                {texts.unreadable.length > 0 && (
                  <p className="text-sm text-destructive">
                    {texts.unreadable.length < 2 ? "Une page n’a pas pu être lue" : `${texts.unreadable.length} pages n’ont pas pu être lues`} et ne fait pas partie du lot.
                  </p>
                )}
              </div>
            )}
            <div className="flex items-start justify-between gap-4">
              <Label htmlFor="scan-studio-retranslate" className="flex flex-col items-start gap-0.5 font-normal">
                <span className="font-medium">Reprendre aussi les zones déjà proposées</span>
                <span className="text-xs leading-snug text-muted-foreground">
                  L’ancienne proposition reste dans l’historique de la zone. Les traductions corrigées à la main ou validées ne sont jamais reprises.
                </span>
              </Label>
              <Switch id="scan-studio-retranslate" checked={retranslate} onCheckedChange={setRetranslate} disabled={estimating} />
            </div>
          </div>
        )}

        {phase !== "estimate" && (
          <div className="grid gap-3">
            {phase === "running" && (
              <div className="flex items-center gap-3">
                <p className="shrink-0 text-sm font-medium tabular-nums" aria-live="polite">
                  {stopping ? "Arrêt après la page en cours…" : `${settled} sur ${tasks.length}`}
                </p>
                <Progress value={tasks.length === 0 ? 0 : Math.round((settled / tasks.length) * 100)} aria-label="Avancement de la traduction" className="h-1.5" />
              </div>
            )}
            {phase === "done" && result && <TranslationSummary result={result} pageLabels={pageLabels} />}
            <PageTaskList tasks={tasks} label="Traduction page par page" />
          </div>
        )}

        <DialogFooter>
          {phase === "estimate" && (
            <>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button type="button" disabled={estimating || texts === null || estimate === null || nothingToDo || noEngine} onClick={() => void run()}>
                Traduire
              </Button>
            </>
          )}
          {phase === "running" && (
            <Button type="button" variant="outline" disabled={stopping} onClick={stop}>
              {stopping ? "Arrêt…" : "Arrêter"}
            </Button>
          )}
          {phase === "done" && (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Bilan du lot : ce qui est traduit, toute bascule sur le secours, les échecs. */
function TranslationSummary({ result, pageLabels }: { result: ChapterTranslationResult; pageLabels: Map<string, string> }) {
  const title =
    result.stopped === "engines" ? "Lot interrompu : aucun moteur ne répond" : result.stopped === "aborted" ? "Lot arrêté à votre demande" : "Traduction terminée";
  // La raison de l'arrêt est déjà écrite une fois : on ne la répète pas page par page.
  const failures = result.failed.filter((failure) => result.stopped !== "engines" || failure.error !== result.stopReason);
  return (
    <div className="grid gap-2 text-sm" aria-live="polite">
      <p className="font-medium">{title}</p>
      <p className="tabular-nums text-muted-foreground">
        {countLabel(result.translatedPages, "page traduite", "pages traduites")}, {countLabel(result.translatedRegions, "zone", "zones")} ;{" "}
        {result.sentCharacters === 0 ? "aucun caractère envoyé à un moteur" : `${charactersLabel(result.sentCharacters)} envoyés`}.
      </p>
      {result.fallbacks.map((fallback) => (
        <p key={`${fallback.from}-${fallback.to}`} className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-amber-700 dark:text-amber-300">
          <TriangleAlert aria-hidden className="h-4 w-4 shrink-0" />
          <EngineName engine={fallback.from} /> indisponible, traduit par <EngineName engine={fallback.to} />
          {fallback.reason && <span className="basis-full text-xs text-muted-foreground">{fallback.reason}</span>}
        </p>
      ))}
      {result.stopped === "engines" && (
        <p className="text-destructive">
          {result.stopReason ? `${result.stopReason} ` : ""}
          Les pages déjà traduites le restent
          {result.remaining.length > 0 ? `, ${countLabel(result.remaining.length, "page attend", "pages attendent")}` : ""}. Relancez à la main quand un moteur
          répond de nouveau.
        </p>
      )}
      {result.stopped === "aborted" && result.remaining.length > 0 && (
        <p className="text-muted-foreground">{countLabel(result.remaining.length, "page n’est pas partie", "pages ne sont pas parties")}.</p>
      )}
      {failures.length > 0 && (
        <ul className="grid gap-0.5 text-destructive">
          {failures.map((failure) => (
            <li key={failure.pageId}>
              {pageLabels.get(failure.pageId) ?? "Page"} : {failure.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
