/**
 * Créations à partir d'une vidéo (dossier 01, V4), côté serveur :
 *
 * - « Sous-titrer un clip » : récupération par adresse (V2) ou média du
 *   module → transcription (V3, réutilisée si elle existe) → projet monté par
 *   `buildSubtitledClip`, enregistré ;
 * - « Découper une vidéo » : récupération d'une longue vidéo (2 h, 720p au
 *   plus) → transcription → Codex propose des passages forts → le travail
 *   attend le choix de l'utilisateur (`review`) → chaque passage est coupé
 *   par ffmpeg (réencodé, à l'image près) en un nouveau média, puis monté
 *   comme un clip sous-titré.
 *
 * Les travaux sont suivis comme ceux de l'assistant : rangés dans
 * `data/clip-jobs.json`, avec leurs étapes, annulables, deux à la fois.
 * Aucun fichier à moitié écrit : les extraits naissent dans un dossier de
 * travail caché puis sont renommés, les projets s'écrivent d'un bloc.
 */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { ensureFfmpeg } from "@/lib/media/ffmpeg";
import { apiModuleManager } from "@/lib/modules/module-manager.api";
import type { BrandTheme } from "../engine/brand";
import { buildSubtitledClip, type ClipFraming } from "../engine/video-templates";
import { ASPECTS, type AspectPreset, type ClipAsset, type MediaSource, type TimedWord, type TranscriptInfo } from "../engine/types";
import { analyzeMoments, cleanMomentEdits, cleanText, momentWords, MOMENT_LIMITS, type ClipMoment } from "./clip-moments";
import { askCodex } from "./codex";
import { assertDiskSpace, holdWorkDir, publicErrorMessage } from "./job-safety";
import { cancelRemoteImportJob, getRemoteImportJob, inspect, remoteAssetGuards, runFfmpeg, startRemoteImport, type MediaStreams } from "./remote-import";
import { ASSETS_DIR, DATA_DIR, ensureDirs, listProjectFiles, readAssets, writeAssets, writeProject } from "./store";
import { TranscriptionError, transcribeMediaFile } from "./transcribe";
import { resolveMedia, storedTranscript, storeTranscript } from "./transcription-jobs";

const JOBS_FILE = path.join(DATA_DIR, "clip-jobs.json");
/** Dossier de travail : caché, donc jamais servi par la route des données. */
const WORK_DIR = path.join(DATA_DIR, ".clip-tmp");
const KEPT_JOBS = 20;
const MAX_RUNNING_JOBS = 2;
const JOB_ID = /^cjob-[a-z0-9]{6,40}$/;
const KIT_ID = /^kit-[a-z0-9]{6,32}$/;
const ASSET_URL_PREFIX = "/api/modules/clip-studio/data/assets/";

export type ClipJobKind = "subtitle" | "clipping";
type StepId = "import" | "transcribe" | "analyze" | "cut" | "montage";
type StepState = "pending" | "running" | "done" | "error" | "skipped";

/**
 * Source d'une création : une adresse (et le passage voulu) ou un média du
 * module. `uploaded` n'est qu'une indication du navigateur («  envoyé pour
 * cette création  ») : c'est le serveur qui décide si le travail possède le
 * fichier (`claimUploadedSource`).
 */
export type ClipSource = { type: "url"; url: string; start?: number; end?: number } | { type: "asset"; file: string; uploaded?: boolean };

export interface ClipJobRequest {
  kind: ClipJobKind;
  source: ClipSource;
  aspect: AspectPreset;
  framing: ClipFraming;
  brandKitId?: string;
  /** Sous-titrer : accroche posée au début ; absente, aucune. */
  hook?: string;
  /** Découper : garder la vidéo source après la découpe. */
  keepSource?: boolean;
}

export interface ClipJobSource {
  file: string;
  url: string;
  name: string;
  durationMs?: number;
  width?: number;
  height?: number;
  /** Récupérée ou envoyée pour ce travail : elle peut être effacée après la découpe. */
  owned: boolean;
}

export interface ClipJobClip {
  projectId: string;
  name: string;
  durationMs: number;
  momentId?: string;
}

export interface ClipJob {
  id: string;
  kind: ClipJobKind;
  /** `review` : les passages proposés attendent le choix de l'utilisateur. */
  status: "running" | "review" | "done" | "error" | "canceled";
  request: ClipJobRequest;
  steps: { id: StepId; label: string; state: StepState; detail?: string }[];
  /** Titre de la vidéo source. */
  title?: string;
  source?: ClipJobSource;
  /** Récupération par adresse en cours (V2). */
  importJobId?: string;
  moments?: ClipMoment[];
  /** Sous-titrer : le projet créé. */
  projectId?: string;
  /** Découper : les clips créés, dans l'ordre de la vidéo. */
  clips?: ClipJobClip[];
  /** Découper : la vidéo source a été effacée après la découpe. */
  sourceRemoved?: boolean;
  error?: string;
  createdAt: number;
  finishedAt?: number;
}

// ─── Dépendances (remplaçables dans les tests) ───────────────────

export const clipDeps = {
  /** Fiche de thème d'une marque ; `null` si le module des marques est absent ou la marque introuvable. */
  async loadTheme(kitId: string): Promise<BrandTheme | null> {
    try {
      return ((await apiModuleManager.callModuleFunction("brand-kit", "getBrandTheme", kitId)) as BrandTheme | null) ?? null;
    } catch {
      return null;
    }
  },
  ask(prompt: string, signal: AbortSignal): Promise<string> {
    return askCodex(prompt, { signal, origin: { module: "clip-studio", feature: "Découpe en clips" } });
  },
  transcribe: transcribeMediaFile,
  startImport: startRemoteImport,
  getImport: getRemoteImportJob,
  cancelImport: cancelRemoteImportJob,
  /** Coupe un passage en MP4 H.264 et AAC dans `output` ; rend ses flux. */
  async cutExcerpt(input: string, output: string, startMs: number, endMs: number, signal: AbortSignal): Promise<MediaStreams> {
    const ffmpeg = await ensureFfmpeg();
    if (!ffmpeg) throw new Error("ffmpeg n’est pas disponible sur le serveur : réessayez dans un moment.");
    const result = await runFfmpeg(ffmpeg, excerptArgs(input, output, startMs, endMs), {
      signal,
      timeoutMs: Math.max(5 * 60 * 1000, (endMs - startMs) * 20),
    }).catch((error) => {
      if (signal.aborted) throw abortError();
      throw error;
    });
    if (result.code !== 0 || !fs.existsSync(output)) throw new Error("L’extrait n’a pas pu être coupé : réessayez.");
    const streams = await inspect(ffmpeg, output);
    if (!streams.video) throw new Error("L’extrait coupé est illisible : réessayez.");
    return streams;
  },
};

/**
 * Arguments ffmpeg d'un extrait : recherche rapide puis réencodage, pour une
 * coupe à l'image près (une copie tomberait sur l'image clé la plus proche).
 * La cadence de la source est gardée (aucun `-r`).
 */
export function excerptArgs(input: string, output: string, startMs: number, endMs: number): string[] {
  const seconds = (ms: number) => String(Math.round(ms) / 1000);
  return [
    "-nostdin", "-hide_banner", "-y",
    "-ss", seconds(startMs),
    "-i", input,
    "-t", seconds(endMs - startMs),
    "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn", "-map_metadata", "-1",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart", "-threads", "2", "-progress", "pipe:1", "-nostats",
    output,
  ];
}

function abortError(): Error {
  const error = new Error("Création annulée.");
  error.name = "AbortError";
  return error;
}

// ─── Rangement des travaux ───────────────────────────────────────

const controllers = ((globalThis as any).__sxmClipJobs ??= new Map<string, AbortController>()) as Map<string, AbortController>;

// Les ménages des médias récupérés ne touchent pas à la source d'une découpe en cours ou en attente de choix.
remoteAssetGuards.busyFiles = () =>
  new Set(
    readJobs()
      .filter((job) => job.source && (job.status === "review" || (job.status === "running" && controllers.has(job.id))))
      .map((job) => job.source!.file)
  );

// ─── Envois reçus pour une création ──────────────────────────────

/** Délai pendant lequel un envoi peut être réclamé par une création. */
export const UPLOAD_CLAIM_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Vidéos reçues par le serveur (`registerAsset`) et encore réclamables :
 * fichier → instant de réception. En mémoire seulement : après un
 * redémarrage, plus rien n'est réclamable, et rien n'est donc effacé.
 */
const pendingUploads = ((globalThis as any).__sxmClipUploads ??= new Map<string, number>()) as Map<string, number>;

/** Note une vidéo que le serveur vient de recevoir et d'enregistrer comme média. */
export function noteUploadedAsset(file: string, now = Date.now()) {
  pendingUploads.set(file, now);
  for (const [entry, at] of pendingUploads) if (now - at > UPLOAD_CLAIM_TTL_MS) pendingUploads.delete(entry);
}

/**
 * Décide côté serveur si une création possède la vidéo envoyée qu'on lui
 * désigne (et peut donc l'effacer après la découpe) : reçue il y a moins de
 * deux heures, jamais servie à une autre création, sans provenance, et dont
 * aucun projet ne se sert. La réclamation est unique : toute création qui se
 * sert d'un envoi l'use, qu'elle le possède ou non.
 */
export function claimUploadedSource(asset: ClipAsset, now = Date.now()): boolean {
  const receivedAt = pendingUploads.get(asset.file);
  pendingUploads.delete(asset.file);
  if (receivedAt === undefined || now - receivedAt > UPLOAD_CLAIM_TTL_MS) return false;
  return !asset.origin && !usedAssetFiles().has(asset.file);
}

function readJobs(): ClipJob[] {
  try {
    const jobs = JSON.parse(fs.readFileSync(JOBS_FILE, "utf-8"));
    return Array.isArray(jobs) ? (jobs as ClipJob[]) : [];
  } catch {
    return [];
  }
}

function save(job: ClipJob) {
  ensureDirs();
  const jobs = [job, ...readJobs().filter((entry) => entry.id !== job.id)].slice(0, KEPT_JOBS);
  const temporary = `${JOBS_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(jobs, null, 2));
  fs.renameSync(temporary, JOBS_FILE);
}

function withInterruption(job: ClipJob): ClipJob {
  // Un travail « en cours » sans contrôleur a été interrompu par un redémarrage.
  return job.status === "running" && !controllers.has(job.id)
    ? { ...job, status: "error", error: "Interrompu par un redémarrage du serveur : relancez la création." }
    : job;
}

export function getClipJob(id: unknown): ClipJob | null {
  if (typeof id !== "string" || !JOB_ID.test(id)) return null;
  const job = readJobs().find((entry) => entry.id === id);
  return job ? withInterruption(job) : null;
}

/**
 * Annule un travail en cours, ou abandonne des passages proposés (`review`) :
 * une vidéo source récupérée pour l'occasion est alors effacée.
 */
export function cancelClipJob(id: unknown): boolean {
  const job = getClipJob(id);
  if (!job) return false;
  const controller = controllers.get(job.id);
  if (controller) {
    controller.abort();
    if (job.importJobId) clipDeps.cancelImport(job.importJobId);
    return true;
  }
  if (job.status !== "review") return false;
  job.status = "canceled";
  job.error = "Découpe abandonnée.";
  job.finishedAt = Date.now();
  if (job.source) job.sourceRemoved = removeOwnedSource(job.source);
  save(job);
  return true;
}

// ─── Demandes ────────────────────────────────────────────────────

/** Nom de fichier d'un média du module : simple, sans dossier ni fichier caché. */
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
  throw new Error("Choisissez une vidéo : une adresse, un média de Clip Studio ou un fichier envoyé.");
}

export function cleanClipRequest(kind: ClipJobKind, raw: unknown): ClipJobRequest {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const aspect = (Object.keys(ASPECTS) as AspectPreset[]).includes(input.aspect as AspectPreset) ? (input.aspect as AspectPreset) : "9:16";
  const hook = cleanText(input.hook, 120);
  return {
    kind,
    source: cleanSource(input.source),
    aspect,
    framing: input.framing === "blur" ? "blur" : "crop",
    ...(typeof input.brandKitId === "string" && KIT_ID.test(input.brandKitId) ? { brandKitId: input.brandKitId } : {}),
    ...(kind === "subtitle" && hook ? { hook } : {}),
  };
}

function newJob(request: ClipJobRequest): ClipJob {
  const fromUrl = request.source.type === "url";
  const importStep = { id: "import" as const, label: "Récupération de la vidéo", state: (fromUrl ? "pending" : "skipped") as StepState, ...(fromUrl ? {} : { detail: "Vidéo déjà dans Clip Studio" }) };
  const steps: ClipJob["steps"] =
    request.kind === "subtitle"
      ? [importStep, { id: "transcribe", label: "Transcription de la parole", state: "pending" }, { id: "montage", label: "Montage du clip", state: "pending" }]
      : [
          importStep,
          { id: "transcribe", label: "Transcription de la parole", state: "pending" },
          { id: "analyze", label: "Repérage des moments forts", state: "pending" },
          { id: "cut", label: "Découpe des extraits", state: "pending" },
          { id: "montage", label: "Montage des clips", state: "pending" },
        ];
  return {
    id: `cjob-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`,
    kind: request.kind,
    status: "running",
    request,
    steps,
    createdAt: Date.now(),
  };
}

function launch(job: ClipJob, work: (job: ClipJob, signal: AbortSignal) => Promise<void>) {
  const controller = new AbortController();
  controllers.set(job.id, controller);
  save(job);
  void work(job, controller.signal).finally(() => controllers.delete(job.id));
}

function assertCapacity() {
  if (controllers.size >= MAX_RUNNING_JOBS) throw new Error("Deux créations à partir d’une vidéo sont déjà en cours : attendez qu’une se termine.");
}

/** Lance « Sous-titrer un clip ». Suivi par `getClipJob`. */
export function startSubtitleClip(raw: unknown): ClipJob {
  assertCapacity();
  const job = newJob(cleanClipRequest("subtitle", raw));
  launch(job, runSubtitle);
  return job;
}

/** Lance « Découper une vidéo » ; le travail s'arrête sur les passages proposés (`review`). */
export function startClipping(raw: unknown): ClipJob {
  assertCapacity();
  const job = newJob(cleanClipRequest("clipping", raw));
  launch(job, runAnalysis);
  return job;
}

/**
 * Crée un clip par passage choisi (titre et bornes retouchés compris).
 * `keepSource` : garder la vidéo source, sinon effacée après la découpe
 * quand elle a été récupérée ou envoyée pour l'occasion.
 */
export function createClipsFromMoments(input: unknown): ClipJob {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const job = getClipJob(body.jobId);
  if (!job || job.kind !== "clipping") throw new Error("Découpe introuvable : relancez-la.");
  if (job.status !== "review" || !job.moments || !job.source) throw new Error("Ces passages ont déjà été traités.");
  assertCapacity();
  const moments = cleanMomentEdits(body.moments, job.moments, job.source.durationMs ?? Number.MAX_SAFE_INTEGER);
  job.status = "running";
  job.request = { ...job.request, keepSource: body.keepSource === true };
  delete job.error;
  launch(job, (current, signal) => runCuts(current, moments, signal));
  return job;
}

// ─── Étapes ──────────────────────────────────────────────────────

function stepper(job: ClipJob) {
  return (id: StepId, state: StepState, detail?: string) => {
    job.steps = job.steps.map((entry) => (entry.id === id ? { ...entry, state, ...(detail !== undefined ? { detail } : { detail: undefined }) } : entry));
    save(job);
  };
}

function fail(job: ClipJob, error: unknown, signal: AbortSignal) {
  const canceled = signal.aborted;
  const message = canceled
    ? "Création annulée."
    : error instanceof TranscriptionError
      ? error.message
      : // Sans chemin du serveur ni erreur système brute (disque plein, droits) : le détail reste dans les journaux.
        publicErrorMessage(error, "La création a échoué : réessayez.", "[clip-studio] création à partir d’une vidéo");
  if (!canceled && !(error instanceof TranscriptionError) && !(error && typeof error === "object" && "syscall" in error)) console.error("[clip-studio] création à partir d’une vidéo :", error instanceof Error ? error.message : error);
  job.steps = job.steps.map((step) => (step.state === "running" ? { ...step, state: canceled ? "skipped" : "error", detail: canceled ? "Annulé" : message } : step));
  job.status = canceled ? "canceled" : "error";
  job.error = message;
  job.finishedAt = Date.now();
  save(job);
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function assetByFile(file: string): ClipAsset | undefined {
  return readAssets().find((asset) => asset.file === file);
}

function toJobSource(asset: ClipAsset, owned: boolean): ClipJobSource {
  return {
    file: asset.file,
    url: `${ASSET_URL_PREFIX}${asset.file}`,
    name: asset.origin?.title ?? asset.originalName.replace(/\.[a-z0-9]{2,4}$/i, ""),
    ...(asset.durationMs ? { durationMs: asset.durationMs } : {}),
    ...(asset.width ? { width: asset.width, height: asset.height } : {}),
    owned,
  };
}

/** Vidéo source du travail : récupérée par adresse (V2), ou déjà parmi les médias du module. */
async function resolveSource(job: ClipJob, signal: AbortSignal, step: ReturnType<typeof stepper>): Promise<ClipAsset> {
  const source = job.request.source;
  if (source.type === "asset") {
    const asset = assetByFile(source.file);
    if (!asset || !fs.existsSync(path.join(ASSETS_DIR, asset.file))) throw new Error("Cette vidéo n’est plus dans Clip Studio.");
    if (asset.kind !== "video") throw new Error("Choisissez une vidéo.");
    // Possédée seulement si le serveur l'a reçue pour cette création, jamais sur la seule parole du navigateur.
    const claimed = claimUploadedSource(asset);
    job.source = toJobSource(asset, source.uploaded === true && claimed);
    job.title = job.source.name;
    save(job);
    return asset;
  }

  step("import", "running", "Lecture de l’adresse…");
  const started = clipDeps.startImport({ url: source.url, start: source.start, end: source.end, ...(job.kind === "clipping" ? { purpose: "clipping" } : {}) });
  job.importJobId = started.id;
  save(job);
  let lastDetail = "";
  for (;;) {
    if (signal.aborted) {
      clipDeps.cancelImport(started.id);
      throw abortError();
    }
    const current = clipDeps.getImport(started.id);
    if (!current) throw new Error("La récupération a disparu : relancez la création.");
    if (current.title && job.title !== current.title) job.title = current.title;
    if (current.status === "done" && current.asset) {
      delete job.importJobId;
      job.source = toJobSource(current.asset, true);
      job.title = current.title ?? job.source.name;
      step("import", "done", current.title ? `« ${current.title.slice(0, 120)} »` : "Vidéo récupérée");
      return current.asset;
    }
    if (current.status !== "running") throw new Error(current.error ?? "La vidéo n’a pas pu être récupérée.");
    const percent = current.progress !== undefined ? ` ${Math.round(current.progress * 100)} %` : "";
    const detail = `${current.phase === "convert" ? "Mise au format" : current.phase === "save" ? "Rangement" : "Téléchargement"}${percent}`;
    if (detail !== lastDetail) {
      lastDetail = detail;
      step("import", "running", detail);
    }
    await pause(1000);
  }
}

/** Mots de la vidéo : sa transcription rangée si elle existe, sinon Whisper (rangée ensuite avec le média). */
async function transcribeSource(asset: ClipAsset, signal: AbortSignal, step: ReturnType<typeof stepper>, feature: string): Promise<{ words: TimedWord[]; transcript: TranscriptInfo }> {
  const media = resolveMedia({ assetId: asset.file });
  const stored = storedTranscript(media);
  if (stored) {
    step("transcribe", "done", `Déjà transcrite : ${stored.words.length} mots`);
    return stored;
  }
  step("transcribe", "running", "Extraction du son…");
  const result = await clipDeps.transcribe(media.path, {
    signal,
    feature,
    onProgress: (progress) => {
      if (progress.stage === "extracting") return;
      step("transcribe", "running", progress.total > 1 ? `Envoi à OpenAI, partie ${Math.min(progress.done + 1, progress.total)} sur ${progress.total}…` : "Envoi à OpenAI…");
    },
  });
  if (signal.aborted) throw abortError();
  const transcript: TranscriptInfo = { provider: "openai", ...(result.language ? { language: result.language } : {}), at: Date.now() };
  storeTranscript(media, result.words, transcript);
  step("transcribe", "done", `${result.words.length} mots`);
  return { words: result.words, transcript };
}

/** Média du module prêt à poser sur la timeline. */
export function assetSource(asset: ClipAsset): MediaSource {
  return {
    url: `${ASSET_URL_PREFIX}${asset.file}`,
    ref: `module:clip-studio/assets/${asset.file}`,
    name: asset.originalName,
    kind: asset.kind,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    ...(asset.credit ? { credit: asset.credit } : {}),
    ...(asset.rights ? { rights: asset.rights } : {}),
    ...(asset.words ? { words: asset.words } : {}),
    ...(asset.transcript ? { transcript: asset.transcript } : {}),
    ...(typeof asset.hasAudio === "boolean" ? { hasAudio: asset.hasAudio } : {}),
    ...(asset.origin ? { origin: asset.origin } : {}),
  };
}

async function loadTheme(job: ClipJob): Promise<BrandTheme | null> {
  return job.request.brandKitId ? clipDeps.loadTheme(job.request.brandKitId) : null;
}

async function runSubtitle(job: ClipJob, signal: AbortSignal) {
  const step = stepper(job);
  try {
    ensureDirs();
    const asset = await resolveSource(job, signal, step);
    const { words, transcript } = await transcribeSource(asset, signal, step, "Sous-titrer un clip");
    if (!words.length) throw new TranscriptionError("Aucune parole reconnue dans cette vidéo : rien à sous-titrer.");

    step("montage", "running", "Habillage de la marque…");
    const theme = await loadTheme(job);
    if (signal.aborted) throw abortError();
    const project = buildSubtitledClip({
      name: job.request.hook || job.title || "Clip sous-titré",
      aspect: job.request.aspect,
      source: { ...assetSource(asset), words, transcript },
      framing: job.request.framing,
      theme,
      hook: job.request.hook,
    });
    writeProject({ ...project, origin: "subtitle" });
    job.projectId = project.id;
    job.status = "done";
    job.finishedAt = Date.now();
    step("montage", "done", `${Math.round((asset.durationMs ?? 0) / 1000)} s, sous-titres posés`);
  } catch (error) {
    fail(job, error, signal);
    // Un passage récupéré reste dans Mes médias : la relance n'a pas à le télécharger de nouveau.
    if (!signal.aborted && job.source?.owned) {
      job.error = `${job.error} La vidéo récupérée reste dans Mes médias.`;
      save(job);
    }
  }
}

async function runAnalysis(job: ClipJob, signal: AbortSignal) {
  const step = stepper(job);
  try {
    ensureDirs();
    const asset = await resolveSource(job, signal, step);
    const durationMs = asset.durationMs ?? 0;
    if (durationMs < MOMENT_LIMITS.minMs) throw new Error("Cette vidéo est trop courte pour être découpée : 15 secondes au moins.");
    const { words } = await transcribeSource(asset, signal, step, "Découpe en clips");
    if (!words.length) throw new TranscriptionError("Aucune parole reconnue dans cette vidéo : rien à découper.");

    step("analyze", "running", "Codex lit la transcription…");
    const moments = await analyzeMoments({ title: job.title ?? "Vidéo", durationMs, words }, (prompt, part) => {
      if (signal.aborted) throw abortError();
      if (part.total > 1) step("analyze", "running", `Codex lit la transcription, partie ${part.index + 1} sur ${part.total}…`);
      return clipDeps.ask(prompt, signal);
    });
    if (signal.aborted) throw abortError();
    job.moments = moments;
    job.status = "review";
    step("analyze", "done", `${moments.length} passage${moments.length > 1 ? "s" : ""} proposé${moments.length > 1 ? "s" : ""}`);
  } catch (error) {
    fail(job, error, signal);
    // Une longue vidéo récupérée pour rien n'encombre pas le disque.
    if (job.source?.owned && job.request.source.type === "url") {
      job.sourceRemoved = removeOwnedSource(job.source);
      save(job);
    }
  }
}

/** Fichiers de médias du module dont se sert au moins un projet. */
function usedAssetFiles(): Set<string> {
  const used = new Set<string>();
  for (const project of listProjectFiles()) {
    for (const track of project.tracks ?? []) {
      for (const item of track.items ?? []) {
        const url = "source" in item ? (item.source as { url?: unknown })?.url : undefined;
        if (typeof url === "string" && url.startsWith(ASSET_URL_PREFIX)) used.add(decodeURIComponent(url.slice(ASSET_URL_PREFIX.length).split(/[?#]/)[0]));
      }
    }
  }
  return used;
}

/** Efface la vidéo source récupérée ou envoyée pour ce travail, si aucun projet ne s'en sert. */
function removeOwnedSource(source: ClipJobSource): boolean {
  if (!source.owned || usedAssetFiles().has(source.file)) return false;
  fs.rmSync(path.join(ASSETS_DIR, source.file), { force: true });
  writeAssets(readAssets().filter((asset) => asset.file !== source.file));
  return true;
}

/** Nom de fichier lisible tiré d'un titre. */
function fileTitle(title: string): string {
  return title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150) || "Extrait";
}

/** Fiche du média d'un extrait : provenance, mention et droits de la source, mots remis à zéro. */
export function excerptAsset(source: ClipAsset, moment: ClipMoment, file: string, size: number, streams: MediaStreams, now = Date.now()): ClipAsset {
  const startSec = moment.startMs / 1000;
  const endSec = moment.endMs / 1000;
  const offset = source.origin?.section?.start ?? 0;
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    file,
    kind: "video",
    originalName: `${fileTitle(moment.title)}.mp4`,
    size,
    width: streams.width ?? source.width,
    height: streams.height ?? source.height,
    durationMs: streams.durationSec ? Math.round(streams.durationSec * 1000) : moment.endMs - moment.startMs,
    ...(source.credit ? { credit: source.credit } : {}),
    ...(source.rights ? { rights: source.rights } : {}),
    ...(source.origin ? { origin: { ...source.origin, section: { start: round(offset + startSec), end: round(offset + endSec) } }, lastUsedAt: now } : {}),
    hasAudio: Boolean(streams.audio),
    words: momentWords(source.words ?? [], moment.startMs, moment.endMs),
    ...(source.transcript ? { transcript: source.transcript } : {}),
    createdAt: now,
  };
}

async function runCuts(job: ClipJob, moments: ClipMoment[], signal: AbortSignal) {
  const step = stepper(job);
  const workDir = path.join(WORK_DIR, job.id);
  const releaseWorkDir = holdWorkDir(workDir);
  try {
    ensureDirs();
    const source = job.source ? assetByFile(job.source.file) : undefined;
    if (!source || !fs.existsSync(path.join(ASSETS_DIR, source.file))) throw new Error("La vidéo source n’est plus dans Clip Studio : relancez la découpe.");
    // Place des extraits, plus 2 Go de marge, contrôlée avant la première coupe.
    assertDiskSpace(DATA_DIR, excerptsBytes(source, moments));
    fs.mkdirSync(workDir, { recursive: true });
    const theme = await loadTheme(job);
    job.clips = [];
    const total = moments.length;
    for (const [index, moment] of moments.entries()) {
      if (signal.aborted) throw abortError();
      step("cut", "running", `Extrait ${index + 1} sur ${total}`);
      const output = path.join(workDir, `excerpt-${index}.mp4`);
      const streams = await clipDeps.cutExcerpt(path.join(ASSETS_DIR, source.file), output, moment.startMs, moment.endMs, signal);
      const file = `excerpt-${Date.now().toString(36)}${randomBytes(4).toString("hex")}.mp4`;
      const size = fs.statSync(output).size;
      fs.renameSync(output, path.join(ASSETS_DIR, file));
      const asset = excerptAsset(source, moment, file, size, streams);
      writeAssets([asset, ...readAssets().filter((entry) => entry.file !== file)]);

      step("montage", "running", `Clip ${index + 1} sur ${total}`);
      const project = buildSubtitledClip({
        name: moment.title,
        aspect: job.request.aspect,
        source: assetSource(asset),
        framing: job.request.framing,
        theme,
        hook: moment.title,
      });
      writeProject({ ...project, origin: "clipping" });
      job.clips.push({ projectId: project.id, name: moment.title, durationMs: asset.durationMs ?? moment.endMs - moment.startMs, momentId: moment.id });
      save(job);
    }
    step("cut", "done", `${total} extrait${total > 1 ? "s" : ""}`);
    if (job.source && !job.request.keepSource) job.sourceRemoved = removeOwnedSource(job.source);
    job.status = "done";
    job.finishedAt = Date.now();
    step("montage", "done", `${total} clip${total > 1 ? "s" : ""} créé${total > 1 ? "s" : ""}`);
  } catch (error) {
    fail(job, error, signal);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
    releaseWorkDir();
  }
}

/**
 * Place que peuvent prendre les extraits : la part de la source qu'ils
 * couvrent, doublée (réencodés à meilleure qualité que la source à débit
 * plafonné), 200 Mo au moins.
 */
export function excerptsBytes(source: Pick<ClipAsset, "size" | "durationMs">, moments: Pick<ClipMoment, "startMs" | "endMs">[]): number {
  const covered = moments.reduce((sum, moment) => sum + Math.max(0, moment.endMs - moment.startMs), 0);
  const size = Number(source.size) || 0;
  const share = source.durationMs ? Math.min(1, covered / source.durationMs) : 1;
  return Math.max(200 * 1024 * 1024, Math.ceil(size * share * 2));
}
