/**
 * Accès disque du module : réglages, secrets, historique, collections.
 *
 * Tout vit sous `data/`, ignoré par git. Les clés API en particulier ne
 * peuvent pas aller dans `module.json` : ce fichier est versionné, donc y
 * écrire une clé la ferait entrer dans l'historique au prochain commit.
 */

import fs from "fs";
import path from "path";
import type { CustomEngineConfig, CliEngineSettings } from "./engines/registry";
import type { LogLine } from "./engines/types";

export const MODULE_DIR = path.join(process.cwd(), "modules", "ai-image-gen");
export const DATA_DIR = path.join(MODULE_DIR, "data");
export const IMAGES_DIR = path.join(DATA_DIR, "images");
export const WORK_DIR = path.join(DATA_DIR, "work");
/** Images de départ fournies par l'utilisateur, référencées par les travaux. */
export const REFS_DIR = path.join(DATA_DIR, "refs");

const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const SECRETS_FILE = path.join(DATA_DIR, "secrets.json");
const COLLECTIONS_FILE = path.join(DATA_DIR, "collections.json");
const PIPELINES_FILE = path.join(DATA_DIR, "pipelines.json");
const JOBS_FILE = path.join(DATA_DIR, "jobs.json");

export function ensureDataDirs() {
  for (const dir of [DATA_DIR, IMAGES_DIR, WORK_DIR, REFS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

/**
 * Écriture par fichier temporaire puis renommage : une coupure au milieu d'un
 * `writeFileSync` laisserait un JSON tronqué, et tout l'historique avec lui.
 */
export function writeJson(file: string, value: unknown, mode?: number) {
  ensureDataDirs();
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), mode ? { mode } : {});
  fs.renameSync(temporary, file);
}

export function randomSlug(length = 12): string {
  const alphabet =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let index = 0; index < length; index++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

// ─── Réglages non sensibles ──────────────────────────────────────

export interface ModuleSettings {
  default_model?: string;
  default_size?: string;
  default_quality?: string;
  default_count?: number;
  save_to_gallery?: boolean;
  notes_preprompt?: string;
  default_negative_prompt?: string;
  /** Nombre de travaux exécutés en parallèle. */
  max_parallel_jobs?: number;
}

let injectedSettings: ModuleSettings = {};

export function setInjectedSettings(settings: ModuleSettings) {
  injectedSettings = settings ?? {};
}

export function getSettings(): ModuleSettings {
  const config = readJson<{ settings?: ModuleSettings }>(
    path.join(MODULE_DIR, "module.json"),
    {}
  );
  return { ...injectedSettings, ...(config.settings ?? {}) };
}

// ─── Secrets et configuration des moteurs ────────────────────────

export interface EngineSecrets {
  apiKeys: Record<string, string>;
  cli: Record<string, CliEngineSettings>;
  customEngines: CustomEngineConfig[];
  /** Ancien format, conservé pour la migration. */
  openai_api_key?: string;
  stability_api_key?: string;
}

/** Variables d'environnement reconnues, par moteur. */
const ENV_KEYS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  stability: "STABILITY_API_KEY",
  google: "GOOGLE_API_KEY",
};

export const API_ENGINE_IDS = Object.keys(ENV_KEYS);

/**
 * Relit les secrets en migrant l'ancien format plat au passage. Les deux
 * premières versions du module stockaient `openai_api_key` à la racine ; les
 * effacer silencieusement priverait l'utilisateur de sa clé.
 */
export function readSecrets(): EngineSecrets {
  const raw = readJson<Partial<EngineSecrets>>(SECRETS_FILE, {});
  const apiKeys: Record<string, string> = { ...(raw.apiKeys ?? {}) };

  if (raw.openai_api_key && !apiKeys.openai) apiKeys.openai = raw.openai_api_key;
  if (raw.stability_api_key && !apiKeys.stability) {
    apiKeys.stability = raw.stability_api_key;
  }

  return {
    apiKeys,
    cli: raw.cli ?? {},
    customEngines: raw.customEngines ?? [],
  };
}

export function writeSecrets(secrets: EngineSecrets) {
  writeJson(
    SECRETS_FILE,
    {
      apiKeys: secrets.apiKeys,
      cli: secrets.cli,
      customEngines: secrets.customEngines,
    },
    0o600
  );
}

/**
 * Une variable d'environnement prime sur le fichier : en conteneur, la clé
 * arrive par `env_file` et le volume de données peut être vierge.
 */
export function resolveApiKeys(secrets = readSecrets()): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [engineId, variable] of Object.entries(ENV_KEYS)) {
    const value = process.env[variable] || secrets.apiKeys[engineId] || "";
    if (value) resolved[engineId] = value;
  }
  for (const [engineId, value] of Object.entries(secrets.apiKeys)) {
    if (value && !resolved[engineId]) resolved[engineId] = value;
  }
  return resolved;
}

export function apiKeyComesFromEnv(engineId: string): boolean {
  const variable = ENV_KEYS[engineId];
  return Boolean(variable && process.env[variable]);
}

export function envVariableFor(engineId: string): string | undefined {
  return ENV_KEYS[engineId];
}

// ─── Historique ──────────────────────────────────────────────────

export interface HistoryItem {
  id: string;
  prompt: string;
  /** Prompt effectivement envoyé, notes comprises. */
  finalPrompt: string;
  negativePrompt?: string;
  notes: string;
  /** Identifiant du moteur : openai, codex, google… */
  provider: string;
  model: string;
  modelLabel?: string;
  size: string;
  quality?: string;
  count: number;
  imageFiles: string[];
  revisedPrompt?: string;
  /** Fichiers copiés dans la galerie, indexés par nom de fichier local. */
  savedToGallery?: Record<string, string>;
  usedReference?: boolean;
  favorite?: boolean;
  durationMs?: number;
  createdAt: number;
  /** Collection à laquelle la génération appartient. */
  collectionId?: string;
  /** Génération dont celle-ci est une variante ou une retouche. */
  parentId?: string;
  /** Étape de pipeline à l'origine de la génération. */
  pipelineId?: string;
  seed?: number;
  jobId?: string;
}

export function readHistory(): HistoryItem[] {
  return readJson<HistoryItem[]>(HISTORY_FILE, []);
}

export function writeHistory(items: HistoryItem[]) {
  writeJson(HISTORY_FILE, items);
}

export function findHistoryItem(id: string): HistoryItem | undefined {
  return readHistory().find((item) => item.id === id);
}

export function removeImageFiles(files: string[]) {
  for (const file of files) {
    // `basename` empêche qu'un nom forgé (« ../../.env ») sorte du dossier.
    const target = path.join(IMAGES_DIR, path.basename(file));
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
}

// ─── Collections ─────────────────────────────────────────────────

export interface Collection {
  id: string;
  name: string;
  description?: string;
  /** Trame narrative partagée par toutes les scènes de la série. */
  synopsis?: string;
  /** Consignes de style ajoutées à chaque génération de la collection. */
  styleNotes?: string;
  /** Références persistantes : personnages, décors, chartes. */
  anchors?: CollectionAnchor[];
  coverFile?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CollectionAnchor {
  id: string;
  label: string;
  /** Fichier stocké dans `data/images`. */
  file: string;
  /** Description textuelle injectée dans le prompt. */
  note?: string;
}

export function readCollections(): Collection[] {
  return readJson<Collection[]>(COLLECTIONS_FILE, []);
}

export function writeCollections(collections: Collection[]) {
  writeJson(COLLECTIONS_FILE, collections);
}

// ─── Pipelines ───────────────────────────────────────────────────

export type PipelineStepKind = "generate" | "variant" | "edit" | "upscale" | "gallery";

export interface PipelineStep {
  id: string;
  kind: PipelineStepKind;
  label?: string;
  /** Prompt de l'étape ; `{prompt}` reprend celui de la demande initiale. */
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  size?: string;
  quality?: string;
  n?: number;
  /** Facteur d'agrandissement pour une étape `upscale`. */
  scale?: number;
  /** L'étape garde-t-elle ses rendus dans l'historique final ? */
  keep?: boolean;
}

export interface Pipeline {
  id: string;
  name: string;
  description?: string;
  steps: PipelineStep[];
  createdAt: number;
  updatedAt: number;
}

export function readPipelines(): Pipeline[] {
  return readJson<Pipeline[]>(PIPELINES_FILE, []);
}

export function writePipelines(pipelines: Pipeline[]) {
  writeJson(PIPELINES_FILE, pipelines);
}

// ─── Travaux ─────────────────────────────────────────────────────

export type JobStatus = "queued" | "running" | "done" | "error" | "canceled";

export interface JobRequest {
  prompt: string;
  negativePrompt?: string;
  notes?: string;
  model: string;
  size: string;
  quality?: string;
  n: number;
  seed?: number;
  collectionId?: string;
  parentId?: string;
  pipelineId?: string;
  /**
   * Références transmises au moteur. On stocke des noms de fichiers de
   * `data/refs` plutôt que du base64 : le fichier des travaux est relu et
   * réécrit à chaque changement d'état, y loger des images le ferait grossir
   * de plusieurs mégaoctets par génération.
   */
  references?: JobReference[];
}

export interface JobReference {
  file: string;
  mimeType: string;
  role?: "reference" | "edit-target";
  /**
   * Dossier où lire le fichier. Une étape de pipeline repart d'une image déjà
   * archivée, qu'il serait inutile de recopier dans `data/refs` pour la durée
   * du travail.
   */
  from?: "refs" | "images";
}

/** Range une image de départ et rend la description à conserver. */
export function storeReference(
  b64: string,
  mimeType: string,
  role?: "reference" | "edit-target"
): JobReference {
  ensureDataDirs();
  const extension = (mimeType.split("/")[1] || "png").split("+")[0];
  const file = `ref-${Date.now()}-${randomSlug(6)}.${extension}`;
  fs.writeFileSync(path.join(REFS_DIR, file), Buffer.from(b64, "base64"));
  return { file, mimeType, role };
}

/** Relit une référence pour la passer au moteur. */
export function loadReference(reference: JobReference): {
  b64: string;
  mimeType: string;
  role?: "reference" | "edit-target";
} {
  const directory = reference.from === "images" ? IMAGES_DIR : REFS_DIR;
  const full = path.join(directory, path.basename(reference.file));
  return {
    b64: fs.readFileSync(full).toString("base64"),
    mimeType: reference.mimeType,
    role: reference.role,
  };
}

export function removeReferences(references: JobReference[] | undefined) {
  for (const reference of references ?? []) {
    // Seules les images déposées pour le travail sont jetables : celles de
    // `data/images` appartiennent à l'historique.
    if (reference.from === "images") continue;
    const full = path.join(REFS_DIR, path.basename(reference.file));
    try {
      if (fs.existsSync(full)) fs.unlinkSync(full);
    } catch {
      // Suppression opportuniste : un fichier déjà parti n'est pas un problème.
    }
  }
}

export interface Job {
  id: string;
  status: JobStatus;
  request: JobRequest;
  modelLabel: string;
  engineId: string;
  engineKind: "api" | "cli";
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  progress: { current: number; total: number; label: string };
  log: LogLine[];
  historyIds: string[];
  error?: string;
  /** Étape courante d'un pipeline, pour l'affichage. */
  pipelineStep?: { index: number; total: number; label: string };
}

export function readJobs(): Job[] {
  return readJson<Job[]>(JOBS_FILE, []);
}

export function writeJobs(jobs: Job[]) {
  writeJson(JOBS_FILE, jobs);
}
