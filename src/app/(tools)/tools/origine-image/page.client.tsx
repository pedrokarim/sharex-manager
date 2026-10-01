"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useDropzone } from "react-dropzone";
import { ArrowLeft, Camera, HelpCircle, Loader2, ScanSearch, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProvenanceDetails } from "@/components/provenance/provenance-view";
import { useTranslation } from "@/lib/i18n";
import type { ProvenanceReport, ProvenanceVerdict } from "@/lib/provenance/types";
import { cn } from "@/lib/utils";

const MAX_BYTES = 30 * 1024 * 1024;

interface Analysis {
  name: string;
  preview: string;
  report: ProvenanceReport;
  verdict: ProvenanceVerdict;
}

const VERDICT_STYLES = {
  generated: { icon: Sparkles, tone: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  capture: { icon: Camera, tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  undetermined: { icon: HelpCircle, tone: "border-border bg-muted/50 text-foreground" },
} as const;

/**
 * Outil public : déposer une image pour lire ses marques d'origine. L'image
 * est envoyée au serveur le temps de la lecture, puis oubliée.
 */
export function ImageOriginTool() {
  const { t } = useTranslation();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // L'aperçu est une adresse locale au navigateur : on la libère quand elle ne sert plus.
  useEffect(() => {
    const preview = analysis?.preview;
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [analysis?.preview]);

  const analyze = useCallback(
    async (file: File) => {
      setError(null);
      if (file.size > MAX_BYTES) return setError(t("tools.origin.too_large"));
      setLoading(true);
      try {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/tools/provenance", { method: "POST", body });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.report) throw new Error(payload?.error || t("tools.origin.error"));
        setAnalysis({ name: file.name, preview: URL.createObjectURL(file), report: payload.report, verdict: payload.verdict });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : t("tools.origin.error"));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    noClick: true,
    multiple: false,
    onDrop: (files) => {
      if (files[0]) void analyze(files[0]);
    },
  });

  // Une image copiée se colle directement dans la page.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((entry) => entry.type.startsWith("image/"));
      if (file) void analyze(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [analyze]);

  const verdictStyle = analysis ? VERDICT_STYLES[analysis.verdict.kind] : null;
  const VerdictIcon = verdictStyle?.icon;

  return (
    <div className="relative mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <Link
        href="/tools"
        className="group mb-10 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
        {t("tools.origin.back")}
      </Link>

      <header className="max-w-2xl">
        <p className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-primary uppercase">
          <ScanSearch className="size-3.5" />
          {t("tools.origin.kicker")}
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tighter text-balance sm:text-4xl">{t("tools.origin.title")}</h1>
        <p className="mt-4 text-pretty text-muted-foreground sm:text-lg">{t("tools.origin.subtitle")}</p>
      </header>

      <div
        {...getRootProps()}
        className={cn(
          "mt-10 flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors",
          isDragActive ? "border-primary bg-primary/5" : "border-border bg-muted/30"
        )}
      >
        <input {...getInputProps()} />
        {loading ? (
          <Loader2 className="size-9 animate-spin text-primary" />
        ) : (
          <Upload className={cn("size-9 text-muted-foreground", isDragActive && "text-primary")} />
        )}
        <div className="space-y-1">
          <p className="font-medium">{loading ? t("tools.origin.reading") : t("tools.origin.drop")}</p>
          <p className="text-sm text-muted-foreground">{t("tools.origin.drop_hint")}</p>
        </div>
        <Button onClick={open} disabled={loading}>
          {t("tools.origin.browse")}
        </Button>
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      </div>

      {analysis && verdictStyle && VerdictIcon && (
        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={analysis.preview} alt="" className="max-h-80 w-full object-contain" />
            </div>
            <p className="truncate text-sm font-medium" title={analysis.name}>
              {analysis.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {analysis.report.format?.toUpperCase() ?? t("tools.origin.unknown_format")}
              {analysis.report.width ? ` · ${analysis.report.width} × ${analysis.report.height}` : ""}
              {` · ${(analysis.report.bytes / 1024 / 1024).toFixed(2)} Mo`}
            </p>
          </div>

          <div className="space-y-4">
            <div className={cn("flex items-start gap-3 rounded-xl border p-4", verdictStyle.tone)}>
              <VerdictIcon className="mt-0.5 size-5 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold">{analysis.verdict.title}</p>
                <p className="text-sm opacity-90">{analysis.verdict.reason}</p>
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <ProvenanceDetails report={analysis.report} />
            </div>
          </div>
        </section>
      )}

      <footer className="mt-12 space-y-2 rounded-2xl border border-border/70 bg-muted/40 p-5 text-sm text-muted-foreground">
        <p className="text-pretty">{t("tools.origin.note_limits")}</p>
        <p className="text-pretty">{t("tools.origin.note_privacy")}</p>
      </footer>
    </div>
  );
}
