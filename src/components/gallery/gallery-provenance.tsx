"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Sparkles } from "lucide-react";
import { ProvenanceDetails, ProvenanceDisclosure, createSummaryStore } from "@/components/provenance/provenance-view";
import { isImageFile } from "@/lib/media-kind";
import type { ProvenanceReport, ProvenanceSummary, ProvenanceVerdict } from "@/lib/provenance/types";
import { cn } from "@/lib/utils";

/** Indicateurs des fichiers de la galerie : un appel par page affichée. */
const useSummary = createSummaryStore(async (names) => {
  const response = await fetch("/api/files/provenance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ names }),
  });
  if (!response.ok) throw new Error(String(response.status));
  return ((await response.json()).summaries ?? {}) as Record<string, ProvenanceSummary>;
});

function Badge({ name, className, inline }: { name: string; className?: string; inline?: boolean }) {
  const summary = useSummary(name);
  // Presque aucune capture ne porte de marque : on ne signale que ce qui en
  // dit quelque chose, une signature ou une déclaration de génération.
  if (!summary || (summary.status !== "signed" && summary.declared !== "generated")) return null;
  const generated = summary.declared === "generated";
  const label = summary.generator ?? (generated ? "Image générée" : "Signée");
  const title = generated
    ? `Déclarée comme image générée${summary.generator ? ` : ${summary.generator}` : ""}`
    : `Manifeste C2PA : ${label}`;
  const Icon = summary.status === "signed" ? BadgeCheck : Sparkles;
  return (
    <span
      title={title}
      aria-label={title}
      className={cn(
        "flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium leading-none",
        inline
          ? "shrink-0 bg-muted text-muted-foreground"
          : "pointer-events-none absolute z-10 max-w-[calc(100%-1rem)] bg-black/60 text-white backdrop-blur-sm",
        className
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Pastille d'origine sur une vignette de la galerie, quand le fichier déclare quelque chose. */
export function GalleryProvenanceBadge({
  name,
  className,
  inline,
}: {
  name: string;
  className?: string;
  /** Dans une ligne de texte plutôt que posée sur une vignette. */
  inline?: boolean;
}) {
  // Seules les images portent ces marques : inutile d'interroger le serveur pour une archive.
  return isImageFile(name) ? <Badge name={name} className={className} inline={inline} /> : null;
}

/** Origine d'un fichier, dépliée : pour une fenêtre ou une bulle qui lui est consacrée. */
export function GalleryProvenanceDetails({ name }: { name: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setFailed(false);
    fetch(`/api/files/${encodeURIComponent(name)}/provenance`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  if (failed) return <p className="text-xs text-muted-foreground">Lecture des marques d’origine impossible.</p>;
  if (!detail) return <p className="text-xs text-muted-foreground">Lecture du fichier…</p>;
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">{detail.verdict.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail.verdict.reason}</p>
      </div>
      <ProvenanceDetails report={detail.report} />
    </div>
  );
}

interface Detail {
  report: ProvenanceReport;
  verdict: ProvenanceVerdict;
}

/** Origine d'un fichier dans la visionneuse de la galerie. */
export function GalleryProvenanceSection({ name, title }: { name: string; title: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    if (!isImageFile(name)) return setDetail(null);
    let cancelled = false;
    setDetail(null);
    fetch(`/api/files/${encodeURIComponent(name)}/provenance`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.report) setDetail(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [name]);

  if (!detail || detail.report.status === "unsupported") return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <ProvenanceDisclosure key={name} report={detail.report} />
      {detail.verdict.kind !== "undetermined" && (
        <p className="text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">{detail.verdict.title}.</span> {detail.verdict.reason}
        </p>
      )}
    </div>
  );
}
