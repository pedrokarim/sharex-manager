"use client";

import { useCallback, useState } from "react";

/**
 * Fenêtre ouverte sur un objet (le dossier à renommer, la page à supprimer).
 * L'objet reste connu pendant la fermeture : le texte de la fenêtre ne change
 * pas sous les yeux le temps qu'elle disparaisse.
 */
export function useDialogTarget<T>() {
  const [target, setTarget] = useState<T | null>(null);
  const [open, setOpen] = useState(false);

  const show = useCallback((next: T) => {
    setTarget(next);
    setOpen(true);
  }, []);

  return { target, open, show, onOpenChange: setOpen };
}
