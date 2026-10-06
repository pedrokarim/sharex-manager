"use client";

/**
 * Analyse automatique de la page ouverte dans l'atelier : le bouton de
 * l'en-tête, son témoin d'avancement, et le crochet qui les relie à
 * l'historique de la page.
 *
 * L'analyse tourne dans le navigateur (niveau 1 de l'échelle de recours) : rien
 * n'est envoyé. Ses zones entrent dans l'historique en une seule étape, donc
 * Ctrl+Z la défait d'un coup.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ScanText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { analysisBlocker, analyzeSurface, mergeRegions, needsReview, lastDetectionReport } from "../../lib/analysis";
import { errorMessage, ENGINES_PATH } from "../../lib/library-helpers";
import type { ChapterSettings, ScanRegion } from "../../lib/types";
import type { PageDocument } from "./use-page-history";

export interface PageAnalysis {
  running: boolean;
  /** Avancement, de 0 à 1. */
  progress: number;
  /** Pourquoi l'analyse est indisponible sur ce chapitre ; `null` si elle l'est. */
  blocker: string | null;
  /** L'image de la page est chargée : l'analyse peut partir. */
  ready: boolean;
  start: () => void;
}

interface PageAnalysisOptions {
  image: HTMLImageElement | null;
  /** Taille de la page, dans laquelle les zones sont exprimées. */
  page: { width: number; height: number };
  settings: ChapterSettings;
  /** `commit` de l'historique de la page. */
  commit: (update: (document: PageDocument) => PageDocument) => void;
  /** Zones actuelles de la page, pour annoncer ce que l'analyse ajoute. */
  getRegions: () => ScanRegion[];
}

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

/** Lance l'analyse de la page et pose ses zones dans l'historique. */
export function usePageAnalysis({ image, page, settings, commit, getRegions }: PageAnalysisOptions): PageAnalysis {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);
  const blocker = analysisBlocker(settings);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      // L'atelier change de page : le résultat d'une analyse en cours ne la concerne plus.
      mountedRef.current = false;
    };
  }, []);

  const start = useCallback(() => {
    if (!image || blocker || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setProgress(0);
    let shown = 0;
    analyzeSurface(image, page, settings, (value) => {
      // Un pour cent à la fois : inutile de redessiner l'en-tête plus souvent.
      const rounded = Math.round(value * 100) / 100;
      if (!mountedRef.current || rounded === shown) return;
      shown = rounded;
      setProgress(rounded);
    })
      .then((found) => {
        if (!mountedRef.current) return;
        tellMissingDetector();
        // Repérée par le détecteur, la page repart de ses zones : celles d'une analyse précédente sont remplacées,
        // sauf celles qu'on a corrigées ou traduites, qui ne sont jamais retirées.
        const replace = lastDetectionReport().used === "detector";
        const { added } = mergeRegions(getRegions(), found, { format: settings.format, replace });
        if (added === 0) {
          toast.info(found.length === 0 ? "Aucun texte repéré sur cette page" : "Aucune nouvelle zone : celles de la page sont déjà en place", {
            description:
              found.length === 0
                ? "L’analyse trouve les bulles et les cartouches nets. Un texte posé sur le dessin se trace à la main."
                : undefined,
          });
          return;
        }
        // La fusion est refaite sur l'état courant : la page a pu changer pendant la lecture.
        commit((current) => {
          const merged = mergeRegions(current.regions, found, { format: settings.format, replace });
          if (merged.regions === current.regions) return current;
          return { regions: merged.regions, status: current.status === "imported" ? "analyzed" : current.status };
        });
        const doubtful = found.filter(needsReview).length;
        toast.success(`${plural(added, "zone")} ${added > 1 ? "trouvées" : "trouvée"}`, {
          description: `${doubtful > 0 ? `${plural(doubtful, "lecture")} à vérifier. ` : ""}${detectionNote()} Ctrl+Z annule l’analyse.`,
        });
      })
      .catch((error: unknown) => {
        if (mountedRef.current) toast.error(errorMessage(error, "Analyse impossible"));
      })
      .finally(() => {
        runningRef.current = false;
        if (mountedRef.current) setRunning(false);
      });
  }, [image, blocker, page, settings, commit, getRegions]);

  return { running, progress, blocker, ready: image !== null, start };
}

/**
 * Le détecteur de bulles est choisi mais son modèle manque : l'analyse vient de
 * tourner avec l'ancien repérage, moins sûr. On le dit une fois par visite,
 * avec le chemin pour l'installer.
 */
let missingDetectorTold = false;
function tellMissingDetector() {
  if (missingDetectorTold || !lastDetectionReport().missing) return;
  missingDetectorTold = true;
  toast.warning("Le détecteur de bulles n’est pas installé", {
    description: "Cette page a été analysée par l’ancien repérage, qui manque les petites bulles et le texte hors bulle. Son modèle se télécharge une fois, dans « Moteurs ».",
    action: { label: "Ouvrir « Moteurs »", onClick: () => window.location.assign(ENGINES_PATH) },
    duration: 20_000,
  });
}

/** Une phrase qui dit comment la page vient d'être repérée. */
function detectionNote(): string {
  const report = lastDetectionReport();
  if (report.used === "detector") return "Repérage par le détecteur de bulles.";
  if (report.missing) return "Repérage par les pixels : le détecteur de bulles n’est pas encore installé.";
  return report.reason ? `Détecteur indisponible (${report.reason}) : repérage par les pixels.` : "Repérage par les pixels.";
}

/** Bouton « Analyser » de l'en-tête. Coupé, avec la raison en infobulle, quand le chapitre l'interdit. */
export function AnalyzeButton({ analysis }: { analysis: PageAnalysis }) {
  const disabled = analysis.running || !analysis.ready || analysis.blocker !== null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Un bouton coupé ne reçoit pas le survol : l'enveloppe porte l'infobulle. */}
        <span className="ml-2 inline-flex" tabIndex={analysis.blocker ? 0 : undefined}>
          <Button variant="outline" size="sm" className="h-8 gap-2" disabled={disabled} onClick={analysis.start}>
            {analysis.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
            Analyser<span className="hidden min-[1800px]:inline"> la page</span>
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        {analysis.blocker ?? "Repère les zones de texte de la page et les lit, sur cet appareil. Rien n’est envoyé, aucune IA générative."}
      </TooltipContent>
    </Tooltip>
  );
}

/** Avancement de l'analyse, à côté du témoin d'enregistrement. Rien quand elle ne tourne pas. */
export function AnalysisIndicator({ analysis }: { analysis: PageAnalysis }) {
  if (!analysis.running) return null;
  const percent = Math.round(analysis.progress * 100);
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground" role="status" aria-live="polite">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {/* Le premier lancement charge le moteur de lecture : quelques secondes sans avancement. */}
      {percent < 10 ? "Préparation de la lecture…" : `Lecture de la page… ${percent} %`}
    </span>
  );
}
