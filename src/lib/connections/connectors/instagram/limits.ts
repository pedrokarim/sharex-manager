/**
 * Limites d'Instagram (dossier 07b, § 8), rangées en un seul endroit pour
 * suivre un changement de Meta en une ligne.
 *
 * - Reel : MP4 ou MOV, 3 secondes à 15 minutes, 300 Mo, 1 920 colonnes au
 *   plus, rapport de 0,01:1 à 10:1 ;
 * - image : convertie en JPEG par le connecteur (PNG et WebP acceptés en
 *   entrée), rapport de 4:5 à 1,91:1 ;
 * - couverture d'un Reel : JPEG en 9:16, 8 Mio au plus ;
 * - carrousel : de 2 à 10 éléments ;
 * - par compte, sur 24 heures glissantes : 50 publications (la documentation
 *   dit aussi 100 : la valeur réelle est relue avant chaque publication) et
 *   400 conteneurs.
 */

import type { AccountQuota, PublishLimits } from "../../types";
import { IMAGE_MAX_BYTES, IMAGE_RATIO } from "./image";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const REEL_MAX_BYTES = 300 * 1000 * 1000;
/** Poids d'une image en entrée : elle est réencodée en JPEG de 8 Mio au plus. */
export const IMAGE_INPUT_MAX_BYTES = 40 * 1024 * 1024;
export const POSTS_PER_DAY = 50;
export const CONTAINERS_PER_DAY = 400;

export const INSTAGRAM_LIMITS: PublishLimits = {
  video: {
    mimeTypes: ["video/mp4", "video/quicktime"],
    maxBytes: REEL_MAX_BYTES,
    minDurationMs: 3_000,
    maxDurationMs: 15 * 60_000,
    aspectRatio: { min: 0.01, max: 10 },
    maxWidth: 1920,
  },
  image: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: IMAGE_INPUT_MAX_BYTES,
    aspectRatio: { min: IMAGE_RATIO.min, max: IMAGE_RATIO.max },
  },
  // La couverture est convertie en JPEG de 8 Mio au plus avant l'envoi
  // (`toInstagramJpeg`) : on accepte donc ce que la conversion sait lire, et
  // une taille d'entrée plus large.
  cover: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 4 * IMAGE_MAX_BYTES,
    aspectRatio: { min: 9 / 16, max: 9 / 16 },
  },
  carousel: { minItems: 2, maxItems: 10 },
};

/** Quota propre à chaque compte, compté par `context.chargeQuota`. */
export const INSTAGRAM_ACCOUNT_QUOTA: AccountQuota = {
  windowMs: DAY_MS,
  buckets: [
    { id: "posts", label: "Publications", limit: POSTS_PER_DAY },
    { id: "containers", label: "Conteneurs", limit: CONTAINERS_PER_DAY },
  ],
  cost(method) {
    if (method === "media_publish") return { bucket: "posts", units: 1 };
    if (method === "media") return { bucket: "containers", units: 1 };
    return null;
  },
};
