"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { PickedImage } from "../components/image-picker";
import {
  readFileAsBase64,
  remoteImageToBase64,
  sameOriginImageToBase64,
} from "./client";

interface ImageIntakeOptions {
  /** Faux quand le moteur choisi n'accepte pas d'image de départ. */
  enabled: boolean;
  /** Places encore libres dans le compositeur. */
  capacity: number;
  onImages: (images: PickedImage[]) => void;
  /** Explique pourquoi un dépôt est refusé. */
  disabledReason?: string;
  /** Vrai pendant qu'une fenêtre (le sélecteur) gère elle-même ses dépôts. */
  paused?: boolean;
}

/**
 * Fait de toute la page une zone de dépôt, et accepte le collage d'image.
 *
 * Trois cas au dépôt : un fichier venu du bureau, une image glissée depuis un
 * autre onglet (le navigateur ne transmet alors que son URL) et un rendu du
 * studio glissé depuis le fil. Les URL de même origine sont lues directement,
 * les autres passent par le serveur.
 */
export function useImageIntake({
  enabled,
  capacity,
  onImages,
  disabledReason,
  paused = false,
}: ImageIntakeOptions) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const depth = useRef(0);

  // Les écouteurs sont posés une seule fois : ils lisent l'état courant via
  // cette référence plutôt que de se réabonner à chaque rendu.
  const latest = useRef({ enabled, capacity, onImages, disabledReason, paused });
  latest.current = { enabled, capacity, onImages, disabledReason, paused };

  useEffect(() => {
    const carriesImage = (event: DragEvent) => {
      if (latest.current.paused) return false;
      const types = Array.from(event.dataTransfer?.types ?? []);
      return types.includes("Files") || types.includes("text/uri-list");
    };

    const ingest = async (task: () => Promise<PickedImage[]>) => {
      const { enabled, capacity, disabledReason } = latest.current;
      if (!enabled) {
        toast.info(disabledReason ?? "Ce moteur n'accepte pas d'image de départ");
        return;
      }
      if (capacity <= 0) {
        toast.info("Le compositeur a déjà son maximum d'images");
        return;
      }
      setBusy(true);
      try {
        const images = await task();
        if (images.length) latest.current.onImages(images.slice(0, capacity));
      } catch (error: any) {
        toast.error(error?.message ?? "Import de l'image impossible");
      } finally {
        setBusy(false);
      }
    };

    const fromFiles = (files: File[]) =>
      Promise.all(
        files
          .filter((file) => file.type.startsWith("image/"))
          .map(async (file) => ({
            ...(await readFileAsBase64(file)),
            name: file.name || "image collée",
          }))
      );

    const fromUrl = async (raw: string): Promise<PickedImage[]> => {
      const url = new URL(raw, window.location.href);
      if (url.origin === window.location.origin) {
        const image = await sameOriginImageToBase64(url.pathname + url.search);
        return [{ ...image, name: url.pathname.split("/").pop() ?? "image" }];
      }
      return [await remoteImageToBase64(url.toString())];
    };

    const onDragEnter = (event: DragEvent) => {
      if (!carriesImage(event)) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!carriesImage(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = latest.current.enabled ? "copy" : "none";
      }
    };

    const onDragLeave = (event: DragEvent) => {
      if (!carriesImage(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };

    const onDrop = (event: DragEvent) => {
      if (!carriesImage(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);

      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length) {
        void ingest(() => fromFiles(files));
        return;
      }
      const uri = (event.dataTransfer?.getData("text/uri-list") ?? "")
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith("#"));
      if (uri) void ingest(() => fromUrl(uri));
    };

    const onPaste = (event: ClipboardEvent) => {
      if (latest.current.paused) return;
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      // Un collage de texte suit son cours normal dans le champ du prompt.
      if (!files.length) return;
      event.preventDefault();
      void ingest(() => fromFiles(files));
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, []);

  return { dragging, busy };
}
