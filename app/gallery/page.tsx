"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ImageOff } from "lucide-react";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { SidebarHeader } from "@/components/sidebar/sibebar-header";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useQueryState } from "nuqs";
import { ViewSelector } from "@/components/view-selector";
import { GridView } from "@/components/gallery/grid-view";
import { ListView } from "@/components/gallery/list-view";
import { FileViewer } from "@/components/gallery/file-viewer";

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
    reset
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
      <div className="flex flex-1">
        <AppSidebar />
        <SidebarInset>
          <SidebarHeader showSearch={true} />
          <div className="container mx-auto p-8">
            <div className="mb-8 flex items-center justify-between">
              <h1 className="text-2xl font-bold">Galerie d'images</h1>
              <div className="flex items-center gap-4">
                <ViewSelector />
                <Button onClick={() => window.location.reload()}>
                  Rafraîchir
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
                  {(!viewMode || viewMode === "grid") ? (
                    <GridView
                      files={filesInGroup}
                      onCopy={copyToClipboard}
                      onDelete={(name) => setSelectedFile(files.find(f => f.name === name) || null)}
                      onSelect={setSelectedFile}
                    />
                  ) : (
                    <ListView
                      files={filesInGroup}
                      onCopy={copyToClipboard}
                      onDelete={(name) => setSelectedFile(files.find(f => f.name === name) || null)}
                      onSelect={setSelectedFile}
                      detailed={viewMode === "details"}
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
        </SidebarInset>

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
      </div>
    </>
  );
}
