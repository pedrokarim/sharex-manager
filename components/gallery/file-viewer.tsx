"use client";

import { FileInfo } from "@/types/files";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import {
  Copy,
  ExternalLink,
  Trash2,
  X,
  ChevronRight,
  ChevronLeft,
  Info,
  Lock,
  Unlock,
  Star,
} from "lucide-react";
import Image from "next/image";
import { format, parseISO } from "date-fns";
import { useDateLocale } from "@/lib/i18n/date-locales";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Separator } from "../ui/separator";
import { VisuallyHidden } from "../ui/visually-hidden";
import { useTranslation } from "@/lib/i18n";

interface FileViewerProps {
  file: FileInfo | null;
  onClose: () => void;
  onDelete: (filename: string) => Promise<void>;
  onCopy: (url: string) => void;
  onToggleSecurity: (file: FileInfo) => Promise<void>;
  onToggleStar: (file: FileInfo) => Promise<void>;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}

export function FileViewer({
  file,
  onClose,
  onDelete,
  onCopy,
  onToggleSecurity,
  onToggleStar,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: FileViewerProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { t } = useTranslation();
  const locale = useDateLocale();

  if (!file) return null;

  const formattedDate = format(parseISO(file.createdAt), "dd MMMM yyyy", {
    locale,
  });
  const formattedDateTime = format(
    parseISO(file.createdAt),
    "dd MMMM yyyy à HH:mm",
    { locale }
  );
  const fileSize = (file.size / 1024).toFixed(2);

  // Construire le texte d'accessibilité
  let navigationText = "";
  if (hasPrevious) {
    navigationText += t("gallery.file_viewer.previous_button") + " ";
  }
  if (hasNext) {
    navigationText += t("gallery.file_viewer.next_button");
  }

  return (
    <Dialog open={!!file} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-7xl border-none bg-background/95 p-0 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between p-4">
            <span>{file.name}</span>
          </DialogTitle>
        </DialogHeader>
        <DialogDescription>
          <VisuallyHidden>
            {t("gallery.file_viewer.accessibility", {
              date: formattedDate,
              size: fileSize,
              navigation: navigationText,
            })}
          </VisuallyHidden>
        </DialogDescription>
        <div className="relative flex h-[85vh] overflow-hidden rounded-lg">
          {/* Zone principale */}
          <div className="relative flex-1">
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <Image
                src={file.url}
                alt={file.name}
                fill
                className="object-contain"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 75vw, 60vw"
                priority
              />
            </div>

            {/* Boutons de navigation */}
            {hasPrevious && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-background/50 hover:bg-background/80"
                onClick={onPrevious}
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
            )}
            {hasNext && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-background/50 hover:bg-background/80"
                onClick={onNext}
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            )}

            {/* Barre d'actions flottante en bas */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-4 bg-gradient-to-t from-background/80 to-transparent p-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full bg-background/50 hover:bg-blue-600 hover:text-white text-blue-600"
                  onClick={() => setShowDetails(!showDetails)}
                >
                  <Info className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "rounded-full bg-background/50 hover:bg-yellow-500 hover:text-white",
                    file?.isStarred && "text-yellow-500"
                  )}
                  onClick={() => file && onToggleStar(file)}
                >
                  <Star className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full bg-background/50 hover:bg-background/80"
                  onClick={() => file && onCopy(file.url)}
                >
                  <Copy className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full bg-background/50 hover:bg-background/80"
                  asChild
                >
                  <a href={file?.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-5 w-5" />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "rounded-full bg-background/50",
                    file?.isSecure &&
                      "text-yellow-500 hover:bg-yellow-500 hover:text-white"
                  )}
                  onClick={() => file && onToggleSecurity(file)}
                >
                  {file?.isSecure ? (
                    <Lock className="h-4 w-4" />
                  ) : (
                    <Unlock className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full bg-background/50 hover:bg-red-600 hover:text-white text-red-600"
                  onClick={() => file && onDelete(file.name)}
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full bg-background/50 hover:bg-background/80"
                  onClick={onClose}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Panneau latéral */}
          <div
            className={cn(
              "h-full w-[400px] bg-background p-6 shadow-lg transition-all duration-300",
              !showDetails && "w-0 p-0 opacity-0"
            )}
          >
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold">
                  {t("gallery.file_viewer.info_panel.title")}
                </h3>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("gallery.file_viewer.info_panel.filename")}
                    </p>
                    <p className="mt-1 font-medium">{file.name}</p>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("gallery.file_viewer.info_panel.date_added")}
                    </p>
                    <p className="mt-1 font-medium">{formattedDateTime}</p>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("gallery.file_viewer.info_panel.size")}
                    </p>
                    <p className="mt-1 font-medium">
                      {fileSize} {t("gallery.file_viewer.info_panel.kb")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
