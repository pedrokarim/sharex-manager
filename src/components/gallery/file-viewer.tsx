"use client";

import { useEffect, useState } from "react";
import type { FileInfo } from "@/types/files";
import type { FileViewerPresentation } from "@/hooks/use-routed-file-viewer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Info,
  Loader2,
  Lock,
  Star,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import Image from "next/image";
import { format, parseISO } from "date-fns";
import { useDateLocale } from "@/lib/i18n/date-locales";
import { cn } from "@/lib/utils";
import { Separator } from "../ui/separator";
import { VisuallyHidden } from "../ui/visually-hidden";
import { useTranslation } from "@/lib/i18n";
import { FileAlbumsSection } from "@/components/gallery/file-albums-section";
import { toast } from "sonner";
import { ModuleActions } from "./module-actions";
import { getGalleryImageUrl, getFileStoragePath } from "@/lib/utils/url";
import { useRouter } from "next/navigation";
import { AddToAlbumDialog } from "@/components/albums/add-to-album-dialog";
import { CreateAlbumDialog } from "@/components/albums/create-album-dialog";

interface FileViewerProps {
  file: FileInfo | null;
  presentation: FileViewerPresentation;
  onPresentationChange: (presentation: FileViewerPresentation) => void;
  onClose: () => void;
  onDelete: (filename: string) => Promise<void>;
  onCopy: (url: string) => void;
  onToggleSecurity: (file: FileInfo) => Promise<void>;
  onToggleStar: (file: FileInfo) => Promise<void>;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  isLoading?: boolean;
  loadingName?: string | null;
}

interface FileViewerBodyProps extends FileViewerProps {
  showDetails: boolean;
  setShowDetails: (value: boolean) => void;
}

function shouldIgnoreViewerHotkeys(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

function FileViewerBody({
  file,
  presentation,
  onPresentationChange,
  onClose,
  onDelete,
  onCopy,
  onToggleSecurity,
  onToggleStar,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  isLoading = false,
  loadingName = null,
  showDetails,
  setShowDetails,
}: FileViewerBodyProps) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const router = useRouter();
  const [isAddToAlbumDialogOpen, setIsAddToAlbumDialogOpen] = useState(false);
  const [isCreateAlbumDialogOpen, setIsCreateAlbumDialogOpen] = useState(false);

  const fileName = file?.name ?? loadingName ?? "";
  const formattedDate = file
    ? format(parseISO(file.createdAt), "dd MMMM yyyy", {
        locale,
      })
    : null;
  const formattedDateTime = file
    ? format(parseISO(file.createdAt), "dd MMMM yyyy à HH:mm", {
        locale,
      })
    : null;
  const fileSize = file ? (file.size / 1024).toFixed(2) : null;

  let navigationText = "";
  if (hasPrevious) {
    navigationText += `${t("gallery.file_viewer.previous_button")} `;
  }
  if (hasNext) {
    navigationText += t("gallery.file_viewer.next_button");
  }

  const handleProcessComplete = () => {
    const imgElement = document.querySelector(
      ".file-viewer-image",
    ) as HTMLImageElement | null;

    if (imgElement && file) {
      const timestamp = Date.now();
      imgElement.src = `${file.url}?t=${timestamp}`;
    }
  };

  const handleViewLogs = () => {
    if (!file) {
      return;
    }

    const searchParams = new URLSearchParams();
    searchParams.set("action", "file.download");
    searchParams.set("search", file.name);
    router.push(`/admin/logs?${searchParams.toString()}`);
  };

  const handleCreateAlbumSubmit = async (data: {
    name: string;
    description?: string;
  }) => {
    if (!file) {
      return;
    }

    try {
      const response = await fetch("/api/albums", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Erreur lors de la création de l'album");
      }

      const albumData = await response.json();
      const addFileResponse = await fetch(`/api/albums/${albumData.id}/files`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileNames: [file.name],
        }),
      });

      if (!addFileResponse.ok) {
        throw new Error("Erreur lors de l'ajout du fichier à l'album");
      }

      toast.success(t("albums.create_success"));
      setIsCreateAlbumDialogOpen(false);
    } catch (error) {
      console.error("Erreur lors de la création de l'album:", error);
      toast.error(t("albums.create_error"));
    }
  };

  return (
    <>
      <div
        className={cn(
          "relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background/95",
          presentation === "fullscreen" ? "h-screen w-screen" : "h-[90vh]",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/50 bg-background/90 px-4 py-3 backdrop-blur">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold sm:text-lg">
              {fileName || t("common.loading")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              {formattedDateTime ?? t("common.loading")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center rounded-xl border border-border/60 bg-background/70 p-1 sm:flex">
              <Button
                type="button"
                variant={presentation === "fullscreen" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 rounded-lg px-3 text-xs"
                onClick={() => onPresentationChange("fullscreen")}
              >
                {t("gallery.file_viewer.presentation.fullscreen")}
              </Button>
              <Button
                type="button"
                variant={presentation === "modal" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 rounded-lg px-3 text-xs"
                onClick={() => onPresentationChange("modal")}
              >
                {t("gallery.file_viewer.presentation.modal")}
              </Button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              aria-label="Close viewer"
              className="rounded-full"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="relative flex flex-1 min-h-0 overflow-hidden">
          {isLoading && !file ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="space-y-1">
                <p className="text-sm font-medium sm:text-base">
                  {loadingName ?? t("common.loading")}
                </p>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  {t("common.loading")}
                </p>
              </div>
            </div>
          ) : file ? (
            <>
              <div
                className={cn(
                  "relative flex-1 overflow-hidden",
                  showDetails && "hidden lg:block",
                )}
              >
                <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                  <Image
                    src={file.url}
                    alt={file.name}
                    fill
                    className="object-contain file-viewer-image"
                    sizes={
                      presentation === "fullscreen"
                        ? "100vw"
                        : "(max-width: 768px) 100vw, 80vw"
                    }
                    priority
                  />
                </div>

                {hasPrevious ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Previous file"
                    className="absolute left-4 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full bg-background/60 backdrop-blur hover:bg-background/85"
                    onClick={onPrevious}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                ) : null}

                {hasNext ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Next file"
                    className="absolute right-4 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full bg-background/60 backdrop-blur hover:bg-background/85"
                    onClick={onNext}
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                ) : null}

                {/* Ancré au bas de la zone image, juste au-dessus de la barre
                    d'outils : les modules agissent sur l'image, ils se placent
                    donc contre elle plutôt que de flotter dans un coin. Le
                    conteneur ne capte pas le pointeur, seuls ses contrôles le
                    font, sinon il masquerait l'image sur toute sa largeur. */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-start">
                  <ModuleActions
                    file={file}
                    onProcessComplete={handleProcessComplete}
                    variant="overlay"
                  />
                </div>
              </div>

              {showDetails ? (
                <aside className="w-full overflow-y-auto border-l border-border/50 bg-background/95 p-4 lg:w-80">
                  <h3 className="mb-4 text-lg font-semibold">
                    {t("gallery.file_viewer.details")}
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {t("gallery.file_viewer.name")}
                      </p>
                      <p className="break-all text-sm">{file.name}</p>
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
                        <p className="truncate text-sm">
                          {getGalleryImageUrl(file.name)}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Copy URL"
                          className="h-7 w-7"
                          onClick={() => onCopy(getGalleryImageUrl(file.name))}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {t("gallery.file_viewer.path")}
                      </p>
                      <p className="break-all text-sm text-muted-foreground">
                        {getFileStoragePath(file.name)}
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleViewLogs}
                    >
                      <Info className="mr-2 h-4 w-4" />
                      {t("gallery.file_viewer.view_logs")}
                    </Button>

                    <Separator />

                    <div>
                      <p className="mb-2 text-sm font-medium text-muted-foreground">
                        {t("gallery.file_viewer.actions")}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onCopy(getGalleryImageUrl(file.name))}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          {t("gallery.file_viewer.copy_url")}
                        </Button>

                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={getGalleryImageUrl(file.name)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            {t("gallery.file_viewer.open")}
                          </a>
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            file.isSecure &&
                              "border-yellow-600 text-yellow-600 dark:border-yellow-400 dark:text-yellow-400",
                          )}
                          onClick={() => void onToggleSecurity(file)}
                        >
                          {file.isSecure ? (
                            <>
                              <Lock className="mr-2 h-4 w-4" />
                              {t("gallery.file_viewer.secured")}
                            </>
                          ) : (
                            <>
                              <Unlock className="mr-2 h-4 w-4" />
                              {t("gallery.file_viewer.public")}
                            </>
                          )}
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            file.isStarred &&
                              "border-yellow-600 text-yellow-600 dark:border-yellow-400 dark:text-yellow-400",
                          )}
                          onClick={() => void onToggleStar(file)}
                        >
                          <Star className="mr-2 h-4 w-4" />
                          {file.isStarred
                            ? t("gallery.file_viewer.starred")
                            : t("gallery.file_viewer.star")}
                        </Button>
                      </div>
                    </div>

                    <Separator />

                    <ModuleActions
                      file={file}
                      onProcessComplete={handleProcessComplete}
                      variant="details"
                    />

                    <Separator />

                    <FileAlbumsSection
                      fileName={file.name}
                      onAddToAlbum={() => setIsAddToAlbumDialogOpen(true)}
                      onCreateAlbum={() => setIsCreateAlbumDialogOpen(true)}
                    />
                  </div>
                </aside>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="border-t border-border/50 bg-background/90 px-4 py-3 backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={showDetails ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
                disabled={!file}
              >
                <Info className="mr-2 h-4 w-4" />
                {t("gallery.file_viewer.details")}
              </Button>

              <div className="flex items-center rounded-xl border border-border/60 bg-background/70 p-1 sm:hidden">
                <Button
                  type="button"
                  variant={presentation === "fullscreen" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 rounded-lg px-3 text-xs"
                  onClick={() => onPresentationChange("fullscreen")}
                >
                  {t("gallery.file_viewer.presentation.fullscreen")}
                </Button>
                <Button
                  type="button"
                  variant={presentation === "modal" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 rounded-lg px-3 text-xs"
                  onClick={() => onPresentationChange("modal")}
                >
                  {t("gallery.file_viewer.presentation.modal")}
                </Button>
              </div>

              {!showDetails && file ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Toggle favorite"
                    className={cn(file.isStarred && "text-yellow-600 dark:text-yellow-400")}
                    onClick={() => void onToggleStar(file)}
                  >
                    <Star className="h-5 w-5" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Copy URL"
                    onClick={() => onCopy(getGalleryImageUrl(file.name))}
                  >
                    <Copy className="h-5 w-5" />
                  </Button>

                  <Button variant="ghost" size="icon" aria-label="Open in new tab" asChild>
                    <a
                      href={getGalleryImageUrl(file.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-5 w-5" />
                    </a>
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Toggle security"
                    className={cn(file.isSecure && "text-yellow-600 dark:text-yellow-400")}
                    onClick={() => void onToggleSecurity(file)}
                  >
                    {file.isSecure ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      <Unlock className="h-4 w-4" />
                    )}
                  </Button>
                </>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete file"
                className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                disabled={!file}
                onClick={() => {
                  if (!file) {
                    return;
                  }

                  void onDelete(file.name);
                }}
              >
                <Trash2 className="h-5 w-5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                aria-label="Close viewer"
                onClick={onClose}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AddToAlbumDialog
        open={isAddToAlbumDialogOpen}
        onClose={() => setIsAddToAlbumDialogOpen(false)}
        selectedFiles={file ? [file.name] : []}
        onSuccess={() => {}}
      />

      <CreateAlbumDialog
        open={isCreateAlbumDialogOpen}
        onClose={() => setIsCreateAlbumDialogOpen(false)}
        onSubmit={handleCreateAlbumSubmit}
      />
    </>
  );
}

export function FileViewer({
  file,
  presentation,
  onPresentationChange,
  onClose,
  onDelete,
  onCopy,
  onToggleSecurity,
  onToggleStar,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  isLoading = false,
  loadingName = null,
}: FileViewerProps) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    setShowDetails(false);
  }, [file?.name]);

  useEffect(() => {
    if (!file && !isLoading) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        shouldIgnoreViewerHotkeys(event.target)
      ) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (!file) {
        return;
      }

      if (event.key === "ArrowLeft" && hasPrevious) {
        event.preventDefault();
        onPrevious();
        return;
      }

      if (event.key === "ArrowRight" && hasNext) {
        event.preventDefault();
        onNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [file, hasNext, hasPrevious, isLoading, onClose, onNext, onPrevious]);

  if (!file && !isLoading) {
    return null;
  }

  const formattedDate = file
    ? format(parseISO(file.createdAt), "dd MMMM yyyy")
    : null;
  const fileSize = file ? (file.size / 1024).toFixed(2) : null;
  const dialogTitle = file?.name ?? loadingName ?? t("common.loading");
  const dialogDescription = file
    ? t("gallery.file_viewer.accessibility", {
        date: formattedDate,
        size: fileSize,
        navigation: "",
      })
    : t("common.loading");

  const body = (
    <FileViewerBody
      file={file}
      presentation={presentation}
      onPresentationChange={onPresentationChange}
      onClose={onClose}
      onDelete={onDelete}
      onCopy={onCopy}
      onToggleSecurity={onToggleSecurity}
      onToggleStar={onToggleStar}
      onPrevious={onPrevious}
      onNext={onNext}
      hasPrevious={hasPrevious}
      hasNext={hasNext}
      isLoading={isLoading}
      loadingName={loadingName}
      showDetails={showDetails}
      setShowDetails={setShowDetails}
    />
  );

  if (presentation === "modal") {
    return (
      <Dialog open={Boolean(file) || isLoading} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-[96vw] gap-0 overflow-hidden border-none bg-background/95 p-0 backdrop-blur-xl [&>button]:hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl">
      <VisuallyHidden>
        <h2>{dialogTitle}</h2>
        <p>{dialogDescription}</p>
      </VisuallyHidden>
      {body}
    </div>
  );
}
