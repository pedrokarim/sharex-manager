"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  ProvenanceBadgeView,
  ProvenanceDisclosure,
  createSummaryStore,
} from "@/components/provenance/provenance-view";
import { callModule, downloadCleanImage, downloadImage, formatBytes, imageUrl } from "../lib/client";
import type { CleanResult, ProvenanceReport, ProvenanceSummary } from "../lib/provenance-types";

/** Indicateurs des rendus du module : un appel pour toute une page de la grille. */
const useSummary = createSummaryStore((files) =>
  callModule<Record<string, ProvenanceSummary>>("inspectImages", files)
);

/** Indicateur d'origine d'une vignette du studio. */
export function ProvenanceBadge({ file, className }: { file: string; className?: string }) {
  return <ProvenanceBadgeView summary={useSummary(file)} className={className} />;
}

interface Detail {
  report: ProvenanceReport;
  clean: CleanResult | null;
}

/**
 * Origine d'une image dans la visionneuse : ce qui a été lu dans le fichier,
 * sans interprétation, et les deux téléchargements.
 */
export function ProvenancePanel({ file }: { file: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  // Retour des téléchargements, sous leurs boutons. Le bilan de la version
  // propre se lit en entier : il reste un peu plus longtemps.
  const feedback = useFeedback({ successDuration: 5000 });
  const clearFeedback = feedback.clear;

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setFailed(false);
    clearFeedback();
    callModule<Detail>("inspectImageDetail", file)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [file, clearFeedback]);

  const report = detail?.report;

  const handleOriginal = async () => {
    feedback.clear();
    try {
      await downloadImage(imageUrl(file), file);
    } catch {
      feedback.error("Le téléchargement n’a pas abouti. Réessayez.");
    }
  };

  const handleClean = async () => {
    setBusy(true);
    feedback.clear();
    try {
      const clean = await downloadCleanImage(file);
      feedback.success(
        clean.savedBytes > 0
          ? `Version propre : ${formatBytes(clean.savedBytes)} de métadonnées en moins, pixels identiques.`
          : "Version propre : rien à retirer, le fichier est identique."
      );
    } catch (error) {
      feedback.error(errorMessage(error, "La version propre n’a pas pu être préparée. Téléchargez l’original."));
    } finally {
      setBusy(false);
    }
  };

  const cleanDisabledReason = report && !report.removable ? report.removableReason : undefined;

  return (
    <section className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Origine</p>

      {!detail && !failed && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner aria-hidden className="size-3.5" />
          Lecture du fichier…
        </p>
      )}
      {failed && <p className="text-xs text-muted-foreground">Lecture des marques d’origine impossible.</p>}

      {report && <ProvenanceDisclosure key={file} report={report} clean={detail?.clean} />}

      <div className="flex flex-col gap-2">
        <Button onClick={handleOriginal} className="w-full gap-2">
          <Download className="h-4 w-4" />
          Télécharger l’original
        </Button>
        <Button
          variant="outline"
          onClick={handleClean}
          loading={busy}
          disabled={Boolean(cleanDisabledReason)}
          title={cleanDisabledReason}
          className="w-full gap-2"
        >
          <Download className="h-4 w-4" />
          Télécharger une version propre
        </Button>
        {/* La marge négative absorbe l'écart de la colonne tant qu'il n'y a pas de message. */}
        <div className="-mt-2">
          <FormStatus state={feedback.state} className="pt-2" />
        </div>
        {cleanDisabledReason && <p className="text-xs text-muted-foreground">{cleanDisabledReason}</p>}
      </div>
    </section>
  );
}
