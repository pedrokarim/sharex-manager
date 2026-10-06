"use client";

/**
 * Moteur de lecture dans le navigateur : Tesseract en WebAssembly, dans un
 * fil de travail.
 *
 * - Rien n'est téléchargé avant la première analyse : le moteur, son cœur et
 *   les données de langue ne sont chargés qu'à ce moment-là.
 * - Un seul fil de travail sert toutes les lectures, l'une après l'autre.
 * - Il est libéré après quelques minutes sans analyse, pour rendre sa mémoire.
 * - Tout vient de l'application elle-même (`public/scan-studio-ocr/`, rempli
 *   par `scripts/copy-ocr-assets.ts`) : aucun appel à un CDN, rien n'est
 *   envoyé nulle part.
 */

import type { Worker } from "tesseract.js";
import { PAGE_SEGMENTATION, wordsFromBlocks, type EngineBlock } from "./tesseract-words";
import type { WordBox } from "./words";

/** Dossier de `public/` où sont servis les fichiers du moteur. */
const ASSET_PATH = "/scan-studio-ocr";
/** Clé du cache des données de langue dans le navigateur : à changer si le modèle change. */
const CACHE_KEY = "scan-studio-ocr/4.0.0_best_int";
/** Délai sans analyse après lequel le fil de travail est arrêté. */
const IDLE_MS = 3 * 60 * 1000;

type ReadMode = keyof typeof PAGE_SEGMENTATION;

let workerPromise: Promise<Worker> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
/** Lectures en cours ou en attente : le fil n'est pas libéré tant qu'il en reste. */
let users = 0;
let currentMode: ReadMode | null = null;
/** Les lectures passent une par une : chacune attend la précédente. */
let queue: Promise<unknown> = Promise.resolve();
/** Avancement de la lecture en cours, de 0 à 1. */
let onRecognizing: ((progress: number) => void) | null = null;

type TesseractApi = typeof import("tesseract.js");

let scriptPromise: Promise<TesseractApi> | null = null;

/**
 * Charge le moteur par son script compilé pour le navigateur, servi avec les
 * autres fichiers du moteur. Il ne passe pas par l'empaqueteur : le paquet
 * mêle du code pour Node, et son script de navigateur tient déjà en un fichier.
 */
function loadTesseract(base: string): Promise<TesseractApi> {
  scriptPromise ??= new Promise<TesseractApi>((resolve, reject) => {
    const existing = (window as unknown as { Tesseract?: TesseractApi }).Tesseract;
    if (existing) return resolve(existing);
    const script = document.createElement("script");
    script.src = `${base}/tesseract.min.js`;
    script.async = true;
    script.onload = () => {
      const loaded = (window as unknown as { Tesseract?: TesseractApi }).Tesseract;
      if (loaded) resolve(loaded);
      else reject(new Error("Le script du moteur de lecture ne s’est pas initialisé"));
    };
    script.onerror = () => reject(new Error("Le script du moteur de lecture est introuvable"));
    document.head.appendChild(script);
  }).catch((error) => {
    // Un échec ne doit pas condamner les essais suivants.
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
}

async function createEngine(): Promise<Worker> {
  const base = new URL(ASSET_PATH, window.location.origin).href;
  const Tesseract = await loadTesseract(base);
  currentMode = null;
  return Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/core`,
    langPath: `${base}/lang`,
    cachePath: CACHE_KEY,
    gzip: true,
    // Le script de travail est de même origine : pas besoin de l'envelopper.
    workerBlobURL: false,
    logger: (message) => {
      if (message.status === "recognizing text") onRecognizing?.(message.progress);
    },
  });
}

function scheduleRelease() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void releaseEngine(), IDLE_MS);
}

/** Arrête le fil de travail et rend sa mémoire. Sans effet si une lecture est en cours. */
export async function releaseEngine(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (users > 0 || !workerPromise) return;
  const pending = workerPromise;
  workerPromise = null;
  currentMode = null;
  try {
    await (await pending).terminate();
  } catch {
    // Le moteur n'avait pas fini de se charger, ou est déjà arrêté.
  }
}

/** Le moteur est-il chargé (ou en train de l'être) ? */
export function isEngineLoaded(): boolean {
  return workerPromise !== null;
}

/**
 * Lit une image avec le moteur, en le chargeant au besoin. Les boîtes rendues
 * sont en pixels de l'image donnée.
 */
export function recognize(image: HTMLCanvasElement, mode: ReadMode, onProgress?: (progress: number) => void): Promise<WordBox[]> {
  users++;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const run = async () => {
    workerPromise ??= createEngine();
    let worker: Worker;
    try {
      worker = await workerPromise;
    } catch (error) {
      // Un chargement raté ne doit pas condamner les analyses suivantes.
      workerPromise = null;
      throw new Error("Le moteur de lecture n’a pas pu être chargé", { cause: error });
    }
    if (currentMode !== mode) {
      // Le type attendu est une énumération du paquet ; ses valeurs sont ces chaînes.
      await worker.setParameters({ tessedit_pageseg_mode: PAGE_SEGMENTATION[mode] as never });
      currentMode = mode;
    }
    onRecognizing = onProgress ?? null;
    try {
      const { data } = await worker.recognize(image, {}, { blocks: true, text: false });
      return wordsFromBlocks(data.blocks as EngineBlock[] | null);
    } finally {
      onRecognizing = null;
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result.finally(() => {
    users--;
    if (users === 0) scheduleRelease();
  });
}
