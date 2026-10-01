"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setFailed(false);
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
  }, [file]);

  const report = detail?.report;

  const handleOriginal = async () => {
    try {
      await downloadImage(imageUrl(file), file);
    } catch {
      toast.error("Téléchargement impossible");
    }
  };

  const handleClean = async () => {
    setBusy(true);
    try {
      const clean = await downloadCleanImage(file);
      toast.success(
        clean.savedBytes > 0
          ? `Version propre : ${formatBytes(clean.savedBytes)} de métadonnées en moins, pixels identiques`
          : "Version propre : rien à retirer, fichier identique"
      );
    } catch (error: any) {
      toast.error(error?.message ?? "Version propre indisponible");
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
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
          disabled={busy || Boolean(cleanDisabledReason)}
          title={cleanDisabledReason}
          className="w-full gap-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Télécharger une version propre
        </Button>
        {cleanDisabledReason && <p className="text-xs text-muted-foreground">{cleanDisabledReason}</p>}
      </div>
    </section>
  );
}
