/**
 * Regroupement des mots lus en lignes, puis des lignes en une zone par bulle
 * ou par récitatif (§ 6.4 du dossier) : proximité et alignement.
 *
 * Le moteur de lecture propose ses propres lignes, mais il lui arrive de
 * souder deux bulles voisines posées à la même hauteur. On repart donc des
 * mots. Fonctions pures, sans DOM.
 */

import { boxHeight, boxWidth, unionBox, type Box, type WordBox } from "./words";

export interface TextLine extends Box {
  words: WordBox[];
  /** Hauteur de la ligne : celle de son mot le plus haut. */
  height: number;
  text: string;
}

export interface TextGroup extends Box {
  lines: TextLine[];
  /** Texte lu, une ligne de la bulle par ligne. */
  raw: string;
  /** Confiance moyenne, pondérée par la longueur des mots, de 0 à 1. */
  confidence: number;
  /** Hauteur médiane des lignes : la taille du lettrage. */
  lineHeight: number;
  /** Inclinaison moyenne du texte, en degrés ; 0 si le moteur ne la donne pas. */
  angle: number;
}

/** Écart horizontal admis entre deux mots d'une même ligne, en hauteurs de ligne. */
const MAX_WORD_GAP = 1.1;
/** Écart vertical admis entre deux lignes d'une même bulle, en hauteurs de ligne. */
const MAX_LINE_GAP = 1.1;
/** Rapport de taille au-delà duquel deux lignes ne sont pas du même lettrage. */
const MAX_HEIGHT_RATIO = 1.8;
/** Part de la ligne la plus étroite qui doit être à l'aplomb de l'autre. */
const MIN_COLUMN_OVERLAP = 0.5;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function verticalOverlap(a: Box, b: Box): number {
  return Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
}

function horizontalOverlap(a: Box, b: Box): number {
  return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
}

function toLine(words: WordBox[]): TextLine {
  const sorted = [...words].sort((a, b) => a.x0 - b.x0);
  return {
    ...unionBox(sorted),
    words: sorted,
    height: Math.max(...sorted.map(boxHeight)),
    text: sorted.map((word) => word.text.trim()).join(" "),
  };
}

/**
 * Réunit les mots en lignes : deux mots se suivent sur une ligne s'ils sont à
 * la même hauteur et séparés de moins d'une hauteur de ligne environ.
 */
export function buildLines(words: WordBox[]): TextLine[] {
  const open: { words: WordBox[]; box: Box; height: number }[] = [];
  for (const word of [...words].sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0)) {
    const height = boxHeight(word);
    let best: (typeof open)[number] | null = null;
    let bestOverlap = 0;
    for (const line of open) {
      const reference = Math.max(line.height, height);
      const gap = word.x0 - line.box.x1;
      if (gap > reference * MAX_WORD_GAP || gap < -reference) continue;
      // Un petit signe (« - », « … ») compte s'il tient dans la hauteur de la ligne.
      const overlap = verticalOverlap(line.box, word) / Math.min(boxHeight(line.box), height);
      if (overlap >= 0.5 && overlap > bestOverlap) {
        best = line;
        bestOverlap = overlap;
      }
    }
    if (best) {
      best.words.push(word);
      best.box = unionBox([best.box, word]);
      best.height = Math.max(best.height, height);
    } else {
      open.push({ words: [word], box: { x0: word.x0, y0: word.y0, x1: word.x1, y1: word.y1 }, height });
    }
  }
  return open.map((line) => toLine(line.words)).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}

/** Deux lignes sont-elles l'une sous l'autre dans la même bulle ? */
function stacked(a: TextLine, b: TextLine): boolean {
  const [upper, lower] = a.y0 <= b.y0 ? [a, b] : [b, a];
  const tallest = Math.max(a.height, b.height);
  if (tallest / Math.min(a.height, b.height) > MAX_HEIGHT_RATIO) return false;
  const gap = lower.y0 - upper.y1;
  // Deux lignes qui se chevauchent presque entièrement sont côte à côte, pas empilées.
  if (gap > tallest * MAX_LINE_GAP || gap < -tallest * 0.5) return false;
  return horizontalOverlap(a, b) >= Math.min(boxWidth(a), boxWidth(b)) * MIN_COLUMN_OVERLAP;
}

function toGroup(lines: TextLine[]): TextGroup {
  const sorted = [...lines].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const words = sorted.flatMap((line) => line.words);
  let weight = 0;
  let confidence = 0;
  let angleWeight = 0;
  let angle = 0;
  for (const word of words) {
    const length = Math.max(1, word.text.trim().length);
    weight += length;
    confidence += word.confidence * length;
    if (typeof word.angle === "number" && Number.isFinite(word.angle)) {
      angleWeight += length;
      angle += word.angle * length;
    }
  }
  return {
    ...unionBox(sorted),
    lines: sorted,
    raw: sorted.map((line) => line.text).join("\n"),
    confidence: weight > 0 ? confidence / weight : 0,
    lineHeight: median(sorted.map((line) => line.height)),
    angle: angleWeight > 0 ? angle / angleWeight : 0,
  };
}

/** Réunit les lignes proches et alignées : une zone par bulle. */
export function groupLines(lines: TextLine[]): TextGroup[] {
  const parent = lines.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (stacked(lines[i], lines[j])) parent[find(i)] = find(j);
    }
  }
  const buckets = new Map<number, TextLine[]>();
  lines.forEach((line, index) => {
    const root = find(index);
    buckets.set(root, [...(buckets.get(root) ?? []), line]);
  });
  return [...buckets.values()].map(toGroup).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}

/** Des mots lus aux zones de texte : lignes, puis une zone par bulle. */
export function groupWords(words: WordBox[]): TextGroup[] {
  return groupLines(buildLines(words));
}

/**
 * Les lettres sont-elles rangées en colonnes, comme un texte japonais ou
 * chinois écrit de haut en bas ? Vrai quand, sur plusieurs colonnes, chaque
 * signe est plus près de son voisin du dessous que de son voisin de côté :
 * dans un texte latin, c'est l'inverse, les lettres se serrent sur la ligne.
 *
 * Une colonne seule ne dit rien : ce peut être un mot latin couché.
 */
export function isVerticalScript(glyphs: Box[]): boolean {
  if (glyphs.length < 4) return false;
  let below = 0;
  let beside = 0;
  for (const glyph of glyphs) {
    let gapBeside = Infinity;
    let gapBelow = Infinity;
    for (const other of glyphs) {
      if (other === glyph) continue;
      if (verticalOverlap(glyph, other) >= Math.min(boxHeight(glyph), boxHeight(other)) * 0.5) {
        gapBeside = Math.min(gapBeside, Math.max(0, other.x0 - glyph.x1, glyph.x0 - other.x1));
      }
      if (horizontalOverlap(glyph, other) >= Math.min(boxWidth(glyph), boxWidth(other)) * 0.5) {
        gapBelow = Math.min(gapBelow, Math.max(0, other.y0 - glyph.y1, glyph.y0 - other.y1));
      }
    }
    if (gapBelow === Infinity && gapBeside === Infinity) continue;
    if (gapBelow < gapBeside) below++;
    else beside++;
  }
  if (below + beside < 4 || below < (below + beside) * 0.7) return false;
  // Plusieurs colonnes : les signes s'étalent sur plus large qu'un seul d'entre eux.
  const widest = Math.max(...glyphs.map(boxWidth));
  const centers = glyphs.map((glyph) => (glyph.x0 + glyph.x1) / 2);
  return Math.max(...centers) - Math.min(...centers) > widest * 1.2;
}

/** Écart entre deux mots d'une ligne à partir duquel on se demande s'ils sont du même texte, en hauteurs de ligne. */
const MIN_GUTTER = 0.3;
/** Écart assez large pour séparer deux textes sans autre indice, en hauteurs de ligne. */
const WIDE_GUTTER = 0.9;
/** Décalage entre deux morceaux d'une ligne qui trahit deux textes, en hauteurs de ligne. */
const MIN_ROW_SHIFT = 0.2;

/**
 * Sépare deux textes posés côte à côte, que le hasard d'une ligne à la même
 * hauteur a réunis en un bloc. Chaque ligne est coupée à ses espaces ; les
 * morceaux sont regroupés par empilement seul. Si le bloc se défait en deux
 * paquets de plusieurs lignes, que seules des lignes décalées de part et
 * d'autre de l'espace reliaient, ce sont deux textes : dans un paragraphe, les
 * mots d'une ligne sont à la même hauteur et tiennent aux lignes voisines.
 *
 * Rend les lignes du bloc telles quelles, en un seul paquet, quand rien ne
 * les sépare.
 */
export function splitBlocks(lines: TextLine[]): TextLine[][] {
  const segments: { line: TextLine; source: number }[] = [];
  lines.forEach((line, source) => {
    let current: WordBox[] = [];
    for (const word of line.words) {
      const last = current[current.length - 1];
      if (last && word.x0 - Math.max(...current.map((entry) => entry.x1)) >= line.height * MIN_GUTTER) {
        segments.push({ line: toLine(current), source });
        current = [];
      }
      current.push(word);
    }
    if (current.length > 0) segments.push({ line: toLine(current), source });
  });
  if (segments.length === lines.length) return [lines];

  const parent = segments.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (segments[i].source !== segments[j].source && stacked(segments[i].line, segments[j].line)) parent[find(i)] = find(j);
    }
  }

  // Deux paquets restent séparés s'ils comptent chacun plusieurs lignes et si les
  // lignes qui les reliaient sont décalées, ou séparées par un large couloir.
  const rows = (root: number) => new Set(segments.filter((_, index) => find(index) === root).map((segment) => segment.source)).size;
  for (;;) {
    const links = new Map<string, { a: number; b: number; shifts: number[]; gaps: number[] }>();
    for (let index = 1; index < segments.length; index++) {
      const left = segments[index - 1];
      const right = segments[index];
      const a = find(index - 1);
      const b = find(index);
      if (left.source !== right.source || a === b) continue;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const link = links.get(key) ?? { a, b, shifts: [], gaps: [] };
      const height = lines[left.source].height;
      link.shifts.push(Math.abs((left.line.y0 + left.line.y1) / 2 - (right.line.y0 + right.line.y1) / 2) / height);
      link.gaps.push((right.line.x0 - left.line.x1) / height);
      links.set(key, link);
    }
    let merged = false;
    for (const link of links.values()) {
      const apart = rows(link.a) >= 2 && rows(link.b) >= 2 && (median(link.shifts) >= MIN_ROW_SHIFT || Math.min(...link.gaps) >= WIDE_GUTTER);
      if (apart) continue;
      parent[find(link.a)] = find(link.b);
      merged = true;
      break;
    }
    if (!merged) break;
  }

  const buckets = new Map<number, Map<number, WordBox[]>>();
  segments.forEach((segment, index) => {
    const root = find(index);
    const bucket = buckets.get(root) ?? new Map<number, WordBox[]>();
    bucket.set(segment.source, [...(bucket.get(segment.source) ?? []), ...segment.line.words]);
    buckets.set(root, bucket);
  });
  if (buckets.size < 2) return [lines];
  return [...buckets.values()].map((bucket) => [...bucket.values()].map(toLine));
}

/**
 * Des lettres aux blocs de texte : lignes, blocs, puis séparation des blocs
 * qui réunissent deux textes voisins.
 */
export function clusterGlyphs(glyphs: WordBox[]): TextGroup[] {
  return groupLines(buildLines(glyphs))
    .flatMap((group) => {
      const blocks = splitBlocks(group.lines);
      return blocks.length > 1 ? blocks.map(toGroup) : [group];
    })
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}
