/**
 * Fusion des zones trouvées par l'analyse avec celles que la page porte déjà.
 *
 * Règle du dossier (§ 6) : une correction faite à la main n'est jamais écrasée
 * par une relance. Fonctions pures, sans DOM.
 */

import type { ReadingFormat, ScanRegion } from "../types";
import { boundsOf } from "../types";
import { sortByReadingOrder } from "./reading-order";
import { REVIEW_CONFIDENCE, overlapRatio, type Box } from "./words";

/** Plafond de zones d'une page à l'enregistrement (voir `sanitize-page.ts`). */
export const MAX_PAGE_REGIONS = 400;

function boxOf(region: ScanRegion): Box {
  const bounds = boundsOf(region.outline);
  return { x0: bounds.x, y0: bounds.y, x1: bounds.x + bounds.width, y1: bounds.y + bounds.height };
}

/** Zone à laquelle une relance ne touche pas : texte lu corrigé à la main, ou traduction commencée. */
export function isProtectedRegion(region: ScanRegion): boolean {
  return region.reading.edited || region.translation.text.trim() !== "";
}

/** Lecture automatique trop peu sûre : la zone est marquée « lecture à vérifier ». */
export function needsReview(region: ScanRegion): boolean {
  return !region.reading.edited && region.reading.engine !== "manual" && region.reading.confidence < REVIEW_CONFIDENCE;
}

export interface MergeOptions {
  /**
   * Faux (défaut) : les zones existantes restent toutes, les nouvelles
   * s'ajoutent. Vrai : les zones jamais retouchées sont remplacées.
   */
  replace?: boolean;
  format: ReadingFormat;
}

export interface MergeResult {
  regions: ScanRegion[];
  /** Zones réellement ajoutées. */
  added: number;
}

/**
 * Une nouvelle zone qui recouvre de plus de moitié une zone gardée est
 * abandonnée : c'est le même texte, déjà en place.
 *
 * Sans remplacement, l'ordre existant est conservé et les nouvelles zones
 * suivent, dans l'ordre de lecture. Avec, l'ordre de toute la page est
 * recalculé.
 */
export function mergeRegions(existing: ScanRegion[], found: ScanRegion[], options: MergeOptions): MergeResult {
  const kept = options.replace ? existing.filter(isProtectedRegion) : existing;
  const keptBoxes = kept.map(boxOf);
  const room = Math.max(0, MAX_PAGE_REGIONS - kept.length);
  const fresh = found.filter((region) => {
    const box = boxOf(region);
    return !keptBoxes.some((other) => overlapRatio(box, other) > 0.5);
  });
  const added = fresh.slice(0, room);
  if (added.length === 0 && kept.length === existing.length) return { regions: existing, added: 0 };

  if (!options.replace) return { regions: [...kept, ...added], added: added.length };
  const ordered = sortByReadingOrder(
    [...kept, ...added].map((region) => ({ ...boxOf(region), region })),
    options.format,
  );
  return { regions: ordered.map((entry) => entry.region), added: added.length };
}
