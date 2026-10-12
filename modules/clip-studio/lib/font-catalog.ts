/**
 * Catalogue des polices de Clip Studio, sans les feuilles de style : le
 * serveur (validation d'une image de marque) peut le lire sans charger les
 * polices elles-mêmes.
 */

export const FONTS: { family: string; weights: number[]; label: string }[] = [
  { family: "Montserrat", weights: [600, 800], label: "Montserrat" },
  { family: "Anton", weights: [400], label: "Anton" },
  { family: "Bebas Neue", weights: [400], label: "Bebas Neue" },
  { family: "Poppins", weights: [500, 700], label: "Poppins" },
  { family: "Bangers", weights: [400], label: "Bangers" },
  { family: "Inter", weights: [600], label: "Inter" },
];

export function isCatalogFamily(family: string): boolean {
  return FONTS.some((font) => font.family === family);
}
