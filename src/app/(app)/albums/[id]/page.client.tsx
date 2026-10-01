"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  ArrowLeft,
  Edit2,
  Trash2,
  Plus,
  Globe,
  GlobeLock,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { GridView } from "@/components/gallery/grid-view";
import { ListView } from "@/components/gallery/list-view";
import { FileViewer } from "@/components/gallery/file-viewer";
import { SelectionToolbar } from "@/components/gallery/selection-toolbar";
import { KeyboardShortcutsDialog } from "@/components/gallery/keyboard-shortcuts-dialog";
import { AddToAlbumDialog } from "@/components/albums/add-to-album-dialog";
import { ViewSelector } from "@/components/view-selector";
import { useTranslation } from "@/lib/i18n";
import { Loading } from "@/components/ui/loading";
import { useQueryState } from "nuqs";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useSimpleSelection } from "@/hooks/use-simple-selection";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import type { Album } from "@/types/albums";
import type { FileInfo } from "@/types/files";
import { useRoutedFileViewer } from "@/hooks/use-routed-file-viewer";
import { TimelineNavigator, findScrollParent, timelineGroupProps } from "@/components/timeline/timeline-navigator";
import { formatMonthKey, monthKeyOf, type TimelineMonth } from "@/lib/timeline";
import { languageAtom } from "@/lib/atoms/preferences";
import { useAtomValue } from "jotai";
import { capitalize } from "@/lib/utils";

interface AlbumViewClientProps {
  albumId: number;
}

/** Fichiers demandés à chaque page ; le serveur plafonne à 60. */
const PAGE_SIZE = 24;

/** Un fichier d'album porte aussi la date de son ajout, qui ordonne l'album. */
type AlbumFile = FileInfo & { addedAt?: string };

const dedupeFilesByName = (input: FileInfo[]) =>
  input.filter(
    (file, index, self) => index === self.findIndex((item) => item.name === file.name),
  );

export function AlbumViewClient({ albumId }: AlbumViewClientProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const routerRef = useRef(router);
  const tRef = useRef(t);
  routerRef.current = router;
  tRef.current = t;

  const [album, setAlbum] = useState<Album | null>(null);
  const [albumLoading, setAlbumLoading] = useState(true);
  const [isTogglingPublic, setIsTogglingPublic] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  /**
   * L'origine n'est connue que côté navigateur. La lire pendant le rendu
   * produisait un HTML serveur différent du client, donc une erreur
   * d'hydratation : on l'installe après le montage.
   */
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
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
  const [viewMode] = useQueryState<"grid" | "list" | "details">("view", {
    defaultValue: "grid",
    parse: (value): "grid" | "list" | "details" => {
      if (value === "grid" || value === "list" || value === "details") {
        return value;
      }
      return "grid";
    },
  });

  // Selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isAddToAlbumDialogOpen, setIsAddToAlbumDialogOpen] = useState(false);
  const [filesToAddToAlbum, setFilesToAddToAlbum] = useState<string[]>([]);
  const [isMoveMode, setIsMoveMode] = useState(false);
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);

  const handleSelectionEmpty = useCallback(() => {
    setIsSelectionMode(false);
  }, []);

  const {
    selectedCount,
    hasSelection,
    isSelected,
    toggleFile,
    clearSelection,
    selectAll,
    getSelectedFiles,
    getSelectedFilesData,
  } = useSimpleSelection({
    enabled: isSelectionMode,
    onSelectionEmpty: handleSelectionEmpty,
  });

  const handleStartSelectionMode = useCallback(
    (fileName: string) => {
      setIsSelectionMode(true);
      toggleFile(fileName);
    },
    [toggleFile],
  );

  // Fetch album metadata (not files — those go through useInfiniteScroll)
  const fetchAlbumMetadata = useCallback(async () => {
    try {
      setAlbumLoading(true);
      const albumResponse = await fetch(`/api/albums/${albumId}`);
      if (!albumResponse.ok) {
        const errorData = await albumResponse.json().catch(() => ({}));
        const errorMessage =
          errorData.error || tRef.current("albums.errors.loading");

        if (albumResponse.status === 404) {
          toast.error(tRef.current("albums.errors.not_found"));
          routerRef.current.push("/albums");
          return;
        }
        if (albumResponse.status === 401) {
          routerRef.current.push("/login");
          return;
        }
        if (albumResponse.status === 403) {
          toast.error(tRef.current("albums.errors.forbidden"));
          routerRef.current.push("/albums");
          return;
        }
        toast.error(errorMessage);
        return;
      }

      const albumData = await albumResponse.json();
      setAlbum(albumData);
    } catch (error) {
      console.error("Erreur lors du chargement de l'album:", error);
      toast.error(tRef.current("albums.errors.loading"));
    } finally {
      setAlbumLoading(false);
    }
  }, [albumId]);

  useEffect(() => {
    fetchAlbumMetadata();
  }, [fetchAlbumMetadata]);

  // Fetch album files with pagination
  const fetchAlbumFiles = useCallback(
    async (page: number) => {
      try {
        const res = await fetch(
          `/api/albums/${albumId}/files?details=true&page=${page}&limit=${PAGE_SIZE}`
        );
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          toast.error(
            errorData.error || tRef.current("albums.errors.loading_files")
          );
          return { files: [] as FileInfo[], hasMore: false };
        }
        const data = await res.json();
        return {
          files: data.files as FileInfo[],
          hasMore: data.hasMore as boolean,
        };
      } catch (error) {
        console.error("Erreur lors du chargement des fichiers:", error);
        return { files: [] as FileInfo[], hasMore: false };
      }
    },
    [albumId]
  );

  // Load initial page
  const [initialData, setInitialData] = useState<{
    files: FileInfo[];
    hasMore: boolean;
    loaded: boolean;
  }>({ files: [], hasMore: false, loaded: false });
  const highestLoadedPageRef = useRef(1);
  const hasMorePagesRef = useRef(false);
  const viewerResolutionIdRef = useRef(0);

  useEffect(() => {
    fetchAlbumFiles(1).then(({ files, hasMore }) => {
      highestLoadedPageRef.current = 1;
      hasMorePagesRef.current = hasMore;
      setInitialData({ files, hasMore, loaded: true });
    });
  }, [fetchAlbumFiles]);

  const language = useAtomValue(languageAtom);
  const pageRef = useRef<HTMLDivElement>(null);
  const getScrollElement = useCallback(() => findScrollParent(pageRef.current), []);
  const [months, setMonths] = useState<TimelineMonth[]>([]);
  const [timelineVersion, setTimelineVersion] = useState(0);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [datePickerKey, setDatePickerKey] = useState<string | null>(null);

  const {
    data: files,
    loading,
    loadingPrevious,
    ref: sentinelRef,
    topRef,
    firstPage,
    reset,
    resetAt,
    updateData,
  } = useInfiniteScroll<FileInfo>({
    initialData: initialData.files,
    initialHasMore: initialData.hasMore,
    getScrollElement,
    fetchMore: useCallback(
      async (page) => {
        const { files, hasMore } = await fetchAlbumFiles(page);
        highestLoadedPageRef.current = Math.max(highestLoadedPageRef.current, page);
        hasMorePagesRef.current = hasMore;
        return { data: files, hasMore };
      },
      [fetchAlbumFiles]
    ),
  });

  const applyReset = useCallback(
    (nextFiles: FileInfo[], nextHasMore: boolean) => {
      highestLoadedPageRef.current = 1;
      hasMorePagesRef.current = nextHasMore;
      reset(nextFiles, nextHasMore);
      setTimelineVersion((version) => version + 1);
    },
    [reset],
  );

  // Frise des mois d'ajout : rechargée quand le contenu de l'album change.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/albums/${albumId}/files?timeline=1&tz=${new Date().getTimezoneOffset()}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.months) setMonths(data.months);
      })
      .catch((error) => console.error("Erreur lors du chargement de la frise:", error));
    return () => {
      cancelled = true;
    };
  }, [albumId, timelineVersion]);

  /** Saut à une date : l'album repart de la page qui contient ce rang. */
  const loadAt = useCallback(
    async (index: number) => {
      const page = Math.floor(index / PAGE_SIZE) + 1;
      const { files: nextFiles, hasMore } = await fetchAlbumFiles(page);
      highestLoadedPageRef.current = page;
      hasMorePagesRef.current = hasMore;
      resetAt(nextFiles, hasMore, page);
    },
    [fetchAlbumFiles, resetAt],
  );

  // When initialData loads, reset the infinite scroll with real data
  const initialDataLoadedRef = useRef(false);
  useEffect(() => {
    if (initialData.loaded && !initialDataLoadedRef.current) {
      initialDataLoadedRef.current = true;
      applyReset(initialData.files, initialData.hasMore);
    }
  }, [initialData, applyReset]);

  const uniqueFiles = useMemo(() => dedupeFilesByName(files), [files]);

  /** Mois d'ajout consécutifs, avec leur rang dans l'album entier. */
  const monthGroups = useMemo(() => {
    const windowStart = (firstPage - 1) * PAGE_SIZE;
    const groups: { key: string; start: number; files: FileInfo[] }[] = [];
    uniqueFiles.forEach((file, index) => {
      const date = new Date((file as AlbumFile).addedAt ?? file.createdAt);
      const key = monthKeyOf(date, Number.isNaN(date.getTime()) ? 0 : date.getTimezoneOffset());
      const last = groups[groups.length - 1];
      if (last?.key === key) last.files.push(file);
      else groups.push({ key, start: windowStart + index, files: [file] });
    });
    return groups;
  }, [uniqueFiles, firstPage]);

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
          await fetchAlbumFiles(page);

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
    [fetchAlbumFiles, updateData],
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
        const foundInAlbum = await hydrateViewerFileInList(viewerFileName);

        if (!foundInAlbum && !cancelled && viewerResolutionIdRef.current === resolutionId) {
          toast.error(t("gallery.file_viewer.file_not_in_album"));
          closeViewerFile();
          setViewerFallbackFile(null);
        }
      } catch (error) {
        if (cancelled || viewerResolutionIdRef.current !== resolutionId) {
          return;
        }

        console.error("Erreur lors de la résolution du fichier d'album:", error);
        toast.error(t("gallery.file_viewer.file_unavailable"));
        closeViewerFile();
        setViewerFallbackFile(null);
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

  const handleRemoveFromAlbum = async (fileName: string) => {
    try {
      const response = await fetch(`/api/albums/${albumId}/files`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileNames: [fileName] }),
      });

      if (!response.ok) {
        throw new Error();
      }

      updateData((prev) => prev.filter((file) => file.name !== fileName));
      if (viewerFileName === fileName) {
        closeViewerFile();
        setViewerFallbackFile(null);
      }
      toast.success(t("albums.file_removed"));
    } catch {
      toast.error(t("albums.errors.remove_file"));
    }
  };

  const handleDeleteAlbum = async () => {
    try {
      const response = await fetch(`/api/albums/${albumId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error();
      }

      toast.success(t("albums.deleted"));
      router.push("/albums");
    } catch {
      toast.error(t("albums.errors.delete"));
    }
  };

  const handleTogglePublic = async () => {
    setIsTogglingPublic(true);
    try {
      const response = await fetch(`/api/albums/${albumId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isPublic: !album?.isPublic,
        }),
      });

      if (!response.ok) {
        throw new Error();
      }

      const updatedAlbum = await response.json();
      setAlbum(updatedAlbum);
      toast.success(
        updatedAlbum.isPublic
          ? t("albums.now_public")
          : t("albums.now_private")
      );
    } catch {
      toast.error(t("albums.errors.toggle_visibility"));
    } finally {
      setIsTogglingPublic(false);
    }
  };

  const handleCopyPublicUrl = async () => {
    if (!album?.publicSlug) return;

    const publicUrl = `${window.location.origin}/catalog/albums/${album.publicSlug}`;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiedUrl(true);
      toast.success(t("albums.url_copied"));
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      toast.error(t("albums.errors.copy_url"));
    }
  };

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("gallery.file_actions.copy_url"));
    } catch {
      toast.error(t("gallery.file_actions.copy_error"));
    }
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

      if (!response.ok) throw new Error();

      const data = await response.json();
      updateData((prev) =>
        prev.map((f) =>
          f.name === file.name ? { ...f, isSecure: data.isSecure } : f
        )
      );
      setViewerFallbackFile((prev) =>
        prev?.name === file.name ? { ...prev, isSecure: data.isSecure } : prev,
      );

      toast.success(
        file.isSecure
          ? t("gallery.file_actions.now_public")
          : t("gallery.file_actions.now_private")
      );
    } catch {
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

      if (!response.ok) throw new Error();

      const data = await response.json();
      updateData((prev) =>
        prev.map((f) =>
          f.name === file.name ? { ...f, isStarred: data.isStarred } : f
        )
      );
      setViewerFallbackFile((prev) =>
        prev?.name === file.name ? { ...prev, isStarred: data.isStarred } : prev,
      );

      toast.success(
        file.isStarred
          ? t("gallery.file_actions.removed_from_favorites")
          : t("gallery.file_actions.added_to_favorites")
      );
    } catch {
      toast.error(t("gallery.file_actions.error_occurred"));
    }
  };

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

  const handleDeleteFile = useCallback(
    async (filename: string) => {
      await handleRemoveFromAlbum(filename);
    },
    [handleRemoveFromAlbum],
  );

  // Bulk action handlers
  const handleBulkRemoveFromAlbum = useCallback(async () => {
    const selectedFileNames = getSelectedFiles();
    if (selectedFileNames.length === 0) return;

    try {
      const response = await fetch(`/api/albums/${albumId}/files`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileNames: selectedFileNames }),
      });

      if (!response.ok) throw new Error();

      updateData((prev) =>
        prev.filter((f) => !selectedFileNames.includes(f.name)),
      );
      if (viewerFileName && selectedFileNames.includes(viewerFileName)) {
        closeViewerFile();
        setViewerFallbackFile(null);
      }
      clearSelection();
      setIsSelectionMode(false);
      toast.success(
        t("albums.files_removed", { count: selectedFileNames.length }),
      );
    } catch {
      toast.error(t("albums.errors.remove_file"));
    }
  }, [getSelectedFiles, albumId, updateData, viewerFileName, closeViewerFile, clearSelection, t]);

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
        setIsSelectionMode(false);
        toast.success(t("gallery.file_actions.delete_success"));
      }

      if (successful < selectedFileNames.length) {
        toast.error(t("gallery.file_actions.delete_error"));
      }
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      toast.error(t("gallery.file_actions.error_occurred"));
    }
  }, [getSelectedFiles, updateData, clearSelection, t, viewerFileName, closeViewerFile]);

  const handleCopySelectedUrls = useCallback(() => {
    const selectedFileNames = getSelectedFiles();
    if (selectedFileNames.length === 0) return;

    const urls = selectedFileNames
      .map(
        (fileName) =>
          `${window.location.origin}/api/files/${encodeURIComponent(fileName)}`,
      )
      .join("\n");

    try {
      navigator.clipboard.writeText(urls);
      toast.success(t("gallery.file_actions.copy_url"));
    } catch {
      toast.error(t("gallery.file_actions.copy_error"));
    }
  }, [getSelectedFiles, t]);

  const handleToggleStarSelected = useCallback(async () => {
    const selectedFilesData = getSelectedFilesData(uniqueFiles);
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

      updateData((prev) =>
        prev.map((f) => {
          const sel = selectedFilesData.find((sf) => sf.name === f.name);
          return sel ? { ...f, isStarred: !sel.isStarred } : f;
        }),
      );
      setViewerFallbackFile((prev) => {
        if (!prev) return prev;
        const sel = selectedFilesData.find((file) => file.name === prev.name);
        return sel ? { ...prev, isStarred: !sel.isStarred } : prev;
      });

      toast.success(t("gallery.file_actions.added_to_favorites"));
    } catch {
      toast.error(t("gallery.file_actions.error_occurred"));
    }
  }, [getSelectedFilesData, uniqueFiles, updateData, t]);

  const handleToggleSecuritySelected = useCallback(async () => {
    const selectedFilesData = getSelectedFilesData(uniqueFiles);
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

      updateData((prev) =>
        prev.map((f) => {
          const sel = selectedFilesData.find((sf) => sf.name === f.name);
          return sel ? { ...f, isSecure: !sel.isSecure } : f;
        }),
      );
      setViewerFallbackFile((prev) => {
        if (!prev) return prev;
        const sel = selectedFilesData.find((file) => file.name === prev.name);
        return sel ? { ...prev, isSecure: !sel.isSecure } : prev;
      });

      toast.success(t("gallery.file_actions.now_private"));
    } catch {
      toast.error(t("gallery.file_actions.error_occurred"));
    }
  }, [getSelectedFilesData, uniqueFiles, updateData, t]);

  const handleAddToAlbum = useCallback(() => {
    const selected = getSelectedFiles();
    if (selected.length === 0) return;
    setFilesToAddToAlbum(selected);
    setIsMoveMode(false);
    setIsAddToAlbumDialogOpen(true);
  }, [getSelectedFiles]);

  const handleMoveToAlbum = useCallback(() => {
    const selected = getSelectedFiles();
    if (selected.length === 0) return;
    setFilesToAddToAlbum(selected);
    setIsMoveMode(true);
    setIsAddToAlbumDialogOpen(true);
  }, [getSelectedFiles]);

  const handleAddToAlbumSuccess = useCallback(async () => {
    if (isMoveMode) {
      try {
        await fetch(`/api/albums/${albumId}/files`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileNames: filesToAddToAlbum }),
        });
        updateData((prev) =>
          prev.filter((f) => !filesToAddToAlbum.includes(f.name)),
        );
        if (viewerFileName && filesToAddToAlbum.includes(viewerFileName)) {
          closeViewerFile();
          setViewerFallbackFile(null);
        }
        toast.success(t("albums.files_moved", { count: filesToAddToAlbum.length }));
      } catch {
        toast.error(t("albums.errors.remove_file"));
      }
    }
    clearSelection();
    setIsSelectionMode(false);
    setFilesToAddToAlbum([]);
    setIsMoveMode(false);
    setIsAddToAlbumDialogOpen(false);
  }, [isMoveMode, albumId, filesToAddToAlbum, updateData, viewerFileName, closeViewerFile, clearSelection, t]);

  const { shortcuts } = useKeyboardShortcuts({
    onSelectAll: () => selectAll(uniqueFiles),
    onClearSelection: clearSelection,
    onDeleteSelected: handleDeleteSelected,
    onCopySelected: handleCopySelectedUrls,
    onToggleStarSelected: handleToggleStarSelected,
    onToggleSecuritySelected: handleToggleSecuritySelected,
    onAddToAlbum: handleAddToAlbum,
    onShowHelp: () => setIsShortcutsHelpOpen(true),
    enabled: isSelectionMode,
    hasSelection,
  });

  if (albumLoading || !initialData.loaded) {
    return <Loading fullHeight />;
  }

  if (!album) {
    return null;
  }

  return (
    <div ref={pageRef} className="[overflow-anchor:none]">
      {/* En-tête de l'album */}
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.back()}
            className="h-8 w-8 sm:h-9 sm:w-9"
          >
            <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <h1 className="text-lg sm:text-2xl font-bold truncate">
                {album.name}
              </h1>
              {album.isPublic && (
                <Badge
                  variant="default"
                  className="text-xs sm:text-sm w-fit bg-green-600"
                >
                  <Globe className="h-2.5 w-2.5 mr-1" />
                  Public
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs sm:text-sm w-fit">
                {/* fileCount et non files.length : la liste est paginée, le compteur
                     affichait sinon le nombre de fichiers déjà chargés et
                     augmentait au fil du défilement. */
                  t("albums.files_count", { count: album.fileCount })}
              </Badge>
            </div>
            {album.description && (
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2">
                {album.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
          <ViewSelector />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9"
              >
                {album.isPublic ? (
                  <Globe className="h-3 w-3 sm:h-4 sm:w-4" />
                ) : (
                  <GlobeLock className="h-3 w-3 sm:h-4 sm:w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleTogglePublic}
                disabled={isTogglingPublic}
                className="text-sm"
              >
                {album.isPublic ? (
                  <>
                    <GlobeLock className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                    {t("albums.make_private")}
                  </>
                ) : (
                  <>
                    <Globe className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                    {t("albums.make_public")}
                  </>
                )}
              </DropdownMenuItem>
              {album.isPublic && album.publicSlug && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleCopyPublicUrl}
                    className="text-sm"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                        {t("albums.url_copied")}
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                        {t("albums.copy_public_url")}
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      window.open(
                        `/catalog/albums/${album.publicSlug}`,
                        "_blank"
                      );
                    }}
                    className="text-sm"
                  >
                    <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                    {t("albums.open_new_tab")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="icon"
            onClick={handleDeleteAlbum}
            className="h-8 w-8 sm:h-9 sm:w-9 text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </div>
      </div>

      {/* Lien public : une ligne au lieu d'une carte pleine largeur, qui
          occupait un quart de l'écran pour afficher une URL. L'adresse est
          désormais un vrai lien cliquable, et non un champ en lecture seule
          qu'il fallait sélectionner à la main. */}
      {album.isPublic && album.publicSlug && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 sm:mb-8">
          <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
          <a
            href={`/catalog/albums/${album.publicSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline sm:text-sm"
          >
            {origin}/catalog/albums/{album.publicSlug}
          </a>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyPublicUrl}
            className="h-7 shrink-0 gap-1.5 px-2 text-xs"
          >
            {copiedUrl ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Copié
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copier
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-label="Ouvrir la page publique"
            onClick={() =>
              window.open(`/catalog/albums/${album.publicSlug}`, "_blank")
            }
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Contenu de l'album */}
      {files.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-12 sm:py-24 text-center px-4">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg bg-primary/10 flex items-center justify-center mb-3 sm:mb-4">
            <Plus className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h3 className="text-base sm:text-lg font-semibold">
              {t("albums.empty_album")}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-md">
              {t("albums.empty_album_description")}
            </p>
          </div>
        </div>
      ) : (
        <div>
          {/* Après un saut à une date, ce qui précède se recharge en remontant. */}
          {firstPage > 1 && (
            <div ref={topRef} className="flex h-10 items-center justify-center">
              {loadingPrevious && <Loading variant="minimal" size="sm" showMessage={true} className="text-xs" />}
            </div>
          )}
          {monthGroups.map((group) => (
            <div
              key={`${group.key}-${group.start}`}
              className="mb-6 sm:mb-8"
              {...timelineGroupProps(group.key, group.start, group.files.length)}
            >
              {months.length > 1 && (
                <h2 className="mb-3 text-lg font-semibold text-muted-foreground sm:mb-4 sm:text-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setDatePickerKey(group.key);
                      setIsDatePickerOpen(true);
                    }}
                    title={t("gallery.toolbar.go_to_date")}
                    className="group/month inline-flex items-center gap-1.5 rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    {capitalize(formatMonthKey(group.key, "long", language))}
                    <ChevronDown className="h-4 w-4 opacity-0 transition-opacity group-hover/month:opacity-100 group-focus-visible/month:opacity-100" />
                  </button>
                </h2>
              )}
              {!viewMode || viewMode === "grid" ? (
                <GridView
                  files={group.files}
                  onCopy={copyToClipboard}
                  onDelete={handleRemoveFromAlbum}
                  onSelect={(file) => openViewerFile(file.name)}
                  onToggleSecurity={handleToggleSecurity}
                  onToggleStar={handleToggleStar}
                  onToggleSelection={toggleFile}
                  isSelected={isSelected}
                  isSelectionMode={isSelectionMode}
                  showSelectionCheckbox={isSelectionMode}
                  allSelectedFiles={getSelectedFilesData(uniqueFiles)}
                  selectedCount={selectedCount}
                  hasSelection={hasSelection}
                  onClearSelection={clearSelection}
                  onCopyUrls={handleCopySelectedUrls}
                  onDeleteSelected={handleDeleteSelected}
                  onToggleStarSelected={handleToggleStarSelected}
                  onToggleSecuritySelected={handleToggleSecuritySelected}
                  onStartSelectionMode={handleStartSelectionMode}
                  onAddToAlbum={handleAddToAlbum}
                  newFileIds={[]}
                />
              ) : (
                <ListView
                  files={group.files}
                  onCopy={copyToClipboard}
                  onDelete={handleRemoveFromAlbum}
                  onSelect={(file) => openViewerFile(file.name)}
                  onToggleSecurity={handleToggleSecurity}
                  onToggleStar={handleToggleStar}
                  onToggleSelection={toggleFile}
                  isSelected={isSelected}
                  isSelectionMode={isSelectionMode}
                  showSelectionCheckbox={isSelectionMode}
                  allSelectedFiles={getSelectedFilesData(uniqueFiles)}
                  selectedCount={selectedCount}
                  hasSelection={hasSelection}
                  onClearSelection={clearSelection}
                  onCopyUrls={handleCopySelectedUrls}
                  onDeleteSelected={handleDeleteSelected}
                  onToggleStarSelected={handleToggleStarSelected}
                  onToggleSecuritySelected={handleToggleSecuritySelected}
                  onStartSelectionMode={handleStartSelectionMode}
                  onAddToAlbum={handleAddToAlbum}
                  detailed={viewMode === "details"}
                  newFileIds={[]}
                />
              )}
            </div>
          ))}

          <div ref={sentinelRef} className="h-10 flex items-center justify-center">
            {loading && (
              <Loading
                variant="minimal"
                size="sm"
                showMessage={true}
                className="text-xs"
              />
            )}
          </div>
        </div>
      )}

      <TimelineNavigator
        months={months}
        containerRef={pageRef}
        getScrollElement={getScrollElement}
        loadAt={loadAt}
        pickerOpen={isDatePickerOpen}
        onPickerOpenChange={setIsDatePickerOpen}
        pickerKey={datePickerKey}
        locale={language}
        pickerLabels={{
          title: t("gallery.toolbar.go_to_date"),
          description: t("gallery.timeline.description"),
          openYear: (year) => t("gallery.timeline.open_year", { year }),
          count: (count) =>
            t(count > 1 ? "gallery.toolbar.count_many" : "gallery.toolbar.count_one", {
              count: count.toLocaleString(language),
            }),
        }}
      />

      {/* Visionneuse de fichiers */}
      <FileViewer
        file={viewerFile}
        presentation={viewerPresentation}
        onPresentationChange={setViewerPresentation}
        onClose={closeViewerFile}
        onDelete={handleDeleteFile}
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

      {/* Toolbar de sélection */}
      {isSelectionMode && hasSelection && (
        <SelectionToolbar
          selectedFiles={getSelectedFilesData(uniqueFiles)}
          selectedCount={selectedCount}
          onClearSelection={clearSelection}
          onCopyUrls={handleCopySelectedUrls}
          onDeleteSelected={handleDeleteSelected}
          onToggleStarSelected={handleToggleStarSelected}
          onToggleSecuritySelected={handleToggleSecuritySelected}
          onAddToAlbum={handleAddToAlbum}
          onRemoveFromAlbum={handleBulkRemoveFromAlbum}
          onMoveToAlbum={handleMoveToAlbum}
          onShowHelp={() => setIsShortcutsHelpOpen(true)}
        />
      )}

      {/* Dialog d'ajout/déplacement vers un album */}
      <AddToAlbumDialog
        open={isAddToAlbumDialogOpen}
        onClose={() => {
          setIsAddToAlbumDialogOpen(false);
          setFilesToAddToAlbum([]);
          setIsMoveMode(false);
        }}
        selectedFiles={filesToAddToAlbum}
        excludeAlbumIds={[albumId]}
        onSuccess={handleAddToAlbumSuccess}
      />

      {/* Dialog des raccourcis clavier */}
      <KeyboardShortcutsDialog
        open={isShortcutsHelpOpen}
        onClose={() => setIsShortcutsHelpOpen(false)}
        shortcuts={shortcuts}
      />
    </div>
  );
}
