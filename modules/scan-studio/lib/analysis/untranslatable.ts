/**
 * Une page a-t-elle quelque chose à traduire ?
 *
 * Une couverture, une bannière d'équipe, une illustration pleine page ne
 * portent pas de réplique : l'analyse n'y trouve rien, ou seulement un titre
 * mal lu, une adresse de site, une liste de crédits. L'atelier s'en sert pour
 * proposer de marquer la page « à laisser telle quelle » ; la décision reste
 * à la personne.
 *
 * Fonctions pures, sans DOM : elles ne regardent que les zones de la page.
 */

import type { ScanRegion } from "../types";
import { boundsOf } from "../types";
import { isProtectedRegion } from "./merge";
import { isCreditsText, plausibility } from "./plausibility";
import { isMostlyCjk, isTranslatableCjk } from "./plausibility-cjk";
import { minTextHeight, type PageSize } from "./words";

/** Confiance à partir de laquelle une lecture de plusieurs mots compte comme du texte à traduire. */
const MIN_SOLID_CONFIDENCE = 0.6;
/** Confiance demandée à un mot seul : un mot isolé et douteux ne fait pas une réplique. */
const MIN_SINGLE_CONFIDENCE = 0.8;
/** Part des lettres qui doit tenir dans des mots bien formés. */
const MIN_WORD_LIKE = 0.6;

/**
 * La zone porte-t-elle un texte à traduire : une lecture assez sûre, faite
 * de mots en lettres latines ou de signes japonais, chinois ou coréens ? Une
 * zone corrigée à la main ou déjà traduite compte toujours : quelqu'un a
 * décidé qu'elle en valait la peine.
 */
export function isTranslatableRegion(region: ScanRegion, page: PageSize): boolean {
  if (isProtectedRegion(region)) return region.reading.clean.trim() !== "" || region.translation.text.trim() !== "";
  // Les onomatopées et le texte du décor ne sont pas traduits par défaut (§ 6.1).
  if (region.kind === "sfx" || region.kind === "background") return false;
  const text = region.reading.clean.trim() || region.reading.raw.trim();
  if (!text || isCreditsText(text)) return false;
  if (boundsOf(region.outline).height < minTextHeight(page)) return false;
  // Un texte en signes pleins (japonais, chinois, coréen) se juge sur son écriture, pas sur ses mots.
  if (isMostlyCjk(text)) return isTranslatableCjk(text, region.reading.engine === "manual" ? 1 : region.reading.confidence);
  const shape = plausibility(text);
  if (shape.letters < 2 || shape.foreign > 0.3 || shape.wordLike < MIN_WORD_LIKE) return false;
  const confidence = region.reading.engine === "manual" ? 1 : region.reading.confidence;
  return confidence >= (shape.words >= 2 ? MIN_SOLID_CONFIDENCE : MIN_SINGLE_CONFIDENCE);
}

/**
 * Vrai si la page semble n'avoir rien à traduire : aucune de ses zones ne
 * porte de texte assez sûr, ou tout ce qu'elle porte tient d'une page de
 * crédits (adresses, rôles d'une équipe).
 *
 * À n'appeler qu'après l'analyse de la page : une page jamais analysée n'a pas
 * de zone non plus, et rendrait vrai à tort.
 */
export function looksUntranslatable(regions: ScanRegion[], page: PageSize): boolean {
  return !regions.some((region) => isTranslatableRegion(region, page));
}
