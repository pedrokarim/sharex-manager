"use client";

/**
 * Ancienne fenêtre « Nouveau clip » : la création a maintenant sa page
 * (`/m/clip-studio/new`, `pages/create.tsx`). Ce composant ne montre plus
 * rien : une demande d'ouverture renvoie vers la page, avec la sélection de
 * la galerie, l'idée préremplie ou le mode demandé. Il reste tant que des
 * écrans l'appellent encore ; les nouveaux liens visent la page directement.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { CreatePrefill } from "../lib/idea-prefill";
import { createRequestHref } from "../lib/create-mode";

export { AssistantProgress } from "./create-options";

export function CreateDialog({
  request,
  onClose,
}: {
  request: { files: string[]; prefill?: CreatePrefill; mode?: "subtitle" | "clipping" } | null;
  onClose: () => void;
  /** Gardés pour les appels existants : la page ouvre elle-même le projet créé. */
  onCreated?: (projectId: string) => void;
  onAssistantStarted?: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!request) return;
    router.push(createRequestHref(request));
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une navigation par demande
  }, [request]);
  return null;
}
