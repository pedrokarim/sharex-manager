"use client";

import { useState } from "react";
import Image from "next/image";
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
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
        }
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

  return (
    <Card
      className={cn(
        "overflow-hidden transition-all duration-500",
        isNew && "animate-in fade-in-0 zoom-in-95"
      )}
    >
      <CardHeader className="p-0">
        <div
          className={cn(
            "relative w-full bg-muted cursor-pointer",
            aspectRatioClasses[size]
          )}
          onClick={onSelect}
        >
          {onToggleStar && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onToggleStar();
              }}
              className={cn(
                "h-8 w-8 absolute top-2 right-2 z-10",
                "backdrop-blur-md border border-white/20",
                "bg-white/10 dark:bg-black/10",
                "hover:bg-white/20 dark:hover:bg-black/20",
                "transition-all duration-200",
                file.isStarred
                  ? "text-white bg-yellow-500/20 border-yellow-500/30 hover:bg-yellow-500/30"
                  : "text-white hover:text-white"
              )}
            >
              <Star
                className={cn("h-4 w-4", file.isStarred && "fill-current")}
              />
            </Button>
          )}

          {isImage ? (
            showThumbnails ? (
              <Image
                src={file.url}
                alt={file.name}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <span className="text-2xl font-bold">IMG</span>
              </div>
            )
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-2xl font-bold">
                {file.name.split(".").pop()?.toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      {showFileInfo && (
        <CardContent className={cn("p-4", size === "small" && "p-2")}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p
                className={cn(
                  "line-clamp-1 font-medium",
                  size === "small" && "text-sm"
                )}
                title={file.name}
              >
                {file.name}
              </p>
              {showFileSize && (
                <p
                  className={cn(
                    "text-sm text-muted-foreground",
                    size === "small" && "text-xs"
                  )}
                >
                  {formatBytes(file.size)}
                </p>
              )}
              {showUploadDate && (
                <div className="flex items-center gap-2">
                  <p
                    className={cn(
                      "text-sm text-muted-foreground",
                      size === "small" && "text-xs"
                    )}
                  >
                    {formatDistanceToNow(new Date(file.createdAt), {
                      addSuffix: true,
                      locale,
                    })}
                  </p>
                  {albumIndicator && <>{albumIndicator}</>}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {onToggleSecurity && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSecurity();
                  }}
                  className={cn("h-8 w-8", size === "small" && "h-6 w-6")}
                >
                  {file.isSecure ? (
                    <Lock
                      className={cn(
                        "h-4 w-4 text-muted-foreground",
                        size === "small" && "h-3 w-3"
                      )}
                    />
                  ) : (
                    <Unlock
                      className={cn(
                        "h-4 w-4 text-muted-foreground",
                        size === "small" && "h-3 w-3"
                      )}
                    />
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      )}
      <CardFooter
        className={cn(
          "grid grid-cols-4 gap-2 p-4 pt-0",
          size === "small" && "p-2 pt-0 gap-1",
          !showFileInfo && "pt-4"
        )}
      >
        <Button variant="secondary" className="w-full" asChild>
          <a href={file.url} download>
            <Download
              className={cn("mr-2 h-4 w-4", size === "small" && "mr-0 h-3 w-3")}
            />
          </a>
        </Button>
        {onCopy && (
          <Button variant="secondary" className="w-full" onClick={onCopy}>
            <Copy className={cn("h-4 w-4", size === "small" && "h-3 w-3")} />
          </Button>
        )}
        <Button variant="secondary" className="w-full" asChild>
          <a
            href={getGalleryImageUrl(file.name)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink
              className={cn("h-4 w-4", size === "small" && "h-3 w-3")}
            />
          </a>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              className="w-full"
              disabled={isDeleting}
            >
              <Trash2
                className={cn("h-4 w-4", size === "small" && "h-3 w-3")}
              />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
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
      </CardFooter>
    </Card>
  );
}
