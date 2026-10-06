"use client";

/**
 * Détecteur de bulles et de texte, dans le navigateur.
 *
 * Le modèle (voir `lib/server/detector.ts`) tourne ici, sur la machine de celui
 * qui analyse, avec ONNX Runtime Web en WebAssembly. Le moteur d'exécution est
 * servi par l'application, à côté du moteur de lecture ; le modèle vient des
 * données du module. Rien ne part vers un service.
 *
 * Ce fichier ne fait que le lien avec le navigateur : préparer l'image, appeler
 * le modèle, rendre ses boîtes. Le tri des boîtes est dans `detector-boxes.ts`.
 */

import {
  DETECTOR_INPUT,
  detectorTiles,
  dropDuplicates,
  mergeTileDetections,
  pairTexts,
  readDetections,
  type DetectedBox,
  type DetectedText,
} from "./detector-boxes";
import type { Surface } from "./browser-reader";
import type { PageSize } from "./words";

/** Dossier public où `scripts/copy-ocr-assets.ts` range le moteur d'exécution. */
const RUNTIME_PATH = "/scan-studio-ocr/ort";

/** Ce dont on se sert dans ONNX Runtime Web : assez pour créer une session et l'appeler. */
interface OrtTensor {
  data: ArrayLike<number | bigint>;
}
interface OrtSession {
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
  release?(): Promise<void>;
}
interface OrtApi {
  env: { wasm: { wasmPaths?: string; numThreads?: number } };
  InferenceSession: { create(model: ArrayBuffer, options: { executionProviders: string[] }): Promise<OrtSession> };
  Tensor: new (type: string, data: Float32Array | BigInt64Array, dims: number[]) => unknown;
}

let runtimePromise: Promise<OrtApi> | null = null;

/** Charge le moteur d'exécution par son script de navigateur, sans passer par l'empaqueteur. */
function loadRuntime(): Promise<OrtApi> {
  runtimePromise ??= new Promise<OrtApi>((resolve, reject) => {
    const ready = (window as unknown as { ort?: OrtApi }).ort;
    if (ready) return resolve(ready);
    const script = document.createElement("script");
    script.src = `${RUNTIME_PATH}/ort.wasm.min.js`;
    script.async = true;
    script.onload = () => {
      const loaded = (window as unknown as { ort?: OrtApi }).ort;
      if (loaded) resolve(loaded);
      else reject(new Error("Le moteur du détecteur ne s’est pas initialisé"));
    };
    script.onerror = () => reject(new Error("Le moteur du détecteur est introuvable"));
    document.head.appendChild(script);
  })
    .then((ort) => {
      ort.env.wasm.wasmPaths = `${RUNTIME_PATH}/`;
      // Un seul fil : plusieurs demanderaient des en-têtes d'isolation que le site n'envoie pas.
      ort.env.wasm.numThreads = 1;
      return ort;
    })
    .catch((error) => {
      // Un échec ne doit pas condamner les essais suivants.
      runtimePromise = null;
      throw error;
    });
  return runtimePromise;
}

/** Une session par modèle, gardée tant que l'onglet vit : la créer coûte plus cher que l'appeler. */
const sessions = new Map<string, Promise<OrtSession>>();

function openSession(modelUrl: string): Promise<OrtSession> {
  let session = sessions.get(modelUrl);
  if (!session) {
    session = (async () => {
      const ort = await loadRuntime();
      const response = await fetch(modelUrl);
      if (!response.ok) throw new Error(`Le modèle du détecteur n’a pas pu être chargé (HTTP ${response.status})`);
      return ort.InferenceSession.create(await response.arrayBuffer(), { executionProviders: ["wasm"] });
    })().catch((error) => {
      sessions.delete(modelUrl);
      throw error;
    });
    sessions.set(modelUrl, session);
  }
  return session;
}

/** Libère les sessions ouvertes : à appeler quand on quitte l'atelier pour de bon. */
export function releaseDetector() {
  for (const session of sessions.values()) void session.then((opened) => opened.release?.()).catch(() => undefined);
  sessions.clear();
}

/** Les pixels d'un rectangle de la page, ramenés au carré que le modèle attend : rouge, vert, bleu, de 0 à 1. */
function toInput(image: Surface, source: { x: number; y: number; width: number; height: number }): Float32Array {
  const canvas = document.createElement("canvas");
  canvas.width = DETECTOR_INPUT;
  canvas.height = DETECTOR_INPUT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Le navigateur n’a pas pu préparer l’image pour le détecteur");
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, DETECTOR_INPUT, DETECTOR_INPUT);
  ctx.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, DETECTOR_INPUT, DETECTOR_INPUT);
  const { data } = ctx.getImageData(0, 0, DETECTOR_INPUT, DETECTOR_INPUT);
  const plane = DETECTOR_INPUT * DETECTOR_INPUT;
  const input = new Float32Array(plane * 3);
  for (let index = 0; index < plane; index++) {
    input[index] = data[index * 4] / 255;
    input[plane + index] = data[index * 4 + 1] / 255;
    input[2 * plane + index] = data[index * 4 + 2] / 255;
  }
  return input;
}

export interface DetectOptions {
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

/**
 * Repère les bulles et les textes d'une page. `size` est la taille de la page
 * dans laquelle les zones sont exprimées ; l'image peut en avoir une autre.
 * Une longue bande est traitée par tranches. Rend les textes, chacun avec sa
 * bulle quand il en a une.
 */
export async function detectTexts(image: Surface, size: PageSize, modelUrl: string, options: DetectOptions = {}): Promise<DetectedText[]> {
  const [ort, session] = await Promise.all([loadRuntime(), openSession(modelUrl)]);
  const natural = "naturalWidth" in image ? { width: image.naturalWidth, height: image.naturalHeight } : { width: image.width, height: image.height };
  const scaleX = natural.width / size.width;
  const scaleY = natural.height / size.height;

  const tiles = detectorTiles(size);
  const perTile: { tile: (typeof tiles)[number]; boxes: DetectedBox[] }[] = [];
  for (const [index, tile] of tiles.entries()) {
    if (options.signal?.aborted) throw new DOMException("Interrompu", "AbortError");
    const input = toInput(image, { x: tile.x * scaleX, y: tile.y * scaleY, width: tile.width * scaleX, height: tile.height * scaleY });
    const outputs = await session.run({
      images: new ort.Tensor("float32", input, [1, 3, DETECTOR_INPUT, DETECTOR_INPUT]),
      // Le modèle rend ses boîtes dans la taille qu'on lui annonce : celle de la tranche, en pixels de la page.
      orig_target_sizes: new ort.Tensor("int64", BigInt64Array.from([BigInt(Math.round(tile.width)), BigInt(Math.round(tile.height))]), [1, 2]),
    });
    const boxes = readDetections(outputs.labels.data, outputs.boxes.data as ArrayLike<number>, outputs.scores.data as ArrayLike<number>, { width: tile.width, height: tile.height });
    perTile.push({ tile, boxes: dropDuplicates(boxes) });
    options.onProgress?.((index + 1) / tiles.length);
  }
  const merged = tiles.length === 1 ? perTile[0].boxes : mergeTileDetections(perTile, size);
  return pairTexts(merged);
}
