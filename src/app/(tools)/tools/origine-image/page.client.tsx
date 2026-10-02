"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useDropzone } from "react-dropzone";
import { ArrowLeft, Camera, HelpCircle, Loader2, Sparkles, Upload } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { FRONT_CONTAINER, FRONT_NARROW } from "@/components/front/container";
import { DISPLAY } from "@/components/front/fonts";
import { PhotoHeader } from "@/components/front/photo-header";
import { ACCENT, PILL_SOLID } from "@/components/front/styles";
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
  generated: { icon: Sparkles, tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  capture: { icon: Camera, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  undetermined: { icon: HelpCircle, tone: "bg-foreground/[0.05] text-foreground" },
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
    <>
      <PhotoHeader
        photo="mist"
        kicker={
          <Link href="/tools" className="group inline-flex items-center gap-2 transition-colors hover:text-white">
            <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
            {t("tools.origin.back")}
          </Link>
        }
        title={t("tools.origin.title")}
        description={t("tools.origin.subtitle")}
      />

      <div className={cn(FRONT_NARROW, "pt-6")}>
        {/* Le pointillé n'est pas un décor : il dessine la zone où déposer. */}
        <div
          {...getRootProps()}
          className={cn(
            "flex flex-col items-center justify-center gap-5 rounded-[28px] border-2 border-dashed px-6 py-14 text-center transition-colors",
            isDragActive ? "border-emerald-600 bg-emerald-500/10" : "border-foreground/15 bg-foreground/[0.03]",
          )}
        >
          <input {...getInputProps()} />
          {loading ? (
            <Loader2 className={cn("size-9 animate-spin", ACCENT)} />
          ) : (
            <Upload className={cn("size-9", isDragActive ? ACCENT : "text-muted-foreground")} strokeWidth={1.5} />
          )}
          <div className="space-y-1.5">
            <p className={cn(DISPLAY, "text-2xl sm:text-3xl")}>{loading ? t("tools.origin.reading") : t("tools.origin.drop")}</p>
            <p className="text-sm text-muted-foreground">{t("tools.origin.drop_hint")}</p>
          </div>
          <button type="button" onClick={open} disabled={loading} className={cn(PILL_SOLID, "disabled:opacity-50")}>
            {t("tools.origin.browse")}
          </button>
          {error && <p className="rounded-full bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
        </div>
      </div>

      {/* Le résultat arrive en douceur, et cède la place au suivant de même. */}
      <AnimatePresence mode="wait">
        {analysis && verdictStyle && VerdictIcon && (
          <motion.section
            key={analysis.preview}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className={cn(FRONT_CONTAINER, "mt-12 grid gap-8 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]")}
          >
            <div className="space-y-3">
              <div className="overflow-hidden rounded-[22px] bg-foreground/[0.045]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={analysis.preview} alt="" className="max-h-80 w-full object-contain" />
              </div>
              <p className="truncate font-medium" title={analysis.name}>
                {analysis.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {analysis.report.format?.toUpperCase() ?? t("tools.origin.unknown_format")}
                {analysis.report.width ? ` · ${analysis.report.width} × ${analysis.report.height}` : ""}
                {` · ${(analysis.report.bytes / 1024 / 1024).toFixed(2)} Mo`}
              </p>
            </div>

            <div className="space-y-4">
              <div className={cn("flex items-start gap-4 rounded-[22px] p-6", verdictStyle.tone)}>
                <VerdictIcon className="mt-1 size-6 shrink-0" strokeWidth={1.75} />
                <div className="space-y-1.5">
                  <p className={cn(DISPLAY, "text-2xl sm:text-3xl")}>{analysis.verdict.title}</p>
                  <p className="opacity-90">{analysis.verdict.reason}</p>
                </div>
              </div>
              <div className="rounded-[22px] bg-foreground/[0.045] p-6">
                <ProvenanceDetails report={analysis.report} />
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <footer className={cn(FRONT_NARROW, "space-y-3 pt-14 pb-24 text-sm text-muted-foreground sm:pb-32")}>
        <p className="text-pretty">{t("tools.origin.note_limits")}</p>
        <p className="text-pretty">{t("tools.origin.note_privacy")}</p>
      </footer>
    </>
  );
}
