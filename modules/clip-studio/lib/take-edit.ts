/**
 * « Monter ma prise » (dossier 01, V6), côté serveur : une ou plusieurs
 * prises brutes d'une personne qui parle face caméra deviennent un short
 * monté, prêt à retoucher.
 *
 * 1. **Récupération** : une adresse (V2), une vidéo de Mes médias ou un
 *    fichier envoyé, pour chaque prise.
 * 2. **Transcription mot pour mot** (V3, moteur local gratuit ou OpenAI) :
 *    hésitations et reprises gardées, pour les voir.
 * 3. **Coupe** (`engine/take-cut.ts`) : blancs, respirations, faux départs et
 *    reprises. Avec une vitesse autre que 1, la prise entière est réencodée
 *    accélérée (son sans changement de hauteur, `atempo`) en un nouveau
 *    média : le montage reste éditable, et la voix garde son timbre.
 * 4. **Plan des temps forts** (`engine/take-plan.ts`) par Codex.
 * 5. **Visuels** : le logo officiel de chaque outil nommé (recherche web
 *    reconnue par Codex, jamais un sosie : sinon son nom en grand), le
 *    visage repéré dans la prise pour le cadrage.
 * 6. **Montage** (`engine/take-templates.ts`) : planches, caméra, sous-titres,
 *    marque, musique choisie d'après l'émotion de l'accroche et effacée sous
 *    la voix, bruitages sur les vrais temps forts. Le projet est enregistré.
 *
 * Suivi comme les autres travaux : `data/take-jobs.json`, étapes, annulable,
 * un à la fois (la transcription locale occupe le processeur). Fichiers de
 * travail dans un dossier caché, vidé à la fin.
 */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { spawn } from "child_process";
import { childEnv } from "@/lib/child-env";
import { ensureFfmpeg } from "@/lib/media/ffmpeg";
import type { BrandTheme } from "../engine/brand";
import { createMusicItems, uid } from "../engine/edit";
import { DEFAULT_DUCK } from "../engine/mix";
import { projectDuration } from "../engine/timeline";
import {
  cleanTakeSpeed,
  cutTake,
  droppedWords,
  editDecisionList,
  energyFrames,
  rebaseWords,
  type KeptSegment,
  type Range,
  type SilenceMode,
} from "../engine/take-cut";
import { beatPlanPrompt, readBeatPlan, type TakeLayout, type TakePlan } from "../engine/take-plan";
import { buildTakeProject, takeBeatSounds, type TakeSource } from "../engine/take-templates";
import { ASPECTS, type AspectPreset, type ClipAsset, type ClipProject, type MediaSource, type TimedWord, type Track } from "../engine/types";
import { assetSource, clipDeps, transcriptionDetail, type ClipSource } from "./clip-jobs";
import { extractJson } from "./codex";
import { findOfficialLogo, findPlanLogos, recentMontages } from "./board-montage";
import { assertDiskSpace, holdWorkDir, publicErrorMessage } from "./job-safety";
import { pickTrack } from "./music";
import { inspect, runFfmpeg, type MediaStreams } from "./remote-import";
import { ASSETS_DIR, DATA_DIR, ensureDirs, listProjectFiles, readAssets, writeAssets, writeProject } from "./store";
import { detectFace, type FaceFocus } from "./take-face";
import { TranscriptionError } from "./transcription-types";
import { resolveMedia, storedTranscript, storeTranscript } from "./transcription-jobs";

const JOBS_FILE = path.join(DATA_DIR, "take-jobs.json");
/** Dossier de travail : caché (jamais servi), vidé par le ménage des six heures. */
const WORK_DIR = path.join(DATA_DIR, ".clip-tmp");
const KEPT_JOBS = 20;
const JOB_ID = /^tjob-[a-z0-9]{6,40}$/;
const KIT_ID = /^kit-[a-z0-9]{6,32}$/;
/** Prises par montage, et durée cumulée au plus (une prise de parole, pas un film). */
export const TAKE_LIMITS = { maxSources: 5, maxSeconds: 20 * 60 } as const;
/** Musique sous la voix : volume entre les phrases, et creux pendant qu'elle parle (comme l'assistant, D3). */
const MUSIC_VOLUME = 0.28;

type StepId = "import" | "transcribe" | "cut" | "plan" | "visuals" | "montage";
type StepState = "pending" | "running" | "done" | "error" | "skipped";

export interface TakeEditRequest {
  sources: ClipSource[];
  aspect: AspectPreset;
  brandKitId?: string;
  /** Vitesse du montage (1 à 1,3). */
  speed: number;
  /** Couper les faux départs et les reprises. */
  removeRetakes: boolean;
  silence: SilenceMode;
  /** Musique de fond choisie d'après l'émotion de l'accroche. */
  music: boolean;
}

/** Ce qui a été fait, pour le dire à la fin du travail. */
export interface TakeReport {
  sourceMs: number;
  editMs: number;
  silenceMs: number;
  retakeMs: number;
  retakes: { text: string; reason: string }[];
  segments: number;
  beats: { atMs: number; layout: TakeLayout; board?: string; text?: string }[];
  engines: string[];
  faces: boolean[];
  logos: { name: string; found: boolean }[];
  music?: string;
  hook?: string;
}

export interface TakeEditJob {
  id: string;
  status: "running" | "done" | "error" | "canceled";
  request: TakeEditRequest;
  steps: { id: StepId; label: string; state: StepState; detail?: string }[];
  title?: string;
  projectId?: string;
  report?: TakeReport;
  error?: string;
  createdAt: number;
  finishedAt?: number;
}

// ─── Dépendances (remplaçables dans les tests) ───────────────────

export const takeDeps = {
  loadTheme: (kitId: string): Promise<BrandTheme | null> => clipDeps.loadTheme(kitId),
  /**
   * Enchaînements des derniers montages de prise (de la même marque quand il
   * y en a une), du plus récent au plus ancien : Codex ne refait ni la même
   * ouverture ni la même suite.
   */
  recentMontages: (brandKitId: string | undefined): string[] => recentMontages(brandKitId),
  /** Codex : le plan des temps forts. */
  ask(prompt: string, signal: AbortSignal): Promise<string> {
    return clipDeps.ask(prompt, signal);
  },
  transcribe: (...args: Parameters<typeof clipDeps.transcribe>) => clipDeps.transcribe(...args),
  startImport: (...args: Parameters<typeof clipDeps.startImport>) => clipDeps.startImport(...args),
  getImport: (...args: Parameters<typeof clipDeps.getImport>) => clipDeps.getImport(...args),
  cancelImport: (...args: Parameters<typeof clipDeps.cancelImport>) => clipDeps.cancelImport(...args),
  /** Énergie du son par tranches de 10 ms, décodée au fil de l'eau (jamais tout le son en mémoire). */
  energy: decodeEnergy,
  face: async (file: string, asset: ClipAsset, signal: AbortSignal): Promise<FaceFocus | null> => {
    const ffmpeg = await ensureFfmpeg();
    return ffmpeg ? detectFace(ffmpeg, file, asset, signal) : null;
  },
  /** Prise entière accélérée, son sans changement de hauteur. */
  stretch: stretchTake,
  /** Logo officiel d'un outil nommé, ou `null` : jamais un sosie. */
  logo: (name: string, text: string, signal: AbortSignal): Promise<MediaSource | null> => findOfficialLogo(name, text, signal),
  music(mood: string, minMs: number): MediaSource | null {
    const track = pickTrack(mood, minMs);
    if (!track?.url) return null;
    return { url: track.url, ref: `module:clip-studio/resources/music/${track.id}.mp3`, name: `${track.title} – ${track.artist}`, kind: "audio", durationMs: track.durationMs, credit: track.credit };
  },
};

// ─── Rangement des travaux ───────────────────────────────────────

const controllers = ((globalThis as any).__sxmTakeJobs ??= new Map<string, AbortController>()) as Map<string, AbortController>;

function readJobs(): TakeEditJob[] {
  try {
    const jobs = JSON.parse(fs.readFileSync(JOBS_FILE, "utf-8"));
    return Array.isArray(jobs) ? (jobs as TakeEditJob[]) : [];
  } catch {
    return [];
  }
}

function save(job: TakeEditJob) {
  ensureDirs();
  const jobs = [job, ...readJobs().filter((entry) => entry.id !== job.id)].slice(0, KEPT_JOBS);
  const temporary = `${JOBS_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(jobs, null, 2));
  fs.renameSync(temporary, JOBS_FILE);
}

export function getTakeEditJob(id: unknown): TakeEditJob | null {
  if (typeof id !== "string" || !JOB_ID.test(id)) return null;
  const job = readJobs().find((entry) => entry.id === id);
  if (!job) return null;
  return job.status === "running" && !controllers.has(job.id) ? { ...job, status: "error", error: "Interrompu par un redémarrage du serveur : relancez le montage." } : job;
}

export function cancelTakeEditJob(id: unknown): boolean {
  const job = getTakeEditJob(id);
  const controller = job ? controllers.get(job.id) : undefined;
  if (!job || !controller) return false;
  controller.abort();
  return true;
}

// ─── Demande ─────────────────────────────────────────────────────

function plainFile(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,120}$/i.test(value) && !value.includes("..");
}

function cleanSource(raw: unknown): ClipSource {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (typeof input.url === "string" && input.url.trim()) {
    const at = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined);
    return { type: "url", url: input.url.trim().slice(0, 2000), ...(at(input.start) !== undefined ? { start: at(input.start) } : {}), ...(at(input.end) !== undefined ? { end: at(input.end) } : {}) };
  }
  const file = input.assetFile ?? input.file;
  if (plainFile(file)) return { type: "asset", file, ...(input.uploaded === true ? { uploaded: true } : {}) };
  throw new Error("Choisissez une prise : une adresse, une vidéo de Mes médias ou un fichier envoyé.");
}

export function cleanTakeRequest(raw: unknown): TakeEditRequest {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sources = (Array.isArray(input.sources) ? input.sources : []).map(cleanSource);
  if (sources.length === 0) throw new Error("Ajoutez au moins une prise.");
  if (sources.length > TAKE_LIMITS.maxSources) throw new Error(`${TAKE_LIMITS.maxSources} prises au plus par montage.`);
  const aspect = (Object.keys(ASPECTS) as AspectPreset[]).includes(input.aspect as AspectPreset) ? (input.aspect as AspectPreset) : "9:16";
  const silence: SilenceMode = input.silence === "soft" || input.silence === "tight" ? input.silence : "normal";
  return {
    sources,
    aspect,
    ...(typeof input.brandKitId === "string" && KIT_ID.test(input.brandKitId) ? { brandKitId: input.brandKitId } : {}),
    speed: cleanTakeSpeed(input.speed),
    removeRetakes: input.removeRetakes !== false,
    silence,
    music: input.music !== false,
  };
}

const STEP_LABELS: Record<StepId, string> = {
  import: "Récupération des prises",
  transcribe: "Transcription mot pour mot",
  cut: "Coupe des blancs et des reprises",
  plan: "Plan des temps forts",
  visuals: "Logos et cadrage",
  montage: "Montage",
};

function newJob(request: TakeEditRequest): TakeEditJob {
  const fromUrl = request.sources.some((source) => source.type === "url");
  return {
    id: `tjob-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`,
    status: "running",
    request,
    steps: (Object.keys(STEP_LABELS) as StepId[]).map((id) => ({
      id,
      label: STEP_LABELS[id],
      state: id === "import" && !fromUrl ? "skipped" : "pending",
      ...(id === "import" && !fromUrl ? { detail: "Prises déjà dans Clip Studio" } : {}),
    })),
    createdAt: Date.now(),
  };
}

/** Lance « Monter ma prise ». Suivi par `getTakeEditJob`. */
export function startTakeEdit(raw: unknown): TakeEditJob {
  if (controllers.size >= 1) throw new Error("Un montage de prise est déjà en cours : attendez qu’il se termine.");
  const job = newJob(cleanTakeRequest(raw));
  const controller = new AbortController();
  controllers.set(job.id, controller);
  save(job);
  void runTakeEdit(job, controller.signal).finally(() => controllers.delete(job.id));
  return job;
}

// ─── Étapes ──────────────────────────────────────────────────────

function abortError(): Error {
  const error = new Error("Montage annulé.");
  error.name = "AbortError";
  return error;
}

function stepper(job: TakeEditJob) {
  return (id: StepId, state: StepState, detail?: string) => {
    job.steps = job.steps.map((entry) => (entry.id === id ? { ...entry, state, ...(detail !== undefined ? { detail } : { detail: undefined }) } : entry));
    save(job);
  };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Une prise : récupérée par adresse, ou déjà parmi les médias du module. */
async function resolveTake(job: TakeEditJob, source: ClipSource, index: number, total: number, signal: AbortSignal, step: ReturnType<typeof stepper>): Promise<ClipAsset> {
  if (source.type === "asset") {
    const asset = readAssets().find((entry) => entry.file === source.file);
    if (!asset || !fs.existsSync(path.join(ASSETS_DIR, asset.file))) throw new Error("Cette prise n’est plus dans Clip Studio.");
    if (asset.kind !== "video") throw new Error("Une prise doit être une vidéo.");
    return asset;
  }
  const label = total > 1 ? `Prise ${index + 1} sur ${total} : ` : "";
  step("import", "running", `${label}lecture de l’adresse…`);
  const started = takeDeps.startImport({ url: source.url, start: source.start, end: source.end });
  for (;;) {
    if (signal.aborted) {
      takeDeps.cancelImport(started.id);
      throw abortError();
    }
    const current = takeDeps.getImport(started.id);
    if (!current) throw new Error("La récupération a disparu : relancez le montage.");
    if (current.status === "done" && current.asset) return current.asset;
    if (current.status !== "running") throw new Error(current.error ?? "La prise n’a pas pu être récupérée.");
    const percent = current.progress !== undefined ? ` ${Math.round(current.progress * 100)} %` : "";
    step("import", "running", `${label}${current.phase === "convert" ? "mise au format" : current.phase === "save" ? "rangement" : "téléchargement"}${percent}`);
    await pause(1000);
  }
}

/** Mots de la prise : sa transcription rangée, sinon une transcription mot pour mot (rangée ensuite avec le média). */
async function transcribeTake(asset: ClipAsset, label: string, signal: AbortSignal, step: ReturnType<typeof stepper>): Promise<{ words: TimedWord[]; engine: string; language?: string }> {
  const media = resolveMedia({ assetId: asset.file });
  const stored = storedTranscript(media);
  if (stored?.words.length) return { words: stored.words, engine: "déjà transcrite", language: stored.transcript.language };
  step("transcribe", "running", `${label}extraction du son…`);
  const result = await takeDeps.transcribe(media.path, {
    signal,
    feature: "Monter une prise",
    verbatim: true,
    onProgress: (progress) => {
      const detail = transcriptionDetail(progress);
      if (detail) step("transcribe", "running", `${label}${detail.charAt(0).toLowerCase()}${detail.slice(1)}`);
    },
  });
  if (signal.aborted) throw abortError();
  const provider = result.provider ?? "openai";
  storeTranscript(media, result.words, { provider, ...(result.language ? { language: result.language } : {}), at: Date.now() });
  return { words: result.words, engine: provider === "local" ? "sur le serveur" : "OpenAI", language: result.language };
}

/** Énergie du son d'un fichier, par tranches de 10 ms, et sa durée (ms). */
async function decodeEnergy(file: string, signal: AbortSignal): Promise<{ frames: Float32Array; durationMs: number }> {
  const ffmpeg = await ensureFfmpeg();
  if (!ffmpeg) throw new Error("ffmpeg n’est pas disponible sur le serveur : réessayez dans un moment.");
  const rate = 16_000;
  const hop = (rate * 10) / 1000;
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ["-nostdin", "-hide_banner", "-loglevel", "error", "-t", String(TAKE_LIMITS.maxSeconds + 1), "-i", file, "-map", "0:a:0", "-ac", "1", "-ar", String(rate), "-f", "f32le", "pipe:1"], {
      env: childEnv(),
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const levels: number[] = [];
    let carry: Buffer = Buffer.alloc(0);
    let sum = 0;
    let count = 0;
    let samples = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      const data = carry.length ? Buffer.concat([carry, chunk]) : chunk;
      const usable = data.length - (data.length % 4);
      for (let offset = 0; offset < usable; offset += 4) {
        const value = data.readFloatLE(offset);
        sum += value * value;
        count++;
        samples++;
        if (count === hop) {
          levels.push(10 * Math.log10(sum / hop + 1e-12));
          sum = 0;
          count = 0;
        }
      }
      carry = data.subarray(usable);
    });
    const kill = () => child.kill("SIGKILL");
    const timer = setTimeout(kill, 10 * 60 * 1000);
    signal.addEventListener("abort", kill, { once: true });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", kill);
      if (signal.aborted) return reject(abortError());
      if (code !== 0 || samples === 0) return reject(new Error("Le son de la prise n’a pas pu être lu."));
      resolve({ frames: Float32Array.from(levels), durationMs: (samples / rate) * 1000 });
    });
  });
}

/**
 * Prise accélérée de `speed`, image et son : `setpts` pour l'image (même
 * cadence), `atempo` pour le son (même hauteur de voix). Réencodée en H.264
 * et AAC, comme un extrait.
 */
async function stretchTake(input: string, output: string, speed: number, signal: AbortSignal, onProgress?: (ratio: number) => void, durationSec = 0): Promise<MediaStreams> {
  const ffmpeg = await ensureFfmpeg();
  if (!ffmpeg) throw new Error("ffmpeg n’est pas disponible sur le serveur : réessayez dans un moment.");
  const factor = speed.toFixed(3);
  const args = [
    "-nostdin", "-hide_banner", "-y",
    "-i", input,
    "-map", "0:v:0", "-map", "0:a:0", "-sn", "-dn", "-map_metadata", "-1",
    "-vf", `setpts=PTS/${factor}`,
    "-af", `atempo=${factor}`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart", "-threads", "2", "-progress", "pipe:1", "-nostats",
    output,
  ];
  const result = await runFfmpeg(ffmpeg, args, {
    signal,
    timeoutMs: Math.max(5 * 60 * 1000, durationSec * 4000),
    onTime: (seconds) => durationSec > 0 && onProgress?.(Math.min(1, (seconds * speed) / durationSec)),
  }).catch((error) => {
    if (signal.aborted) throw abortError();
    throw error;
  });
  if (result.code !== 0 || !fs.existsSync(output)) throw new Error("La prise n’a pas pu être accélérée : réessayez.");
  const streams = await inspect(ffmpeg, output);
  if (!streams.video || !streams.audio) throw new Error("La prise accélérée est illisible : réessayez.");
  return streams;
}

/** Phrases dites, pour les textes de publication. */
function sentences(words: TimedWord[]): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    line = line ? `${line} ${word.text}` : word.text;
    if (line.length > 400 || /[.!?…]["»”)]*$/.test(word.text)) {
      lines.push(line);
      line = "";
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 100);
}

interface PreparedTake {
  asset: ClipAsset;
  /** Média lu par les plans (la prise, ou sa version accélérée). */
  played: ClipAsset;
  words: TimedWord[];
  kept: Range[];
  focus: FaceFocus | null;
}

/** Fiche de la version accélérée d'une prise : mots recalés, mention et provenance de la source. */
export function stretchedAsset(source: ClipAsset, file: string, size: number, streams: MediaStreams, speed: number, words: TimedWord[], now = Date.now()): ClipAsset {
  const label = String(speed).replace(".", ",");
  return {
    file,
    kind: "video",
    originalName: `${source.originalName.replace(/\.[a-z0-9]{2,4}$/i, "")} (×${label}).mp4`.slice(0, 200),
    size,
    width: streams.width ?? source.width,
    height: streams.height ?? source.height,
    durationMs: streams.durationSec ? Math.round(streams.durationSec * 1000) : source.durationMs ? Math.round(source.durationMs / speed) : undefined,
    ...(source.credit ? { credit: source.credit } : {}),
    ...(source.rights ? { rights: source.rights } : {}),
    ...(source.origin ? { origin: source.origin, lastUsedAt: now } : {}),
    hasAudio: true,
    words: words.map((word) => ({ text: word.text, startMs: Math.round(word.startMs / speed), endMs: Math.round(word.endMs / speed) })),
    ...(source.transcript ? { transcript: source.transcript } : {}),
    createdAt: now,
  };
}

async function runTakeEdit(job: TakeEditJob, signal: AbortSignal) {
  const step = stepper(job);
  const workDir = path.join(WORK_DIR, job.id);
  const release = holdWorkDir(workDir);
  const request = job.request;
  const report: TakeReport = { sourceMs: 0, editMs: 0, silenceMs: 0, retakeMs: 0, retakes: [], segments: 0, beats: [], engines: [], faces: [], logos: [] };
  try {
    ensureDirs();
    fs.mkdirSync(workDir, { recursive: true });
    const total = request.sources.length;

    // 1. Prises.
    const assets: ClipAsset[] = [];
    for (const [index, source] of request.sources.entries()) {
      assets.push(await resolveTake(job, source, index, total, signal, step));
    }
    if (request.sources.some((source) => source.type === "url")) step("import", "done", `${total} prise${total > 1 ? "s" : ""} récupérée${total > 1 ? "s" : ""}`);
    for (const asset of assets) if (asset.hasAudio === false) throw new Error(`« ${asset.originalName} » n’a pas de son : rien à monter.`);
    const sourceMs = assets.reduce((sum, asset) => sum + (asset.durationMs ?? 0), 0);
    if (sourceMs > TAKE_LIMITS.maxSeconds * 1000) throw new Error("Les prises dépassent 20 minutes en tout : choisissez-en de plus courtes.");
    job.title = (assets[0].origin?.title ?? assets[0].originalName).replace(/\.[a-z0-9]{2,4}$/i, "").slice(0, 120);
    save(job);

    // 2. Transcription mot pour mot.
    const transcripts: { words: TimedWord[]; language?: string }[] = [];
    for (const [index, asset] of assets.entries()) {
      const label = total > 1 ? `Prise ${index + 1} sur ${total} : ` : "";
      const result = await transcribeTake(asset, label, signal, step);
      if (result.words.length === 0) throw new TranscriptionError(`Aucune parole reconnue dans « ${asset.originalName} ».`);
      transcripts.push(result);
      report.engines.push(result.engine);
    }
    const wordCount = transcripts.reduce((sum, entry) => sum + entry.words.length, 0);
    step("transcribe", "done", `${wordCount} mots, transcription ${[...new Set(report.engines)].join(" et ")}`);

    // 3. Coupe.
    step("cut", "running", "Lecture du son…");
    const prepared: PreparedTake[] = [];
    const speed = request.speed;
    assertDiskSpace(DATA_DIR, speed !== 1 ? assets.reduce((sum, asset) => sum + (Number(asset.size) || 0), 0) * 1.5 : 0);
    for (const [index, asset] of assets.entries()) {
      const file = path.join(ASSETS_DIR, asset.file);
      const { frames, durationMs } = await takeDeps.energy(file, signal);
      const words = transcripts[index].words;
      const result = cutTake({ words, frames, durationMs, mode: request.silence, removeRetakes: request.removeRetakes });
      report.sourceMs += durationMs;
      report.silenceMs += result.silenceMs;
      report.retakeMs += result.retakeMs;
      report.retakes.push(...result.retakes.map((retake) => ({ text: retake.text, reason: retake.reason })));
      let played = asset;
      let keptWords = words.filter((_, wordIndex) => !droppedWords(result.retakes).has(wordIndex));
      let kept = result.kept;
      if (speed !== 1) {
        step("cut", "running", `${total > 1 ? `Prise ${index + 1} sur ${total} : ` : ""}accélération ×${String(speed).replace(".", ",")}…`);
        const output = path.join(workDir, `take-${index}.mp4`);
        const streams = await takeDeps.stretch(file, output, speed, signal, (ratio) => step("cut", "running", `Accélération ×${String(speed).replace(".", ",")} : ${Math.round(ratio * 100)} %`), durationMs / 1000);
        const name = `take-${Date.now().toString(36)}${randomBytes(4).toString("hex")}.mp4`;
        const size = fs.statSync(output).size;
        fs.renameSync(output, path.join(ASSETS_DIR, name));
        played = stretchedAsset(asset, name, size, streams, speed, words);
        writeAssets([played, ...readAssets().filter((entry) => entry.file !== name)]);
        // Le montage lit la version accélérée : bornes et mots ramenés à son temps.
        kept = kept.map((range) => ({ startMs: range.startMs / speed, endMs: range.endMs / speed }));
        keptWords = keptWords.map((word) => ({ ...word, startMs: word.startMs / speed, endMs: word.endMs / speed }));
      }
      prepared.push({ asset, played, words: keptWords, kept, focus: null });
    }
    const fps = 30;
    const segments: KeptSegment[] = editDecisionList(
      prepared.map((take) => take.kept),
      fps,
      1
    );
    const editWords = prepared.flatMap((take, index) => rebaseWords(take.words, index, segments, fps, 1));
    const last = segments[segments.length - 1];
    if (!last) throw new Error("Rien à garder dans ces prises : aucune parole entre les blancs.");
    report.editMs = Math.round(((last.start + last.duration) / fps) * 1000);
    report.segments = segments.length;
    const retakeCount = report.retakes.length;
    step(
      "cut",
      "done",
      `${(report.silenceMs / 1000).toFixed(1).replace(".", ",")} s de blancs${request.removeRetakes ? `, ${retakeCount} reprise${retakeCount > 1 ? "s" : ""}` : ""} : ${(report.sourceMs / 1000).toFixed(0)} s → ${(report.editMs / 1000).toFixed(0)} s`
    );

    // La marque d'abord : le plan sait si elle a une mascotte à faire réagir.
    const theme = request.brandKitId ? await takeDeps.loadTheme(request.brandKitId) : null;
    if (signal.aborted) throw abortError();

    // 4. Plan des tableaux.
    step("plan", "running", "Codex lit ce qui est dit…");
    let plan: TakePlan;
    try {
      const recent = takeDeps.recentMontages(request.brandKitId);
      const mascot = Boolean(theme?.mascot && (theme.mascot.library?.length || theme.mascot.reactions.length));
      const answer = await takeDeps.ask(beatPlanPrompt({ words: editWords, durationMs: report.editMs, language: transcripts[0]?.language, recent, mascot }), signal);
      plan = readBeatPlan(extractJson(answer), editWords, report.editMs);
      step("plan", "done", `${plan.beats.length} tableau${plan.beats.length > 1 ? "x" : ""}, accroche « ${plan.hook.slice(0, 60)} »`);
    } catch (error) {
      if (signal.aborted) throw abortError();
      console.error("[clip-studio] plan d’une prise :", error instanceof Error ? error.message : error);
      plan = readBeatPlan({}, editWords, report.editMs);
      step("plan", "error", "Codex n’a pas répondu : seule l’accroche est posée, le reste se monte à la main.");
    }
    report.hook = plan.hook;

    // 5. Logos et cadrage.
    step("visuals", "running", "Repérage du visage…");
    for (const take of prepared) {
      take.focus = await takeDeps.face(path.join(ASSETS_DIR, take.played.file), take.played, signal).catch(() => null);
      report.faces.push(take.focus !== null);
    }
    // Un logo par outil nommé ; un même nom n'est cherché qu'une fois.
    if (signal.aborted) throw abortError();
    const { logos, searched } = await findPlanLogos(plan, editWords, (name, context, logoSignal) => takeDeps.logo(name, context, logoSignal), signal, (name) =>
      step("visuals", "running", `Logo officiel de « ${name} »…`)
    );
    report.logos.push(...searched);
    const faceCount = report.faces.filter(Boolean).length;
    step(
      "visuals",
      "done",
      [
        faceCount ? `Visage repéré${total > 1 ? ` sur ${faceCount} prise${faceCount > 1 ? "s" : ""}` : ""}` : "Visage non repéré : cadrage au centre",
        report.logos.length ? `${report.logos.filter((logo) => logo.found).length} logo${report.logos.length > 1 ? "s" : ""} officiel${report.logos.length > 1 ? "s" : ""} sur ${report.logos.length}` : "",
      ]
        .filter(Boolean)
        .join(", ")
    );

    // 6. Montage.
    step("montage", "running", "Habillage de la marque…");
    const takes: TakeSource[] = prepared.map((take) => ({ source: assetSource(take.played), focus: take.focus }));
    let project: ClipProject = buildTakeProject({
      name: plan.hook || job.title || "Prise montée",
      aspect: request.aspect,
      takes,
      segments,
      words: editWords,
      plan,
      logos,
      theme,
      script: sentences(editWords),
    });
    const contentFrames = last.start + last.duration;
    const sounds = takeBeatSounds(plan, editWords, contentFrames, project.fps);
    const audioTracks: Track[] = [];
    if (sounds.length) audioTracks.push({ id: uid("t-"), kind: "audio", name: "Bruitages", items: sounds });
    if (request.music) {
      const end = projectDuration(project);
      const music = takeDeps.music(plan.mood, (end / project.fps) * 1000);
      if (music) {
        // La musique couvre aussi le carton de fin, et s'efface sous la voix de la prise.
        audioTracks.push({ id: uid("t-"), kind: "audio", name: "Musique", items: createMusicItems(music, 0, end, project.fps, MUSIC_VOLUME).map((item) => ({ ...item, duck: DEFAULT_DUCK })) });
        report.music = music.name;
      }
    }
    project = { ...project, tracks: [...project.tracks, ...audioTracks] };
    writeProject(project);
    report.beats = plan.beats.map((beat) => ({
      atMs: editWords[beat.word]?.startMs ?? 0,
      layout: beat.layout,
      ...(beat.layout !== "full" ? { board: beat.arrangement ?? "single", text: boardSummary(beat) } : {}),
    }));
    job.report = report;
    job.projectId = project.id;
    job.status = "done";
    job.finishedAt = Date.now();
    step("montage", "done", `${(report.editMs / 1000).toFixed(0)} s, ${segments.length} plans${report.music ? `, musique « ${report.music.slice(0, 60)} »` : ""}`);
  } catch (error) {
    const canceled = signal.aborted;
    const message = canceled
      ? "Montage annulé."
      : error instanceof TranscriptionError
        ? error.message
        : publicErrorMessage(error, "Le montage a échoué : réessayez.", "[clip-studio] montage d’une prise");
    job.steps = job.steps.map((entry) => (entry.state === "running" ? { ...entry, state: canceled ? "skipped" : "error", detail: canceled ? "Annulé" : message } : entry));
    job.status = canceled ? "canceled" : "error";
    job.error = message;
    job.report = report;
    job.finishedAt = Date.now();
    save(job);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
    release();
  }
}

/** Ce que montre un tableau, en quelques mots, pour le bilan. */
function boardSummary(beat: TakePlan["beats"][number]): string {
  return [beat.heading?.text, ...(beat.items ?? []).map((item) => (item.unit ? `${item.text} ${item.unit}` : item.text))].filter(Boolean).join(" · ").slice(0, 160);
}

