/**
 * Visuels demandés à AI Image Gen : les modules se parlent par leurs
 * fonctions, comme Clip Studio. Les images apparaissent aussi dans le fil
 * d'AI Image Gen, rangées dans la collection de la marque.
 */

import fs from "fs";
import path from "path";
import { apiModuleManager } from "@/lib/modules/module-manager.api";

const IMAGES_DIR = path.join(process.cwd(), "modules", "ai-image-gen", "data", "images");
const IMAGE_TIMEOUT_MS = 20 * 60 * 1000;

interface ImageGenJob {
  id: string;
  status: "queued" | "running" | "done" | "error" | "canceled";
  historyIds: string[];
  error?: string;
}

const call = <T>(name: string, ...args: unknown[]) => apiModuleManager.callModuleFunction("ai-image-gen", name, ...args) as Promise<T>;

export async function chooseModel(): Promise<string> {
  const settings = apiModuleManager.getLoadedModule("ai-image-gen")?.config.settings as { default_model?: string } | undefined;
  const catalogue = await call<{ models: { id: string; available: boolean }[] } | null>("getCatalogue").catch(() => null);
  if (!catalogue) throw new Error("AI Image Gen n'est pas disponible pour créer les visuels.");
  const chosen = catalogue.models.find((model) => model.id === settings?.default_model && model.available) ?? catalogue.models.find((model) => model.available);
  if (!chosen) throw new Error("Aucun moteur d'image n'est disponible dans AI Image Gen.");
  return chosen.id;
}

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

function reference(file: string) {
  return { b64: fs.readFileSync(file).toString("base64"), mimeType: MIME[path.extname(file).toLowerCase()] ?? "image/png", role: "reference" as const };
}

export interface GeneratedImage {
  /** Chemin du rendu dans les données d'AI Image Gen. */
  path: string;
  file: string;
  jobId: string;
}

/** Met une image en file, attend sa fin, et rend le fichier produit. */
export async function generateImage(
  input: { prompt: string; size: string; collectionId?: string; references?: string[]; model?: string },
  signal?: AbortSignal,
  onJob?: (jobId: string) => void
): Promise<GeneratedImage> {
  const model = input.model ?? (await chooseModel());
  const job = await call<ImageGenJob>("enqueueGeneration", {
    prompt: input.prompt,
    model,
    size: input.size,
    quality: "medium",
    n: 1,
    collectionId: input.collectionId,
    references: (input.references ?? []).slice(0, 6).filter((file) => fs.existsSync(file)).map(reference),
    origin: { module: "brand-kit", feature: "Image de marque" },
  });
  onJob?.(job.id);
  const deadline = Date.now() + IMAGE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal?.aborted) {
      void call("cancelGeneration", job.id).catch(() => undefined);
      throw new DOMException("Annulé", "AbortError");
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const state = await call<ImageGenJob | null>("getJobById", job.id);
    if (!state || state.status === "queued" || state.status === "running") continue;
    if (state.status !== "done" || !state.historyIds[0]) throw new Error(state.error || "La génération de l'image a échoué.");
    const history = await call<{ id: string; imageFiles: string[] }[] | null>("getHistory", 200);
    const file = history?.find((entry) => entry.id === state.historyIds[0])?.imageFiles[0];
    if (!file || file !== path.basename(file)) throw new Error("Image produite introuvable.");
    return { path: path.join(IMAGES_DIR, file), file, jobId: job.id };
  }
  void call("cancelGeneration", job.id).catch(() => undefined);
  throw new Error("La génération de l'image a pris trop de temps.");
}

/** Collection AI Image Gen de la marque : style commun et ancres (mascotte, références). */
export async function createCollection(input: { name: string; description?: string; styleNotes?: string }): Promise<string | undefined> {
  const created = await call<{ id: string } | null>("saveCollection", input).catch(() => null);
  return created?.id;
}

export async function addAnchor(collectionId: string, file: string, label: string, note?: string) {
  await call("addCollectionAnchor", collectionId, file, label, note).catch(() => undefined);
}
