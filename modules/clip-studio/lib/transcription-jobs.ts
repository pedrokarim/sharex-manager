/**
 * Travaux de transcription (serveur seulement).
 *
 * Une transcription se fait une fois par média et se garde avec lui :
 *
 * - un média de Clip Studio (`module:clip-studio/assets/<fichier>`) la range
 *   dans sa fiche (`data/assets.json`, champs `words` et `transcript`) : tout
 *   projet qui l’ajoute ensuite la reçoit ;
 * - une vidéo de la galerie (`upload:<fichier>`) la range dans
 *   `data/transcripts.json`, avec la taille et la date du fichier pour
 *   l’oublier si le fichier change.
 *
 * Les travaux sont suivis comme ceux de l’assistant : rangés dans
 * `data/transcriptions.json`, annulables, deux à la fois au plus.
 */

import fs from "fs";
import path from "path";
import type { ClipAsset, TimedWord, TranscriptInfo } from "../engine/types";
import { ASSETS_DIR, DATA_DIR, ensureDirs, readAssets, writeAssets } from "./store";
import { assertTranscribableDuration, TranscriptionError, transcribeMediaFile, type TranscribeProgress } from "./transcribe";
import { getAbsoluteUploadPath } from "@/lib/config";

const JOBS_FILE = path.join(DATA_DIR, "transcriptions.json");
const UPLOAD_TRANSCRIPTS_FILE = path.join(DATA_DIR, "transcripts.json");
const MAX_RUNNING_JOBS = 2;
const KEPT_JOBS = 30;
const ASSET_PREFIX = "module:clip-studio/assets/";
/** Une transcription plus récente que ce délai ne se refait pas (`force`) : chaque essai est payé à OpenAI. */
export const RETRANSCRIBE_MIN_AGE_MS = 24 * 60 * 60 * 1000;
const UPLOAD_PREFIX = "upload:";

export interface TranscriptionRequest {
  /** Nom de fichier d’un média de Clip Studio. */
  assetId?: string;
  /** Référence d’un média (`module:clip-studio/assets/…` ou `upload:…`). */
  ref?: string;
  /** Langue parlée (ISO 639-1) ; absente : reconnue. */
  language?: string;
  /** Refaire la transcription même si le média en a déjà une. */
  force?: boolean;
}

export interface TranscriptionJob {
  id: string;
  status: "running" | "done" | "error" | "canceled";
  ref: string;
  name: string;
  stage: "extracting" | "transcribing" | "saving" | "done";
  /** Morceaux envoyés à OpenAI, pour un long média découpé. */
  chunks?: { done: number; total: number };
  /** Rendue par `getTranscriptionJob` quand le travail a réussi (pas rangée avec le travail). */
  words?: TimedWord[];
  transcript?: TranscriptInfo;
  /** Nombre de mots reconnus. */
  wordCount?: number;
  error?: string;
  createdAt: number;
  finishedAt?: number;
}

// ─── Médias transcriptibles ──────────────────────────────────────

interface ResolvedMedia {
  ref: string;
  path: string;
  name: string;
  storage: "asset" | "upload";
  /** Fichier dans `assets/` ou dans le dossier des envois. */
  file: string;
}

/** Nom de fichier simple : ni dossier, ni fichier caché, ni caractère de contrôle. */
function plainFileName(value: string): boolean {
  return value.length > 0 && value.length <= 255 && !/[\\/\u0000-\u001f]/.test(value) && !value.startsWith(".") && !value.includes("..");
}

/** Fichier d’un média à transcrire. Refuse tout ce qui n’est pas une vidéo ou un son de l’utilisateur. */
export function resolveMedia(request: Pick<TranscriptionRequest, "assetId" | "ref">): ResolvedMedia {
  const ref = typeof request.ref === "string" && request.ref ? request.ref : typeof request.assetId === "string" ? `${ASSET_PREFIX}${request.assetId}` : "";
  if (ref.startsWith(ASSET_PREFIX)) {
    const file = ref.slice(ASSET_PREFIX.length);
    if (!plainFileName(file)) throw new TranscriptionError("Nom de fichier invalide.");
    const asset = readAssets().find((entry) => entry.file === file);
    const full = path.join(ASSETS_DIR, file);
    if (!asset || !fs.existsSync(full)) throw new TranscriptionError("Média introuvable.");
    if (asset.kind !== "video" && asset.kind !== "audio") throw new TranscriptionError("Seuls une vidéo ou un son se transcrivent.");
    return { ref, path: full, name: asset.originalName || file, storage: "asset", file };
  }
  if (ref.startsWith(UPLOAD_PREFIX)) {
    const file = ref.slice(UPLOAD_PREFIX.length);
    if (!plainFileName(file)) throw new TranscriptionError("Nom de fichier invalide.");
    const root = path.resolve(getAbsoluteUploadPath());
    const full = path.resolve(root, file);
    if (path.dirname(full) !== root || !fs.existsSync(full)) throw new TranscriptionError("Média introuvable.");
    if (!/\.(mp4|webm|mov|m4v|mkv|mp3|m4a|wav|ogg|opus|aac|flac)$/i.test(file)) throw new TranscriptionError("Seuls une vidéo ou un son se transcrivent.");
    return { ref, path: full, name: file, storage: "upload", file };
  }
  throw new TranscriptionError("Ce média ne peut pas être transcrit.");
}

interface UploadTranscript {
  words: TimedWord[];
  transcript: TranscriptInfo;
  size: number;
  mtimeMs: number;
}

function readUploadTranscripts(): Record<string, UploadTranscript> {
  try {
    const raw = JSON.parse(fs.readFileSync(UPLOAD_TRANSCRIPTS_FILE, "utf-8"));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function writeUploadTranscripts(entries: Record<string, UploadTranscript>) {
  ensureDirs();
  const temporary = `${UPLOAD_TRANSCRIPTS_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(entries));
  fs.renameSync(temporary, UPLOAD_TRANSCRIPTS_FILE);
}

/** Transcription déjà rangée pour ce média, ou `null`. */
export function storedTranscript(media: ResolvedMedia): { words: TimedWord[]; transcript: TranscriptInfo } | null {
  if (media.storage === "asset") {
    const asset = readAssets().find((entry) => entry.file === media.file);
    return asset?.transcript ? { words: asset.words ?? [], transcript: asset.transcript } : null;
  }
  const entry = readUploadTranscripts()[media.ref];
  if (!entry) return null;
  const stat = fs.statSync(media.path);
  // Le fichier a changé depuis : la transcription ne vaut plus.
  if (stat.size !== entry.size || Math.round(stat.mtimeMs) !== entry.mtimeMs) return null;
  return { words: entry.words, transcript: entry.transcript };
}

export function storeTranscript(media: ResolvedMedia, words: TimedWord[], transcript: TranscriptInfo) {
  if (media.storage === "asset") {
    // Relue juste avant d’écrire : un envoi a pu s’ajouter pendant la transcription.
    const assets = readAssets();
    const asset = assets.find((entry) => entry.file === media.file);
    if (!asset) throw new TranscriptionError("Le média a été supprimé pendant la transcription.");
    const next: ClipAsset = { ...asset, words, transcript };
    writeAssets(assets.map((entry) => (entry === asset ? next : entry)));
    return;
  }
  const stat = fs.statSync(media.path);
  const entries = readUploadTranscripts();
  entries[media.ref] = { words, transcript, size: stat.size, mtimeMs: Math.round(stat.mtimeMs) };
  writeUploadTranscripts(entries);
}

// ─── Travaux ─────────────────────────────────────────────────────

const controllers = new Map<string, AbortController>();

function readJobs(): TranscriptionJob[] {
  try {
    const jobs = JSON.parse(fs.readFileSync(JOBS_FILE, "utf-8"));
    return Array.isArray(jobs) ? jobs : [];
  } catch {
    return [];
  }
}

function save(job: TranscriptionJob) {
  ensureDirs();
  const { words: _words, ...stored } = job;
  const jobs = [stored, ...readJobs().filter((entry) => entry.id !== job.id)].slice(0, KEPT_JOBS);
  const temporary = `${JOBS_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(jobs, null, 2));
  fs.renameSync(temporary, JOBS_FILE);
}

function withInterruption(job: TranscriptionJob): TranscriptionJob {
  // Un travail « en cours » sans contrôleur a été interrompu par un redémarrage.
  return job.status === "running" && !controllers.has(job.id)
    ? { ...job, status: "error", error: "Interrompue par un redémarrage du serveur : relancez la transcription." }
    : job;
}

/** Travail et, s’il a réussi, les mots du média. */
export function getTranscriptionJob(id: string): TranscriptionJob | null {
  if (typeof id !== "string" || !/^tr-[a-z0-9]{4,40}$/.test(id)) return null;
  const job = readJobs().find((entry) => entry.id === id);
  if (!job) return null;
  const current = withInterruption(job);
  if (current.status !== "done") return current;
  try {
    const stored = storedTranscript(resolveMedia({ ref: current.ref }));
    if (stored) return { ...current, words: stored.words, transcript: stored.transcript };
  } catch {
    // Média supprimé depuis : le travail reste lisible, sans mots.
  }
  return { ...current, status: "error", error: "La transcription de ce média n’est plus disponible." };
}

export function cancelTranscriptionJob(id: string): boolean {
  const controller = controllers.get(id);
  if (!controller) return false;
  controller.abort();
  return true;
}

function newJob(media: ResolvedMedia): TranscriptionJob {
  return {
    id: `tr-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    status: "running",
    ref: media.ref,
    name: media.name.slice(0, 200),
    stage: "extracting",
    createdAt: Date.now(),
  };
}

/**
 * Lance la transcription d’un média. Déjà transcrit (sans `force`) : le
 * travail est rendu terminé tout de suite. Une transcription du même média
 * déjà en cours est rendue telle quelle.
 */
export function startTranscriptionJob(request: TranscriptionRequest): TranscriptionJob {
  const media = resolveMedia(request);
  const language = typeof request.language === "string" && /^[a-z]{2}$/.test(request.language) ? request.language : undefined;

  const stored = storedTranscript(media);
  if (request.force && stored && Date.now() - (stored.transcript.at ?? 0) < RETRANSCRIBE_MIN_AGE_MS) {
    throw new TranscriptionError("Ce média a été transcrit il y a moins de 24 h : la transcription ne peut pas être refaite tout de suite. Réessayez demain.");
  }
  if (!request.force && stored) {
    const job: TranscriptionJob = { ...newJob(media), status: "done", stage: "done", wordCount: stored.words.length, finishedAt: Date.now() };
    save(job);
    return { ...job, words: stored.words, transcript: stored.transcript };
  }
  if (media.storage === "asset") {
    // Durée connue de la fiche : refus immédiat. La durée lue par ffmpeg reste contrôlée avant l’extraction.
    const durationMs = readAssets().find((entry) => entry.file === media.file)?.durationMs;
    assertTranscribableDuration(durationMs ? durationMs / 1000 : undefined);
  }
  const running = readJobs().find((entry) => entry.ref === media.ref && entry.status === "running" && controllers.has(entry.id));
  if (running) return running;
  if (controllers.size >= MAX_RUNNING_JOBS) {
    throw new TranscriptionError("Deux transcriptions sont déjà en cours : attendez qu’une se termine.");
  }

  const job = newJob(media);
  save(job);
  const abort = new AbortController();
  controllers.set(job.id, abort);
  void run(job, media, language, abort.signal).finally(() => controllers.delete(job.id));
  return job;
}

async function run(job: TranscriptionJob, media: ResolvedMedia, language: string | undefined, signal: AbortSignal) {
  const progress = (update: TranscribeProgress) => {
    if (update.stage === "extracting") job.stage = "extracting";
    else {
      job.stage = "transcribing";
      job.chunks = { done: update.done, total: update.total };
    }
    save(job);
  };
  try {
    const result = await transcribeMediaFile(media.path, { language, signal, onProgress: progress });
    job.stage = "saving";
    const transcript: TranscriptInfo = { provider: "openai", ...(result.language ? { language: result.language } : {}), at: Date.now() };
    storeTranscript(media, result.words, transcript);
    job.status = "done";
    job.stage = "done";
    job.wordCount = result.words.length;
  } catch (error) {
    if (signal.aborted) {
      job.status = "canceled";
      job.error = "Transcription annulée.";
    } else {
      job.status = "error";
      job.error = error instanceof TranscriptionError ? error.message : "Transcription impossible : réessayez.";
      if (!(error instanceof TranscriptionError)) {
        console.error("[clip-studio] transcription :", error instanceof Error ? error.message : "erreur inconnue");
      }
    }
  }
  job.finishedAt = Date.now();
  save(job);
}
