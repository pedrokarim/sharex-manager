"use client";

import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface Album {
  id: number;
  name: string;
  description?: string;
}

interface CreateAlbumDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; description?: string }) => Promise<void>;
  album?: Album | null;
}

export function CreateAlbumDialog({
  open,
  onClose,
  onSubmit,
  album,
}: CreateAlbumDialogProps) {
  const { t } = useTranslation();
  const isEditMode = !!album;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  // Pré-remplir le formulaire en mode édition
  useEffect(() => {
    if (open && album) {
      setName(album.name);
      setDescription(album.description || "");
    } else if (open && !album) {
      setName("");
      setDescription("");
    }
  }, [open, album]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
      });

      // Reset form
      setName("");
      setDescription("");
    } catch (error) {
      // L'erreur est gérée par le parent
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setName("");
      setDescription("");
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[560px] overflow-hidden rounded-2xl border border-border/70 p-0 shadow-2xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
            <DialogTitle className="text-lg sm:text-xl">
              {isEditMode
                ? t("albums.edit_album")
                : t("albums.create_album")}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {isEditMode
                ? t("albums.edit_description")
                : t("albums.create_description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 py-5 sm:px-6">
            <div className="space-y-2">
              <Label htmlFor="album-name" className="text-sm">
                {t("albums.album_name")}
              </Label>
              <Input
                id="album-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vacances 2024, Projet, etc."
                required
                disabled={loading}
                className="h-11 rounded-xl border-border/70 bg-muted/20 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="album-description" className="text-sm">
                {t("albums.album_description")}
              </Label>
              <Textarea
                id="album-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description de l'album (optionnel)"
                rows={3}
                disabled={loading}
                className="min-h-[120px] resize-none rounded-xl border-border/70 bg-muted/20 text-sm"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-border/60 bg-muted/20 px-5 py-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
              className="text-sm"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim()}
              className="text-sm"
            >
              {loading && (
                <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 mr-2 animate-spin" />
              )}
              {isEditMode ? t("common.save") : t("albums.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
