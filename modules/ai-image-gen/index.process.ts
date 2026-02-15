import { ModuleHooks } from "../../types/modules";
import {
  generateWithOpenAI,
  generateWithStability,
  type GenerateImageResult,
} from "./lib/providers";
import fs from "fs";
import path from "path";

let moduleSettings: Record<string, any> = {};

const MODULE_DIR = path.join(process.cwd(), "modules", "ai-image-gen");
const DATA_DIR = path.join(MODULE_DIR, "data");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");

// Ensure data directories exist
function ensureDataDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

function getSettings(): Record<string, any> {
  try {
    const configPath = path.join(MODULE_DIR, "module.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return config.settings || moduleSettings;
  } catch {
    return moduleSettings;
  }
}

// ─── History Management ──────────────────────────────────────────

export interface HistoryItem {
  id: string;
  prompt: string;
  notes: string;
  provider: string;
  model: string;
  size: string;
  count: number;
  imageFiles: string[]; // filenames in data/images/
  createdAt: number;
}

function readHistory(): HistoryItem[] {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const raw = fs.readFileSync(HISTORY_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeHistory(items: HistoryItem[]) {
  ensureDataDirs();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(items, null, 2));
}

export async function getHistory(limit: number = 50): Promise<HistoryItem[]> {
  const items = readHistory();
  return items.slice(0, limit);
}

export async function clearHistory(): Promise<{ success: boolean }> {
  writeHistory([]);
  // Delete all image files
  if (fs.existsSync(IMAGES_DIR)) {
    const files = fs.readdirSync(IMAGES_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(IMAGES_DIR, file));
    }
  }
  return { success: true };
}

export async function deleteHistoryItem(id: string): Promise<{ success: boolean }> {
  const items = readHistory();
  const item = items.find((i) => i.id === id);
  if (item) {
    // Delete associated image files
    for (const file of item.imageFiles) {
      const filePath = path.join(IMAGES_DIR, file);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }
  writeHistory(items.filter((i) => i.id !== id));
  return { success: true };
}

// ─── Image Generation ──────────────────────────────────────────

export async function generateImage(
  prompt: string,
  options: {
    provider?: "openai" | "stability";
    model?: string;
    size?: string;
    n?: number;
    notes?: string;
    referenceImageB64?: string;
  } = {}
): Promise<GenerateImageResult & { historyId: string }> {
  const settings = getSettings();
  const provider = options.provider || settings.provider || "openai";
  const model = options.model || settings.default_model || "dall-e-3";
  const size = options.size || settings.default_size || "1024x1024";
  const count = options.n || 1;

  // Build final prompt with notes preprompt
  const notesPreprompt = options.notes || settings.notes_preprompt || "";
  const finalPrompt = notesPreprompt
    ? `${notesPreprompt}\n\n${prompt}`
    : prompt;

  let result: GenerateImageResult;

  if (provider === "openai") {
    const apiKey = settings.openai_api_key;
    if (!apiKey) {
      throw new Error(
        "Clé API OpenAI non configurée. Allez dans Configuration pour la définir."
      );
    }

    // DALL-E 3 only supports n=1, so make parallel calls for batch
    if (model === "dall-e-3" && count > 1) {
      const promises = Array.from({ length: count }, () =>
        generateWithOpenAI({
          prompt: finalPrompt,
          provider: "openai",
          model,
          size,
          n: 1,
          apiKey,
        })
      );
      const results = await Promise.all(promises);
      result = {
        images: results.flatMap((r) => r.images),
      };
    } else {
      result = await generateWithOpenAI({
        prompt: finalPrompt,
        provider: "openai",
        model,
        size,
        n: count,
        apiKey,
      });
    }
  } else if (provider === "stability") {
    const apiKey = settings.stability_api_key;
    if (!apiKey) {
      throw new Error(
        "Clé API Stability non configurée. Allez dans Configuration pour la définir."
      );
    }
    result = await generateWithStability({
      prompt: finalPrompt,
      provider: "stability",
      size,
      n: count,
      apiKey,
    });
  } else {
    throw new Error(`Provider inconnu: ${provider}`);
  }

  // Save to history
  ensureDataDirs();
  const historyId = `gen-${Date.now()}`;
  const imageFiles: string[] = [];

  for (let i = 0; i < result.images.length; i++) {
    const img = result.images[i];
    if (img.b64) {
      const filename = `${historyId}-${i}.png`;
      const filePath = path.join(IMAGES_DIR, filename);
      fs.writeFileSync(filePath, Buffer.from(img.b64, "base64"));
      imageFiles.push(filename);
    }
  }

  const historyItem: HistoryItem = {
    id: historyId,
    prompt,
    notes: notesPreprompt,
    provider,
    model,
    size,
    count,
    imageFiles,
    createdAt: Date.now(),
  };

  const history = readHistory();
  history.unshift(historyItem);
  // Keep last 100 items
  if (history.length > 100) {
    const removed = history.splice(100);
    for (const old of removed) {
      for (const f of old.imageFiles) {
        const fp = path.join(IMAGES_DIR, f);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
    }
  }
  writeHistory(history);

  return { ...result, historyId };
}

// ─── Connection Test ──────────────────────────────────────────

export async function testConnection(
  provider: "openai" | "stability"
): Promise<{ success: boolean; message: string }> {
  const settings = getSettings();

  if (provider === "openai") {
    const apiKey = settings.openai_api_key;
    if (!apiKey)
      return { success: false, message: "Clé API OpenAI non configurée" };
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (response.ok)
        return { success: true, message: "Connexion OpenAI réussie" };
      return {
        success: false,
        message: `Erreur OpenAI: ${response.status}`,
      };
    } catch (error: any) {
      return { success: false, message: `Erreur: ${error.message}` };
    }
  }

  if (provider === "stability") {
    const apiKey = settings.stability_api_key;
    if (!apiKey)
      return {
        success: false,
        message: "Clé API Stability non configurée",
      };
    try {
      const response = await fetch(
        "https://api.stability.ai/v1/engines/list",
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      if (response.ok)
        return { success: true, message: "Connexion Stability AI réussie" };
      return {
        success: false,
        message: `Erreur Stability: ${response.status}`,
      };
    } catch (error: any) {
      return { success: false, message: `Erreur: ${error.message}` };
    }
  }

  return { success: false, message: `Provider inconnu: ${provider}` };
}

// ─── Module Hooks ──────────────────────────────────────────

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
