"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
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
import { ImageOff, RefreshCcw, Square, CheckSquare } from "lucide-react";
import { useSimpleSelection } from "@/hooks/use-simple-selection";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { SelectionToolbar } from "@/components/gallery/selection-toolbar";
import { AddToAlbumDialog } from "@/components/albums/add-to-album-dialog";
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
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isAddToAlbumDialogOpen, setIsAddToAlbumDialogOpen] = useState(false);
  const [filesToAddToAlbum, setFilesToAddToAlbum] = useState<string[]>([]);
  const [availableAlbums, setAvailableAlbums] = useState<
    Array<{ id: number; name: string }>
  >([]);
  const [fileAlbumsCache, setFileAlbumsCache] = useState<Record<string, any[]>>(
    {}
  );

  useEffect(() => {
    // Simuler un temps de chargement pour une meilleure expérience utilisateur
    const timer = setTimeout(() => {
      setIsInitialLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  // Charger les albums disponibles
  useEffect(() => {
    const fetchAlbums = async () => {
      try {
        const response = await fetch("/api/albums");
        if (response.ok) {
          const data = await response.json();
          setAvailableAlbums(
            data.albums?.map((album: any) => ({
              id: album.id,
              name: album.name,
            })) || []
          );
        }
      } catch (error) {
        console.error("Erreur lors du chargement des albums:", error);
      }
    };

    fetchAlbums();
  }, []);

  // Fonction pour charger les albums des fichiers visibles
  const loadFileAlbums = useCallback(
    async (fileNames: string[]) => {
      try {
        // Filtrer les fichiers qui ne sont pas encore dans le cache
        const uncachedFiles = fileNames.filter(
          (fileName) => !fileAlbumsCache[fileName]
        );

        if (uncachedFiles.length === 0) return;

        const response = await fetch("/api/files/albums/batch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fileNames: uncachedFiles }),
        });

        if (response.ok) {
          const data = await response.json();
          setFileAlbumsCache((prev) => ({
            ...prev,
            ...data.fileAlbumsMap,
          }));
        }
      } catch (error) {
        console.error(
          "Erreur lors du chargement des albums des fichiers:",
          error
        );
      }
    },
    [fileAlbumsCache]
  );

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
    [search, secureOnly, starredOnly]
  );

  const {
    data: files,
    loading,
    ref,
    reset,
    prependItem,
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

  // Refs pour accéder aux valeurs actuelles dans les callbacks SSE
  const fetchFilesRef = useRef(fetchFiles);
  const resetRef = useRef(reset);
  const setHasMoreRef = useRef(setHasMore);
  const enableUploadNotificationsRef = useRef(enableUploadNotifications);
  const tRef = useRef(t);

  // Mettre à jour les refs quand les valeurs changent
  useEffect(() => {
    fetchFilesRef.current = fetchFiles;
    resetRef.current = reset;
    setHasMoreRef.current = setHasMore;
    enableUploadNotificationsRef.current = enableUploadNotifications;
    tRef.current = t;
  }, [fetchFiles, reset, setHasMore, enableUploadNotifications, t]);

  // SSE pour les nouveaux fichiers en temps réel
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isReconnecting = false;
    let isDestroyed = false;

    const cleanup = () => {
      isDestroyed = true;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      isReconnecting = false;
    };

    const connectSSE = () => {
      if (isDestroyed || isReconnecting) {
        return;
      }

      eventSource = new EventSource("/api/gallery/stream");

      eventSource.onopen = () => {
        if (isDestroyed) return;
        console.log("[Gallery SSE] Connexion établie");
        isReconnecting = false;
      };

      // Écouter les événements nommés "gallery"
      eventSource.addEventListener("gallery", (event: any) => {
        if (isDestroyed) return;

        try {
          // Ignorer les heartbeats vides
          if (event.data.trim() === "") return;

          const data = JSON.parse(event.data);

          if (data.type === "new_file" && data.file) {
            // Recharger la première page pour avoir les données à jour
            fetchFilesRef
              .current(1)
              .then(({ files: newFiles, hasMore: newHasMore }) => {
                setHasMoreRef.current(newHasMore);
                resetRef.current(newFiles);
              })
              .catch((error) => {
                console.error(
                  "[Gallery SSE] Erreur lors du rechargement:",
                  error
                );
              });

            // Notification si activée
            if (enableUploadNotificationsRef.current) {
              toast.success(
                tRef.current("gallery.notifications.new_file", {
                  filename: data.file.name,
                })
              );
            }
          }
        } catch (error) {
          console.error("[Gallery SSE] Erreur parsing message:", error);
        }
      });

      eventSource.onerror = (error) => {
        if (isDestroyed) return;

        console.error("[Gallery SSE] Erreur de connexion");
        if (!isReconnecting) {
          isReconnecting = true;
          reconnectTimeout = setTimeout(() => {
            if (!isDestroyed) {
              console.log("[Gallery SSE] Tentative de reconnexion...");
              connectSSE();
            }
          }, 5000);
        }
      };
    };

    // Établir la connexion SSE seulement si le composant n'est pas détruit
    if (!isDestroyed) {
      connectSSE();
    }

    // Nettoyer la connexion à la destruction du composant
    return cleanup;
  }, [prependItem, enableUploadNotifications, t]);

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

  // Fonction pour gérer la sélection vide
  const handleSelectionEmpty = useCallback(() => {
    // Sortir du mode sélection quand il n'y a plus de sélection
    setIsSelectionMode(false);
  }, []);

  // Multi-sélection
  const {
    selectedCount,
    hasSelection,
    isSelected,
    getSelectedFiles,
    getSelectedFilesData,
    toggleFile,
    selectAll,
    clearSelection,
  } = useSimpleSelection({
    enabled: isSelectionMode,
    onSelectionEmpty: handleSelectionEmpty,
  });

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
  }, [fetchFiles]);

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

  // Charger les albums des fichiers visibles
  useEffect(() => {
    if (uniqueFiles.length > 0) {
      const fileNames = uniqueFiles.map((file) => file.name);
      loadFileAlbums(fileNames);
    }
  }, [uniqueFiles, loadFileAlbums]);

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

    const response = await fetch("/api/gallery/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || t("gallery.upload_zone.upload_error"));
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

  // Actions de multi-sélection
  const handleCopySelectedUrls = useCallback(() => {
    const selectedFiles = getSelectedFiles();
    if (selectedFiles.length === 0) return;

    const urls = selectedFiles
      .map(
        (fileName) =>
          `${window.location.origin}/api/files/${encodeURIComponent(fileName)}`
      )
      .join("\n");

    try {
      navigator.clipboard.writeText(urls);
      toast.success(t("gallery.file_actions.copy_url"));
    } catch (error) {
      // Fallback pour les navigateurs plus anciens
      const textArea = document.createElement("textarea");
      textArea.value = urls;
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
      }

      document.body.removeChild(textArea);
    }
  }, [getSelectedFiles, t]);

  const handleDeleteSelected = useCallback(async () => {
    const selectedFileNames = getSelectedFiles();
    if (selectedFileNames.length === 0) return;

    try {
      const promises = selectedFileNames.map((fileName) =>
        fetch(`/api/files/${encodeURIComponent(fileName)}`, {
          method: "DELETE",
        })
      );

      const results = await Promise.allSettled(promises);
      const successful = results.filter(
        (result) => result.status === "fulfilled"
      ).length;

      if (successful > 0) {
        const updatedFiles = files.filter(
          (f) => !selectedFileNames.includes(f.name)
        );
        reset(updatedFiles);
        clearSelection();
        toast.success(t("gallery.file_actions.delete_success"));
      }

      if (successful < selectedFileNames.length) {
        toast.error(t("gallery.file_actions.delete_error"));
      }
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      toast.error(t("gallery.file_actions.error_occurred"));
    }
  }, [getSelectedFiles, files, reset, clearSelection, t]);

  const handleToggleStarSelected = useCallback(async () => {
    const selectedFilesData = getSelectedFilesData(files);
    if (selectedFilesData.length === 0) return;

    try {
      const promises = selectedFilesData.map(async (file) => {
        const formData = new FormData();
        formData.append("isStarred", (!file.isStarred).toString());

        return fetch(`/api/files/${encodeURIComponent(file.name)}/star`, {
          method: "PUT",
          body: formData,
        });
      });

      await Promise.all(promises);

      // Mettre à jour tous les fichiers sélectionnés
      const updatedFiles = files.map((f) => {
        const selectedFile = selectedFilesData.find((sf) => sf.name === f.name);
        return selectedFile ? { ...f, isStarred: !selectedFile.isStarred } : f;
      });
      reset(updatedFiles);

      toast.success(t("gallery.file_actions.added_to_favorites"));
    } catch (error) {
      console.error("Erreur lors de la modification des favoris:", error);
      toast.error(t("gallery.file_actions.error_occurred"));
    }
  }, [getSelectedFilesData, files, reset, t]);

  const handleToggleSecuritySelected = useCallback(async () => {
    const selectedFilesData = getSelectedFilesData(files);
    if (selectedFilesData.length === 0) return;

    try {
      const promises = selectedFilesData.map(async (file) => {
        const formData = new FormData();
        formData.append("isSecure", (!file.isSecure).toString());

        return fetch(`/api/files?filename=${encodeURIComponent(file.name)}`, {
          method: "PUT",
          body: formData,
        });
      });

      await Promise.all(promises);

      // Mettre à jour tous les fichiers sélectionnés
      const updatedFiles = files.map((f) => {
        const selectedFile = selectedFilesData.find((sf) => sf.name === f.name);
        return selectedFile ? { ...f, isSecure: !selectedFile.isSecure } : f;
      });
      reset(updatedFiles);

      toast.success(t("gallery.file_actions.now_private"));
    } catch (error) {
      console.error("Erreur lors de la modification de la sécurité:", error);
      toast.error(t("gallery.file_actions.error_occurred"));
    }
  }, [getSelectedFilesData, files, reset, t]);

  const handleAddToAlbum = useCallback(() => {
    const selectedFiles = getSelectedFiles();
    if (selectedFiles.length === 0) return;

    setFilesToAddToAlbum(selectedFiles);
    setIsAddToAlbumDialogOpen(true);
  }, [getSelectedFiles]);

  const handleAddSingleFileToAlbum = useCallback((fileName: string) => {
    // Passer directement ce fichier au dialog
    setFilesToAddToAlbum([fileName]);
    setIsAddToAlbumDialogOpen(true);
  }, []);

  const handleAddToSpecificAlbum = useCallback(
    async (fileName: string, albumId: number) => {
      try {
        const response = await fetch(`/api/albums/${albumId}/files`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fileNames: [fileName] }),
        });

        if (!response.ok) {
          throw new Error("Erreur lors de l'ajout du fichier à l'album");
        }

        const result = await response.json();
        const album = availableAlbums.find((a) => a.id === albumId);
        toast.success(`Fichier ajouté à l'album "${album?.name || albumId}"`);
      } catch (error) {
        console.error("Erreur:", error);
        toast.error("Erreur lors de l'ajout du fichier à l'album");
      }
    },
    [availableAlbums]
  );

  const handleCreateAlbum = useCallback((fileName?: string) => {
    // Si un fileName est fourni, passer directement ce fichier au dialog
    if (fileName) {
      setFilesToAddToAlbum([fileName]);
      setIsAddToAlbumDialogOpen(true);
    } else {
      // Ouvrir le dialog de création d'album directement
      setFilesToAddToAlbum([]);
      setIsAddToAlbumDialogOpen(true);
    }
  }, []);

  const handleStartSelectionMode = useCallback(
    (fileName: string) => {
      // Activer le mode sélection
      setIsSelectionMode(true);
      // Sélectionner le fichier
      toggleFile(fileName);
    },
    [toggleFile]
  );

  const handleShowHelp = useCallback(() => {
    // TODO: Ouvrir le modal d'aide des raccourcis
    toast.info("Aide des raccourcis clavier (À implémenter)");
  }, []);

  // Raccourcis clavier
  useKeyboardShortcuts({
    onSelectAll: () => selectAll(files),
    onClearSelection: clearSelection,
    onDeleteSelected: handleDeleteSelected,
    onCopySelected: handleCopySelectedUrls,
    onToggleStarSelected: handleToggleStarSelected,
    onToggleSecuritySelected: handleToggleSecuritySelected,
    onAddToAlbum: handleAddToAlbum,
    onShowHelp: handleShowHelp,
    enabled: isSelectionMode,
    hasSelection,
  });

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
      <div>
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h1 className="text-xl sm:text-2xl font-bold">
              {secureOnly
                ? t("gallery.secure_files")
                : starredOnly
                ? t("gallery.starred_files")
                : t("gallery.title")}
            </h1>

            {/* Contrôles principaux - toujours visibles */}
            <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
              <Button
                variant={isSelectionMode ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setIsSelectionMode(!isSelectionMode);
                  if (isSelectionMode) clearSelection();
                }}
                className={cn(
                  "shrink-0 text-xs sm:text-sm min-w-0",
                  !isSelectionMode &&
                    "backdrop-blur-md border border-white/20 bg-white/10 dark:bg-black/10 hover:bg-white/20 dark:hover:bg-black/20 transition-all duration-200"
                )}
              >
                {isSelectionMode ? (
                  <CheckSquare className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 flex-shrink-0" />
                ) : (
                  <Square className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 flex-shrink-0" />
                )}
                <span className="hidden sm:inline truncate">
                  {isSelectionMode
                    ? t("multiselect.exit_selection_mode")
                    : t("multiselect.selection_mode")}
                </span>
              </Button>

              <Button
                onClick={() => setIsUploadModalOpen(true)}
                size="sm"
                className="text-xs sm:text-sm flex-shrink-0"
              >
                {t("gallery.upload")}
              </Button>
            </div>
          </div>

          {/* Contrôles secondaires - responsive */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-4">
            <ViewSelector />
            <SortSelector />
            <RefreshInterval />
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              className={cn(
                "shrink-0 transition-all duration-200 h-8 w-8",
                "backdrop-blur-md border border-white/20 bg-white/10 dark:bg-black/10 hover:bg-white/20 dark:hover:bg-black/20",
                isRefreshing && "animate-spin text-primary"
              )}
              disabled={isRefreshing}
            >
              <RefreshCcw className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </div>

        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-12 sm:py-24 text-center px-4">
            <ImageOff className="h-8 w-8 sm:h-12 sm:w-12 text-muted-foreground" />
            <div className="space-y-2">
              <h3 className="text-base sm:text-lg font-semibold">
                {t("gallery.empty.title")}
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-md">
                {t("gallery.empty.description")}
              </p>
            </div>
          </div>
        ) : (
          <>
            <UploadZone onFinishUpload={handleFinishUpload}>
              {Object.entries(groupedFiles).map(([date, filesInGroup]) => (
                <div key={date} className="mb-6 sm:mb-8">
                  <h2 className="mb-3 sm:mb-4 text-lg sm:text-xl font-semibold text-muted-foreground px-2 sm:px-0">
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
                      onToggleSelection={toggleFile}
                      onAddToAlbum={handleAddToAlbum}
                      onCreateAlbum={(fileName) => handleCreateAlbum(fileName)}
                      onAddSingleFileToAlbum={handleAddSingleFileToAlbum}
                      onAddToSpecificAlbum={handleAddToSpecificAlbum}
                      isSelected={isSelected}
                      isSelectionMode={isSelectionMode}
                      showSelectionCheckbox={isSelectionMode}
                      albums={availableAlbums}
                      allSelectedFiles={getSelectedFilesData(files)}
                      selectedCount={selectedCount}
                      hasSelection={hasSelection}
                      onClearSelection={clearSelection}
                      onCopyUrls={handleCopySelectedUrls}
                      onDeleteSelected={handleDeleteSelected}
                      onToggleStarSelected={handleToggleStarSelected}
                      onToggleSecuritySelected={handleToggleSecuritySelected}
                      onStartSelectionMode={handleStartSelectionMode}
                      fileAlbumsCache={fileAlbumsCache}
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
                      onToggleSelection={toggleFile}
                      onAddToAlbum={handleAddToAlbum}
                      onCreateAlbum={(fileName) => handleCreateAlbum(fileName)}
                      onAddSingleFileToAlbum={handleAddSingleFileToAlbum}
                      onAddToSpecificAlbum={handleAddToSpecificAlbum}
                      isSelected={isSelected}
                      isSelectionMode={isSelectionMode}
                      showSelectionCheckbox={isSelectionMode}
                      albums={availableAlbums}
                      allSelectedFiles={getSelectedFilesData(files)}
                      selectedCount={selectedCount}
                      hasSelection={hasSelection}
                      onClearSelection={clearSelection}
                      onCopyUrls={handleCopySelectedUrls}
                      onDeleteSelected={handleDeleteSelected}
                      onToggleStarSelected={handleToggleStarSelected}
                      onToggleSecuritySelected={handleToggleSecuritySelected}
                      detailed={viewMode === "details"}
                      newFileIds={newFileIds}
                    />
                  )}
                </div>
              ))}
            </UploadZone>

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

      {/* Barre d'outils de sélection */}
      {isSelectionMode && hasSelection && (
        <SelectionToolbar
          selectedFiles={getSelectedFilesData(files)}
          selectedCount={selectedCount}
          onClearSelection={clearSelection}
          onCopyUrls={handleCopySelectedUrls}
          onDeleteSelected={handleDeleteSelected}
          onToggleStarSelected={handleToggleStarSelected}
          onToggleSecuritySelected={handleToggleSecuritySelected}
          onAddToAlbum={handleAddToAlbum}
          onShowHelp={handleShowHelp}
        />
      )}

      {/* Dialog d'ajout à un album */}
      <AddToAlbumDialog
        open={isAddToAlbumDialogOpen}
        onClose={() => {
          setIsAddToAlbumDialogOpen(false);
          setFilesToAddToAlbum([]);
        }}
        selectedFiles={filesToAddToAlbum}
        onSuccess={() => {
          clearSelection();
          setIsSelectionMode(false);
          setFilesToAddToAlbum([]);
        }}
      />
    </>
  );
}
