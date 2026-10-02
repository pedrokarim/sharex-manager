"use client";

import { DragEvent, useState } from "react";
import Image from "next/image";
import { VideoThumbnail } from "@/components/gallery/video-thumbnail";
import { GalleryProvenanceBadge } from "@/components/gallery/gallery-provenance";
import { isVideoFile } from "@/lib/media-kind";
import { formatDistanceToNow } from "date-fns";
import { useDateLocale } from "@/lib/i18n/date-locales";
import {
  Lock,
  Unlock,
  Trash2,
  Download,
  Copy,
  ExternalLink,
  Star,
} from "lucide-react";
import { useAtom } from "jotai";
import { useQueryState } from "nuqs";
import {
  showFileInfoAtom,
  showFileSizeAtom,
  showUploadDateAtom,
  showThumbnailsAtom,
} from "@/lib/atoms/preferences";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DownloadMenu } from "@/components/gallery/download-menu";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { FileInfo } from "@/types/files";
import { getGalleryImageUrl } from "@/lib/utils/url";
import type { ThumbnailSize } from "@/lib/atoms/preferences";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";

interface FileCardProps {
  file: FileInfo;
  onDelete?: () => void;
  onCopy?: () => void;
  onSelect?: () => void;
  onToggleSecurity?: () => void;
  onToggleStar?: () => void;
  isNew?: boolean;
  size?: ThumbnailSize;
  albumIndicator?: React.ReactNode;
}

export function FileCard({
  file,
  onDelete,
  onCopy,
  onSelect,
  onToggleSecurity,
  onToggleStar,
  isNew,
  size = "medium",
  albumIndicator,
}: FileCardProps) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [defaultShowFileInfo] = useAtom(showFileInfoAtom);
  const [defaultShowFileSize] = useAtom(showFileSizeAtom);
  const [defaultShowUploadDate] = useAtom(showUploadDateAtom);
  const [defaultShowThumbnails] = useAtom(showThumbnailsAtom);

  const [showFileInfo] = useQueryState("info", {
    defaultValue: defaultShowFileInfo,
    parse: (value): boolean => {
      if (value === "true" || value === "false") {
        return value === "true";
      }
      return defaultShowFileInfo;
    },
  });

  const [showFileSize] = useQueryState("size-info", {
    defaultValue: defaultShowFileSize,
    parse: (value): boolean => {
      if (value === "true" || value === "false") {
        return value === "true";
      }
      return defaultShowFileSize;
    },
  });

  const [showUploadDate] = useQueryState("date-info", {
    defaultValue: defaultShowUploadDate,
    parse: (value): boolean => {
      if (value === "true" || value === "false") {
        return value === "true";
      }
      return defaultShowUploadDate;
    },
  });

  const [showThumbnails] = useQueryState("thumbnails", {
    defaultValue: defaultShowThumbnails,
    parse: (value): boolean => {
      if (value === "true" || value === "false") {
        return value === "true";
      }
      return defaultShowThumbnails;
    },
  });

  const aspectRatioClasses = {
    small: "aspect-square",
    medium: "aspect-video",
    large: "aspect-[4/3]",
    tiny: "aspect-square",
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      const response = await fetch(
        `/api/files?id=${encodeURIComponent(file.name)}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        throw new Error("Erreur lors de la suppression");
      }

      toast.success(t("gallery.file_card.delete_success"));
      onDelete?.();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      toast.error(t("gallery.file_card.delete_error"));
    } finally {
      setIsDeleting(false);
    }
  };

  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
  const isVideo = isVideoFile(file.name);

  /**
   * La vignette de la grille passe par /api/thumbnails (300 px, mis en cache un
   * an) et non par le fichier d'origine : une grille de captures en pleine
   * résolution représente plusieurs dizaines de mégaoctets pour un rendu de
   * quelques centaines de pixels de côté.
   *
   * En cas d'échec (format non géré par la route), on retombe sur le fichier
   * d'origine plutôt que d'afficher une case vide.
   */
  const [thumbFailed, setThumbFailed] = useState(false);
  /** La vignette est arrivée : elle remplace alors la case d'attente, en fondu. */
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const previewUrl =
    isImage && !thumbFailed
      ? `/api/thumbnails/${encodeURIComponent(file.name)}`
      : file.url;

  const preventNativeImageDrag = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
  };

  /** Bouton d'action posé sur l'image : discret, lisible sur n'importe quel fond. */
  const overlayButton =
    cn(
    "flex items-center justify-center rounded-lg bg-black/55 text-white backdrop-blur-md transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
    // Sur les petites vignettes, quatre boutons doivent tenir dans la largeur.
    size === "small" || size === "tiny" ? "h-7 w-7" : "h-8 w-8",
  );
  /** Caché au repos, révélé au survol de la carte, au clavier, ou tant qu'un de ses menus est ouvert. */
  const revealed =
    "opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100";

  return (
    <Card
      className={cn(
        // py-0 gap-0 : depuis shadcn v4, Card porte py-6 et gap-6 en dur.
        // Sans ces annulations, une bande vide apparaît au-dessus de l'image
        // même avec un CardHeader en p-0.
        "group/card gap-0 overflow-hidden py-0 transition-all duration-500",
        isNew && "animate-in fade-in-0 zoom-in-95",
      )}
    >
      <CardHeader className="p-0">
        <div
          role="button"
          tabIndex={0}
          className={cn(
            "relative w-full bg-muted cursor-pointer",
            aspectRatioClasses[size],
          )}
          onClick={onSelect}
          onDragStart={preventNativeImageDrag}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect?.();
            }
          }}
        >
          {onToggleStar && (
            <button
              type="button"
              aria-label={t(file.isStarred ? "gallery.file_card.actions.unstar" : "gallery.file_card.actions.star")}
              title={t(file.isStarred ? "gallery.file_card.actions.unstar" : "gallery.file_card.actions.star")}
              onClick={(e) => {
                e.stopPropagation();
                onToggleStar();
              }}
              className={cn(
                overlayButton,
                "absolute top-2 right-2 z-10",
                // Un favori reste marqué ; l'étoile vide n'apparaît qu'au survol.
                file.isStarred ? "bg-yellow-500/80 hover:bg-yellow-500" : revealed,
              )}
            >
              <Star className={cn("h-4 w-4", file.isStarred && "fill-current")} />
            </button>
          )}

          {/* La pastille cède la place aux actions quand elles apparaissent. */}
          <GalleryProvenanceBadge
            name={file.name}
            className="bottom-2 left-2 transition-opacity duration-150 group-hover/card:opacity-0"
          />

          {isImage ? (
            showThumbnails ? (
              <>
              {!thumbLoaded && <div aria-hidden className="absolute inset-0 animate-pulse bg-foreground/10" />}
              <Image
                src={previewUrl}
                alt={file.name}
                fill
                draggable={false}
                onDragStart={preventNativeImageDrag}
                onError={() => setThumbFailed(true)}
                onLoad={() => setThumbLoaded(true)}
                loading="lazy"
                className={cn("object-cover transition-opacity duration-300", thumbLoaded ? "opacity-100" : "opacity-0")}
                sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 16vw"
              />
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <span className="text-2xl font-bold">IMG</span>
              </div>
            )
          ) : isVideo && showThumbnails ? (
            <VideoThumbnail name={file.name} durationMs={file.durationMs} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-2xl font-bold">
                {file.name.split(".").pop()?.toUpperCase()}
              </span>
            </div>
          )}

          {/* Actions : elles ne chargent pas la grille, elles viennent au survol. */}
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-end gap-1 bg-gradient-to-t from-black/50 to-transparent p-2 pt-8",
              revealed,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-auto flex gap-1">
              <DownloadMenu file={file}>
                <button
                  type="button"
                  aria-label={t("gallery.file_card.actions.download")}
                  title={t("gallery.file_card.actions.download")}
                  className={overlayButton}
                >
                  <Download className="h-4 w-4" />
                </button>
              </DownloadMenu>
              {onCopy && (
                <button
                  type="button"
                  aria-label={t("gallery.file_card.actions.copy")}
                  title={t("gallery.file_card.actions.copy")}
                  className={overlayButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopy();
                  }}
                >
                  <Copy className="h-4 w-4" />
                </button>
              )}
              <a
                href={getGalleryImageUrl(file.name)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("gallery.file_card.actions.open")}
                title={t("gallery.file_card.actions.open")}
                className={overlayButton}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
              <button
                type="button"
                aria-label={t("gallery.file_card.actions.delete")}
                title={t("gallery.file_card.actions.delete")}
                disabled={isDeleting}
                className={cn(overlayButton, "hover:bg-destructive")}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </CardHeader>
      {showFileInfo && (
        <CardContent className={cn("px-3 py-2.5", size === "small" && "p-2")}>
          <div className="min-w-0">
            <div className="flex items-start gap-2">
              <p
                className={cn(
                  "min-w-0 flex-1 line-clamp-1 text-sm font-medium",
                )}
                title={file.name}
              >
                {file.name}
              </p>
              {onToggleSecurity && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t(file.isSecure ? "gallery.file_card.actions.make_public" : "gallery.file_card.actions.make_private")}
                  title={t(file.isSecure ? "gallery.file_card.actions.make_public" : "gallery.file_card.actions.make_private")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSecurity();
                  }}
                  className={cn(
                    "mt-0.5 h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground",
                    size === "small" && "mt-0 h-6 w-6",
                    file.isSecure
                      ? "text-amber-500 hover:text-amber-500"
                      : "opacity-0 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100",
                  )}
                >
                  {file.isSecure ? (
                    <Lock
                      className={cn(
                        "h-4 w-4",
                        size === "small" && "h-3 w-3",
                      )}
                    />
                  ) : (
                    <Unlock
                      className={cn(
                        "h-4 w-4",
                        size === "small" && "h-3 w-3",
                      )}
                    />
                  )}
                </Button>
              )}
            </div>
            {(showFileSize || showUploadDate) && (
              <div
                className={cn(
                  "mt-0.5 flex items-center gap-2 text-xs text-muted-foreground",
                  size === "small" && "text-[11px]",
                )}
              >
                <p className="min-w-0 truncate">
                  {[
                    showFileSize ? formatBytes(file.size) : null,
                    showUploadDate
                      ? formatDistanceToNow(new Date(file.createdAt), { addSuffix: true, locale })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {albumIndicator && <>{albumIndicator}</>}
              </div>
            )}
          </div>
        </CardContent>
      )}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("gallery.file_card.delete_confirmation.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("gallery.file_card.delete_confirmation.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("gallery.file_card.delete_confirmation.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t("gallery.file_card.delete_confirmation.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
