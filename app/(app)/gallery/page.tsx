"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ImageOff, RefreshCcw } from "lucide-react";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { SidebarHeader } from "@/components/sidebar/sibebar-header";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useQueryState } from "nuqs";
import { ViewSelector } from "@/components/view-selector";
import { GridView } from "@/components/gallery/grid-view";
import { ListView } from "@/components/gallery/list-view";
import { FileViewer } from "@/components/gallery/file-viewer";
import { FileUploader } from "@/components/gallery/file-uploader";
import { UploadZone } from "@/components/gallery/upload-zone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface FileInfo {
  name: string;
  url: string;
  size: number;
  createdAt: string;
}

interface GroupedFiles {
  [key: string]: FileInfo[];
}

export default function GalleryPage() {
  const { data: session, status } = useSession();
  const [search] = useQueryState("q");
  const [hasMore, setHasMore] = useState(true);
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [page, setPage] = useState(1);
  const [viewMode] = useQueryState<"grid" | "list" | "details">("view", {
    defaultValue: "grid",
    parse: (value): "grid" | "list" | "details" => {
      if (value === "grid" || value === "list" || value === "details") {
        return value;
      }
      return "grid";
    },
  });
  const [refreshInterval, setRefreshInterval] = useState<string>("0");
  const [newFileIds, setNewFileIds] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const resetSearch = () => {
    setPage(1);
    setHasMore(true);
  };

  useEffect(() => {
    resetSearch();
    fetchFiles(1);
  }, [search]);

  const fetchFiles = async (page: number) => {
    try {
      const res = await fetch(`/api/files?page=${page}&q=${search || ""}`);
      const data = await res.json();
      setHasMore(data.hasMore);
      return data.files;
    } catch (error) {
      console.error("Erreur lors du chargement des fichiers:", error);
      return [];
    }
  };

  const {
    data: files,
    loading,
    ref,
    reset,
  } = useInfiniteScroll<FileInfo>({
    initialData: [],
    fetchMore: fetchFiles,
    hasMore,
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      redirect("/login");
    }
  }, [status]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const newFiles = await fetchFiles(1);
      await reset(newFiles);
      setPage(1);
      setHasMore(true);
    } catch (error) {
      console.error("Erreur lors du rafraîchissement:", error);
      toast.error("Erreur lors du rafraîchissement de la galerie");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Rafraîchissement automatique
  useEffect(() => {
    const interval = parseInt(refreshInterval);
    if (interval === 0) return;

    const timer = setInterval(handleRefresh, interval * 1000);
    return () => clearInterval(timer);
  }, [refreshInterval]);

  // Écouter l'événement filesUploaded
  useEffect(() => {
    const handleFilesUploaded = (event: Event) => {
      const customEvent = event as CustomEvent<{ files: FileInfo[] }>;
      const newIds = customEvent.detail.files.map((file) => file.name);
      setNewFileIds(newIds);
      handleRefresh();

      // Retirer les IDs après l'animation
      setTimeout(() => {
        setNewFileIds([]);
      }, 2000);
    };

    window.addEventListener("filesUploaded", handleFilesUploaded);
    return () => {
      window.removeEventListener("filesUploaded", handleFilesUploaded);
    };
  }, []);

  // Grouper les fichiers par date
  const groupedFiles = useMemo(() => {
    return files.reduce((acc: GroupedFiles, file) => {
      const date = format(parseISO(file.createdAt), "MMMM yyyy", {
        locale: fr,
      });
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(file);
      return acc;
    }, {});
  }, [files]);

  // Fonction pour trouver l'index du fichier sélectionné
  const findCurrentFileIndex = () => {
    if (!selectedFile) return -1;
    return files.findIndex((f) => f.name === selectedFile.name);
  };

  // Navigation entre les fichiers
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

  // Modification du handleDelete
  const handleDelete = async (filename: string) => {
    try {
      const response = await fetch(`/api/files/${filename}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Fichier supprimé avec succès");
        setSelectedFile(null);
        fetchFiles(1);
      }
    } catch (error) {
      toast.error("Une erreur est survenue lors de la suppression");
    }
  };

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copiée dans le presse-papier");
  };

  return (
    <>
      <UploadZone>
        <div className="p-8">
          <div className="mb-8 flex items-center justify-between">
            <h1 className="text-2xl font-bold">Galerie d'images</h1>
            <div className="flex items-center gap-4">
              <ViewSelector />

              <Select
                value={refreshInterval}
                onValueChange={setRefreshInterval}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Rafraîchissement auto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Pas de rafraîchissement</SelectItem>
                  <SelectItem value="5">Toutes les 5 secondes</SelectItem>
                  <SelectItem value="10">Toutes les 10 secondes</SelectItem>
                  <SelectItem value="15">Toutes les 15 secondes</SelectItem>
                </SelectContent>
              </Select>

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
            </div>
          </div>

          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center space-y-4 py-24 text-center">
              <ImageOff className="h-12 w-12 text-muted-foreground" />
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Aucune image</h3>
                <p className="text-sm text-muted-foreground">
                  Commencez à uploader des images avec ShareX
                </p>
              </div>
            </div>
          ) : (
            Object.entries(groupedFiles).map(([date, filesInGroup]) => (
              <div key={date} className="mb-8">
                <h2 className="mb-4 text-xl font-semibold">{date}</h2>
                {!viewMode || viewMode === "grid" ? (
                  <GridView
                    files={filesInGroup}
                    onCopy={copyToClipboard}
                    onDelete={(name) =>
                      setSelectedFile(
                        files.find((f) => f.name === name) || null
                      )
                    }
                    onSelect={setSelectedFile}
                    newFileIds={newFileIds}
                  />
                ) : (
                  <ListView
                    files={filesInGroup}
                    onCopy={copyToClipboard}
                    onDelete={(name) =>
                      setSelectedFile(
                        files.find((f) => f.name === name) || null
                      )
                    }
                    onSelect={setSelectedFile}
                    detailed={viewMode === "details"}
                    newFileIds={newFileIds}
                  />
                )}
              </div>
            ))
          )}

          {/* État de chargement */}
          <div ref={ref} className="h-10 flex items-center justify-center">
            {loading && (
              <div className="text-muted-foreground">Chargement...</div>
            )}
          </div>
        </div>
      </UploadZone>

      <FileViewer
        file={selectedFile}
        onClose={() => setSelectedFile(null)}
        onDelete={handleDelete}
        onCopy={copyToClipboard}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={findCurrentFileIndex() > 0}
        hasNext={findCurrentFileIndex() < files.length - 1}
      />
    </>
  );
}
