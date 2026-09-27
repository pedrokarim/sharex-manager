"use client";

import type { ClipAsset, ClipExport, ClipProject, MediaSource } from "../engine/types";

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
    words: asset.words,
  };
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

export async function saveExport(
  project: ClipProject,
  blob: Blob,
  durationMs: number,
  onProgress?: (ratio: number) => void
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
  });
}
