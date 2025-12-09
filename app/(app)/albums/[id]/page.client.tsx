"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Edit2, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { GridView } from "@/components/gallery/grid-view";
import { ListView } from "@/components/gallery/list-view";
import { ViewSelector } from "@/components/view-selector";
import { useTranslation } from "@/lib/i18n";
import { Loading } from "@/components/ui/loading";
import type { Album } from "@/types/albums";
import type { FileInfo } from "@/types/files";

interface AlbumViewClientProps {
  albumId: number;
}

export function AlbumViewClient({ albumId }: AlbumViewClientProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const [album, setAlbum] = useState<Album | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const fetchAlbumData = useCallback(async () => {
    try {
      setLoading(true);

      // Récupérer les données de l'album
      const albumResponse = await fetch(`/api/albums/${albumId}`);
      if (!albumResponse.ok) {
        if (albumResponse.status === 404) {
          toast.error("Album introuvable");
          router.push("/albums");
          return;
        }
        throw new Error("Erreur lors du chargement de l'album");
      }

      const albumData = await albumResponse.json();
      setAlbum(albumData);

      // Récupérer les fichiers de l'album
      const filesResponse = await fetch(`/api/albums/${albumId}/files`);
      if (!filesResponse.ok) {
        throw new Error("Erreur lors du chargement des fichiers");
      }

      const filesData = await filesResponse.json();

      // Transformer les noms de fichiers en objets FileInfo
      // Pour l'instant, on simule les données FileInfo
      // TODO: Implémenter une vraie API qui retourne les FileInfo complets
      const fileInfos: FileInfo[] = filesData.files.map((fileName: string) => ({
        name: fileName,
        url: `/api/files/${encodeURIComponent(fileName)}`,
        size: 0, // TODO: Récupérer la vraie taille
        createdAt: new Date().toISOString(), // TODO: Récupérer la vraie date
        isSecure: false, // TODO: Récupérer le vrai statut
        isStarred: false, // TODO: Récupérer le vrai statut
      }));

      setFiles(fileInfos);
    } catch (error) {
      console.error("Erreur:", error);
      toast.error("Erreur lors du chargement de l'album");
    } finally {
      setLoading(false);
    }
  }, [albumId, router]);

  useEffect(() => {
    fetchAlbumData();
  }, [fetchAlbumData]);

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
        throw new Error("Erreur lors de la suppression du fichier de l'album");
      }

      setFiles(files.filter((file) => file.name !== fileName));
      toast.success("Fichier retiré de l'album");
    } catch (error) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de la suppression du fichier de l'album");
    }
  };

  const handleDeleteAlbum = async () => {
    try {
      const response = await fetch(`/api/albums/${albumId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Erreur lors de la suppression de l'album");
      }

      toast.success("Album supprimé avec succès");
      router.push("/albums");
    } catch (error) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de la suppression de l'album");
    }
  };

  if (loading) {
    return <Loading fullHeight />;
  }

  if (!album) {
    return null;
  }

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb className="mb-4 sm:mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/albums" className="text-sm">
              {t("albums.title")}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="text-sm truncate">
              {album.name}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

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
              <Badge variant="secondary" className="text-xs sm:text-sm w-fit">
                {t("albums.files_count", { count: files.length })}
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

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-9"
          >
            <Edit2 className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={handleDeleteAlbum}
            className="h-8 w-8 sm:h-9 sm:w-9 text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>

          <Button className="text-xs sm:text-sm h-8 sm:h-9">
            <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Ajouter des fichiers</span>
            <span className="sm:hidden">Ajouter</span>
          </Button>
        </div>
      </div>

      {/* Contenu de l'album */}
      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 sm:py-24 text-center px-4">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg bg-primary/10 flex items-center justify-center mb-3 sm:mb-4">
            <Plus className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h3 className="text-base sm:text-lg font-semibold">Album vide</h3>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-md">
              Cet album ne contient aucun fichier. Ajoutez des fichiers depuis
              la galerie ou utilisez le bouton "Ajouter des fichiers".
            </p>
            <Button className="mt-3 sm:mt-4 text-sm">
              <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
              Ajouter des fichiers
            </Button>
          </div>
        </div>
      ) : (
        <div>
          {viewMode === "grid" ? (
            <GridView
              files={files}
              onCopy={() => {}} // TODO: Implémenter
              onDelete={handleRemoveFromAlbum}
              onSelect={() => {}} // TODO: Implémenter
              onToggleSecurity={() => Promise.resolve()} // TODO: Implémenter
              onToggleStar={() => Promise.resolve()} // TODO: Implémenter
              newFileIds={[]}
            />
          ) : (
            <ListView
              files={files}
              onCopy={() => {}} // TODO: Implémenter
              onDelete={handleRemoveFromAlbum}
              onSelect={() => {}} // TODO: Implémenter
              onToggleSecurity={() => Promise.resolve()} // TODO: Implémenter
              onToggleStar={() => Promise.resolve()} // TODO: Implémenter
              newFileIds={[]}
            />
          )}
        </div>
      )}
    </div>
  );
}
