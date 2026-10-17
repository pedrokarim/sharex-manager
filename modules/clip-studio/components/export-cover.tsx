"use client";

/**
 * Couverture d'un export (dossier 01 ter, § 3.2) : l'image du clip au
 * curseur du lecteur, capturée dans un canevas puis envoyée, ou une image
 * choisie par le sélecteur commun (galerie, modules, ordinateur, lien). Elle
 * sert de miniature, de couverture de Reel ou de vidéo quand le service
 * l'accepte.
 */

import { useState } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ImagePickerDialog, type PickedImage } from "@/components/gallery/image-picker-dialog";
import type { ClipExport } from "../engine/types";
import { exportUrl, removeExportCover, setExportCoverFromGallery, setExportCoverFromImage } from "../lib/client";
import { formatDuration } from "./publish-shared";

/** Image affichée par une vidéo à son instant courant, en PNG. */
function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return Promise.reject(new Error("La vidéo n’est pas encore prête."));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("Capture impossible dans ce navigateur."));
  context.drawImage(video, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Capture impossible."))), "image/png"));
}

export function ExportCover({
  entry,
  video,
  onChanged,
  disabled,
}: {
  entry: ClipExport;
  /** Lecteur de la fiche : l'image au curseur y est prise. */
  video: () => HTMLVideoElement | null;
  onChanged: (entry: ClipExport) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState<"frame" | "pick" | "remove" | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const cover = entry.cover;
  const ratio = cover ? cover.width / cover.height : entry.width && entry.height ? entry.width / entry.height : 16 / 9;

  const run = async (kind: "frame" | "pick" | "remove", action: () => Promise<ClipExport>, success: string) => {
    setBusy(kind);
    try {
      onChanged(await action());
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couverture impossible");
    } finally {
      setBusy(null);
    }
  };

  const fromFrame = () => {
    const element = video();
    if (!element) return;
    element.pause();
    const atMs = Math.round(element.currentTime * 1000);
    void run("frame", async () => setExportCoverFromImage(entry.id, await captureFrame(element), atMs), "Couverture prise dans le clip");
  };

  const fromPicked = (image: PickedImage) => {
    setPickerOpen(false);
    void run(
      "pick",
      async () => {
        if (image.kind === "gallery") return setExportCoverFromGallery(entry.id, image.name);
        if (image.kind === "file") return setExportCoverFromImage(entry.id, image.file);
        const response = await fetch(image.url).catch(() => null);
        if (!response?.ok) throw new Error("Cette image ne peut pas être lue depuis ce lien : enregistrez-la dans la galerie d’abord.");
        return setExportCoverFromImage(entry.id, await response.blob());
      },
      "Couverture choisie"
    );
  };

  return (
    <section className="grid min-w-0 gap-3" aria-labelledby="export-cover">
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <h2 id="export-cover" className="text-sm font-semibold">
          Couverture
        </h2>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {cover ? (cover.atMs !== undefined ? `Image du clip à ${formatDuration(cover.atMs)}` : "Image choisie") : "Aucune : chaque service prend la sienne"}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-start gap-4">
        <div className="flex w-32 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted" style={{ aspectRatio: `${ratio}` }}>
          {busy && busy !== "remove" ? (
            <Spinner className="size-5 text-muted-foreground" />
          ) : cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- fichier du module, déjà à la bonne taille
            <img src={exportUrl(cover.file)} alt="Couverture de l’export" className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-5 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="grid min-w-0 flex-1 basis-48 grid-cols-[minmax(0,1fr)] content-start gap-2">
          <Button type="button" variant="outline" size="sm" className="h-auto min-h-8 justify-start gap-2 py-1.5 text-left whitespace-normal" onClick={fromFrame} disabled={disabled || busy !== null}>
            <Camera className="size-4" />
            Image au curseur du lecteur
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-auto min-h-8 justify-start gap-2 py-1.5 text-left whitespace-normal" onClick={() => setPickerOpen(true)} disabled={disabled || busy !== null}>
            <ImagePlus className="size-4" />
            Choisir une image…
          </Button>
          {cover ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto min-h-8 justify-start gap-2 py-1.5 text-left whitespace-normal text-muted-foreground"
              onClick={() => void run("remove", () => removeExportCover(entry.id), "Couverture retirée")}
              disabled={disabled || busy !== null}
            >
              <Trash2 className="size-4" />
              Retirer
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-pretty text-muted-foreground">Recadrée au format de la vidéo ; utilisée comme miniature ou couverture par les services qui l’acceptent.</p>
      <ImagePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onPick={fromPicked} title="Couverture de l’export" description="Recadrée au format de la vidéo." />
    </section>
  );
}
