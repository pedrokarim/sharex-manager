"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Download, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { canExportInBrowser, exportProject, type ExportProgress } from "../engine/export";
import { formatTimecode, projectDuration } from "../engine/timeline";
import type { ClipExport, ClipProject } from "../engine/types";
import { exportUrl, saveExport } from "../lib/client";
import { ensureFonts } from "../lib/fonts";

type Stage =
  | { kind: "ready" }
  | { kind: "rendering"; progress: ExportProgress; startedAt: number }
  | { kind: "uploading"; ratio: number }
  | { kind: "done"; result: ClipExport }
  | { kind: "error"; message: string };

const PHASE_LABELS: Record<ExportProgress["phase"], string> = {
  prepare: "Préparation des médias",
  audio: "Mixage du son",
  video: "Rendu des images",
  finalize: "Finalisation du fichier",
};

export function ExportDialog({
  project,
  open,
  onOpenChange,
}: {
  project: ClipProject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "ready" });
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) setStage({ kind: "ready" });
  }, [open]);

  const busy = stage.kind === "rendering" || stage.kind === "uploading";
  const duration = projectDuration(project);

  const start = async () => {
    const unsupported = await canExportInBrowser();
    if (unsupported) {
      setStage({ kind: "error", message: unsupported });
      return;
    }
    controller.current = new AbortController();
    const startedAt = Date.now();
    setStage({ kind: "rendering", progress: { phase: "prepare", ratio: 0 }, startedAt });
    try {
      await ensureFonts();
      const { blob, durationMs } = await exportProject(project, {
        signal: controller.current.signal,
        onProgress: (progress) => setStage({ kind: "rendering", progress, startedAt }),
      });
      setStage({ kind: "uploading", ratio: 0 });
      const result = await saveExport(project, blob, durationMs, (ratio) =>
        setStage({ kind: "uploading", ratio })
      );
      setStage({ kind: "done", result });
    } catch (error: any) {
      if (error?.name === "AbortError") setStage({ kind: "ready" });
      else setStage({ kind: "error", message: error?.message ?? "Export impossible" });
    }
  };

  const ratio =
    stage.kind === "rendering" ? stage.progress.ratio : stage.kind === "uploading" ? stage.ratio : 0;
  const remaining =
    stage.kind === "rendering" && stage.progress.phase === "video" && stage.progress.ratio > 0.03
      ? Math.round(((Date.now() - stage.startedAt) / stage.progress.ratio) * (1 - stage.progress.ratio) / 1000)
      : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Exporter le clip</DialogTitle>
          <DialogDescription>
            MP4 {project.width} × {project.height}, {project.fps} i/s, {formatTimecode(duration, project.fps)}.
            Le rendu se fait dans ce navigateur&nbsp;: gardez l&apos;onglet ouvert.
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={stage.kind}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {stage.kind === "ready" && (
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
                <Film className="h-8 w-8 text-primary" />
                <p className="text-sm text-muted-foreground">
                  Chaque image est calculée exactement comme dans l&apos;aperçu,
                  puis encodée en H.264 avec le son mixé.
                </p>
              </div>
            )}

            {(stage.kind === "rendering" || stage.kind === "uploading") && (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">
                    {stage.kind === "uploading" ? "Enregistrement sur le serveur" : PHASE_LABELS[stage.progress.phase]}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {Math.round(ratio * 100)} %
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${ratio * 100}%` }} transition={{ ease: "linear", duration: 0.2 }} />
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {stage.kind === "rendering" && stage.progress.totalFrames
                    ? `Image ${stage.progress.frame} sur ${stage.progress.totalFrames}`
                    : " "}
                  {remaining !== null && ` · environ ${remaining} s restantes`}
                </p>
              </div>
            )}

            {stage.kind === "done" && (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Clip prêt, {(stage.result.sizeBytes / 1024 / 1024).toFixed(1)} Mo
                </p>
                <video
                  src={exportUrl(stage.result.file)}
                  controls
                  autoPlay
                  className="max-h-[50vh] w-full rounded-lg bg-black"
                />
              </div>
            )}

            {stage.kind === "error" && (
              <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {stage.message}
              </p>
            )}
          </motion.div>
        </AnimatePresence>

        <DialogFooter>
          {stage.kind === "rendering" && (
            <Button variant="outline" onClick={() => controller.current?.abort()}>
              Annuler
            </Button>
          )}
          {(stage.kind === "ready" || stage.kind === "error") && (
            <Button onClick={start} className="gap-2">
              <Film className="h-4 w-4" />
              {stage.kind === "error" ? "Réessayer" : "Lancer l'export"}
            </Button>
          )}
          {stage.kind === "done" && (
            <Button asChild className="gap-2">
              <a href={exportUrl(stage.result.file)} download={`${project.name}.mp4`}>
                <Download className="h-4 w-4" />
                Télécharger
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
