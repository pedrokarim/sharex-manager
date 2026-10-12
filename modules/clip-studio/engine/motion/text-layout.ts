/**
 * Mise en page d'un texte découpé : lignes, mots, lettres.
 *
 * Les lignes sont celles du rendu en bloc (`wrapText`, même coupe, même
 * mesure) : un texte ne change pas de lignes en s'animant. Chaque ligne est
 * ensuite découpée en mots ou en graphèmes (un accent combiné, une ligature
 * ou un émoji restent entiers), et chaque unité reçoit sa position mesurée
 * dans sa ligne.
 *
 * La mesure est injectée (`MeasureText`) : en production, c'est
 * `measureText` du canevas, avec la police, la graisse, l'espacement et les
 * majuscules du style déjà posés ; dans les tests, une fonction quelconque.
 * Le résultat est gardé en cache : on ne mesure qu'une fois par texte, style,
 * largeur et police chargée, pas à chaque image.
 */

import type { MotionSplit } from "./types";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Unité découpée : tout sauf le bloc entier. */
export type TextSplit = Exclude<MotionSplit, "whole">;

/** Largeur d'un texte, en pixels, dans la police courante. */
export type MeasureText = (text: string) => number;

export interface TextLine {
  text: string;
  /** Largeur mesurée de la ligne entière. */
  width: number;
}

export interface TextUnit {
  /** Ce qui se dessine : une ligne, un mot (avec sa ponctuation), un graphème. */
  text: string;
  /** Rang de la ligne qui porte l'unité. */
  line: number;
  /** Début de l'unité dans le texte de sa ligne (indice UTF-16). */
  start: number;
  /** Bord gauche, depuis le début de la ligne, en pixels. */
  x: number;
  width: number;
  /**
   * Fin de chaque graphème de l'unité, relative à son début : sert à n'en
   * révéler qu'une partie sans couper un émoji ou un accent.
   */
  graphemeEnds: number[];
}

export interface TextLayout {
  split: TextSplit;
  lines: TextLine[];
  /** Unités dans l'ordre de lecture, ligne après ligne. */
  units: TextUnit[];
}

// ─── Coupe en lignes ─────────────────────────────────────────────

/**
 * Découpe le texte en lignes qui tiennent dans `maxWidth`. C'est la coupe du
 * rendu en bloc : le texte découpé la reprend telle quelle.
 */
export function wrapText(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    // On ne coupe que sur les espaces sécables : `\s` comprend aussi les
    // espaces insécables (U+00A0, U+202F, U+2007), qui doivent garder « ! »,
    // « : » ou « % » collés au mot qui les précède.
    const words = paragraph.split(/[^\S\u00A0\u202F\u2007]+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (ctx.measureText(candidate).width <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

// ─── Segmentation ────────────────────────────────────────────────

/** Portion d'une chaîne, en indices UTF-16. */
export interface TextSpan {
  start: number;
  end: number;
}

type SegmenterLike = { segment(input: string): Iterable<{ segment: string; index: number; isWordLike?: boolean }> };

const segmenters: Partial<Record<"grapheme" | "word", SegmenterLike | null>> = {};

/** Segmenteur du moteur JavaScript, ou `null` s'il n'en a pas. */
function segmenter(granularity: "grapheme" | "word"): SegmenterLike | null {
  if (segmenters[granularity] === undefined) {
    const Segmenter = (Intl as { Segmenter?: new (locale: string, options: { granularity: string }) => SegmenterLike }).Segmenter;
    segmenters[granularity] = typeof Segmenter === "function" ? new Segmenter("fr", { granularity }) : null;
  }
  return segmenters[granularity] ?? null;
}

/**
 * Graphèmes d'un texte, avec leur position. Sans `Intl.Segmenter`, on se
 * rabat sur les points de code, en recollant les marques combinantes et les
 * jonctions d'émojis : moins fin, mais rien ne se coupe en deux.
 */
export function graphemeSpans(text: string): TextSpan[] {
  const spans: TextSpan[] = [];
  const native = segmenter("grapheme");
  if (native) {
    for (const { segment, index } of native.segment(text)) spans.push({ start: index, end: index + segment.length });
    return spans;
  }
  let index = 0;
  for (const point of Array.from(text)) {
    const end = index + point.length;
    const previous = spans[spans.length - 1];
    const glued = /^[\p{M}\u200d\ufe0f]/u.test(point) || (previous && text[previous.end - 1] === "\u200d");
    if (previous && glued) previous.end = end;
    else spans.push({ start: index, end });
    index = end;
  }
  return spans;
}

/** Graphèmes d'un texte. */
export function splitGraphemes(text: string): string[] {
  return graphemeSpans(text).map(({ start, end }) => text.slice(start, end));
}

/** Nombre de graphèmes d'un texte. */
export function graphemeCount(text: string): number {
  return graphemeSpans(text).length;
}

/** Les `count` premiers graphèmes d'un texte. */
export function sliceGraphemes(text: string, count: number): string {
  if (count <= 0) return "";
  const spans = graphemeSpans(text);
  if (count >= spans.length) return text;
  return text.slice(0, spans[count - 1].end);
}

/**
 * Espaces qui séparent deux mots. Les espaces insécables (devant « : ; ! ? »,
 * à l'intérieur des guillemets, dans « 1 250 ») collent au contraire ce
 * qu'elles relient.
 */
const BREAKING_SPACE = /[^\S\u00a0\u2007\u202f]+/gu;

/** Ponctuation ou symbole seul, sans lettre, sans chiffre et sans émoji. */
const PUNCTUATION_ONLY = /^[\p{P}\p{S}\u00a0\u2007\u202f]+$/u;
const PICTOGRAPH = /\p{Extended_Pictographic}/u;
/** Ce qui ouvre : guillemet ouvrant, parenthèse, ¿ ¡. */
const OPENING = /^[\p{Ps}\p{Pi}¿¡]/u;
/** Tiret seul : une incise, qui reste une unité à elle. */
const DASH_ONLY = /^\p{Pd}+$/u;

/**
 * Mots d'une ligne, ponctuation comprise, comme un lecteur français les
 * découpe : « L’été, », « c’est », « « top » ! », « 🎉 ».
 *
 * - Les mots sont séparés par les espaces ordinaires.
 * - Une ponctuation isolée se rattache au mot qui précède (« , : ; ! ? » …),
 *   ou au suivant si elle ouvre (« « », « ( »). Un tiret seul reste seul.
 * - Dans un bloc sans espace, `Intl.Segmenter` sépare deux mots qui se
 *   touchent (japonais, chinois) ; l’apostrophe et le trait d’union ne
 *   coupent pas (« c’est-à-dire » reste un mot).
 */
export function wordSpans(line: string): TextSpan[] {
  const words: TextSpan[] = [];
  let openStart = -1;
  let openEnd = -1;
  let cursor = 0;
  const visit = (start: number, end: number) => {
    const chunk = line.slice(start, end);
    if (PUNCTUATION_ONLY.test(chunk) && !PICTOGRAPH.test(chunk) && !DASH_ONLY.test(chunk)) {
      if (OPENING.test(chunk) || words.length === 0) {
        if (openStart < 0) openStart = start;
        openEnd = end;
        return;
      }
      if (openStart < 0) {
        words[words.length - 1].end = end;
        return;
      }
    }
    const parts = wordsInChunk(line, start, end);
    if (openStart >= 0) {
      parts[0].start = openStart;
      openStart = -1;
    }
    words.push(...parts);
  };
  for (const match of line.matchAll(BREAKING_SPACE)) {
    if (match.index > cursor) visit(cursor, match.index);
    cursor = match.index + match[0].length;
  }
  if (cursor < line.length) visit(cursor, line.length);
  // Une ouverture en fin de ligne, sans mot après elle : on la garde au précédent.
  if (openStart >= 0) {
    if (words.length) words[words.length - 1].end = openEnd;
    else words.push({ start: openStart, end: openEnd });
  }
  return words;
}

/** Sépare deux mots qui se touchent sans espace ; sinon, le bloc entier. */
function wordsInChunk(line: string, start: number, end: number): TextSpan[] {
  const native = segmenter("word");
  if (!native) return [{ start, end }];
  const parts: TextSpan[] = [];
  let previousWordLike = false;
  for (const { segment, index, isWordLike } of native.segment(line.slice(start, end))) {
    const from = start + index;
    const to = from + segment.length;
    if (parts.length === 0) parts.push({ start: from, end: to });
    else if (isWordLike && previousWordLike) parts.push({ start: from, end: to });
    else parts[parts.length - 1].end = to;
    previousWordLike = Boolean(isWordLike);
  }
  return parts.length ? parts : [{ start, end }];
}

const WHITESPACE_ONLY = /^\s+$/u;

// ─── Mise en page ────────────────────────────────────────────────

function graphemeEndsOf(text: string): number[] {
  return graphemeSpans(text).map(({ end }) => end);
}

/**
 * Unités de lignes déjà coupées, mesurées avec `measure`.
 *
 * Le bord gauche d'une unité est la largeur de tout ce qui la précède dans
 * sa ligne : crénage et espacement des lettres compris, la dernière unité
 * finit là où finit la ligne mesurée d'un bloc. Les espaces ne sont pas des
 * unités : ils ne se dessinent pas, et un décalage ne les attend pas.
 */
export function layoutUnits(lines: readonly string[], split: TextSplit, measure: MeasureText): TextLayout {
  const measured: TextLine[] = lines.map((text) => ({ text, width: measure(text) }));
  const units: TextUnit[] = [];
  const offsetOf = (line: string, start: number) => (start > 0 ? measure(line.slice(0, start)) : 0);
  measured.forEach(({ text, width }, line) => {
    if (!text || WHITESPACE_ONLY.test(text)) return;
    if (split === "line") {
      units.push({ text, line, start: 0, x: 0, width, graphemeEnds: graphemeEndsOf(text) });
      return;
    }
    const spans = split === "word" ? wordSpans(text) : graphemeSpans(text);
    for (const { start, end } of spans) {
      const unit = text.slice(start, end);
      if (WHITESPACE_ONLY.test(unit)) continue;
      units.push({
        text: unit,
        line,
        start,
        x: offsetOf(text, start),
        width: measure(unit),
        graphemeEnds: split === "char" ? [unit.length] : graphemeEndsOf(unit),
      });
    }
  });
  return { split, lines: measured, units };
}

/**
 * Nombre d'unités d'un texte, sans mesure : les lignes sont alors les
 * paragraphes (la coupe réelle dépend de la largeur). Sert à proposer une
 * durée d'animation.
 */
export function countUnits(text: string, split: MotionSplit): number {
  if (split === "whole") return 1;
  const paragraphs = text.split("\n").filter((paragraph) => paragraph.trim());
  if (split === "line") return paragraphs.length;
  let count = 0;
  for (const paragraph of paragraphs) {
    if (split === "word") count += wordSpans(paragraph).length;
    else count += graphemeSpans(paragraph).filter(({ start, end }) => !WHITESPACE_ONLY.test(paragraph.slice(start, end))).length;
  }
  return count;
}

// ─── Cache ───────────────────────────────────────────────────────

const MAX_LAYOUTS = 64;
const layouts = new Map<string, TextLayout>();

/** Oublie toutes les mises en page (police remplacée, par exemple). */
export function invalidateTextLayouts() {
  layouts.clear();
}

/** Nombre de mises en page gardées, pour les tests. */
export function cachedLayoutCount(): number {
  return layouts.size;
}

function spacingOf(ctx: Ctx): string {
  return "letterSpacing" in ctx ? String((ctx as CanvasRenderingContext2D).letterSpacing) : "";
}

/**
 * Mise en page d'un texte dans la police posée sur `ctx` (police, graisse,
 * espacement du style), gardée en cache.
 *
 * La clé porte le texte, la police, l'espacement, la largeur, l'unité, et la
 * largeur mesurée du texte entier : quand la police de la marque finit de
 * charger, cette largeur change et la mise en page est refaite, sans
 * événement à écouter. C'est une seule mesure par image.
 *
 * `trackedSpacing` est l'espacement animé (piste `tracking`) : comme pour le
 * bloc, il s'applique après la coupe des lignes, pour que le texte s'étire
 * sans changer de lignes. Le contexte est rendu avec l'espacement du style.
 */
export function textLayout(
  ctx: Ctx,
  content: string,
  maxWidth: number,
  split: TextSplit,
  trackedSpacing: string | null = null
): TextLayout {
  const probe = ctx.measureText(content).width;
  const baseSpacing = spacingOf(ctx);
  const key = `${split}\u0001${ctx.font}\u0001${baseSpacing}\u0001${trackedSpacing ?? ""}\u0001${maxWidth}\u0001${probe}\u0001${content}`;
  const cached = layouts.get(key);
  if (cached) return cached;

  const lines = wrapText(ctx, content, maxWidth);
  if (trackedSpacing !== null) (ctx as CanvasRenderingContext2D).letterSpacing = trackedSpacing;
  const layout = layoutUnits(lines, split, (text) => ctx.measureText(text).width);
  if (trackedSpacing !== null) (ctx as CanvasRenderingContext2D).letterSpacing = baseSpacing;

  if (layouts.size >= MAX_LAYOUTS) layouts.delete(layouts.keys().next().value!);
  layouts.set(key, layout);
  return layout;
}
