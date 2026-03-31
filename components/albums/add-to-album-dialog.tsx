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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
    album.name.toLowerCase().includes(searchQuery.toLowerCase()),
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
          `${selectedFiles.length} fichier(s) ajouté(s) à l'album "${albumNames}"`,
        );
      } else {
        toast.success(
          `${selectedFiles.length} fichier(s) ajouté(s) à ${selectedAlbums.size} albums`,
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
        <DialogContent className="flex max-h-[min(86vh,720px)] w-[calc(100vw-1.5rem)] max-w-[720px] flex-col gap-0 overflow-hidden rounded-2xl border border-border/70 p-0 shadow-2xl">
          <DialogHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
            <DialogTitle className="text-lg sm:text-xl">
              Ajouter à un album
            </DialogTitle>
            <DialogDescription className="text-sm">
              Sélectionnez un ou plusieurs albums pour y ajouter{" "}
              {selectedFiles.length} fichier(s)
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 py-4 sm:px-6">
            {/* Recherche */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher un album..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 rounded-xl border-border/70 bg-muted/20 pl-10 text-sm"
              />
            </div>

            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground sm:text-sm">
              <span>
                {filteredAlbums.length} album
                {filteredAlbums.length > 1 ? "s" : ""} disponible
                {filteredAlbums.length > 1 ? "s" : ""}
              </span>
              {selectedAlbums.size > 0 && (
                <Badge variant="secondary" className="rounded-full px-2.5 py-1">
                  {selectedAlbums.size} sélectionné
                  {selectedAlbums.size > 1 ? "s" : ""}
                </Badge>
              )}
            </div>

            {/* Liste des albums */}
            {loading ? (
              <div className="flex flex-1 items-center justify-center py-6 sm:py-8">
                <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" />
              </div>
            ) : (
              <ScrollArea className="min-h-0 flex-1 pr-1">
                <div className="space-y-2 pb-1">
                  {filteredAlbums.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 py-8 text-center text-sm text-muted-foreground">
                      {searchQuery ? "Aucun album trouvé" : "Aucun album créé"}
                    </div>
                  ) : (
                    filteredAlbums.map((album) => (
                      <button
                        type="button"
                        key={album.id}
                        className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-all ${
                          selectedAlbums.has(album.id)
                            ? "border-primary/40 bg-primary/8 shadow-sm"
                            : "border-border/60 bg-background hover:border-foreground/10 hover:bg-muted/30"
                        }`}
                        onClick={() => toggleAlbum(album.id)}
                        aria-pressed={selectedAlbums.has(album.id)}
                      >
                        <div className="flex-shrink-0">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-muted/30">
                            <FolderOpen className="h-4 w-4 text-primary" />
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium sm:text-base">
                              {album.name}
                            </span>
                            <Badge variant="secondary" className="text-[11px]">
                              {album.fileCount}
                            </Badge>
                          </div>
                          {album.description && (
                            <p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">
                              {album.description}
                            </p>
                          )}
                        </div>

                        {selectedAlbums.has(album.id) && (
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                            <Check className="h-4 w-4 text-primary" />
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            )}
          </div>

          <DialogFooter className="border-t border-border/60 bg-muted/20 px-5 py-4 sm:px-6">
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="outline"
                className="text-sm"
                onClick={() => setIsCreateDialogOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Nouvel album
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={handleClose}
                  disabled={adding}
                  className="text-sm"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleAddToAlbums}
                  disabled={selectedAlbums.size === 0 || adding}
                  className="text-sm"
                >
                  {adding && (
                    <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 mr-2 animate-spin" />
                  )}
                  {selectedAlbums.size === 1
                    ? "Ajouter à l'album"
                    : `Ajouter à ${selectedAlbums.size} albums`}
                </Button>
              </div>
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
