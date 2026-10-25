/**
 * Lisibilité des textes d'un clip habillé par une marque (dossier 07 sexies,
 * étape D1).
 *
 * Règle : aucun texte n'est posé « nu » sur une image. Chaque texte a un fond
 * (étiquette) ou un contour épais, et la couleur de ses lettres contre celle
 * de ce fond atteint 4,5:1 (3:1 pour un titre de plus de 7 % de la hauteur).
 * Un texte posé sur un aplat uni de couleur connue (fond du projet, carte
 * pleine) se passe d'étiquette quand le contraste avec cet aplat suffit déjà.
 *
 * Les couleurs viennent de la palette de la marque, dans l'ordre de ses
 * rôles ; en dernier recours, noir ou blanc (l'un des deux atteint toujours
 * 4,5:1). Tout est pur : le même calcul sert à l'éditeur, à l'assistant et
 * aux tests. Un clip sans marque n'y passe jamais : son rendu reste le sien.
 */

import { keyedFrame } from "./keys";
import { parseColor } from "./motion/color";
import type { ClipProject, ShapeItem, TextItem, TextRole, TextStyle, Track, VisualItem } from "./types";

/** Couleurs d'une marque, telles que la lisibilité les lit (sous-ensemble de `BrandPalette`). */
export interface LegibilityPalette {
  background: string;
  ink: string;
  surface: string;
  onSurface: string;
  accent: string;
  accentSecondary?: string;
  onAccent: string;
  extras: string[];
}

export const BLACK = "#000000";
export const WHITE = "#ffffff";

/** Contraste minimal d'un texte courant. */
export const TEXT_CONTRAST = 4.5;
/** Contraste minimal d'un grand titre. */
export const LARGE_TITLE_CONTRAST = 3;
/** Au-delà de cette taille (fraction de la hauteur), un titre est « grand ». */
export const LARGE_TITLE_SIZE = 0.07;

/** Marge et arrondi d'une étiquette posée par le moteur, relatifs à la taille du texte. */
export const AUTO_LABEL = { padding: 0.26, radius: 0.18 };
/**
 * Interligne minimal d'un texte en étiquette : l'étiquette a la hauteur d'une
 * ligne, et les jambages (p, q, g) doivent y rester avec de la marge.
 */
export const LABEL_LINE_HEIGHT = 1.3;
/** Épaisseur minimale d'un contour qui suffit à détacher un texte de l'image. */
export const OUTLINE_WIDTH = 0.1;
/** Deux couleurs à moins de cette distance (RVB) se confondent : un mot prononcé ne ressortirait pas. */
const DISTINCT = 100;

// ─── Couleurs ────────────────────────────────────────────────────

/** Couleur opaque en `#rrggbb`, ou `null` (couleur illisible ou en partie transparente). */
export function opaqueHex(color: string | undefined | null): string | null {
  if (!color) return null;
  const parsed = parseColor(color);
  if (!parsed || parsed.a < 0.999) return null;
  return `#${[parsed.r, parsed.g, parsed.b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function rgbOf(color: string): [number, number, number] | null {
  const parsed = parseColor(color);
  return parsed ? [parsed.r, parsed.g, parsed.b] : null;
}

/** Luminance relative WCAG (0 à 1). */
export function relativeLuminance(color: string): number {
  const rgb = rgbOf(color);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste WCAG entre deux couleurs (1 à 21) ; 1 quand l'une est illisible. */
export function contrastRatio(a: string, b: string): number {
  if (!rgbOf(a) || !rgbOf(b)) return 1;
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Deux couleurs que l'œil distingue l'une de l'autre (au-delà du seul contraste). */
export function distinctColors(a: string, b: string): boolean {
  const x = rgbOf(a);
  const y = rgbOf(b);
  if (!x || !y) return true;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) >= DISTINCT;
}

/** Contraste exigé d'un texte, selon son rôle et sa taille. */
export function minContrast(role: TextRole | undefined, size: number): number {
  return role === "title" && size > LARGE_TITLE_SIZE ? LARGE_TITLE_CONTRAST : TEXT_CONTRAST;
}

/**
 * Couleurs de la palette, dans l'ordre de leurs rôles (fond, surface, encre,
 * texte sur surface, accents…), sans doublon ni couleur illisible, puis noir
 * et blanc.
 */
export function paletteCandidates(palette: LegibilityPalette): string[] {
  const list = [
    palette.background,
    palette.surface,
    palette.ink,
    palette.onSurface,
    palette.accent,
    palette.accentSecondary,
    palette.onAccent,
    ...palette.extras,
    WHITE,
    BLACK,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const color of list) {
    const hex = opaqueHex(color);
    if (hex && !seen.has(hex)) {
      seen.add(hex);
      out.push(hex);
    }
  }
  return out;
}

/** Noir ou blanc, celui qui contraste le plus avec `ground` (toujours au moins 4,58:1). */
export function blackOrWhite(ground: string): string {
  return contrastRatio(BLACK, ground) >= contrastRatio(WHITE, ground) ? BLACK : WHITE;
}

/**
 * Couleur lisible sur un ou plusieurs fonds : la préférée si elle suffit,
 * sinon la première de la liste qui suffit sur tous, sinon noir ou blanc.
 */
export function readableOn(grounds: string[], preferred: string, candidates: string[], min: number): string {
  const fits = (color: string) => grounds.every((ground) => contrastRatio(color, ground) >= min);
  if (fits(preferred)) return preferred;
  const found = candidates.find(fits);
  if (found) return found;
  // Noir ou blanc : celui dont le pire contraste est le meilleur.
  const worst = (color: string) => Math.min(...grounds.map((ground) => contrastRatio(color, ground)));
  return worst(BLACK) >= worst(WHITE) ? BLACK : WHITE;
}

/**
 * Paire texte / fond qui atteint `min`. `keep` dit laquelle des deux couleurs
 * porte le sens et reste si possible : le texte (une étiquette posée par le
 * moteur prend le fond qui lui va) ou le fond (la teinte du segment d'une
 * étiquette reste, son texte change).
 */
export function pickPair(text: string, ground: string, candidates: string[], min: number, keep: "text" | "ground"): { text: string; ground: string } {
  if (contrastRatio(text, ground) >= min) return { text, ground };
  if (keep === "text") {
    const found = candidates.find((candidate) => contrastRatio(text, candidate) >= min);
    if (found) return { text, ground: found };
  }
  return { text: readableOn([ground], text, candidates, min), ground };
}

// ─── Ce qu'il y a derrière un texte ──────────────────────────────

/**
 * Fond d'un texte pendant toute sa présence : un ou plusieurs aplats unis de
 * couleur connue (`flat`), ou une image, une vidéo, un aplat partiel ou
 * translucide (`busy`), dont on ne peut rien garantir.
 */
export type Backdrop = { kind: "flat"; colors: string[] } | { kind: "busy" };

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const boxOf = (item: VisualItem): Box => {
  const t = item.transform;
  return { left: t.x - t.width / 2, right: t.x + t.width / 2, top: t.y - t.height / 2, bottom: t.y + t.height / 2 };
};

const clampBox = (box: Box): Box => ({ left: Math.max(0, box.left), right: Math.min(1, box.right), top: Math.max(0, box.top), bottom: Math.min(1, box.bottom) });
const intersects = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const EPSILON = 1e-3;
const covers = (outer: Box, inner: Box) =>
  outer.left <= inner.left + EPSILON && outer.right >= inner.right - EPSILON && outer.top <= inner.top + EPSILON && outer.bottom >= inner.bottom - EPSILON;

/** Un aplat est « plein » au-delà de cette opacité : le peu d'image qui transparaît ne change pas la lecture. */
const SOLID_OPACITY = 0.9;

/**
 * Ce qu'il y a sous un texte de la piste `trackIndex` : les pistes plus bas
 * dans la liste sont dessinées dessous. On regarde chaque tranche de temps où
 * rien ne change sous le texte, de la piste la plus proche à la plus basse.
 */
export function backdropOf(project: ClipProject, trackIndex: number, item: TextItem): Backdrop {
  const end = item.start + item.duration;
  // Un élément animé par images clés se lit à sa place posée : une fois entré, pas pendant son entrée
  // (une carte encore transparente n'est pas un fond chargé). Sans image clé, rien ne change.
  const settle = <T extends VisualItem>(entry: T, at: number): T => {
    if (!entry.keys?.length) return entry;
    const frame = Math.min(entry.start + entry.duration - 1, Math.max(at, entry.start + Math.round(project.fps * 0.6)));
    return { ...entry, transform: keyedFrame(entry, frame).transform };
  };
  const lower: Track[] = project.tracks.slice(trackIndex + 1).filter((track) => track.kind === "visual" && !track.hidden);

  const cuts = new Set<number>([item.start, end]);
  for (const track of lower) {
    for (const other of track.items) {
      if (other.start > item.start && other.start < end) cuts.add(other.start);
      const stop = other.start + other.duration;
      if (stop > item.start && stop < end) cuts.add(stop);
    }
  }
  const times = [...cuts].sort((a, b) => a - b);
  const colors = new Set<string>();
  for (let index = 0; index < times.length - 1; index++) {
    const at = (times[index] + times[index + 1]) / 2;
    const area = clampBox(boxOf(settle(item, at)));
    let found: string | null = null;
    for (const track of lower) {
      const present = track.items.find((candidate) => candidate.start <= at && at < candidate.start + candidate.duration) as VisualItem | undefined;
      const other = present ? settle(present, at) : undefined;
      if (!other || other.type === "text" || !intersects(boxOf(other), area)) continue;
      // Un tracé (barre, soulignement, flèche) est un trait, pas un fond : le texte garde le fond d'en dessous.
      if (other.type === "shape" && other.shape === "stroke") continue;
      if (other.type !== "shape") return { kind: "busy" };
      const shape = other as ShapeItem;
      const parsed = parseColor(shape.fill);
      // Un aplat invisible (voile retiré par la marque) ne compte pas.
      if (!parsed || parsed.a * shape.transform.opacity < 0.02) continue;
      const hex = opaqueHex(shape.fill);
      if (!hex || shape.shape !== "rect" || shape.transform.opacity < SOLID_OPACITY || shape.transform.rotation !== 0 || !covers(boxOf(shape), area)) {
        return { kind: "busy" };
      }
      found = hex;
      break;
    }
    const ground = found ?? opaqueHex(project.background);
    if (!ground) return { kind: "busy" };
    colors.add(ground);
  }
  return colors.size > 0 ? { kind: "flat", colors: [...colors] } : { kind: "flat", colors: [opaqueHex(project.background) ?? BLACK] };
}

// ─── Traitement d'un texte ───────────────────────────────────────

export interface LegibilityOptions {
  role?: TextRole;
  /** Arrondi d'étiquette de la marque, relatif à la taille du texte. */
  labelRadius?: number;
  /**
   * Couleur qui porte un sens (vert d'une bonne réponse, mise en avant du
   * numéro 1) : sur un aplat où elle ne se lit pas, elle reçoit une
   * étiquette plutôt que d'être remplacée.
   */
  keepColor?: boolean;
}

/** Traitement retenu pour un texte : aucun (aplat suffisant), étiquette ou contour. */
export type Treatment = "none" | "label" | "outline";

export function treatmentOf(style: TextStyle): Treatment {
  if (style.background && opaqueHex(style.background.color)) return "label";
  if (style.stroke && style.stroke.width >= OUTLINE_WIDTH - 1e-9 && opaqueHex(style.stroke.color)) return "outline";
  return "none";
}

/**
 * Style lisible d'un texte posé sur `backdrop`, aux couleurs de la palette.
 *
 * - Étiquette voulue par la marque (rôle « étiquette », fond plein) : son
 *   fond reste, la couleur du texte s'y ajuste.
 * - Aplat uni : rien à poser si le contraste suffit ; sinon une autre couleur
 *   de la palette pour le texte.
 * - Image : un contour épais si la marque en dessine un, sinon une étiquette
 *   au fond de la palette qui va au texte.
 *
 * L'ombre du style (l'impression double d'un titre) est toujours gardée.
 */
export function legibleStyle(style: TextStyle, backdrop: Backdrop, palette: LegibilityPalette, options: LegibilityOptions = {}): TextStyle {
  const min = minContrast(options.role, style.size);
  const candidates = paletteCandidates(palette);
  const color = opaqueHex(style.color) ?? style.color;

  const ownGround = style.background ? opaqueHex(style.background.color) : null;
  if (style.background && ownGround) {
    const pair = pickPair(color, ownGround, candidates, min, "ground");
    return { ...style, color: pair.text, lineHeight: Math.max(style.lineHeight, LABEL_LINE_HEIGHT) };
  }
  // Un fond translucide ne garantit rien : le texte est traité comme s'il n'en avait pas.
  const base: TextStyle = { ...style, color, background: null };

  if (backdrop.kind === "flat") {
    const fits = (candidate: string) => backdrop.colors.every((ground) => contrastRatio(candidate, ground) >= min);
    if (fits(color)) return base;
    if (!options.keepColor) {
      const recolored = candidates.find(fits);
      if (recolored) return { ...base, color: recolored };
      if (backdrop.colors.length === 1) return { ...base, color: blackOrWhite(backdrop.colors[0]) };
    }
  }

  const stroke = style.stroke ? opaqueHex(style.stroke.color) : null;
  if (style.stroke && stroke && style.stroke.width >= OUTLINE_WIDTH - 1e-9) {
    const pair = pickPair(color, stroke, candidates, min, "text");
    return { ...base, color: pair.text, stroke: { color: pair.ground, width: style.stroke.width } };
  }

  // Étiquette : de préférence le fond de la marque, sinon la couleur de la palette qui va au texte.
  const pair = pickPair(color, opaqueHex(palette.background) ?? WHITE, candidates, min, "text");
  return {
    ...base,
    color: pair.text,
    lineHeight: Math.max(style.lineHeight, LABEL_LINE_HEIGHT),
    // Le contour fin d'origine se dessinerait sur l'étiquette : il n'a plus de raison d'être.
    stroke: null,
    background: { color: pair.ground, padding: AUTO_LABEL.padding, radius: options.labelRadius ?? AUTO_LABEL.radius },
  };
}

/**
 * Sous-titres mot à mot : ils n'ont pas d'étiquette, toujours un contour
 * épais. On cherche un mot prononcé aux couleurs de la marque, un contour
 * qui le porte, puis un texte lisible sur ce contour et distinct du mot
 * prononcé ; les contours sombres d'abord, les plus lisibles sur une vidéo.
 */
export function legibleKaraoke(
  style: TextStyle,
  highlight: string,
  palette: LegibilityPalette
): { style: TextStyle; highlight: string } {
  const min = TEXT_CONTRAST;
  const candidates = paletteCandidates(palette);
  const grounds = [...candidates].sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
  const highlights = [highlight, palette.accent, palette.accentSecondary, ...palette.extras]
    .map((color) => opaqueHex(color))
    .filter((color, index, list): color is string => !!color && list.indexOf(color) === index);
  const texts = [style.color, palette.ink, palette.background, palette.surface, palette.onSurface, WHITE, BLACK]
    .map((color) => opaqueHex(color))
    .filter((color): color is string => !!color);
  const width = Math.max(OUTLINE_WIDTH, style.stroke?.width ?? 0);

  for (const mark of highlights) {
    for (const ground of grounds) {
      if (contrastRatio(mark, ground) < min) continue;
      const text = texts.find((candidate) => contrastRatio(candidate, ground) >= min && distinctColors(candidate, mark));
      // Une ombre sombre sur un contour clair salirait le contour : elle n'est gardée que sur un contour sombre.
      const shadow = relativeLuminance(ground) < 0.2 ? style.shadow : null;
      if (text) return { style: { ...style, color: text, stroke: { color: ground, width }, shadow, background: null }, highlight: mark };
    }
  }
  return { style: { ...style, color: WHITE, stroke: { color: BLACK, width }, background: null }, highlight: "#facc15" };
}
