"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Plus, FolderOpen, Search, Grid, List } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";
import { CreateAlbumDialog } from "@/components/albums/create-album-dialog";
import { AlbumCard } from "@/components/albums/album-card";
import { Loading } from "@/components/ui/loading";
import type { Album } from "@/types/albums";

export function AlbumsClient() {
  const { data: session } = useSession();
  const { t } = useTranslation();

  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const fetchAlbums = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery) {
        params.set("q", searchQuery);
      }

      const response = await fetch(`/api/albums?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Erreur lors du chargement des albums");
      }

      const data = await response.json();
      setAlbums(data.albums || []);
    } catch (error) {
      console.error("Erreur:", error);
      toast.error("Erreur lors du chargement des albums");
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchAlbums();
  }, [fetchAlbums]);

  const handleCreateAlbum = async (albumData: {
    name: string;
    description?: string;
  }) => {
    try {
      const response = await fetch("/api/albums", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(albumData),
      });

      if (!response.ok) {
        throw new Error("Erreur lors de la création de l'album");
      }

      const newAlbum = await response.json();
      setAlbums([newAlbum, ...albums]);
      setIsCreateDialogOpen(false);
      toast.success(t("albums.create_success"));
    } catch (error) {
      console.error("Erreur:", error);
      toast.error(t("albums.create_error"));
    }
  };

  const handleDeleteAlbum = async (albumId: number) => {
    try {
      const response = await fetch(`/api/albums/${albumId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Erreur lors de la suppression de l'album");
      }

      setAlbums(albums.filter((album) => album.id !== albumId));
      toast.success("Album supprimé avec succès");
    } catch (error) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de la suppression de l'album");
    }
  };

  const filteredAlbums = albums.filter((album) =>
    album.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <Loading fullHeight />;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* En-tête */}
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{t("albums.title")}</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Organisez vos fichiers en albums pour un accès facile
          </p>
        </div>
        <Button
          onClick={() => setIsCreateDialogOpen(true)}
          className="w-full sm:w-auto text-sm"
        >
          <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
          {t("albums.create")}
        </Button>
      </div>

      {/* Barre de recherche et contrôles */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un album..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 sm:pl-10 text-sm"
          />
        </div>

        <div className="flex items-center justify-between sm:justify-start gap-2">
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9"
              onClick={() => setViewMode("grid")}
            >
              <Grid className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9"
              onClick={() => setViewMode("list")}
            >
              <List className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </div>

          <Badge variant="secondary" className="text-xs sm:text-sm">
            {filteredAlbums.length} album(s)
          </Badge>
        </div>
      </div>

      {/* Contenu */}
      {filteredAlbums.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 sm:py-24 text-center px-4">
          <FolderOpen className="h-8 w-8 sm:h-12 sm:w-12 text-muted-foreground mb-3 sm:mb-4" />
          <div className="space-y-2">
            <h3 className="text-base sm:text-lg font-semibold">
              {searchQuery ? "Aucun album trouvé" : t("albums.no_albums.title")}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-md">
              {searchQuery
                ? `Aucun album ne correspond à "${searchQuery}"`
                : t("albums.no_albums.description")}
            </p>
            {!searchQuery && (
              <Button
                onClick={() => setIsCreateDialogOpen(true)}
                className="mt-3 sm:mt-4 text-sm"
              >
                <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                {t("albums.create")}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6"
              : "space-y-3 sm:space-y-4"
          }
        >
          {filteredAlbums.map((album) => (
            <AlbumCard
              key={album.id}
              album={album}
              viewMode={viewMode}
              onDelete={() => handleDeleteAlbum(album.id)}
              onEdit={() => {
                // TODO: Implémenter l'édition
                toast.info("Édition d'album (À implémenter)");
              }}
            />
          ))}
        </div>
      )}

      {/* Dialog de création d'album */}
      <CreateAlbumDialog
        open={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onSubmit={handleCreateAlbum}
      />
    </div>
  );
}
