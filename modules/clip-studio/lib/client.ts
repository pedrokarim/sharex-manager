"use client";

import { useEffect, useState } from "react";
import type { BrandPalette, BrandTheme } from "../engine/brand";
import type { ClipAsset, ClipExport, ClipProject, MediaSource } from "../engine/types";
import type { PublishJobSummary } from "@/lib/connections/types";
import type { ExportDetails, ExportPost, PublishTarget } from "./post-types";
import type { DraftRequest, DraftResult } from "./post-draft";
import type { VoiceSettings } from "./voice-settings";
import type { ExportQuery, ProjectPage, ProjectQuery, ProjectSummary } from "./library";
import type { ExportPage, ExportPublicationDetails, PublicationsOverview, StudioOverview } from "./library-service";

export const MODULE_NAME = "clip-studio";

/** « 3,5 Mo » : taille d'un fichier, écrite à la française. */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

export type { ProjectSummary } from "./library";

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
    ...(asset.transcript ? { transcript: asset.transcript } : {}),
    // Vidéo récupérée par adresse : présence du son et provenance.
    ...(typeof asset.hasAudio === "boolean" ? { hasAudio: asset.hasAudio } : {}),
    ...(asset.origin ? { origin: asset.origin } : {}),
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
  /** Vidéo : elle a une piste son ; absent quand on n'a pas pu le lire. */
  hasAudio?: boolean;
}

/**
 * Dimensions et durée d'un média, lues par le navigateur ; pour une vidéo,
 * la présence d'une piste son, lue dans le conteneur par Mediabunny.
 */
export async function probeMedia(url: string, kind: MediaSource["kind"]): Promise<MediaProbe> {
  if (kind !== "video") return probeElement(url, kind);
  const [probe, hasAudio] = await Promise.all([probeElement(url, kind), probeHasAudio(url)]);
  return hasAudio === undefined ? probe : { ...probe, hasAudio };
}

/**
 * La vidéo a-t-elle une piste son ? Les indices de l'élément `<video>`
 * (`audioTracks`, `mozHasAudio`…) varient d'un navigateur à l'autre ; le
 * conteneur, lui, le dit sûrement. `undefined` si on n'a pas pu le lire.
 */
async function probeHasAudio(url: string): Promise<boolean | undefined> {
  try {
    const { ALL_FORMATS, Input, UrlSource } = await import("mediabunny");
    const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(new URL(url, window.location.href)) });
    try {
      return (await input.getPrimaryAudioTrack()) !== null;
    } finally {
      input.dispose();
    }
  } catch {
    return undefined;
  }
}

function probeElement(url: string, kind: MediaSource["kind"]): Promise<MediaProbe> {
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

/**
 * Au-delà, un fichier part en morceaux : Cloudflare refuse toute requête de
 * plus de 100 Mo, et un clip de quelques minutes les dépasse.
 */
const CHUNK_BYTES = 48 * 1024 * 1024;

/** Réponse d'un envoi : JSON du serveur, ou l'erreur à montrer. */
function sendUpload<T>(url: string, body: Blob | FormData, onProgress?: (loaded: number) => void, extraHeaders?: Record<string, string>): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    if (!(body instanceof FormData)) request.setRequestHeader("Content-Type", "application/octet-stream");
    for (const [header, value] of Object.entries(extraHeaders ?? {})) request.setRequestHeader(header, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded);
    };
    request.onload = () => {
      let payload: any = null;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        // Réponse non JSON (proxy qui refuse un fichier trop lourd, par exemple).
      }
      if (request.status >= 200 && request.status < 300 && payload) resolve(payload);
      else if (request.status === 413) reject(new Error(payload?.error ?? "Fichier trop lourd pour le serveur"));
      else reject(new Error(payload?.error ?? `Envoi impossible (HTTP ${request.status})`));
    };
    request.onerror = () => reject(new Error("Envoi interrompu"));
    request.send(body);
  });
}

/** Envoi en morceaux successifs, recollés par le serveur ; la progression couvre tout le fichier. */
async function uploadInChunks(file: Blob, name: string, onProgress?: (ratio: number) => void, moduleName = MODULE_NAME): Promise<UploadResult> {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const chunks = Math.ceil(file.size / CHUNK_BYTES);
  let result: UploadResult | null = null;
  for (let index = 0; index < chunks; index++) {
    const start = index * CHUNK_BYTES;
    const part = file.slice(start, Math.min(file.size, start + CHUNK_BYTES));
    // Le nom d'origine part une seule fois, en en-tête : il ne finit ni dans l'adresse ni dans les journaux.
    const query = new URLSearchParams({ upload: id, chunk: String(index), of: String(chunks), size: String(file.size) });
    const extraHeaders = index === 0 ? { "X-File-Name": encodeURIComponent(name) } : undefined;
    const response = await sendUpload<UploadResult>(`/api/modules/${moduleName}/upload?${query}`, part, (loaded) => onProgress?.((start + loaded) / file.size), extraHeaders);
    if (index === chunks - 1) result = response;
  }
  return result!;
}

/**
 * Dépose un fichier dans les données du module (ou d'un autre module qui
 * accepte les envois, `moduleName`), avec suivi de progression.
 */
export function uploadFile(
  file: Blob,
  name: string,
  onProgress?: (ratio: number) => void,
  moduleName = MODULE_NAME
): Promise<UploadResult> {
  if (file.size > CHUNK_BYTES) return uploadInChunks(file, name, onProgress, moduleName);
  const form = new FormData();
  form.append("file", file, name);
  return sendUpload<UploadResult>(`/api/modules/${moduleName}/upload`, form, (loaded) => onProgress?.(loaded / Math.max(1, file.size)));
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

// ─── Bibliothèque : accueil, projets, exports ────────────────────

export type { ExportPage, ExportPublicationDetails, PublicationAccount, PublicationsOverview, StudioOverview, TopPublication } from "./library-service";

export function getStudioOverview(): Promise<StudioOverview> {
  return callModule<StudioOverview>("getStudioOverview");
}

export function searchProjects(query: ProjectQuery): Promise<ProjectPage> {
  return callModule<ProjectPage>("searchProjects", query);
}

export function updateProjectDetails(input: { id: string; name?: string; tags?: string[] }): Promise<ProjectSummary> {
  return callModule<ProjectSummary>("updateProjectDetails", input);
}

export function tagProjects(input: { ids: string[]; add?: string[]; remove?: string[] }): Promise<{ updated: number }> {
  return callModule("tagProjects", input);
}

export function deleteProjects(ids: string[]): Promise<{ deleted: number }> {
  return callModule("deleteProjects", ids);
}

export function duplicateProjects(ids: string[]): Promise<{ created: ProjectSummary[] }> {
  return callModule("duplicateProjects", ids);
}

/** Copie d'un projet ; avec `aspect`, au format voulu. */
export function duplicateProject(id: string, aspect?: ClipProject["aspect"]): Promise<ProjectSummary> {
  return callModule<ProjectSummary>("duplicateProject", id, aspect);
}

export function importProject(project: unknown): Promise<{ project: ProjectSummary; missingMedia: number }> {
  return callModule("importProject", project);
}

/** Envoie la vignette rendue d'un projet (JPEG) ; `renderedAt` est l'`updatedAt` du projet dessiné. */
export async function setProjectThumbnail(id: string, renderedAt: number, image: Blob): Promise<{ thumbnail: string }> {
  const bytes = new Uint8Array(await image.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return callModule("setProjectThumbnail", id, renderedAt, { type: "buffer", data: btoa(binary) });
}

/** Une page d'exports ; `withPublications` (administrateurs) ajoute les publications et les filtres par service et par état. */
export function searchExports(query: ExportQuery, withPublications = false): Promise<ExportPage> {
  return callModule<ExportPage>(withPublications ? "searchExportsWithPublications" : "searchExports", query);
}

/** Publications pour l'accueil (administrateurs). */
export function getPublicationsOverview(input: { exportIds?: string[]; readStats?: boolean } = {}): Promise<PublicationsOverview> {
  return callModule<PublicationsOverview>("getPublicationsOverview", input);
}

/** Publications d'un export, une ligne par compte, avec statistiques (administrateurs). */
export function getExportPublications(id: string, refresh = false): Promise<ExportPublicationDetails> {
  return callModule<ExportPublicationDetails>("getExportPublications", id, { refresh });
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

// ─── Vidéos récupérées par adresse ───────────────────────────────

export type { RemoteImportJob, RemoteProbe } from "./remote-import";
export type { VideoSourcesStatus } from "./video-sources";

/** Titre, auteur, durée et vignette d'une adresse YouTube, Twitch ou d'un lien direct. */
export function probeRemoteVideo(url: string): Promise<import("./remote-import").RemoteProbe> {
  return callModule("probeRemoteVideo", { url });
}

/** Lance la récupération d'un passage (en secondes) ; suivi par `getRemoteImportJob`. */
export function startRemoteImport(input: { url: string; start?: number; end?: number }): Promise<import("./remote-import").RemoteImportJob> {
  return callModule("startRemoteImport", input);
}

export function getRemoteImportJob(id: string): Promise<import("./remote-import").RemoteImportJob | null> {
  return callModule("getRemoteImportJob", id);
}

export function listRemoteImports(): Promise<import("./remote-import").RemoteImportJob[]> {
  return callModule("listRemoteImports");
}

export function cancelRemoteImport(id: string): Promise<{ success: boolean }> {
  return callModule("cancelRemoteImport", id);
}

/** État des sources vidéo (administrateurs) : cookies YouTube et clé Pexels, jamais leur contenu. */
export function getVideoSources(): Promise<import("./video-sources").VideoSourcesStatus> {
  return callModule("getVideoSources");
}

export function saveYoutubeCookies(cookies: string | null): Promise<import("./video-sources").VideoSourcesStatus> {
  return callModule("saveYoutubeCookies", { cookies });
}

export function savePexelsKey(key: string): Promise<import("./video-sources").VideoSourcesStatus> {
  return callModule("savePexelsKey", { key });
}

export function savePixabayKey(key: string): Promise<import("./video-sources").VideoSourcesStatus> {
  return callModule("savePixabayKey", { key });
}

// ─── Vidéos trouvées (Pixabay, Pexels, Wikimedia Commons) ────────

export type { FoundVideo, ImportedVideo, VideoProviderId } from "./video-search";

/** Banques de vidéos utilisables, dans l'ordre ; Wikimedia Commons l'est toujours (aucune clé ne sort). */
export function getVideoSearchStatus(): Promise<{ pexels: boolean; providers: import("./video-search").VideoProviderId[] }> {
  return callModule("getVideoSearchStatus");
}

export function searchVideos(input: {
  query: string;
  orientation?: "portrait" | "landscape" | "square";
  page?: number;
  provider?: import("./video-search").VideoProviderId;
}): Promise<import("./video-search").FoundVideo[]> {
  return callModule("searchVideos", input);
}

/** Importe une vidéo d'une banque dans Mes médias, au fichier qui va au format du projet. */
export function importFoundVideo(input: { id: string; aspect?: import("../engine/types").AspectPreset }): Promise<import("./video-search").ImportedVideo> {
  return callModule("importFoundVideo", input);
}

/** Média du projet tiré d'une vidéo importée : la mention et les droits la suivent jusqu'à la publication. */
export function importedVideoSource(video: import("./video-search").ImportedVideo): MediaSource {
  return {
    url: video.url,
    ref: video.ref,
    name: video.name,
    kind: "video",
    ...(video.width ? { width: video.width } : {}),
    ...(video.height ? { height: video.height } : {}),
    ...(video.durationMs ? { durationMs: video.durationMs } : {}),
    credit: video.credit,
    rights: "free",
    hasAudio: video.hasAudio,
  };
}

// ─── Transcription ───────────────────────────────────────────────

export type { TranscriptionJob } from "./transcription-jobs";

/** Lance (ou retrouve) la transcription d’une vidéo ou d’un son, par sa référence. */
export function startTranscription(request: { ref: string; force?: boolean; language?: string }): Promise<import("./transcription-jobs").TranscriptionJob> {
  return callModule("startTranscription", request);
}

export function getTranscriptionJob(id: string): Promise<import("./transcription-jobs").TranscriptionJob | null> {
  return callModule("getTranscriptionJob", id);
}

export function cancelTranscription(id: string): Promise<{ success: boolean }> {
  return callModule("cancelTranscription", id);
}

// ─── Créations à partir d’une vidéo ──────────────────────────────

export type { ClipJob, ClipJobClip, ClipJobRequest } from "./clip-jobs";
export type { ClipMoment } from "./clip-moments";

/** Source d'une création : une adresse (et le passage voulu) ou un média du module. */
export interface ClipSourceInput {
  url?: string;
  start?: number;
  end?: number;
  assetFile?: string;
  /** Fichier envoyé depuis la fenêtre de création : effaçable après la découpe. */
  uploaded?: boolean;
}

export interface ClipOptions {
  source: ClipSourceInput;
  aspect: import("../engine/types").AspectPreset;
  framing: "crop" | "blur";
  brandKitId?: string;
  /** Sous-titrer : accroche du début ; vide, aucune. */
  hook?: string;
}

/** « Sous-titrer un clip » ; suivi par `getClipJob`. */
export function startSubtitleClip(options: ClipOptions): Promise<import("./clip-jobs").ClipJob> {
  return callModule("startSubtitleClip", options);
}

/** « Découper une vidéo » : le travail s'arrête sur les passages proposés (`review`). */
export function startClipping(options: ClipOptions): Promise<import("./clip-jobs").ClipJob> {
  return callModule("startClipping", options);
}

export function createClipsFromMoments(input: {
  jobId: string;
  moments: { id: string; startMs: number; endMs: number; title: string }[];
  keepSource: boolean;
}): Promise<import("./clip-jobs").ClipJob> {
  return callModule("createClipsFromMoments", input);
}

export function getClipJob(id: string): Promise<import("./clip-jobs").ClipJob | null> {
  return callModule("getClipJob", id);
}

export function cancelClipJob(id: string): Promise<{ success: boolean }> {
  return callModule("cancelClipJob", id);
}
