import fs from "fs";
import path from "path";
import { ModuleHooks } from "../../types/modules";
import { getAbsoluteUploadPath } from "../../lib/config";
import {
  generateWithOpenAI,
  generateWithStability,
  getModelSpec,
  MODELS,
  type GenerateImageResult,
  type ProviderId,
} from "./lib/providers";

let moduleSettings: Record<string, any> = {};

const MODULE_DIR = path.join(process.cwd(), "modules", "ai-image-gen");
const DATA_DIR = path.join(MODULE_DIR, "data");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");

/**
 * Les clés API vivent ici et non dans `module.json` : ce dernier est versionné,
 * donc y écrire une clé la ferait entrer dans l'historique git au prochain
 * commit. `data/` est ignoré par git.
 */
const SECRETS_FILE = path.join(DATA_DIR, "secrets.json");

function ensureDataDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

// ─── Réglages non sensibles ──────────────────────────────────────

function getSettings(): Record<string, any> {
  const config = readJson<{ settings?: Record<string, any> }>(
    path.join(MODULE_DIR, "module.json"),
    {}
  );
  return config.settings ?? moduleSettings;
}

// ─── Clés API ────────────────────────────────────────────────────

interface Secrets {
  openai_api_key?: string;
  stability_api_key?: string;
}

/**
 * Une variable d'environnement prime sur le fichier : en conteneur, la clé
 * arrive par `env_file` et le volume de données peut être vierge.
 */
function getApiKey(provider: ProviderId): string {
  const stored = readJson<Secrets>(SECRETS_FILE, {});
  if (provider === "openai") {
    return process.env.OPENAI_API_KEY || stored.openai_api_key || "";
  }
  return process.env.STABILITY_API_KEY || stored.stability_api_key || "";
}

/** Renseigne l'interface sur l'état des clés sans jamais les renvoyer. */
export async function getSecretsStatus(): Promise<{
  openai: { configured: boolean; fromEnv: boolean; hint: string };
  stability: { configured: boolean; fromEnv: boolean; hint: string };
}> {
  const stored = readJson<Secrets>(SECRETS_FILE, {});
  const describe = (envValue: string | undefined, fileValue: string | undefined) => {
    const value = envValue || fileValue || "";
    return {
      configured: value.length > 0,
      fromEnv: Boolean(envValue),
      // Les 4 derniers caractères suffisent à reconnaître une clé sans l'exposer.
      hint: value ? `••••••••${value.slice(-4)}` : "",
    };
  };
  return {
    openai: describe(process.env.OPENAI_API_KEY, stored.openai_api_key),
    stability: describe(process.env.STABILITY_API_KEY, stored.stability_api_key),
  };
}

export async function saveSecrets(
  next: Secrets
): Promise<{ success: boolean }> {
  ensureDataDirs();
  const current = readJson<Secrets>(SECRETS_FILE, {});
  const merged: Secrets = { ...current };

  // Une chaîne vide efface la clé ; `undefined` la laisse telle quelle, ce qui
  // permet d'enregistrer un seul provider sans écraser l'autre.
  for (const key of ["openai_api_key", "stability_api_key"] as const) {
    if (next[key] !== undefined) {
      if (next[key]) merged[key] = next[key];
      else delete merged[key];
    }
  }

  fs.writeFileSync(SECRETS_FILE, JSON.stringify(merged, null, 2), { mode: 0o600 });
  return { success: true };
}

// ─── Historique ──────────────────────────────────────────────────

export interface HistoryItem {
  id: string;
  prompt: string;
  /** Prompt effectivement envoyé, notes comprises. */
  finalPrompt: string;
  notes: string;
  provider: string;
  model: string;
  size: string;
  quality?: string;
  count: number;
  imageFiles: string[];
  /** Prompt réécrit par le modèle, quand il en renvoie un. */
  revisedPrompt?: string;
  /** Fichiers copiés dans la galerie, indexés par nom de fichier local. */
  savedToGallery?: Record<string, string>;
  usedReference?: boolean;
  favorite?: boolean;
  durationMs?: number;
  createdAt: number;
}

function readHistory(): HistoryItem[] {
  return readJson<HistoryItem[]>(HISTORY_FILE, []);
}

function writeHistory(items: HistoryItem[]) {
  ensureDataDirs();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(items, null, 2));
}

export async function getHistory(limit = 200): Promise<HistoryItem[]> {
  return readHistory().slice(0, limit);
}

/** Compteurs de la bibliothèque, calculés côté serveur pour éviter de rapatrier tout l'historique. */
export async function getStats(): Promise<{
  generations: number;
  images: number;
  favorites: number;
  inGallery: number;
  diskBytes: number;
  byModel: { model: string; label: string; count: number }[];
}> {
  const items = readHistory();
  const byModel = new Map<string, number>();
  let images = 0;
  let inGallery = 0;

  for (const item of items) {
    images += item.imageFiles.length;
    inGallery += Object.keys(item.savedToGallery ?? {}).length;
    byModel.set(item.model, (byModel.get(item.model) ?? 0) + 1);
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
    favorites: items.filter((i) => i.favorite).length,
    inGallery,
    diskBytes,
    byModel: [...byModel.entries()]
      .map(([model, count]) => ({
        model,
        label: getModelSpec(model)?.label ?? model,
        count,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

function removeImageFiles(files: string[]) {
  for (const file of files) {
    // `basename` empêche qu'un nom forgé (« ../../.env ») sorte du dossier.
    const target = path.join(IMAGES_DIR, path.basename(file));
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
}

export async function clearHistory(): Promise<{ success: boolean }> {
  const items = readHistory();
  for (const item of items) removeImageFiles(item.imageFiles);
  writeHistory([]);
  return { success: true };
}

export async function deleteHistoryItem(
  id: string
): Promise<{ success: boolean }> {
  const items = readHistory();
  const item = items.find((i) => i.id === id);
  if (item) removeImageFiles(item.imageFiles);
  writeHistory(items.filter((i) => i.id !== id));
  return { success: true };
}

/** Supprime une seule image d'un lot ; la génération disparaît si elle se vide. */
export async function deleteImage(
  id: string,
  file: string
): Promise<{ success: boolean }> {
  const items = readHistory();
  const item = items.find((i) => i.id === id);
  if (!item) return { success: false };

  removeImageFiles([file]);
  item.imageFiles = item.imageFiles.filter((f) => f !== file);
  if (item.savedToGallery) delete item.savedToGallery[file];

  writeHistory(
    item.imageFiles.length > 0 ? items : items.filter((i) => i.id !== id)
  );
  return { success: true };
}

export async function toggleFavorite(
  id: string
): Promise<{ success: boolean; favorite: boolean }> {
  const items = readHistory();
  const item = items.find((i) => i.id === id);
  if (!item) return { success: false, favorite: false };
  item.favorite = !item.favorite;
  writeHistory(items);
  return { success: true, favorite: item.favorite };
}

// ─── Copie vers la galerie ───────────────────────────────────────

function randomSlug(length = 12): string {
  const alphabet =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * Copie une image générée dans le dossier d'upload, ce qui la fait apparaître
 * dans la galerie de l'application au même titre qu'une capture ShareX.
 */
export async function saveToGallery(
  id: string,
  file: string
): Promise<{ success: boolean; fileName?: string; error?: string }> {
  const items = readHistory();
  const item = items.find((i) => i.id === id);
  if (!item) return { success: false, error: "Génération introuvable" };

  const source = path.join(IMAGES_DIR, path.basename(file));
  if (!fs.existsSync(source)) {
    return { success: false, error: "Image introuvable sur le disque" };
  }

  const existing = item.savedToGallery?.[file];
  if (existing) {
    // Déjà copiée et toujours présente : ne pas dupliquer.
    if (fs.existsSync(path.join(getAbsoluteUploadPath(), existing))) {
      return { success: true, fileName: existing };
    }
  }

  const fileName = `${randomSlug()}.png`;
  fs.copyFileSync(source, path.join(getAbsoluteUploadPath(), fileName));

  item.savedToGallery = { ...(item.savedToGallery ?? {}), [file]: fileName };
  writeHistory(items);

  return { success: true, fileName };
}

// ─── Génération ──────────────────────────────────────────────────

export async function generateImage(
  prompt: string,
  options: {
    model?: string;
    size?: string;
    quality?: string;
    n?: number;
    notes?: string;
    referenceImageB64?: string;
    referenceMimeType?: string;
  } = {}
): Promise<GenerateImageResult & { historyId: string; savedToGallery: Record<string, string> }> {
  if (!prompt?.trim()) {
    throw new Error("Le prompt est vide.");
  }

  const settings = getSettings();
  const model = options.model || settings.default_model || "gpt-image-1";
  const spec = getModelSpec(model);
  if (!spec) {
    throw new Error(`Modèle inconnu : ${model}`);
  }

  const provider = spec.provider;
  const size = options.size || settings.default_size || spec.sizes[0];
  const quality = options.quality || spec.qualities?.[0]?.value;
  const count = Math.max(1, Math.min(options.n ?? 1, 10));

  // Une référence fournie pour un modèle qui n'en gère pas serait ignorée en
  // silence : autant le dire plutôt que de facturer une génération à côté.
  // Ce contrôle passe avant celui de la clé : il ne coûte rien et pointe la
  // vraie incohérence de la demande.
  const reference = options.referenceImageB64;
  if (reference && !spec.supportsReference) {
    throw new Error(
      `${spec.label} ne sait pas partir d'une image de référence. Choisissez GPT Image 1 ou retirez l'image.`
    );
  }

  const apiKey = getApiKey(provider);
  if (!apiKey) {
    throw new Error(
      provider === "openai"
        ? "Aucune clé OpenAI enregistrée. Ouvrez la configuration du module pour en ajouter une."
        : "Aucune clé Stability enregistrée. Ouvrez la configuration du module pour en ajouter une."
    );
  }

  const notes = (options.notes ?? settings.notes_preprompt ?? "").trim();
  const finalPrompt = notes ? `${notes}\n\n${prompt}` : prompt;

  const startedAt = Date.now();
  const result =
    provider === "openai"
      ? await generateWithOpenAI({
          prompt: finalPrompt,
          model,
          size,
          quality,
          n: count,
          apiKey,
          referenceImageB64: reference,
          referenceMimeType: options.referenceMimeType,
        })
      : await generateWithStability({
          prompt: finalPrompt,
          model,
          size,
          n: count,
          apiKey,
        });

  if (result.images.length === 0) {
    throw new Error("L'API n'a renvoyé aucune image.");
  }

  ensureDataDirs();
  const historyId = `gen-${Date.now()}-${randomSlug(6)}`;
  const imageFiles: string[] = [];

  for (let i = 0; i < result.images.length; i++) {
    const fileName = `${historyId}-${i}.png`;
    fs.writeFileSync(
      path.join(IMAGES_DIR, fileName),
      Buffer.from(result.images[i].b64, "base64")
    );
    imageFiles.push(fileName);
  }

  const item: HistoryItem = {
    id: historyId,
    prompt,
    finalPrompt,
    notes,
    provider,
    model,
    size,
    quality,
    count: imageFiles.length,
    imageFiles,
    revisedPrompt: result.images[0]?.revisedPrompt,
    usedReference: Boolean(reference),
    durationMs: Date.now() - startedAt,
    createdAt: Date.now(),
  };

  const history = readHistory();
  history.unshift(item);
  if (history.length > 200) {
    for (const old of history.splice(200)) removeImageFiles(old.imageFiles);
  }
  writeHistory(history);

  // Le réglage existait dans l'interface sans être lu nulle part : la copie
  // vers la galerie ne se faisait jamais.
  const savedToGallery: Record<string, string> = {};
  if (settings.save_to_gallery) {
    for (const file of imageFiles) {
      const saved = await saveToGallery(historyId, file);
      if (saved.success && saved.fileName) savedToGallery[file] = saved.fileName;
    }
  }

  return { ...result, historyId, savedToGallery };
}

// ─── Diagnostic ──────────────────────────────────────────────────

export async function testConnection(
  provider: ProviderId
): Promise<{ success: boolean; message: string }> {
  const apiKey = getApiKey(provider);
  if (!apiKey) {
    return { success: false, message: "Aucune clé enregistrée" };
  }

  const endpoint =
    provider === "openai"
      ? "https://api.openai.com/v1/models"
      : "https://api.stability.ai/v1/user/account";

  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (response.ok) {
      return {
        success: true,
        message: provider === "openai" ? "Connexion OpenAI établie" : "Connexion Stability établie",
      };
    }
    if (response.status === 401) {
      return { success: false, message: "Clé refusée (401)" };
    }
    return { success: false, message: `Réponse inattendue : HTTP ${response.status}` };
  } catch (error: any) {
    return { success: false, message: `Réseau injoignable : ${error?.message ?? error}` };
  }
}

/** Le catalogue de modèles vit côté serveur ; l'interface le récupère pour bâtir ses contrôles. */
export async function getModels() {
  return MODELS;
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
  moduleSettings = config.settings || {};
  return moduleHooks;
}

export default moduleHooks;
