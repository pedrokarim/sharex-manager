/**
 * Liens publics temporaires vers un fichier (dossier 07, § 8.9).
 *
 * Certains services ne reçoivent pas le fichier : ils vont le chercher à une
 * adresse publique. Le connecteur en obtient une par `context.publicUrl()`
 * (ou `context.publicLink()`) ; le service la lit sans session, par
 * `GET` ou `HEAD /api/connections/media/<jeton>.<extension>`.
 *
 * - Jeton aléatoire de 256 bits, adresse en ASCII seulement, terminée par
 *   l'extension du fichier. Seule l'empreinte SHA-256 du jeton est rangée sur
 *   le disque : une copie de `public-media.json` ne donne aucun lien.
 * - Un lien désigne **un** fichier déjà résolu par le serveur (le module
 *   propriétaire l'a désigné, ou le connecteur l'a dérivé dans le dossier
 *   temporaire du cœur) : jamais un chemin venu d'une requête.
 * - Durée courte (une heure par défaut, de une minute à vingt-quatre heures),
 *   réutilisable pendant cette durée (le service peut relire), révocable,
 *   débit borné : `maxDownloads` lectures complètes, comptées en octets servis
 *   (un service qui lit par morceaux `Range` n'est pas pénalisé), et un
 *   plafond de requêtes.
 * - Inconnu, expiré, révoqué ou épuisé : la même réponse 404, qui ne dit pas
 *   lequel des quatre, et jamais le chemin du fichier.
 * - Journal des accès (heure, méthode, octets, agent) par lien : progression
 *   et diagnostic pour le connecteur.
 * - L'adresse est construite depuis AUTH_URL, jamais depuis la requête.
 *
 * Une instance qui n'est pas joignable depuis Internet ne peut pas publier
 * vers ces services : `publicMediaStatus()` le signale à l'administration.
 */

import fs from "fs";
import path from "path";
import { createHash, randomBytes } from "crypto";
import { mediaTypeOf, serveMediaFile } from "@/lib/modules/media-response";
import type { PublicLinkAccess, PublicLinkInfo } from "./types";
import { publicBaseUrl } from "./apps";
import { dataRoot, newId, readStore, updateStore } from "./store";

export const PUBLIC_LINK_DEFAULT_TTL_MS = 60 * 60 * 1000;
const MIN_TTL_MS = 60 * 1000;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_DOWNLOADS = 5;
const MAX_DOWNLOADS_CAP = 50;
const DEFAULT_MAX_REQUESTS = 2000;
const MAX_ACCESS_LOG = 50;
/** 32 octets en base64url (43 caractères), suivis ou non d'une extension. */
const TOKEN_PATTERN = /^([A-Za-z0-9_-]{43})(?:\.[a-z0-9]{1,5})?$/;
export const PUBLIC_MEDIA_ROUTE = "/api/connections/media";

interface PublicLink {
  id: string;
  /** Empreinte SHA-256 du jeton (hexadécimal). */
  hash: string;
  /** Chemin absolu, résolu par le serveur au moment de la création. */
  file: string;
  /** Fichier dérivé appartenant au lien : effacé quand le lien meurt. */
  ownsFile?: boolean;
  contentType: string;
  createdAt: number;
  expiresAt: number;
  maxDownloads: number;
  maxRequests: number;
  requests: number;
  bytesServed: number;
  revoked?: boolean;
  /** Travail de publication qui l'a demandé : révoqué avec lui. */
  jobId?: string;
  accesses?: PublicLinkAccess[];
}

interface LinksFile {
  links: PublicLink[];
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Dossier des fichiers dérivés (JPEG converti…), dans `data/connections/tmp`. */
export function publicMediaTempDir(): string {
  const directory = path.join(/* turbopackIgnore: true */ dataRoot(), "tmp");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}

/** Chemin neuf pour un fichier dérivé ; l'extension est réduite à des lettres et des chiffres. */
export function newTempFilePath(prefix: string, extension: string): string {
  const ext = extension.replace(/^\./, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const safePrefix = prefix.replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "tmp";
  return path.join(publicMediaTempDir(), `${safePrefix}-${randomBytes(9).toString("hex")}.${ext}`);
}

/** Le chemin est-il dans le dossier temporaire du cœur ? (après résolution des liens symboliques) */
export function isInTempDir(file: string): boolean {
  try {
    const root = fs.realpathSync(publicMediaTempDir());
    const real = fs.realpathSync(file);
    return path.dirname(real) === root;
  } catch {
    return false;
  }
}

/** Efface les fichiers temporaires d'un travail (préfixe = identifiant du travail). */
export function removeTempFiles(prefix: string) {
  const safePrefix = prefix.replace(/[^a-z0-9-]/gi, "");
  if (!safePrefix) return;
  try {
    const directory = publicMediaTempDir();
    for (const name of fs.readdirSync(directory)) if (name.startsWith(`${safePrefix}-`)) fs.rmSync(path.join(directory, name), { force: true });
  } catch {
    // Dossier absent : rien à effacer.
  }
}

/** Un lien encore servable : ni expiré, ni révoqué, ni épuisé. */
function alive(link: PublicLink, now: number, size?: number): boolean {
  if (link.revoked || link.expiresAt <= now) return false;
  if (link.requests >= link.maxRequests) return false;
  if (size !== undefined && size > 0 && link.bytesServed >= link.maxDownloads * size) return false;
  return true;
}

function changeLinks(change: (links: PublicLink[]) => PublicLink[] | void, now = Date.now()) {
  const dead: PublicLink[] = [];
  updateStore<LinksFile>("public-media", { links: [] }, (file) => {
    const links = Array.isArray(file.links) ? file.links : [];
    const next = change(links) ?? links;
    // Les liens morts sont effacés à chaque écriture, avec leur fichier dérivé.
    const kept: PublicLink[] = [];
    for (const link of next) (!link.revoked && link.expiresAt > now ? kept : dead).push(link);
    return { links: kept };
  });
  for (const link of dead) if (link.ownsFile && isInTempDir(link.file)) fs.rmSync(link.file, { force: true });
}

const readLinks = (): PublicLink[] => readStore<LinksFile>("public-media", { links: [] }).links ?? [];

/** Extension de l'adresse, d'après le fichier (lettres et chiffres seulement). */
function extensionOf(file: string): string {
  const ext = path.extname(file).slice(1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? `.${ext}` : "";
}

/**
 * Crée un lien public vers un fichier déjà résolu par le serveur. Lève une
 * erreur si AUTH_URL manque ou si le fichier n'existe pas. `ownsFile` : le
 * fichier est un dérivé du dossier temporaire, effacé avec le lien.
 */
export function createPublicLink(input: {
  filePath: string;
  contentType?: string;
  ttlMs?: number;
  maxDownloads?: number;
  maxRequests?: number;
  jobId?: string;
  ownsFile?: boolean;
  now?: number;
}): PublicLinkInfo {
  const base = publicBaseUrl();
  if (!base) throw new Error("AUTH_URL n’est pas défini : impossible de construire une adresse publique pour ce fichier.");
  if (!path.isAbsolute(input.filePath)) throw new Error("Chemin de fichier invalide.");
  let file: string;
  try {
    file = fs.realpathSync(input.filePath);
    if (!fs.statSync(file).isFile()) throw new Error();
  } catch {
    throw new Error("Fichier à publier introuvable.");
  }
  if (input.ownsFile && !isInTempDir(file)) throw new Error("Un fichier dérivé doit être créé par `context.tempFile()`.");
  const now = input.now ?? Date.now();
  const ttl = Math.min(Math.max(Math.round(input.ttlMs ?? PUBLIC_LINK_DEFAULT_TTL_MS), MIN_TTL_MS), MAX_TTL_MS);
  const token = randomBytes(32).toString("base64url");
  const link: PublicLink = {
    id: newId("lnk"),
    hash: hashToken(token),
    file,
    ownsFile: input.ownsFile || undefined,
    contentType: input.contentType || mediaTypeOf(file),
    createdAt: now,
    expiresAt: now + ttl,
    maxDownloads: Math.min(Math.max(Math.round(input.maxDownloads ?? DEFAULT_MAX_DOWNLOADS), 1), MAX_DOWNLOADS_CAP),
    maxRequests: Math.max(1, Math.round(input.maxRequests ?? DEFAULT_MAX_REQUESTS)),
    requests: 0,
    bytesServed: 0,
    jobId: input.jobId,
  };
  changeLinks((links) => [...links, link], now);
  return { id: link.id, url: `${base}${PUBLIC_MEDIA_ROUTE}/${token}${extensionOf(file)}`, expiresAt: link.expiresAt };
}

/** Révoque un lien par son identifiant (« lnk-… ») ou par son jeton (avec ou sans extension). */
export function revokePublicLink(idOrToken: string) {
  const token = TOKEN_PATTERN.exec(idOrToken)?.[1];
  const hash = token ? hashToken(token) : null;
  changeLinks((links) => {
    for (const link of links) if (link.id === idOrToken || link.hash === hash) link.revoked = true;
  });
}

/** Révoque les liens d'un travail (tous, ou un seul par son identifiant). */
export function revokeLinksForJob(jobId: string, linkId?: string) {
  if (!readLinks().some((link) => link.jobId === jobId)) return;
  changeLinks((all) => {
    for (const link of all) if (link.jobId === jobId && (!linkId || link.id === linkId)) link.revoked = true;
  });
}

/** Journal des lectures d'un lien d'un travail (vide si le lien n'existe plus). */
export function linkAccesses(jobId: string, linkId: string): PublicLinkAccess[] {
  const link = readLinks().find((entry) => entry.id === linkId && entry.jobId === jobId);
  return link?.accesses ? link.accesses.map((entry) => ({ ...entry })) : [];
}

/** Efface les liens expirés ou révoqués (et leurs fichiers dérivés). Rend le nombre de liens encore valables. */
export function purgePublicLinks(now = Date.now()): number {
  let remaining = 0;
  changeLinks((links) => {
    remaining = links.filter((link) => !link.revoked && link.expiresAt > now).length;
  }, now);
  return remaining;
}

/** Liens encore valables (tests, administration). */
export function countPublicLinks(now = Date.now()): number {
  return readLinks().filter((link) => alive(link, now)).length;
}

// ─── Service ──────────────────────────────────────────────────────

const REFUSAL_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};

/** Même réponse pour un jeton inconnu, expiré, révoqué ou épuisé. */
function notFound(): Response {
  return new Response(JSON.stringify({ error: "Lien invalide ou expiré" }), { status: 404, headers: REFUSAL_HEADERS });
}

/** Octets qu'une requête `Range` va lire (la réponse 416 éventuelle ne coûte rien). */
function requestedBytes(range: string | null, size: number): number {
  if (!range) return size;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || (match[1] === "" && match[2] === "")) return 0;
  if (match[1] === "") return Math.min(size, Number(match[2]));
  const start = Number(match[1]);
  const end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  return start > end || start >= size ? 0 : end - start + 1;
}

/**
 * Sert le fichier d'un lien public, sans session. `token` peut porter
 * l'extension de l'adresse. `HEAD` ne compte pas dans les lectures. Aucune
 * réponse ne contient le chemin du fichier.
 */
export function servePublicMedia(request: Request, token: string, now = Date.now()): Response {
  const bare = typeof token === "string" ? TOKEN_PATTERN.exec(token)?.[1] : undefined;
  if (!bare) return notFound();
  const hash = hashToken(bare);
  const head = request.method === "HEAD";

  const current = readLinks().find((link) => link.hash === hash);
  if (!current || !alive(current, now)) return notFound();
  let size: number;
  try {
    const stats = fs.statSync(current.file);
    if (!stats.isFile()) return notFound();
    size = stats.size;
  } catch {
    return notFound();
  }

  // Compté sous écriture unique : deux requêtes ne dépassent pas le plafond ensemble.
  const bytes = head ? 0 : requestedBytes(request.headers.get("range"), size);
  const agent = request.headers.get("user-agent")?.replace(/[^\x20-\x7e]/g, "").slice(0, 120) || undefined;
  // Affecté dans le rappel : déclaré ainsi pour que TypeScript ne le croie pas toujours nul.
  let served = null as PublicLink | null;
  changeLinks((links) => {
    const link = links.find((entry) => entry.hash === hash);
    if (!link || !alive(link, now, size)) return;
    if (!head) {
      link.requests += 1;
      link.bytesServed += bytes;
    }
    const status = head ? 200 : request.headers.get("range") ? 206 : 200;
    const access: PublicLinkAccess = { at: now, method: head ? "HEAD" : "GET", status, bytes, ...(agent ? { agent } : {}) };
    link.accesses = [...(link.accesses ?? []), access].slice(-MAX_ACCESS_LOG);
    served = { ...link };
  }, now);
  const link = served;
  if (!link) return notFound();

  let response: Response;
  try {
    response = serveMediaFile(request, link.file, { cacheControl: "no-store" });
  } catch {
    return notFound();
  }
  const headers = new Headers(response.headers);
  headers.set("Content-Type", link.contentType);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Content-Disposition", "inline");
  if (head) {
    void response.body?.cancel();
    return new Response(null, { status: response.status, headers });
  }
  return new Response(response.body, { status: response.status, headers });
}

// ─── Joignabilité ─────────────────────────────────────────────────

export interface PublicMediaStatus {
  /** Adresse de base des liens, ou `null` sans AUTH_URL. */
  baseUrl: string | null;
  /** Faux quand AUTH_URL désigne visiblement une adresse locale, n'est pas en HTTPS, ou manque. */
  reachable: boolean;
  /** Pourquoi les services ne pourront probablement pas aller chercher les fichiers. */
  reason?: string;
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "0.0.0.0") return true;
  if (/\.(local|lan|internal|home\.arpa|test|example|invalid)$/.test(host)) return true;
  if (!host.includes(".") && !host.includes(":")) return true;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  return /^(fc|fd|fe80)/.test(host);
}

/**
 * Ce qu'on peut dire, sans appel extérieur, de la joignabilité de l'instance :
 * AUTH_URL présente, en HTTPS, et qui ne désigne pas une adresse locale. Un
 * pare-feu, un tunnel fermé ou une protection anti-robots peuvent encore
 * bloquer le service : seule une vraie publication le montre.
 */
export function publicMediaStatus(): PublicMediaStatus {
  const baseUrl = publicBaseUrl();
  if (!baseUrl) return { baseUrl: null, reachable: false, reason: "AUTH_URL n’est pas défini : aucune adresse publique ne peut être construite." };
  const url = new URL(baseUrl);
  if (isPrivateHost(url.hostname)) {
    return { baseUrl, reachable: false, reason: `AUTH_URL désigne une adresse locale (${url.hostname}) : les services ne pourront pas venir chercher les fichiers.` };
  }
  if (url.protocol !== "https:") {
    return { baseUrl, reachable: false, reason: "AUTH_URL n’est pas en HTTPS : la plupart des services refusent d’aller chercher un fichier en HTTP." };
  }
  return { baseUrl, reachable: true };
}
