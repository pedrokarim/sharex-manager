/**
 * Vidéo de référence d'une marque (dossier 07 sexies, D4) : réception,
 * décodage par ffmpeg, travaux d'analyse.
 *
 * La vidéo arrive par la route d'upload des modules (`data/assets/`), est
 * vérifiée (type réel lu sur ses premiers octets, taille, durée), rangée le
 * temps de l'analyse dans le dossier de sa marque (`kits/<id>/reference/`),
 * puis effacée : la marque ne garde que le relevé et ce qui désigne la vidéo
 * (nom, durée, date). ffmpeg est lancé sans shell, arguments en tableau, avec
 * un délai maximal ; l'analyse s'annule.
 *
 *   data/style-jobs.json   travaux d'analyse récents (relevé compris)
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { childEnv } from "@/lib/child-env";
import { ensureFfmpeg, parseVideoInfo } from "@/lib/media/ffmpeg";
import { readMeasuredStyle, type MeasuredStyle } from "@/modules/clip-studio/engine/measured-style";
import { newItemId } from "../defaults";
import {
  ANALYSIS_FPS,
  ANALYSIS_WIDTH,
  ReferenceAnalyzer,
  analysisHeight,
  assembleStyle,
  detectBeats,
  summarizeBeats,
} from "../reference-analysis";
import type { BrandKit } from "../types";
import { requireKit } from "./kits";
import { dataRoot, isFileName, kitDir, readJson, uploadsDir, writeJson, writeKit } from "./store";

/** Bornes d'une vidéo de référence : un short, pas un film. */
export const REFERENCE_LIMITS = {
  maxBytes: 200 * 1024 * 1024,
  minSeconds: 3,
  maxSeconds: 180,
};

/** Fréquence du son analysé : assez pour la voix et les bruitages. */
const AUDIO_RATE = 16_000;
/** Analyses en même temps sur le serveur : le décodage prend un cœur ou deux chacune. */
const MAX_RUNNING = 2;

export type StyleJobPhase = "video" | "audio" | "compute";

export interface StyleJob {
  id: string;
  kitId: string;
  status: "running" | "done" | "error" | "canceled";
  phase: StyleJobPhase;
  /** Avancement de 0 à 1. */
  progress: number;
  /** Nom d'origine de la vidéo. */
  referenceName: string;
  style?: MeasuredStyle;
  /** Relevé appliqué à la marque. */
  applied?: boolean;
  error?: string;
  createdAt: number;
  finishedAt?: number;
}

const controllers = new Map<string, AbortController>();
const jobsFile = () => path.join(/* turbopackIgnore: true */ dataRoot(), "style-jobs.json");
const referenceDir = (kitId: string) => path.join(kitDir(kitId), "reference");

function readJobs(): StyleJob[] {
  return readJson<StyleJob[]>(jobsFile()) ?? [];
}

function save(job: StyleJob) {
  writeJson(jobsFile(), [job, ...readJobs().filter((entry) => entry.id !== job.id)].slice(0, 20), 4 * 1024 * 1024);
}

/** Un travail « en cours » sans contrôleur a été interrompu par un redémarrage. */
function settle(job: StyleJob): StyleJob {
  if (job.status !== "running" || controllers.has(job.id)) return job;
  return { ...job, status: "error", error: "Analyse interrompue par un redémarrage du serveur." };
}

// ─── ffmpeg ──────────────────────────────────────────────────────

class Canceled extends Error {
  constructor() {
    super("Analyse annulée.");
  }
}

interface RunOptions {
  signal?: AbortSignal;
  timeoutMs: number;
  /** Sortie standard reçue au fil de l'eau ; sans elle, elle est ignorée. */
  onData?: (chunk: Buffer) => void;
}

/** Lance ffmpeg sans shell ; rend son code et la fin de sa sortie d'erreur. */
function runFfmpeg(binary: string, args: string[], options: RunOptions): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) return reject(new Canceled());
    const child = spawn(binary, ["-nostdin", "-hide_banner", ...args], {
      env: childEnv(),
      windowsHide: true,
      stdio: ["ignore", options.onData ? "pipe" : "ignore", "pipe"],
    });
    let stderr = "";
    let failure: Error | null = null;
    child.stderr!.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-20_000);
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      try {
        options.onData!(chunk);
      } catch (error) {
        failure = error as Error;
        child.kill("SIGKILL");
      }
    });
    const abort = () => {
      failure = new Canceled();
      child.kill("SIGKILL");
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => {
      failure = new Error("Le décodage de la vidéo a pris trop de temps.");
      child.kill("SIGKILL");
    }, options.timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else resolve({ code: code ?? 1, stderr });
    });
  });
}

export interface ReferenceInfo {
  durationSeconds: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

/** Durée, dimensions et présence d'un son, lues dans la sortie de `ffmpeg -i`. */
export async function probeReference(file: string, signal?: AbortSignal): Promise<ReferenceInfo> {
  const binary = await ensureFfmpeg();
  if (!binary) throw new Error("ffmpeg n’est pas disponible sur le serveur : l’analyse attend son téléchargement.");
  const { stderr } = await runFfmpeg(binary, ["-i", file], { signal, timeoutMs: 30_000 });
  const info = parseVideoInfo(stderr);
  if (!info.width || !info.height || !/Stream #[^\n]*Video:/.test(stderr)) throw new Error("Ce fichier ne contient pas de vidéo lisible.");
  if (!info.durationMs) throw new Error("La durée de la vidéo est illisible.");
  return { durationSeconds: info.durationMs / 1000, width: info.width, height: info.height, hasAudio: /Stream #[^\n]*Audio:/.test(stderr) };
}

/** Vérifie les bornes d'une vidéo de référence ; rend un message clair sinon. */
export function checkReference(info: ReferenceInfo): void {
  if (info.durationSeconds < REFERENCE_LIMITS.minSeconds) throw new Error(`Vidéo trop courte : ${REFERENCE_LIMITS.minSeconds} s au moins.`);
  if (info.durationSeconds > REFERENCE_LIMITS.maxSeconds) throw new Error(`Vidéo trop longue : ${REFERENCE_LIMITS.maxSeconds / 60} minutes au plus, comme un short.`);
}

export interface AnalyzeOptions {
  /** Nom affiché de la vidéo. */
  name: string;
  signal?: AbortSignal;
  onProgress?: (phase: StyleJobPhase, progress: number) => void;
  /** Date de l'analyse (tests). */
  now?: number;
}

/**
 * Analyse complète d'une vidéo de référence : images (coupes, mouvements,
 * sous-titres) puis son (bruitages). Rend le style mesuré.
 */
export async function analyzeReferenceFile(file: string, options: AnalyzeOptions): Promise<MeasuredStyle> {
  const binary = await ensureFfmpeg();
  if (!binary) throw new Error("ffmpeg n’est pas disponible sur le serveur : l’analyse attend son téléchargement.");
  const info = await probeReference(file, options.signal);
  checkReference(info);
  const width = ANALYSIS_WIDTH;
  const height = analysisHeight(info.width, info.height);
  const frameBytes = width * height;
  const expected = Math.max(1, Math.ceil(info.durationSeconds * ANALYSIS_FPS));
  const analyzer = new ReferenceAnalyzer(width, height);
  // Images grises réduites, dix par seconde, lues au fil de l'eau : jamais toute la vidéo en mémoire.
  let pending: Buffer = Buffer.alloc(0);
  let lastReport = 0;
  const video = await runFfmpeg(
    binary,
    ["-threads", "2", "-i", file, "-an", "-sn", "-dn", "-vf", `fps=${ANALYSIS_FPS},scale=${width}:${height}:flags=area,format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"],
    {
      signal: options.signal,
      timeoutMs: 10 * 60_000,
      onData: (chunk) => {
        pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
        while (pending.length >= frameBytes) {
          if (analyzer.frames >= expected + ANALYSIS_FPS) throw new Error("La vidéo est plus longue qu’annoncé.");
          analyzer.push(new Uint8Array(pending.subarray(0, frameBytes)));
          pending = pending.subarray(frameBytes);
        }
        const progress = Math.min(1, analyzer.frames / expected);
        if (progress - lastReport >= 0.02) {
          lastReport = progress;
          options.onProgress?.("video", progress);
        }
      },
    }
  );
  if (video.code !== 0 || analyzer.frames < ANALYSIS_FPS) throw new Error("Le décodage des images de la vidéo a échoué.");
  // Son mono 16 kHz, borné à la durée maximale.
  let samples: Float32Array | null = null;
  if (info.hasAudio) {
    options.onProgress?.("audio", 0);
    const chunks: Buffer[] = [];
    let bytes = 0;
    const maxBytes = (REFERENCE_LIMITS.maxSeconds + 2) * AUDIO_RATE * 2;
    const audio = await runFfmpeg(binary, ["-threads", "2", "-i", file, "-vn", "-sn", "-dn", "-ac", "1", "-ar", String(AUDIO_RATE), "-f", "s16le", "pipe:1"], {
      signal: options.signal,
      timeoutMs: 5 * 60_000,
      onData: (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) throw new Error("Le son de la vidéo est plus long qu’annoncé.");
        chunks.push(chunk);
      },
    });
    if (audio.code === 0 && bytes >= AUDIO_RATE * 2) {
      const raw = Buffer.concat(chunks);
      samples = new Float32Array(Math.floor(raw.length / 2));
      for (let i = 0; i < samples.length; i++) samples[i] = raw.readInt16LE(i * 2) / 32768;
    }
  }
  if (options.signal?.aborted) throw new Canceled();
  options.onProgress?.("compute", 0);
  const durationSeconds = analyzer.frames / ANALYSIS_FPS;
  const images = analyzer.finish();
  const beats = samples ? summarizeBeats(detectBeats(samples, AUDIO_RATE), durationSeconds) : undefined;
  return assembleStyle({
    name: options.name,
    durationSeconds,
    width: info.width,
    height: info.height,
    analyzedAt: options.now ?? Date.now(),
    ...(images.shots ? { shots: images.shots } : {}),
    ...(images.motion ? { motion: images.motion } : {}),
    ...(images.captions ? { captions: images.captions } : {}),
    ...(beats ? { beats } : {}),
    ...(samples ? {} : { silent: true }),
  });
}

// ─── Réception ───────────────────────────────────────────────────

/** Type réel d'une vidéo, lu sur ses premiers octets : MP4, MOV ou WebM. */
export function sniffVideo(head: Buffer): "mp4" | "mov" | "webm" | null {
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "webm";
  if (head.length >= 12 && head.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = head.subarray(8, 12).toString("latin1");
    if (brand.startsWith("M4A") || brand.startsWith("M4B")) return null;
    return brand === "qt  " ? "mov" : "mp4";
  }
  return null;
}

/** Nom affiché : une ligne, sans caractère de contrôle, borné. */
function displayName(value: unknown): string {
  const clean = typeof value === "string" ? Array.from(value).filter((char) => char.charCodeAt(0) >= 32).join("").trim().slice(0, 120) : "";
  return clean || "Vidéo de référence";
}

/** Les vidéos déposées et jamais analysées ne restent pas plus d'une heure. */
function sweepDroppedVideos() {
  try {
    for (const entry of fs.readdirSync(uploadsDir())) {
      if (!/\.(mp4|mov|webm)$/i.test(entry)) continue;
      const file = path.join(uploadsDir(), entry);
      const stats = fs.lstatSync(file);
      if (Date.now() - stats.mtimeMs > 3_600_000) fs.rmSync(file, { force: true });
    }
  } catch {
    // Dossier absent : rien à ranger.
  }
}

/**
 * Lance l'analyse d'une vidéo déposée par la route d'upload (`input.file`,
 * dans `data/assets/`). Rend le travail tout de suite ; l'avancement se lit
 * avec `getStyleJob`.
 */
export function startStyleAnalysis(kitId: unknown, input: { file?: unknown; name?: unknown }): StyleJob {
  const kit = requireKit(kitId);
  sweepDroppedVideos();
  if (!isFileName(input?.file)) throw new Error("Nom de fichier invalide.");
  const dropped = path.join(uploadsDir(), input.file);
  const stats = fs.lstatSync(dropped, { throwIfNoEntry: false });
  if (!stats?.isFile()) throw new Error("Vidéo déposée introuvable : envoyez-la de nouveau.");
  const reject = (message: string): never => {
    fs.rmSync(dropped, { force: true });
    throw new Error(message);
  };
  if (stats.size === 0) reject("La vidéo envoyée est vide.");
  if (stats.size > REFERENCE_LIMITS.maxBytes) reject(`Vidéo trop lourde : ${REFERENCE_LIMITS.maxBytes / 1024 / 1024} Mo au plus.`);
  const head = Buffer.alloc(16);
  const handle = fs.openSync(dropped, "r");
  try {
    fs.readSync(handle, head, 0, 16, 0);
  } finally {
    fs.closeSync(handle);
  }
  const extension = sniffVideo(head) ?? reject("Ce fichier n’est pas une vidéo MP4, MOV ou WebM.");
  const jobs = readJobs().map(settle);
  if (jobs.some((job) => job.kitId === kit.id && job.status === "running")) reject("Une analyse est déjà en cours pour cette marque.");
  if (jobs.filter((job) => job.status === "running").length >= MAX_RUNNING) reject("Le serveur analyse déjà d’autres vidéos : réessayez dans un moment.");

  // La vidéo rejoint le dossier de sa marque le temps de l'analyse ; une ancienne référence est effacée.
  const id = newItemId("job");
  const folder = referenceDir(kit.id);
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `${id}.${extension}`);
  fs.renameSync(dropped, file);

  const job: StyleJob = { id, kitId: kit.id, status: "running", phase: "video", progress: 0, referenceName: displayName(input.name), createdAt: Date.now() };
  save(job);
  const controller = new AbortController();
  controllers.set(id, controller);
  void runJob(job, file, controller.signal);
  return job;
}

async function runJob(job: StyleJob, file: string, signal: AbortSignal) {
  let current = job;
  const update = (patch: Partial<StyleJob>) => {
    current = { ...current, ...patch };
    save(current);
  };
  try {
    const style = await analyzeReferenceFile(file, {
      name: job.referenceName,
      signal,
      onProgress: (phase, progress) => update({ phase, progress: Math.round(progress * 100) / 100 }),
    });
    update({ status: "done", progress: 1, style, finishedAt: Date.now() });
  } catch (error) {
    if (error instanceof Canceled || signal.aborted) update({ status: "canceled", finishedAt: Date.now() });
    else update({ status: "error", error: error instanceof Error ? error.message : "L’analyse a échoué.", finishedAt: Date.now() });
  } finally {
    controllers.delete(job.id);
    // La vidéo n'est jamais gardée : seul le relevé reste.
    fs.rmSync(file, { force: true });
    try {
      fs.rmdirSync(path.dirname(file));
    } catch {
      // Dossier déjà retiré ou pas vide.
    }
  }
}

/** Travaux récents d'une marque : en cours, ou finis depuis moins d'un jour et pas encore appliqués. */
export function listStyleJobs(kitId: unknown): StyleJob[] {
  const kit = requireKit(kitId);
  return readJobs()
    .filter((job) => job.kitId === kit.id)
    .map(settle)
    .filter((job) => job.status === "running" || (!job.applied && Date.now() - (job.finishedAt ?? job.createdAt) < 86_400_000))
    .slice(0, 3);
}

export function getStyleJob(jobId: unknown): StyleJob | null {
  const job = readJobs().find((entry) => entry.id === jobId);
  return job ? settle(job) : null;
}

export function cancelStyleAnalysis(jobId: unknown) {
  controllers.get(String(jobId))?.abort();
}

/**
 * Applique un relevé à sa marque : la marque garde le style mesuré (pas la
 * vidéo) et ses clips suivent désormais « D'après la vidéo de référence ».
 */
export function applyStyleAnalysis(kitId: unknown, jobId: unknown): BrandKit {
  const kit = requireKit(kitId);
  const job = readJobs().find((entry) => entry.id === jobId && entry.kitId === kit.id);
  const style = job?.status === "done" ? readMeasuredStyle(job.style) : undefined;
  if (!job || !style) throw new Error("Ce relevé n’existe plus : relancez l’analyse.");
  const saved: BrandKit = { ...kit, measuredStyle: style, pace: "measured", updatedAt: Math.max(Date.now(), kit.updatedAt + 1) };
  writeKit(saved);
  save({ ...job, applied: true });
  return saved;
}
