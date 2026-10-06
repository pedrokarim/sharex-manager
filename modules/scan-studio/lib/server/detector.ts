/**
 * Détecteur de bulles et de texte : les fichiers du modèle, côté serveur.
 *
 * Le modèle (`comic-text-and-bubble-detector`, d'ogkalu, licence Apache 2.0)
 * est un détecteur d'objets entraîné sur des pages de manga, de webtoon, de
 * manhua et de BD occidentale. Il rend trois sortes de boîtes : bulle, texte
 * dans une bulle, texte hors bulle. Il ne lit rien et n'écrit rien : ce n'est
 * pas une IA générative, et il tourne dans le navigateur, sur la machine de
 * celui qui analyse.
 *
 *   data/models/<fichier>.onnx   un fichier par variante
 *   data/models/settings.json    la variante en service
 *
 * Les fichiers ne sont pas dans le dépôt (11 et 44 Mo) : un administrateur les
 * fait télécharger une fois, depuis une révision figée du dépôt du modèle. Ce
 * qui arrive est vérifié octet pour octet (taille et empreinte SHA-256) avant
 * d'être rangé ; un fichier qui ne correspond pas est jeté.
 */

import fs from "fs";
import path from "path";
import { createHash, randomBytes } from "crypto";
import { dataRoot, readJson, writeJson } from "../store";
import { MODULE_NAME, type DetectorChoice, type DetectorStatus, type DetectorVariantId } from "../types";

/** Révision figée du dépôt du modèle : ce qui est téléchargé ne change pas sous nos pieds. */
const REVISION = "16e8a622f91fabc6b5b65c96d32d1183f8843546";
const REPOSITORY = "https://huggingface.co/ogkalu/comic-text-and-bubble-detector";

interface Variant {
  id: DetectorVariantId;
  label: string;
  description: string;
  file: string;
  size: number;
  sha256: string;
}

export const DETECTOR_VARIANTS: Variant[] = [
  {
    id: "precise",
    label: "Précis",
    description: "44 Mo. Le plus sûr sur les pages essayées ; environ une demi-seconde par page.",
    file: "detector_int8.onnx",
    size: 43_838_857,
    sha256: "b5022ad46416b6fe4f88b0cc082cfd2ff5b1cfc624088c2f19879485493f5913",
  },
  {
    id: "fast",
    label: "Rapide",
    description: "11 Mo. Presque aussi juste, quatre fois plus rapide, plus léger à charger.",
    file: "detector-v4-s_int8.onnx",
    size: 11_120_765,
    sha256: "5fe9e4f576e49d4e7e8b0e029d6d3cdc252abd4694113e1cae120e62c931ea79",
  },
];

const CHOICES: DetectorChoice[] = ["precise", "fast", "off"];
export const DEFAULT_DETECTOR: DetectorChoice = "precise";

const modelsDir = () => path.join(/* turbopackIgnore: true */ dataRoot(), "models");
const settingsFile = () => path.join(modelsDir(), "settings.json");
const modelFile = (variant: Variant) => path.join(modelsDir(), variant.file);

const variantOf = (id: unknown): Variant | undefined => DETECTOR_VARIANTS.find((variant) => variant.id === id);

/** Le fichier est là, entier : sa taille est celle attendue. Son empreinte a été vérifiée à l'arrivée. */
function isInstalled(variant: Variant): boolean {
  try {
    return fs.statSync(modelFile(variant)).size === variant.size;
  } catch {
    return false;
  }
}

export function readDetectorChoice(): DetectorChoice {
  const stored = readJson<{ active?: unknown }>(settingsFile())?.active;
  return CHOICES.includes(stored as DetectorChoice) ? (stored as DetectorChoice) : DEFAULT_DETECTOR;
}

/** Variantes en cours de téléchargement, pour ne pas en lancer deux fois la même. */
const downloading = new Set<DetectorVariantId>();

/**
 * Ce que le navigateur doit savoir : la variante choisie, ce qui est installé,
 * et l'adresse du modèle à charger. Sans modèle installé pour la variante
 * choisie, `modelUrl` est absent et l'analyse garde son repérage par les pixels.
 */
export function getDetector(): DetectorStatus {
  const active = readDetectorChoice();
  const variants = DETECTOR_VARIANTS.map((variant) => ({
    id: variant.id,
    label: variant.label,
    description: variant.description,
    size: variant.size,
    installed: isInstalled(variant),
    downloading: downloading.has(variant.id),
  }));
  const chosen = variantOf(active);
  const status: DetectorStatus = { active, variants, source: REPOSITORY, license: "Apache 2.0" };
  if (chosen && isInstalled(chosen)) {
    // L'empreinte dans l'adresse : le navigateur garde le fichier en cache tant qu'il ne change pas.
    status.modelUrl = `/api/modules/${MODULE_NAME}/data/models/${chosen.file}?v=${chosen.sha256.slice(0, 12)}`;
    status.variant = chosen.id;
  }
  return status;
}

/** Réservé aux administrateurs : choisit la variante en service, ou coupe le détecteur. */
export function setDetectorChoice(choice: unknown): DetectorStatus {
  if (!CHOICES.includes(choice as DetectorChoice)) throw new Error("Choix de détecteur invalide.");
  fs.mkdirSync(modelsDir(), { recursive: true });
  writeJson(settingsFile(), { active: choice });
  return getDetector();
}

export type DetectorFetch = (url: string, init: { signal: AbortSignal; redirect: "follow" }) => Promise<Response>;

/** Durée laissée au téléchargement d'un modèle. */
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

/**
 * Réservé aux administrateurs : télécharge le fichier d'une variante, une
 * seule requête, et ne le range que s'il a la taille et l'empreinte
 * attendues. Rien n'est écrit à moitié : le fichier arrive sous un nom
 * temporaire, puis il est renommé.
 */
export async function downloadDetector(variantId: unknown, fetcher: DetectorFetch = fetch): Promise<DetectorStatus> {
  const variant = variantOf(variantId);
  if (!variant) throw new Error("Variante de détecteur inconnue.");
  if (isInstalled(variant)) return getDetector();
  if (downloading.has(variant.id)) throw new Error("Ce modèle est déjà en cours de téléchargement.");

  downloading.add(variant.id);
  fs.mkdirSync(modelsDir(), { recursive: true });
  const temporary = `${modelFile(variant)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetcher(`${REPOSITORY}/resolve/${REVISION}/${variant.file}`, { signal: controller.signal, redirect: "follow" });
    } catch {
      throw new Error(controller.signal.aborted ? "Le téléchargement du modèle a pris trop de temps." : "Le dépôt du modèle est injoignable.");
    }
    if (!response.ok || !response.body) throw new Error(`Le dépôt du modèle a répondu ${response.status}.`);

    const hash = createHash("sha256");
    const output = fs.createWriteStream(temporary, { flags: "wx" });
    let received = 0;
    try {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        // Plus gros qu'annoncé : ce n'est pas le fichier attendu, inutile d'aller au bout.
        if (received > variant.size) throw new Error("Le fichier reçu est plus gros que le modèle attendu.");
        hash.update(value);
        if (!output.write(value)) await new Promise<void>((resolve) => output.once("drain", resolve));
      }
    } finally {
      await new Promise<void>((resolve) => output.end(resolve));
    }
    if (received !== variant.size || hash.digest("hex") !== variant.sha256) {
      throw new Error("Le fichier reçu n’est pas le modèle attendu (taille ou empreinte différente) : il a été jeté.");
    }
    fs.renameSync(temporary, modelFile(variant));
    return getDetector();
  } finally {
    clearTimeout(timer);
    downloading.delete(variant.id);
    fs.rmSync(temporary, { force: true });
  }
}

/** Réservé aux administrateurs : efface le fichier d'une variante, pour libérer la place. */
export function removeDetector(variantId: unknown): DetectorStatus {
  const variant = variantOf(variantId);
  if (!variant) throw new Error("Variante de détecteur inconnue.");
  fs.rmSync(modelFile(variant), { force: true });
  return getDetector();
}
