/**
 * Transcription sur le serveur avec whisper.cpp (serveur seulement) : le
 * moteur gratuit de Clip Studio, sans clé ni compte.
 *
 * Le son est extrait par ffmpeg (WAV mono 16 kHz), puis `whisper-cli` le lit
 * avec le modèle épinglé (`src/lib/media/whisper-cpp.ts`) et écrit un JSON
 * complet : chaque jeton avec son instant aligné par DTW. Les jetons sont
 * réunis en mots (un jeton qui commence par une espace ouvre un mot), la
 * ponctuation reste collée à son mot.
 *
 * Instants : l'alignement DTW place le début d'un jeton un peu après le vrai
 * début du mot (mesuré : +205 ms en médiane, de +135 à +285 ms, sur une prise
 * française dont les instants étaient connus) ; il est avancé de 150 ms. La
 * fin d'un mot est le début du suivant, ou une durée estimée d'après sa
 * longueur avant un silence.
 *
 * Programmes lancés sans shell, arbre de processus tué à l'annulation,
 * délais bornés, dossier de travail caché vidé à la fin. Chaque transcription
 * est notée au registre des services (`whisper-local`, gratuit).
 */

import fs from "fs";
import os from "os";
import path from "path";
import { randomBytes } from "crypto";
import { spawn } from "child_process";
import type { TimedWord } from "../engine/types";
import { DATA_DIR } from "./store";
import { holdWorkDir, stripServerPaths } from "./job-safety";
import { TranscriptionError, type TranscribeOptions, type TranscriptionResult } from "./transcription-types";
import { childEnv } from "@/lib/child-env";
import { ensureFfmpeg, parseVideoInfo } from "@/lib/media/ffmpeg";
import { killProcessTree, treeSpawnOptions } from "@/lib/media/process-tree";
import { ensureWhisperCpp, whisperCppStatus, whisperCppSupported, WHISPER_MODEL } from "@/lib/media/whisper-cpp";
import { recordAiUsage, usageError } from "@/lib/ai-usage";

/** Dossier de travail : le même que la transcription en ligne, vidé par le ménage des six heures. */
const TEMP_ROOT = path.join(DATA_DIR, ".transcribe-tmp");
/** Avance appliquée aux débuts de mots alignés par DTW (voir l'en-tête). */
export const DTW_LEAD_MS = 150;
const EXTRACT_TIMEOUT_MS = 15 * 60 * 1000;
/** Délai d'une transcription : cinq minutes, plus trois fois la durée du son (un serveur lent tient le tiers du temps réel). */
export const localTimeoutMs = (seconds: number) => 5 * 60 * 1000 + Math.ceil(seconds * 3) * 1000;

/**
 * Consigne qui garde les hésitations : Whisper écrit ce qu'il a entendu
 * plutôt que de lisser une reprise. Une phrase par langue, écrite ici.
 */
export const VERBATIM_HINTS: Record<string, string> = {
  fr: "Bon, euh… alors je, je voulais, euh, je voulais vous montrer ça.",
  en: "So, um… I, I wanted, uh, I wanted to show you this.",
  es: "Bueno, eh… yo, yo quería, eh, yo quería enseñaros esto.",
  de: "Also, äh… ich, ich wollte, äh, ich wollte euch das zeigen.",
  it: "Allora, ehm… io, io volevo, ehm, io volevo mostrarvi questo.",
  pt: "Então, hum… eu, eu queria, hum, eu queria mostrar isso.",
};

/** Fils de calcul : un cœur laissé au serveur, quatre au plus. */
export function localThreads(cpus = os.cpus().length): number {
  return Math.max(1, Math.min(4, cpus - 1));
}

// ─── Lecture du JSON de whisper-cli ─────────────────────────────

interface RawToken {
  text?: unknown;
  offsets?: { from?: unknown; to?: unknown };
  t_dtw?: unknown;
}

interface RawSegment {
  offsets?: { from?: unknown; to?: unknown };
  text?: unknown;
  tokens?: RawToken[];
}

const finite = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** Jeton spécial de Whisper (`[_BEG_]`, `[_TT_150]`…), jamais un mot. */
const SPECIAL = /^\[_[A-Z]+_?\d*\]$/;
/** Lettres ou chiffres : un « mot » sans aucun n'est qu'une ponctuation. */
const hasLetters = (text: string) => /[\p{L}\p{N}]/u.test(text);
const OPENING = /^[«“‘(\[¿¡]+$/;
/** Annotation entre crochets ou parenthèses (« [Musique] », « (rires) ») : pas une parole. */
const ANNOTATION = /^[[(].*[\])]$/;

/** Durée estimée d'un mot qui précède un silence : 60 ms par lettre, de 120 à 700 ms. */
export function estimatedWordMs(text: string): number {
  const letters = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  return Math.max(120, Math.min(700, letters * 60));
}

/**
 * Mots horodatés d'une sortie `-ojf` de whisper-cli. Début : instant DTW
 * avancé de `leadMs` (sinon le début du jeton) ; fin : début du mot suivant
 * dans le même segment, sinon une durée estimée, bornée au segment. Les
 * instants ne reculent jamais.
 */
export function parseWhisperCppJson(data: unknown, leadMs = DTW_LEAD_MS): { words: TimedWord[]; text: string; language?: string } {
  const body = (data && typeof data === "object" ? data : {}) as { transcription?: RawSegment[]; result?: { language?: unknown } };
  const segments = Array.isArray(body.transcription) ? body.transcription : [];
  type Draft = { text: string; startMs: number; segment: number; segmentEnd: number };
  const drafts: Draft[] = [];
  segments.forEach((segment, segmentIndex) => {
    const segmentEnd = finite(segment?.offsets?.to) ?? Number.MAX_SAFE_INTEGER;
    for (const token of Array.isArray(segment?.tokens) ? segment.tokens : []) {
      const text = typeof token?.text === "string" ? token.text : "";
      if (!text.trim() || SPECIAL.test(text.trim())) continue;
      const dtw = finite(token.t_dtw);
      const from = finite(token.offsets?.from) ?? 0;
      const startMs = dtw !== null && dtw >= 0 ? Math.max(0, dtw * 10 - leadMs) : from;
      const last = drafts[drafts.length - 1];
      if (last && last.segment === segmentIndex && !/^\s/.test(text)) {
        last.text += text;
        continue;
      }
      drafts.push({ text: text.trim(), startMs: Math.round(startMs), segment: segmentIndex, segmentEnd });
    }
  });

  // Ponctuation isolée (« ! », « « ») collée à son mot ; annotations écartées.
  const merged: Draft[] = [];
  let opening = "";
  for (const draft of drafts) {
    if (ANNOTATION.test(draft.text)) continue;
    if (!hasLetters(draft.text)) {
      if (OPENING.test(draft.text)) opening += `${draft.text} `;
      else if (merged.length) merged[merged.length - 1].text += /^[!?:;»]/.test(draft.text) ? ` ${draft.text}` : draft.text;
      continue;
    }
    // Apostrophe droite entre deux lettres : l’apostrophe typographique, comme dans un texte soigné.
    merged.push({ ...draft, text: opening + draft.text.replace(/(?<=\p{L})'(?=\p{L})/gu, "\u2019") });
    opening = "";
  }

  const words: TimedWord[] = [];
  merged.forEach((draft, index) => {
    const previous = words[words.length - 1];
    const startMs = Math.max(draft.startMs, previous ? previous.startMs + 20 : 0);
    const next = merged[index + 1];
    const estimate = estimatedWordMs(draft.text);
    // Parole continue : jusqu'au mot suivant, sans enjamber une pause (deux fois la durée estimée au plus).
    let endMs = next && next.segment === draft.segment ? Math.min(next.startMs, startMs + estimate * 2 + 150) : Math.min(startMs + estimate, draft.segmentEnd);
    if (next) endMs = Math.min(endMs, next.startMs);
    if (previous && previous.endMs > startMs) previous.endMs = Math.max(previous.startMs + 20, startMs);
    words.push({ text: draft.text, startMs, endMs: Math.max(startMs + 40, Math.round(endMs)) });
  });

  const text = segments
    .map((segment) => (typeof segment?.text === "string" ? segment.text.trim() : ""))
    .filter(Boolean)
    .join(" ");
  const language = typeof body.result?.language === "string" && /^[a-z]{2,3}$/.test(body.result.language) ? body.result.language : undefined;
  return { words, text, ...(language ? { language } : {}) };
}

/** Langue reconnue dans la sortie d'erreur de whisper-cli (« auto-detected language: fr »). */
export function detectedLanguage(stderr: string): string | undefined {
  const match = /auto-detected language:\s*([a-z]{2,3})\b/.exec(stderr);
  return match?.[1];
}

/** Arguments de whisper-cli : pas d'interpréteur, chaque valeur dans sa propre case. */
export function whisperArgs(input: { model: string; wav: string; outBase: string; language?: string; threads: number; verbatim?: boolean; detectOnly?: boolean }): string[] {
  const language = input.language && /^[a-z]{2}$/.test(input.language) ? input.language : "auto";
  if (input.detectOnly) return ["-m", input.model, "-f", input.wav, "-l", "auto", "-dl", "-t", String(input.threads)];
  const args = [
    "-m", input.model,
    "-f", input.wav,
    "-l", language,
    "-t", String(input.threads),
    "-ojf",
    "-of", input.outBase,
    "-pp",
    // Instants alignés par DTW : incompatible avec l'attention « flash ».
    "-dtw", WHISPER_MODEL.dtw,
    "-nfa",
  ];
  const hint = input.verbatim ? VERBATIM_HINTS[language] : undefined;
  if (hint) args.push("--prompt", hint);
  return args;
}

// ─── Programmes ──────────────────────────────────────────────────

interface RunResult {
  code: number;
  stderr: string;
}

function abortError(): Error {
  const error = new Error("Transcription annulée.");
  error.name = "AbortError";
  return error;
}

/** Lance un programme sans shell ; tout son arbre est tué à l'annulation ou au délai. */
function run(binary: string, args: string[], options: { signal?: AbortSignal; timeoutMs: number; onStderr?: (chunk: string) => void; tree?: boolean }): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) return reject(abortError());
    const child = spawn(binary, args, {
      env: childEnv(),
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
      shell: false,
      ...(options.tree ? treeSpawnOptions() : {}),
    });
    let stderr = "";
    let timedOut = false;
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr = (stderr + text).slice(-20_000);
      options.onStderr?.(text);
    });
    const kill = () => (options.tree ? killProcessTree(child) : child.kill("SIGKILL"));
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, options.timeoutMs);
    options.signal?.addEventListener("abort", kill, { once: true });
    const done = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", kill);
    };
    child.on("error", (error) => {
      done();
      reject(error);
    });
    child.on("close", (code) => {
      done();
      if (options.signal?.aborted) reject(abortError());
      else if (timedOut) reject(new TranscriptionError("La transcription locale a dépassé son délai : essayez un passage plus court."));
      else resolve({ code: code ?? 1, stderr });
    });
  });
}

const lastLine = (stderr: string) => stderr.split("\n").map((line) => line.trim()).filter(Boolean).slice(-1).join("").slice(0, 200);

/** Durée d'un média lue par ffmpeg sans rien décoder ; `undefined` si elle n'est pas annoncée. */
async function probeSeconds(ffmpeg: string, input: string, signal?: AbortSignal): Promise<number | undefined> {
  const result = await run(ffmpeg, ["-nostdin", "-hide_banner", "-i", input], { signal, timeoutMs: 60_000 });
  const ms = parseVideoInfo(result.stderr).durationMs;
  return ms ? ms / 1000 : undefined;
}

/**
 * Transcrit un fichier vidéo ou audio du serveur avec whisper.cpp. Le moteur
 * et son modèle sont téléchargés au premier usage (200 Mo, une seule fois).
 * `maxSeconds` : durée au plus (contrôlée avant d'extraire le son).
 */
export async function transcribeLocalFile(
  input: string,
  options: TranscribeOptions & { maxSeconds: number; assertDuration: (seconds: number | undefined) => void }
): Promise<TranscriptionResult> {
  const feature = options.feature ?? "Transcription";
  if (!whisperCppSupported()) throw new TranscriptionError("La transcription locale n’existe que sur un serveur Linux ou Windows 64 bits.");
  if (!fs.existsSync(input)) throw new TranscriptionError("Fichier introuvable.");
  const ffmpeg = await ensureFfmpeg();
  if (!ffmpeg) throw new TranscriptionError("ffmpeg n’est pas disponible pour extraire le son : réessayez dans un instant.");
  const probed = await probeSeconds(ffmpeg, input, options.signal);
  options.assertDuration(probed);

  // Premier usage : moteur et modèle téléchargés, avancement relu toutes les secondes.
  let engine = whisperCppStatus().ready ? null : setInterval(() => {
    const status = whisperCppStatus();
    options.onProgress?.({ stage: "downloading", engine: "local", received: status.received, total: Math.max(status.received, status.downloadBytes) });
  }, 1000);
  const paths = await ensureWhisperCpp().finally(() => {
    if (engine) clearInterval(engine);
    engine = null;
  });
  if (!paths) {
    const reason = whisperCppStatus().lastError;
    throw new TranscriptionError(`Le moteur de transcription local n’a pas pu être installé${reason ? ` (${stripServerPaths(reason)})` : ""} : réessayez dans un moment.`);
  }
  if (options.signal?.aborted) throw abortError();

  const workDir = path.join(TEMP_ROOT, `local-${randomBytes(6).toString("hex")}`);
  const release = holdWorkDir(workDir);
  fs.mkdirSync(workDir, { recursive: true });
  const started = Date.now();
  let seconds = probed ?? 0;
  try {
    options.onProgress?.({ stage: "extracting", engine: "local" });
    const wav = path.join(workDir, "audio.wav");
    const extracted = await run(
      ffmpeg,
      ["-nostdin", "-hide_banner", "-threads", "2", "-t", String(options.maxSeconds + 1), "-i", input, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-y", wav],
      { signal: options.signal, timeoutMs: EXTRACT_TIMEOUT_MS }
    );
    if (extracted.code !== 0 || !fs.existsSync(wav) || fs.statSync(wav).size <= 44) {
      if (/matches no streams|does not contain any stream|Output file .* does not contain/i.test(extracted.stderr)) {
        throw new TranscriptionError("Ce média n’a pas de piste son : rien à transcrire.");
      }
      console.error("[clip-studio] extraction du son (local) :", lastLine(extracted.stderr));
      throw new TranscriptionError(`Extraction du son impossible. ${stripServerPaths(lastLine(extracted.stderr))}`.trim());
    }
    // WAV PCM 16 bits mono à 16 kHz : 32 000 octets par seconde après l'en-tête.
    seconds = (fs.statSync(wav).size - 44) / 32_000;
    if (probed === undefined) options.assertDuration(seconds > options.maxSeconds ? seconds + 1 : seconds);

    const threads = localThreads();
    let language = options.language && /^[a-z]{2}$/.test(options.language) ? options.language : undefined;
    // Mot pour mot sans langue donnée : la langue d'abord (une fenêtre de 30 s), pour choisir la consigne.
    if (options.verbatim && !language) {
      const detection = await run(paths.binary, whisperArgs({ model: paths.model, wav, outBase: "", threads, detectOnly: true }), { signal: options.signal, timeoutMs: 5 * 60 * 1000, tree: true });
      language = detectedLanguage(detection.stderr);
    }
    const outBase = path.join(workDir, "out");
    options.onProgress?.({ stage: "transcribing", done: 0, total: 100, engine: "local" });
    const result = await run(paths.binary, whisperArgs({ model: paths.model, wav, outBase, language, threads, verbatim: options.verbatim }), {
      signal: options.signal,
      timeoutMs: localTimeoutMs(seconds),
      tree: true,
      onStderr: (chunk) => {
        const matches = [...chunk.matchAll(/progress\s*=\s*(\d+)\s*%/g)];
        const percent = matches.length ? Number(matches[matches.length - 1][1]) : null;
        if (percent !== null) options.onProgress?.({ stage: "transcribing", done: Math.min(100, percent), total: 100, engine: "local" });
      },
    });
    const jsonFile = `${outBase}.json`;
    if (result.code !== 0 || !fs.existsSync(jsonFile)) {
      console.error("[clip-studio] whisper.cpp :", lastLine(result.stderr));
      throw new TranscriptionError(`La transcription locale a échoué. ${stripServerPaths(lastLine(result.stderr))}`.trim());
    }
    const parsed = parseWhisperCppJson(JSON.parse(fs.readFileSync(jsonFile, "utf-8")));
    recordAiUsage({
      provider: "whisper-local",
      module: "clip-studio",
      feature,
      model: WHISPER_MODEL.file.replace(/\.bin$/, ""),
      unit: "seconds",
      amount: Math.round(seconds * 10) / 10,
      ok: true,
      durationMs: Date.now() - started,
    });
    return {
      words: parsed.words,
      text: parsed.text,
      ...(parsed.language || language ? { language: parsed.language ?? language } : {}),
      durationSec: seconds,
      provider: "local",
    };
  } catch (error) {
    if (!options.signal?.aborted) {
      recordAiUsage({ provider: "whisper-local", module: "clip-studio", feature, model: WHISPER_MODEL.file.replace(/\.bin$/, ""), unit: "seconds", amount: 0, ok: false, error: usageError(error), durationMs: Date.now() - started });
    }
    if (error instanceof TranscriptionError || (error instanceof Error && error.name === "AbortError")) throw error;
    if (error instanceof SyntaxError) throw new TranscriptionError("Réponse illisible du moteur local : réessayez.");
    console.error("[clip-studio] transcription locale :", error instanceof Error ? error.message : error);
    throw new TranscriptionError("La transcription locale a échoué : réessayez.");
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
    release();
  }
}
