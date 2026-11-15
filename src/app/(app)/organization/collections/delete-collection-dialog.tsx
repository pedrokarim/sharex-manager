"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import type { Collection } from "@/lib/organization/types";
import { deleteCollection } from "./collection-api";

/**
 * Confirmation de suppression, qui nomme la collection. Un échec s'affiche
 * dans la fenêtre, qui reste ouverte ; une réussite la ferme et laisse
 * l'écran retirer la collection.
 */
export function DeleteCollectionDialog({
  collection,
  onOpenChange,
  onDeleted,
}: {
  /** La collection à supprimer ; `null` ferme la fenêtre. */
  collection: Pick<Collection, "id" | "name"> | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();

  const confirm = async () => {
    if (!collection) return;
    feedback.clear();
    setBusy(true);
    try {
      await deleteCollection(collection.id);
      onDeleted(collection.id);
      onOpenChange(false);
    } catch (error) {
      feedback.error(errorMessage(error, "La collection n’a pas pu être supprimée."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog
      open={collection !== null}
      onOpenChange={(open) => {
        if (!open) feedback.clear();
        onOpenChange(open);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">
            Supprimer la collection «&nbsp;{collection?.name}&nbsp;»&nbsp;?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Les fichiers restent dans la galerie, avec leurs tags. Seule la sélection enregistrée disparaît.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormStatus state={feedback.state} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
          <Button variant="destructive" loading={busy} onClick={() => void confirm()}>
            Supprimer la collection
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
