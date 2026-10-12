"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "../lib/client";
import { ASSET_KINDS, KIT_LIMITS, type AssetKind, type KitSummary } from "../lib/types";
import { ASSET_KIND_LABELS, galleryThumbnail } from "./asset-intake";

const NEW_KIT = "__new__";

/**
 * Arrivée depuis la galerie (« Ajouter à une image de marque ») : on choisit
 * la marque et le type d'image, puis chaque fichier est copié dans la marque.
 */
export function GalleryAssetsDialog({
  files,
  kits,
  onClose,
  onDone,
}: {
  files: string[] | null;
  kits: KitSummary[] | null;
  onClose: () => void;
  onDone: (kitId: string) => void;
}) {
  const open = files !== null;
  const [kitId, setKitId] = useState("");
  const [newName, setNewName] = useState("");
  const [kind, setKind] = useState<AssetKind>("logo");
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !kits) return;
    setKitId((kits.find((kit) => kit.isDefault) ?? kits[0])?.id ?? NEW_KIT);
    setKind(files && files.length > 1 ? "reference" : "logo");
    setNewName("");
    setProgress(null);
  }, [open, kits, files]);

  const count = files?.length ?? 0;
  const ready = kitId === NEW_KIT ? Boolean(newName.trim()) : Boolean(kitId);

  const submit = async () => {
    if (!files || !ready || progress !== null) return;
    setProgress(0);
    try {
      const target = kitId === NEW_KIT ? (await api.createKit({ name: newName.trim() })).id : kitId;
      const failures: string[] = [];
      for (const [index, name] of files.entries()) {
        try {
          await api.importGalleryAsset(target, { name, kind });
        } catch (error) {
          failures.push(errorMessage(error, name));
        }
        setProgress(index + 1);
      }
      const added = files.length - failures.length;
      if (added > 0) toast.success(added > 1 ? `${added} images ajoutées à la marque` : "Image ajoutée à la marque");
      if (failures.length > 0) toast.error(failures[0]);
      onDone(target);
    } catch (error) {
      toast.error(errorMessage(error, "Ajout impossible."));
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && progress === null && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter à une image de marque</DialogTitle>
          <DialogDescription>
            {count > 1 ? `${count} images de la galerie` : "Une image de la galerie"}, copiées dans la marque choisie.
          </DialogDescription>
        </DialogHeader>

        {files && files.length > 0 && (
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {files.slice(0, 12).map((name) => (
              <li key={name} className="size-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- vignette de la galerie */}
                <img src={galleryThumbnail(name)} alt={name} className="h-full w-full object-cover" />
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Image de marque</Label>
            <Select value={kitId} onValueChange={setKitId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisir une marque" />
              </SelectTrigger>
              <SelectContent>
                {(kits ?? []).map((kit) => (
                  <SelectItem key={kit.id} value={kit.id}>
                    {kit.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_KIT}>Nouvelle image de marque…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Type d’image</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as AssetKind)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_KINDS.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {ASSET_KIND_LABELS[entry]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {kitId === NEW_KIT && (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="brand-kit-gallery-name">Nom de la nouvelle marque</Label>
              <Input id="brand-kit-gallery-name" value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={KIT_LIMITS.name} autoFocus />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={progress !== null}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} disabled={!ready || progress !== null} className="gap-2">
            {progress !== null && <Loader2 className="size-4 animate-spin" />}
            {progress !== null ? `${progress}/${count}` : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
