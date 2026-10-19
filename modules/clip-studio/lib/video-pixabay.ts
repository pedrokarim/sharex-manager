/**
 * Vidéos de Pixabay (dossier 01 vidéo, V4.4) : la banque à clé gratuite et
 * immédiate, depuis que Pexels a suspendu la délivrance de nouvelles clés.
 *
 * - Recherche : `GET https://pixabay.com/api/videos/` (`q`, `page`,
 *   `per_page`, `safesearch=true`, `video_type=film`), avec la clé des
 *   réglages de Clip Studio (`video-sources.ts`, ou `PIXABAY_API_KEY`).
 * - Conditions de Pixabay : chaque réponse est gardée 24 heures (une même
 *   recherche ne repart pas chez Pixabay avant), les fichiers ne sont jamais
 *   liés en direct dans un projet (le serveur les télécharge), et la source
 *   est toujours citée (« Vidéo : auteur sur Pixabay »).
 * - Limite : 100 requêtes par 60 secondes et par clé ; les en-têtes
 *   `X-RateLimit-*` de chaque réponse sont relus, les appels de la minute
 *   comptés ici, et l’assistant laisse une marge à l’onglet « Trouver ».
 * - Fichier : parmi `large`, `medium`, `small` et `tiny` (MP4 en H.264), la
 *   hauteur la plus proche de celle du projet sans dépasser 1920 px.
 */

import type { AiUsageOrigin } from "@/lib/ai-usage";
import type { AiLimit, AiModuleProviderReport } from "@/lib/ai-usage/types";
import { ASPECTS, type AspectPreset } from "../engine/types";
import { pixabayApiKey } from "./video-sources";
import {
  VIDEO_SEARCH_LIMITS,
  VideoSearchError,
  alreadyImported,
  httpsUrl,
  importForSegment,
  importStockVideo,
  noteVideoCall,
  pexelsOrientation,
  preferOrientation,
  rankVideos,
  videoErrorKind,
  type DownloadSource,
  type FoundVideo,
  type FoundVideoForSegment,
  type ImportedVideo,
  type VideoOrientation,
  type VideoSearchDeps,
} from "./video-search";

const API = "https://pixabay.com/api/videos/";
const PIXABAY_ID = /^pixabay:(\d{1,12})$/;
export const PIXABAY_LICENSE = "Licence Pixabay";

export const PIXABAY_LIMITS = {
  /** Limite publiée : 100 requêtes par fenêtre de 60 secondes. */
  perWindow: 100,
  windowMs: 60_000,
  /** Marge gardée par l’assistant : l’onglet « Trouver » reste utilisable. */
  margin: 10,
  /** Conditions de Pixabay : les réponses sont gardées 24 heures. */
  cacheMs: 24 * 60 * 60 * 1000,
  cacheEntries: 400,
} as const;

/** Fichiers de Pixabay : servis par son CDN (Vimeo pour d’anciennes réponses). */
export const PIXABAY_DOWNLOAD: DownloadSource = {
  label: "Pixabay",
  hosts: [/^cdn\.pixabay\.com$/, /^pixabay\.com$/, /^player\.vimeo\.com$/, /^(?:[a-z0-9-]+\.)*vimeocdn\.com$/],
  userAgent: "ShareX-Manager/clip-studio (stock video)",
};

// ─── Réponses de Pixabay ─────────────────────────────────────────

export interface PixabayRendition {
  url?: string | null;
  width?: number | null;
  height?: number | null;
  size?: number | null;
  thumbnail?: string | null;
}

export interface PixabayHit {
  id: number;
  pageURL?: string;
  type?: string;
  tags?: string;
  duration?: number;
  picture_id?: string;
  videos?: Partial<Record<"large" | "medium" | "small" | "tiny", PixabayRendition>>;
  user?: string;
  user_id?: number;
}

const RENDITIONS = ["large", "medium", "small", "tiny"] as const;

type UsableRendition = { url: string; width: number; height: number; size: number; name: (typeof RENDITIONS)[number] };

function renditions(hit: Pick<PixabayHit, "videos">): UsableRendition[] {
  const list: UsableRendition[] = [];
  for (const name of RENDITIONS) {
    const entry = hit.videos?.[name];
    const url = httpsUrl(entry?.url);
    const width = Number(entry?.width);
    const height = Number(entry?.height);
    // Une version absente a une adresse vide et une taille nulle.
    if (!url || !(width > 0) || !(height > 0)) continue;
    list.push({ url, width, height, size: Number(entry?.size) || 0, name });
  }
  return list;
}

/**
 * Version retenue : la hauteur la plus proche de celle du projet sans
 * dépasser 1920 px ; à égalité, la plus légère.
 */
export function pickPixabayRendition(hit: Pick<PixabayHit, "videos">, target: { height: number }): UsableRendition | null {
  const eligible = renditions(hit).filter((entry) => entry.height <= VIDEO_SEARCH_LIMITS.maxFileHeight && (entry.size === 0 || entry.size <= VIDEO_SEARCH_LIMITS.maxFileBytes));
  if (eligible.length === 0) return null;
  return eligible.sort((a, b) => Math.abs(a.height - target.height) - Math.abs(b.height - target.height) || a.width * a.height - b.width * b.height)[0];
}

/** Dimensions de la vidéo, d’après sa plus grande version. */
function hitSize(hit: PixabayHit): { width?: number; height?: number } {
  const largest = renditions(hit).sort((a, b) => b.width * b.height - a.width * a.height)[0];
  return largest ? { width: largest.width, height: largest.height } : {};
}

/** Titre lisible, tiré des mots-clés (« flowers, yellow, blossom » → « Flowers, yellow, blossom »). */
export function pixabayTitle(hit: Pick<PixabayHit, "id" | "tags">): string {
  const words = String(hit.tags ?? "")
    .split(",")
    .map((tag) => tag.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(", ");
  return words ? (words[0].toUpperCase() + words.slice(1)).slice(0, 120) : `Vidéo Pixabay ${hit.id}`;
}

/** Mention reprise à la publication : Pixabay demande de citer la source. */
export function pixabayCredit(hit: Pick<PixabayHit, "user">): string {
  const author = String(hit.user ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  return author ? `Vidéo : ${author} sur Pixabay` : "Vidéo : Pixabay";
}

export function pixabayToFound(hit: PixabayHit): FoundVideo {
  const all = renditions(hit);
  const smallest = [...all].sort((a, b) => a.width * a.height - b.width * b.height)[0];
  const medium = hit.videos?.medium ?? hit.videos?.small ?? hit.videos?.tiny;
  const thumbnail =
    httpsUrl(medium?.thumbnail) ??
    httpsUrl(hit.videos?.small?.thumbnail) ??
    httpsUrl(hit.videos?.tiny?.thumbnail) ??
    (hit.picture_id && /^[\w-]{1,40}$/.test(hit.picture_id) ? `https://i.vimeocdn.com/video/${hit.picture_id}_640x360.jpg` : "");
  const size = hitSize(hit);
  return {
    id: `pixabay:${hit.id}`,
    provider: "pixabay",
    thumbnail,
    // Aperçu au survol : affichage temporaire des résultats, permis par Pixabay.
    ...(smallest ? { preview: smallest.url } : {}),
    title: pixabayTitle(hit),
    ...(hit.user ? { creator: String(hit.user).slice(0, 100) } : {}),
    ...(httpsUrl(hit.pageURL) ? { sourcePage: httpsUrl(hit.pageURL) } : {}),
    ...(size.width ? { width: size.width, height: size.height } : {}),
    durationSec: Number(hit.duration) || 0,
    license: PIXABAY_LICENSE,
    rights: "free",
  };
}

/** Vidéos lues avec rigueur : un identifiant entier et au moins une version utilisable. */
export function readPixabayHits(body: unknown): PixabayHit[] {
  const list = (body as { hits?: unknown })?.hits;
  return (Array.isArray(list) ? list : []).filter(
    (hit): hit is PixabayHit => Boolean(hit) && Number.isInteger((hit as PixabayHit).id) && (hit as PixabayHit).id > 0 && renditions(hit as PixabayHit).length > 0
  );
}

// ─── Appels, limite et cache de 24 heures ────────────────────────

interface PixabayState {
  /** Appels de la dernière minute (instants). */
  calls: number[];
  /** Fenêtre relevée dans les en-têtes de la dernière réponse. */
  window?: { limit: number; remaining: number; resetsAt: number };
  /** Réponses gardées 24 heures, par requête. */
  cache: Map<string, { at: number; hits: PixabayHit[] }>;
  /** Vidéos vues, pour importer par identifiant sans nouvel appel (24 heures aussi). */
  seen: Map<number, { at: number; hit: PixabayHit }>;
}

const state = ((globalThis as any).__sxmPixabay ??= { calls: [], cache: new Map(), seen: new Map() }) as PixabayState;

function callsThisWindow(now: number): number {
  state.calls = state.calls.filter((at) => now - at < PIXABAY_LIMITS.windowMs);
  return state.calls.length;
}

function readRateHeaders(headers: Headers, now: number) {
  const limit = Number(headers.get("x-ratelimit-limit"));
  const remaining = Number(headers.get("x-ratelimit-remaining"));
  // Pixabay donne le nombre de secondes avant la remise à zéro de la fenêtre.
  const reset = Number(headers.get("x-ratelimit-reset"));
  if (Number.isFinite(limit) && limit > 0 && Number.isFinite(remaining)) {
    state.window = { limit, remaining: Math.max(0, remaining), resetsAt: now + (Number.isFinite(reset) && reset > 0 ? reset * 1000 : PIXABAY_LIMITS.windowMs) };
  }
}

/** Rapport pour l’écran des services : accès et limite, sans aucun appel. */
export function pixabayUsageReport(now = Date.now()): AiModuleProviderReport {
  const fromEnv = Boolean(process.env.PIXABAY_API_KEY);
  const configured = Boolean(pixabayApiKey());
  const remote = state.window && state.window.resetsAt > now ? state.window : undefined;
  const window: AiLimit = remote
    ? {
        id: "pixabay-minute",
        label: "Requêtes de la minute",
        unit: "calls",
        period: "plan",
        used: Math.max(0, remote.limit - remote.remaining),
        limit: remote.limit,
        resetsAt: remote.resetsAt,
        source: "remote",
        note: "Relevé dans la dernière réponse de Pixabay ; chaque recherche est gardée 24 heures.",
      }
    : {
        id: "pixabay-minute",
        label: "Requêtes de la minute",
        unit: "calls",
        period: "plan",
        used: callsThisWindow(now),
        limit: PIXABAY_LIMITS.perWindow,
        source: "local",
        note: "100 requêtes par 60 secondes au plus ; chaque recherche est gardée 24 heures.",
      };
  return { access: fromEnv ? "env" : configured ? "key" : "none", limits: [window], settingsHref: "/m/clip-studio/voices" };
}

const NO_KEY = "Ajoutez une clé Pixabay dans « Voix en ligne », section « Sources vidéo », pour chercher des vidéos sur Pixabay.";

/** Un appel à l’API de Pixabay, compté et noté au registre. La clé part dans l’adresse : elle n’apparaît dans aucun message. */
async function pixabayGet(params: URLSearchParams, options: { signal?: AbortSignal; origin: AiUsageOrigin; reserve?: boolean }, deps: VideoSearchDeps): Promise<unknown> {
  const key = (deps.apiKey ?? pixabayApiKey)();
  if (!key) throw new VideoSearchError(NO_KEY, "auth");
  const now = (deps.now ?? Date.now)();
  const margin = options.reserve ? PIXABAY_LIMITS.margin : 0;
  if (state.window && state.window.resetsAt > now && state.window.remaining <= margin) {
    throw new VideoSearchError("Limite de Pixabay atteinte (100 requêtes par minute) : réessayez dans une minute.", "rate-limit");
  }
  if (callsThisWindow(now) >= PIXABAY_LIMITS.perWindow - margin) {
    throw new VideoSearchError("Limite de Pixabay atteinte (100 requêtes par minute) : réessayez dans une minute.", "rate-limit");
  }
  state.calls.push(now);
  if (state.window && state.window.resetsAt > now) state.window.remaining = Math.max(0, state.window.remaining - 1);
  const timeout = AbortSignal.timeout(20_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const startedAt = Date.now();
  const query = new URLSearchParams(params);
  query.set("key", key);
  try {
    const response = await (deps.fetch ?? fetch)(`${API}?${query}`, { headers: { Accept: "application/json" }, signal });
    readRateHeaders(response.headers, (deps.now ?? Date.now)());
    if (response.status === 429) {
      if (state.window) state.window.remaining = 0;
      throw new VideoSearchError("Pixabay limite les requêtes pour l’instant (100 par minute) : réessayez dans une minute.", "rate-limit");
    }
    if (response.status === 401 || response.status === 403) throw new VideoSearchError("Pixabay refuse la clé enregistrée : vérifiez-la dans « Voix en ligne ».", "auth");
    if (response.status === 400) {
      // Pixabay répond en texte : « [ERROR 400] Invalid or missing API key »…
      const text = (await response.text().catch(() => "")).slice(0, 200);
      if (/key/i.test(text)) throw new VideoSearchError("Pixabay refuse la clé enregistrée : vérifiez-la dans « Voix en ligne ».", "auth");
      throw new VideoSearchError("Pixabay refuse cette recherche : essayez d’autres mots.", "input");
    }
    if (!response.ok) throw new VideoSearchError(`Pixabay a répondu HTTP ${response.status} : réessayez dans un moment.`, "provider");
    const body = await response.json();
    noteVideoCall("pixabay", options.origin, startedAt, true);
    return body;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    noteVideoCall("pixabay", options.origin, startedAt, false, error);
    if (error instanceof VideoSearchError) throw error;
    throw new VideoSearchError("Pixabay ne répond pas : réessayez dans un moment.", videoErrorKind(error));
  }
}

function remember(hits: PixabayHit[], now: number) {
  for (const [id, entry] of state.seen) if (now - entry.at > PIXABAY_LIMITS.cacheMs) state.seen.delete(id);
  for (const hit of hits) state.seen.set(hit.id, { at: now, hit });
  while (state.seen.size > 2000) state.seen.delete(state.seen.keys().next().value as number);
}

/** Recherche, servie par le cache de 24 heures quand la même requête a déjà été faite. */
export async function searchPixabay(
  input: { query: string; page?: number; perPage?: number; signal?: AbortSignal; origin: AiUsageOrigin; reserve?: boolean },
  deps: VideoSearchDeps = {}
): Promise<PixabayHit[]> {
  const query = String(input.query ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (query.length < 2) return [];
  // Pixabay sert de 3 à 200 résultats par page.
  const perPage = Math.min(200, Math.max(3, Math.round(input.perPage ?? VIDEO_SEARCH_LIMITS.perPage)));
  const page = Math.min(50, Math.max(1, Math.round(input.page ?? 1)));
  const params = new URLSearchParams({ q: query, page: String(page), per_page: String(perPage), safesearch: "true", video_type: "film" });
  const cacheKey = `${query.toLowerCase()}|${page}|${perPage}`;
  const now = (deps.now ?? Date.now)();
  const cached = state.cache.get(cacheKey);
  if (cached && now - cached.at < PIXABAY_LIMITS.cacheMs) return cached.hits;

  const hits = readPixabayHits(await pixabayGet(params, input, deps));
  for (const [key, entry] of state.cache) if (now - entry.at >= PIXABAY_LIMITS.cacheMs) state.cache.delete(key);
  state.cache.set(cacheKey, { at: now, hits });
  while (state.cache.size > PIXABAY_LIMITS.cacheEntries) state.cache.delete(state.cache.keys().next().value as string);
  remember(hits, now);
  return hits;
}

/** Recherche de l’onglet « Trouver », par page ; l’orientation du projet passe devant. */
export async function searchPixabayFound(input: { query: string; orientation?: VideoOrientation; page?: number }, deps: VideoSearchDeps = {}): Promise<FoundVideo[]> {
  const hits = await searchPixabay({ query: input.query, page: input.page, origin: { module: "clip-studio", feature: "Recherche de vidéos" } }, deps);
  return preferOrientation(hits, input.orientation, hitSize).map(pixabayToFound).filter((video) => video.thumbnail);
}

export async function importPixabayHit(hit: PixabayHit, target: { height: number }, deps: VideoSearchDeps = {}, signal?: AbortSignal): Promise<ImportedVideo> {
  const foundId = `pixabay:${hit.id}`;
  const already = alreadyImported(foundId);
  if (already) return already;
  const file = pickPixabayRendition(hit, target);
  if (!file) throw new VideoSearchError("Cette vidéo n’a pas de fichier MP4 utilisable.", "input");
  return importStockVideo(
    {
      foundId,
      provider: "pixabay",
      title: pixabayTitle(hit),
      credit: pixabayCredit(hit),
      ...(hit.user ? { author: String(hit.user) } : {}),
      ...(httpsUrl(hit.pageURL) ? { sourcePage: httpsUrl(hit.pageURL) } : {}),
      file: { url: file.url, width: file.width, height: file.height, extension: "mp4" },
      ...(hit.duration ? { durationSec: hit.duration } : {}),
      download: PIXABAY_DOWNLOAD,
    },
    deps,
    signal
  );
}

/** Importe une vidéo désignée par son identifiant (`pixabay:<id>`), relue chez Pixabay si elle n’est plus en mémoire. */
export async function importPixabayById(id: string, options: { aspect?: AspectPreset } = {}, deps: VideoSearchDeps = {}): Promise<ImportedVideo> {
  const match = PIXABAY_ID.exec(String(id ?? ""));
  if (!match) throw new VideoSearchError("Vidéo inconnue.", "input");
  const videoId = Number(match[1]);
  const already = alreadyImported(`pixabay:${videoId}`);
  if (already) return already;
  const now = (deps.now ?? Date.now)();
  const cached = state.seen.get(videoId);
  let hit = cached && now - cached.at < PIXABAY_LIMITS.cacheMs ? cached.hit : undefined;
  if (!hit) {
    hit = readPixabayHits(await pixabayGet(new URLSearchParams({ id: String(videoId) }), { origin: { module: "clip-studio", feature: "Import de vidéo" } }, deps))[0];
    if (hit) remember([hit], now);
  }
  if (!hit) throw new VideoSearchError("Cette vidéo n’est plus disponible sur Pixabay.", "input");
  return importPixabayHit(hit, { height: ASPECTS[options.aspect ?? "9:16"].height }, deps);
}

/** Une vidéo de Pixabay pour un segment de l’assistant ; `null` si rien ne convient. */
export async function findPixabaySegmentVideo(
  input: { query: string; aspect: AspectPreset; minSeconds?: number; signal?: AbortSignal },
  deps: VideoSearchDeps = {}
): Promise<FoundVideoForSegment | null> {
  const hits = await searchPixabay(
    { query: input.query, perPage: VIDEO_SEARCH_LIMITS.perSegment, signal: input.signal, origin: { module: "clip-studio", feature: "Illustration vidéo" }, reserve: true },
    deps
  );
  const target = { height: ASPECTS[input.aspect].height };
  const ranked = preferOrientation(rankVideos(hits, input.minSeconds ?? 0), pexelsOrientation(input.aspect), hitSize).filter((hit) => pickPixabayRendition(hit, target));
  return importForSegment(ranked, (hit) => importPixabayHit(hit, target, deps, input.signal), input.minSeconds ?? 0, input.signal);
}
