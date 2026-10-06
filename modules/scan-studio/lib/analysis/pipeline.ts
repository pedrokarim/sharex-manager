/**
 * Chaîne d'analyse d'une page : repérage, lecture, nettoyage, regroupement,
 * ordre de lecture (§ 6.1 à 6.4 du dossier).
 *
 * Ce fichier ne connaît ni le DOM ni le moteur : il parle à un `PageReader`,
 * qui sait lire un rectangle de la page et en rendre les pixels. Le navigateur
 * en fournit un (canevas et Tesseract en WebAssembly), le banc d'essai un
 * autre : c'est la même chaîne qui est mesurée et qui tourne dans l'atelier.
 *
 * Le banc d'essai (`docs/modules/06-scan-studio-banc-essai.md`) a tranché la
 * répartition des rôles : Tesseract lit bien une bulle isolée, mais repère mal
 * le texte sur une page entière (il en oublie des bulles et peut passer trente
 * secondes sur une trame). D'où deux étapes :
 *  1. repérage par les pixels (`ink.ts`) : les lettres sont de petites taches
 *     sur un fond uni, regroupées en une zone par bulle ;
 *  2. lecture de chaque zone seule : découpée, agrandie si elle est petite,
 *     redressée si elle penche, inversée si le texte est clair (§ 6.2).
 * Si le repérage ne trouve rien, la page entière est lue en « texte épars »,
 * en dernier recours.
 */

import type { Rect } from "../geometry";
import { sampleBackgroundColor, type PixelData } from "../mask-color";
import type { ChapterSettings, Point, ScanRegion } from "../types";
import type { CleanOptions } from "./clean-text";
import { MAX_FOREIGN_SHARE, isEnclosure, surveyContainer, type Container } from "./containers";
import { buildLines, clusterGlyphs, groupWords, isVerticalScript, type TextGroup, type TextLine } from "./grouping";
import { backgroundThresholds, estimateAngle, findGlyphs, labelBackground, toBitmap, type InkBox, type Polarity } from "./ink";
import { MAX_PAGE_REGIONS } from "./merge";
import { sortByReadingOrder } from "./reading-order";
import { buildRegion } from "./regions";
import { boxHeight, boxWidth, dropNoiseWords, intersectionArea, isNoiseText, minTextHeight, overlapRatio, unionBox, type Box, type PageSize, type WordBox } from "./words";

export interface ReadOptions {
  /** `block` : un seul bloc de texte ; `sparse` : texte épars sur toute une page. */
  mode: "sparse" | "block";
  /** Agrandissement appliqué au rectangle avant la lecture. */
  scale: number;
  /** Négatif de l'image : un texte clair sur fond sombre se lit mieux noir sur blanc. */
  invert: boolean;
  /** Rotation appliquée au rectangle avant la lecture, en degrés, sens horaire. */
  rotate: number;
  /**
   * Rectangles de la page à recouvrir de la teinte du papier avant la lecture :
   * le texte voisin, dans la même bulle, qui dépasse dans le rectangle lu.
   */
  erase?: Rect[];
}

export interface PageReader {
  size: PageSize;
  /** Lit un rectangle de la page. Les boîtes rendues sont en pixels de l'image lue (rectangle agrandi, tourné). */
  read(rect: Rect, options: ReadOptions, onProgress?: (progress: number) => void): Promise<WordBox[]>;
  /** Pixels d'un rectangle de la page, et le coin où il commence ; `null` s'ils sont illisibles. */
  pixels(rect: Rect): { pixels: PixelData; offset: Point } | null;
}

export interface PipelineOptions extends CleanOptions {
  createId: () => string;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

/** Zone candidate : un paquet de lettres repéré par ses pixels, pas encore lu. */
export interface Candidate extends Box {
  /** Hauteur médiane des lignes : la taille du lettrage. */
  lineHeight: number;
  glyphs: number;
  polarity: Polarity;
  /** Inclinaison estimée du texte, en degrés. */
  angle: number;
  /** Bulle ou cartouche qui porte le texte ; absent pour un texte posé sur le dessin. */
  container?: Container;
  /** Points de la page pris dans le contenant, juste au-dessus de quelques lettres. */
  anchors?: Point[];
  /** Place dont le texte dispose dans son contenant, relevée sur les pixels. */
  room?: Box;
  /** Autres blocs de texte de la même bulle : ils ne doivent pas être lus avec celui-ci. */
  siblings?: Box[];
}

/** Tache d'encre ramenée dans la page, avec un point du fond qui l'entoure. */
export interface PageGlyph extends InkBox {
  anchor?: Point;
}

export interface DetectOptions {
  /**
   * La langue source s'écrit en lettres latines : un texte rangé en colonnes
   * (le lettrage japonais resté dans le dessin) est écarté sans être lu.
   */
  latinOnly?: boolean;
}

/** Hauteur d'une tranche de page traitée d'un bloc, et recouvrement entre deux tranches. */
const TILE_HEIGHT = 3200;
const TILE_OVERLAP = 480;
/** Hauteur de capitale visée à la lecture d'une zone, en pixels. */
const TARGET_LINE_HEIGHT = 32;
/** Agrandissement maximal avant lecture ; un lettrage minuscule (moins de 11 px) monte plus haut. */
const MAX_SCALE = 3;
const MAX_SMALL_SCALE = 4.5;
/** Lettres qu'un texte posé sur le dessin doit compter : deux taches seules ne font pas un mot. */
const MIN_FREE_GLYPHS = 3;
/** Écart de taille entre les taches d'un texte posé sur le dessin : au-delà, c'est du dessin. */
const MAX_FREE_SPREAD = 3;
/** Place cherchée autour d'un texte dans sa bulle, en hauteurs de ligne. */
const ROOM_REACH = 2.5;
/** Part du bloc le plus étroit qui doit être à l'aplomb de l'autre pour que deux blocs d'une bulle n'en fassent qu'un. */
const MIN_STACK_OVERLAP = 0.4;
/** Points d'ancrage gardés par candidate. */
const MAX_ANCHORS = 12;
/** Inclinaison sous laquelle on ne redresse pas le texte, en degrés. */
const MIN_DESKEW = 2.5;
/** Nombre de candidates lues par page, au plus : les plus fournies d'abord. */
const MAX_CANDIDATES = 80;
/** Petites taches qu'une zone peut annexer de chaque côté : des points de suspension, pas une trame. */
const MAX_ABSORBED_MARKS = 8;
/** Marge de lecture sous laquelle on ne s'arrête pas au contour de la bulle, en pixels. */
const MIN_READING_MARGIN = 3;
/** Part de l'avancement tenue par le repérage. */
const DETECTION_SHARE = 0.1;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Analyse interrompue", "AbortError");
}

/**
 * Tranches d'une page. Une page ordinaire tient en une tranche ; une bande de
 * webtoon est découpée en tranches qui se recouvrent (§ 6.4).
 */
export function sliceTiles(page: PageSize, tileHeight = TILE_HEIGHT, overlap = TILE_OVERLAP): Rect[] {
  if (page.height <= tileHeight * 1.25) return [{ x: 0, y: 0, width: page.width, height: page.height }];
  const tiles: Rect[] = [];
  const step = tileHeight - overlap;
  for (let y = 0; y < page.height; y += step) {
    const height = Math.min(tileHeight, page.height - y);
    tiles.push({ x: 0, y, width: page.width, height });
    if (y + height >= page.height) break;
  }
  return tiles;
}

/**
 * Recolle ce que les tranches ont trouvé. Une boîte coupée par le bord d'une
 * tranche est écartée (la tranche voisine la porte entière) ; une boîte vue
 * deux fois dans le recouvrement n'est gardée qu'une fois : `prefer` dit si la
 * nouvelle venue remplace celle déjà gardée, et `keep-all` garde les doublons
 * (pour les grains, trop nombreux pour être comparés deux à deux).
 */
export function mergeTiles<T extends Box>(
  tiles: { rect: Rect; boxes: T[] }[],
  page: PageSize,
  prefer: ((candidate: T, kept: T) => boolean) | "keep-all" = () => false,
): T[] {
  const merged: T[] = [];
  for (const { rect, boxes } of tiles) {
    const top = rect.y;
    const bottom = rect.y + rect.height;
    for (const box of boxes) {
      if (top > 0 && box.y0 <= top + 2) continue;
      if (bottom < page.height && box.y1 >= bottom - 2) continue;
      if (prefer === "keep-all") {
        merged.push(box);
        continue;
      }
      const twin = tiles.length > 1 ? merged.findIndex((other) => overlapRatio(other, box) > 0.6) : -1;
      if (twin < 0) merged.push(box);
      else if (prefer(box, merged[twin])) merged[twin] = box;
    }
  }
  return merged;
}

/** Ramène en pixels de la page les boîtes lues sur un rectangle agrandi. */
export function toPageWords(words: WordBox[], rect: Rect, scale: number): WordBox[] {
  return words.map((word) => ({
    ...word,
    x0: rect.x + word.x0 / scale,
    y0: rect.y + word.y0 / scale,
    x1: rect.x + word.x1 / scale,
    y1: rect.y + word.y1 / scale,
  }));
}

/** Taille d'une tache : sa plus grande dimension. */
const glyphSize = (glyph: Box) => Math.max(boxWidth(glyph), boxHeight(glyph));

/**
 * Regroupe des lettres en zones candidates : lignes, puis une zone par bulle.
 *
 * Avec `containers`, les lettres d'une même bulle ne sont regroupées qu'entre
 * elles : rien ne les réunit à celles de la bulle voisine ni aux taches du
 * dessin. Les lettres sans bulle (texte posé sur le dessin, bulle ouverte)
 * sont regroupées comme avant, par proximité, mais on leur demande plus :
 * trois taches au moins, de tailles voisines.
 */
export function groupGlyphs(glyphs: PageGlyph[], polarity: Polarity, page: PageSize, containers?: Map<number, Container>, options: DetectOptions = {}): Candidate[] {
  const minHeight = minTextHeight(page);
  const enclosed = new Map<number, PageGlyph[]>();
  const free: PageGlyph[] = [];
  for (const glyph of glyphs) {
    const container = glyph.container === undefined ? undefined : containers?.get(glyph.container);
    if (container && isEnclosure(container, page)) enclosed.set(container.id, [...(enclosed.get(container.id) ?? []), glyph]);
    else free.push(glyph);
  }

  const candidates: Candidate[] = [];
  const collect = (members: PageGlyph[], container?: Container) => {
    for (const group of clusterGlyphs(members.map((glyph) => ({ ...glyph, text: "x", confidence: 1 })))) {
      const letters = group.lines.flatMap((line) => line.words);
      const count = letters.length;
      if (count < 2 || group.lineHeight < minHeight) continue;
      if (!container && containers) {
        if (count < MIN_FREE_GLYPHS) continue;
        const sizes = letters.map(glyphSize).sort((a, b) => a - b);
        if (sizes[sizes.length - 1] > sizes[Math.floor(sizes.length / 2)] * MAX_FREE_SPREAD) continue;
      }
      if (options.latinOnly && isVerticalScript(letters)) continue;
      // L'inclinaison se lit sur les lignes assez longues, pondérées par leur nombre de lettres.
      let weight = 0;
      let angle = 0;
      for (const line of group.lines) {
        if (line.words.length < 4) continue;
        weight += line.words.length;
        angle += estimateAngle(line.words) * line.words.length;
      }
      // Des lettres empilées une à une : un texte couché, écrit de haut en bas.
      if (group.lines.length >= 3 && group.lines.every((line) => line.words.length === 1)) {
        weight = 1;
        angle = 90;
      }
      const candidate: Candidate = {
        x0: group.x0,
        y0: group.y0,
        x1: group.x1,
        y1: group.y1,
        lineHeight: group.lineHeight,
        glyphs: count,
        polarity,
        angle: weight > 0 ? angle / weight : 0,
      };
      if (container) {
        candidate.container = container;
        const anchors = (letters as (WordBox & PageGlyph)[]).flatMap((letter) => (letter.anchor ? [letter.anchor] : []));
        const step = Math.max(1, Math.ceil(anchors.length / MAX_ANCHORS));
        candidate.anchors = anchors.filter((_, index) => index % step === 0);
      }
      candidates.push(candidate);
    }
  };
  for (const [id, members] of enclosed) {
    // Une bulle porte une ligne de lettres. Une ou deux taches seules dans une plage fermée
    // sont les creux d'une grande lettre cernée : elles retournent avec les lettres sans bulle.
    const lines = buildLines(members.map((glyph) => ({ ...glyph, text: "x", confidence: 1 })));
    if (lines.some((line) => line.words.length >= 2) || lines.length >= 3) collect(members, containers?.get(id));
    else free.push(...members);
  }
  collect(free);
  return candidates;
}

/**
 * Étend une candidate aux petites taches posées au bout de ses lignes : les
 * points de suspension et la ponctuation finale, trop petits pour compter
 * comme des lettres, doivent tout de même être dans le rectangle lu.
 */
export function absorbMarks(candidate: Candidate, marks: InkBox[]): Candidate {
  const reach = candidate.lineHeight * 0.8;
  const inBand = marks.filter((mark) => {
    // Dans une bulle, seules ses propres taches comptent : pas celles de la bulle d'à côté.
    if (candidate.container && mark.container !== candidate.container.id) return false;
    const center = (mark.y0 + mark.y1) / 2;
    return center >= candidate.y0 && center <= candidate.y1;
  });
  let { x0, x1 } = candidate;
  let right = 0;
  for (const mark of inBand.filter((entry) => entry.x0 >= candidate.x1 - 1).sort((a, b) => a.x0 - b.x0)) {
    if (mark.x0 - x1 > reach || mark.x1 - candidate.x1 > reach * 4) break;
    x1 = Math.max(x1, mark.x1);
    right++;
  }
  let left = 0;
  for (const mark of inBand.filter((entry) => entry.x1 <= candidate.x0 + 1).sort((a, b) => b.x1 - a.x1)) {
    if (x0 - mark.x1 > reach || candidate.x0 - mark.x0 > reach * 4) break;
    x0 = Math.min(x0, mark.x0);
    left++;
  }
  // Trop de grains d'un côté : c'est une trame, pas une ponctuation.
  if (right > MAX_ABSORBED_MARKS) x1 = candidate.x1;
  if (left > MAX_ABSORBED_MARKS) x0 = candidate.x0;
  return x0 === candidate.x0 && x1 === candidate.x1 ? candidate : { ...candidate, x0, x1 };
}

/**
 * Les deux lectures de l'image se recoupent : l'intérieur d'un « O » noir est
 * une tache claire, et inversement. De deux candidates superposées, on garde
 * celle dont le lettrage est le plus grand : l'autre n'en est que les creux.
 */
export function dropEchoes(candidates: Candidate[]): Candidate[] {
  return candidates.filter(
    (candidate) =>
      !candidates.some(
        (other) =>
          other !== candidate &&
          other.polarity !== candidate.polarity &&
          overlapRatio(candidate, other) > 0.5 &&
          (other.lineHeight > candidate.lineHeight || (other.lineHeight === candidate.lineHeight && other.glyphs > candidate.glyphs)),
      ),
  );
}

/** Candidates d'une page, repérées par les pixels, tranche par tranche. */
export function detectCandidates(reader: PageReader, options: DetectOptions = {}): Candidate[] {
  const page = reader.size;
  const factor = Math.max(1, Math.ceil(page.width / 1800));
  const width = page.width / factor;
  const limits = { minSize: Math.max(5, Math.round(width * 0.006)), maxWidth: width * 0.25, maxHeight: width * 0.2 };
  const found: Record<Polarity, { rect: Rect; boxes: PageGlyph[] }[]> = { dark: [], light: [] };
  const marks: Record<Polarity, { rect: Rect; boxes: PageGlyph[] }[]> = { dark: [], light: [] };
  const containers = new Map<number, Container>();
  let nextId = 1;
  // Une bulle à cheval sur deux tranches y porte deux numéros : ils sont réunis quand une lettre est vue deux fois.
  const alias = new Map<number, number>();
  const resolve = (id: number): number => {
    let root = id;
    while (alias.has(root)) root = alias.get(root)!;
    return root;
  };

  for (const rect of sliceTiles(page)) {
    const read = reader.pixels(rect);
    if (!read) continue;
    const bitmap = toBitmap(read.pixels, factor);
    const thresholds = backgroundThresholds(bitmap);
    for (const polarity of ["dark", "light"] as const) {
      const threshold = thresholds[polarity === "dark" ? "light" : "dark"];
      const background = labelBackground(bitmap, polarity, threshold);
      const ink = findGlyphs(bitmap, polarity, threshold, limits, background);
      const ids = new Map<number, number>();
      const toPage = (box: InkBox, register: boolean): PageGlyph => {
        const glyph: PageGlyph = {
          x0: read.offset.x + box.x0 * factor,
          y0: read.offset.y + box.y0 * factor,
          x1: read.offset.x + box.x1 * factor,
          y1: read.offset.y + box.y1 * factor,
        };
        const label = box.container ?? 0;
        if (label === 0) return glyph;
        let id = ids.get(label);
        if (id === undefined && register) {
          id = nextId++;
          ids.set(label, id);
          const bounds = background.boxes[label];
          containers.set(id, {
            id,
            polarity,
            x0: read.offset.x + bounds.x0 * factor,
            y0: read.offset.y + bounds.y0 * factor,
            x1: read.offset.x + bounds.x1 * factor,
            y1: read.offset.y + bounds.y1 * factor,
            area: background.areas[label] * factor * factor,
            threshold,
            factor,
          });
        }
        if (id !== undefined) {
          glyph.container = id;
          if (box.anchor) glyph.anchor = { x: read.offset.x + (box.anchor.x + 0.5) * factor, y: read.offset.y + (box.anchor.y + 0.5) * factor };
        }
        return glyph;
      };
      found[polarity].push({ rect, boxes: ink.glyphs.map((glyph) => toPage(glyph, true)) });
      marks[polarity].push({ rect, boxes: ink.marks.map((mark) => toPage(mark, false)) });
    }
  }

  const candidates = (["dark", "light"] as const).flatMap((polarity) => {
    const glyphs = mergeTiles(found[polarity], page, (candidate, kept) => {
      const a = candidate.container === undefined ? undefined : resolve(candidate.container);
      const b = kept.container === undefined ? undefined : resolve(kept.container);
      if (a !== undefined && b !== undefined && a !== b) {
        const merged = containers.get(b)!;
        const other = containers.get(a)!;
        containers.set(b, { ...merged, ...unionBox([merged, other]), area: Math.max(merged.area, other.area) });
        containers.delete(a);
        alias.set(a, b);
      }
      return false;
    });
    const settle = <T extends PageGlyph>(glyph: T): T => (glyph.container === undefined ? glyph : { ...glyph, container: resolve(glyph.container) });
    const small = mergeTiles(marks[polarity], page, "keep-all").map(settle);
    return groupGlyphs(glyphs.map(settle), polarity, page, containers, options).map((candidate) => absorbMarks(candidate, small));
  });
  return dropEchoes(candidates)
    .sort((a, b) => b.glyphs - a.glyphs)
    .slice(0, MAX_CANDIDATES);
}

/** Réunit plusieurs blocs d'une même bulle en une seule candidate. */
function mergeBlocks(blocks: Candidate[]): Candidate {
  const main = blocks.reduce((best, block) => (block.glyphs > best.glyphs ? block : best));
  const glyphs = blocks.reduce((total, block) => total + block.glyphs, 0);
  return {
    ...main,
    ...unionBox(blocks),
    glyphs,
    angle: blocks.reduce((total, block) => total + block.angle * block.glyphs, 0) / Math.max(1, glyphs),
    anchors: blocks.flatMap((block) => block.anchors ?? []),
  };
}

/**
 * Rattache chaque texte à sa bulle, sur les pixels : une zone par bulle quand
 * tout son texte tient dans un même rectangle (un titre et sa suite, deux
 * paragraphes), une zone par bloc quand la bulle fait un coude entre eux. Au
 * passage, chaque candidate reçoit la place dont elle dispose (`room`).
 */
export function settleContainers(reader: PageReader, candidates: Candidate[]): Candidate[] {
  const page = reader.size;
  const settled: Candidate[] = [];
  const byContainer = new Map<number, Candidate[]>();
  for (const candidate of candidates) {
    if (!candidate.container) settled.push(candidate);
    else byContainer.set(candidate.container.id, [...(byContainer.get(candidate.container.id) ?? []), candidate]);
  }
  for (const blocks of byContainer.values()) {
    const container = blocks[0].container!;
    const lineHeight = Math.max(...blocks.map((block) => block.lineHeight));
    const reach = clamp(lineHeight * ROOM_REACH, 12, 240);
    const union = unionBox(blocks);
    // Le rectangle relevé est calé sur la grille du repérage : mêmes pixels réduits, mêmes plages.
    const snap = (value: number) => Math.floor(value / container.factor) * container.factor;
    const x = clamp(snap(union.x0 - reach - 2 * container.factor), 0, page.width - 1);
    const y = clamp(snap(union.y0 - reach - 2 * container.factor), 0, page.height - 1);
    const read = reader.pixels({
      x,
      y,
      width: clamp(Math.ceil(union.x1 + reach + 2 * container.factor) - x, 1, page.width - x),
      height: clamp(Math.ceil(union.y1 + reach + 2 * container.factor) - y, 1, page.height - y),
    });
    const survey = read
      ? surveyContainer(read.pixels, read.offset, {
          polarity: container.polarity,
          threshold: container.threshold,
          factor: container.factor,
          anchors: blocks.flatMap((block) => block.anchors ?? []),
        })
      : null;
    if (!survey) {
      settled.push(...blocks);
      continue;
    }
    // Deux blocs ne font qu'une zone que s'ils sont l'un sous l'autre : côte à côte, ce sont deux textes.
    const kept: Candidate[] = [];
    for (const block of [...blocks].sort((a, b) => a.y0 - b.y0)) {
      const above = kept.findIndex((other) => {
        if (Math.abs(block.angle) === 90 || Math.abs(other.angle) === 90) return false;
        const shared = Math.min(block.x1, other.x1) - Math.max(block.x0, other.x0);
        if (shared < Math.min(boxWidth(block), boxWidth(other)) * MIN_STACK_OVERLAP) return false;
        return survey.foreign([other, block]) <= MAX_FOREIGN_SHARE;
      });
      if (above < 0) kept.push(block);
      else kept[above] = mergeBlocks([kept[above], block]);
    }
    for (const block of kept) {
      const siblings = kept.filter((other) => other !== block);
      const room = survey.room(block, siblings, clamp(block.lineHeight * ROOM_REACH, 12, 240));
      settled.push(siblings.length > 0 ? { ...block, room, siblings: siblings.map(({ x0, y0, x1, y1 }) => ({ x0, y0, x1, y1 })) } : { ...block, room });
    }
  }
  return settled.sort((a, b) => b.glyphs - a.glyphs);
}

/** Rectangle lu pour une candidate : sa boîte et une marge, dans la page. */
export function readingRect(candidate: Candidate, page: PageSize): Rect {
  const padding = Math.round(clamp(candidate.lineHeight * 0.5, 4, 40));
  // Dans une bulle, la marge s'arrête à son contour : un trait lu devient un « | » ou un « _ ».
  // Sans place du tout (le texte touche le contour), la marge ordinaire est gardée.
  const margin = (available: number | undefined) => (available !== undefined && available >= MIN_READING_MARGIN ? Math.min(padding, available) : padding);
  const room = candidate.room;
  const left = margin(room && candidate.x0 - room.x0);
  const top = margin(room && candidate.y0 - room.y0);
  const right = margin(room && room.x1 - candidate.x1);
  const bottom = margin(room && room.y1 - candidate.y1);
  const x = clamp(Math.floor(candidate.x0 - left), 0, page.width - 1);
  const y = clamp(Math.floor(candidate.y0 - top), 0, page.height - 1);
  return {
    x,
    y,
    width: clamp(Math.ceil(candidate.x1 + right) - x, 1, page.width - x),
    height: clamp(Math.ceil(candidate.y1 + bottom) - y, 1, page.height - y),
  };
}

/**
 * Blocs voisins de la même bulle qui mordent sur le rectangle lu : ils sont
 * recouverts avant la lecture, sauf s'ils chevauchent trop le texte lui-même.
 */
export function neighbourRects(candidate: Candidate, rect: Rect): Rect[] {
  const area = Math.max(1, boxWidth(candidate) * boxHeight(candidate));
  const erase: Rect[] = [];
  for (const sibling of candidate.siblings ?? []) {
    if (intersectionArea(sibling, candidate) > area * 0.05) continue;
    const x0 = Math.max(rect.x, Math.floor(sibling.x0) - 1);
    const y0 = Math.max(rect.y, Math.floor(sibling.y0) - 1);
    const x1 = Math.min(rect.x + rect.width, Math.ceil(sibling.x1) + 1);
    const y1 = Math.min(rect.y + rect.height, Math.ceil(sibling.y1) + 1);
    if (x1 > x0 && y1 > y0) erase.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
  }
  return erase;
}

/**
 * Confiance d'une zone : à mi-chemin entre la moyenne de ses mots et son mot
 * le moins sûr. Un seul mot douteux dans une longue réplique doit se voir.
 */
export function blendConfidence(mean: number, weakest: number): number {
  return (mean + Math.min(mean, weakest)) / 2;
}

/** Groupe lu, avec ce que le repérage sait de sa bulle. */
export interface ReadGroup extends TextGroup {
  /** Place dont le texte dispose dans sa bulle ; absent pour un texte posé sur le dessin. */
  room?: Box;
}

function joinGroup(box: Box, lines: TextLine[], lineHeight: number, angle: number): TextGroup {
  const sorted = [...lines].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  let weight = 0;
  let total = 0;
  let weakest = 1;
  for (const word of sorted.flatMap((line) => line.words)) {
    const length = Math.max(1, word.text.length);
    weight += length;
    total += word.confidence * length;
    weakest = Math.min(weakest, word.confidence);
  }
  return {
    x0: box.x0,
    y0: box.y0,
    x1: box.x1,
    y1: box.y1,
    lines: sorted,
    raw: sorted.map((line) => line.text).join("\n"),
    confidence: blendConfidence(weight > 0 ? total / weight : 0, weakest),
    lineHeight,
    angle,
  };
}

/** Lit une candidate seule ; rend `null` si ce qu'elle porte n'est pas du texte. */
async function readCandidate(reader: PageReader, candidate: Candidate): Promise<ReadGroup | null> {
  const rect = readingRect(candidate, reader.size);
  const upright = Math.abs(candidate.angle) === 90;
  // Un texte couché se lit sur sa largeur : c'est elle qui donne la taille des lettres.
  const size = upright ? Math.max(1, candidate.x1 - candidate.x0) : Math.max(1, candidate.lineHeight);
  const scale = clamp(TARGET_LINE_HEIGHT / size, 0.3, size < TARGET_LINE_HEIGHT / MAX_SCALE ? MAX_SMALL_SCALE : MAX_SCALE);
  const invert = candidate.polarity === "light";
  const rotate = Math.abs(candidate.angle) >= MIN_DESKEW ? -candidate.angle : 0;
  const erase = neighbourRects(candidate, rect);
  const options: ReadOptions = { mode: "block", scale, invert, rotate, ...(erase.length > 0 ? { erase } : {}) };
  const first = await readBlock(reader, candidate, rect, options);
  // Couché vers la droite ou vers la gauche : on ne le sait qu'en lisant.
  return first || !upright ? first : readBlock(reader, candidate, rect, { ...options, rotate: -rotate });
}

async function readBlock(reader: PageReader, candidate: Candidate, rect: Rect, options: ReadOptions): Promise<ReadGroup | null> {
  const words = await reader.read(rect, options);
  // Les boîtes sont celles de l'image lue : elles ne servent qu'à remettre les mots en lignes.
  // Un mot peu sûr au milieu d'une bulle est gardé : il fera signaler la zone.
  const lines = buildLines(words.filter((word) => word.text.trim() !== ""));
  if (lines.length === 0) return null;
  const group: ReadGroup = joinGroup(candidate, lines, candidate.lineHeight, candidate.angle);
  if (candidate.room) group.room = candidate.room;
  // Le rejet se décide sur la confiance moyenne : un mot raté ne condamne pas la bulle.
  const kept = lines.flatMap((line) => line.words);
  const length = kept.reduce((total, word) => total + Math.max(1, word.text.length), 0);
  const mean = kept.reduce((total, word) => total + word.confidence * Math.max(1, word.text.length), 0) / Math.max(1, length);
  return isNoiseText(group.raw, mean, { enclosed: candidate.container !== undefined }) ? null : group;
}

/** Dernier recours : la page entière lue en texte épars, tranche par tranche. */
async function readSparse(reader: PageReader, onProgress: (progress: number) => void, signal?: AbortSignal): Promise<TextGroup[]> {
  const page = reader.size;
  const tiles = sliceTiles(page);
  const scale = page.width < 1000 ? clamp(1400 / page.width, 1, 2) : page.width > 3000 ? clamp(2400 / page.width, 0.5, 1) : 1;
  const read: { rect: Rect; boxes: WordBox[] }[] = [];
  for (const [index, rect] of tiles.entries()) {
    const words = await reader.read(rect, { mode: "sparse", scale, invert: false, rotate: 0 }, (progress) =>
      onProgress((index + clamp(progress, 0, 1)) / tiles.length),
    );
    throwIfAborted(signal);
    read.push({ rect, boxes: toPageWords(words, rect, scale) });
  }
  const words = dropNoiseWords(
    mergeTiles(read, page, (candidate, kept) => candidate.confidence > kept.confidence),
    page,
  );
  return groupWords(words).filter((group) => !isNoiseText(group.raw, group.confidence, { enclosed: false }));
}

/** Couleur du fond autour d'un texte : médiane d'un anneau posé sur le bord de sa boîte. */
function backgroundOf(reader: PageReader, group: TextGroup): string {
  const ring = Math.round(clamp(group.lineHeight * 0.15, 2, 6));
  const bounds = { x: group.x0, y: group.y0, width: group.x1 - group.x0, height: group.y1 - group.y0 };
  const read = reader.pixels({
    x: bounds.x - ring - 1,
    y: bounds.y - ring - 1,
    width: bounds.width + 2 * ring + 2,
    height: bounds.height + 2 * ring + 2,
  });
  if (!read) return "#ffffff";
  return sampleBackgroundColor(read.pixels, { ...bounds, x: bounds.x - read.offset.x, y: bounds.y - read.offset.y }, { ring });
}

/** Zones de texte d'une page, lues et rangées dans l'ordre de lecture du format. */
export async function analyzeWithReader(reader: PageReader, settings: ChapterSettings, options: PipelineOptions): Promise<ScanRegion[]> {
  const { signal } = options;
  const report = (progress: number) => options.onProgress?.(clamp(progress, 0, 1));
  const page = reader.size;
  throwIfAborted(signal);
  report(0);

  // ─── Repérage par les pixels ───────────────────────────────────
  const found = detectCandidates(reader, { latinOnly: settings.sourceLanguage === "en" });
  const candidates = settleContainers(reader, found);
  report(DETECTION_SHARE);

  // ─── Lecture de chaque zone, seule ─────────────────────────────
  let groups: ReadGroup[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const group = await readCandidate(reader, candidate);
    throwIfAborted(signal);
    if (group) groups.push(group);
    report(DETECTION_SHARE + ((index + 1) / candidates.length) * (1 - DETECTION_SHARE));
  }
  // Aucune lettre repérée (papier très sombre, page hors norme) : lecture d'ensemble.
  if (found.length === 0) {
    groups = await readSparse(reader, (progress) => report(DETECTION_SHARE + progress * (1 - DETECTION_SHARE)), signal);
  }

  const heights = groups.map((group) => group.lineHeight).sort((a, b) => a - b);
  const medianLineHeight = heights.length > 0 ? heights[Math.floor(heights.length / 2)] : 0;
  const ordered = sortByReadingOrder(groups, settings.format).slice(0, MAX_PAGE_REGIONS);
  report(1);
  return ordered.map((group) =>
    buildRegion(options.createId(), group, {
      page,
      medianLineHeight,
      background: backgroundOf(reader, group),
      room: group.room,
      protectedTerms: options.protectedTerms,
    }),
  );
}
