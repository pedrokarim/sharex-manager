"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Search, FolderOpen, Plus, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";
import { CreateAlbumDialog } from "./create-album-dialog";
import type { Album } from "@/types/albums";

interface AddToAlbumDialogProps {
  open: boolean;
  onClose: () => void;
  selectedFiles: string[];
  onSuccess?: () => void;
}

export function AddToAlbumDialog({
  open,
  onClose,
  selectedFiles,
  onSuccess,
}: AddToAlbumDialogProps) {
  const { t } = useTranslation();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAlbums, setSelectedAlbums] = useState<Set<number>>(new Set());
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const fetchAlbums = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/albums");
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
  };

  useEffect(() => {
    if (open) {
      fetchAlbums();
    }
  }, [open]);

  const filteredAlbums = albums.filter((album) =>
    album.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddToAlbums = async () => {
    if (selectedAlbums.size === 0) return;

    try {
      setAdding(true);
      const promises = Array.from(selectedAlbums).map(async (albumId) => {
        const response = await fetch(`/api/albums/${albumId}/files`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fileNames: selectedFiles }),
        });

        if (!response.ok) {
          throw new Error(`Erreur pour l'album ${albumId}`);
        }

        return response.json();
      });

      await Promise.all(promises);

      const albumNames = albums
        .filter((album) => selectedAlbums.has(album.id))
        .map((album) => album.name)
        .join(", ");

      if (selectedAlbums.size === 1) {
        toast.success(
          `${selectedFiles.length} fichier(s) ajouté(s) à l'album "${albumNames}"`
        );
      } else {
        toast.success(
          `${selectedFiles.length} fichier(s) ajouté(s) à ${selectedAlbums.size} albums`
        );
      }

      onSuccess?.();
      handleClose();
    } catch (error) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de l'ajout des fichiers aux albums");
    } finally {
      setAdding(false);
    }
  };

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
      setSelectedAlbums(new Set([newAlbum.id]));
      setIsCreateDialogOpen(false);
      toast.success(t("albums.create_success"));
    } catch (error) {
      console.error("Erreur:", error);
      toast.error(t("albums.create_error"));
    }
  };

  const handleClose = () => {
    setSelectedAlbums(new Set());
    setSearchQuery("");
    onClose();
  };

  const toggleAlbum = (albumId: number) => {
    setSelectedAlbums((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(albumId)) {
        newSet.delete(albumId);
      } else {
        newSet.add(albumId);
      }
      return newSet;
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="w-[95vw] max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">
              Ajouter à un album
            </DialogTitle>
            <DialogDescription className="text-sm">
              Sélectionnez un ou plusieurs albums pour y ajouter{" "}
              {selectedFiles.length} fichier(s)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Recherche */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un album..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 sm:pl-10 text-sm"
              />
            </div>

            {/* Liste des albums */}
            {loading ? (
              <div className="flex items-center justify-center py-6 sm:py-8">
                <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" />
              </div>
            ) : (
              <ScrollArea className="h-48 sm:h-64">
                <div className="space-y-2">
                  {filteredAlbums.length === 0 ? (
                    <div className="text-center py-6 sm:py-8 text-muted-foreground text-sm">
                      {searchQuery ? "Aucun album trouvé" : "Aucun album créé"}
                    </div>
                  ) : (
                    filteredAlbums.map((album) => (
                      <div
                        key={album.id}
                        className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedAlbums.has(album.id)
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-accent/50"
                        }`}
                        onClick={() => toggleAlbum(album.id)}
                      >
                        <div className="flex-shrink-0">
                          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded bg-primary/10 flex items-center justify-center">
                            <FolderOpen className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 sm:gap-2">
                            <span className="font-medium truncate text-sm sm:text-base">
                              {album.name}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {album.fileCount}
                            </Badge>
                          </div>
                          {album.description && (
                            <p className="text-xs sm:text-sm text-muted-foreground truncate">
                              {album.description}
                            </p>
                          )}
                        </div>

                        {selectedAlbums.has(album.id) && (
                          <Check className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            )}

            {/* Bouton créer un nouvel album */}
            <div>
              <Separator className="mb-3" />
              <Button
                variant="outline"
                className="w-full text-sm"
                onClick={() => setIsCreateDialogOpen(true)}
              >
                <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                {t("albums.create")}
              </Button>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2">
            {selectedAlbums.size > 0 && (
              <div className="text-xs sm:text-sm text-muted-foreground">
                {selectedAlbums.size} album(s) sélectionné(s)
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={adding}
                className="w-full sm:w-auto text-sm"
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleAddToAlbums}
                disabled={selectedAlbums.size === 0 || adding}
                className="w-full sm:w-auto text-sm"
              >
                {adding && (
                  <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 mr-2 animate-spin" />
                )}
                {selectedAlbums.size === 1
                  ? "Ajouter à l'album"
                  : `Ajouter à ${selectedAlbums.size} albums`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de création d'album */}
      <CreateAlbumDialog
        open={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onSubmit={handleCreateAlbum}
      />
    </>
  );
}
