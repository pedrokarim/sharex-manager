"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { useAtom } from "jotai";
import {
  galleryViewModeAtom,
  showFileInfoAtom,
  showFileSizeAtom,
  showUploadDateAtom,
  sortingAtom,
  autoRefreshIntervalAtom,
  enableUploadNotificationsAtom,
  showThumbnailsAtom,
  thumbnailSizeAtom,
  sortByAtom,
  sortOrderAtom,
} from "@/lib/atoms/preferences";
import { Button } from "@/components/ui/button";
import { ImageOff, RefreshCcw } from "lucide-react";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useQueryState } from "nuqs";
import { ViewSelector } from "@/components/view-selector";
import { GridView } from "@/components/gallery/grid-view";
import { ListView } from "@/components/gallery/list-view";
import { FileViewer } from "@/components/gallery/file-viewer";
import { UploadZone } from "@/components/gallery/upload-zone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { capitalize, cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { RefreshInterval } from "@/components/refresh-interval";
import { Loading } from "@/components/ui/loading";
import { SortSelector } from "@/components/sort-selector";
import { useTranslation } from "@/lib/i18n";

interface FileInfo {
  name: string;
  url: string;
  size: number;
  createdAt: string;
  isSecure?: boolean;
  isStarred?: boolean;
}

interface GroupedFiles {
  [key: string]: FileInfo[];
}

interface GalleryClientProps {
  initialFiles: FileInfo[];
  initialHasMore: boolean;
  initialView?: "grid" | "list" | "details";
  initialSearch?: string;
  initialPage: number;
  secureOnly?: boolean;
  starredOnly?: boolean;
}

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
  isSecure?: boolean;
  onSecureChange?: (isSecure: boolean) => void;
}

function UploadModal({
  isOpen,
  onClose,
  onUpload,
  isSecure,
  onSecureChange,
}: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { t } = useTranslation();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setIsUploading(true);
      await onUpload(file);
      onClose();
    } catch (error) {
      console.error("Erreur lors de l'upload:", error);
      toast.error(t("gallery.upload_zone.upload_error"));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("gallery.upload_modal.title")}</DialogTitle>
          <DialogDescription>
            {t("gallery.upload_modal.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>{t("gallery.upload_modal.file_label")}</Label>
            <Input type="file" onChange={handleFileChange} />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="secure"
              checked={isSecure}
              onCheckedChange={(checked) =>
                onSecureChange?.(checked as boolean)
              }
            />
            <Label htmlFor="secure">
              {t("gallery.upload_modal.private_file")}
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="submit"
            onClick={handleUpload}
            disabled={!file || isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("gallery.upload_modal.uploading")}
              </>
            ) : (
              t("gallery.upload_modal.upload_button")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GalleryClient({
  initialFiles,
  initialHasMore,
  initialView = "grid",
  initialSearch = "",
  initialPage,
  secureOnly = false,
  starredOnly = false,
}: GalleryClientProps) {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const [defaultViewMode, setDefaultViewMode] = useAtom(galleryViewModeAtom);
  const [showFileInfo] = useAtom(showFileInfoAtom);
  const [showFileSize] = useAtom(showFileSizeAtom);
  const [showUploadDate] = useAtom(showUploadDateAtom);
  const [sorting] = useAtom(sortingAtom);
  const [autoRefreshInterval] = useAtom(autoRefreshIntervalAtom);
  const [enableUploadNotifications] = useAtom(enableUploadNotificationsAtom);
  const [showThumbnails] = useAtom(showThumbnailsAtom);
  const [thumbnailSize] = useAtom(thumbnailSizeAtom);
  const [sortBy] = useAtom(sortByAtom);
  const [sortOrder] = useAtom(sortOrderAtom);

  const [search] = useQueryState("q");
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [page, setPage] = useState(initialPage);
  const [viewMode] = useQueryState<"grid" | "list" | "details">("view", {
    defaultValue: defaultViewMode,
    parse: (value): "grid" | "list" | "details" => {
      if (value === "grid" || value === "list" || value === "details") {
        return value;
      }
      return defaultViewMode;
    },
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newFileIds, setNewFileIds] = useState<string[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSecureUpload, setIsSecureUpload] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  useEffect(() => {
    // Simuler un temps de chargement pour une meilleure expérience utilisateur
    const timer = setTimeout(() => {
      setIsInitialLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  const fetchFiles = useCallback(
    async (page: number) => {
      try {
        const searchParams = new URLSearchParams();
        searchParams.set("page", page.toString());
        if (search) searchParams.set("q", search);
        if (secureOnly) searchParams.set("secure", "true");
        if (starredOnly) searchParams.set("starred", "true");

        const res = await fetch(`/api/files?${searchParams.toString()}`);
        const data = await res.json();
        return {
          files: data.files,
          hasMore: data.hasMore,
        };
      } catch (error) {
        console.error("Erreur lors du chargement des fichiers:", error);
        toast.error(t("gallery.errors.loading_files"));
        return {
          files: [],
          hasMore: false,
        };
      }
    },
    [search, secureOnly, starredOnly, t]
  );

  const {
    data: files,
    loading,
    ref,
    reset,
  } = useInfiniteScroll<FileInfo>({
    initialData: initialFiles,
    fetchMore: useCallback(
      async (page) => {
        const { files, hasMore } = await fetchFiles(page);
        setHasMore(hasMore);
        return files;
      },
      [fetchFiles]
    ),
    hasMore,
  });

  const handleFinishUpload = useCallback(async () => {
    const { files: newFiles, hasMore: newHasMore } = await fetchFiles(1);
    setHasMore(newHasMore);
    reset(newFiles);
  }, [fetchFiles, reset]);

  const resetSearch = useCallback(() => {
    setPage(1);
    fetchFiles(1).then(({ files, hasMore }) => {
      setHasMore(hasMore);
      // reset(files);
    });
  }, [fetchFiles]);

  useEffect(() => {
    if (search !== initialSearch && search !== undefined) {
      resetSearch();
    }
  }, [search, initialSearch, resetSearch]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const { files: newFiles, hasMore: newHasMore } = await fetchFiles(1);
      setPage(1);
      setHasMore(newHasMore);
    } catch (error) {
      console.error("Erreur lors du rafraîchissement:", error);
      toast.error(t("gallery.refresh.error"));
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchFiles, t]);

  useEffect(() => {
    if (autoRefreshInterval === 0) return;

    const timer = setInterval(() => {
      handleRefresh();
    }, autoRefreshInterval * 1000);

    return () => clearInterval(timer);
  }, [autoRefreshInterval]);

  useEffect(() => {
    const handleFilesUploaded = (event: Event) => {
      const customEvent = event as CustomEvent<{ files: FileInfo[] }>;
      const newIds = customEvent.detail.files.map((file) => file.name);
      setNewFileIds(newIds);
      handleRefresh();

      setTimeout(() => {
        setNewFileIds([]);
      }, 2000);
    };

    window.addEventListener("filesUploaded", handleFilesUploaded);
    return () => {
      window.removeEventListener("filesUploaded", handleFilesUploaded);
    };
  }, [handleRefresh]);

  useEffect(() => {
    if (status === "unauthenticated") {
      redirect("/login");
    }
  }, [status]);

  // Éviter les doublons dans les fichiers
  const uniqueFiles = useMemo(() => {
    return files.filter(
      (file, index, self) =>
        index === self.findIndex((f) => f.name === file.name)
    );
  }, [files]);

  const sortFiles = (files: FileInfo[]) => {
    return [...files].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "date":
          comparison =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "size":
          comparison = a.size - b.size;
          break;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
  };

  const sortedFiles = useMemo(
    () => sortFiles(uniqueFiles),
    [uniqueFiles, sortBy, sortOrder]
  );

  const groupedFiles = useMemo(() => {
    return sortedFiles.reduce((acc: GroupedFiles, file) => {
      const date = format(parseISO(file.createdAt), "MMMM yyyy", {
        locale: fr,
      });
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(file);
      return acc;
    }, {});
  }, [sortedFiles]);

  const findCurrentFileIndex = () => {
    if (!selectedFile) return -1;
    return files.findIndex((f) => f.name === selectedFile.name);
  };

  const handlePrevious = () => {
    const currentIndex = findCurrentFileIndex();
    if (currentIndex > 0) {
      setSelectedFile(files[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    const currentIndex = findCurrentFileIndex();
    if (currentIndex < files.length - 1) {
      setSelectedFile(files[currentIndex + 1]);
    }
  };

  const handleDelete = async (filename: string) => {
    try {
      const response = await fetch(`/api/files/${filename}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success(t("gallery.file_actions.delete_success"));
        setSelectedFile(null);
        handleRefresh();
      }
    } catch (error) {
      toast.error(t("gallery.file_actions.delete_error"));
    }
  };

  const copyToClipboard = async (url: string) => {
    try {
      if (
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(url);
        toast.success(t("gallery.file_actions.copy_url"));
      } else {
        // Fallback pour les navigateurs qui ne supportent pas l'API Clipboard
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
          document.execCommand("copy");
          toast.success(t("gallery.file_actions.copy_url"));
        } catch (err) {
          toast.error(t("gallery.file_actions.copy_error"));
          console.error("Erreur lors de la copie:", err);
        }

        document.body.removeChild(textArea);
      }
    } catch (error) {
      toast.error(t("gallery.file_actions.copy_error"));
      console.error("Erreur lors de la copie:", error);
    }
  };

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(
      `/api/files${isSecureUpload ? "/secure" : ""}`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(t("gallery.upload_zone.upload_error"));
    }

    await fetchFiles(1).then(({ files }) => {
      reset(files);
      setSelectedFile(files[0]);
    });
  };

  const handleToggleSecurity = async (file: FileInfo) => {
    try {
      const formData = new FormData();
      formData.append("isSecure", (!file.isSecure).toString());

      const response = await fetch(
        `/api/files?filename=${encodeURIComponent(file.name)}`,
        {
          method: "PUT",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(t("gallery.file_actions.security_error"));
      }

      const data = await response.json();

      // Mettre à jour le fichier dans la liste
      const updatedFiles = files.map((f) =>
        f.name === file.name ? { ...f, isSecure: data.isSecure } : f
      );
      reset(updatedFiles);

      toast.success(
        file.isSecure
          ? t("gallery.file_actions.now_public")
          : t("gallery.file_actions.now_private")
      );
    } catch (error) {
      console.error("Erreur lors de la modification de la sécurité:", error);
      toast.error(t("gallery.file_actions.error_occurred"));
    }
  };

  const handleToggleStar = async (file: FileInfo) => {
    try {
      const formData = new FormData();
      formData.append("isStarred", (!file.isStarred).toString());

      const response = await fetch(
        `/api/files/${encodeURIComponent(file.name)}/star`,
        {
          method: "PUT",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(t("gallery.file_actions.star_error"));
      }

      const data = await response.json();

      // Mettre à jour le fichier dans la liste
      const updatedFiles = files.map((f) =>
        f.name === file.name ? { ...f, isStarred: data.isStarred } : f
      );
      reset(updatedFiles);

      toast.success(
        file.isStarred
          ? t("gallery.file_actions.removed_from_favorites")
          : t("gallery.file_actions.added_to_favorites")
      );
    } catch (error) {
      console.error("Erreur lors de la modification des favoris:", error);
      toast.error(t("gallery.file_actions.error_occurred"));
    }
  };

  useEffect(() => {
    if (viewMode !== defaultViewMode) {
      setDefaultViewMode(viewMode);
    }
  }, [viewMode, defaultViewMode, setDefaultViewMode]);

  if (isInitialLoading) {
    return <Loading fullHeight />;
  }

  return (
    <>
      <div className="p-8">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            {secureOnly
              ? t("gallery.secure_files")
              : starredOnly
              ? t("gallery.starred_files")
              : t("gallery.title")}
          </h1>
          <div className="flex items-center gap-4">
            <ViewSelector />
            <SortSelector />
            <RefreshInterval />
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              className={cn(
                "shrink-0 transition-all duration-200",
                isRefreshing && "animate-spin text-primary"
              )}
              disabled={isRefreshing}
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>
            <Button onClick={() => setIsUploadModalOpen(true)}>
              {t("gallery.upload")}
            </Button>
          </div>
        </div>

        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-24 text-center">
            <ImageOff className="h-12 w-12 text-muted-foreground" />
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">
                {t("gallery.empty.title")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("gallery.empty.description")}
              </p>
            </div>
          </div>
        ) : (
          <>
            {Object.entries(groupedFiles).map(([date, filesInGroup]) => (
              <div key={date} className="mb-8">
                <h2 className="mb-4 text-xl font-semibold text-muted-foreground">
                  {capitalize(date)}
                </h2>
                {!viewMode || viewMode === "grid" ? (
                  <GridView
                    files={filesInGroup}
                    onCopy={copyToClipboard}
                    onDelete={(name) => {
                      reset(files.filter((f) => f.name !== name));
                    }}
                    onSelect={setSelectedFile}
                    onToggleSecurity={handleToggleSecurity}
                    onToggleStar={handleToggleStar}
                    newFileIds={newFileIds}
                  />
                ) : (
                  <ListView
                    files={filesInGroup}
                    onCopy={copyToClipboard}
                    onDelete={(name) => {
                      reset(files.filter((f) => f.name !== name));
                    }}
                    onSelect={setSelectedFile}
                    onToggleSecurity={handleToggleSecurity}
                    onToggleStar={handleToggleStar}
                    detailed={viewMode === "details"}
                    newFileIds={newFileIds}
                  />
                )}
              </div>
            ))}
            <div ref={ref} className="h-10 flex items-center justify-center">
              {loading && (
                <Loading
                  variant="minimal"
                  size="sm"
                  showMessage={true}
                  className="text-xs"
                />
              )}
            </div>
          </>
        )}
      </div>

      <UploadZone onFinishUpload={handleFinishUpload}>
        <div className="h-1 w-1" />
      </UploadZone>

      <FileViewer
        file={selectedFile}
        onClose={() => setSelectedFile(null)}
        onDelete={handleDelete}
        onCopy={copyToClipboard}
        onToggleSecurity={handleToggleSecurity}
        onToggleStar={handleToggleStar}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={findCurrentFileIndex() > 0}
        hasNext={findCurrentFileIndex() < files.length - 1}
      />

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => {
          setIsUploadModalOpen(false);
          setIsSecureUpload(false);
        }}
        onUpload={handleUpload}
        isSecure={isSecureUpload}
        onSecureChange={setIsSecureUpload}
      />
    </>
  );
}
