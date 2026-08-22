"use client";

import { useState } from "react";
import {
  Copy,
  Download,
  ImageDown,
  Layers,
  MoreHorizontal,
  Repeat2,
  Star,
  Trash2,
  Wand2,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  aspectRatioOf,
  callModule,
  downloadImage,
  formatDuration,
  imageUrl,
  timeAgo,
  type Collection,
  type HistoryItem,
} from "../lib/client";

interface GenerationCardProps {
  item: HistoryItem;
  collection?: Collection;
  /** Ouvre la visionneuse sur une image précise du lot. */
  onOpen: (item: HistoryItem, fileIndex: number) => void;
  /** Relance la même demande, éventuellement modifiée. */
  onReuse?: (item: HistoryItem) => void;
  /** Décline l'image en variantes. */
  onVariants?: (item: HistoryItem, file: string) => void;
  /** Reprend l'image comme point de départ dans le compositeur. */
  onUseAsReference?: (item: HistoryItem, file: string) => void;
  onMutate?: () => void;
  compact?: boolean;
}

export function GenerationCard({
  item,
  collection,
  onOpen,
  onReuse,
  onVariants,
  onUseAsReference,
  onMutate,
  compact,
}: GenerationCardProps) {
  const [busy, setBusy] = useState(false);
  const [favorite, setFavorite] = useState(Boolean(item.favorite));
  const ratio = aspectRatioOf(item.size);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (error: any) {
      toast.error(error?.message ?? "Action impossible");
    } finally {
      setBusy(false);
    }
  };

  const handleFavorite = () =>
    run(async () => {
      const result = await callModule<{ favorite: boolean }>(
        "toggleFavorite",
        item.id
      );
      setFavorite(result.favorite);
    });

  const handleGallery = (file: string) =>
    run(async () => {
      const result = await callModule<{ fileName?: string }>(
        "sendToGallery",
        item.id,
        file
      );
      toast.success(`Ajoutée à la galerie : ${result?.fileName ?? file}`);
      onMutate?.();
    });

  const handleUpscale = (file: string) =>
    run(async () => {
      const result = await callModule<{ file?: string }>(
        "upscale",
        item.id,
        file,
        2
      );
      toast.success(`Agrandie : ${result?.file}`);
      onMutate?.();
    });

  const handleDelete = () =>
    run(async () => {
      await callModule("deleteHistoryItem", item.id);
      toast.success("Génération supprimée");
      onMutate?.();
    });

  return (
    <article className="group/card overflow-hidden rounded-xl border bg-card">
      <div
        className={cn(
          "grid gap-px bg-border",
          item.imageFiles.length > 1 ? "grid-cols-2" : "grid-cols-1"
        )}
      >
        {item.imageFiles.map((file, index) => (
          <div
            key={file}
            className="group/shot relative bg-muted/40"
            style={{ aspectRatio: item.imageFiles.length > 1 ? "1" : ratio }}
          >
            <button
              type="button"
              onClick={() => onOpen(item, index)}
              className="block h-full w-full"
              aria-label={`Agrandir l'image ${index + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl(file)}
                alt={item.prompt}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover/shot:scale-[1.02]"
              />
            </button>

            {/* Actions au survol : elles portent sur cette image précise, pas
                sur le lot entier. */}
            <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover/shot:pointer-events-auto group-hover/shot:opacity-100">
              {onVariants && (
                <ShotAction
                  label="Décliner en variantes"
                  onClick={() => onVariants(item, file)}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                </ShotAction>
              )}
              {onUseAsReference && (
                <ShotAction
                  label="Reprendre comme point de départ"
                  onClick={() => onUseAsReference(item, file)}
                >
                  <Repeat2 className="h-3.5 w-3.5" />
                </ShotAction>
              )}
              <ShotAction
                label="Agrandir ×2"
                disabled={busy}
                onClick={() => handleUpscale(file)}
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </ShotAction>
              <ShotAction
                label={
                  item.savedToGallery?.[file]
                    ? "Déjà dans la galerie"
                    : "Envoyer dans la galerie"
                }
                disabled={busy || Boolean(item.savedToGallery?.[file])}
                onClick={() => handleGallery(file)}
              >
                <ImageDown className="h-3.5 w-3.5" />
              </ShotAction>
              <ShotAction
                label="Télécharger"
                onClick={() => downloadImage(imageUrl(file), file)}
              >
                <Download className="h-3.5 w-3.5" />
              </ShotAction>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2.5 p-3">
        <p
          className={cn(
            "text-sm leading-5",
            compact ? "line-clamp-2" : "line-clamp-3"
          )}
          title={item.prompt}
        >
          {item.prompt}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
            {item.modelLabel ?? item.model}
          </Badge>
          <Badge variant="outline" className="h-5 px-1.5 font-mono text-[10px]">
            {item.size}
          </Badge>
          {collection && (
            <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px]">
              <Layers className="h-2.5 w-2.5" />
              {collection.name}
            </Badge>
          )}
          {item.usedReference && (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
              Référence
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {timeAgo(item.createdAt)}
            {formatDuration(item.durationMs)
              ? ` · ${formatDuration(item.durationMs)}`
              : ""}
          </span>

          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={favorite ? "Retirer des favoris" : "Mettre en favori"}
              disabled={busy}
              onClick={handleFavorite}
            >
              <Star
                className={cn(
                  "h-3.5 w-3.5",
                  favorite && "fill-amber-400 text-amber-400"
                )}
              />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Autres actions"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {onReuse && (
                  <DropdownMenuItem onClick={() => onReuse(item)}>
                    <Repeat2 className="mr-2 h-4 w-4" />
                    Recharger les réglages
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => {
                    void navigator.clipboard.writeText(item.prompt);
                    toast.success("Prompt copié");
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copier le prompt
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    run(async () => {
                      await callModule("sendAllToGallery", item.id);
                      toast.success("Lot envoyé dans la galerie");
                      onMutate?.();
                    })
                  }
                >
                  <ImageDown className="mr-2 h-4 w-4" />
                  Tout envoyer dans la galerie
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={handleDelete}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Supprimer la génération
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </article>
  );
}

function ShotAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
          className="h-7 w-7 rounded-md bg-background/90 shadow-sm backdrop-blur"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
