/**
 * Journalisation des affichages d'images, selon le réglage `logs.imageViews` :
 *
 * - `all` : chaque affichage ;
 * - `sampled` : un affichage sur vingt, plus toute demande d'un fichier
 *   inexistant (balayage d'adresses) ;
 * - `off` : aucun affichage.
 *
 * Les tentatives refusées sur une image privée sont toujours journalisées,
 * quel que soit le réglage : elles passent par une autre entrée
 * (`file.unauthorized`).
 */

import type { ImageViewLogging } from "./settings-schema";

export const IMAGE_VIEW_SAMPLE_RATE = 20;

export function shouldLogImageView(
  policy: ImageViewLogging,
  view: { exists: boolean },
  random: () => number = Math.random
): boolean {
  if (policy === "off") return false;
  if (policy === "all") return true;
  if (!view.exists) return true;
  return random() < 1 / IMAGE_VIEW_SAMPLE_RATE;
}
