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
    <div className="p-8">
      {/* Breadcrumb */}
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/albums">{t("albums.title")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{album.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* En-tête de l'album */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{album.name}</h1>
              <Badge variant="secondary">
                {t("albums.files_count", { count: files.length })}
              </Badge>
            </div>
            {album.description && (
              <p className="text-muted-foreground mt-1">{album.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ViewSelector />

          <Button variant="outline" size="icon">
            <Edit2 className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={handleDeleteAlbum}
            className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Ajouter des fichiers
          </Button>
        </div>
      </div>

      {/* Contenu de l'album */}
      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
            <Plus className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Album vide</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Cet album ne contient aucun fichier. Ajoutez des fichiers depuis
              la galerie ou utilisez le bouton "Ajouter des fichiers".
            </p>
            <Button className="mt-4">
              <Plus className="h-4 w-4 mr-2" />
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


