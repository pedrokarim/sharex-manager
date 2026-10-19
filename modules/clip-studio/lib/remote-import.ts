/**
 * Récupérer une vidéo par son adresse (dossier 01, V2) : YouTube (vidéo,
 * short), Twitch (clip, VOD) ou lien direct vers un fichier vidéo.
 *
 * Parcours : `probeRemote` lit les métadonnées (titre, auteur, durée,
 * vignette) ; `startRemoteImport` lance un travail qui récupère le passage
 * choisi, le remet en MP4 H.264 et AAC (ce que décode le navigateur), 1080p
 * au plus, puis le range parmi les médias du module avec sa provenance et
 * `rights: "unverified"`.
 *
 * Garde-fous : adresses `http(s)` seulement, réécrites sous une forme
 * canonique pour YouTube et Twitch ; un lien direct est téléchargé par le
 * serveur lui-même avec la résolution DNS contrôlée de `remote-image.ts`
 * (aucune adresse interne, redirections revérifiées). Passage de 20 minutes
 * au plus, fichier de 500 Mo au plus, deux récupérations à la fois, délais
 * bornés, annulation. Un média récupéré dont aucun projet ne se sert depuis
 * 30 jours est effacé.
 */

import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import { randomBytes } from "crypto";
import { spawn } from "child_process";
import { isIP } from "net";
import { childEnv } from "@/lib/child-env";
import { ensureFfmpeg, parseVideoInfo } from "@/lib/media/ffmpeg";
import { downloadSection, probeUrl, YtDlpError, type RemoteVideoInfo } from "@/lib/media/ytdlp";
import { fetchRemoteImage, isPrivateAddress, safeLookup } from "@/lib/remote-image";
import type { ClipAsset, MediaOrigin } from "../engine/types";
import { assertDiskSpace, bytesLabel, holdWorkDir, publicErrorMessage, sweepWorkDirs } from "./job-safety";
import { ASSETS_DIR, DATA_DIR, ensureDirs, listProjectFiles, readAssets, writeAssets } from "./store";
import { copyYoutubeCookies, hasYoutubeCookies, markCookiesRejected } from "./video-sources";

export const REMOTE_LIMITS = {
  /** Passage le plus long, en secondes. */
  maxSectionSeconds: 20 * 60,
  /** Passage le plus court, en secondes. */
  minSectionSeconds: 1,
  /** Fichier final le plus lourd. */
  maxFileBytes: 500 * 1024 * 1024,
  /** Récupérations simultanées. */
  maxRunning: 2,
  /** Un média récupéré dont aucun projet ne se sert depuis ce délai est effacé. */
  unusedTtlMs: 30 * 24 * 60 * 60 * 1000,
  /**
   * Place totale des médias venus d’ailleurs (adresse, Pexels, extraits). Au-delà,
   * les plus anciens dont aucun projet ne se sert sont effacés avant une
   * nouvelle récupération, qui est refusée s’il n’y en a pas assez.
   */
  totalBudgetBytes: 20 * 1024 * 1024 * 1024,
};

/**
 * Longue vidéo à découper (« Découper une vidéo », dossier 01, V4) : deux
 * heures au plus, 720p au plus, débit d'image plafonné. Ce fichier est une
 * source de travail : effacé après la découpe sauf demande contraire, et de
 * toute façon par le ménage des 30 jours. D'où un plafond plus haut que les
 * 500 Mo d'un passage : deux heures à 1,5 Mb/s pour l'image et 160 kb/s pour
 * le son font environ 1,5 Go.
 */
export const CLIPPING_LIMITS = {
  maxSectionSeconds: 2 * 60 * 60,
  maxHeight: 720,
  maxFileBytes: 1600 * 1024 * 1024,
  /** Fichier reçu avant conversion (un 720p60 ou un HEVC pèse plus), effacé une fois converti. */
  maxDownloadBytes: 4000 * 1024 * 1024,
  videoMaxrate: "1500k",
};

/** Usage d'une récupération : un passage pour le montage, ou une longue vidéo à découper. */
export type RemoteImportPurpose = "montage" | "clipping";

interface ImportProfile {
  maxSectionSeconds: number;
  maxFileBytes: number;
  maxDownloadBytes: number;
  maxHeight: number;
  videoMaxrate?: string;
}

function importProfile(purpose: RemoteImportPurpose | undefined): ImportProfile {
  if (purpose === "clipping") return CLIPPING_LIMITS;
  return {
    maxSectionSeconds: REMOTE_LIMITS.maxSectionSeconds,
    maxFileBytes: REMOTE_LIMITS.maxFileBytes,
    // Avant conversion, un HEVC peut peser plus que le H.264 final : marge de moitié.
    maxDownloadBytes: REMOTE_LIMITS.maxFileBytes * 1.5,
    maxHeight: 1080,
  };
}

/** « 20 minutes », « 2 heures » : la durée la plus longue, dite dans les messages. */
export function durationLabel(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} heure${seconds >= 7200 ? "s" : ""}`;
  return `${Math.round(seconds / 60)} minutes`;
}

/** « 500 Mo », « 1,6 Go ». */
function sizeLabel(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1000 ? `${(mb / 1000).toFixed(1).replace(".", ",")} Go` : `${Math.round(mb)} Mo`;
}

const JOBS_FILE = path.join(DATA_DIR, "remote-imports.json");
/** Dossier de travail : caché, donc jamais servi par la route des données. */
const WORK_DIR = path.join(DATA_DIR, ".remote-tmp");
const VIDEO_EXTENSION = /\.(mp4|m4v|webm|mov|mkv)$/i;

// ─── Adresses ────────────────────────────────────────────────────

export type RemoteSite = MediaOrigin["site"];

export interface ParsedRemoteUrl {
  site: RemoteSite;
  kind: "video" | "short" | "clip" | "vod" | "file";
  /** Adresse passée à l'outil : canonique pour YouTube et Twitch. */
  url: string;
  /** Instant de départ indiqué dans l'adresse (`t=1m30s`), en secondes. */
  startHint?: number;
}

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);
const TWITCH_HOSTS = new Set(["twitch.tv", "www.twitch.tv", "m.twitch.tv", "go.twitch.tv"]);
const TWITCH_CLIP_HOSTS = new Set(["clips.twitch.tv", "clip.twitch.tv"]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const TWITCH_SLUG = /^[A-Za-z0-9_-]{3,120}$/;
const TWITCH_CHANNEL = /^[A-Za-z0-9_]{2,40}$/;

export const UNRECOGNIZED_URL =
  "Adresse non reconnue : collez un lien YouTube, Twitch, ou un lien direct vers un fichier vidéo (.mp4, .webm, .mov).";

/** « 90 », « 90s », « 1m30s », « 1h2m3s » → secondes. */
export function parseTimestamp(value: string | null): number | undefined {
  if (!value) return undefined;
  const text = value.trim().toLowerCase();
  if (/^\d+(\.\d+)?s?$/.test(text)) return Number(text.replace(/s$/, ""));
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text);
  if (!match || (!match[1] && !match[2] && !match[3])) return undefined;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

/** Nom d'hôte qui désigne forcément le réseau local ou la machine elle-même. */
function isInternalHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return isPrivateAddress(host);
  return (
    host === "localhost" ||
    !host.includes(".") ||
    /\.(localhost|local|internal|intranet|lan|home|corp|home\.arpa|localdomain)$/.test(host)
  );
}

/**
 * Adresse http(s) publique, sans identifiants ni port exotique. Le contrôle
 * DNS se fait à la connexion (`safeLookup`), ici seulement ce qui se lit dans
 * l'adresse.
 */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Adresse invalide : collez une adresse complète, qui commence par https://.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Seules les adresses http et https sont acceptées.");
  if (url.username || url.password) throw new Error("Les adresses avec identifiants ne sont pas acceptées.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("Cette adresse utilise un port non accepté.");
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isInternalHostname(url.hostname)) throw new Error("Cette adresse pointe vers le réseau interne : refusée.");
  return url;
}

/** Reconnaît l'adresse collée et la réécrit sous une forme sûre, ou dit pourquoi elle est refusée. */
export function parseRemoteUrl(raw: unknown): ParsedRemoteUrl {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("Collez l’adresse d’une vidéo.");
  if (raw.length > 2000) throw new Error("Adresse trop longue.");
  const url = assertPublicHttpUrl(raw);
  const host = url.hostname;
  const parts = url.pathname.split("/").filter(Boolean);

  if (YOUTUBE_HOSTS.has(host) || host === "youtu.be") {
    let id: string | undefined;
    let kind: ParsedRemoteUrl["kind"] = "video";
    if (host === "youtu.be") id = parts[0];
    else if (parts[0] === "watch") id = url.searchParams.get("v") ?? undefined;
    else if (["shorts", "live", "embed", "v"].includes(parts[0] ?? "")) {
      id = parts[1];
      if (parts[0] === "shorts") kind = "short";
    }
    if (!id || !YOUTUBE_ID.test(id)) throw new Error("Adresse YouTube non reconnue : collez l’adresse d’une vidéo ou d’un short.");
    const startHint = parseTimestamp(url.searchParams.get("t") ?? url.searchParams.get("start"));
    return { site: "youtube", kind, url: `https://www.youtube.com/watch?v=${id}`, ...(startHint ? { startHint } : {}) };
  }

  if (TWITCH_CLIP_HOSTS.has(host)) {
    const slug = parts[0] === "embed" ? url.searchParams.get("clip") : parts[0];
    if (!slug || !TWITCH_SLUG.test(slug)) throw new Error("Adresse de clip Twitch non reconnue.");
    return { site: "twitch", kind: "clip", url: `https://clips.twitch.tv/${slug}` };
  }

  if (TWITCH_HOSTS.has(host)) {
    // twitch.tv/<chaîne>/clip/<slug>
    if (parts.length >= 3 && parts[1] === "clip" && TWITCH_CHANNEL.test(parts[0]) && TWITCH_SLUG.test(parts[2])) {
      return { site: "twitch", kind: "clip", url: `https://clips.twitch.tv/${parts[2]}` };
    }
    // twitch.tv/videos/<id> ou l'ancienne forme twitch.tv/<chaîne>/v/<id>
    const vod = parts[0] === "videos" ? parts[1] : parts[1] === "v" || parts[1] === "video" ? parts[2] : undefined;
    if (vod && /^\d{5,15}$/.test(vod)) {
      const startHint = parseTimestamp(url.searchParams.get("t"));
      return { site: "twitch", kind: "vod", url: `https://www.twitch.tv/videos/${vod}`, ...(startHint ? { startHint } : {}) };
    }
    throw new Error("Adresse Twitch non reconnue : collez l’adresse d’un clip ou d’une vidéo (VOD). Les directs ne sont pas pris en charge.");
  }

  if (VIDEO_EXTENSION.test(decodeURIComponent(url.pathname))) {
    url.hash = "";
    return { site: "web", kind: "file", url: url.toString() };
  }
  throw new Error(UNRECOGNIZED_URL);
}

export function siteLabel(site: RemoteSite, url: string): string {
  if (site === "youtube") return "YouTube";
  if (site === "twitch") return "Twitch";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

// ─── Passage ─────────────────────────────────────────────────────

export interface SectionInput {
  start?: unknown;
  end?: unknown;
}

export interface ResolvedSection {
  start: number;
  /** Absente : jusqu'à la fin (durée inconnue d'un lien direct, bornée plus tard). */
  end?: number;
  /** Toute la vidéo : rien à découper. */
  whole: boolean;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Passage demandé, contrôlé : début positif, fin après le début, 20 minutes
 * au plus. Sans fin, le passage court jusqu'à la fin de la vidéo, ou jusqu'à
 * 20 minutes après le début.
 */
export function resolveSection(input: SectionInput, duration?: number, maxSeconds: number = REMOTE_LIMITS.maxSectionSeconds): ResolvedSection {
  const read = (value: unknown, label: string) => {
    if (value === undefined || value === null || value === "") return undefined;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) throw new Error(`${label} invalide.`);
    return round3(number);
  };
  const known = typeof duration === "number" && Number.isFinite(duration) && duration > 0 ? duration : undefined;
  const start = read(input?.start, "Début") ?? 0;
  let end = read(input?.end, "Fin");
  if (known !== undefined && start >= known) throw new Error("Le début est après la fin de la vidéo.");
  if (end === undefined && known !== undefined) end = round3(Math.min(known, start + maxSeconds));
  if (end !== undefined && known !== undefined) end = round3(Math.min(end, known));
  if (end !== undefined) {
    if (end <= start) throw new Error("La fin doit venir après le début.");
    if (end - start < REMOTE_LIMITS.minSectionSeconds) throw new Error("Le passage doit durer au moins une seconde.");
    if (end - start > maxSeconds + 0.001) throw new Error(`Le passage dépasse ${durationLabel(maxSeconds)} : choisissez-en un plus court.`);
  }
  const whole = start === 0 && (end === undefined ? known === undefined : known !== undefined && end >= known - 0.5);
  return { start, ...(end !== undefined ? { end } : {}), whole };
}

// ─── Lien direct : requêtes contrôlées ───────────────────────────

interface DirectResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  url: URL;
  stream: http.IncomingMessage;
}

function directRequest(url: URL, signal: AbortSignal | undefined, timeoutMs: number): Promise<DirectResponse> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.get(
      url,
      {
        lookup: safeLookup,
        timeout: timeoutMs,
        signal,
        headers: { accept: "video/*,*/*;q=0.5", "user-agent": "ShareX-Manager/clip-studio (video import)" },
      },
      (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, url, stream: res })
    );
    req.on("timeout", () => req.destroy(new Error("Le site met trop de temps à répondre.")));
    req.on("error", (error) => reject(signal?.aborted ? new YtDlpError("canceled", "Récupération annulée.") : error));
  });
}

/** Suit au plus trois redirections, chacune revérifiée, jusqu'à une réponse vidéo. */
async function openDirect(rawUrl: string, signal?: AbortSignal, maxBytes: number = REMOTE_LIMITS.maxFileBytes): Promise<DirectResponse> {
  let url = assertPublicHttpUrl(rawUrl);
  for (let hop = 0; hop <= 3; hop++) {
    const response = await directRequest(url, signal, 30_000);
    if (response.status >= 300 && response.status < 400) {
      response.stream.destroy();
      const location = response.headers.location;
      if (!location) throw new Error("Le site renvoie vers une adresse vide.");
      url = assertPublicHttpUrl(new URL(location, url).toString());
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      response.stream.destroy();
      throw new Error(`Le site a répondu HTTP ${response.status} : le fichier n’est pas accessible.`);
    }
    const type = String(response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (type && !type.startsWith("video/") && type !== "application/octet-stream" && type !== "binary/octet-stream") {
      response.stream.destroy();
      throw new Error("Ce lien ne pointe pas vers un fichier vidéo.");
    }
    const declared = Number(response.headers["content-length"] ?? 0);
    if (declared > maxBytes) {
      response.stream.destroy();
      throw new Error(`Ce fichier dépasse ${sizeLabel(maxBytes)} : il ne peut pas être récupéré.`);
    }
    return response;
  }
  throw new Error("Trop de redirections.");
}

function fileTitle(url: URL): string {
  const last = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  return last.replace(VIDEO_EXTENSION, "").replace(/[_+]+/g, " ").trim().slice(0, 200) || "Vidéo";
}

async function downloadDirect(
  rawUrl: string,
  target: string,
  options: { signal?: AbortSignal; onProgress?: (ratio: number | undefined) => void; maxBytes?: number; deadlineMs?: number }
): Promise<void> {
  const maxBytes = options.maxBytes ?? REMOTE_LIMITS.maxFileBytes;
  const response = await openDirect(rawUrl, options.signal, maxBytes);
  const declared = Number(response.headers["content-length"] ?? 0) || undefined;
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(target, { mode: 0o600 });
    let total = 0;
    let last = 0;
    // Téléchargement de 20 minutes au plus (plus pour une vidéo à découper), même pour un site très lent.
    const deadline = setTimeout(() => response.stream.destroy(new Error("Le site met trop de temps à envoyer le fichier.")), options.deadlineMs ?? 20 * 60 * 1000);
    const fail = (error: unknown) => {
      clearTimeout(deadline);
      out.destroy();
      reject(error);
    };
    response.stream.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        response.stream.destroy(new Error(`Ce fichier dépasse ${sizeLabel(maxBytes)} : il ne peut pas être récupéré.`));
        return;
      }
      if (Date.now() - last > 500) {
        last = Date.now();
        options.onProgress?.(declared ? Math.min(0.99, total / declared) : undefined);
      }
    });
    response.stream.on("error", fail);
    out.on("error", fail);
    out.on("finish", () => {
      clearTimeout(deadline);
      resolve();
    });
    response.stream.pipe(out);
  }).catch((error) => {
    if (options.signal?.aborted) throw new YtDlpError("canceled", "Récupération annulée.");
    throw error;
  });
}

// ─── ffmpeg : lecture et mise au format ──────────────────────────

export interface MediaStreams {
  durationSec?: number;
  width?: number;
  height?: number;
  video?: { codec: string; pixFmt?: string; attached: boolean };
  audio?: { codec: string };
}

/** Flux d'un fichier, lus dans la sortie de `ffmpeg -i`. */
export function parseMediaStreams(stderr: string): MediaStreams {
  const info = parseVideoInfo(stderr);
  const streams: MediaStreams = {
    ...(info.durationMs ? { durationSec: info.durationMs / 1000 } : {}),
    ...(info.width ? { width: info.width, height: info.height } : {}),
  };
  for (const line of stderr.split(/\r?\n/)) {
    const video = /Stream #\d+:\d+.*?: Video: ([a-z0-9_]+)(.*)$/i.exec(line);
    if (video && !streams.video && !/attached pic/i.test(line)) {
      const pixFmt = /\b(yuvj?4\d\dp\d*(?:le|be)?|nv12|nv21|p010le|gbrp\w*|rgb\w+|bgr\w+|gray\w*)\b/i.exec(video[2])?.[1];
      streams.video = { codec: video[1].toLowerCase(), ...(pixFmt ? { pixFmt: pixFmt.toLowerCase() } : {}), attached: false };
      const size = /,\s*(\d{2,5})x(\d{2,5})[\s,\[]/.exec(video[2]);
      if (size) {
        streams.width = Number(size[1]);
        streams.height = Number(size[2]);
      }
    }
    const audio = /Stream #\d+:\d+.*?: Audio: ([a-z0-9_]+)/i.exec(line);
    if (audio && !streams.audio) streams.audio = { codec: audio[1].toLowerCase() };
  }
  return streams;
}

/** Ce que la mise au format doit réencoder pour que le navigateur lise la vidéo (petit côté de `maxShortSide` au plus). */
export function conversionPlan(streams: MediaStreams, maxShortSide = 1080): { video: boolean; audio: boolean } {
  const video = streams.video;
  const shortSide = Math.min(streams.width ?? 0, streams.height ?? 0);
  return {
    video: !video || video.codec !== "h264" || (video.pixFmt !== undefined && !/^yuvj?420p$/.test(video.pixFmt)) || shortSide > maxShortSide,
    audio: Boolean(streams.audio && streams.audio.codec !== "aac"),
  };
}

/**
 * Réglages de l'image : petit côté au plus (1080 par défaut), débit plafonné
 * et réencodage forcé (fichier trop lourd tel quel) pour une vidéo à découper.
 */
export interface EncodeProfile {
  maxShortSide?: number;
  maxrate?: string;
  reencode?: boolean;
  /** Taille du fichier écrit au plus (`-fs`) : ffmpeg s'arrête de lui-même à cette taille. */
  maxBytes?: number;
  /** Fichier venu d'un lien direct : lu seulement comme fichier local, en MP4, MOV, Matroska ou WebM. */
  untrustedInput?: boolean;
}

/**
 * Options d'entrée d'un fichier venu d'un lien direct : aucun protocole que
 * `file` (une liste de lecture HLS ou un `concat` ne peut pas faire lire
 * d'autres fichiers ou adresses au serveur), et seulement les conteneurs
 * attendus. Vérifié avec le ffmpeg épinglé (b6.1.1) : un `.ts` est refusé.
 */
export const UNTRUSTED_INPUT_ARGS = ["-protocol_whitelist", "file", "-format_whitelist", "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm"];

/** Arguments ffmpeg de la mise au format (et du découpage d'un lien direct). */
export function finalizeArgs(input: string, output: string, streams: MediaStreams, cut?: { start: number; end: number }, profile: EncodeProfile = {}): string[] {
  const side = profile.maxShortSide ?? 1080;
  const base = conversionPlan(streams, side);
  const plan = { ...base, video: base.video || Boolean(profile.reencode) };
  const args = ["-nostdin", "-hide_banner", "-y"];
  if (profile.untrustedInput) args.push(...UNTRUSTED_INPUT_ARGS);
  if (cut && cut.start > 0) args.push("-ss", String(cut.start));
  args.push("-i", input);
  if (cut) args.push("-t", String(round3(cut.end - cut.start)));
  args.push("-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn", "-map_metadata", "-1");
  if (plan.video) {
    // Petit côté ramené à 1080 px au plus (720 pour une vidéo à découper), en gardant les proportions (portrait compris).
    args.push(
      "-c:v", "libx264", "-preset", "veryfast", "-crf", profile.maxrate ? "23" : "21", "-pix_fmt", "yuv420p",
      ...(profile.maxrate ? ["-maxrate", profile.maxrate, "-bufsize", `${parseInt(profile.maxrate, 10) * 2}k`] : []),
      "-vf", `scale='if(gt(iw,ih),-2,min(${side},iw))':'if(gt(iw,ih),min(${side},ih),-2)'`,
      "-fpsmax", "60"
    );
  } else {
    args.push("-c:v", "copy");
  }
  if (streams.audio) args.push(...(plan.audio ? ["-c:a", "aac", "-b:a", "160k"] : ["-c:a", "copy"]));
  if (profile.maxBytes && profile.maxBytes > 0) args.push("-fs", String(Math.floor(profile.maxBytes)));
  args.push("-movflags", "+faststart", "-threads", "2", "-progress", "pipe:1", "-nostats", output);
  return args;
}

export function runFfmpeg(
  binary: string,
  args: string[],
  options: { signal?: AbortSignal; timeoutMs: number; onTime?: (seconds: number) => void }
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { env: childEnv(), windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let reason: "timeout" | "canceled" | null = null;
    let pending = "";
    child.stdout.on("data", (chunk: Buffer) => {
      const lines = (pending + chunk.toString()).split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const match = /^out_time_(?:us|ms)=(\d+)/.exec(line.trim());
        if (match) options.onTime?.(Number(match[1]) / 1_000_000);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-20_000);
    });
    const stop = (why: "timeout" | "canceled") => {
      reason ??= why;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => stop("timeout"), options.timeoutMs);
    const onAbort = () => stop("canceled");
    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.on("error", (error) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (reason === "canceled") return reject(new YtDlpError("canceled", "Récupération annulée."));
      if (reason === "timeout") return reject(new Error("La conversion a pris trop de temps et a été arrêtée. Choisissez un passage plus court."));
      resolve({ code: code ?? 1, stderr });
    });
  });
}

export async function inspect(binary: string, file: string, options: { untrustedInput?: boolean } = {}): Promise<MediaStreams> {
  // Sans fichier de sortie, ffmpeg s'arrête en erreur après avoir décrit l'entrée : c'est voulu.
  const guard = options.untrustedInput ? UNTRUSTED_INPUT_ARGS : [];
  const result = await runFfmpeg(binary, ["-nostdin", "-hide_banner", ...guard, "-i", file], { timeoutMs: 60_000 });
  return parseMediaStreams(result.stderr);
}

// ─── Lecture d'une adresse ───────────────────────────────────────

export interface RemoteProbe {
  /** Adresse canonique, à renvoyer telle quelle pour la récupération. */
  url: string;
  site: RemoteSite;
  kind: ParsedRemoteUrl["kind"];
  title: string;
  author?: string;
  /** Durée en secondes ; absente pour un lien direct (connue une fois le fichier reçu). */
  duration?: number;
  /** Vignette lue par le serveur, en adresse `data:` (aucun appel du navigateur vers le site). */
  thumbnail?: string;
  startHint?: number;
  maxSectionSeconds: number;
}

const probeCache = ((globalThis as any).__sxmRemoteProbes ??= new Map<string, { at: number; probe: RemoteProbe }>()) as Map<
  string,
  { at: number; probe: RemoteProbe }
>;
const PROBE_TTL_MS = 15 * 60 * 1000;
const MAX_THUMBNAIL_DATA = 1_500_000;

async function thumbnailData(url: string | undefined): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const image = await fetchRemoteImage(url);
    if (image.b64.length > MAX_THUMBNAIL_DATA) return undefined;
    return `data:${image.mimeType};base64,${image.b64}`;
  } catch {
    return undefined;
  }
}

function cacheProbe(probe: RemoteProbe) {
  probeCache.set(probe.url, { at: Date.now(), probe });
  if (probeCache.size > 50) probeCache.delete(probeCache.keys().next().value as string);
}

function withCookies<T>(parsed: ParsedRemoteUrl, run: (cookiesFile: string | null) => Promise<T>): Promise<T> {
  if (parsed.site !== "youtube") return run(null);
  const dir = path.join(WORK_DIR, `probe-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`);
  const release = holdWorkDir(dir);
  let cookies: string | null;
  try {
    cookies = copyYoutubeCookies(dir);
  } catch (error) {
    release();
    throw error;
  }
  return run(cookies).finally(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    release();
  });
}

/** Le refus de YouTube malgré des cookies veut dire qu'ils sont à renouveler. */
function noteCookieFailure(error: unknown, cookies: boolean) {
  if (cookies && error instanceof YtDlpError && (error.code === "bot-check" || error.code === "cookies-invalid")) markCookiesRejected();
}

// ─── Lectures simultanées ────────────────────────────────────────

/**
 * Lectures d'adresse : chacune lance yt-dlp (un interpréteur Python, jusqu'à
 * 90 secondes). Deux à la fois, quatre en attente au plus, vingt par minute
 * pour tout le serveur ; une adresse déjà en cours de lecture n'est pas lue
 * une seconde fois, la même réponse sert aux deux demandes.
 */
export const PROBE_LIMITS = { maxConcurrent: 2, maxQueued: 4, perMinute: 20 };

export const PROBE_BUSY_MESSAGE = "Le serveur lit déjà plusieurs adresses : réessayez dans quelques secondes.";
export const PROBE_RATE_MESSAGE = "Trop d’adresses lues en peu de temps : patientez une minute avant d’en lire une autre.";

export interface ProbeGate {
  /** Lance `task` pour `key`, ou rend la lecture déjà en cours pour la même clé. */
  run<T>(key: string, task: () => Promise<T>): Promise<T>;
  stats(): { active: number; queued: number; inFlight: number; lastMinute: number };
}

export function createProbeGate(limits = PROBE_LIMITS, now: () => number = Date.now): ProbeGate {
  let active = 0;
  const queue: (() => void)[] = [];
  const started: number[] = [];
  const inFlight = new Map<string, Promise<unknown>>();

  const recent = () => {
    const at = now();
    while (started.length && at - started[0] >= 60_000) started.shift();
    return started.length;
  };
  const acquire = () =>
    active < limits.maxConcurrent
      ? (active++, Promise.resolve())
      : new Promise<void>((resolve) => queue.push(resolve));
  const release = () => {
    const next = queue.shift();
    // La place passe directement à la lecture suivante.
    if (next) next();
    else active--;
  };

  return {
    run<T>(key: string, task: () => Promise<T>): Promise<T> {
      const existing = inFlight.get(key);
      if (existing) return existing as Promise<T>;
      if (recent() >= limits.perMinute) return Promise.reject(new Error(PROBE_RATE_MESSAGE));
      if (active >= limits.maxConcurrent && queue.length >= limits.maxQueued) return Promise.reject(new Error(PROBE_BUSY_MESSAGE));
      started.push(now());
      const promise = (async () => {
        await acquire();
        try {
          return await task();
        } finally {
          release();
        }
      })();
      inFlight.set(key, promise);
      void promise.then(
        () => inFlight.delete(key),
        () => inFlight.delete(key)
      );
      return promise;
    },
    stats() {
      return { active, queued: queue.length, inFlight: inFlight.size, lastMinute: recent() };
    },
  };
}

const probeGate = ((globalThis as any).__sxmRemoteProbeGate ??= createProbeGate()) as ProbeGate;

/**
 * Porte des lectures d'adresse, partagée avec la recherche d'extraits de
 * l'assistant (`clip-sourcing.ts`) : ses recherches et lectures comptent dans
 * les mêmes bornes (deux à la fois, vingt par minute pour tout le serveur).
 */
export function sharedProbeGate(): ProbeGate {
  return probeGate;
}

/** Rejette dès que `signal` est levé, sans arrêter la lecture partagée (bornée à 90 secondes). */
function untilAborted<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new YtDlpError("canceled", "Récupération annulée."));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new YtDlpError("canceled", "Récupération annulée."));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

export async function probeRemote(raw: unknown, signal?: AbortSignal): Promise<RemoteProbe> {
  const parsed = parseRemoteUrl(raw);
  const cached = probeCache.get(parsed.url);
  if (cached && Date.now() - cached.at < PROBE_TTL_MS) return { ...cached.probe, ...(parsed.startHint ? { startHint: parsed.startHint } : {}) };
  // Lecture partagée par adresse canonique : sans le repère de départ propre à chaque demande.
  const probe = await untilAborted(probeGate.run(parsed.url, () => readProbe({ ...parsed, startHint: undefined })), signal);
  return { ...probe, ...(parsed.startHint ? { startHint: parsed.startHint } : {}) };
}

/** Lecture effective d'une adresse, sans cache ni limite (voir `probeRemote`). */
async function readProbe(parsed: ParsedRemoteUrl, signal?: AbortSignal): Promise<RemoteProbe> {
  let probe: RemoteProbe;
  if (parsed.site === "web") {
    ensureDirs();
    const response = await openDirect(parsed.url, signal);
    response.stream.destroy();
    probe = {
      url: parsed.url,
      site: "web",
      kind: "file",
      title: fileTitle(response.url),
      author: response.url.hostname.replace(/^www\./, ""),
      maxSectionSeconds: REMOTE_LIMITS.maxSectionSeconds,
    };
  } else {
    ensureDirs();
    const cookies = parsed.site === "youtube" && hasYoutubeCookies();
    let info: RemoteVideoInfo;
    try {
      info = await withCookies(parsed, (cookiesFile) => probeUrl(parsed.url, { cookiesFile, signal, site: siteLabel(parsed.site, parsed.url) }));
    } catch (error) {
      noteCookieFailure(error, cookies);
      throw error;
    }
    probe = {
      url: parsed.url,
      site: parsed.site,
      kind: parsed.kind,
      title: info.title,
      ...(info.uploader ? { author: info.uploader } : {}),
      ...(info.duration ? { duration: info.duration } : {}),
      ...(parsed.startHint ? { startHint: parsed.startHint } : {}),
      maxSectionSeconds: REMOTE_LIMITS.maxSectionSeconds,
    };
    const thumbnail = await thumbnailData(info.thumbnail);
    if (thumbnail) probe.thumbnail = thumbnail;
  }
  cacheProbe(probe);
  return probe;
}

// ─── Travaux ─────────────────────────────────────────────────────

export type RemoteImportStatus = "running" | "done" | "error" | "canceled";
export type RemoteImportPhase = "probe" | "download" | "convert" | "save";

export interface RemoteImportJob {
  id: string;
  status: RemoteImportStatus;
  phase: RemoteImportPhase;
  /** Avancement global, de 0 à 1 ; absent quand il ne peut pas être estimé. */
  progress?: number;
  url: string;
  site: RemoteSite;
  title?: string;
  author?: string;
  section?: { start: number; end?: number };
  /** Longue vidéo à découper (`CLIPPING_LIMITS`) ; absent : un passage pour le montage. */
  purpose?: "clipping";
  /** Média rangé, une fois le travail terminé. */
  asset?: ClipAsset;
  error?: string;
  createdAt: number;
  finishedAt?: number;
}

const runtime = ((globalThis as any).__sxmRemoteImports ??= {
  controllers: new Map<string, AbortController>(),
  live: new Map<string, RemoteImportJob>(),
  lastSweep: 0,
}) as { controllers: Map<string, AbortController>; live: Map<string, RemoteImportJob>; lastSweep: number };

function readJobs(): RemoteImportJob[] {
  try {
    const jobs = JSON.parse(fs.readFileSync(JOBS_FILE, "utf-8"));
    return Array.isArray(jobs) ? (jobs as RemoteImportJob[]) : [];
  } catch {
    return [];
  }
}

function persist(job: RemoteImportJob) {
  ensureDirs();
  const jobs = [job, ...readJobs().filter((entry) => entry.id !== job.id)].slice(0, 30);
  const temporary = `${JOBS_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(jobs, null, 2));
  fs.renameSync(temporary, JOBS_FILE);
}

export function listRemoteImportJobs(): RemoteImportJob[] {
  const stored = readJobs().map((job) => runtime.live.get(job.id) ?? job);
  // Un travail « en cours » sans contrôleur a été interrompu par un redémarrage.
  return stored.map((job) =>
    job.status === "running" && !runtime.controllers.has(job.id)
      ? { ...job, status: "error" as const, error: "Interrompu par un redémarrage du serveur : relancez la récupération." }
      : job
  );
}

export function getRemoteImportJob(id: string): RemoteImportJob | null {
  return runtime.live.get(id) ?? listRemoteImportJobs().find((job) => job.id === id) ?? null;
}

export function cancelRemoteImportJob(id: string) {
  runtime.controllers.get(id)?.abort();
}

export function startRemoteImport(input: { url?: unknown; start?: unknown; end?: unknown; purpose?: unknown }): RemoteImportJob {
  const parsed = parseRemoteUrl(input?.url);
  const purpose: RemoteImportPurpose = input?.purpose === "clipping" ? "clipping" : "montage";
  const profile = importProfile(purpose);
  if (runtime.controllers.size >= REMOTE_LIMITS.maxRunning) {
    throw new Error("Deux récupérations sont déjà en cours : attendez qu’une se termine.");
  }
  const cached = probeCache.get(parsed.url)?.probe;
  // Contrôle immédiat du passage, avec la durée si elle est déjà connue.
  const section = resolveSection({ start: input?.start, end: input?.end }, cached?.duration, profile.maxSectionSeconds);

  try {
    sweepRemoteAssets();
  } catch {
    // Un ménage raté ne doit pas empêcher la récupération.
  }

  // Place : le fichier reçu et le fichier converti coexistent un moment, en plus
  // de ce que réservent les récupérations déjà en cours, avec 2 Go de marge.
  ensureDirs();
  const expectedBytes = profile.maxDownloadBytes + profile.maxFileBytes;
  const reservedBytes = [...reservations.values()].reduce((sum, bytes) => sum + bytes, 0);
  assertDiskSpace(DATA_DIR, expectedBytes + reservedBytes);
  enforceRemoteBudget(profile.maxFileBytes);

  const job: RemoteImportJob = {
    id: `rimp-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`,
    status: "running",
    phase: cached ? "download" : "probe",
    progress: 0,
    url: parsed.url,
    site: parsed.site,
    ...(cached ? { title: cached.title, ...(cached.author ? { author: cached.author } : {}) } : {}),
    section: { start: section.start, ...(section.end !== undefined ? { end: section.end } : {}) },
    ...(purpose === "clipping" ? { purpose } : {}),
    createdAt: Date.now(),
  };
  const controller = new AbortController();
  runtime.controllers.set(job.id, controller);
  runtime.live.set(job.id, job);
  reservations.set(job.id, expectedBytes);
  persist(job);

  const pasted = String(input?.url).trim();
  void runJob(job, parsed, { start: input?.start, end: input?.end }, pasted, controller.signal, profile).finally(() => {
    runtime.controllers.delete(job.id);
    runtime.live.delete(job.id);
    reservations.delete(job.id);
  });
  return job;
}

/** Octets réservés par les récupérations en cours (taille la plus grande qu'elles peuvent écrire). */
const reservations = ((globalThis as any).__sxmRemoteReservations ??= new Map<string, number>()) as Map<string, number>;

/** Avancement global : le téléchargement compte pour 70 %, la mise au format pour le reste. */
const DOWNLOAD_SHARE = 0.7;

async function runJob(
  job: RemoteImportJob,
  parsed: ParsedRemoteUrl,
  requested: SectionInput,
  pasted: string,
  signal: AbortSignal,
  profile: ImportProfile = importProfile(undefined)
) {
  const workDir = path.join(WORK_DIR, job.id);
  const releaseWorkDir = holdWorkDir(workDir);
  let lastSave = 0;
  const update = (patch: Partial<RemoteImportJob>, force = false) => {
    Object.assign(job, patch);
    if (force || Date.now() - lastSave > 2000) {
      lastSave = Date.now();
      persist(job);
    }
  };
  const cookies = parsed.site === "youtube" && hasYoutubeCookies();

  try {
    ensureDirs();
    fs.mkdirSync(workDir, { recursive: true });
    const ffmpeg = await ensureFfmpeg();
    if (!ffmpeg) throw new Error("ffmpeg n’est pas disponible sur le serveur : réessayez dans un moment.");

    // 1. Métadonnées (déjà lues par « Lire » le plus souvent).
    const probe = probeCache.get(parsed.url)?.probe ?? (await probeRemote(parsed.url, signal));
    if (signal.aborted) throw new YtDlpError("canceled", "Récupération annulée.");
    const section = resolveSection(requested, probe.duration, profile.maxSectionSeconds);
    update(
      {
        phase: "download",
        title: probe.title,
        ...(probe.author ? { author: probe.author } : {}),
        section: { start: section.start, ...(section.end !== undefined ? { end: section.end } : {}) },
      },
      true
    );

    // 2. Téléchargement.
    let source: string;
    let cut: { start: number; end: number } | undefined;
    const length = section.end !== undefined ? section.end - section.start : profile.maxSectionSeconds;
    if (parsed.site === "web") {
      source = path.join(workDir, `source${path.extname(new URL(parsed.url).pathname).toLowerCase() || ".mp4"}`);
      await downloadDirect(parsed.url, source, {
        signal,
        maxBytes: profile.maxDownloadBytes,
        deadlineMs: Math.max(20 * 60 * 1000, length * 500),
        onProgress: (ratio) => ratio !== undefined && update({ progress: ratio * DOWNLOAD_SHARE }),
      });
    } else {
      const result = await (async () => {
        const cookiesFile = cookies ? copyYoutubeCookies(workDir) : null;
        try {
          // Durée inconnue et pas de fin : 20 minutes (deux heures pour une vidéo à découper) au plus depuis le début.
          const wanted = section.whole ? null : { start: section.start, end: section.end ?? section.start + profile.maxSectionSeconds };
          return await downloadSection(parsed.url, wanted, path.join(workDir, "download"), {
            signal,
            cookiesFile,
            site: siteLabel(parsed.site, parsed.url),
            maxBytes: profile.maxDownloadBytes,
            maxHeight: profile.maxHeight,
            timeoutMs: Math.max(10 * 60 * 1000, length * 3000),
            onProgress: ({ ratio }) => ratio !== undefined && update({ progress: ratio * DOWNLOAD_SHARE }),
          });
        } finally {
          if (cookiesFile) fs.rmSync(cookiesFile, { force: true });
        }
      })();
      source = result.file;
    }
    if (signal.aborted) throw new YtDlpError("canceled", "Récupération annulée.");

    // 3. Contrôle et mise au format.
    update({ phase: "convert", progress: DOWNLOAD_SHARE }, true);
    // Un fichier venu d'un lien direct n'est lu que comme fichier local, dans un conteneur attendu.
    const untrustedInput = parsed.site === "web";
    const streams = await inspect(ffmpeg, source, { untrustedInput });
    if (!streams.video) throw new Error("Ce fichier ne contient pas de vidéo lisible.");
    if (parsed.site === "web") {
      const total = streams.durationSec;
      const bounded = resolveSection(requested, total, profile.maxSectionSeconds);
      const end = bounded.end ?? (total ? Math.min(total, bounded.start + profile.maxSectionSeconds) : bounded.start + profile.maxSectionSeconds);
      if (!bounded.whole || (total ?? 0) > profile.maxSectionSeconds) cut = { start: bounded.start, end };
      update({ section: { start: bounded.start, end: cut?.end ?? total } }, true);
    }
    const output = path.join(workDir, "final.mp4");
    const expected = cut ? cut.end - cut.start : streams.durationSec ?? length;
    // Une vidéo à découper trop lourde telle quelle est réencodée à débit plafonné.
    const encode: EncodeProfile = {
      maxShortSide: profile.maxHeight,
      // ffmpeg s'arrête de lui-même à la taille permise : rien n'est écrit au-delà.
      maxBytes: profile.maxFileBytes,
      untrustedInput,
      ...(profile.videoMaxrate ? { maxrate: profile.videoMaxrate, reencode: fs.statSync(source).size > profile.maxFileBytes * 0.9 } : {}),
    };
    const converted = await runFfmpeg(ffmpeg, finalizeArgs(source, output, streams, cut, encode), {
      signal,
      timeoutMs: Math.max(10 * 60 * 1000, expected * 4000),
      onTime: (seconds) => {
        if (expected > 0) update({ progress: DOWNLOAD_SHARE + Math.min(0.99, seconds / expected) * (1 - DOWNLOAD_SHARE - 0.02) });
      },
    });
    if (converted.code !== 0 || !fs.existsSync(output)) {
      throw new Error("La vidéo n’a pas pu être convertie dans un format lisible par le navigateur.");
    }

    // 4. Contrôle final et rangement.
    update({ phase: "save", progress: 0.98 }, true);
    const final = await inspect(ffmpeg, output);
    if (!final.video || final.video.codec !== "h264") throw new Error("La vidéo convertie est illisible : réessayez.");
    const size = fs.statSync(output).size;
    // Arrêté par `-fs`, ffmpeg finit sans erreur sur un fichier tronqué à la limite.
    if (size >= profile.maxFileBytes) throw new Error(`La vidéo dépasse ${sizeLabel(profile.maxFileBytes)} une fois convertie : choisissez un passage plus court.`);

    // Passage noté dans la provenance seulement quand la vidéo a été découpée.
    const taken = parsed.site === "web" ? cut : section.whole ? undefined : { start: section.start, end: section.end ?? section.start + (final.durationSec ?? 0) };
    const asset = registerRemoteAsset({ output, size, streams: final, probe, pasted, section: taken });
    update({ status: "done", phase: "save", progress: 1, asset, finishedAt: Date.now() }, true);
  } catch (error) {
    noteCookieFailure(error, cookies);
    const canceled = signal.aborted || (error instanceof YtDlpError && error.code === "canceled");
    if (!canceled && !(error instanceof YtDlpError) && !(error && typeof error === "object" && "syscall" in error)) console.error("[clip-studio] récupération par adresse :", error instanceof Error ? error.message : error);
    update(
      {
        status: canceled ? "canceled" : "error",
        // Sans chemin du serveur ni erreur système brute : le détail reste dans les journaux.
        error: canceled ? "Récupération annulée." : publicErrorMessage(error, "La vidéo n’a pas pu être récupérée.", "[clip-studio] récupération par adresse"),
        finishedAt: Date.now(),
      },
      true
    );
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
    releaseWorkDir();
  }
}

/** Mention reprise à la publication : « titre – auteur, site ». */
export function remoteCredit(title: string, author: string | undefined, site: string): string {
  return `${title}${author ? ` – ${author}` : ""}, ${site}`.slice(0, 600);
}

function registerRemoteAsset(input: {
  output: string;
  size: number;
  streams: MediaStreams;
  probe: RemoteProbe;
  pasted: string;
  section?: { start: number; end: number };
}): ClipAsset {
  const file = `remote-${Date.now().toString(36)}${randomBytes(4).toString("hex")}.mp4`;
  fs.renameSync(input.output, path.join(ASSETS_DIR, file));
  const label = siteLabel(input.probe.site, input.probe.url);
  const title = input.probe.title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) || "Vidéo";
  // L'adresse collée, si elle reste une adresse http(s) raisonnable ; sinon la forme canonique.
  const origin: MediaOrigin = {
    site: input.probe.site,
    url: /^https?:\/\//i.test(input.pasted) && input.pasted.length <= 500 ? input.pasted : input.probe.url,
    title: input.probe.title,
    ...(input.probe.author ? { author: input.probe.author } : {}),
    ...(input.section ? { section: { start: input.section.start, end: round3(input.section.end) } } : {}),
  };
  const now = Date.now();
  const asset: ClipAsset = {
    file,
    kind: "video",
    originalName: `${title}.mp4`,
    size: input.size,
    width: input.streams.width,
    height: input.streams.height,
    durationMs: input.streams.durationSec ? Math.round(input.streams.durationSec * 1000) : undefined,
    // Un lien direct a pour « auteur » son site : il n'est pas répété.
    credit: remoteCredit(input.probe.title, input.probe.author === label ? undefined : input.probe.author, label),
    rights: "unverified",
    origin,
    hasAudio: Boolean(input.streams.audio),
    lastUsedAt: now,
    createdAt: now,
  };
  writeAssets([asset, ...readAssets().filter((entry) => entry.file !== file)]);
  return asset;
}

// ─── Ménage ──────────────────────────────────────────────────────

const ASSET_URL_PREFIX = "/api/modules/clip-studio/data/assets/";

/** Fichiers de médias du module dont se sert au moins un projet. */
function usedAssetFiles(): Set<string> {
  const used = new Set<string>();
  for (const project of listProjectFiles()) {
    for (const track of project.tracks ?? []) {
      for (const item of track.items ?? []) {
        const url = "source" in item ? (item.source as { url?: unknown })?.url : undefined;
        if (typeof url !== "string" || !url.startsWith(ASSET_URL_PREFIX)) continue;
        try {
          used.add(decodeURIComponent(url.slice(ASSET_URL_PREFIX.length).split(/[?#]/)[0]));
        } catch {
          // Adresse mal encodée : ignorée.
        }
      }
    }
  }
  return used;
}

/**
 * Efface les médias récupérés par adresse dont aucun projet ne se sert depuis
 * 30 jours, et les dossiers de travail abandonnés. Lancé au plus une fois par
 * heure, au début d'une récupération. Renvoie les fichiers effacés.
 */
export function sweepRemoteAssets(now = Date.now(), options: { force?: boolean } = {}): string[] {
  if (!options.force && now - runtime.lastSweep < 60 * 60 * 1000) return [];
  runtime.lastSweep = now;

  const used = usedAssetFiles();
  const busy = remoteAssetGuards.busyFiles();
  const removed: string[] = [];
  let changed = false;
  const kept = readAssets().filter((asset) => {
    if (!asset.origin) return true;
    if (busy.has(asset.file)) return true;
    if (used.has(asset.file)) {
      if (now - (asset.lastUsedAt ?? 0) > 60 * 60 * 1000) {
        asset.lastUsedAt = now;
        changed = true;
      }
      return true;
    }
    if (now - (asset.lastUsedAt ?? asset.createdAt) < REMOTE_LIMITS.unusedTtlMs) return true;
    fs.rmSync(path.join(ASSETS_DIR, asset.file), { force: true });
    removed.push(asset.file);
    changed = true;
    return false;
  });
  if (changed) writeAssets(kept);

  // Dossiers de travail d'un travail qui ne tourne plus (redémarrage pendant une récupération), ceux des autres travaux du module compris.
  try {
    sweepWorkDirs(now, DATA_DIR, (name) => runtime.controllers.has(name));
  } catch {
    // Pas encore de dossier de travail.
  }
  return removed;
}

/**
 * Fichiers que d'autres travaux tiennent (la vidéo source d'une découpe dont
 * les passages attendent le choix de l'utilisateur) : ni le ménage des
 * 30 jours ni celui du budget n'y touchent. Renseigné par `clip-jobs.ts`.
 */
export const remoteAssetGuards = {
  busyFiles: (): Set<string> => new Set<string>(),
};

/** Taille d'un média sur le disque (celle de sa fiche à défaut). */
function assetBytes(asset: ClipAsset): number {
  try {
    return fs.statSync(path.join(ASSETS_DIR, asset.file)).size;
  } catch {
    return Number(asset.size) || 0;
  }
}

/**
 * Budget des médias venus d'ailleurs (`origin` : adresse, Pexels, extraits),
 * 20 Go : avant d'en ajouter `incomingBytes`, les plus anciens dont aucun
 * projet ne se sert (ni aucun travail en cours) sont effacés, du plus ancien
 * au plus récent, jusqu'à repasser sous le budget. Un média d'il y a moins
 * d'une heure est gardé (il vient d'arriver pour un travail). S'il en reste
 * trop, la récupération est refusée. Renvoie les fichiers effacés.
 */
export function enforceRemoteBudget(incomingBytes: number, now = Date.now(), budget = REMOTE_LIMITS.totalBudgetBytes): string[] {
  const assets = readAssets();
  const remote = assets.filter((asset) => asset.origin);
  let total = remote.reduce((sum, asset) => sum + assetBytes(asset), 0);
  if (total + incomingBytes <= budget) return [];

  const used = usedAssetFiles();
  const busy = remoteAssetGuards.busyFiles();
  const candidates = remote
    .filter((asset) => !used.has(asset.file) && !busy.has(asset.file) && now - (asset.createdAt ?? 0) > 60 * 60 * 1000)
    .sort((a, b) => (a.lastUsedAt ?? a.createdAt ?? 0) - (b.lastUsedAt ?? b.createdAt ?? 0));
  const removed: string[] = [];
  for (const asset of candidates) {
    if (total + incomingBytes <= budget) break;
    total -= assetBytes(asset);
    fs.rmSync(path.join(ASSETS_DIR, asset.file), { force: true });
    removed.push(asset.file);
  }
  if (removed.length) {
    const gone = new Set(removed);
    // Relue juste avant d'écrire : un import a pu finir entre-temps.
    writeAssets(readAssets().filter((asset) => !gone.has(asset.file)));
    console.info(`[clip-studio] budget des vidéos récupérées : ${removed.length} média(s) inutilisé(s) effacé(s).`);
  }
  if (total + incomingBytes > budget) {
    throw new Error(
      `Les vidéos récupérées occupent déjà ${bytesLabel(total)} sur le serveur (${bytesLabel(budget)} au plus), toutes utilisées par un projet ou récentes : supprimez-en dans Mes médias, puis réessayez.`
    );
  }
  return removed;
}
