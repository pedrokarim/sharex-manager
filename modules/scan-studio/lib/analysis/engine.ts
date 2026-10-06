"use client";

/**
 * Moteur de lecture dans le navigateur : Tesseract en WebAssembly, dans un
 * fil de travail.
 *
 * - Rien n'est téléchargé avant la première analyse : le moteur, son cœur et
 *   les données de langue ne sont chargés qu'à ce moment-là.
 * - Chaque modèle de lecture (une langue, en lignes ou en colonnes) a son fil
 *   de travail, chargé à la première zone qui le demande : un chapitre anglais
 *   ne télécharge jamais le japonais. Deux fils au plus vivent en même temps.
 * - Les lectures passent l'une après l'autre, quel que soit le modèle.
 * - Les fils sont libérés après quelques minutes sans analyse, pour rendre
 *   leur mémoire.
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

/** Modèle chargé quand l'appelant n'en nomme pas : l'anglais. */
const DEFAULT_MODEL = "eng";
/**
 * Fils de travail gardés en même temps, au plus : un par modèle. Deux suffisent
 * à un chapitre (le modèle des lignes et celui des colonnes de sa langue) ;
 * au-delà, le moins récemment servi est arrêté.
 */
const MAX_ENGINES = 2;

interface Engine {
  worker: Promise<Worker>;
  mode: ReadMode | null;
  /** Rang de la dernière lecture servie : le plus petit part le premier. */
  usedAt: number;
}

/** Fils de travail chargés, par modèle de lecture. */
const engines = new Map<string, Engine>();
let clock = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
/** Lectures en cours ou en attente : rien n'est libéré tant qu'il en reste. */
let users = 0;
/** Les lectures passent une par une : chacune attend la précédente. */
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

/**
 * Fil de travail d'un modèle. Ses données de langue ne sont téléchargées qu'ici,
 * à la première zone qui les demande, puis gardées en cache par le navigateur.
 */
async function createEngine(model: string): Promise<Worker> {
  const base = new URL(ASSET_PATH, window.location.origin).href;
  const Tesseract = await loadTesseract(base);
  return Tesseract.createWorker(model, Tesseract.OEM.LSTM_ONLY, {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/core`,
    langPath: `${base}/lang`,
    cachePath: CACHE_KEY,
    gzip: true,
    // Le script de travail est de même origine : pas besoin de l'envelopper.
    workerBlobURL: false,
    logger: (message) => {
      if (message.status === "recognizing text") onRecognizing?.(message.progress);
    },
  });
}

async function stopEngine(engine: Engine): Promise<void> {
  try {
    await (await engine.worker).terminate();
  } catch {
    // Le moteur n'avait pas fini de se charger, ou est déjà arrêté.
  }
}

/** Fil de travail du modèle, chargé au besoin ; le moins récemment servi lui cède la place. */
async function engineFor(model: string): Promise<Engine> {
  let engine = engines.get(model);
  if (!engine) {
    while (engines.size >= MAX_ENGINES) {
      const [oldest, entry] = [...engines.entries()].reduce((least, current) => (current[1].usedAt < least[1].usedAt ? current : least));
      engines.delete(oldest);
      await stopEngine(entry);
    }
    engine = { worker: createEngine(model), mode: null, usedAt: 0 };
    engines.set(model, engine);
  }
  engine.usedAt = ++clock;
  return engine;
}

function scheduleRelease() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void releaseEngine(), IDLE_MS);
}

/** Arrête les fils de travail et rend leur mémoire. Sans effet si une lecture est en cours. */
export async function releaseEngine(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (users > 0 || engines.size === 0) return;
  const pending = [...engines.values()];
  engines.clear();
  await Promise.all(pending.map(stopEngine));
}

/** Le moteur est-il chargé (ou en train de l'être) ? */
export function isEngineLoaded(): boolean {
  return engines.size > 0;
}

/** Modèles de lecture chargés en ce moment. */
export function loadedModels(): string[] {
  return [...engines.keys()];
}

/**
 * Lit une image avec le moteur, en le chargeant au besoin. `model` est le
 * modèle de lecture de la langue (`languages.ts`) ; les boîtes rendues sont en
 * pixels de l'image donnée.
 */
export function recognize(image: HTMLCanvasElement, mode: ReadMode, onProgress?: (progress: number) => void, model: string = DEFAULT_MODEL): Promise<WordBox[]> {
  users++;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const run = async () => {
    const engine = await engineFor(model);
    let worker: Worker;
    try {
      worker = await engine.worker;
    } catch (error) {
      // Un chargement raté ne doit pas condamner les analyses suivantes.
      if (engines.get(model) === engine) engines.delete(model);
      throw new Error("Le moteur de lecture n’a pas pu être chargé", { cause: error });
    }
    if (engine.mode !== mode) {
      // Le type attendu est une énumération du paquet ; ses valeurs sont ces chaînes.
      await worker.setParameters({ tessedit_pageseg_mode: PAGE_SEGMENTATION[mode] as never });
      engine.mode = mode;
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
