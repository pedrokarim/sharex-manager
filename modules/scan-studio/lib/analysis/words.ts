/**
 * Mots rendus par le moteur de lecture, et tri de ce qui n'est pas du texte.
 *
 * Un moteur de lecture généraliste lit aussi les trames, les hachures et les
 * traits du dessin : il en sort des « mots » de quelques signes, peu sûrs.
 * Ce fichier les écarte, mot par mot puis groupe par groupe. Il ne dépend ni
 * du DOM ni du moteur : il se teste avec des boîtes écrites à la main.
 */

import { plausibility } from "./plausibility";

/** Un mot lu, avec sa boîte en pixels de la page. */
export interface WordBox {
  text: string;
  /** Confiance du moteur, de 0 à 1. */
  confidence: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Inclinaison de la ligne de base, en degrés, quand le moteur la donne. */
  angle?: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PageSize {
  width: number;
  height: number;
}

/** Sous cette confiance, une zone est gardée mais marquée « lecture à vérifier ». */
export const REVIEW_CONFIDENCE = 0.8;
/** Sous cette confiance, un mot isolé n'est pas tenu pour du texte. */
export const MIN_WORD_CONFIDENCE = 0.3;
/** Sous cette confiance moyenne, un groupe entier est rejeté. */
export const MIN_GROUP_CONFIDENCE = 0.45;

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/gu;
/** Signes qu'une hachure ou un trait vertical font lire à tort. */
const STROKE_ONLY = /^[Il1|!/\\\-_.,'`:;~=^*()[\]{}<>\s]+$/;
/** Ponctuation qui peut tenir lieu de mot dans une bulle : « ?! », « … ». */
const SENTENCE_MARKS = /^[.!?…,'"’“”\-–—]+$/;

export const boxWidth = (box: Box) => box.x1 - box.x0;
export const boxHeight = (box: Box) => box.y1 - box.y0;

export function unionBox(boxes: Box[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const box of boxes) {
    x0 = Math.min(x0, box.x0);
    y0 = Math.min(y0, box.y0);
    x1 = Math.max(x1, box.x1);
    y1 = Math.max(y1, box.y1);
  }
  return boxes.length > 0 ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 0, y1: 0 };
}

export function intersectionArea(a: Box, b: Box): number {
  const width = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const height = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return width > 0 && height > 0 ? width * height : 0;
}

/** Part de la plus petite des deux boîtes couverte par l'autre, de 0 à 1. */
export function overlapRatio(a: Box, b: Box): number {
  const smallest = Math.min(boxWidth(a) * boxHeight(a), boxWidth(b) * boxHeight(b));
  return smallest > 0 ? intersectionArea(a, b) / smallest : 0;
}

export function countLetters(text: string): number {
  return text.match(LETTER_OR_DIGIT)?.length ?? 0;
}

/** Plus petite hauteur de texte lisible sur une page de cette taille. */
export function minTextHeight(page: PageSize): number {
  return Math.max(6, Math.round(Math.min(page.width, page.height) * 0.004));
}

/**
 * Vrai si ce « mot » ne peut pas être du texte : vide, minuscule, démesuré,
 * trop peu sûr, ou fait de signes sans lettre qui ne sont pas de la ponctuation
 * de phrase.
 */
export function isNoiseWord(word: WordBox, page: PageSize): boolean {
  const text = word.text.trim();
  if (!text) return true;
  if (!(word.confidence >= MIN_WORD_CONFIDENCE)) return true;
  const width = boxWidth(word);
  const height = boxHeight(word);
  if (height < minTextHeight(page) || width < 2) return true;
  if (height > page.height * 0.6 || width > page.width * 0.98) return true;
  if (countLetters(text) === 0 && !SENTENCE_MARKS.test(text)) return true;
  // Un trait horizontal lu comme un tiret : beaucoup plus large que haut.
  if (/^[-–—_=~]+$/.test(text) && width > height * 6) return true;
  return false;
}

export function dropNoiseWords(words: WordBox[], page: PageSize): WordBox[] {
  return words.filter((word) => !isNoiseWord(word, page));
}

export interface NoiseContext {
  /**
   * Le texte est dans une bulle ou un cartouche. Faux : il est posé sur le
   * dessin, là où le moteur invente le plus ; on lui demande davantage.
   */
  enclosed?: boolean;
}

/** Sous cette confiance moyenne, un texte posé sur le dessin est rejeté. */
export const MIN_FREE_CONFIDENCE = 0.6;

/**
 * Vrai si le texte d'un groupe entier n'est pas une réplique : un signe isolé,
 * une suite de traits (hachures), une même lettre répétée (trame), une lecture
 * trop peu sûre pour sa longueur, ou une suite de signes qui ne ressemble pas
 * à des mots (presque pas de voyelles, ponctuation mêlée, lettres éparses).
 *
 * Une lecture sûre n'est jamais rejetée sur sa seule forme : « TSK », « HMPH »
 * et les noms inventés existent. C'est la forme ET le doute qui condamnent.
 */
export function isNoiseText(text: string, confidence: number, context: NoiseContext = {}): boolean {
  const enclosed = context.enclosed ?? true;
  const compact = text.replace(/\s+/g, "");
  if (!compact) return true;
  const letters = countLetters(compact);
  // Un caractère seul n'est jamais gardé : ni « I », ni « ? », ni un point de trame.
  if (compact.length < 2 || letters < 2) return true;
  if (confidence < MIN_GROUP_CONFIDENCE) return true;
  if (STROKE_ONLY.test(compact)) return true;
  if (letters / compact.length < 0.5) return true;
  const distinct = new Set(compact.toLowerCase().match(LETTER_OR_DIGIT) ?? []).size;
  if (distinct < 2 && letters >= 3) return true;
  // Peu de lettres et peu de confiance : le dessin lu comme un mot.
  if (letters < 4 && confidence < 0.8) return true;
  // Une suite de consonnes peu sûre : une trame, pas une onomatopée.
  if (letters >= 3 && confidence < 0.65 && !/[aeiouy]/i.test(compact)) return true;

  const shape = plausibility(text);
  // Une autre écriture que le latin : le moteur anglais n'a rien à en dire.
  if (shape.foreign > 0.3) return true;
  // Presque pas de voyelles sur un texte long : des traits, pas des mots.
  if (shape.letters >= 6 && shape.vowels < 0.15 && confidence < 0.85) return true;
  // Signes mêlés aux lettres (« = », « | », « _ ») : le contour ou le dessin a été lu.
  if (shape.symbols >= 2 && shape.symbols * 5 >= shape.words && confidence < 0.8) return true;
  // Peu de mots qui en soient, et une lecture qui doute.
  if (shape.wordLike < 0.5 && confidence < 0.7) return true;
  if (shape.wordLike < 0.25 && confidence < 0.85) return true;

  if (!enclosed) {
    if (confidence < MIN_FREE_CONFIDENCE) return true;
    // Un mot de deux ou trois lettres seul dans le dessin : gardé seulement s'il est connu et sûr.
    if (letters < 4 && !(shape.known === shape.words && confidence >= 0.9)) return true;
    if (shape.wordLike < 0.5) return true;
  }
  return false;
}
