"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useSession } from "@/lib/auth-client";
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
import { Check, ImageOff, Minus, RefreshCcw } from "lucide-react";
import { useSimpleSelection } from "@/hooks/use-simple-selection";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { SelectionToolbar } from "@/components/gallery/selection-toolbar";
import { AddToAlbumDialog } from "@/components/albums/add-to-album-dialog";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import {
  chunk,
  FILE_ALBUMS_BATCH_LIMIT,
  readApiError,
} from "@/lib/utils/chunk";
import { useQueryState } from "nuqs";
import { ViewSelector } from "@/components/view-selector";
import { GridView } from "@/components/gallery/grid-view";
import { ListView } from "@/components/gallery/list-view";
import { FileViewer } from "@/components/gallery/file-viewer";
import { UploadZone } from "@/components/gallery/upload-zone";
import { KeyboardShortcutsDialog } from "@/components/gallery/keyboard-shortcuts-dialog";
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
import { DateRangeFilter } from "@/components/gallery/date-range-filter";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/lib/i18n";
import { motion } from "framer-motion";
import { useRoutedFileViewer } from "@/hooks/use-routed-file-viewer";

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

const dedupeFilesByName = (input: FileInfo[]) =>
  input.filter(
    (file, index, self) => index === self.findIndex((item) => item.name === file.name),
  );

interface GalleryClientProps {
  initialFiles: FileInfo[];
  initialHasMore: boolean;
  initialView?: "grid" | "list" | "details";
  initialSearch?: string;
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
  secureOnly = false,
  starredOnly = false,
}: GalleryClientProps) {
  const { data: session, isPending: isSessionPending } = useSession();
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
  const [startDate] = useQueryState("start");
  const [endDate] = useQueryState("end");
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
  const [activeMonthHeader, setActiveMonthHeader] = useState<string | null>(null);
  const [isAddToAlbumDialogOpen, setIsAddToAlbumDialogOpen] = useState(false);
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);
  const [filesToAddToAlbum, setFilesToAddToAlbum] = useState<string[]>([]);
  const [availableAlbums, setAvailableAlbums] = useState<
    Array<{ id: number; name: string }>
  >([]);
  const [fileAlbumsCache, setFileAlbumsCache] = useState<Record<string, any[]>>(
    {},
  );
  const {
    fileName: viewerFileName,
    presentation: viewerPresentation,
    openFile: openViewerFile,
    navigateToFile: navigateViewerFile,
    closeFile: closeViewerFile,
    setPresentation: setViewerPresentation,
  } = useRoutedFileViewer();
  const [viewerFallbackFile, setViewerFallbackFile] = useState<FileInfo | null>(
    null,
  );
  const [isViewerLoading, setIsViewerLoading] = useState(false);
  const fileAlbumsCacheRef = useRef(fileAlbumsCache);
  const highestLoadedPageRef = useRef(1);
  const hasMorePagesRef = useRef(initialHasMore);
  const viewerResolutionIdRef = useRef(0);
  useEffect(() => {
    fileAlbumsCacheRef.current = fileAlbumsCache;
  }, [fileAlbumsCache]);

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
            })) || [],
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
    async (fileNames: string[], forceReload = false) => {
      try {
        // Filtrer les fichiers qui ne sont pas encore dans le cache (sauf si forceReload)
        const uncachedFiles = forceReload
          ? fileNames
          : fileNames.filter(
              (fileName) => !fileAlbumsCacheRef.current[fileName],
            );

        if (uncachedFiles.length === 0) return;

        // La route plafonne à FILE_ALBUMS_BATCH_LIMIT fichiers : au-delà elle
        // répond 400 et aucune pastille d'album ne se met à jour. Cas concret :
        // le rafraîchissement qui suit un ajout sur une grosse sélection.
        for (const batch of chunk(uncachedFiles, FILE_ALBUMS_BATCH_LIMIT)) {
          const response = await fetch("/api/files/albums/batch", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ fileNames: batch }),
          });

          if (!response.ok) {
            // Un échec ici n'est pas bloquant, mais il ne doit plus passer
            // inaperçu : sans ça les pastilles restaient vides sans un mot.
            console.error(
              "Chargement des albums échoué:",
              await readApiError(response, `HTTP ${response.status}`),
            );
            continue;
          }

          const data = await response.json();
          setFileAlbumsCache((prev) => ({
            ...prev,
            ...data.fileAlbumsMap,
          }));
        }
      } catch (error) {
        console.error(
          "Erreur lors du chargement des albums des fichiers:",
          error,
        );
      }
    },
    [],
  );

  const fetchFiles = useCallback(
    async (page: number) => {
      try {
        const searchParams = new URLSearchParams();
        searchParams.set("page", page.toString());
        if (search) searchParams.set("q", search);
        if (secureOnly) searchParams.set("secure", "true");
        if (starredOnly) searchParams.set("starred", "true");
        searchParams.set("sort", sortBy);
        searchParams.set("order", sortOrder);
        if (startDate) searchParams.set("start", startDate);
        if (endDate) searchParams.set("end", endDate);

        const res = await fetch(`/api/files?${searchParams.toString()}`, {
          cache: "no-store",
        });
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
    [search, secureOnly, starredOnly, sortBy, sortOrder, startDate, endDate],
  );

  const {
    data: files,
    loading,
    ref,
    reset,
    updateData,
    prependItem,
  } = useInfiniteScroll<FileInfo>({
    initialData: initialFiles,
    initialHasMore,
    fetchMore: useCallback(
      async (page) => {
        const { files, hasMore } = await fetchFiles(page);
        highestLoadedPageRef.current = Math.max(highestLoadedPageRef.current, page);
        hasMorePagesRef.current = hasMore;
        return { data: files, hasMore };
      },
      [fetchFiles],
    ),
  });

  // Refs assigned during render — always up-to-date when effects/callbacks read them.
  // No useEffect sync needed.
  const fetchFilesRef = useRef(fetchFiles);
  fetchFilesRef.current = fetchFiles;

  const applyReset = useCallback(
    (nextFiles: FileInfo[], nextHasMore: boolean) => {
      highestLoadedPageRef.current = 1;
      hasMorePagesRef.current = nextHasMore;
      reset(nextFiles, nextHasMore);
    },
    [reset],
  );

  const prependItemRef = useRef(prependItem);
  prependItemRef.current = prependItem;

  const enableUploadNotificationsRef = useRef(enableUploadNotifications);
  enableUploadNotificationsRef.current = enableUploadNotifications;

  const tRef = useRef(t);
  tRef.current = t;

  const searchRef = useRef(search);
  searchRef.current = search;

  const startDateRef = useRef(startDate);
  startDateRef.current = startDate;

  const endDateRef = useRef(endDate);
  endDateRef.current = endDate;

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
            // Prepend the new file without resetting scroll position
            const hasActiveFilters =
              searchRef.current || startDateRef.current || endDateRef.current;

            if (!hasActiveFilters) {
              const newFile: FileInfo = {
                name: data.file.name,
                url: `/api/files/${data.file.name}`,
                size: data.file.size || 0,
                createdAt: data.file.createdAt || new Date().toISOString(),
                isSecure: data.file.isSecure ?? false,
                isStarred: data.file.isStarred ?? false,
              };
              prependItemRef.current(newFile);
            }

            // Notification si activée
            if (enableUploadNotificationsRef.current) {
              toast.success(
                tRef.current("gallery.notifications.new_file", {
                  filename: data.file.name,
                }),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- All values accessed via refs, no deps needed
  }, []);

  const handleFinishUpload = useCallback(async () => {
    const { files: newFiles, hasMore: newHasMore } =
      await fetchFilesRef.current(1);
    applyReset(newFiles, newHasMore);
  }, [applyReset]);

  // Reset to page 1 when any filter/sort value changes (skip initial mount)
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    fetchFilesRef.current(1).then(({ files, hasMore }) => {
      applyReset(files, hasMore);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchFiles accessed via ref
  }, [search, sortBy, sortOrder, startDate, endDate, applyReset]);

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
    selectFiles,
    deselectFiles,
    clearSelection,
  } = useSimpleSelection({
    enabled: isSelectionMode,
    onSelectionEmpty: handleSelectionEmpty,
  });

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const { files: newFiles, hasMore: newHasMore } =
        await fetchFilesRef.current(1);
      applyReset(newFiles, newHasMore);
    } catch (error) {
      console.error("Erreur lors du rafraîchissement:", error);
      toast.error(t("gallery.refresh.error"));
    } finally {
      setIsRefreshing(false);
    }
  }, [applyReset, t]);

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
    if (!isSessionPending && !session) {
      redirect("/login");
    }
  }, [isSessionPending, session]);

  // Éviter les doublons dans les fichiers
  const uniqueFiles = useMemo(() => {
    return dedupeFilesByName(files);
  }, [files]);

  // Charger les albums des fichiers visibles
  useEffect(() => {
    if (uniqueFiles.length > 0) {
      const fileNames = uniqueFiles.map((file) => file.name);
      loadFileAlbums(fileNames);
    }
  }, [uniqueFiles, loadFileAlbums]);

  const fetchViewerFileMetadata = useCallback(async (fileName: string) => {
    const response = await fetch(
      `/api/files/${encodeURIComponent(fileName)}/metadata`,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(String(response.status));
    }

    return (await response.json()) as FileInfo;
  }, []);

  const hydrateViewerFileInList = useCallback(
    async (fileName: string) => {
      if (!hasMorePagesRef.current) {
        return false;
      }

      let page = highestLoadedPageRef.current + 1;
      let hasMore = hasMorePagesRef.current;

      while (hasMore) {
        const { files: nextFiles, hasMore: nextHasMore } =
          await fetchFilesRef.current(page);

        highestLoadedPageRef.current = Math.max(highestLoadedPageRef.current, page);
        hasMorePagesRef.current = nextHasMore;
        hasMore = nextHasMore;

        if (nextFiles.length > 0) {
          updateData((prev) => dedupeFilesByName([...prev, ...nextFiles]));
        }

        if (nextFiles.some((item) => item.name === fileName)) {
          return true;
        }

        if (nextFiles.length === 0) {
          return false;
        }

        page += 1;
      }

      return false;
    },
    [updateData],
  );

  useEffect(() => {
    if (!viewerFileName) {
      setViewerFallbackFile(null);
      setIsViewerLoading(false);
      return;
    }

    const existingFile = uniqueFiles.find((file) => file.name === viewerFileName);

    if (existingFile) {
      setViewerFallbackFile(null);
      setIsViewerLoading(false);
      return;
    }

    const resolutionId = ++viewerResolutionIdRef.current;
    let cancelled = false;
    setIsViewerLoading(true);

    const resolveViewerFile = async () => {
      try {
        const metadata = await fetchViewerFileMetadata(viewerFileName);
        if (cancelled || viewerResolutionIdRef.current !== resolutionId) {
          return;
        }

        setViewerFallbackFile(metadata);
        await hydrateViewerFileInList(viewerFileName);
      } catch (error) {
        if (cancelled || viewerResolutionIdRef.current !== resolutionId) {
          return;
        }

        console.error("Erreur lors de la résolution du fichier viewer:", error);
        toast.error(t("gallery.file_viewer.file_unavailable"));
        closeViewerFile();
      } finally {
        if (!cancelled && viewerResolutionIdRef.current === resolutionId) {
          setIsViewerLoading(false);
        }
      }
    };

    void resolveViewerFile();

    return () => {
      cancelled = true;
    };
  }, [
    viewerFileName,
    uniqueFiles,
    fetchViewerFileMetadata,
    hydrateViewerFileInList,
    t,
    closeViewerFile,
  ]);

  const viewerFile = useMemo(() => {
    if (!viewerFileName) {
      return null;
    }

    return (
      uniqueFiles.find((file) => file.name === viewerFileName) ??
      (viewerFallbackFile?.name === viewerFileName ? viewerFallbackFile : null)
    );
  }, [viewerFileName, uniqueFiles, viewerFallbackFile]);

  const viewerFileIndex = useMemo(() => {
    if (!viewerFileName) {
      return -1;
    }

    return uniqueFiles.findIndex((file) => file.name === viewerFileName);
  }, [viewerFileName, uniqueFiles]);

  const groupedFiles = useMemo(() => {
    return uniqueFiles.reduce((acc: GroupedFiles, file) => {
      const date = format(parseISO(file.createdAt), "MMMM yyyy", {
        locale: fr,
      });
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(file);
      return acc;
    }, {});
  }, [uniqueFiles]);

  const handlePrevious = useCallback(() => {
    if (viewerFileIndex > 0) {
      navigateViewerFile(uniqueFiles[viewerFileIndex - 1].name);
    }
  }, [viewerFileIndex, navigateViewerFile, uniqueFiles]);

  const handleNext = useCallback(() => {
    if (viewerFileIndex >= 0 && viewerFileIndex < uniqueFiles.length - 1) {
      navigateViewerFile(uniqueFiles[viewerFileIndex + 1].name);
    }
  }, [viewerFileIndex, navigateViewerFile, uniqueFiles]);

  const handleDelete = useCallback(
    async (filename: string) => {
      try {
        const response = await fetch(`/api/files/${encodeURIComponent(filename)}`, {
          method: "DELETE",
        });

        if (response.ok) {
          toast.success(t("gallery.file_actions.delete_success"));
          if (viewerFileName === filename) {
            closeViewerFile();
            setViewerFallbackFile(null);
          }
          handleRefresh();
        }
      } catch (error) {
        toast.error(t("gallery.file_actions.delete_error"));
      }
    },
    [closeViewerFile, handleRefresh, t, viewerFileName],
  );

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

  const handleUpload = useCallback(
    async (file: File) => {
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

      await fetchFilesRef.current(1).then(({ files, hasMore }) => {
        applyReset(files, hasMore);
        if (files[0]) {
          openViewerFile(files[0].name);
        }
      });
    },
    [applyReset, openViewerFile, t],
  );

  const handleToggleSecurity = async (file: FileInfo) => {
    try {
      const formData = new FormData();
      formData.append("isSecure", (!file.isSecure).toString());

      const response = await fetch(
        `/api/files?filename=${encodeURIComponent(file.name)}`,
        {
          method: "PUT",
          body: formData,
        },
      );

      if (!response.ok) {
        throw new Error(t("gallery.file_actions.security_error"));
      }

      const data = await response.json();

      // Mettre à jour le fichier dans la liste
      updateData((prev) =>
        prev.map((f) =>
          f.name === file.name ? { ...f, isSecure: data.isSecure } : f,
        ),
      );
      setViewerFallbackFile((prev) =>
        prev?.name === file.name ? { ...prev, isSecure: data.isSecure } : prev,
      );

      toast.success(
        file.isSecure
          ? t("gallery.file_actions.now_public")
          : t("gallery.file_actions.now_private"),
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
        },
      );

      if (!response.ok) {
        throw new Error(t("gallery.file_actions.star_error"));
      }

      const data = await response.json();

      // Mettre à jour le fichier dans la liste
      updateData((prev) =>
        prev.map((f) =>
          f.name === file.name ? { ...f, isStarred: data.isStarred } : f,
        ),
      );
      setViewerFallbackFile((prev) =>
        prev?.name === file.name ? { ...prev, isStarred: data.isStarred } : prev,
      );

      toast.success(
        file.isStarred
          ? t("gallery.file_actions.removed_from_favorites")
          : t("gallery.file_actions.added_to_favorites"),
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
          `${window.location.origin}/api/files/${encodeURIComponent(fileName)}`,
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
        }),
      );

      const results = await Promise.allSettled(promises);
      const successful = results.filter(
        (result) => result.status === "fulfilled",
      ).length;

      if (successful > 0) {
        updateData((prev) =>
          prev.filter((f) => !selectedFileNames.includes(f.name)),
        );
        if (viewerFileName && selectedFileNames.includes(viewerFileName)) {
          closeViewerFile();
          setViewerFallbackFile(null);
        }
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
  }, [
    getSelectedFiles,
    updateData,
    clearSelection,
    t,
    viewerFileName,
    closeViewerFile,
  ]);

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
      updateData((prev) =>
        prev.map((f) => {
          const sel = selectedFilesData.find((sf) => sf.name === f.name);
          return sel ? { ...f, isStarred: !sel.isStarred } : f;
        }),
      );
      setViewerFallbackFile((prev) => {
        if (!prev) {
          return prev;
        }

        const selectedViewerFile = selectedFilesData.find(
          (file) => file.name === prev.name,
        );

        return selectedViewerFile
          ? { ...prev, isStarred: !selectedViewerFile.isStarred }
          : prev;
      });

      toast.success(t("gallery.file_actions.added_to_favorites"));
    } catch (error) {
      console.error("Erreur lors de la modification des favoris:", error);
      toast.error(t("gallery.file_actions.error_occurred"));
    }
  }, [getSelectedFilesData, files, updateData, t]);

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
      updateData((prev) =>
        prev.map((f) => {
          const sel = selectedFilesData.find((sf) => sf.name === f.name);
          return sel ? { ...f, isSecure: !sel.isSecure } : f;
        }),
      );
      setViewerFallbackFile((prev) => {
        if (!prev) {
          return prev;
        }

        const selectedViewerFile = selectedFilesData.find(
          (file) => file.name === prev.name,
        );

        return selectedViewerFile
          ? { ...prev, isSecure: !selectedViewerFile.isSecure }
          : prev;
      });

      toast.success(t("gallery.file_actions.now_private"));
    } catch (error) {
      console.error("Erreur lors de la modification de la sécurité:", error);
      toast.error(t("gallery.file_actions.error_occurred"));
    }
  }, [getSelectedFilesData, files, updateData, t]);

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
    [availableAlbums],
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
    [toggleFile],
  );

  const handleToggleMonthSelection = useCallback(
    (groupFiles: FileInfo[]) => {
      const fileNames = groupFiles.map((file) => file.name);
      const areAllGroupFilesSelected = fileNames.every((fileName) =>
        isSelected(fileName),
      );

      if (!isSelectionMode) {
        setIsSelectionMode(true);
      }

      if (areAllGroupFilesSelected) {
        deselectFiles(fileNames);
      } else {
        selectFiles(fileNames);
      }
    },
    [deselectFiles, isSelected, isSelectionMode, selectFiles],
  );

  const handleShowHelp = useCallback(() => {
    setIsShortcutsHelpOpen(true);
  }, []);

  // Raccourcis clavier
  const { shortcuts } = useKeyboardShortcuts({
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

  const galleryTitle = secureOnly
    ? t("gallery.secure_files")
    : starredOnly
      ? t("gallery.starred_files")
      : t("gallery.title");

  return (
    <>
      <div>
        <section className="mb-4 flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
            {(secureOnly || starredOnly) && (
              <>
                <span className="px-1 text-sm font-medium text-foreground">
                  {galleryTitle}
                </span>
                <Separator
                  orientation="vertical"
                  className="hidden h-5 sm:block"
                />
              </>
            )}

            <div className="flex items-center gap-2">
              <span className="px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Vue
              </span>
              <ViewSelector />
            </div>

            <Separator orientation="vertical" className="hidden h-5 sm:block" />

            <div className="flex items-center gap-2">
              <span className="px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Tri
              </span>
              <SortSelector />
            </div>

            <Separator orientation="vertical" className="hidden h-5 sm:block" />

            <div className="flex items-center gap-2">
              <span className="px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Filtres
              </span>
              <DateRangeFilter />
              <RefreshInterval />
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                className={cn(
                  "h-9 w-9 rounded-xl border border-border/60 bg-background shadow-sm transition-colors hover:bg-muted/70",
                  isRefreshing && "animate-spin text-primary",
                )}
                disabled={isRefreshing}
              >
                <RefreshCcw className="h-3 w-3 sm:h-4 sm:w-4" />
              </Button>
            </div>
          </div>

          <Button
            onClick={() => setIsUploadModalOpen(true)}
            size="sm"
            className="h-9 rounded-xl px-5 text-xs sm:text-sm"
          >
            {t("gallery.upload")}
          </Button>
        </section>

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
                  {(() => {
                    const groupFileNames = filesInGroup.map(
                      (file) => file.name,
                    );
                    const selectedInGroupCount = groupFileNames.filter(
                      (fileName) => isSelected(fileName),
                    ).length;
                    const isGroupFullySelected =
                      selectedInGroupCount === groupFileNames.length &&
                      groupFileNames.length > 0;
                    const hasGroupSelection = selectedInGroupCount > 0;
                    const isMonthActionVisible = activeMonthHeader === date;

                    return (
                      <div className="mb-3 px-2 sm:mb-4 sm:px-0">
                        <motion.div
                          className="relative inline-flex min-w-0 items-center"
                          initial={false}
                          onHoverStart={() => setActiveMonthHeader(date)}
                          onHoverEnd={() =>
                            setActiveMonthHeader((current) =>
                              current === date ? null : current,
                            )
                          }
                        >
                          <motion.div
                            className="absolute left-0 top-1/2 -translate-y-1/2"
                            initial={false}
                            animate={
                              isMonthActionVisible
                                ? { opacity: 1, scale: 1, x: 0 }
                                : { opacity: 0, scale: 0.85, x: -10 }
                            }
                            transition={{ duration: 0.18, ease: "easeOut" }}
                            style={{
                              pointerEvents: isMonthActionVisible
                                ? "auto"
                                : "none",
                            }}
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              tabIndex={isMonthActionVisible ? 0 : -1}
                              aria-label={
                                isGroupFullySelected
                                  ? `Retirer la sélection pour ${date}`
                                  : `Sélectionner tout le mois ${date}`
                              }
                              onClick={() =>
                                handleToggleMonthSelection(filesInGroup)
                              }
                              className={cn(
                                "h-8 w-8 shrink-0 rounded-full border transition-colors duration-200",
                                "focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2",
                                isGroupFullySelected
                                  ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                                  : hasGroupSelection
                                    ? "border-primary/50 bg-background/90 text-primary hover:bg-muted"
                                    : "border-border/60 bg-background/90 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                              )}
                            >
                              {isGroupFullySelected ? (
                                <Check className="h-4 w-4" />
                              ) : hasGroupSelection ? (
                                <Minus className="h-4 w-4" />
                              ) : (
                                <span className="h-3.5 w-3.5 rounded-full border-2 border-current/80" />
                              )}
                            </Button>
                          </motion.div>

                          <motion.h2
                            className="text-lg font-semibold text-muted-foreground sm:text-xl"
                            initial={false}
                            animate={{
                              paddingLeft: isMonthActionVisible ? 40 : 0,
                            }}
                            transition={{ duration: 0.18, ease: "easeOut" }}
                          >
                            {capitalize(date)}
                          </motion.h2>
                        </motion.div>
                      </div>
                    );
                  })()}
                  {!viewMode || viewMode === "grid" ? (
                    <GridView
                      files={filesInGroup}
                      onCopy={copyToClipboard}
                      onDelete={(name) => {
                        updateData((prev) =>
                          prev.filter((f) => f.name !== name),
                        );
                      }}
                      onSelect={(file) => openViewerFile(file.name)}
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
                        updateData((prev) =>
                          prev.filter((f) => f.name !== name),
                        );
                      }}
                      onSelect={(file) => openViewerFile(file.name)}
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
        file={viewerFile}
        presentation={viewerPresentation}
        onPresentationChange={setViewerPresentation}
        onClose={closeViewerFile}
        onDelete={handleDelete}
        onCopy={copyToClipboard}
        onToggleSecurity={handleToggleSecurity}
        onToggleStar={handleToggleStar}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={viewerFileIndex > 0}
        hasNext={viewerFileIndex >= 0 && viewerFileIndex < uniqueFiles.length - 1}
        isLoading={isViewerLoading}
        loadingName={viewerFileName}
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
          // Invalider le cache des albums pour les fichiers ajoutés et recharger
          setFileAlbumsCache((prev) => {
            const newCache = { ...prev };
            filesToAddToAlbum.forEach((fileName) => {
              delete newCache[fileName];
            });
            return newCache;
          });
          // Forcer le rechargement des albums pour les fichiers ajoutés
          loadFileAlbums(filesToAddToAlbum, true);
          clearSelection();
          setIsSelectionMode(false);
          setFilesToAddToAlbum([]);
        }}
      />

      {/* Dialog d'aide des raccourcis clavier */}
      <KeyboardShortcutsDialog
        open={isShortcutsHelpOpen}
        onClose={() => setIsShortcutsHelpOpen(false)}
        shortcuts={shortcuts}
      />
    </>
  );
}
