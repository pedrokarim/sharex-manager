/**
 * Transcription de la parole d’une vidéo ou d’un son (serveur seulement).
 *
 * Moteur : Whisper d’OpenAI (`whisper-1`), avec la clé des voix en ligne
 * (`data/secrets.json` ou `OPENAI_API_KEY`). Le son est extrait par ffmpeg,
 * mono 16 kHz en Opus à 32 kb/s : une heure tient en 15 Mo, loin de la limite
 * de 25 Mo de l’API. Au-delà, il est découpé en morceaux à bornes fixes, dont
 * les mots sont recalés sur l’instant de début de chaque morceau.
 *
 * Les mots de Whisper n’ont ni ponctuation ni majuscules : on les retrouve en
 * alignant les mots sur le texte des segments, pour des sous-titres qui se
 * lisent naturellement.
 *
 * Chaque appel est noté au registre des IA (`recordAiUsage`). La clé n’est
 * jamais journalisée ni renvoyée ; les messages d’erreur sont nettoyés.
 */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { spawn } from "child_process";
import type { TimedWord } from "../engine/types";
import { DATA_DIR } from "./store";
import { openAiApiKey } from "./cloud-tts";
import { ensureFfmpeg, parseVideoInfo } from "@/lib/media/ffmpeg";
import { childEnv } from "@/lib/child-env";
import { recordAiUsage, usageError } from "@/lib/ai-usage";
import { redactSecrets } from "@/lib/ai-usage/store";
import { holdWorkDir, stripServerPaths } from "./job-safety";

export const TRANSCRIPTION_MODEL = "whisper-1";
const ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
/** Limite de l’API : 25 Mo par fichier ; on garde une marge. */
export const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
const AUDIO_BITRATE = 32_000;
const EXTRACT_TIMEOUT_MS = 15 * 60 * 1000;
/** Délai d’une demande : deux minutes, plus une seconde par tranche de dix secondes de son. */
const requestTimeoutMs = (seconds: number) => Math.min(15 * 60 * 1000, 120_000 + Math.ceil(seconds / 10) * 1000);
/** Dossier de travail caché : jamais servi par la route des données, vidé par le ménage des six heures. */
const TEMP_ROOT = path.join(DATA_DIR, ".transcribe-tmp");
/**
 * Média le plus long transcrit : trois heures (une vidéo à découper en fait
 * deux au plus). Contrôlé sur la durée lue par ffmpeg avant d’extraire le son.
 */
export const MAX_TRANSCRIPTION_SECONDS = 3 * 60 * 60;

export interface TranscribeOptions {
  /** Langue parlée (ISO 639-1 : « fr », « en »…) ; absente : reconnue par Whisper. */
  language?: string;
  signal?: AbortSignal;
  /** Avancement : extraction du son, puis morceau `done` sur `total`. */
  onProgress?: (progress: TranscribeProgress) => void;
  /** Fonctionnalité notée au registre des IA. */
  feature?: string;
}

export type TranscribeProgress = { stage: "extracting" } | { stage: "transcribing"; done: number; total: number };

export interface TranscriptionResult {
  words: TimedWord[];
  /** Texte complet, ponctué. */
  text: string;
  /** Langue reconnue, en code ISO 639-1 quand il est connu. */
  language?: string;
  /** Durée du son transcrit, en secondes. */
  durationSec: number;
}

/** Erreur lisible à montrer telle quelle (sans secret). */
export class TranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptionError";
  }
}

const NO_KEY_MESSAGE = "Ajoutez une clé OpenAI dans « Voix en ligne » (réglages de Clip Studio) pour transcrire la parole.";

// ─── Ponctuation et majuscules ───────────────────────────────────

/** Clé de comparaison d’un mot : lettres et chiffres, en minuscules. */
export function wordKey(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

const OPENING = /^[«“‘(\[¿¡]+$/;

/**
 * Mots du texte, ponctuation comprise. Une ponctuation isolée par une espace
 * (« moi ! », « « Bonjour ») reste collée à son mot, par une espace insécable.
 */
export function textTokens(text: string): string[] {
  const tokens: string[] = [];
  let opening = "";
  for (const part of text.replace(/\s+/g, " ").trim().split(" ")) {
    if (!part) continue;
    if (!wordKey(part)) {
      if (OPENING.test(part) || tokens.length === 0) opening += `${part} `;
      else tokens[tokens.length - 1] += ` ${part}`;
      continue;
    }
    tokens.push(opening + part);
    opening = "";
  }
  if (opening && tokens.length) tokens[tokens.length - 1] += ` ${opening.trim()}`;
  return tokens;
}

/**
 * Rend aux mots de Whisper la ponctuation et les majuscules du texte des
 * segments. Les mots sont cherchés dans l’ordre, lettres seules comparées ;
 * plusieurs mots qui tombent dans un même mot du texte (« c' » + « est »)
 * sont fondus en un seul, de l’instant du premier à la fin du dernier. Un mot
 * introuvable garde son texte brut.
 */
export function punctuateWords(words: TimedWord[], text: string): TimedWord[] {
  const tokens = textTokens(text);
  if (tokens.length === 0) return words.filter((word) => wordKey(word.text));
  let stream = "";
  const owner: number[] = [];
  tokens.forEach((token, index) => {
    const key = wordKey(token);
    stream += key;
    for (let i = 0; i < key.length; i++) owner.push(index);
  });

  const result: TimedWord[] = [];
  let group: { first: number; last: number; startMs: number; endMs: number } | null = null;
  const flush = () => {
    if (!group) return;
    result.push({ text: tokens.slice(group.first, group.last + 1).join(" "), startMs: group.startMs, endMs: group.endMs });
    group = null;
  };

  let cursor = 0;
  for (const word of words) {
    const key = wordKey(word.text);
    if (!key) continue;
    // Fenêtre bornée : un mot absent du texte ne fait pas sauter tout le reste.
    const window = stream.slice(cursor, cursor + key.length + Math.max(40, key.length * 3));
    const found = window.indexOf(key);
    if (found < 0) {
      flush();
      result.push({ ...word, text: word.text.trim() });
      continue;
    }
    const at = cursor + found;
    const first = owner[at];
    const last = owner[at + key.length - 1];
    cursor = at + key.length;
    const current = group as { first: number; last: number; startMs: number; endMs: number } | null;
    if (current && first <= current.last) {
      current.last = Math.max(current.last, last);
      current.endMs = Math.max(current.endMs, word.endMs);
    } else {
      flush();
      group = { first, last, startMs: word.startMs, endMs: word.endMs };
    }
  }
  flush();
  return result;
}

// ─── Réponse de l’API ────────────────────────────────────────────

const LANGUAGE_CODES: Record<string, string> = {
  french: "fr",
  english: "en",
  spanish: "es",
  german: "de",
  italian: "it",
  portuguese: "pt",
  dutch: "nl",
  japanese: "ja",
  korean: "ko",
  chinese: "zh",
  russian: "ru",
  arabic: "ar",
  polish: "pl",
  turkish: "tr",
};

function languageCode(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const clean = value.trim().toLowerCase();
  if (/^[a-z]{2,3}$/.test(clean)) return clean;
  return LANGUAGE_CODES[clean] ?? clean.replace(/[^a-z -]/g, "").slice(0, 40);
}

const seconds = (value: unknown): number | null => {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number >= 0 ? number : null;
};

/** Instants arrondis à la milliseconde, la fin jamais avant le début. */
function timedWord(text: string, start: number, end: number): TimedWord {
  const startMs = Math.round(start * 1000);
  return { text: text.trim(), startMs, endMs: Math.max(startMs, Math.round(end * 1000)) };
}

/**
 * Mots horodatés d’une réponse `verbose_json` de Whisper, ponctués. Sans mots
 * (granularité refusée), ceux de chaque segment sont répartis sur sa durée.
 */
export function parseVerboseTranscription(data: unknown): TranscriptionResult {
  const body = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const segments = Array.isArray(body.segments) ? (body.segments as Record<string, unknown>[]) : [];
  const text = segments.length
    ? segments.map((segment) => String(segment?.text ?? "").trim()).filter(Boolean).join(" ")
    : String(body.text ?? "").trim();

  let raw: TimedWord[] = [];
  if (Array.isArray(body.words)) {
    for (const entry of body.words as Record<string, unknown>[]) {
      const start = seconds(entry?.start);
      const end = seconds(entry?.end);
      const word = typeof entry?.word === "string" ? entry.word : "";
      if (start === null || end === null || !word.trim()) continue;
      raw.push(timedWord(word, start, end));
    }
  }
  if (raw.length === 0) {
    for (const segment of segments) {
      const start = seconds(segment?.start);
      const end = seconds(segment?.end);
      const parts = String(segment?.text ?? "").trim().split(/\s+/).filter(Boolean);
      if (start === null || end === null || parts.length === 0) continue;
      const total = parts.reduce((sum, part) => sum + part.length, 0) || 1;
      let at = start;
      for (const part of parts) {
        const length = ((end - start) * part.length) / total;
        raw.push(timedWord(part, at, at + length));
        at += length;
      }
    }
  }
  raw = raw.sort((a, b) => a.startMs - b.startMs);
  const words = punctuateWords(raw, text);
  const lastEnd = words.length ? words[words.length - 1].endMs / 1000 : 0;
  return {
    words,
    text,
    ...(languageCode(body.language) ? { language: languageCode(body.language) } : {}),
    durationSec: seconds(body.duration) ?? lastEnd,
  };
}

/** Mots décalés de `offsetMs` : ceux d’un morceau, remis à leur place dans la source. */
export function shiftWords(words: TimedWord[], offsetMs: number): TimedWord[] {
  if (!offsetMs) return words;
  return words.map((word) => ({ ...word, startMs: word.startMs + offsetMs, endMs: word.endMs + offsetMs }));
}

// ─── Morceaux ────────────────────────────────────────────────────

export interface AudioChunk {
  /** Début dans la source, en secondes. */
  startSec: number;
  durationSec: number;
}

/**
 * Bornes des morceaux d’un son de `durationSec` secondes et `sizeBytes`
 * octets : un seul s’il tient dans la limite, sinon des morceaux de même
 * durée, chacun sous la limite avec une marge de 10 %.
 */
export function planChunks(durationSec: number, sizeBytes: number, limitBytes = MAX_UPLOAD_BYTES): AudioChunk[] {
  const total = Math.max(0, durationSec);
  if (sizeBytes <= limitBytes || total <= 0) return [{ startSec: 0, durationSec: total }];
  const count = Math.ceil(sizeBytes / (limitBytes * 0.9));
  const length = Math.ceil(total / count);
  const chunks: AudioChunk[] = [];
  for (let start = 0; start < total; start += length) {
    chunks.push({ startSec: start, durationSec: Math.min(length, total - start) });
  }
  return chunks;
}

// ─── ffmpeg ──────────────────────────────────────────────────────

function runFfmpeg(binary: string, args: string[], signal?: AbortSignal): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    // Sans shell : les chemins passent tels quels, rien n’est interprété.
    const child = spawn(binary, ["-nostdin", "-hide_banner", ...args], {
      env: childEnv(),
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-20_000);
    });
    const kill = () => child.kill("SIGKILL");
    const timer = setTimeout(kill, EXTRACT_TIMEOUT_MS);
    signal?.addEventListener("abort", kill, { once: true });
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", kill);
    };
    child.on("error", (error) => {
      done();
      reject(error);
    });
    child.on("close", (code) => {
      done();
      if (signal?.aborted) reject(abortError());
      else resolve({ code: code ?? 1, stderr });
    });
  });
}

function abortError(): Error {
  const error = new Error("Transcription annulée.");
  error.name = "AbortError";
  return error;
}

interface AudioFormat {
  extension: "ogg" | "mp3";
  mime: string;
  codec: string[];
}

const OPUS: AudioFormat = { extension: "ogg", mime: "audio/ogg", codec: ["-c:a", "libopus", "-b:a", "32k", "-application", "voip", "-f", "ogg"] };
const MP3: AudioFormat = { extension: "mp3", mime: "audio/mpeg", codec: ["-c:a", "libmp3lame", "-b:a", "32k", "-f", "mp3"] };

/** Son mono 16 kHz compressé, d’un passage de la source (ou de toute la source). */
async function extractAudio(
  binary: string,
  input: string,
  output: string,
  format: AudioFormat,
  chunk: AudioChunk | null,
  signal?: AbortSignal
): Promise<{ stderr: string }> {
  // Sans morceau, la durée reste bornée : un flux sans durée annoncée ne peut pas produire un son sans fin.
  const range = chunk ? ["-ss", chunk.startSec.toFixed(3), "-t", chunk.durationSec.toFixed(3)] : ["-t", String(MAX_TRANSCRIPTION_SECONDS + 1)];
  const result = await runFfmpeg(
    binary,
    ["-threads", "2", ...range, "-i", input, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", ...format.codec, "-y", output],
    signal
  );
  if (result.code !== 0 || !fs.existsSync(output) || fs.statSync(output).size === 0) {
    if (/matches no streams|does not contain any stream|Output file .* does not contain/i.test(result.stderr)) {
      throw new TranscriptionError("Ce média n’a pas de piste son : rien à transcrire.");
    }
    // La dernière ligne de ffmpeg peut citer le chemin du fichier : retiré du message, gardé dans les journaux.
    console.error("[clip-studio] extraction du son :", lastLine(result.stderr));
    const error = new TranscriptionError(`Extraction du son impossible. ${stripServerPaths(lastLine(result.stderr))}`.trim());
    (error as TranscriptionError & { encoderMissing?: boolean }).encoderMissing = /Unknown encoder|Encoder not found|encoder .* not found/i.test(result.stderr);
    throw error;
  }
  return { stderr: result.stderr };
}

function lastLine(stderr: string): string {
  return stderr.split("\n").map((line) => line.trim()).filter(Boolean).slice(-1).join("").slice(0, 200);
}

// ─── Appel de l’API ──────────────────────────────────────────────

/** Message d’une réponse en erreur, sans secret. */
async function apiError(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  let detail = "";
  let code = "";
  try {
    const parsed = JSON.parse(body);
    detail = String(parsed?.error?.message ?? parsed?.message ?? "");
    code = `${parsed?.error?.code ?? ""} ${parsed?.error?.type ?? ""}`;
  } catch {
    detail = body.slice(0, 200);
  }
  detail = redactSecrets(detail.replace(/\s+/g, " ").trim()).slice(0, 200);
  if (response.status === 401) return "Clé OpenAI refusée : vérifiez-la dans « Voix en ligne ».";
  if (response.status === 429 && /insufficient_quota|credit_balance|billing/.test(code)) {
    return "Crédit OpenAI épuisé : rechargez le compte OpenAI de la clé, puis relancez la transcription.";
  }
  if (response.status === 429) return "OpenAI refuse la demande (429) : trop de demandes à la fois. Réessayez dans un instant.";
  if (response.status === 413) return "Son trop lourd pour OpenAI (25 Mo au plus).";
  return `OpenAI n’a pas pu transcrire (HTTP ${response.status})${detail ? ` : ${detail}` : "."}`;
}

export interface RequestOptions {
  language?: string;
  signal?: AbortSignal;
  /** Durée du son envoyé, en secondes : délai de la demande et registre. */
  durationSec?: number;
  feature?: string;
}

/**
 * Envoie un son à Whisper et rend ses mots ponctués, en temps du son envoyé.
 * Note l’appel au registre des IA, réussi ou non.
 */
export async function requestTranscription(
  audio: Buffer,
  fileName: string,
  mime: string,
  key: string,
  options: RequestOptions = {}
): Promise<TranscriptionResult> {
  const feature = options.feature ?? "Transcription";
  const expected = options.durationSec ?? 0;
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), fileName);
  form.append("model", TRANSCRIPTION_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  const language = options.language && /^[a-z]{2}$/.test(options.language) ? options.language : undefined;
  if (language) form.append("language", language);

  const timeout = AbortSignal.timeout(requestTimeoutMs(expected));
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!response.ok) throw new TranscriptionError(await apiError(response));
    const result = parseVerboseTranscription(await response.json());
    recordAiUsage({
      provider: "openai",
      module: "clip-studio",
      feature,
      model: TRANSCRIPTION_MODEL,
      unit: "seconds",
      amount: result.durationSec || expected,
      ok: true,
    });
    return result;
  } catch (error) {
    recordAiUsage({ provider: "openai", module: "clip-studio", feature, model: TRANSCRIPTION_MODEL, unit: "seconds", amount: 0, ok: false, error: usageError(error) });
    if (error instanceof TranscriptionError) throw error;
    if (error instanceof SyntaxError) throw new TranscriptionError("Réponse illisible d’OpenAI : réessayez.");
    if (error instanceof Error && error.name === "AbortError" && options.signal?.aborted) throw abortError();
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new TranscriptionError("OpenAI n’a pas répondu à temps : réessayez.");
    }
    throw new TranscriptionError("OpenAI est injoignable : vérifiez la connexion du serveur, puis réessayez.");
  }
}

/**
 * Transcrit des morceaux déjà extraits, l’un après l’autre, et recale leurs
 * mots sur leur début dans la source.
 */
export async function transcribeChunks(
  chunks: { audio: Buffer; fileName: string; mime: string; chunk: AudioChunk }[],
  key: string,
  options: TranscribeOptions = {}
): Promise<TranscriptionResult> {
  const words: TimedWord[] = [];
  const texts: string[] = [];
  let language: string | undefined;
  let durationSec = 0;
  for (const [index, entry] of chunks.entries()) {
    options.onProgress?.({ stage: "transcribing", done: index, total: chunks.length });
    const result = await requestTranscription(entry.audio, entry.fileName, entry.mime, key, {
      language: options.language,
      signal: options.signal,
      durationSec: entry.chunk.durationSec,
      feature: options.feature,
    });
    words.push(...shiftWords(result.words, Math.round(entry.chunk.startSec * 1000)));
    if (result.text) texts.push(result.text);
    language ??= result.language;
    durationSec = Math.max(durationSec, entry.chunk.startSec + (result.durationSec || entry.chunk.durationSec));
  }
  options.onProgress?.({ stage: "transcribing", done: chunks.length, total: chunks.length });
  return { words, text: texts.join(" "), ...(language ? { language } : {}), durationSec };
}

// ─── Point d’entrée ──────────────────────────────────────────────

/**
 * Transcrit la parole d’un fichier vidéo ou audio du serveur. Rend les mots
 * en millisecondes de la source. Sert au bouton « Transcrire et sous-titrer »
 * et aux créations à partir d’une vidéo.
 */
export async function transcribeMediaFile(input: string, options: TranscribeOptions = {}): Promise<TranscriptionResult> {
  const key = openAiApiKey();
  if (!key) throw new TranscriptionError(NO_KEY_MESSAGE);
  if (!fs.existsSync(input)) throw new TranscriptionError("Fichier introuvable.");
  const binary = await ensureFfmpeg();
  if (!binary) throw new TranscriptionError("ffmpeg n’est pas disponible pour extraire le son : réessayez dans un instant.");

  // Durée lue avant toute extraction : un média trop long est refusé sans rien envoyer.
  const probedSec = await probeDurationSec(binary, input, options.signal);
  assertTranscribableDuration(probedSec);

  const workDir = path.join(TEMP_ROOT, `transcribe-${randomBytes(6).toString("hex")}`);
  const releaseWorkDir = holdWorkDir(workDir);
  fs.mkdirSync(workDir, { recursive: true });
  try {
    options.onProgress?.({ stage: "extracting" });
    let format = OPUS;
    let whole = path.join(workDir, `audio.${format.extension}`);
    let extracted: { stderr: string };
    try {
      extracted = await extractAudio(binary, input, whole, format, null, options.signal);
    } catch (error) {
      if (!(error as { encoderMissing?: boolean }).encoderMissing) throw error;
      // ffmpeg sans Opus : MP3 au même débit.
      format = MP3;
      whole = path.join(workDir, `audio.${format.extension}`);
      extracted = await extractAudio(binary, input, whole, format, null, options.signal);
    }

    const size = fs.statSync(whole).size;
    const knownMs = parseVideoInfo(extracted.stderr).durationMs;
    // Durée inconnue (flux sans en-tête) : estimée d’après le débit.
    const durationSec = knownMs ? knownMs / 1000 : (size * 8) / AUDIO_BITRATE;
    // Durée inconnue avant l’extraction : le son extrait (borné) dit si le média dépasse la limite.
    if (probedSec === undefined && durationSec >= MAX_TRANSCRIPTION_SECONDS) assertTranscribableDuration(durationSec + 1);
    const plan = planChunks(durationSec, size);

    const chunks: { audio: Buffer; fileName: string; mime: string; chunk: AudioChunk }[] = [];
    if (plan.length === 1) {
      chunks.push({ audio: fs.readFileSync(whole), fileName: path.basename(whole), mime: format.mime, chunk: plan[0] });
    } else {
      for (const [index, chunk] of plan.entries()) {
        const file = path.join(workDir, `part-${index}.${format.extension}`);
        await extractAudio(binary, input, file, format, chunk, options.signal);
        chunks.push({ audio: fs.readFileSync(file), fileName: path.basename(file), mime: format.mime, chunk });
        fs.rmSync(file, { force: true });
      }
    }
    fs.rmSync(whole, { force: true });
    return await transcribeChunks(chunks, key, options);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
    releaseWorkDir();
  }
}

/** Refuse un média plus long que `MAX_TRANSCRIPTION_SECONDS`. */
export function assertTranscribableDuration(seconds: number | undefined, max = MAX_TRANSCRIPTION_SECONDS): void {
  if (seconds !== undefined && seconds > max) {
    const hours = Math.round(max / 360) / 10;
    throw new TranscriptionError(
      `Ce média dure plus de ${String(hours).replace(".", ",")} h : il ne peut pas être transcrit. Coupez-en un passage plus court, puis transcrivez-le.`
    );
  }
}

/** Durée d’un média, lue par ffmpeg sans rien décoder (`ffmpeg -i`) ; `undefined` si elle n’est pas annoncée. */
async function probeDurationSec(binary: string, input: string, signal?: AbortSignal): Promise<number | undefined> {
  // Sans fichier de sortie, ffmpeg s’arrête en erreur après avoir décrit l’entrée : c’est voulu.
  const result = await runFfmpeg(binary, ["-i", input], signal);
  const ms = parseVideoInfo(result.stderr).durationMs;
  return ms ? ms / 1000 : undefined;
}
