/**
 * Vidéos de Wikimedia Commons (dossier 01 vidéo, V4.4) : la banque sans clé,
 * toujours disponible, dernier recours de l’assistant.
 *
 * - Recherche : API MediaWiki de Commons (`action=query`,
 *   `generator=search` dans l’espace des fichiers avec `filetype:video`,
 *   `prop=videoinfo` pour l’adresse, la taille, la durée, les versions
 *   réencodées et les métadonnées de licence). Un `User-Agent` qui nomme
 *   l’application et un contact, comme le demande la politique de Wikimedia ;
 *   les appels sont espacés (30 par minute au plus) et les réponses gardées
 *   une heure.
 * - Licences : seules les licences libres sont gardées (CC0, domaine public,
 *   CC BY, CC BY-SA) ; jamais NC ni ND, jamais un fichier marqué non libre.
 *   La licence et l’auteur vont dans la mention (« Vidéo : auteur sur
 *   Wikimedia Commons (CC BY-SA 4.0) »).
 * - Fichier : WebM ou Ogg, réencodé en H.264 et AAC par le ffmpeg épinglé
 *   (l’export du navigateur l’exige) ; versions réencodées de Commons
 *   préférées à l’original, 200 Mo et deux minutes au plus.
 */

import type { AiUsageOrigin } from "@/lib/ai-usage";
import type { AiModuleProviderReport } from "@/lib/ai-usage/types";
import { SITE_LINKS } from "@/config/links";
import { ASPECTS, type AspectPreset } from "../engine/types";
import {
  VIDEO_SEARCH_LIMITS,
  VideoSearchError,
  WIKIMEDIA_FORMATS,
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

const API = "https://commons.wikimedia.org/w/api.php";
const WIKIMEDIA_ID = /^wikimedia:(\d{1,12})$/;

/** Politique de Wikimedia : nom de l’application et moyen de joindre ses auteurs. */
export const WIKIMEDIA_USER_AGENT = `ShareX-Manager/clip-studio (${SITE_LINKS.repository}; ${SITE_LINKS.email})`;

export const WIKIMEDIA_LIMITS = {
  /** Appels espacés : 30 par minute au plus. */
  perMinute: 30,
  /** Réponses gardées une heure. */
  cacheMs: 60 * 60 * 1000,
  cacheEntries: 300,
  /** Durée la plus longue importée, en secondes : le réencodage reste court. */
  maxDurationSec: 120,
  /** Plus petite durée gardée : en dessous, ce n’est pas un plan. */
  minDurationSec: 2,
  /** Petit côté le plus grand téléchargé : le montage ne dépasse pas 1080. */
  maxShortSide: 1080,
} as const;

export const WIKIMEDIA_DOWNLOAD: DownloadSource = {
  label: "Wikimedia Commons",
  hosts: [/^upload\.wikimedia\.org$/],
  userAgent: WIKIMEDIA_USER_AGENT,
  // Commons sert les fichiers Ogg avec ce type.
  extraTypes: ["application/ogg"],
};

// ─── Réponses de Commons ─────────────────────────────────────────

interface MetaValue {
  value?: unknown;
}

export interface WikimediaDerivative {
  src?: string;
  type?: string;
  transcodekey?: string;
  width?: number;
  height?: number;
  bandwidth?: number;
}

export interface WikimediaInfo {
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  mime?: string;
  mediatype?: string;
  extmetadata?: Record<string, MetaValue | undefined>;
  derivatives?: WikimediaDerivative[];
}

export interface WikimediaPage {
  pageid: number;
  title?: string;
  index?: number;
  videoinfo?: WikimediaInfo[];
}

/** Une vidéo de Commons lue avec rigueur, licence libre comprise. */
export interface WikimediaVideo {
  pageId: number;
  title: string;
  author: string;
  license: string;
  licenseUrl?: string;
  sourcePage?: string;
  thumbnail?: string;
  width: number;
  height: number;
  duration: number;
  info: WikimediaInfo;
}

const metaText = (meta: Record<string, MetaValue | undefined> | undefined, key: string): string => {
  const value = meta?.[key]?.value;
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Texte brut d’un champ HTML de Commons (l’auteur est souvent un lien). */
export function plainText(html: string): string {
  return html
    // Les balises de bloc séparent des mots ; les autres (liens, gras) n'en ajoutent pas.
    .replace(/<\/?(?:br|p|div|li|ul|ol|tr|td|th|table)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (entity, name: string) => {
      const key = name.toLowerCase();
      if (ENTITIES[key] !== undefined) return ENTITIES[key];
      const code = key.startsWith("#x") ? parseInt(key.slice(2), 16) : key.startsWith("#") ? parseInt(key.slice(1), 10) : NaN;
      return Number.isFinite(code) && code > 31 && code < 0x110000 ? String.fromCodePoint(code) : entity;
    })
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Licence d’un fichier, gardée seulement si elle est libre au sens de V4.4 :
 * CC0, domaine public, CC BY ou CC BY-SA (toutes versions). NC, ND, GFDL
 * seule, licences inconnues et fichiers marqués non libres sont écartés.
 */
export function freeWikimediaLicense(meta: Record<string, MetaValue | undefined> | undefined): { name: string; url?: string } | null {
  if (/^true$/i.test(metaText(meta, "NonFree"))) return null;
  const code = plainText(metaText(meta, "License")).toLowerCase();
  const short = plainText(metaText(meta, "LicenseShortName"));
  const shortLower = short.toLowerCase();
  if (/\b(nc|nd)\b|non-?commercial|no-?deriv/.test(`${code} ${shortLower}`)) return null;
  const byCode = /^(cc0|pd|cc-by(-sa)?-\d)/.test(code) || /^pd-/.test(code);
  const byName = /^(cc0|public domain|domaine public|pd\b|cc[- ]by(-sa)?[- ]\d)/.test(shortLower);
  if (!byCode && !byName) return null;
  const name = (short || code.toUpperCase()).slice(0, 40);
  const url = metaText(meta, "LicenseUrl").replace(/^http:\/\//, "https://");
  return { name, ...(httpsUrl(url) ? { url } : {}) };
}

/** Mention reprise à la publication : auteur, banque et licence (CC BY l’exige). */
export function wikimediaCredit(video: Pick<WikimediaVideo, "author" | "license">): string {
  const author = video.author.slice(0, 100);
  return `Vidéo : ${author || "auteur inconnu"} sur Wikimedia Commons (${video.license})`;
}

/** « File:Ocean surface waves 06.ogv » → « Ocean surface waves 06 ». */
function fileTitle(page: WikimediaPage, info: WikimediaInfo): string {
  const object = plainText(metaText(info.extmetadata, "ObjectName"));
  const raw = object || String(page.title ?? "").replace(/^(File|Fichier):/i, "").replace(/\.[a-z0-9]{2,5}$/i, "");
  const title = raw.replace(/_/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return title || `Vidéo Wikimedia ${page.pageid}`;
}

/** Une page de résultat devient une vidéo utilisable, ou rien (licence, durée, taille). */
export function readWikimediaPage(page: WikimediaPage): WikimediaVideo | null {
  if (!page || !Number.isInteger(page.pageid) || page.pageid <= 0) return null;
  const info = page.videoinfo?.[0];
  if (!info || String(info.mediatype ?? "").toUpperCase() !== "VIDEO") return null;
  const duration = Number(info.duration) || 0;
  if (duration < WIKIMEDIA_LIMITS.minDurationSec || duration > WIKIMEDIA_LIMITS.maxDurationSec) return null;
  const width = Number(info.width) || 0;
  const height = Number(info.height) || 0;
  if (!(width > 0 && height > 0)) return null;
  const license = freeWikimediaLicense(info.extmetadata);
  if (!license) return null;
  const author = plainText(metaText(info.extmetadata, "Artist")) || plainText(metaText(info.extmetadata, "Credit"));
  return {
    pageId: page.pageid,
    title: fileTitle(page, info),
    author: author.slice(0, 100),
    license: license.name,
    ...(license.url ? { licenseUrl: license.url } : {}),
    ...(httpsUrl(info.descriptionurl) ? { sourcePage: httpsUrl(info.descriptionurl) } : {}),
    ...(httpsUrl(info.thumburl) ? { thumbnail: httpsUrl(info.thumburl) } : {}),
    width,
    height,
    duration,
    info,
  };
}

/** Pages d’une réponse, dans l’ordre de pertinence de la recherche (`index`). */
export function readWikimediaVideos(body: unknown): WikimediaVideo[] {
  const pages = (body as { query?: { pages?: unknown } })?.query?.pages;
  const list = Array.isArray(pages) ? (pages as WikimediaPage[]) : pages && typeof pages === "object" ? (Object.values(pages) as WikimediaPage[]) : [];
  return [...list]
    .sort((a, b) => (Number(a?.index) || 0) - (Number(b?.index) || 0))
    .map(readWikimediaPage)
    .filter((video): video is WikimediaVideo => video !== null);
}

type Rendition = { url: string; width: number; height: number; bytes: number; extension: string; original: boolean };

const CONTAINER: Record<string, string> = { "video/webm": "webm", "video/ogg": "ogv", "application/ogg": "ogv", "video/mp4": "mp4" };

/** Versions téléchargeables : l’original et les versions réencodées de Commons (WebM, VP9 ou VP8). */
function wikimediaRenditions(video: WikimediaVideo): Rendition[] {
  const list: Rendition[] = [];
  const original = httpsUrl(video.info.url);
  const originalType = String(video.info.mime ?? "").toLowerCase();
  if (original && CONTAINER[originalType]) {
    list.push({ url: original, width: video.width, height: video.height, bytes: Number(video.info.size) || 0, extension: CONTAINER[originalType], original: true });
  }
  for (const derivative of video.info.derivatives ?? []) {
    const url = httpsUrl(derivative?.src);
    const type = String(derivative?.type ?? "").split(";")[0].trim().toLowerCase();
    // L’original figure aussi parmi les versions, sans clé de réencodage.
    if (!url || !derivative.transcodekey || type !== "video/webm") continue;
    const width = Number(derivative.width) || 0;
    const height = Number(derivative.height) || 0;
    if (!(width > 0 && height > 0)) continue;
    const bytes = Math.round(((Number(derivative.bandwidth) || 0) * video.duration) / 8);
    list.push({ url, width, height, bytes, extension: "webm", original: false });
  }
  return list;
}

/**
 * Version retenue : petit côté de 1080 px au plus, 200 Mo au plus (taille
 * estimée d’après le débit pour une version réencodée), hauteur la plus
 * proche de celle du projet (bornée à 1080) ; à égalité, une version
 * réencodée de Commons plutôt que l’original, puis la plus légère.
 */
export function pickWikimediaRendition(video: WikimediaVideo, target: { height: number }): Rendition | null {
  const goal = Math.min(target.height, WIKIMEDIA_LIMITS.maxShortSide);
  const eligible = wikimediaRenditions(video).filter(
    (entry) => Math.min(entry.width, entry.height) <= WIKIMEDIA_LIMITS.maxShortSide && entry.height <= VIDEO_SEARCH_LIMITS.maxFileHeight && entry.bytes > 0 && entry.bytes <= VIDEO_SEARCH_LIMITS.maxFileBytes
  );
  if (eligible.length === 0) return null;
  return eligible.sort(
    (a, b) => Math.abs(a.height - goal) - Math.abs(b.height - goal) || Number(a.original) - Number(b.original) || a.bytes - b.bytes
  )[0];
}

/** Plus petite version réencodée, pour l’aperçu au survol. */
function previewRendition(video: WikimediaVideo): string | undefined {
  return wikimediaRenditions(video)
    .filter((entry) => !entry.original)
    .sort((a, b) => a.width * a.height - b.width * b.height)[0]?.url;
}

export function wikimediaToFound(video: WikimediaVideo): FoundVideo {
  const preview = previewRendition(video);
  return {
    id: `wikimedia:${video.pageId}`,
    provider: "wikimedia",
    thumbnail: video.thumbnail ?? "",
    ...(preview ? { preview } : {}),
    title: video.title,
    ...(video.author ? { creator: video.author } : {}),
    ...(video.sourcePage ? { sourcePage: video.sourcePage } : {}),
    width: video.width,
    height: video.height,
    durationSec: video.duration,
    license: video.license,
    ...(video.licenseUrl ? { licenseUrl: video.licenseUrl } : {}),
    rights: "free",
  };
}

// ─── Appels, rythme et cache ─────────────────────────────────────

interface WikimediaState {
  calls: number[];
  cache: Map<string, { at: number; videos: WikimediaVideo[] }>;
  seen: Map<number, { at: number; video: WikimediaVideo }>;
}

const state = ((globalThis as any).__sxmWikimedia ??= { calls: [], cache: new Map(), seen: new Map() }) as WikimediaState;

function callsThisMinute(now: number): number {
  state.calls = state.calls.filter((at) => now - at < 60_000);
  return state.calls.length;
}

/** Rapport pour l’écran des services : ouvert, sans clé ; le rythme local est la seule limite. */
export function wikimediaUsageReport(now = Date.now()): AiModuleProviderReport {
  return {
    access: "open",
    limits: [
      {
        id: "wikimedia-minute",
        label: "Requêtes de la minute",
        unit: "calls",
        period: "plan",
        used: callsThisMinute(now),
        limit: WIKIMEDIA_LIMITS.perMinute,
        source: "local",
        note: "Rythme que Clip Studio s’impose : Commons est un service bénévole.",
      },
    ],
  };
}

/** Champs demandés pour chaque fichier. */
const VIDEO_INFO = {
  prop: "videoinfo",
  viprop: "url|size|mime|mediatype|extmetadata|derivatives",
  viurlwidth: "640",
  viextmetadatafilter: "ObjectName|Artist|Credit|LicenseShortName|License|LicenseUrl|NonFree|AttributionRequired",
};

async function wikimediaGet(params: Record<string, string>, options: { signal?: AbortSignal; origin: AiUsageOrigin }, deps: VideoSearchDeps): Promise<unknown> {
  const now = (deps.now ?? Date.now)();
  if (callsThisMinute(now) >= WIKIMEDIA_LIMITS.perMinute) {
    throw new VideoSearchError("Trop de recherches sur Wikimedia Commons en une minute : réessayez dans un moment.", "rate-limit");
  }
  state.calls.push(now);
  const timeout = AbortSignal.timeout(20_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const startedAt = Date.now();
  const query = new URLSearchParams({ action: "query", format: "json", formatversion: "2", ...params });
  try {
    const response = await (deps.fetch ?? fetch)(`${API}?${query}`, {
      headers: { Accept: "application/json", "User-Agent": WIKIMEDIA_USER_AGENT, "Api-User-Agent": WIKIMEDIA_USER_AGENT },
      signal,
    });
    if (response.status === 429) throw new VideoSearchError("Wikimedia Commons limite les requêtes pour l’instant : réessayez dans un moment.", "rate-limit");
    if (!response.ok) throw new VideoSearchError(`Wikimedia Commons a répondu HTTP ${response.status} : réessayez dans un moment.`, "provider");
    const body = (await response.json()) as { error?: { code?: string; info?: string } };
    if (body?.error) {
      const code = String(body.error.code ?? "");
      throw new VideoSearchError(
        code === "maxlag" || code === "ratelimited" ? "Wikimedia Commons est chargé : réessayez dans un moment." : "Wikimedia Commons refuse cette recherche : essayez d’autres mots.",
        code === "maxlag" || code === "ratelimited" ? "rate-limit" : "input"
      );
    }
    noteVideoCall("wikimedia", options.origin, startedAt, true);
    return body;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    noteVideoCall("wikimedia", options.origin, startedAt, false, error);
    if (error instanceof VideoSearchError) throw error;
    throw new VideoSearchError("Wikimedia Commons ne répond pas : réessayez dans un moment.", videoErrorKind(error));
  }
}

function remember(videos: WikimediaVideo[], now: number) {
  for (const [id, entry] of state.seen) if (now - entry.at > WIKIMEDIA_LIMITS.cacheMs) state.seen.delete(id);
  for (const video of videos) state.seen.set(video.pageId, { at: now, video });
  while (state.seen.size > 1000) state.seen.delete(state.seen.keys().next().value as number);
}

/** Recherche de vidéos libres, servie par le cache d’une heure quand la même requête a déjà été faite. */
export async function searchWikimedia(
  input: { query: string; page?: number; perPage?: number; signal?: AbortSignal; origin: AiUsageOrigin },
  deps: VideoSearchDeps = {}
): Promise<WikimediaVideo[]> {
  // Les opérateurs de recherche (`filetype:`, `insource:`…) ne viennent que d’ici.
  const query = String(input.query ?? "").replace(/[:"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  if (query.length < 2) return [];
  const perPage = Math.min(50, Math.max(1, Math.round(input.perPage ?? VIDEO_SEARCH_LIMITS.perPage)));
  const page = Math.min(20, Math.max(1, Math.round(input.page ?? 1)));
  const cacheKey = `${query.toLowerCase()}|${page}|${perPage}`;
  const now = (deps.now ?? Date.now)();
  const cached = state.cache.get(cacheKey);
  if (cached && now - cached.at < WIKIMEDIA_LIMITS.cacheMs) return cached.videos;

  const body = await wikimediaGet(
    {
      generator: "search",
      gsrnamespace: "6",
      gsrsearch: `${query} filetype:video`,
      // Licences et durées écartent une partie des réponses : on en demande deux fois plus.
      gsrlimit: String(Math.min(50, perPage * 2)),
      gsroffset: String((page - 1) * Math.min(50, perPage * 2)),
      ...VIDEO_INFO,
    },
    input,
    deps
  );
  const videos = readWikimediaVideos(body);
  for (const [key, entry] of state.cache) if (now - entry.at >= WIKIMEDIA_LIMITS.cacheMs) state.cache.delete(key);
  state.cache.set(cacheKey, { at: now, videos });
  while (state.cache.size > WIKIMEDIA_LIMITS.cacheEntries) state.cache.delete(state.cache.keys().next().value as string);
  remember(videos, now);
  return videos;
}

/** Recherche de l’onglet « Trouver », par page ; l’orientation du projet passe devant. */
export async function searchWikimediaFound(input: { query: string; orientation?: VideoOrientation; page?: number }, deps: VideoSearchDeps = {}): Promise<FoundVideo[]> {
  const videos = await searchWikimedia({ query: input.query, page: input.page, origin: { module: "clip-studio", feature: "Recherche de vidéos" } }, deps);
  return preferOrientation(videos, input.orientation, (video) => video)
    .filter((video) => pickWikimediaRendition(video, { height: 1080 }))
    .map(wikimediaToFound)
    .filter((video) => video.thumbnail);
}

export async function importWikimediaVideo(video: WikimediaVideo, target: { height: number }, deps: VideoSearchDeps = {}, signal?: AbortSignal): Promise<ImportedVideo> {
  const foundId = `wikimedia:${video.pageId}`;
  const already = alreadyImported(foundId);
  if (already) return already;
  const file = pickWikimediaRendition(video, target);
  if (!file) throw new VideoSearchError("Cette vidéo n’a pas de version assez légère à télécharger.", "input");
  return importStockVideo(
    {
      foundId,
      provider: "wikimedia",
      title: video.title,
      credit: wikimediaCredit(video),
      ...(video.author ? { author: video.author } : {}),
      ...(video.sourcePage ? { sourcePage: video.sourcePage } : {}),
      file: { url: file.url, width: file.width, height: file.height, extension: file.extension },
      durationSec: video.duration,
      download: WIKIMEDIA_DOWNLOAD,
      // WebM ou Ogg, toujours réencodés en H.264 et AAC ; lus comme un fichier venu d’un lien direct.
      prepare: { formats: WIKIMEDIA_FORMATS, maxDurationSec: WIKIMEDIA_LIMITS.maxDurationSec },
    },
    deps,
    signal
  );
}

/** Importe une vidéo désignée par son identifiant (`wikimedia:<id de page>`), relue chez Commons si elle n’est plus en mémoire. */
export async function importWikimediaById(id: string, options: { aspect?: AspectPreset } = {}, deps: VideoSearchDeps = {}): Promise<ImportedVideo> {
  const match = WIKIMEDIA_ID.exec(String(id ?? ""));
  if (!match) throw new VideoSearchError("Vidéo inconnue.", "input");
  const pageId = Number(match[1]);
  const already = alreadyImported(`wikimedia:${pageId}`);
  if (already) return already;
  const now = (deps.now ?? Date.now)();
  const cached = state.seen.get(pageId);
  let video = cached && now - cached.at < WIKIMEDIA_LIMITS.cacheMs ? cached.video : undefined;
  if (!video) {
    video = readWikimediaVideos(await wikimediaGet({ pageids: String(pageId), ...VIDEO_INFO }, { origin: { module: "clip-studio", feature: "Import de vidéo" } }, deps))[0];
    if (video) remember([video], now);
  }
  if (!video) throw new VideoSearchError("Cette vidéo n’est plus disponible sur Wikimedia Commons, ou sa licence n’est pas libre.", "input");
  return importWikimediaVideo(video, { height: ASPECTS[options.aspect ?? "9:16"].height }, deps);
}

/** Une vidéo de Commons pour un segment de l’assistant ; `null` si rien ne convient. */
export async function findWikimediaSegmentVideo(
  input: { query: string; aspect: AspectPreset; minSeconds?: number; signal?: AbortSignal },
  deps: VideoSearchDeps = {}
): Promise<FoundVideoForSegment | null> {
  const videos = await searchWikimedia(
    { query: input.query, perPage: VIDEO_SEARCH_LIMITS.perSegment, signal: input.signal, origin: { module: "clip-studio", feature: "Illustration vidéo" } },
    deps
  );
  const target = { height: ASPECTS[input.aspect].height };
  const ranked = preferOrientation(rankVideos(videos, input.minSeconds ?? 0), pexelsOrientation(input.aspect), (video) => video).filter((video) =>
    pickWikimediaRendition(video, target)
  );
  return importForSegment(ranked, (video) => importWikimediaVideo(video, target, deps, input.signal), input.minSeconds ?? 0, input.signal);
}
