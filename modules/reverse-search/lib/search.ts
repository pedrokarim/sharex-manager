/**
 * Recherches en cours.
 *
 * Une recherche garde son image en mémoire le temps qu'on interroge les
 * moteurs, un par un, à la demande de la page. Une recherche enregistrée a en
 * plus sa copie sur le disque et sa ligne dans l'historique ; une recherche
 * éphémère n'a que la mémoire : rien n'est écrit, et elle disparaît quand on
 * la ferme, quand elle expire ou quand le serveur redémarre.
 */

import { randomBytes } from "node:crypto";
import fs from "fs";
import path from "path";
import { getAbsoluteUploadPath } from "@/lib/config";
import { fetchRemoteImage } from "@/lib/remote-image";
import { isFileSecure } from "@/lib/secure-files";
import { createTempShare, readTempShare, revokeTempShare, tempSharePath } from "@/lib/temp-share";
import { getGalleryImageUrl } from "@/lib/utils/url";
import { runEngine, type Probe } from "./engines";
import {
  findRecord,
  isSearchId,
  readKeys,
  readOriginal,
  saveRecord,
  thumbUrl,
  writeQueryFiles,
} from "./store";
import {
  ENGINES,
  engineLink,
  isEngineId,
  type EngineId,
  type EngineResult,
  type QueryImage,
  type SearchRecord,
  type SearchView,
} from "./types";

const MAX_BYTES = 20 * 1024 * 1024;
/** Recherches gardées en mémoire ; les plus anciennes cèdent la place. */
const MAX_SESSIONS = 12;
const SESSION_TTL_MS = 60 * 60 * 1000;
/** Au-delà, l'image envoyée aux moteurs est réduite. */
const PROBE_MAX_BYTES = 4 * 1024 * 1024;
const PROBE_MAX_SIDE = 2000;

const FORMATS: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heif: "image/avif",
};

interface Session {
  record: SearchRecord;
  original: Buffer;
  /** Aperçu en `data:`, pour une recherche qui n'a pas de fichier. */
  preview: string;
  probe?: Probe;
  share?: { token: string; expiresAt: number };
  touchedAt: number;
}

const holder = globalThis as typeof globalThis & { __sxmReverseSearch?: Map<string, Session> };
const sessions = (holder.__sxmReverseSearch ??= new Map<string, Session>());

function forget(id: string) {
  revokeTempShare(sessions.get(id)?.share?.token);
  sessions.delete(id);
}

function purge() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.touchedAt > SESSION_TTL_MS) forget(id);
  }
  while (sessions.size > MAX_SESSIONS) forget(sessions.keys().next().value as string);
}

// ─── Entrée ──────────────────────────────────────────────────────

export interface SearchInput {
  /** Image déposée ou collée, en base64 nu. */
  image?: { b64: string; name?: string };
  /** Fichier de la galerie. */
  galleryFile?: string;
  /** Adresse d'une image d'un autre site. */
  url?: string;
  ephemeral?: boolean;
}

const cleanName = (value: unknown, fallback: string) =>
  (typeof value === "string" ? path.basename(value).replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) : "") || fallback;

async function resolveInput(input: SearchInput): Promise<{ buffer: Buffer; name: string; origin: QueryImage["origin"]; galleryFile?: string }> {
  if (typeof input?.galleryFile === "string" && input.galleryFile) {
    const file = input.galleryFile;
    if (file !== path.basename(file) || file.startsWith(".") || file.includes("\\")) throw new Error("Fichier de galerie invalide.");
    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(path.join(getAbsoluteUploadPath(), file));
    } catch {
      throw new Error("Fichier introuvable dans la galerie.");
    }
    return { buffer, name: file, origin: "gallery", galleryFile: file };
  }
  if (typeof input?.url === "string" && input.url.trim()) {
    const remote = await fetchRemoteImage(input.url);
    return { buffer: Buffer.from(remote.b64, "base64"), name: cleanName(remote.name, "image"), origin: "link" };
  }
  if (typeof input?.image?.b64 === "string" && input.image.b64) {
    if (input.image.b64.length > Math.ceil((MAX_BYTES * 4) / 3) + 4) throw new Error("Image trop lourde (20 Mo maximum).");
    return { buffer: Buffer.from(input.image.b64, "base64"), name: cleanName(input.image.name, "image"), origin: "device" };
  }
  throw new Error("Aucune image à rechercher.");
}

/** Ouvre une recherche : valide l'image et, sauf en mode éphémère, l'inscrit à l'historique. */
export async function startSearch(input: SearchInput): Promise<SearchView> {
  const { buffer, name, origin, galleryFile } = await resolveInput(input);
  if (buffer.length === 0) throw new Error("Image vide.");
  if (buffer.length > MAX_BYTES) throw new Error("Image trop lourde (20 Mo maximum).");

  const { default: sharp } = await import("sharp");
  let metadata: import("sharp").Metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw new Error("Ce fichier n’est pas une image lisible.");
  }
  const mimeType = FORMATS[metadata.format ?? ""];
  if (!mimeType || !metadata.width || !metadata.height) throw new Error("Format d’image non géré : PNG, JPEG, WebP, GIF ou AVIF.");

  const thumbnail = await sharp(buffer).rotate().resize(480, 480, { fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  const ephemeral = Boolean(input.ephemeral);
  const id = `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
  const record: SearchRecord = {
    id,
    createdAt: Date.now(),
    ephemeral,
    query: { name, width: metadata.width, height: metadata.height, bytes: buffer.length, mimeType, origin, galleryFile },
    results: {},
  };

  if (!ephemeral) {
    writeQueryFiles(id, mimeType, buffer, thumbnail);
    saveRecord(record);
  }
  const session: Session = {
    record,
    original: buffer,
    preview: `data:image/webp;base64,${thumbnail.toString("base64")}`,
    touchedAt: Date.now(),
  };
  sessions.set(id, session);
  purge();
  return view(session);
}

const view = (session: Session): SearchView => ({
  ...session.record,
  preview: session.record.ephemeral ? session.preview : thumbUrl(session.record.id),
});

/** Retrouve une recherche : en mémoire, ou relue depuis l'historique. */
function sessionOf(id: unknown): Session {
  if (!isSearchId(id)) throw new Error("Recherche invalide.");
  purge();
  let session = sessions.get(id);
  if (!session) {
    const record = findRecord(id);
    const original = record && readOriginal(record);
    if (!record || !original) throw new Error("Cette recherche n’existe plus. Une recherche éphémère expire au bout d’une heure.");
    session = { record, original, preview: thumbUrl(id), touchedAt: Date.now() };
    sessions.set(id, session);
  }
  session.touchedAt = Date.now();
  return session;
}

export function openSearch(id: string): SearchView {
  return view(sessionOf(id));
}

/** Referme une recherche éphémère : son image et son lien temporaire sont oubliés aussitôt. */
export function closeSearch(id: string): { closed: boolean } {
  if (!isSearchId(id)) return { closed: false };
  const session = sessions.get(id);
  if (!session?.record.ephemeral) return { closed: false };
  forget(id);
  return { closed: true };
}

// ─── Moteurs ─────────────────────────────────────────────────────

/** L'image envoyée aux moteurs : réduite et convertie si l'originale est lourde ou d'un format rare. */
async function probeOf(session: Session): Promise<Probe> {
  if (session.probe) return session.probe;
  const { mimeType } = session.record.query;
  const direct = (mimeType === "image/jpeg" || mimeType === "image/png") && session.original.length <= PROBE_MAX_BYTES;
  if (direct) {
    session.probe = { buffer: session.original, mimeType, fileName: mimeType === "image/png" ? "image.png" : "image.jpg" };
  } else {
    const { default: sharp } = await import("sharp");
    const buffer = await sharp(session.original)
      .rotate()
      .resize(PROBE_MAX_SIDE, PROBE_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90 })
      .toBuffer();
    session.probe = { buffer, mimeType: "image/jpeg", fileName: "image.jpg" };
  }
  return session.probe;
}

function originOf(value: unknown): string {
  try {
    const url = new URL(String(value));
    if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
  } catch {
    // Traité juste en dessous.
  }
  throw new Error("Origine du site inconnue : impossible de créer un lien public.");
}

/**
 * Adresse publique de l'image. Un fichier public de la galerie a déjà la
 * sienne ; pour tout le reste, on prête un lien temporaire.
 */
async function publicUrlOf(session: Session, origin: unknown): Promise<{ url: string; expiresAt?: number }> {
  const { galleryFile } = session.record.query;
  if (galleryFile && !(await isFileSecure(galleryFile))) return { url: getGalleryImageUrl(galleryFile) };

  const base = originOf(origin);
  const alive = session.share && readTempShare(session.share.token) && session.share.expiresAt - Date.now() > 5 * 60 * 1000;
  if (!alive) {
    const probe = await probeOf(session);
    session.share = createTempShare(probe.buffer, probe.mimeType);
  }
  return { url: `${base}${tempSharePath(session.share!.token)}`, expiresAt: session.share!.expiresAt };
}

/** Interroge un moteur pour une recherche ouverte, et retient sa réponse. */
export async function runSearchEngine(id: string, engine: unknown, origin?: unknown): Promise<EngineResult> {
  if (!isEngineId(engine)) throw new Error("Moteur inconnu.");
  const session = sessionOf(id);
  const result = await runEngine(engine, {
    probe: await probeOf(session),
    keys: readKeys(),
    publicUrl: async () => (await publicUrlOf(session, origin)).url,
  });
  session.record.results[engine] = result;
  // L'historique ne retient que les réponses utiles : une clé manquante n'en est pas une.
  if (!session.record.ephemeral && result.status !== "needs-key") saveRecord(session.record);
  return result;
}

export interface ExternalLinks {
  publicUrl: string;
  /** Présent quand l'adresse est un lien temporaire : l'instant où il s'éteint. */
  expiresAt?: number;
  links: Record<EngineId, string>;
}

/** Liens vers la page de résultats de chaque moteur, pour l'image de la recherche. */
export async function externalLinks(id: string, origin: unknown): Promise<ExternalLinks> {
  const session = sessionOf(id);
  const { url, expiresAt } = await publicUrlOf(session, origin);
  return {
    publicUrl: url,
    expiresAt,
    links: Object.fromEntries(ENGINES.map((engine) => [engine.id, engineLink(engine, url)])) as Record<EngineId, string>,
  };
}
