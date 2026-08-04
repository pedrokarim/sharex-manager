"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Download,
  ImageDown,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { getModelSpec } from "../lib/models";
import {
  callModule,
  downloadImage,
  formatDuration,
  imageUrl,
  type HistoryItem,
} from "../lib/client";

/** Une image précise au sein d'une génération. */
export interface Shot {
  item: HistoryItem;
  file: string;
}

interface ImageViewerProps {
  shots: Shot[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
  /** Appelé après suppression ou copie en galerie, pour rafraîchir l'appelant. */
  onMutate?: () => void;
}

export function ImageViewer({
  shots,
  index,
  onIndexChange,
  onMutate,
}: ImageViewerProps) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const open = index !== null && index >= 0 && index < shots.length;
  const shot = open ? shots[index] : null;

  const go = useCallback(
    (delta: number) => {
      if (index === null || shots.length === 0) return;
      // On boucle : arriver au bout d'un lot de 4 sans pouvoir revenir au
      // début oblige à ressortir de la visionneuse pour rien.
      onIndexChange((index + delta + shots.length) % shots.length);
    },
    [index, shots.length, onIndexChange]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  useEffect(() => {
    setCopied(false);
  }, [index]);

  if (!shot) return null;

  const { item, file } = shot;
  const spec = getModelSpec(item.model);
  const alreadyInGallery = Boolean(item.savedToGallery?.[file]);

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(item.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async () => {
    try {
      await downloadImage(imageUrl(file), file);
    } catch {
      toast.error("Téléchargement impossible");
    }
  };

  const handleSaveToGallery = async () => {
    setBusy(true);
    try {
      const result = await callModule<{ fileName?: string }>(
        "saveToGallery",
        item.id,
        file
      );
      toast.success(`Ajoutée à la galerie : ${result?.fileName ?? file}`);
      onMutate?.();
    } catch (error: any) {
      toast.error(error?.message ?? "Copie impossible");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await callModule("deleteImage", item.id, file);
      toast.success("Image supprimée");
      // La liste rétrécit : rester sur le même index afficherait la suivante,
      // sauf si on était sur la dernière.
      const next = shots.length <= 1 ? null : Math.min(index!, shots.length - 2);
      onIndexChange(next);
      onMutate?.();
    } catch (error: any) {
      toast.error(error?.message ?? "Suppression impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onIndexChange(null)}
    >
      <DialogContent
        showCloseButton
        className="max-w-[min(96vw,1200px)] gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1200px)]"
      >
        <VisuallyHidden>
          <DialogTitle>Image générée</DialogTitle>
          <DialogDescription>{item.prompt}</DialogDescription>
        </VisuallyHidden>

        <div className="grid max-h-[90vh] grid-rows-[1fr_auto] md:grid-cols-[minmax(0,1fr)_320px] md:grid-rows-1">
          {/* Visuel */}
          <div className="relative flex min-h-0 items-center justify-center bg-muted/40 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl(file)}
              alt={item.prompt}
              className="max-h-[52vh] w-auto max-w-full rounded-lg object-contain shadow-sm md:max-h-[86vh]"
            />

            {shots.length > 1 && (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Image précédente"
                  onClick={() => go(-1)}
                  className="absolute left-3 h-9 w-9 rounded-full opacity-80 hover:opacity-100"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Image suivante"
                  onClick={() => go(1)}
                  className="absolute right-3 h-9 w-9 rounded-full opacity-80 hover:opacity-100"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="absolute bottom-3 rounded-full bg-background/90 px-2.5 py-1 text-xs tabular-nums text-muted-foreground">
                  {index! + 1} / {shots.length}
                </span>
              </>
            )}
          </div>

          {/* Détail */}
          <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t p-5 md:border-l md:border-t-0">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Prompt
              </p>
              <p className="text-sm leading-6">{item.prompt}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyPrompt}
                className="w-full gap-2"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copié
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copier le prompt
                  </>
                )}
              </Button>
            </div>

            {item.revisedPrompt && item.revisedPrompt !== item.prompt && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Réécrit par le modèle
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  {item.revisedPrompt}
                </p>
              </div>
            )}

            {item.notes && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Notes appliquées
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  {item.notes}
                </p>
              </div>
            )}

            <Separator />

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Modèle</dt>
                <dd className="mt-0.5 font-medium">
                  {spec?.label ?? item.model}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Taille</dt>
                <dd className="mt-0.5 font-mono text-xs">{item.size}</dd>
              </div>
              {item.quality && (
                <div>
                  <dt className="text-xs text-muted-foreground">Qualité</dt>
                  <dd className="mt-0.5 capitalize">{item.quality}</dd>
                </div>
              )}
              {formatDuration(item.durationMs) && (
                <div>
                  <dt className="text-xs text-muted-foreground">Durée</dt>
                  <dd className="mt-0.5 tabular-nums">
                    {formatDuration(item.durationMs)}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">Date</dt>
                <dd className="mt-0.5 text-xs tabular-nums">
                  {new Date(item.createdAt).toLocaleString("fr-FR")}
                </dd>
              </div>
            </dl>

            {(item.usedReference || alreadyInGallery) && (
              <div className="flex flex-wrap gap-1.5">
                {item.usedReference && (
                  <Badge variant="secondary">Image de référence</Badge>
                )}
                {alreadyInGallery && <Badge variant="secondary">En galerie</Badge>}
              </div>
            )}

            <div className="mt-auto flex flex-col gap-2 pt-2">
              <Button onClick={handleDownload} className="w-full gap-2">
                <Download className="h-4 w-4" />
                Télécharger
              </Button>
              <Button
                variant="outline"
                onClick={handleSaveToGallery}
                disabled={busy || alreadyInGallery}
                className="w-full gap-2"
              >
                <ImageDown className="h-4 w-4" />
                {alreadyInGallery ? "Déjà en galerie" : "Ajouter à la galerie"}
              </Button>
              <Button
                variant="ghost"
                onClick={handleDelete}
                disabled={busy}
                className="w-full gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </Button>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
