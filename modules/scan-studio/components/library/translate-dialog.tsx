"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { startTranslationJob } from "../../lib/chapter-jobs";
import { api } from "../../lib/client";
import { estimateTexts } from "../../lib/folder-batch";
import { ENGINES_PATH, charactersLabel, countLabel, errorMessage, formatNumber } from "../../lib/library-helpers";
import { collectChapterTexts, translateChapter, type ChapterTexts } from "../../lib/translate-pages";
import type { PageSummary, PageView, TranslationEstimate } from "../../lib/types";
import { EngineName } from "./engine-logo";
import { PagePicker } from "./page-picker";

interface TranslateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapterId: string;
  /** Toutes les pages du chapitre, dans l'ordre de lecture : leur rang donne leur numéro. */
  pages: PageSummary[];
}

/** Attente après le dernier clic sur une vignette avant de refaire l'estimation. */
const ESTIMATE_DELAY_MS = 350;

/**
 * « Traduire » un chapitre : on choisit les pages, la fenêtre dit ce que le lot
 * représente, puis la traduction part en arrière-plan. Rien ne part chez un
 * moteur avant le clic sur « Traduire » de cette fenêtre. Elle se ferme
 * aussitôt : la planche du chapitre montre où en est chaque page.
 */
export function TranslateDialog({ open, onOpenChange, chapterId, pages }: TranslateDialogProps) {
  // Les pages « laissées telles quelles » ne se traduisent pas : elles ne sont pas proposées.
  const candidates = useMemo(() => pages.map((page, index) => ({ page, number: index + 1 })).filter((entry) => !entry.page.skipped), [pages]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [retranslate, setRetranslate] = useState(false);
  const [texts, setTexts] = useState<ChapterTexts | null>(null);
  const [estimate, setEstimate] = useState<TranslationEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  /** Pages lues pour l'estimation : changer une option ou une case ne les relit pas. */
  const pageCache = useRef(new Map<string, PageView>());

  /** Les pages cochées, dans l'ordre de lecture. */
  const selectedIds = useMemo(() => candidates.filter((entry) => selected.has(entry.page.id)).map((entry) => entry.page.id), [candidates, selected]);
  const selectionKey = selectedIds.join(",");

  // Ouverture : on repart de zéro, tout est coché.
  useEffect(() => {
    if (!open) return;
    pageCache.current = new Map();
    setSelected(new Set(candidates.map((entry) => entry.page.id)));
    setRetranslate(false);
    setTexts(null);
    setEstimate(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- à l'ouverture seulement
  }, [open]);

  // Estimation : les pages cochées sont lues sur ce serveur, puis le serveur dit
  // ce que le lot coûterait. Aucun moteur n'est appelé ici.
  useEffect(() => {
    if (!open) return;
    const ids = selectionKey === "" ? [] : selectionKey.split(",");
    if (ids.length === 0) {
      setTexts({ pages: [], texts: [], regionCount: 0, unreadable: [] });
      setEstimate({ characters: 0, known: 0, toSend: 0 });
      setEstimating(false);
      return;
    }
    const abort = new AbortController();
    setEstimating(true);
    const getPage = async (pageId: string) => {
      const known = pageCache.current.get(pageId);
      if (known) return known;
      const view = await api.getPage(pageId);
      pageCache.current.set(pageId, view);
      return view;
    };
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const collected = await collectChapterTexts(ids, { retranslate, signal: abort.signal, deps: { getPage } });
          if (abort.signal.aborted) return;
          // Par paquets : le serveur n'estime pas plus de quelques centaines de phrases à la fois.
          const next = await estimateTexts(chapterId, collected.texts, api.estimateTranslation, abort.signal);
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
    }, ESTIMATE_DELAY_MS);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [open, selectionKey, retranslate, chapterId]);

  const nothingToDo = texts !== null && texts.pages.length === 0;
  const noEngine = estimate !== null && estimate.toSend > 0 && !estimate.engine;

  const start = () => {
    if (!texts || texts.pages.length === 0) return;
    // Seules les pages qui ont quelque chose à envoyer partent, dans l'ordre de lecture.
    const ids = texts.pages.map((entry) => entry.pageId);
    if (!startTranslationJob(chapterId, ids, { retranslate }, translateChapter)) {
      toast.info("Un traitement tourne déjà sur ce chapitre", { description: "Attendez sa fin, ou arrêtez-le depuis la planche." });
      return;
    }
    onOpenChange(false);
    toast.message(`Traduction lancée sur ${countLabel(ids.length, "page", "pages")}`, { description: "Elle tourne en arrière-plan : la planche montre où en est chaque page." });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Traduire le chapitre</DialogTitle>
          <DialogDescription>Choisissez les pages. Voici ce que le lot représente : rien ne part tant que vous n’avez pas confirmé.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune page à traduire dans ce chapitre.</p>
          ) : (
            <PagePicker pages={candidates} selected={selected} onChange={setSelected} purpose="cochées" />
          )}

          {selected.size === 0 ? (
            <p className="text-sm text-muted-foreground">Cochez au moins une page.</p>
          ) : texts === null || estimate === null ? (
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
            <p className={estimating ? "text-sm opacity-60 transition-opacity" : "text-sm transition-opacity"}>
              Aucune zone à traduire dans les pages cochées.{" "}
              <span className="text-muted-foreground">
                Les zones sans texte lu, les onomatopées, le texte du décor et les traductions corrigées ou validées ne partent jamais.
              </span>
            </p>
          ) : (
            <div className={estimating ? "grid gap-3 opacity-60 transition-opacity" : "grid gap-3 transition-opacity"} aria-busy={estimating}>
              <p className="text-sm tabular-nums">
                {countLabel(texts.regionCount, "zone", "zones")} sur {countLabel(texts.pages.length, "page", "pages")}
                <span className="text-muted-foreground"> · {countLabel(selected.size - texts.pages.length, "page cochée", "pages cochées")} sans rien à traduire</span>
              </p>
              <p className="text-sm leading-6 tabular-nums">
                <span className="font-medium">{charactersLabel(estimate.characters)}</span>, dont {formatNumber(estimate.known)} déjà connus (glossaire,
                mémoire, cache) ;{" "}
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
                      : "Seul le texte lu dans les bulles part chez le moteur ; les images des pages restent sur ce serveur. Si aucun moteur ne répond, le lot s’arrête."}{" "}
                    La traduction continue en arrière-plan tant que cet onglet reste ouvert.
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
            <Switch id="scan-studio-retranslate" checked={retranslate} onCheckedChange={setRetranslate} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" disabled={estimating || texts === null || estimate === null || nothingToDo || noEngine} onClick={start}>
            {texts && texts.pages.length > 0 ? `Traduire ${countLabel(texts.pages.length, "page", "pages")}` : "Traduire"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
