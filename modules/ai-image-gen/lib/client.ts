/**
 * Passerelle client vers les fonctions serveur du module, plus les formats
 * partagés par les pages.
 *
 * Le catalogue de modèles n'est plus une constante : il dépend de ce qui est
 * réellement installé et connecté sur le serveur. Les pages le demandent donc
 * au démarrage au lieu de l'importer.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MODULE_NAME = "ai-image-gen";

// ─── Formats partagés ────────────────────────────────────────────

export interface ModelAvailability {
  id: string;
  label: string;
  engineId: string;
  kind: "api" | "cli";
  billing: "api-key" | "subscription";
  description: string;
  sizes: string[];
  qualities?: { value: string; label: string }[];
  maxBatch: number;
  supportsReference: boolean;
  tags: string[];
  available: boolean;
  reason: string | null;
  accessLabel: string;
}

export interface CliEngineStatus {
  id: string;
  label: string;
  installHint: string;
  docsUrl?: string;
  imageCapable: boolean;
  nativeImageCapable: boolean;
  assumeImageCapable: boolean;
  enabled: boolean;
  custom: boolean;
  configuredPath?: string;
  sandboxModes: { value: string; label: string; description: string }[];
  sandbox: string | null;
  binaryPath: string | null;
  version: string | null;
  account: string | null;
  authenticated: boolean | null;
  error: string | null;
  models: ModelAvailability[];
}

export interface ApiEngineStatus {
  id: string;
  label: string;
  configured: boolean;
  fromEnv: boolean;
  hint: string;
  envVariable?: string;
}

export interface Catalogue {
  models: ModelAvailability[];
  cli: CliEngineStatus[];
  apiEngines: ApiEngineStatus[];
}

export interface HistoryItem {
  id: string;
  prompt: string;
  finalPrompt: string;
  negativePrompt?: string;
  notes: string;
  provider: string;
  model: string;
  modelLabel?: string;
  size: string;
  quality?: string;
  count: number;
  imageFiles: string[];
  revisedPrompt?: string;
  savedToGallery?: Record<string, string>;
  usedReference?: boolean;
  favorite?: boolean;
  durationMs?: number;
  createdAt: number;
  collectionId?: string;
  parentId?: string;
  pipelineId?: string;
  seed?: number;
}

export type JobStatus = "queued" | "running" | "done" | "error" | "canceled";

export interface Job {
  id: string;
  status: JobStatus;
  request: {
    prompt: string;
    negativePrompt?: string;
    model: string;
    size: string;
    quality?: string;
    n: number;
    collectionId?: string;
    pipelineId?: string;
  };
  modelLabel: string;
  engineId: string;
  engineKind: "api" | "cli";
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  progress: { current: number; total: number; label: string };
  log: { ts: number; level: "info" | "warn" | "error"; text: string }[];
  historyIds: string[];
  error?: string;
  pipelineStep?: { index: number; total: number; label: string };
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  synopsis?: string;
  styleNotes?: string;
  anchors?: { id: string; label: string; file: string; note?: string }[];
  coverFile?: string;
  createdAt: number;
  updatedAt: number;
}

export type PipelineStepKind =
  | "generate"
  | "variant"
  | "edit"
  | "upscale"
  | "gallery";

export interface PipelineStep {
  id: string;
  kind: PipelineStepKind;
  label?: string;
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  size?: string;
  quality?: string;
  n?: number;
  scale?: number;
  keep?: boolean;
}

export interface Pipeline {
  id: string;
  name: string;
  description?: string;
  steps: PipelineStep[];
  createdAt: number;
  updatedAt: number;
}

export interface ModuleStats {
  generations: number;
  images: number;
  favorites: number;
  inGallery: number;
  diskBytes: number;
  byModel: { model: string; label: string; count: number }[];
}

// ─── Appels ──────────────────────────────────────────────────────

/**
 * Les fonctions du module répondent `{ success, data, error }`. On lève sur
 * échec pour que les pages traitent erreur réseau et erreur métier au même
 * endroit, avec un seul `catch`.
 */
export async function callModule<T = any>(
  functionName: string,
  ...args: unknown[]
): Promise<T> {
  const response = await fetch("/api/modules/call-function", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ moduleName: MODULE_NAME, functionName, args }),
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

export function imageUrl(file: string): string {
  return `/api/modules/${MODULE_NAME}/data/images/${file}`;
}

// ─── Suivi des travaux ───────────────────────────────────────────

const ACTIVE_STATUSES: JobStatus[] = ["queued", "running"];

export function isJobActive(job: Job): boolean {
  return ACTIVE_STATUSES.includes(job.status);
}

/**
 * Interrogation périodique du studio.
 *
 * On accélère la cadence tant qu'un travail tourne, et on la relâche dès que
 * la file est vide : une génération dure une minute, il serait absurde de
 * garder un aller-retour par seconde pendant que rien ne se passe.
 */
export function useStudioState(historyLimit = 60) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const state = await callModule<{ jobs: Job[]; history: HistoryItem[] }>(
        "getStudioState",
        historyLimit
      );
      if (stopped.current) return state;
      setJobs(state.jobs);
      setHistory(state.history);
      setReady(true);
      return state;
    } catch {
      if (!stopped.current) setReady(true);
      return null;
    }
  }, [historyLimit]);

  useEffect(() => {
    stopped.current = false;

    const tick = async () => {
      const state = await refresh();
      if (stopped.current) return;
      const busy = state?.jobs?.some(isJobActive) ?? false;
      timer.current = setTimeout(tick, busy ? 1500 : 15000);
    };

    void tick();
    return () => {
      stopped.current = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh]);

  return { jobs, history, ready, refresh, setHistory };
}

// ─── Utilitaires d'affichage ─────────────────────────────────────

/** Ratio d'une taille « 1536x1024 », pour réserver la place du résultat avant qu'il arrive. */
export function aspectRatioOf(size: string): number {
  const [width, height] = size.split("x").map(Number);
  if (!width || !height) return 1;
  return width / height;
}

export function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 31) return `il y a ${days} j`;
  return new Date(ts).toLocaleDateString("fr-FR");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ["Ko", "Mo", "Go"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function formatDuration(ms?: number): string | null {
  if (!ms) return null;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Fragments de style ajoutés au prompt en un clic. */
export const PRESETS = [
  { label: "Anime", fragment: "anime style, detailed illustration, vibrant colors" },
  { label: "Photo", fragment: "photorealistic, natural lighting, sharp focus, 50mm lens" },
  { label: "Paysage", fragment: "sweeping landscape, atmospheric lighting, wide angle" },
  { label: "Portrait", fragment: "portrait, studio lighting, shallow depth of field" },
  { label: "Cyberpunk", fragment: "cyberpunk, neon lights, rain-slick streets, cinematic" },
  { label: "Fantasy", fragment: "fantasy art, ethereal, dramatic lighting, painterly" },
  { label: "Minimal", fragment: "minimalist, flat design, generous negative space" },
  { label: "3D", fragment: "3D render, octane, soft global illumination" },
  { label: "Aquarelle", fragment: "watercolor painting, soft washes, paper texture" },
  { label: "Pixel art", fragment: "pixel art, 32x32 sprite, limited palette, crisp edges" },
] as const;

/** Consignes négatives proposées en un clic. */
export const NEGATIVE_PRESETS = [
  "texte, filigrane, logo",
  "mains déformées, membres en trop",
  "flou, artefacts de compression",
  "cadre, bordure, passe-partout",
] as const;

/**
 * Télécharge une image depuis une URL du module. On passe par un blob plutôt
 * que par `<a download>` sur l'URL directe : l'attribut est ignoré dès que la
 * ressource est servie par une autre route, et le navigateur se contente
 * d'ouvrir l'image.
 */
export async function downloadImage(url: string, fileName: string) {
  const response = await fetch(url);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

/** Lit un fichier choisi par l'utilisateur en base64 nu (sans le préfixe `data:`). */
export function readFileAsBase64(
  file: File
): Promise<{ b64: string; mimeType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve({
        b64: dataUrl.split(",")[1] ?? "",
        mimeType: file.type || "image/png",
        dataUrl,
      });
    };
    reader.readAsDataURL(file);
  });
}

/** Convertit une image déjà stockée par le module en base64, pour la renvoyer en référence. */
export async function fileToReference(
  file: string
): Promise<{ b64: string; mimeType: string }> {
  const response = await fetch(imageUrl(file));
  const blob = await response.blob();
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture impossible"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
  return {
    b64: dataUrl.split(",")[1] ?? "",
    mimeType: blob.type || "image/png",
  };
}
