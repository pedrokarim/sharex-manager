"use client";

import { useState } from "react";
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

interface CreateAlbumDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; description?: string }) => Promise<void>;
}

export function CreateAlbumDialog({
  open,
  onClose,
  onSubmit,
}: CreateAlbumDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

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
      <DialogContent className="w-[95vw] max-w-md mx-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">
              {t("albums.create_album")}
            </DialogTitle>
            <DialogDescription className="text-sm">
              Créez un nouvel album pour organiser vos fichiers
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
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
                className="text-sm"
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
                className="text-sm"
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
              className="w-full sm:w-auto text-sm"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full sm:w-auto text-sm"
            >
              {loading && (
                <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 mr-2 animate-spin" />
              )}
              {t("albums.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
