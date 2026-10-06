"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import type { AnalysisProgress, AnalysisStep, AnalyzePages, AnalyzePagesResult } from "../../lib/analysis/contract";
import { api } from "../../lib/client";
import { countLabel, errorMessage } from "../../lib/library-helpers";
import type { PageSummary } from "../../lib/types";
import { PageTaskList, type PageTask, type PageTaskState } from "./page-task-list";

interface AnalyzeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pages du chapitre, dans l'ordre de lecture. */
  pages: PageSummary[];
  /** L'analyse du module (`lib/analysis`), passée par la page. */
  analyze: AnalyzePages;
  /** Des pages ont été enregistrées : la planche doit se rafraîchir. */
  onPagesChanged: () => void;
}

type Phase = "confirm" | "running" | "done";

const STEP_STATES: Record<AnalysisStep, PageTaskState> = {
  preparing: "running",
  reading: "running",
  saving: "running",
  done: "done",
  skipped: "skipped",
  error: "error",
};

const STEP_DETAILS: Record<AnalysisStep, string> = {
  preparing: "Préparation…",
  reading: "Repérage et lecture…",
  saving: "Enregistrement…",
  done: "Analysée",
  skipped: "Passée",
  error: "Échec",
};

/**
 * « Analyser » un chapitre : repérage des zones de texte et lecture, page par
 * page, dans le navigateur. L'analyse ne part qu'au clic sur « Analyser » de
 * cette fenêtre, et s'arrête à la demande.
 */
export function AnalyzeDialog({ open, onOpenChange, pages, analyze, onPagesChanged }: AnalyzeDialogProps) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [replace, setReplace] = useState(false);
  const [tasks, setTasks] = useState<PageTask[]>([]);
  const [result, setResult] = useState<AnalyzePagesResult | null>(null);
  const [skipping, setSkipping] = useState(false);
  /** Pages que l'analyse propose d'écarter, avec leur numéro dans le chapitre, tant qu'elles ne le sont pas. */
  const [dismissed, setDismissed] = useState(false);
  const candidates = useMemo(
    () =>
      dismissed || !result
        ? []
        : result.untranslatable.flatMap((pageId) => {
            const index = pages.findIndex((page) => page.id === pageId);
            return index === -1 ? [] : [{ id: pageId, number: index + 1 }];
          }),
    [dismissed, pages, result],
  );

  const skipCandidates = async () => {
    setSkipping(true);
    try {
      for (const candidate of candidates) await api.setPageSkipped(candidate.id, true);
      toast.success(candidates.length === 1 ? "Page laissée telle quelle" : "Pages laissées telles quelles");
      setDismissed(true);
      onPagesChanged();
    } catch (error) {
      toast.error(errorMessage(error, "Réglage des pages impossible."));
    } finally {
      setSkipping(false);
    }
  };
  const [stopping, setStopping] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const runLock = useRef(false);

  const pageLabels = useMemo(() => new Map(pages.map((page, index) => [page.id, `Page ${index + 1}`])), [pages]);

  useEffect(() => {
    if (!open) return;
    setPhase("confirm");
    setReplace(false);
    setTasks([]);
    setResult(null);
    setDismissed(false);
    setStopping(false);
  }, [open]);

  useEffect(() => () => controller.current?.abort(), []);

  const onProgress = useCallback((progress: AnalysisProgress) => {
    setTasks((previous) =>
      previous.map((task) =>
        task.id === progress.pageId
          ? { ...task, state: STEP_STATES[progress.step], detail: progress.message || STEP_DETAILS[progress.step], progress: progress.progress }
          : task
      )
    );
  }, []);

  const run = async () => {
    if (pages.length === 0 || runLock.current) return;
    runLock.current = true;
    const ids = pages.map((page) => page.id);
    controller.current = new AbortController();
    setTasks(ids.map((id) => ({ id, label: pageLabels.get(id) ?? "Page", state: "waiting" })));
    setStopping(false);
    setPhase("running");
    try {
      const outcome = await analyze(ids, { replace, onProgress, signal: controller.current.signal });
      setResult(outcome);
      // Une page en échec garde sa raison sur sa ligne, même si l'analyse ne l'a pas signalée en cours de route.
      setTasks((previous) =>
        previous.map((task) => {
          const failure = outcome.failed.find((entry) => entry.pageId === task.id);
          return failure ? { ...task, state: "error", detail: failure.error } : task;
        })
      );
    } catch (error) {
      toast.error(errorMessage(error, "L’analyse s’est interrompue."));
    } finally {
      controller.current = null;
      runLock.current = false;
      // Une page interrompue en cours de route n'a rien d'enregistré : elle attend toujours.
      setTasks((previous) => previous.map((task) => (task.state === "running" ? { id: task.id, label: task.label, state: "waiting" } : task)));
      setPhase("done");
      onPagesChanged();
    }
  };

  const stop = () => {
    controller.current?.abort();
    setStopping(true);
  };

  const settled = tasks.filter((task) => task.state === "done" || task.state === "skipped" || task.state === "error").length;
  const waiting = tasks.filter((task) => task.state === "waiting" || task.state === "running").length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Une analyse en cours ne se ferme pas par mégarde : on l'arrête d'abord.
        if (!next && phase === "running") return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl" showCloseButton={phase !== "running"}>
        <DialogHeader>
          <DialogTitle>Analyser le chapitre</DialogTitle>
          <DialogDescription>
            {phase === "confirm"
              ? `Repérer les zones de texte des ${countLabel(pages.length, "page", "pages")} et lire ce qu’elles contiennent.`
              : phase === "running"
                ? "Les pages sont analysées l’une après l’autre. Gardez cet onglet ouvert."
                : "Les zones trouvées sont à vérifier dans l’atelier avant de traduire."}
          </DialogDescription>
        </DialogHeader>

        {phase === "confirm" && (
          <div className="grid gap-4">
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              <span>L’analyse tourne dans ce navigateur, avec des moteurs locaux. Aucune image et aucun texte ne partent chez un service extérieur.</span>
            </p>
            <div className="flex items-start justify-between gap-4">
              <Label htmlFor="scan-studio-analysis-replace" className="flex flex-col items-start gap-0.5 font-normal">
                <span className="font-medium">Remplacer les zones déjà présentes</span>
                <span className="text-xs leading-snug text-muted-foreground">
                  Sans cette option, les zones existantes sont conservées et seules les nouvelles s’ajoutent. Une zone corrigée à la main n’est jamais
                  écrasée.
                </span>
              </Label>
              <Switch id="scan-studio-analysis-replace" checked={replace} onCheckedChange={setReplace} />
            </div>
          </div>
        )}

        {phase !== "confirm" && (
          <div className="grid gap-3">
            {phase === "running" && (
              <div className="flex items-center gap-3">
                <p className="shrink-0 text-sm font-medium tabular-nums" aria-live="polite">
                  {stopping ? "Arrêt après la page en cours…" : `${settled} sur ${tasks.length}`}
                </p>
                <Progress value={tasks.length === 0 ? 0 : Math.round((settled / tasks.length) * 100)} aria-label="Avancement de l’analyse" className="h-1.5" />
              </div>
            )}
            {phase === "done" && (
              <div className="grid gap-1 text-sm" aria-live="polite">
                <p className="font-medium">{stopping ? "Analyse arrêtée à votre demande" : result ? "Analyse terminée" : "Analyse interrompue"}</p>
                {result && (
                  <p className="tabular-nums text-muted-foreground">
                    {countLabel(result.analyzed, "page analysée", "pages analysées")}, {countLabel(result.regions, "zone ajoutée", "zones ajoutées")}
                    {result.failed.length > 0 && `, ${countLabel(result.failed.length, "page en échec", "pages en échec")}`}
                    {stopping && waiting > 0 && `, ${countLabel(waiting, "page non analysée", "pages non analysées")}`}.
                  </p>
                )}
                {result && candidates.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <p className="min-w-0 flex-1 text-muted-foreground">
                      {candidates.length === 1
                        ? `La page ${candidates[0].number} semble n’avoir rien à traduire (couverture, bannière).`
                        : `Les pages ${candidates.map((entry) => entry.number).join(", ")} semblent n’avoir rien à traduire (couvertures, bannières).`}
                    </p>
                    <Button type="button" size="sm" variant="outline" disabled={skipping} onClick={() => void skipCandidates()}>
                      <ImageOff className="h-4 w-4" />
                      {candidates.length === 1 ? "La laisser telle quelle" : "Les laisser telles quelles"}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <PageTaskList tasks={tasks} label="Analyse page par page" />
          </div>
        )}

        <DialogFooter>
          {phase === "confirm" && (
            <>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button type="button" disabled={pages.length === 0} onClick={() => void run()}>
                Analyser
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
