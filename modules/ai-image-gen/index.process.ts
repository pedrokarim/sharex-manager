/**
 * Surface exposée à l'interface.
 *
 * Chaque fonction exportée devient automatiquement appelable depuis le client
 * par `/api/modules/call-function`. Le fichier reste donc volontairement mince :
 * il valide, délègue, et ne contient aucune logique métier.
 */

import fs from "fs";
import path from "path";
import { ModuleHooks } from "../../types/modules";
import {
  getCatalog,
  probeCliEngines,
  testApiKey,
  type CliEngineStatus,
  type CustomEngineConfig,
  type ModelAvailability,
} from "./lib/engines/registry";
import { buildEngineConfig, saveToGallery, upscaleImage } from "./lib/generate";
import {
  cancelJob,
  clearFinishedJobs,
  enqueueJob,
  getJob,
  listJobs,
  type EnqueueInput,
} from "./lib/jobs";
import {
  API_ENGINE_IDS,
  IMAGES_DIR,
  apiKeyComesFromEnv,
  ensureDataDirs,
  envVariableFor,
  randomSlug,
  readCollections,
  readHistory,
  readPipelines,
  readSecrets,
  removeImageFiles,
  resolveApiKeys,
  setInjectedSettings,
  writeCollections,
  writeHistory,
  writePipelines,
  writeSecrets,
  type Collection,
  type CollectionAnchor,
  type HistoryItem,
  type Pipeline,
} from "./lib/store";

// ─── Catalogue et moteurs ────────────────────────────────────────

export interface CatalogPayload {
  models: ModelAvailability[];
  cli: CliEngineStatus[];
  apiEngines: {
    id: string;
    label: string;
    configured: boolean;
    fromEnv: boolean;
    hint: string;
    envVariable?: string;
  }[];
}

const API_ENGINE_LABELS: Record<string, string> = {
  openai: "OpenAI",
  stability: "Stability AI",
  google: "Google AI",
};

/** Renseigne l'interface sur l'état des clés sans jamais les renvoyer. */
function describeApiEngines() {
  const keys = resolveApiKeys();
  return API_ENGINE_IDS.map((id) => {
    const value = keys[id] ?? "";
    return {
      id,
      label: API_ENGINE_LABELS[id] ?? id,
      configured: value.length > 0,
      fromEnv: apiKeyComesFromEnv(id),
      // Les quatre derniers caractères suffisent à reconnaître une clé sans
      // l'exposer.
      hint: value ? `••••••••${value.slice(-4)}` : "",
      envVariable: envVariableFor(id),
    };
  });
}

export async function getCatalogue(): Promise<CatalogPayload> {
  const config = buildEngineConfig();
  const { models, cli } = await getCatalog(config);
  return { models, cli, apiEngines: describeApiEngines() };
}

/** Relance la détection des CLI, sans passer par le catalogue complet. */
export async function detectCliEngines(): Promise<CliEngineStatus[]> {
  return probeCliEngines(buildEngineConfig());
}

export async function getSecretsStatus() {
  return describeApiEngines();
}

export async function saveApiKey(
  engineId: string,
  value: string
): Promise<{ success: boolean }> {
  const secrets = readSecrets();
  // Une chaîne vide efface la clé, ce qui permet de retirer un moteur sans
  // toucher aux autres.
  if (value) secrets.apiKeys[engineId] = value;
  else delete secrets.apiKeys[engineId];
  writeSecrets(secrets);
  return { success: true };
}

export async function saveCliSettings(
  engineId: string,
  settings: {
    enabled?: boolean;
    binaryPath?: string;
    assumeImageCapable?: boolean;
    timeoutSeconds?: number;
  }
): Promise<{ success: boolean }> {
  const secrets = readSecrets();
  const current = secrets.cli[engineId] ?? {};
  const next = { ...current, ...settings };
  if (!next.binaryPath) delete next.binaryPath;
  secrets.cli[engineId] = next;
  writeSecrets(secrets);
  return { success: true };
}

export async function saveCustomEngine(
  engine: CustomEngineConfig
): Promise<{ success: boolean; id: string }> {
  if (!engine.label?.trim()) throw new Error("Le nom du moteur est vide.");
  if (!engine.binary?.trim()) throw new Error("La commande est vide.");
  if (!engine.argsTemplate?.length) {
    throw new Error("Le gabarit d'arguments est vide.");
  }

  const secrets = readSecrets();
  const id = engine.id?.trim() || `custom-${randomSlug(6)}`;
  const entry: CustomEngineConfig = { ...engine, id };
  const index = secrets.customEngines.findIndex((item) => item.id === id);
  if (index >= 0) secrets.customEngines[index] = entry;
  else secrets.customEngines.push(entry);
  writeSecrets(secrets);
  return { success: true, id };
}

export async function deleteCustomEngine(
  id: string
): Promise<{ success: boolean }> {
  const secrets = readSecrets();
  secrets.customEngines = secrets.customEngines.filter((item) => item.id !== id);
  delete secrets.cli[id];
  writeSecrets(secrets);
  return { success: true };
}

export async function testConnection(
  engineId: string
): Promise<{ success: boolean; message: string }> {
  const keys = resolveApiKeys();
  return testApiKey(engineId, keys[engineId]);
}

// ─── Travaux ─────────────────────────────────────────────────────

export async function enqueueGeneration(input: EnqueueInput) {
  return enqueueJob(input);
}

export async function getJobs(limit = 40) {
  return listJobs(limit);
}

export async function getJobById(id: string) {
  return getJob(id) ?? null;
}

export async function cancelGeneration(id: string) {
  return cancelJob(id);
}

export async function clearJobs() {
  return clearFinishedJobs();
}

/**
 * Un seul aller-retour pour rafraîchir le studio : les travaux en cours et les
 * dernières générations. Deux appels séparés donneraient un instant où la file
 * annonce « terminé » alors que l'image n'est pas encore dans la liste.
 */
export async function getStudioState(historyLimit = 40) {
  return {
    jobs: listJobs(20),
    history: readHistory().slice(0, historyLimit),
  };
}

// ─── Historique ──────────────────────────────────────────────────

export async function getHistory(limit = 200): Promise<HistoryItem[]> {
  return readHistory().slice(0, limit);
}

/** Compteurs de la bibliothèque, calculés côté serveur pour éviter de rapatrier tout l'historique. */
export async function getStats() {
  const items = readHistory();
  const byModel = new Map<string, { label: string; count: number }>();
  let images = 0;
  let inGallery = 0;

  for (const item of items) {
    images += item.imageFiles.length;
    inGallery += Object.keys(item.savedToGallery ?? {}).length;
    const entry = byModel.get(item.model) ?? {
      label: item.modelLabel ?? item.model,
      count: 0,
    };
    entry.count++;
    byModel.set(item.model, entry);
  }

  let diskBytes = 0;
  if (fs.existsSync(IMAGES_DIR)) {
    for (const file of fs.readdirSync(IMAGES_DIR)) {
      try {
        diskBytes += fs.statSync(path.join(IMAGES_DIR, file)).size;
      } catch {
        // Fichier disparu entre le listing et le stat : sans importance ici.
      }
    }
  }

  return {
    generations: items.length,
    images,
    favorites: items.filter((item) => item.favorite).length,
    inGallery,
    diskBytes,
    byModel: [...byModel.entries()]
      .map(([model, entry]) => ({ model, ...entry }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function clearHistory(): Promise<{ success: boolean }> {
  const items = readHistory();
  for (const item of items) removeImageFiles(item.imageFiles);
  writeHistory([]);
  return { success: true };
}

export async function deleteHistoryItem(id: string): Promise<{ success: boolean }> {
  const items = readHistory();
  const item = items.find((entry) => entry.id === id);
  if (item) removeImageFiles(item.imageFiles);
  writeHistory(items.filter((entry) => entry.id !== id));
  return { success: true };
}

/** Supprime une seule image d'un lot ; la génération disparaît si elle se vide. */
export async function deleteImage(
  id: string,
  file: string
): Promise<{ success: boolean }> {
  const items = readHistory();
  const item = items.find((entry) => entry.id === id);
  if (!item) return { success: false };

  removeImageFiles([file]);
  item.imageFiles = item.imageFiles.filter((entry) => entry !== file);
  if (item.savedToGallery) delete item.savedToGallery[file];

  writeHistory(
    item.imageFiles.length > 0 ? items : items.filter((entry) => entry.id !== id)
  );
  return { success: true };
}

export async function toggleFavorite(
  id: string
): Promise<{ success: boolean; favorite: boolean }> {
  const items = readHistory();
  const item = items.find((entry) => entry.id === id);
  if (!item) return { success: false, favorite: false };
  item.favorite = !item.favorite;
  writeHistory(items);
  return { success: true, favorite: item.favorite };
}

export async function assignCollection(
  historyId: string,
  collectionId: string | null
): Promise<{ success: boolean }> {
  const items = readHistory();
  const item = items.find((entry) => entry.id === historyId);
  if (!item) return { success: false };
  if (collectionId) item.collectionId = collectionId;
  else delete item.collectionId;
  writeHistory(items);
  return { success: true };
}

// ─── Galerie et retouches locales ────────────────────────────────

export async function sendToGallery(id: string, file: string) {
  return saveToGallery(id, file);
}

export async function sendAllToGallery(id: string) {
  const item = readHistory().find((entry) => entry.id === id);
  if (!item) return { success: false, error: "Génération introuvable" };
  const saved: Record<string, string> = {};
  for (const file of item.imageFiles) {
    const result = await saveToGallery(id, file);
    if (result.success && result.fileName) saved[file] = result.fileName;
  }
  return { success: true, saved };
}

export async function upscale(id: string, file: string, scale = 2) {
  return upscaleImage(id, file, scale);
}

// ─── Collections ─────────────────────────────────────────────────

export async function listCollections(): Promise<Collection[]> {
  return readCollections().sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveCollection(
  input: Partial<Collection> & { name: string }
): Promise<Collection> {
  if (!input.name?.trim()) throw new Error("Le nom de la collection est vide.");

  const collections = readCollections();
  const now = Date.now();
  const existing = input.id
    ? collections.find((entry) => entry.id === input.id)
    : undefined;

  if (existing) {
    Object.assign(existing, input, { updatedAt: now });
    writeCollections(collections);
    return existing;
  }

  const created: Collection = {
    id: `col-${now}-${randomSlug(6)}`,
    name: input.name.trim(),
    description: input.description,
    synopsis: input.synopsis,
    styleNotes: input.styleNotes,
    anchors: input.anchors ?? [],
    coverFile: input.coverFile,
    createdAt: now,
    updatedAt: now,
  };
  collections.push(created);
  writeCollections(collections);
  return created;
}

export async function deleteCollection(id: string): Promise<{ success: boolean }> {
  writeCollections(readCollections().filter((entry) => entry.id !== id));
  const items = readHistory();
  let touched = false;
  for (const item of items) {
    if (item.collectionId === id) {
      delete item.collectionId;
      touched = true;
    }
  }
  if (touched) writeHistory(items);
  return { success: true };
}

/**
 * Une ancre fige une image comme repère visuel de la série. Elle sera jointe à
 * toutes les générations de la collection, ce qui tient un personnage ou un
 * décor cohérent d'une scène à l'autre.
 */
export async function addCollectionAnchor(
  collectionId: string,
  file: string,
  label: string,
  note?: string
): Promise<{ success: boolean; anchor?: CollectionAnchor }> {
  const collections = readCollections();
  const collection = collections.find((entry) => entry.id === collectionId);
  if (!collection) return { success: false };

  if (!fs.existsSync(path.join(IMAGES_DIR, path.basename(file)))) {
    return { success: false };
  }

  const anchor: CollectionAnchor = {
    id: `anchor-${Date.now()}-${randomSlug(4)}`,
    label: label?.trim() || "Référence",
    file: path.basename(file),
    note,
  };
  collection.anchors = [...(collection.anchors ?? []), anchor];
  collection.updatedAt = Date.now();
  writeCollections(collections);
  return { success: true, anchor };
}

export async function removeCollectionAnchor(
  collectionId: string,
  anchorId: string
): Promise<{ success: boolean }> {
  const collections = readCollections();
  const collection = collections.find((entry) => entry.id === collectionId);
  if (!collection) return { success: false };
  collection.anchors = (collection.anchors ?? []).filter(
    (anchor) => anchor.id !== anchorId
  );
  collection.updatedAt = Date.now();
  writeCollections(collections);
  return { success: true };
}

// ─── Pipelines ───────────────────────────────────────────────────

export async function listPipelines(): Promise<Pipeline[]> {
  return readPipelines().sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function savePipeline(
  input: Partial<Pipeline> & { name: string; steps: Pipeline["steps"] }
): Promise<Pipeline> {
  if (!input.name?.trim()) throw new Error("Le nom du pipeline est vide.");
  if (!input.steps?.length) throw new Error("Un pipeline sans étape ne sert à rien.");

  const pipelines = readPipelines();
  const now = Date.now();
  const existing = input.id
    ? pipelines.find((entry) => entry.id === input.id)
    : undefined;

  if (existing) {
    Object.assign(existing, input, { updatedAt: now });
    writePipelines(pipelines);
    return existing;
  }

  const created: Pipeline = {
    id: `pipe-${now}-${randomSlug(6)}`,
    name: input.name.trim(),
    description: input.description,
    steps: input.steps.map((step, index) => ({
      ...step,
      id: step.id || `step-${index}-${randomSlug(4)}`,
    })),
    createdAt: now,
    updatedAt: now,
  };
  pipelines.push(created);
  writePipelines(pipelines);
  return created;
}

export async function deletePipeline(id: string): Promise<{ success: boolean }> {
  writePipelines(readPipelines().filter((entry) => entry.id !== id));
  return { success: true };
}

// ─── Cycle de vie ────────────────────────────────────────────────

const moduleHooks: ModuleHooks = {
  onInit: () => {
    ensureDataDirs();
    console.log("Module AI Image Gen initialisé");
  },
  onEnable: () => console.log("Module AI Image Gen activé"),
  onDisable: () => console.log("Module AI Image Gen désactivé"),
};

export function initModule(config: any) {
  setInjectedSettings(config?.settings ?? {});
  ensureDataDirs();
  return moduleHooks;
}

export default moduleHooks;
