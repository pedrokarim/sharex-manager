"use client";

/**
 * Images choisies par le sélecteur commun (`ImagePickerDialog`) ou déposées
 * sur la page, rangées dans une marque ou jointes à l'assistant.
 */

import type { PickedImage } from "@/components/gallery/image-picker-dialog";
import { api, uploadImage } from "../lib/client";
import type { AssetKind, BrandKit } from "../lib/types";

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

/** Un lien est lu par le navigateur : le site d'origine peut le refuser. */
async function fetchImage(url: string): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image inaccessible (HTTP ${response.status})`);
  const blob = await response.blob();
  const extension = EXTENSIONS[blob.type];
  if (!extension) throw new Error("Ce lien ne mène pas à une image PNG, JPEG, WebP ou GIF.");
  const base = decodeURIComponent(new URL(url, window.location.href).pathname.split("/").pop() ?? "").replace(/\.[a-z0-9]+$/i, "") || "image";
  return new File([blob], `${base.slice(0, 60)}.${extension}`, { type: blob.type });
}

/** Fichier ou lien : déposé dans le dépôt du module. Galerie : désignée par son nom. */
export async function uploadPicked(picked: PickedImage): Promise<{ kind: "upload" | "gallery"; name: string; label: string }> {
  if (picked.kind === "gallery") return { kind: "gallery", name: picked.name, label: picked.name };
  const file = picked.kind === "file" ? picked.file : await fetchImage(picked.url);
  const { file: name } = await uploadImage(file, file.name || "image.png");
  return { kind: "upload", name, label: file.name || "image" };
}

/** Range une image choisie dans la marque, sous le type demandé. */
export async function addPickedToKit(kitId: string, picked: PickedImage, kind: AssetKind): Promise<BrandKit> {
  if (picked.kind === "gallery") return (await api.importGalleryAsset(kitId, { name: picked.name, kind })).kit;
  if (picked.kind === "file" && /\.svg$/i.test(picked.file.name)) return addSvgToKit(kitId, picked.file, kind);
  const reference = await uploadPicked(picked);
  return (await api.registerKitAsset(kitId, { file: reference.name, kind, label: reference.label.replace(/\.[a-z0-9]+$/i, "") })).kit;
}

/** Un SVG est contrôlé puis rastérisé en PNG par le serveur. */
export async function addSvgToKit(kitId: string, file: File, kind: AssetKind): Promise<BrandKit> {
  if (file.size > 1024 * 1024) throw new Error("SVG trop lourd (1 Mo au plus).");
  const svg = await file.text();
  return (await api.importSvgAsset(kitId, { svg, kind, label: file.name.replace(/\.svg$/i, "") })).kit;
}

/** Vignette d'une image de la galerie. */
export const galleryThumbnail = (name: string) => `/api/thumbnails/${encodeURIComponent(name)}`;

export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  logo: "Logo",
  "logo-mark": "Marque réduite",
  "mascot-sheet": "Feuille de la mascotte",
  "mascot-pose": "Pose de la mascotte",
  background: "Fond",
  texture: "Texture",
  reference: "Référence",
};
