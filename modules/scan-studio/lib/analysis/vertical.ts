/**
 * Texte en signes pleins (japonais, chinois, coréen) : sens d'écriture,
 * colonnes, furigana.
 *
 * Trois choses distinguent ce lettrage du lettrage latin au moment du
 * repérage :
 *  - un signe est fait de plusieurs taches d'encre (les traits de « 三 », les
 *    deux moitiés de « い ») : on les réunit avant de juger de leur disposition ;
 *  - le texte s'écrit en lignes ou en colonnes, lues de haut en bas et de
 *    droite à gauche. Dans un cas comme dans l'autre les signes sont posés sur
 *    une grille ; ce qui les distingue est l'écart : les signes se serrent dans
 *    le sens de l'écriture, et les lignes (ou les colonnes) s'espacent ;
 *  - le japonais porte des furigana : de petits signes de lecture posés à
 *    droite d'une colonne, ou au-dessus d'une ligne. Ils ne sont pas du texte à
 *    traduire.
 *
 * Les colonnes sont construites par les fonctions des lignes (`grouping.ts`),
 * sur des boîtes dont on a échangé les axes. Fonctions pures, sans DOM.
 */

import { buildLines, clusterLines, type TextGroup, type TextLine } from "./grouping";
import type { WritingDirection } from "./languages";
import { boxHeight, boxWidth, unionBox, type Box, type WordBox } from "./words";

/** Écart admis entre deux traits d'un même signe, en tailles de signe. */
const MAX_STROKE_GAP = 0.3;
/** Taille qu'un signe recomposé ne dépasse pas, en tailles de signe. */
const MAX_CELL_GROWTH = 1.2;
/** Au-delà de ce nombre de taches, on ne recompose pas les signes : trop long pour ce que ça apporte. */
const MAX_MERGED_GLYPHS = 600;
/** Écart admis entre deux taches d'un même texte posé sur le dessin, en tailles de tache. */
const CLUSTER_REACH = 1.3;
/** Rapport de taille au-delà duquel deux taches voisines ne sont pas du même texte : une lettre et une forme du dessin. */
const MAX_CLUSTER_RATIO = 4;
/** Taille qu'une tache de furigana ne dépasse pas, en tailles de signe. */
const MAX_RUBY_SIZE = 0.65;
/** Taille à partir de laquelle une tache dit où passe une ligne, en tailles de signe. */
const MIN_BAND_SIZE = 0.7;
/** Écart admis entre les furigana et la ligne qu'ils annotent, en tailles de signe. */
const MAX_RUBY_GAP = 0.35;

/** Échange les axes d'une boîte : une colonne devient une ligne, et inversement. */
export function transpose<T extends Box>(box: T): T {
  return { ...box, x0: box.y0, y0: box.x0, x1: box.y1, y1: box.x1 };
}

const sizeOf = (box: Box) => Math.max(boxWidth(box), boxHeight(box));

/** Écart entre deux boîtes : 0 si elles se touchent, sinon leur distance sur l'axe où elles sont le plus loin. */
function gapBetween(a: Box, b: Box): number {
  return Math.max(0, a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
}

/**
 * Taille d'un signe parmi des taches : la plus grande dimension des plus
 * grandes d'entre elles (neuvième décile). Un signe plein comme « 国 » tient en
 * une seule tache, de la taille du lettrage.
 */
export function characterSize(glyphs: Box[]): number {
  if (glyphs.length === 0) return 0;
  const sizes = glyphs.map(sizeOf).sort((a, b) => a - b);
  return sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * 0.9))];
}

/** Signe recomposé : sa boîte, et les taches d'encre qui le font. */
export interface Sign<T extends Box = Box> extends Box {
  strokes: T[];
}

/**
 * Recompose les signes : deux taches voisines sont réunies tant que leur
 * réunion tient dans la taille d'un signe. Deux signes entiers ne sont donc
 * jamais soudés ; deux moitiés de signes voisins peuvent l'être, ce qui ne
 * change rien à la disposition d'ensemble.
 *
 * C'est sur les signes, pas sur les taches, que se construisent les lignes et
 * les colonnes : les deux moitiés d'un kanji sont deux taches côte à côte, qui
 * ouvriraient deux colonnes au lieu d'une.
 */
export function mergeStrokes<T extends Box>(glyphs: T[]): Sign<T>[] {
  const signs: Sign<T>[] = glyphs.map((glyph) => ({ x0: glyph.x0, y0: glyph.y0, x1: glyph.x1, y1: glyph.y1, strokes: [glyph] }));
  if (signs.length < 2 || signs.length > MAX_MERGED_GLYPHS) return signs;
  const size = characterSize(signs);
  const reach = size * MAX_STROKE_GAP;
  const limit = size * MAX_CELL_GROWTH;
  for (let i = 0; i < signs.length; i++) {
    for (let j = i + 1; j < signs.length; j++) {
      if (gapBetween(signs[i], signs[j]) > reach) continue;
      const union = unionBox([signs[i], signs[j]]);
      if (boxWidth(union) > limit || boxHeight(union) > limit) continue;
      signs[i] = { ...union, strokes: [...signs[i].strokes, ...signs[j].strokes] };
      signs.splice(j, 1);
      // Le signe a grandi : ses voisins sont à revoir depuis le début.
      j = i;
    }
  }
  return signs;
}

/**
 * Sens d'écriture de signes posés sur une grille : en colonnes quand chaque
 * signe est plus près de son voisin du dessous que de son voisin de côté, en
 * lignes dans le cas contraire. `prefer` tranche quand la disposition ne dit
 * rien : un signe seul, ou autant de voix de chaque côté.
 */
export function writingDirection(cells: Box[], prefer: WritingDirection = "horizontal"): WritingDirection {
  let below = 0;
  let beside = 0;
  for (const cell of cells) {
    let gapBeside = Infinity;
    let gapBelow = Infinity;
    for (const other of cells) {
      if (other === cell) continue;
      const sharedY = Math.min(cell.y1, other.y1) - Math.max(cell.y0, other.y0);
      const sharedX = Math.min(cell.x1, other.x1) - Math.max(cell.x0, other.x0);
      if (sharedY >= Math.min(boxHeight(cell), boxHeight(other)) * 0.5) {
        gapBeside = Math.min(gapBeside, Math.max(0, other.x0 - cell.x1, cell.x0 - other.x1));
      }
      if (sharedX >= Math.min(boxWidth(cell), boxWidth(other)) * 0.5) {
        gapBelow = Math.min(gapBelow, Math.max(0, other.y0 - cell.y1, cell.y0 - other.y1));
      }
    }
    if (gapBelow < gapBeside) below++;
    else if (gapBeside < gapBelow) beside++;
  }
  if (below === beside) return prefer;
  return below > beside ? "vertical" : "horizontal";
}

/**
 * Paquets de taches voisines, sans préjuger du sens d'écriture : deux taches
 * vont ensemble si elles sont à moins d'une taille de tache environ l'une de
 * l'autre. Sert au texte posé sur le dessin, que rien d'autre ne délimite.
 */
export function proximityClusters<T extends Box>(glyphs: T[]): T[][] {
  const sorted = [...glyphs].sort((a, b) => a.x0 - b.x0);
  const parent = sorted.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const largest = sorted.reduce((max, glyph) => Math.max(max, sizeOf(glyph)), 0) * CLUSTER_REACH;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      // Triées par bord gauche : au-delà de la portée la plus longue, plus aucune voisine.
      if (sorted[j].x0 - sorted[i].x1 > largest) break;
      // La portée suit la plus petite des deux : une lettre ne s'accroche pas à une grande forme voisine.
      const small = Math.min(sizeOf(sorted[i]), sizeOf(sorted[j]));
      if (Math.max(sizeOf(sorted[i]), sizeOf(sorted[j])) > small * MAX_CLUSTER_RATIO) continue;
      if (gapBetween(sorted[i], sorted[j]) <= small * CLUSTER_REACH) parent[find(i)] = find(j);
    }
  }
  const buckets = new Map<number, T[]>();
  sorted.forEach((glyph, index) => {
    const root = find(index);
    buckets.set(root, [...(buckets.get(root) ?? []), glyph]);
  });
  return [...buckets.values()];
}

/**
 * Sépare les furigana du texte, parmi les taches d'un bloc écrit en lignes (ou
 * en colonnes ramenées à des lignes par `transpose`).
 *
 * Les grandes taches disent où passent les lignes : chacune couvre une bande
 * de la hauteur d'un signe. Une tache est un furigana quand elle est petite,
 * hors de toute bande, et posée contre l'une d'elles du côté où se mettent les
 * furigana : `before`, au-dessus d'une ligne horizontale ; `after`, à droite
 * d'une colonne (donc après elle, une fois les axes échangés).
 *
 * Une ponctuation, un petit kana ou le trait d'un kanji ne sont pas concernés :
 * ils sont dans la bande de leur ligne, pas à côté. La mesure se fait sur les
 * taches, avant de recomposer les signes : un furigana collé à son kanji
 * serait sinon soudé à lui.
 */
export function splitRuby<T extends Box>(strokes: T[], side: "before" | "after"): { base: T[]; ruby: T[] } {
  const size = characterSize(strokes);
  if (strokes.length < 3 || size <= 0) return { base: strokes, ruby: [] };
  // Bandes des lignes : les étendues verticales des grandes taches, réunies quand elles se recouvrent.
  const bands: Box[] = [];
  for (const stroke of strokes.filter((entry) => sizeOf(entry) >= size * MIN_BAND_SIZE).sort((a, b) => a.y0 - b.y0)) {
    const last = bands[bands.length - 1];
    if (last && stroke.y0 < last.y1) bands[bands.length - 1] = unionBox([last, stroke]);
    else bands.push({ x0: stroke.x0, y0: stroke.y0, x1: stroke.x1, y1: stroke.y1 });
  }
  // Une bande a au moins la hauteur d'un signe : une ligne dont les grandes taches sont étroites
  // (des kana aux traits fins) garderait sinon ses propres traits hors d'elle.
  for (const [index, band] of bands.entries()) {
    const missing = size - boxHeight(band);
    if (missing > 0) bands[index] = { ...band, y0: band.y0 - missing / 2, y1: band.y1 + missing / 2 };
  }
  const reach = size * MAX_RUBY_GAP;
  const ruby = new Set<T>();
  for (const stroke of strokes) {
    if (sizeOf(stroke) > size * MAX_RUBY_SIZE) continue;
    const center = (stroke.y0 + stroke.y1) / 2;
    if (bands.some((band) => center >= band.y0 && center <= band.y1)) continue;
    const annotated = bands.some((band) => {
      const gap = side === "before" ? band.y0 - stroke.y1 : stroke.y0 - band.y1;
      const beyond = side === "before" ? center < band.y0 : center > band.y1;
      return beyond && gap <= reach && stroke.x1 > band.x0 && stroke.x0 < band.x1;
    });
    if (annotated) ruby.add(stroke);
  }
  return { base: strokes.filter((stroke) => !ruby.has(stroke)), ruby: strokes.filter((stroke) => ruby.has(stroke)) };
}

/** Bloc de texte repéré, avec son sens d'écriture et ses furigana. */
export interface WrittenGroup<T extends Box = Box> extends TextGroup {
  direction: WritingDirection;
  /** Boîtes des furigana attachés au bloc : à masquer, jamais à lire. */
  ruby: Box[];
  /** Signes du bloc, furigana non compris. */
  signs: Sign<T>[];
}

export interface WritingOptions {
  /** Sens retenu quand la disposition ne tranche pas. */
  prefer: WritingDirection;
  /** Chercher des furigana (japonais). */
  ruby: boolean;
}

function transposeGroup(group: TextGroup): TextGroup {
  return {
    ...transpose(group),
    lines: group.lines.map((line) => ({ ...transpose(line), words: line.words.map(transpose) })),
  };
}

/**
 * Des taches d'un même contenant (une bulle, ou un paquet posé sur le dessin)
 * aux blocs de texte : sens d'écriture, lignes ou colonnes, furigana écartés,
 * puis un bloc par texte. Pour un bloc en colonnes, `lines` porte ses colonnes
 * et `lineHeight` leur largeur : dans les deux sens, c'est la taille du
 * lettrage.
 */
export function clusterWriting<T extends Box>(glyphs: T[], options: WritingOptions): WrittenGroup<T>[] {
  if (glyphs.length === 0) return [];
  // Le sens se lit sur les signes recomposés, furigana compris : ils suivent le sens du texte.
  const direction = writingDirection(mergeStrokes(glyphs), options.prefer);
  const vertical = direction === "vertical";
  // Dans l'espace des lignes : une colonne y est une ligne, axes échangés.
  const placed = new Map<Box, T>();
  const inLineSpace = glyphs.map((glyph) => {
    const box: Box = vertical ? transpose({ x0: glyph.x0, y0: glyph.y0, x1: glyph.x1, y1: glyph.y1 }) : { x0: glyph.x0, y0: glyph.y0, x1: glyph.x1, y1: glyph.y1 };
    placed.set(box, glyph);
    return box;
  });
  const split = options.ruby ? splitRuby(inLineSpace, vertical ? "after" : "before") : { base: inLineSpace, ruby: [] };
  // Chaque signe passe pour un mot d'une lettre : les fonctions des lignes n'en demandent pas plus.
  const origin = new Map<WordBox, Sign<Box>>();
  const words = mergeStrokes(split.base).map((sign) => {
    const word: WordBox = { x0: sign.x0, y0: sign.y0, x1: sign.x1, y1: sign.y1, text: "x", confidence: 1 };
    origin.set(word, sign);
    return word;
  });
  const back = <B extends Box>(box: B): B => (vertical ? transpose(box) : box);
  return clusterLines(buildLines(words)).map((found) => {
    // Les furigana vont au bloc qu'ils touchent : ils en élargissent la boîte, pour être masqués avec lui.
    const reach = found.lineHeight * MAX_RUBY_GAP;
    const attached = split.ruby.filter(
      (stroke) => stroke.x1 > found.x0 && stroke.x0 < found.x1 && stroke.y1 > found.y0 - reach && stroke.y0 < found.y1 + reach,
    );
    const signs: Sign<T>[] = found.lines
      .flatMap((line) => line.words)
      .flatMap((word) => origin.get(word) ?? [])
      .map((sign) => ({ ...back({ x0: sign.x0, y0: sign.y0, x1: sign.x1, y1: sign.y1 }), strokes: sign.strokes.flatMap((stroke) => placed.get(stroke) ?? []) }));
    const group = vertical ? transposeGroup(found) : found;
    const ruby = attached.map((stroke) => back({ x0: stroke.x0, y0: stroke.y0, x1: stroke.x1, y1: stroke.y1 }));
    return { ...group, ...unionBox([group, ...ruby]), direction, ruby, signs };
  });
}
