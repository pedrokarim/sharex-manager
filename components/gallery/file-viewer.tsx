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
  Wand2,
} from "lucide-react";
import Image from "next/image";
import { format, parseISO } from "date-fns";
import { useDateLocale } from "@/lib/i18n/date-locales";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Separator } from "../ui/separator";
import { VisuallyHidden } from "../ui/visually-hidden";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";
import { ModuleActions } from "./module-actions";
import { getGalleryImageUrl, getFileStoragePath } from "@/lib/utils/url";

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
  const [showInfo, setShowInfo] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

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

  const handleProcessImage = async () => {
    if (!file) return;

    try {
      setIsProcessing(true);

      const response = await fetch("/api/gallery/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileName: file.name }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erreur lors du traitement de l'image");
      }

      // Recharger l'image en ajoutant un paramètre timestamp pour éviter le cache
      const imgElement = document.querySelector(
        ".file-viewer-image"
      ) as HTMLImageElement;
      if (imgElement) {
        const timestamp = new Date().getTime();
        imgElement.src = `${file.url}?t=${timestamp}`;
      }

      toast.success("Image traitée avec succès");
    } catch (error) {
      console.error("Erreur lors du traitement de l'image:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Erreur lors du traitement de l'image"
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Fonction pour recharger l'image après traitement
  const handleProcessComplete = () => {
    // Recharger l'image en ajoutant un paramètre timestamp pour éviter le cache
    const imgElement = document.querySelector(
      ".file-viewer-image"
    ) as HTMLImageElement;
    if (imgElement && file) {
      const timestamp = new Date().getTime();
      imgElement.src = `${file.url}?t=${timestamp}`;
    }
  };

  return (
    <Dialog open={!!file} onOpenChange={() => file && onClose()}>
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
                className="object-contain file-viewer-image"
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

            {/* Modules en haut à droite */}
            <div className="absolute top-4 right-4 z-10 flex justify-end">
              {/* Afficher les actions des modules si le fichier est une image */}
              {file && (
                <ModuleActions
                  file={file}
                  onProcessComplete={handleProcessComplete}
                  variant="overlay"
                />
              )}
            </div>

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
                  className="rounded-full bg-background/50 hover:bg-red-600 hover:text-white"
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

          {/* Panneau latéral pour les détails */}
          {showDetails && (
            <div className="w-80 bg-background/95 p-4 overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">
                {t("gallery.file_viewer.details")}
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("gallery.file_viewer.name")}
                  </p>
                  <p className="text-sm">{file.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("gallery.file_viewer.date")}
                  </p>
                  <p className="text-sm">{formattedDateTime}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("gallery.file_viewer.size")}
                  </p>
                  <p className="text-sm">{fileSize} KB</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("gallery.file_viewer.url")}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm truncate">
                      {getGalleryImageUrl(file.name)}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() =>
                        file && onCopy(getGalleryImageUrl(file.name))
                      }
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("gallery.file_viewer.path")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {getFileStoragePath(file.name)}
                  </p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    {t("gallery.file_viewer.actions")}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        file && onCopy(getGalleryImageUrl(file.name))
                      }
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {t("gallery.file_viewer.copy_url")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      asChild
                    >
                      <a
                        href={getGalleryImageUrl(file.name)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        {t("gallery.file_viewer.open")}
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "w-full",
                        file?.isSecure && "border-yellow-500 text-yellow-500"
                      )}
                      onClick={() => file && onToggleSecurity(file)}
                    >
                      {file?.isSecure ? (
                        <>
                          <Lock className="h-4 w-4 mr-2" />
                          {t("gallery.file_viewer.secured")}
                        </>
                      ) : (
                        <>
                          <Unlock className="h-4 w-4 mr-2" />
                          {t("gallery.file_viewer.public")}
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "w-full",
                        file?.isStarred && "border-yellow-500 text-yellow-500"
                      )}
                      onClick={() => file && onToggleStar(file)}
                    >
                      <Star className="h-4 w-4 mr-2" />
                      {file?.isStarred
                        ? t("gallery.file_viewer.starred")
                        : t("gallery.file_viewer.star")}
                    </Button>
                  </div>
                </div>
                <Separator />
                <div>
                  {file && (
                    <ModuleActions
                      file={file}
                      onProcessComplete={handleProcessComplete}
                      variant="details"
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
