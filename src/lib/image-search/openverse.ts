/**
 * Recherche d'images libres dans Openverse, sans clé.
 *
 * Seules les licences qui permettent un usage commercial et une modification
 * sont admises : CC0, domaine public (PDM) et CC BY. Le filtre est demandé à
 * l'API **et** refait ici : une réponse inattendue ne fait jamais entrer une
 * image NC, ND ou SA. Auteur, titre, licence et page source deviennent la
 * mention de l'image.
 */

import { SITE_LINKS } from "@/config/links";
import { recordAiUsage, usageError, type AiUsageOrigin } from "@/lib/ai-usage";
import { httpUrl, type ImageCandidate } from "./types";

export const OPENVERSE_IMAGES = "https://api.openverse.org/v1/images/";
const USER_AGENT = `ShareX-Manager/image-search (${SITE_LINKS.repository})`;
/** Une recherche Openverse répond en une ou deux secondes : au-delà, on abandonne. */
const REQUEST_TIMEOUT_MS = 15_000;
/** Les requêtes anonymes sont limitées à 20 résultats par page. */
const MAX_PAGE_SIZE = 20;
const CACHE_TTL_MS = 10 * 60 * 1000;

/** Licences admises, telles qu'Openverse les nomme. */
export const ALLOWED_LICENSES = ["cc0", "pdm", "by"] as const;
type AllowedLicense = (typeof ALLOWED_LICENSES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Types que le téléchargement acceptera ensuite : inutile de proposer un SVG. */
const FILE_TYPES = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Une image telle qu'Openverse la décrit (champs lus ici). */
export interface OpenverseImage {
  id: string;
  title?: string;
  creator?: string;
  license: string;
  license_version?: string;
  license_url?: string;
  foreign_landing_url?: string;
  url: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  filetype?: string;
  mature?: boolean;
}

/** Candidate Openverse, avec l'adresse du fichier à télécharger (jamais montrée au navigateur). */
export interface OpenverseCandidate extends ImageCandidate {
  provider: "openverse";
  /** Adresse du fichier original, téléchargé par le serveur seulement. */
  imageUrl: string;
}

export interface OpenverseOptions {
  page?: number;
  pageSize?: number;
  /** Petit côté minimal : une image annoncée plus petite est écartée d'emblée. */
  minShortSide?: number;
  signal?: AbortSignal;
  fetch?: FetchLike;
  /** Module et usage notés dans le registre de consommation des IA. Absent : le cœur, « Recherche d'images ». */
  origin?: AiUsageOrigin;
}

export function isOpenverseId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function licenseLabel(license: AllowedLicense, version?: string): string {
  if (license === "cc0") return "CC0";
  if (license === "pdm") return "Domaine public";
  return `CC BY ${version ?? ""}`.trim();
}

function isAllowed(license: unknown): license is AllowedLicense {
  return (ALLOWED_LICENSES as readonly string[]).includes(String(license));
}

/**
 * Image Openverse rendue exploitable, ou `null` : licence hors liste,
 * identifiant douteux, adresse non https, type de fichier refusé, contenu
 * marqué pour adultes ou image annoncée trop petite.
 */
export function toCandidate(item: OpenverseImage, minShortSide = 0): OpenverseCandidate | null {
  if (!item || !isOpenverseId(item.id) || !isAllowed(item.license) || item.mature === true) return null;
  const imageUrl = httpUrl(item.url, { httpsOnly: true });
  if (!imageUrl) return null;
  const filetype = String(item.filetype ?? "").toLowerCase();
  if (filetype && !FILE_TYPES.has(filetype)) return null;
  if (/\.svgz?(\?|$)/i.test(new URL(imageUrl).pathname)) return null;
  const width = Number(item.width) || undefined;
  const height = Number(item.height) || undefined;
  if (width && height && Math.min(width, height) < minShortSide) return null;
  return {
    id: `openverse:${item.id}`,
    provider: "openverse",
    thumbnail: httpUrl(item.thumbnail, { httpsOnly: true }) ?? `${OPENVERSE_IMAGES}${item.id}/thumb/`,
    title: String(item.title ?? "").trim().slice(0, 160) || "Sans titre",
    creator: String(item.creator ?? "").trim().slice(0, 100) || undefined,
    license: licenseLabel(item.license, item.license_version),
    licenseUrl: httpUrl(item.license_url, { httpsOnly: true }),
    sourcePage: httpUrl(item.foreign_landing_url),
    width,
    height,
    rights: "free",
    imageUrl,
  };
}

async function openverse<T>(url: string, options: Pick<OpenverseOptions, "signal" | "fetch" | "origin">): Promise<T> {
  try {
    const body = await requestOpenverse<T>(url, options);
    noteCall(options.origin, true);
    return body;
  } catch (error) {
    // Une recherche annulée par l'appelant n'a rien demandé au service.
    if (!options.signal?.aborted) noteCall(options.origin, false, error);
    throw error;
  }
}

function noteCall(origin: AiUsageOrigin | undefined, ok: boolean, error?: unknown) {
  recordAiUsage({
    provider: "openverse",
    module: origin?.module ?? "core",
    feature: origin?.feature ?? "Recherche d'images",
    unit: "calls",
    amount: 1,
    ok,
    ...(ok ? {} : { error: usageError(error) }),
  });
}

async function requestOpenverse<T>(url: string, options: Pick<OpenverseOptions, "signal" | "fetch">): Promise<T> {
  const doFetch = options.fetch ?? fetch;
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await doFetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" }, signal });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error(timeout.aborted ? "Openverse met trop de temps à répondre." : "Openverse est injoignable.");
  }
  if (response.status === 429) throw new Error("Openverse limite le nombre de recherches : réessayez dans une minute.");
  if (response.status === 404) throw new Error("Image introuvable dans Openverse.");
  if (!response.ok) throw new Error(`Openverse ne répond pas (HTTP ${response.status}).`);
  return (await response.json()) as T;
}

const searchCache = new Map<string, { at: number; results: OpenverseCandidate[] }>();

/** Images sous CC0, domaine public ou CC BY, par mots-clés. */
export async function searchOpenverseImages(query: string, options: OpenverseOptions = {}): Promise<OpenverseCandidate[]> {
  const q = String(query ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (q.length < 2) return [];
  const page = Math.min(10, Math.max(1, Math.round(Number(options.page) || 1)));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.round(Number(options.pageSize) || MAX_PAGE_SIZE)));
  const minShortSide = Math.max(0, Number(options.minShortSide) || 0);
  const key = `${q.toLowerCase()}|${page}|${pageSize}|${minShortSide}`;
  const cached = searchCache.get(key);
  // Le cache ne sert que le vrai `fetch` : un test qui injecte le sien veut sa réponse.
  if (!options.fetch && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.results;

  const params = new URLSearchParams({
    q,
    license: ALLOWED_LICENSES.join(","),
    page_size: String(pageSize),
    page: String(page),
    mature: "false",
  });
  const body = await openverse<{ results?: OpenverseImage[] }>(`${OPENVERSE_IMAGES}?${params}`, options);
  const seen = new Set<string>();
  const results = (Array.isArray(body?.results) ? body.results : [])
    .map((item) => toCandidate(item, minShortSide))
    .filter((item): item is OpenverseCandidate => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

  if (!options.fetch) {
    for (const [entry, value] of searchCache) {
      if (Date.now() - value.at > CACHE_TTL_MS) searchCache.delete(entry);
    }
    if (searchCache.size >= 200) searchCache.delete(searchCache.keys().next().value!);
    searchCache.set(key, { at: Date.now(), results });
  }
  return results;
}

/**
 * Relit une image chez Openverse, licence comprise. Seul l'identifiant vient
 * du navigateur : adresse, auteur et licence sont ceux d'Openverse.
 */
export async function getOpenverseImage(id: string, options: Pick<OpenverseOptions, "signal" | "fetch" | "origin"> = {}): Promise<OpenverseCandidate> {
  if (!isOpenverseId(id)) throw new Error("Identifiant Openverse invalide.");
  const item = await openverse<OpenverseImage>(`${OPENVERSE_IMAGES}${id}/`, options);
  if (!isAllowed(item?.license)) {
    throw new Error("Seules les images sous CC0, domaine public ou CC BY peuvent être importées.");
  }
  const candidate = toCandidate({ ...item, id });
  if (!candidate) throw new Error("Cette image d'Openverse ne peut pas être importée.");
  return candidate;
}
