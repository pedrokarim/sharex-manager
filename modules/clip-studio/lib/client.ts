"use client";

import { useEffect, useState } from "react";
import type { BrandPalette, BrandTheme } from "../engine/brand";
import type { ClipAsset, ClipExport, ClipProject, MediaSource } from "../engine/types";
import type { PublishJobSummary } from "@/lib/connections/types";
import type { ExportDetails, ExportPost, PublishTarget } from "./post-types";
import type { DraftRequest, DraftResult } from "./post-draft";
import type { VoiceSettings } from "./voice-settings";

export const MODULE_NAME = "clip-studio";

/** « 3,5 Mo » : taille d'un fichier, écrite à la française. */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

export interface ProjectSummary {
  id: string;
  name: string;
  aspect: ClipProject["aspect"];
  width: number;
  height: number;
  durationFrames: number;
  fps: number;
  itemCount: number;
  cover?: string;
  createdAt: number;
  updatedAt: number;
}

export async function callModule<T = unknown>(
  functionName: string,
  ...args: unknown[]
): Promise<T> {
  return callAnyModule<T>(MODULE_NAME, functionName, ...args);
}

/** Appel d'une fonction d'un autre module (ex. l'historique d'AI Image Gen). */
export async function callAnyModule<T = unknown>(
  moduleName: string,
  functionName: string,
  ...args: unknown[]
): Promise<T> {
  const response = await fetch("/api/modules/call-function", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ moduleName, functionName, args }),
  });
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Réponse illisible du serveur (HTTP ${response.status})`);
  }
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || `Échec de ${functionName}`);
  }
  return payload?.data as T;
}

export function assetUrl(file: string) {
  return `/api/modules/${MODULE_NAME}/data/assets/${file}`;
}

export function exportUrl(file: string) {
  return `/api/modules/${MODULE_NAME}/data/exports/${file}`;
}

export function assetToSource(asset: ClipAsset): MediaSource {
  return {
    url: assetUrl(asset.file),
    ref: `module:${MODULE_NAME}/assets/${asset.file}`,
    name: asset.originalName,
    kind: asset.kind,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    credit: asset.credit,
    // Une image trouvée garde l'état de ses droits jusqu'à la publication (étape 9).
    ...(rightsOf(asset) ? { rights: rightsOf(asset) } : {}),
    words: asset.words,
    ...(asset.speech ? { speech: asset.speech } : {}),
  };
}

/** État des droits d'un média trouvé, rangé dans sa fiche par `importFoundImage`. */
function rightsOf(asset: ClipAsset): MediaSource["rights"] {
  const rights = (asset as ClipAsset & { rights?: unknown }).rights;
  return rights === "free" || rights === "unverified" ? rights : undefined;
}

// ─── Lecture des médias dans le navigateur ───────────────────────

export interface MediaProbe {
  width?: number;
  height?: number;
  durationMs?: number;
}

/** Dimensions et durée d'un média, lues par le navigateur. */
export function probeMedia(url: string, kind: MediaSource["kind"]): Promise<MediaProbe> {
  return new Promise((resolve) => {
    if (kind === "image") {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve({});
      image.src = url;
      return;
    }
    const element = document.createElement(kind === "video" ? "video" : "audio");
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const video = element as HTMLVideoElement;
      resolve({
        width: kind === "video" ? video.videoWidth : undefined,
        height: kind === "video" ? video.videoHeight : undefined,
        durationMs: Number.isFinite(element.duration) ? Math.round(element.duration * 1000) : undefined,
      });
    };
    element.onerror = () => resolve({});
    element.src = url;
  });
}

// ─── Envoi de fichiers ───────────────────────────────────────────

export interface UploadResult {
  file: string;
  kind: "image" | "video" | "audio";
  size: number;
  originalName: string;
  url: string;
  ref: string;
}

/** Dépose un fichier dans les données du module, avec suivi de progression. */
export function uploadFile(
  file: Blob,
  name: string,
  onProgress?: (ratio: number) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file, name);
    const request = new XMLHttpRequest();
    request.open("POST", `/api/modules/${MODULE_NAME}/upload`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onload = () => {
      let payload: any = null;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        // Réponse non JSON (proxy qui refuse un fichier trop lourd, par exemple).
      }
      if (request.status >= 200 && request.status < 300 && payload) resolve(payload);
      else if (request.status === 413) reject(new Error("Fichier trop lourd pour le serveur"));
      else reject(new Error(payload?.error ?? `Envoi impossible (HTTP ${request.status})`));
    };
    request.onerror = () => reject(new Error("Envoi interrompu"));
    request.send(form);
  });
}

/** Envoie un fichier local et l'enregistre comme média du module. */
export async function importLocalFile(
  file: File,
  onProgress?: (ratio: number) => void
): Promise<ClipAsset> {
  const uploaded = await uploadFile(file, file.name, onProgress);
  const probe = await probeMedia(uploaded.url, uploaded.kind);
  return callModule<ClipAsset>("registerAsset", {
    file: uploaded.file,
    kind: uploaded.kind,
    originalName: file.name,
    size: uploaded.size,
    ...probe,
  });
}

// ─── Sources externes ────────────────────────────────────────────

const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif)$/i;

export interface BrowsableMedia {
  key: string;
  source: MediaSource;
  thumbnail: string;
  caption: string;
  createdAt: number;
}

/** Images des uploads ShareX, les plus récentes d'abord. */
export async function fetchGalleryImages(page: number, query: string) {
  const params = new URLSearchParams({ page: String(page), limit: "36", sort: "date", order: "desc" });
  if (query) params.set("q", query);
  const response = await fetch(`/api/files?${params}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Chargement de la galerie impossible");
  const payload = (await response.json()) as {
    files: { name: string; url: string; createdAt: string }[];
    hasMore: boolean;
  };
  return {
    hasMore: payload.hasMore,
    items: payload.files
      .filter((file) => IMAGE_EXTENSION.test(file.name))
      .map<BrowsableMedia>((file) => ({
        key: `upload:${file.name}`,
        source: { url: file.url, ref: `upload:${file.name}`, name: file.name, kind: "image" },
        thumbnail: `/api/thumbnails/${encodeURIComponent(file.name)}`,
        caption: file.name,
        createdAt: new Date(file.createdAt).getTime(),
      })),
  };
}

/** Rendus d'AI Image Gen, quand le module est installé. */
export async function fetchStudioImages(): Promise<BrowsableMedia[]> {
  const history = await callAnyModule<
    { id: string; prompt: string; imageFiles: string[]; createdAt: number; size: string }[]
  >("ai-image-gen", "getHistory", 300);
  return history.flatMap((item) =>
    item.imageFiles.map((file) => {
      const url = `/api/modules/ai-image-gen/data/images/${file}`;
      const [width, height] = item.size.split("x").map(Number);
      return {
        key: `module:ai-image-gen/images/${file}`,
        source: {
          url,
          ref: `module:ai-image-gen/images/${file}`,
          name: item.prompt.slice(0, 80),
          kind: "image" as const,
          width: width || undefined,
          height: height || undefined,
        },
        thumbnail: url,
        caption: item.prompt,
        createdAt: item.createdAt,
      };
    })
  );
}

// ─── Exports ─────────────────────────────────────────────────────

/** Copie un clip exporté dans la galerie (sans doublon s'il y est déjà). */
export function sendExportToGallery(id: string): Promise<{ fileName: string }> {
  return callModule<{ fileName: string }>("sendExportToGallery", id);
}

/** Ce qui suit un export en plus de la vidéo (dossier 01 ter, § 5). */
export interface ExportExtras {
  /** Crédits relevés dans le projet (`projectCredits`) ; absents : relevés par le serveur. */
  credits?: string[];
  /** Volume mesuré du fichier rendu. */
  loudness?: { lufs: number; peakDb: number };
  /** Sous-titres SubRip (`projectToSrt`) et leur langue (BCP 47). */
  subtitles?: { srt: string; language?: string };
  /** Marque du projet au moment du rendu. */
  brandKitId?: string;
  /** `updatedAt` du projet rendu, pour « le projet a changé depuis cet export ». */
  projectUpdatedAt?: number;
}

export async function saveExport(
  project: ClipProject,
  blob: Blob,
  durationMs: number,
  onProgress?: (ratio: number) => void,
  extras: ExportExtras = {}
): Promise<ClipExport> {
  const safeName = project.name.replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60) || "clip";
  const uploaded = await uploadFile(blob, `${safeName}.mp4`, onProgress);
  return callModule<ClipExport>("registerExport", {
    file: uploaded.file,
    projectId: project.id,
    projectName: project.name,
    width: project.width,
    height: project.height,
    durationMs,
    brandKitId: project.brandKitId,
    projectUpdatedAt: project.updatedAt,
    ...extras,
    // Des sous-titres vides ne font pas un fichier.
    subtitles: extras.subtitles?.srt.trim() ? extras.subtitles : undefined,
  });
}

// ─── Fiche d'un export et publication ────────────────────────────

/** Un export, son projet d'origine et sa marque. */
export function getExport(id: string): Promise<ExportDetails> {
  return callModule<ExportDetails>("getExport", id);
}

/** Enregistre le jeu de textes ; avec `expectedUpdatedAt`, refuse un jeu modifié ailleurs entre-temps. */
export function updateExportPost(id: string, post: ExportPost, expectedUpdatedAt?: number): Promise<ExportPost> {
  return callModule<ExportPost>("updateExportPost", id, post, expectedUpdatedAt);
}

/** Le jeu de textes tiré de la marque, non enregistré (« Reprendre la marque »). */
export function defaultPostTexts(id: string): Promise<ExportPost> {
  return callModule<ExportPost>("defaultPostTexts", id);
}

/** Propositions de l'assistant, non enregistrées : `result.unreviewed` liste les champs à relire. */
export function draftPostTexts(id: string, request: DraftRequest): Promise<DraftResult> {
  return callModule<DraftResult>("draftPostTexts", id, request);
}

/** Couverture prise au curseur : l'image rendue par le navigateur (PNG, JPEG ou WebP) est envoyée puis réencodée. */
export async function setExportCoverFromImage(id: string, image: Blob, atMs?: number): Promise<ClipExport> {
  const uploaded = await uploadFile(image, "couverture.png");
  return callModule<ClipExport>("setExportCover", id, { file: uploaded.file, atMs });
}

/** Couverture prise dans la galerie (nom du fichier, choisi par `ImagePickerDialog`). */
export function setExportCoverFromGallery(id: string, galleryFile: string): Promise<ClipExport> {
  return callModule<ClipExport>("setExportCover", id, { galleryFile });
}

export function removeExportCover(id: string): Promise<ClipExport> {
  return callModule<ClipExport>("setExportCover", id, null);
}

/** Travaux de la file pour cet export (administrateurs). */
export function listExportPublications(id: string): Promise<PublishJobSummary[]> {
  return callModule<PublishJobSummary[]>("listExportPublications", id);
}

/** Mise en file (administrateurs) : textes calculés par le serveur, surchargés par `options`. */
export function publishExport(input: { exportId: string; targets: PublishTarget[] }): Promise<{ jobs: PublishJobSummary[]; failed: { accountId: string; error: string }[] }> {
  return callModule("publishExport", input);
}

// ─── Images de marque (module brand-kit, facultatif) ─────────────

/** Ce que montre le sélecteur d'une marque. */
export interface BrandKitChoice {
  id: string;
  name: string;
  tagline?: string;
  palette: BrandPalette;
  logoUrl?: string;
  /** Voix de la marque, préremplie dans la fenêtre « Créer ». */
  voice?: VoiceSettings;
  isDefault: boolean;
}

/** Police importée d'une marque, proposée dans l'inspecteur. */
export interface BrandFontChoice {
  family: string;
  label: string;
}

/** Marques disponibles ; `null` quand le module n'est pas installé ou pas activé. */
export async function fetchBrandKits(): Promise<BrandKitChoice[] | null> {
  try {
    const kits = await callAnyModule<BrandKitChoice[] | null>("brand-kit", "listKits");
    return Array.isArray(kits) ? kits : null;
  } catch {
    return null;
  }
}

/** Thème résolu d'une marque, prêt pour `applyBrandTheme`. */
export async function fetchBrandTheme(kitId: string): Promise<BrandTheme> {
  const theme = await callAnyModule<BrandTheme | null>("brand-kit", "getBrandTheme", kitId);
  if (!theme) throw new Error("Image de marque introuvable");
  return theme;
}

/** Polices importées d'une marque, avec le nom qu'elles portent dans sa fiche. */
export async function fetchBrandFonts(kitId: string): Promise<BrandFontChoice[]> {
  const [theme, details] = await Promise.all([
    fetchBrandTheme(kitId),
    callAnyModule<{ kit?: { fonts?: { family: string; name: string }[] } } | null>("brand-kit", "getKit", kitId).catch(() => null),
  ]);
  return theme.fonts.map((font) => ({
    family: font.family,
    label: details?.kit?.fonts?.find((entry) => entry.family === font.family)?.name || "Police de la marque",
  }));
}

/** Liste des marques, chargée une fois ; `undefined` tant qu'elle arrive. */
export function useBrandKits(): BrandKitChoice[] | null | undefined {
  const [kits, setKits] = useState<BrandKitChoice[] | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void fetchBrandKits().then((next) => alive && setKits(next));
    return () => {
      alive = false;
    };
  }, []);
  return kits;
}

/** Polices de la marque d'un projet ; vide sans marque ou si elle est introuvable. */
export function useBrandFonts(kitId: string | undefined): BrandFontChoice[] {
  const [fonts, setFonts] = useState<{ kitId: string; list: BrandFontChoice[] } | null>(null);
  useEffect(() => {
    if (!kitId) return;
    let alive = true;
    void fetchBrandFonts(kitId)
      .catch(() => [])
      .then((list) => alive && setFonts({ kitId, list }));
    return () => {
      alive = false;
    };
  }, [kitId]);
  return kitId && fonts?.kitId === kitId ? fonts.list : NO_FONTS;
}

const NO_FONTS: BrandFontChoice[] = [];
