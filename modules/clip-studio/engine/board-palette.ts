/**
 * Couleurs d'une planche d'illustrations, et leur lien avec une image de
 * marque (dossier 01, illustrations, étape I3).
 *
 * La planche ne prend pas les styles de texte d'une marque tels quels (une
 * étiquette de marque poserait un fond derrière le repère d'une carte) : elle
 * en prend la police, et ses couleurs viennent de cette palette, tirée de
 * celle de la marque. Chaque élément de planche garde le nom de sa couleur
 * (`ThemeHint.boardColor`) : un changement de marque le recolore.
 *
 * Module sans dépendance : la marque (`brand.ts`) et la planche (`board.ts`)
 * le lisent toutes deux.
 */

export interface BoardPalette {
  /** Papier, le fond de la planche. */
  paper: string;
  /** Cartes, pastilles, carreaux. */
  sheet: string;
  /** Texte posé sur le papier. */
  ink: string;
  /** Texte posé sur une carte. */
  onSheet: string;
  /** Texte secondaire, traits de liaison. */
  muted: string;
  accent: string;
  /** Texte posé sur l'accent (note, pavé). */
  onAccent: string;
  shadow: string;
}

export type BoardPaletteKey = keyof BoardPalette;

export const DEFAULT_BOARD_PALETTE: BoardPalette = {
  paper: "#f2efe8",
  sheet: "#ffffff",
  ink: "#16181d",
  onSheet: "#16181d",
  muted: "#8d8a83",
  accent: "#2f74f5",
  onAccent: "#ffffff",
  shadow: "rgba(22, 24, 29, 0.14)",
};

/** Ce que la planche lit de la palette d'une marque. */
export interface BrandColors {
  background: string;
  ink: string;
  surface: string;
  onSurface: string;
  accent: string;
  onAccent: string;
}

/** Composantes d'une couleur hexadécimale (#rgb ou #rrggbb), ou `null`. */
function rgbOf(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? [...match[1]].map((char) => char + char).join("") : match[1];
  return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
}

/** Mélange de deux couleurs hexadécimales (`amount` de la seconde). */
function mix(a: string, b: string, amount: number): string {
  const first = rgbOf(a);
  const second = rgbOf(b);
  if (!first || !second) return a;
  const value = first.map((channel, index) => Math.round(channel + (second[index] - channel) * amount));
  return `#${value.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Palette de planche d'une marque ; sans marque, celle par défaut. */
export function boardPaletteOf(colors: BrandColors | null | undefined): BoardPalette {
  if (!colors) return DEFAULT_BOARD_PALETTE;
  return {
    paper: colors.background,
    sheet: colors.surface,
    ink: colors.ink,
    onSheet: colors.onSurface,
    // Texte secondaire : l'encre à mi-chemin du papier.
    muted: mix(colors.ink, colors.background, 0.45),
    accent: colors.accent,
    onAccent: colors.onAccent,
    shadow: "rgba(0, 0, 0, 0.16)",
  };
}
