/**
 * Le cœur du module : transformer une demande en images archivées.
 *
 * Cette couche ne connaît ni HTTP ni file d'attente. Elle compose le prompt
 * final, choisit le moteur, écrit les rendus sur le disque et tient
 * l'historique à jour – c'est tout ce que les travaux et les pipelines ont
 * besoin de savoir faire.
 */

import fs from "fs";
import path from "path";
import { getAbsoluteUploadPath } from "../../../lib/config";
import {
  generateWithEngine,
  findModel,
  type EngineConfig,
} from "./engines/registry";
import type { GenerateRequest, LogLine } from "./engines/types";
import {
  DATA_DIR,
  IMAGES_DIR,
  MODULE_DIR,
  WORK_DIR,
  ensureDataDirs,
  getSettings,
  loadReference,
  randomSlug,
  readCollections,
  readHistory,
  readSecrets,
  removeImageFiles,
  resolveApiKeys,
  writeHistory,
  type HistoryItem,
  type JobRequest,
} from "./store";

/** Au-delà, l'historique pèse plus qu'il ne sert. */
const HISTORY_LIMIT = 400;

export function buildEngineConfig(): EngineConfig {
  const secrets = readSecrets();
  ensureDataDirs();
  return {
    apiKeys: resolveApiKeys(secrets),
    cli: secrets.cli,
    customEngines: secrets.customEngines,
    workRoot: WORK_DIR,
  };
}

/**
 * Assemble le texte réellement envoyé au modèle.
 *
 * Trois sources se superposent : les notes de style globales, celles de la
 * collection, puis la demande. L'ordre compte – les consignes générales
 * d'abord, le sujet ensuite, comme le recommandent les modèles image.
 */
export function composePrompt(request: JobRequest): {
  finalPrompt: string;
  notes: string;
} {
  const settings = getSettings();
  const collection = request.collectionId
    ? readCollections().find((entry) => entry.id === request.collectionId)
    : undefined;

  const noteFragments = [
    (request.notes ?? settings.notes_preprompt ?? "").trim(),
    (collection?.styleNotes ?? "").trim(),
    (collection?.synopsis ?? "").trim()
      ? `Contexte de la série « ${collection?.name} » : ${collection?.synopsis?.trim()}`
      : "",
  ].filter(Boolean);

  const notes = noteFragments.join("\n");
  const finalPrompt = notes ? `${notes}\n\n${request.prompt}` : request.prompt;
  return { finalPrompt, notes };
}

/**
 * Les ancres d'une collection accompagnent chaque génération : c'est ce qui
 * permet à un même personnage de traverser plusieurs scènes sans le
 * redécrire à chaque fois.
 */
function collectionReferences(collectionId?: string) {
  if (!collectionId) return [];
  const collection = readCollections().find((entry) => entry.id === collectionId);
  return (collection?.anchors ?? []).flatMap((anchor) => {
    const full = path.join(IMAGES_DIR, path.basename(anchor.file));
    if (!fs.existsSync(full)) return [];
    return [
      {
        b64: fs.readFileSync(full).toString("base64"),
        mimeType: "image/png",
        role: "reference" as const,
      },
    ];
  });
}

export interface RunOptions {
  onProgress?: (line: LogLine) => void;
  signal?: AbortSignal;
}

export interface RunOutcome {
  item: HistoryItem;
  log: LogLine[];
}

export async function runGeneration(
  request: JobRequest,
  options: RunOptions = {}
): Promise<RunOutcome> {
  if (!request.prompt?.trim()) {
    throw new Error("Le prompt est vide.");
  }

  const config = buildEngineConfig();
  const model = findModel(request.model, config);
  if (!model) {
    throw new Error(`Modèle inconnu : ${request.model}`);
  }

  const settings = getSettings();
  const size = model.sizes.includes(request.size)
    ? request.size
    : model.sizes[0];
  const quality =
    request.quality && model.qualities?.some((q) => q.value === request.quality)
      ? request.quality
      : model.qualities?.[0]?.value;
  const count = Math.max(1, Math.min(request.n ?? 1, 10));

  const references = [
    ...(request.references ?? []).map(loadReference),
    ...collectionReferences(request.collectionId),
  ];

  // Une référence fournie à un modèle qui n'en gère pas serait ignorée en
  // silence : autant le dire plutôt que de facturer une génération à côté.
  if (references.length && !model.supportsReference) {
    throw new Error(
      `${model.label} ne sait pas partir d'une image de référence. Choisissez un autre modèle ou retirez l'image.`
    );
  }

  const { finalPrompt, notes } = composePrompt(request);
  const negativePrompt =
    request.negativePrompt?.trim() || settings.default_negative_prompt?.trim();

  const engineRequest: GenerateRequest = {
    prompt: finalPrompt,
    negativePrompt,
    model: model.id,
    size,
    quality,
    n: count,
    seed: request.seed,
    references: references.length ? references : undefined,
  };

  const startedAt = Date.now();
  const result = await generateWithEngine(engineRequest, config, {
    onProgress: options.onProgress,
    signal: options.signal,
  });

  if (result.images.length === 0) {
    throw new Error("Le moteur n'a renvoyé aucune image.");
  }

  ensureDataDirs();
  const historyId = `gen-${Date.now()}-${randomSlug(6)}`;
  const imageFiles: string[] = [];

  for (let index = 0; index < result.images.length; index++) {
    const image = result.images[index];
    const extension = (image.mimeType ?? "image/png").includes("jpeg")
      ? "jpg"
      : (image.mimeType ?? "image/png").includes("webp")
        ? "webp"
        : "png";
    const fileName = `${historyId}-${index}.${extension}`;
    fs.writeFileSync(
      path.join(IMAGES_DIR, fileName),
      Buffer.from(image.b64, "base64")
    );
    imageFiles.push(fileName);
  }

  const item: HistoryItem = {
    id: historyId,
    prompt: request.prompt,
    finalPrompt,
    negativePrompt,
    notes,
    provider: model.engineId,
    model: model.id,
    modelLabel: model.label,
    size,
    quality,
    count: imageFiles.length,
    imageFiles,
    revisedPrompt: result.images[0]?.revisedPrompt,
    usedReference: references.length > 0,
    durationMs: Date.now() - startedAt,
    createdAt: Date.now(),
    collectionId: request.collectionId,
    parentId: request.parentId,
    pipelineId: request.pipelineId,
    seed: request.seed,
  };

  const history = readHistory();
  history.unshift(item);
  if (history.length > HISTORY_LIMIT) {
    for (const old of history.splice(HISTORY_LIMIT)) {
      removeImageFiles(old.imageFiles);
    }
  }
  writeHistory(history);

  if (settings.save_to_gallery) {
    for (const file of imageFiles) {
      await saveToGallery(historyId, file);
    }
  }

  return { item, log: result.log ?? [] };
}

// ─── Galerie ─────────────────────────────────────────────────────

/**
 * Copie une image générée dans le dossier d'upload, ce qui la fait apparaître
 * dans la galerie de l'application au même titre qu'une capture ShareX.
 */
export async function saveToGallery(
  id: string,
  file: string
): Promise<{ success: boolean; fileName?: string; error?: string }> {
  const items = readHistory();
  const item = items.find((entry) => entry.id === id);
  if (!item) return { success: false, error: "Génération introuvable" };

  const source = path.join(IMAGES_DIR, path.basename(file));
  if (!fs.existsSync(source)) {
    return { success: false, error: "Image introuvable sur le disque" };
  }

  const existing = item.savedToGallery?.[file];
  if (existing && fs.existsSync(path.join(getAbsoluteUploadPath(), existing))) {
    // Déjà copiée et toujours présente : ne pas dupliquer.
    return { success: true, fileName: existing };
  }

  const extension = path.extname(source) || ".png";
  const fileName = `${randomSlug()}${extension}`;
  fs.copyFileSync(source, path.join(getAbsoluteUploadPath(), fileName));

  item.savedToGallery = { ...(item.savedToGallery ?? {}), [file]: fileName };
  writeHistory(items);

  return { success: true, fileName };
}

// ─── Agrandissement local ────────────────────────────────────────

/**
 * Agrandissement sans appel réseau, utilisé comme étape de pipeline.
 *
 * Ce n'est pas un super-résolution par modèle : c'est un rééchantillonnage de
 * qualité, immédiat et gratuit, qui suffit à passer d'un brouillon à un
 * fichier imprimable. Une étape `generate` sur un modèle 4K reste préférable
 * quand le détail compte.
 */
export async function upscaleImage(
  historyId: string,
  file: string,
  scale = 2
): Promise<{ success: boolean; file?: string; error?: string }> {
  const source = path.join(IMAGES_DIR, path.basename(file));
  if (!fs.existsSync(source)) {
    return { success: false, error: "Image introuvable sur le disque" };
  }

  const { default: sharp } = await import("sharp");
  const image = sharp(source);
  const metadata = await image.metadata();
  const width = Math.round((metadata.width ?? 1024) * scale);
  const height = Math.round((metadata.height ?? 1024) * scale);

  const target = `${path.basename(file, path.extname(file))}-x${scale}.png`;
  await image
    .resize(width, height, { kernel: "lanczos3", fit: "fill" })
    .png()
    .toFile(path.join(IMAGES_DIR, target));

  const items = readHistory();
  const item = items.find((entry) => entry.id === historyId);
  if (item && !item.imageFiles.includes(target)) {
    item.imageFiles.push(target);
    item.count = item.imageFiles.length;
    writeHistory(items);
  }

  return { success: true, file: target };
}

/** Chemins exposés au reste du module, pour éviter de recalculer les jointures. */
export const PATHS = { MODULE_DIR, DATA_DIR, IMAGES_DIR, WORK_DIR };
