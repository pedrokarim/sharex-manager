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
import { useTranslation } from "@/lib/i18n";
import { albumVisibility, type AlbumVisibility } from "@/lib/album-visibility";
import { AlbumVisibilityField } from "./album-visibility";
import { FormStatus, errorMessage, useFeedback } from "@/components/feedback";

interface Album {
  id: number;
  name: string;
  description?: string;
  isPublic?: boolean;
  inCatalog?: boolean;
}

/** Ce que la fenêtre remet à sa page : de quoi créer ou modifier l'album. */
export interface AlbumFormData {
  name: string;
  description?: string;
  visibility: AlbumVisibility;
}

interface CreateAlbumDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Crée ou modifie l'album. En cas d'échec, lever une `Error` dont le message
   * s'adresse à l'utilisateur : la fenêtre l'affiche au-dessus de ses boutons
   * et reste ouverte pour qu'il corrige ou réessaie.
   */
  onSubmit: (data: AlbumFormData) => Promise<void>;
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
  // Un nouvel album naît privé ; en modification, on part de son état.
  const [visibility, setVisibility] = useState<AlbumVisibility>("private");
  const [loading, setLoading] = useState(false);
  // L'échec de l'envoi se lit dans la fenêtre, au-dessus des boutons.
  const feedback = useFeedback();
  const clearFeedback = feedback.clear;

  // Pré-remplir le formulaire en mode édition
  useEffect(() => {
    if (open && album) {
      setName(album.name);
      setDescription(album.description || "");
      setVisibility(albumVisibility(album));
    } else if (open && !album) {
      setName("");
      setDescription("");
      setVisibility("private");
    }
    if (open) clearFeedback();
  }, [open, album, clearFeedback]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      return;
    }

    setLoading(true);
    feedback.clear();
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
      });

      // Reset form
      setName("");
      setDescription("");
    } catch (error) {
      feedback.error(
        errorMessage(
          error,
          isEditMode
            ? "L’album n’a pas pu être modifié. Réessayez."
            : "L’album n’a pas pu être créé. Réessayez.",
        ),
      );
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
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[640px] sm:max-w-[640px] overflow-hidden rounded-2xl border border-border/70 p-0 shadow-2xl">
        <form
          onSubmit={handleSubmit}
          // Corriger sa saisie retire le message d'erreur.
          onChange={feedback.state?.tone === "error" ? feedback.clear : undefined}
        >
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

            <div className="space-y-2">
              <Label className="text-sm">{t("albums.visibility.title")}</Label>
              <AlbumVisibilityField value={visibility} onChange={setVisibility} disabled={loading} />
            </div>
          </div>

          {/* Hors de la pile `space-y` : la marge s'ouvre avec le message. */}
          <FormStatus state={feedback.state} className="px-5 pb-5 sm:px-6" />

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
              loading={loading}
              disabled={!name.trim()}
              className="text-sm"
            >
              {isEditMode ? t("common.save") : t("albums.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
