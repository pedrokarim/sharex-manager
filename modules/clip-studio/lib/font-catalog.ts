/**
 * Catalogue des polices de Clip Studio, sans les feuilles de style : le
 * serveur (validation d'une image de marque) peut le lire sans charger les
 * polices elles-mêmes.
 *
 * `text` : police de texte, lisible en phrases (sous-titres, légendes,
 * étiquettes, cartes). Les autres sont des polices de titre, faites pour
 * quelques mots en grand.
 */

export const FONTS: { family: string; weights: number[]; label: string; text: boolean }[] = [
  { family: "Montserrat", weights: [600, 800], label: "Montserrat", text: true },
  { family: "Anton", weights: [400], label: "Anton", text: false },
  { family: "Bebas Neue", weights: [400], label: "Bebas Neue", text: false },
  { family: "Poppins", weights: [500, 700], label: "Poppins", text: true },
  { family: "Bangers", weights: [400], label: "Bangers", text: false },
  { family: "Inter", weights: [600], label: "Inter", text: true },
];

/** Police de texte par défaut : présente sans réseau, en 500 et 700. */
export const DEFAULT_TEXT_FONT = "Poppins";

export function isCatalogFamily(family: string): boolean {
  return FONTS.some((font) => font.family === family);
}

/** Police de texte du catalogue (lisible en phrases). */
export function isCatalogTextFont(family: string): boolean {
  return FONTS.some((font) => font.family === family && font.text);
}

/** Graisse la plus proche disponible pour une police du catalogue ; telle quelle sinon. */
export function nearestCatalogWeight(family: string, weight: number): number {
  const font = FONTS.find((entry) => entry.family === family);
  if (!font) return weight;
  return font.weights.reduce((best, candidate) => (Math.abs(candidate - weight) < Math.abs(best - weight) ? candidate : best));
}
