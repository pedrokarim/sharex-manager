/**
 * L’assistant illustre en vidéo (dossier 01 vidéo, V4.4) : des plans filmés
 * libres, pour l’assistant et pour l’onglet « Trouver » du panneau Médias.
 *
 * Ce fichier porte Pexels et la mécanique commune aux banques de vidéos
 * (`video-pixabay.ts`, `video-wikimedia.ts`, réunies par `video-providers.ts`).
 *
 * - Recherche : API Pexels Videos (`GET /videos/search`), avec la clé des
 *   réglages de Clip Studio (`video-sources.ts`, ou `PEXELS_API_KEY`). Chaque
 *   appel est noté au registre des IA ; le solde du mois est relevé dans les
 *   en-têtes des réponses, et les appels de l’heure sont comptés ici pour
 *   rester sous la limite publiée (200 par heure, 20 000 par mois).
 * - Fichier : pour chaque vidéo, le MP4 dont la hauteur est la plus proche de
 *   celle du projet, sans dépasser 1920 px.
 * - Import : le serveur télécharge lui-même le fichier, seulement depuis les
 *   hôtes de la banque (liste fermée par banque), avec la résolution DNS
 *   contrôlée de `remote-image.ts`, redirections revérifiées ; ffmpeg le lit
 *   (son, durée, taille) et ne le réencode que s’il n’est pas en H.264 et
 *   AAC. La vidéo devient un média du module, avec sa mention (« Vidéo : auteur
 *   sur Pexels ») et `rights: "free"`.
 *
 * Seul l’identifiant d’une vidéo vient du navigateur, jamais une adresse.
 */

import fs from "fs";
import https from "https";
import path from "path";
import { randomBytes } from "crypto";
import { spawn } from "child_process";
import { childEnv } from "@/lib/child-env";
import { ensureFfmpeg } from "@/lib/media/ffmpeg";
import { safeLookup } from "@/lib/remote-image";
import { recordAiUsage, usageError, type AiUsageOrigin } from "@/lib/ai-usage";
import type { AiErrorKind, AiLimit, AiModuleProviderReport } from "@/lib/ai-usage/types";
import { ASPECTS, type AspectPreset, type ClipAsset, type MediaSource } from "../engine/types";
import { UNTRUSTED_INPUT_ARGS, conversionPlan, enforceRemoteBudget, finalizeArgs, parseMediaStreams, type MediaStreams } from "./remote-import";
import { assertDiskSpace, holdWorkDir } from "./job-safety";
import { ASSETS_DIR, DATA_DIR, ensureDirs, readAssets, writeAssets } from "./store";
import { pexelsApiKey } from "./video-sources";

const API = "https://api.pexels.com/videos";
const PEXELS_ID = /^pexels:(\d{1,12})$/;
/** Dossier de travail caché : jamais servi par la route des données. */
const WORK_DIR = path.join(DATA_DIR, ".video-tmp");
export const PEXELS_LICENSE = "Licence Pexels";

/** Banques de vidéos libres. */
export type VideoProviderId = "pexels" | "pixabay" | "wikimedia";

export const VIDEO_SEARCH_LIMITS = {
  /** Hauteur de fichier la plus grande retenue. */
  maxFileHeight: 1920,
  /** Durées préférées d’un plan, en secondes. */
  preferredSeconds: { min: 4, max: 30 },
  /** Fichier le plus lourd téléchargé. */
  maxFileBytes: 200 * 1024 * 1024,
  /** Résultats demandés par recherche de l’assistant. */
  perSegment: 8,
  /** Résultats par page de l’onglet « Trouver ». */
  perPage: 12,
  /** Limites publiées par Pexels. */
  perHour: 200,
  perMonth: 20_000,
  /** Marge gardée sous la limite horaire : l’onglet « Trouver » reste utilisable. */
  hourlyMargin: 10,
  /** Téléchargements simultanés. */
  downloads: 3,
} as const;

// ─── Réponses de Pexels ──────────────────────────────────────────

export interface PexelsFile {
  id?: number;
  quality?: string | null;
  file_type?: string | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  link?: string | null;
}

export interface PexelsVideo {
  id: number;
  width?: number;
  height?: number;
  duration?: number;
  url?: string;
  image?: string;
  user?: { id?: number; name?: string; url?: string };
  video_files?: PexelsFile[];
}

/** Une vidéo candidate, telle que l’onglet « Trouver » la montre. */
export interface FoundVideo {
  /** `pexels:<id>`, `pixabay:<id>` ou `wikimedia:<id de page>`. */
  id: string;
  provider: VideoProviderId;
  /** Vignette servie par la banque. */
  thumbnail: string;
  /** Petit fichier lu au survol, s’il existe. */
  preview?: string;
  title: string;
  creator?: string;
  /** Page de la vidéo sur la banque, à citer. */
  sourcePage?: string;
  width?: number;
  height?: number;
  durationSec: number;
  license: string;
  /** Texte de la licence, quand la banque le donne (Wikimedia Commons). */
  licenseUrl?: string;
  rights: "free";
}

/** Une vidéo importée : un média du module, prêt pour un projet. */
export interface ImportedVideo {
  file: string;
  url: string;
  ref: string;
  name: string;
  width?: number;
  height?: number;
  durationMs?: number;
  credit: string;
  rights: "free";
  hasAudio: boolean;
}

export type PexelsOrientation = "portrait" | "landscape" | "square";
export type VideoOrientation = PexelsOrientation;

/** Accès extérieurs, remplaçables par les tests. */
export interface VideoSearchDeps {
  fetch?: (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;
  apiKey?: () => string;
  /** Télécharge un fichier de la banque vers `target`. */
  download?: (url: string, target: string, signal?: AbortSignal) => Promise<void>;
  /** Contrôle et met au format le fichier téléchargé (`input`) vers `output`, et rend ses flux. */
  prepare?: (input: string, output: string, signal?: AbortSignal) => Promise<MediaStreams>;
  now?: () => number;
}

/** Orientation demandée selon le format du projet. */
export function pexelsOrientation(aspect: AspectPreset): PexelsOrientation {
  if (aspect === "16:9") return "landscape";
  if (aspect === "1:1") return "square";
  return "portrait";
}

/** Orientation d’une image de `width` × `height` (carré à 10 % près). */
export function orientationOf(width: number | undefined, height: number | undefined): VideoOrientation | undefined {
  if (!width || !height) return undefined;
  const ratio = width / height;
  if (ratio > 1.1) return "landscape";
  if (ratio < 0.9) return "portrait";
  return "square";
}

/**
 * Fichier retenu pour une vidéo : un MP4 (H.264 chez Pexels) dont la hauteur
 * est la plus proche de celle du projet sans dépasser 1920 px ; à égalité, le
 * plus léger (le plus petit). Les flux HLS et les fichiers sans taille connue
 * sont écartés.
 */
export function pickVideoFile(files: PexelsFile[] | undefined, target: { height: number }): (PexelsFile & { link: string; width: number; height: number }) | null {
  const eligible = (files ?? []).filter(
    (file): file is PexelsFile & { link: string; width: number; height: number } =>
      typeof file?.link === "string" &&
      /^https:\/\//.test(file.link) &&
      String(file.file_type ?? "").toLowerCase() === "video/mp4" &&
      String(file.quality ?? "").toLowerCase() !== "hls" &&
      Number.isFinite(file.width) &&
      Number.isFinite(file.height) &&
      (file.width as number) > 0 &&
      (file.height as number) > 0 &&
      (file.height as number) <= VIDEO_SEARCH_LIMITS.maxFileHeight
  );
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => Math.abs(a.height - target.height) - Math.abs(b.height - target.height) || a.width * a.height - b.width * b.height)[0];
}

/** Plus petit fichier MP4, pour l’aperçu au survol. */
function previewFile(files: PexelsFile[] | undefined): string | undefined {
  const mp4 = (files ?? []).filter((file) => typeof file.link === "string" && String(file.file_type ?? "").toLowerCase() === "video/mp4" && (file.width ?? 0) > 0);
  return mp4.sort((a, b) => (a.width ?? 0) * (a.height ?? 0) - (b.width ?? 0) * (b.height ?? 0))[0]?.link ?? undefined;
}

/**
 * Ordre des résultats pour un segment : d’abord ceux qui durent de 4 à 30 s,
 * puis, parmi eux, ceux assez longs pour couvrir le segment (`minSeconds`) ;
 * l’ordre de pertinence de la banque départage.
 */
export function rankVideos<T extends { duration?: number }>(videos: T[], minSeconds = 0): T[] {
  const { min, max } = VIDEO_SEARCH_LIMITS.preferredSeconds;
  const score = (video: T) => {
    const duration = Number(video.duration) || 0;
    return (duration >= min && duration <= max ? 0 : 2) + (duration >= minSeconds ? 0 : 1);
  };
  return videos.map((video, index) => ({ video, index })).sort((a, b) => score(a.video) - score(b.video) || a.index - b.index).map((entry) => entry.video);
}

/**
 * Banques sans filtre d’orientation (Pixabay, Wikimedia Commons) : les vidéos
 * dans l’orientation du projet passent devant, l’ordre de pertinence est
 * gardé à l’intérieur de chaque groupe.
 */
export function preferOrientation<T>(items: T[], orientation: VideoOrientation | undefined, size: (item: T) => { width?: number; height?: number }): T[] {
  if (!orientation) return items;
  const score = (item: T) => {
    const { width, height } = size(item);
    const found = orientationOf(width, height);
    return found === orientation ? 0 : found === "square" || orientation === "square" ? 1 : 2;
  };
  return items.map((item, index) => ({ item, index })).sort((a, b) => score(a.item) - score(b.item) || a.index - b.index).map((entry) => entry.item);
}

/** Titre lisible d’une vidéo, tiré de l’adresse de sa page (`/video/aerial-view-of-a-city-3571264/`). */
export function videoTitle(video: Pick<PexelsVideo, "id" | "url">): string {
  const slug = /\/video\/([a-z0-9-]+?)-?\d*\/?$/i.exec(String(video.url ?? ""))?.[1] ?? "";
  const words = slug.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  return words && !/^\d+$/.test(words) ? (words[0].toUpperCase() + words.slice(1)).slice(0, 120) : `Vidéo Pexels ${video.id}`;
}

/** Mention reprise à la publication. */
export function pexelsCredit(video: Pick<PexelsVideo, "user">): string {
  const author = String(video.user?.name ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  return author ? `Vidéo : ${author} sur Pexels` : "Vidéo : Pexels";
}

export const httpsUrl = (value: unknown): string | undefined => (typeof value === "string" && /^https:\/\/[^\s]+$/.test(value) ? value : undefined);

export function toFoundVideo(video: PexelsVideo): FoundVideo {
  return {
    id: `pexels:${video.id}`,
    provider: "pexels",
    thumbnail: httpsUrl(video.image) ?? "",
    ...(previewFile(video.video_files) ? { preview: previewFile(video.video_files) } : {}),
    title: videoTitle(video),
    ...(video.user?.name ? { creator: String(video.user.name).slice(0, 100) } : {}),
    ...(httpsUrl(video.url) ? { sourcePage: httpsUrl(video.url) } : {}),
    ...(video.width ? { width: video.width } : {}),
    ...(video.height ? { height: video.height } : {}),
    durationSec: Number(video.duration) || 0,
    license: PEXELS_LICENSE,
    rights: "free",
  };
}

// ─── Erreurs et registre ─────────────────────────────────────────

export class VideoSearchError extends Error {
  /** Famille de l’échec, reprise au registre des IA. */
  kind?: AiErrorKind;
  constructor(message: string, kind?: AiErrorKind) {
    super(message);
    this.name = "VideoSearchError";
    if (kind) this.kind = kind;
  }
}

/** Famille d’un échec d’appel, pour le registre. */
export function videoErrorKind(error: unknown): AiErrorKind {
  if (error instanceof VideoSearchError && error.kind) return error.kind;
  if (error instanceof Error && error.name === "TimeoutError") return "timeout";
  if (error instanceof VideoSearchError) return "provider";
  return "network";
}

/** Note un appel à une banque au registre des IA, avec sa durée et, en cas d’échec, sa famille. */
export function noteVideoCall(provider: VideoProviderId, origin: AiUsageOrigin, startedAt: number, ok: boolean, error?: unknown) {
  recordAiUsage({
    provider,
    module: origin.module,
    feature: origin.feature,
    unit: "calls",
    amount: 1,
    ok,
    durationMs: Math.max(0, Date.now() - startedAt),
    ...(ok ? {} : { error: usageError(error), errorKind: videoErrorKind(error) }),
  });
}

// ─── Appels à l’API de Pexels et limites ─────────────────────────

interface RateState {
  /** Appels de la dernière heure (instants). */
  calls: number[];
  /** Solde du mois relevé dans les en-têtes de la dernière réponse. */
  month?: { limit: number; remaining: number; resetsAt?: number };
  /** Vidéos vues récemment, pour importer par identifiant sans nouvel appel. */
  seen: Map<number, { at: number; video: PexelsVideo }>;
}

const rate = ((globalThis as any).__sxmPexels ??= { calls: [], seen: new Map() }) as RateState;
const SEEN_TTL_MS = 60 * 60 * 1000;

/** Appels de la dernière heure, d’après le compteur local. */
function callsThisHour(now: number): number {
  rate.calls = rate.calls.filter((at) => now - at < 60 * 60 * 1000);
  return rate.calls.length;
}

function readRateHeaders(headers: Headers) {
  const limit = Number(headers.get("x-ratelimit-limit"));
  const remaining = Number(headers.get("x-ratelimit-remaining"));
  const reset = Number(headers.get("x-ratelimit-reset"));
  if (Number.isFinite(limit) && limit > 0 && Number.isFinite(remaining)) {
    rate.month = { limit, remaining: Math.max(0, remaining), ...(Number.isFinite(reset) && reset > 0 ? { resetsAt: reset * 1000 } : {}) };
  }
}

/** Rapport pour l’écran des services : accès et limites, sans aucun appel. */
export function pexelsUsageReport(now = Date.now()): AiModuleProviderReport {
  const fromEnv = Boolean(process.env.PEXELS_API_KEY);
  const configured = Boolean(pexelsApiKey());
  const month: AiLimit = rate.month
    ? {
        id: "pexels-month",
        label: "Requêtes du mois",
        unit: "calls",
        period: "month",
        used: Math.max(0, rate.month.limit - rate.month.remaining),
        limit: rate.month.limit,
        ...(rate.month.resetsAt ? { resetsAt: rate.month.resetsAt } : {}),
        source: "remote",
        note: "Relevé dans la dernière réponse de Pexels.",
      }
    : { id: "pexels-month", label: "Requêtes du mois", unit: "calls", period: "month", used: 0, limit: VIDEO_SEARCH_LIMITS.perMonth, source: "plan", note: "Limite publiée par Pexels ; le solde s’affiche après une recherche." };
  return {
    access: fromEnv ? "env" : configured ? "key" : "none",
    limits: [month, { id: "pexels-hour", label: "Requêtes de l’heure", unit: "calls", period: "plan", used: callsThisHour(now), limit: VIDEO_SEARCH_LIMITS.perHour, source: "local", note: "200 requêtes par heure au plus." }],
    settingsHref: "/m/clip-studio/voices",
  };
}

const NO_KEY = "Ajoutez une clé Pexels dans « Voix en ligne », section « Sources vidéo », pour chercher des vidéos.";

/** Un appel à l’API Pexels, compté et noté au registre. */
async function pexelsGet<T>(url: string, options: { signal?: AbortSignal; origin: AiUsageOrigin; reserve?: boolean }, deps: VideoSearchDeps): Promise<T> {
  const key = (deps.apiKey ?? pexelsApiKey)();
  if (!key) throw new VideoSearchError(NO_KEY, "auth");
  const now = (deps.now ?? Date.now)();
  // L’assistant laisse une marge sous la limite horaire : la recherche à la main reste possible.
  const ceiling = VIDEO_SEARCH_LIMITS.perHour - (options.reserve ? VIDEO_SEARCH_LIMITS.hourlyMargin : 0);
  if (callsThisHour(now) >= ceiling) throw new VideoSearchError("Limite horaire de Pexels atteinte (200 requêtes par heure) : réessayez dans un moment.", "rate-limit");
  rate.calls.push(now);
  const timeout = AbortSignal.timeout(20_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const startedAt = Date.now();
  try {
    const response = await (deps.fetch ?? fetch)(url, { headers: { Authorization: key, Accept: "application/json" }, signal });
    readRateHeaders(response.headers);
    if (response.status === 401 || response.status === 403) throw new VideoSearchError("Pexels refuse la clé enregistrée : vérifiez-la dans « Voix en ligne ».", "auth");
    if (response.status === 429) throw new VideoSearchError("Pexels limite les requêtes pour l’instant : réessayez dans un moment.", "rate-limit");
    if (response.status === 404) throw new VideoSearchError("Cette vidéo n’existe plus sur Pexels.", "input");
    if (!response.ok) throw new VideoSearchError(`Pexels a répondu HTTP ${response.status} : réessayez dans un moment.`, "provider");
    const body = (await response.json()) as T;
    noteVideoCall("pexels", options.origin, startedAt, true);
    return body;
  } catch (error) {
    // Une recherche annulée par l’appelant n’a rien coûté de plus.
    if (options.signal?.aborted) throw error;
    noteVideoCall("pexels", options.origin, startedAt, false, error);
    if (error instanceof VideoSearchError) throw error;
    throw new VideoSearchError("Pexels ne répond pas : réessayez dans un moment.", videoErrorKind(error));
  }
}

function remember(videos: PexelsVideo[], now: number) {
  for (const [id, entry] of rate.seen) if (now - entry.at > SEEN_TTL_MS) rate.seen.delete(id);
  for (const video of videos) rate.seen.set(video.id, { at: now, video });
  while (rate.seen.size > 500) rate.seen.delete(rate.seen.keys().next().value as number);
}

/** Vidéos lues avec rigueur : un identifiant entier et des fichiers, le reste facultatif. */
function readVideos(body: unknown): PexelsVideo[] {
  const list = (body as { videos?: unknown })?.videos;
  return (Array.isArray(list) ? list : []).filter(
    (video): video is PexelsVideo => Boolean(video) && Number.isInteger((video as PexelsVideo).id) && (video as PexelsVideo).id > 0 && Array.isArray((video as PexelsVideo).video_files)
  );
}

export async function searchPexels(
  input: { query: string; orientation?: PexelsOrientation; page?: number; perPage?: number; signal?: AbortSignal; origin: AiUsageOrigin; reserve?: boolean },
  deps: VideoSearchDeps = {}
): Promise<PexelsVideo[]> {
  const query = String(input.query ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (query.length < 2) return [];
  const params = new URLSearchParams({ query, per_page: String(Math.min(40, Math.max(1, Math.round(input.perPage ?? VIDEO_SEARCH_LIMITS.perPage)))), page: String(Math.min(50, Math.max(1, Math.round(input.page ?? 1)))) });
  if (input.orientation) params.set("orientation", input.orientation);
  const body = await pexelsGet<unknown>(`${API}/search?${params}`, { signal: input.signal, origin: input.origin, reserve: input.reserve }, deps);
  const videos = readVideos(body);
  remember(videos, (deps.now ?? Date.now)());
  return videos;
}

/** Recherche de l’onglet « Trouver » sur Pexels, par page. */
export async function searchFoundVideos(input: { query: string; orientation?: string; page?: number }, deps: VideoSearchDeps = {}): Promise<FoundVideo[]> {
  const orientation = (["portrait", "landscape", "square"] as const).find((entry) => entry === input?.orientation);
  const videos = await searchPexels(
    { query: String(input?.query ?? ""), orientation, page: input?.page, origin: { module: "clip-studio", feature: "Recherche de vidéos" } },
    deps
  );
  return videos.map(toFoundVideo).filter((video) => video.thumbnail);
}

// ─── Téléchargement contrôlé ─────────────────────────────────────

/** D’où une banque sert ses fichiers, et comment se présenter à elle. */
export interface DownloadSource {
  /** Nom affiché dans les messages. */
  label: string;
  /** Hôtes admis, redirections comprises. */
  hosts: RegExp[];
  userAgent: string;
  /** Types de contenu admis en plus de `video/*` et des flux binaires. */
  extraTypes?: string[];
}

/** Hôtes d’où un fichier de Pexels peut venir, redirections comprises. */
export const PEXELS_DOWNLOAD: DownloadSource = {
  label: "Pexels",
  hosts: [/^(?:[a-z0-9-]+\.)*pexels\.com$/, /^player\.vimeo\.com$/, /^(?:[a-z0-9-]+\.)*vimeocdn\.com$/, /^vod-progressive\.akamaized\.net$/],
  userAgent: "ShareX-Manager/clip-studio (stock video)",
};

export function isAllowedVideoUrl(raw: string, hosts: RegExp[] = PEXELS_DOWNLOAD.hosts): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && hosts.some((host) => host.test(url.hostname.toLowerCase()));
}

function get(url: URL, signal: AbortSignal | undefined, source: DownloadSource): Promise<import("http").IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { lookup: safeLookup, timeout: 30_000, signal, headers: { accept: "video/*,*/*;q=0.5", "user-agent": source.userAgent } }, resolve);
    request.on("timeout", () => request.destroy(new Error(`${source.label} met trop de temps à répondre.`)));
    request.on("error", reject);
  });
}

/**
 * Télécharge un fichier d’une banque : https seulement, hôtes de la banque
 * seulement, à chaque redirection (trois au plus), aucune adresse interne
 * (`safeLookup`), 200 Mo et cinq minutes au plus.
 */
export async function downloadVideoFile(raw: string, target: string, signal?: AbortSignal, source: DownloadSource = PEXELS_DOWNLOAD): Promise<void> {
  const label = source.label;
  if (!isAllowedVideoUrl(raw, source.hosts)) throw new VideoSearchError(`Adresse de fichier inattendue : seule ${label} est acceptée.`, "input");
  let url = new URL(raw);
  for (let hop = 0; hop <= 3; hop++) {
    const response = await get(url, signal, source);
    const status = response.statusCode ?? 0;
    if (status >= 300 && status < 400) {
      response.resume();
      const next = response.headers.location ? new URL(response.headers.location, url).toString() : "";
      if (!isAllowedVideoUrl(next, source.hosts)) throw new VideoSearchError(`${label} renvoie vers une adresse inattendue : téléchargement refusé.`, "provider");
      url = new URL(next);
      continue;
    }
    if (status < 200 || status >= 300) {
      response.resume();
      throw new VideoSearchError(`Le fichier de ${label} n’est pas accessible (HTTP ${status}).`, status === 429 ? "rate-limit" : "provider");
    }
    const type = String(response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (type && !type.startsWith("video/") && type !== "application/octet-stream" && type !== "binary/octet-stream" && !(source.extraTypes ?? []).includes(type)) {
      response.resume();
      throw new VideoSearchError(`Le fichier de ${label} n’est pas une vidéo.`, "provider");
    }
    if (Number(response.headers["content-length"] ?? 0) > VIDEO_SEARCH_LIMITS.maxFileBytes) {
      response.resume();
      throw new VideoSearchError("Vidéo trop lourde (200 Mo au plus).", "input");
    }
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(target, { mode: 0o600 });
      let total = 0;
      const deadline = setTimeout(() => response.destroy(new Error(`Le téléchargement depuis ${label} a pris trop de temps.`)), 5 * 60 * 1000);
      const fail = (error: unknown) => {
        clearTimeout(deadline);
        out.destroy();
        reject(error);
      };
      response.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > VIDEO_SEARCH_LIMITS.maxFileBytes) response.destroy(new VideoSearchError("Vidéo trop lourde (200 Mo au plus).", "input"));
      });
      response.on("error", fail);
      out.on("error", fail);
      out.on("finish", () => {
        clearTimeout(deadline);
        resolve();
      });
      response.pipe(out);
    });
    return;
  }
  throw new VideoSearchError(`Trop de redirections depuis ${label}.`, "provider");
}

// ─── Mise au format ──────────────────────────────────────────────

function runFfmpeg(binary: string, args: string[], signal?: AbortSignal): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { env: childEnv(), windowsHide: true, shell: false, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-20_000);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 10 * 60 * 1000);
    const onAbort = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", onAbort, { once: true });
    child.on("error", (error) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve({ code: code ?? 1, stderr });
    });
  });
}

/** Réglages de la mise au format selon la banque. */
export interface PrepareOptions {
  /** Nom affiché dans les messages. */
  label?: string;
  /**
   * Conteneurs admis à la lecture (WebM, Ogg… de Wikimedia Commons) : aucun
   * autre protocole que `file`, comme pour un lien direct.
   */
  formats?: string;
  /** Durée la plus longue acceptée, en secondes. */
  maxDurationSec?: number;
}

/**
 * Lit le fichier téléchargé et ne le réencode que s’il le faut (autre codec
 * que H.264 8 bits, son autre qu’AAC) : le fichier final est dans `output`.
 */
export async function prepareVideoFile(input: string, output: string, signal?: AbortSignal, options: PrepareOptions = {}): Promise<MediaStreams> {
  const label = options.label ?? "Pexels";
  const ffmpeg = await ensureFfmpeg();
  if (!ffmpeg) throw new VideoSearchError("ffmpeg n’est pas disponible sur le serveur : réessayez dans un moment.");
  const guard = options.formats ? ["-protocol_whitelist", "file", "-format_whitelist", options.formats] : [];
  const inspect = async (file: string, untrusted: boolean) =>
    parseMediaStreams((await runFfmpeg(ffmpeg, ["-nostdin", "-hide_banner", ...(untrusted ? guard : []), "-i", file], signal)).stderr);
  const streams = await inspect(input, true);
  if (!streams.video) throw new VideoSearchError(`Le fichier de ${label} ne contient pas de vidéo lisible.`, "provider");
  if (options.maxDurationSec && (streams.durationSec ?? 0) > options.maxDurationSec + 1) {
    throw new VideoSearchError(`Vidéo trop longue (${Math.round(options.maxDurationSec)} s au plus).`, "input");
  }
  const plan = conversionPlan(streams);
  if (!plan.video && !plan.audio) {
    fs.renameSync(input, output);
    return streams;
  }
  const args = finalizeArgs(input, output, streams);
  if (options.formats) {
    // Mêmes garde-fous que pour un lien direct, avec les conteneurs de la banque.
    const at = args.indexOf("-i");
    args.splice(at, 0, ...guard);
  }
  const converted = await runFfmpeg(ffmpeg, args, signal);
  signal?.throwIfAborted();
  if (converted.code !== 0 || !fs.existsSync(output)) throw new VideoSearchError(`La vidéo de ${label} n’a pas pu être mise au format du montage.`, "provider");
  return inspect(output, false);
}

/** Conteneurs lus pour un fichier de Wikimedia Commons : ceux d’un lien direct, plus Ogg. */
export const WIKIMEDIA_FORMATS = `${UNTRUSTED_INPUT_ARGS[3]},ogg`;

/** File d’attente simple : au plus `max` téléchargements à la fois. */
function createLimiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

const downloads = createLimiter(VIDEO_SEARCH_LIMITS.downloads);

// ─── Import dans les médias du module ────────────────────────────

type FoundVideoAsset = ClipAsset & { foundId?: string };

function toImported(asset: FoundVideoAsset): ImportedVideo {
  return {
    file: asset.file,
    url: `/api/modules/clip-studio/data/assets/${asset.file}`,
    ref: `module:clip-studio/assets/${asset.file}`,
    name: asset.originalName,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    credit: asset.credit ?? "",
    rights: "free",
    hasAudio: asset.hasAudio === true,
  };
}

/** Une vidéo déjà importée sous cet identifiant (`pexels:12`…), dont le fichier existe encore. */
export function alreadyImported(foundId: string): ImportedVideo | null {
  const asset = (readAssets() as FoundVideoAsset[]).find((entry) => entry.foundId === foundId && fs.existsSync(path.join(ASSETS_DIR, entry.file)));
  return asset ? toImported(asset) : null;
}

/** Média du projet tiré d’une vidéo importée : mention et droits la suivent jusqu’à la publication. */
export function importedVideoToSource(video: ImportedVideo): MediaSource {
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

/** Ce qu’il faut pour importer une vidéo d’une banque, quelle qu’elle soit. */
export interface StockVideoImport {
  /** `pexels:<id>`… : une vidéo déjà importée ne l’est pas deux fois. */
  foundId: string;
  provider: VideoProviderId;
  title: string;
  credit: string;
  author?: string;
  sourcePage?: string;
  /** Fichier retenu, déjà choisi pour le format du projet. */
  file: { url: string; width: number; height: number; extension?: string };
  durationSec?: number;
  download: DownloadSource;
  prepare?: PrepareOptions;
}

/**
 * Télécharge le fichier retenu d’une vidéo, le contrôle, le met au format et
 * le range parmi les médias du module, avec sa mention et sa provenance.
 */
export async function importStockVideo(entry: StockVideoImport, deps: VideoSearchDeps = {}, signal?: AbortSignal): Promise<ImportedVideo> {
  const already = alreadyImported(entry.foundId);
  if (already) return already;

  ensureDirs();
  // Fichier reçu et fichier mis au format coexistent un moment, plus 2 Go de marge.
  try {
    assertDiskSpace(DATA_DIR, 2 * VIDEO_SEARCH_LIMITS.maxFileBytes);
    // Budget des vidéos venues d’ailleurs (20 Go), partagé avec la récupération par adresse.
    enforceRemoteBudget(VIDEO_SEARCH_LIMITS.maxFileBytes);
  } catch (error) {
    throw new VideoSearchError(error instanceof Error ? error.message : "Disque plein sur le serveur.");
  }
  const slug = entry.foundId.replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
  const work = path.join(WORK_DIR, `${entry.provider}-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`);
  const releaseWorkDir = holdWorkDir(work);
  fs.mkdirSync(work, { recursive: true });
  try {
    const downloaded = path.join(work, `source.${/^[a-z0-9]{2,4}$/.test(entry.file.extension ?? "") ? entry.file.extension : "mp4"}`);
    const output = path.join(work, "final.mp4");
    const streams = await downloads(async () => {
      signal?.throwIfAborted();
      if (deps.download) await deps.download(entry.file.url, downloaded, signal);
      else await downloadVideoFile(entry.file.url, downloaded, signal, entry.download);
      return deps.prepare ? deps.prepare(downloaded, output, signal) : prepareVideoFile(downloaded, output, signal, { label: entry.download.label, ...entry.prepare });
    });
    signal?.throwIfAborted();
    const name = `${slug}-${randomBytes(3).toString("hex")}.mp4`;
    fs.renameSync(output, path.join(ASSETS_DIR, name));
    const now = Date.now();
    const title = entry.title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim() || slug;
    const sourcePage = httpsUrl(entry.sourcePage);
    const asset: FoundVideoAsset = {
      file: name,
      kind: "video",
      originalName: `${title}.mp4`.slice(0, 200),
      size: fs.statSync(path.join(ASSETS_DIR, name)).size,
      width: streams.width ?? entry.file.width,
      height: streams.height ?? entry.file.height,
      durationMs: streams.durationSec ? Math.round(streams.durationSec * 1000) : entry.durationSec ? Math.round(entry.durationSec * 1000) : undefined,
      credit: entry.credit,
      rights: "free",
      hasAudio: Boolean(streams.audio),
      // Provenance : le ménage des médias récupérés l’efface après 30 jours sans projet qui s’en sert.
      ...(sourcePage ? { origin: { site: "web" as const, url: sourcePage, title, ...(entry.author ? { author: entry.author.slice(0, 100) } : {}) } } : {}),
      lastUsedAt: now,
      foundId: entry.foundId,
      createdAt: now,
    };
    // Relue juste avant d’écrire : d’autres imports ont pu finir entre-temps.
    writeAssets([asset, ...readAssets()]);
    return toImported(asset);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
    releaseWorkDir();
  }
}

/**
 * Télécharge le fichier retenu d’une vidéo de Pexels, le contrôle et le range
 * parmi les médias du module. `height` : hauteur du projet, pour le choix du
 * fichier.
 */
export async function importPexelsVideo(video: PexelsVideo, target: { height: number }, deps: VideoSearchDeps = {}, signal?: AbortSignal): Promise<ImportedVideo> {
  const foundId = `pexels:${video.id}`;
  const already = alreadyImported(foundId);
  if (already) return already;
  const file = pickVideoFile(video.video_files, target);
  if (!file) throw new VideoSearchError("Cette vidéo n’a pas de fichier MP4 utilisable.", "input");
  return importStockVideo(
    {
      foundId,
      provider: "pexels",
      title: videoTitle(video),
      credit: pexelsCredit(video),
      ...(video.user?.name ? { author: String(video.user.name) } : {}),
      ...(httpsUrl(video.url) ? { sourcePage: httpsUrl(video.url) } : {}),
      file: { url: file.link, width: file.width, height: file.height, extension: "mp4" },
      ...(video.duration ? { durationSec: video.duration } : {}),
      download: PEXELS_DOWNLOAD,
    },
    deps,
    signal
  );
}

/** Importe une vidéo de Pexels désignée par son identifiant (`pexels:<id>`), relue chez Pexels si elle n’est plus en mémoire. */
export async function importFoundVideoById(id: string, options: { aspect?: AspectPreset } = {}, deps: VideoSearchDeps = {}): Promise<ImportedVideo> {
  const match = PEXELS_ID.exec(String(id ?? ""));
  if (!match) throw new VideoSearchError("Vidéo inconnue.", "input");
  const videoId = Number(match[1]);
  const already = alreadyImported(`pexels:${videoId}`);
  if (already) return already;
  const now = (deps.now ?? Date.now)();
  const cached = rate.seen.get(videoId);
  const video =
    cached && now - cached.at < SEEN_TTL_MS
      ? cached.video
      : readVideos({ videos: [await pexelsGet<unknown>(`${API}/videos/${videoId}`, { origin: { module: "clip-studio", feature: "Import de vidéo" } }, deps)] })[0];
  if (!video) throw new VideoSearchError("Cette vidéo n’est plus disponible sur Pexels.", "input");
  return importPexelsVideo(video, { height: ASPECTS[options.aspect ?? "9:16"].height }, deps);
}

// ─── Pour l’assistant ────────────────────────────────────────────

export interface FoundVideoForSegment {
  video: ImportedVideo;
  /** Autres plans du même sujet, quand le premier est plus court que le segment. */
  alternates: ImportedVideo[];
}

/**
 * Importe, dans l’ordre, les candidates d’un segment jusqu’à couvrir sa durée
 * (deux plans au plus) ; une candidate qui échoue laisse passer la suivante.
 */
export async function importForSegment<T>(
  ranked: T[],
  importOne: (candidate: T) => Promise<ImportedVideo>,
  minSeconds: number,
  signal?: AbortSignal
): Promise<FoundVideoForSegment | null> {
  const imported: ImportedVideo[] = [];
  for (const candidate of ranked) {
    signal?.throwIfAborted();
    try {
      imported.push(await importOne(candidate));
    } catch (error) {
      if (signal?.aborted) throw error;
      continue;
    }
    const covered = imported.reduce((sum, entry) => sum + (entry.durationMs ?? 0) / 1000, 0);
    if (imported.length >= 2 || covered >= minSeconds) break;
  }
  if (imported.length === 0) return null;
  return { video: imported[0], alternates: imported.slice(1) };
}

/**
 * Une vidéo de Pexels pour un segment : la recherche dans l’orientation du
 * projet, les résultats rangés par durée (`rankVideos`), le premier qui
 * s’importe. Quand il est plus court que le segment (`minSeconds`), un second
 * plan est importé pour alterner plutôt que boucler. `null` si rien ne
 * convient.
 */
export async function findSegmentVideo(
  input: { query: string; aspect: AspectPreset; minSeconds?: number; signal?: AbortSignal },
  deps: VideoSearchDeps = {}
): Promise<FoundVideoForSegment | null> {
  const videos = await searchPexels(
    {
      query: input.query,
      orientation: pexelsOrientation(input.aspect),
      perPage: VIDEO_SEARCH_LIMITS.perSegment,
      signal: input.signal,
      origin: { module: "clip-studio", feature: "Illustration vidéo" },
      reserve: true,
    },
    deps
  );
  const target = { height: ASPECTS[input.aspect].height };
  const ranked = rankVideos(videos, input.minSeconds ?? 0).filter((video) => pickVideoFile(video.video_files, target));
  return importForSegment(ranked, (video) => importPexelsVideo(video, target, deps, input.signal), input.minSeconds ?? 0, input.signal);
}
