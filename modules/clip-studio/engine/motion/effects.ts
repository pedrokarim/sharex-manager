/**
 * Effets de texte qui ne s'interpolent pas : compteur, brouillage, curseur.
 *
 * Tout est pur et ne dépend que de ses arguments (le « hasard » est tiré de
 * l'identifiant de l'élément, du rang du caractère et de l'instant) :
 * l'aperçu et l'export affichent les mêmes caractères à la même image, dans
 * n'importe quel ordre de lecture.
 */

import { isEaseName, resolveEase } from "./easing";
import { createRandom, unitRandom } from "./interpret";
import { splitGraphemes } from "./text-layout";
import type { MotionEffect } from "./types";

type Options = MotionEffect["options"];

const num = (options: Options, key: string, fallback: number): number => {
  const value = options?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const str = (options: Options, key: string, fallback: string): string => {
  const value = options?.[key];
  return typeof value === "string" && value ? value : fallback;
};

// ─── Compteur ────────────────────────────────────────────────────

/** Espace fine insécable : le séparateur des milliers en français. */
export const THIN_NBSP = " ";

/** Espaces reconnues entre deux groupes de chiffres. */
const GROUP_SPACES = "    ";

/** Nombre trouvé dans un texte, et la façon dont il est écrit. */
export interface WrittenNumber {
  /** Début et fin du nombre dans le texte (signe compris). */
  start: number;
  end: number;
  value: number;
  /** Chiffres après la virgule. */
  decimals: number;
  /** Séparateur des milliers tel qu'écrit (« » si aucun). */
  group: string;
  /** Séparateur décimal tel qu'écrit (virgule par défaut). */
  decimal: string;
}

const NUMBER = /([-−]?)(\d{1,3}(?:[    ]\d{3})+|\d+)(?:([.,])(\d+))?/;

/** Premier nombre d'un texte : « 1 250 », « 12,5 », « −3 ». */
export function findNumber(text: string): WrittenNumber | null {
  const match = NUMBER.exec(text);
  if (!match) return null;
  const [all, sign, integer, decimal, fraction] = match;
  const group = [...integer].find((char) => GROUP_SPACES.includes(char)) ?? "";
  const digits = integer.replace(/[^\d]/g, "");
  const value = Number(`${digits}${fraction ? `.${fraction}` : ""}`) * (sign ? -1 : 1);
  return {
    start: match.index,
    end: match.index + all.length,
    value,
    decimals: fraction ? fraction.length : 0,
    group,
    decimal: decimal ?? ",",
  };
}

/**
 * Écrit un nombre comme le modèle : mêmes séparateurs, même nombre de
 * décimales. Sans séparateur des milliers dans le modèle, aucun n'est
 * ajouté : la dernière image du compteur rejoint ainsi le texte tel qu'il est
 * écrit, sans saut.
 */
export function formatLike(value: number, model: Pick<WrittenNumber, "decimals" | "group" | "decimal">): string {
  const negative = value < 0 && Math.abs(value) >= 0.5 * Math.pow(10, -model.decimals);
  const fixed = Math.abs(value).toFixed(model.decimals);
  const [integer, fraction] = fixed.split(".");
  const grouped = model.group ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, model.group) : integer;
  return `${negative ? "−" : ""}${grouped}${fraction !== undefined ? `${model.decimal}${fraction}` : ""}`;
}

/**
 * Texte d'un compteur à l'avancement `progress` : le premier nombre du texte
 * défile de `from` (0 par défaut) jusqu'à sa valeur écrite, le reste du texte
 * ne change pas. « 1 250 € » (avec une espace fine insécable) passe par
 * « 625 € » à mi-course. Un texte sans nombre reste tel quel.
 */
export function counterText(text: string, progress: number, options?: Options): string {
  const found = findNumber(text);
  if (!found) return text;
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 1));
  if (p >= 1) return text;
  const ease = options?.ease;
  const eased = resolveEase(isEaseName(ease) ? ease : "outCubic")(p);
  const from = num(options, "from", 0);
  const value = from + (found.value - from) * eased;
  // Le signe négatif tel qu'écrit : un trait d'union reste un trait d'union.
  const written = formatLike(value, found);
  const sign = text[found.start];
  const shown = written.startsWith("−") && sign === "-" ? `-${written.slice(1)}` : written;
  return text.slice(0, found.start) + shown + text.slice(found.end);
}

// ─── Brouillage ──────────────────────────────────────────────────

/** Jeux de caractères du brouillage. */
export const SCRAMBLE_CHARSETS: Record<string, string> = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  digits: "0123456789",
  alnum: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  binary: "01",
  hex: "0123456789ABCDEF",
  symbols: "#%&*+-/<=>?@[]\\^_{|}~",
  blocks: "█▓▒░",
  katakana: "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン",
};

/**
 * Jeu de caractères d'un brouillage : celui demandé, ou, par défaut
 * (« auto »), un jeu proche du caractère remplacé : des chiffres pour un
 * chiffre, des capitales pour une capitale. La ponctuation, les symboles et
 * les émojis ne sont alors pas brouillés (`null`).
 */
function charsetFor(original: string, charset: string): string | null {
  const fixed = SCRAMBLE_CHARSETS[charset];
  if (fixed) return fixed;
  if (/^\p{Nd}$/u.test(original)) return SCRAMBLE_CHARSETS.digits;
  if (/^\p{Lu}$/u.test(original)) return SCRAMBLE_CHARSETS.upper;
  if (/^\p{L}$/u.test(original)) return SCRAMBLE_CHARSETS.lower;
  return null;
}

/** Instant du brouillage : le caractère change `rate` fois par seconde. */
export function scrambleTick(localFrame: number, fps: number, rate: number): number {
  return Math.floor((Math.max(0, localFrame) / Math.max(1, fps)) * Math.max(1, rate));
}

/**
 * Caractère tiré à la place de `original` (graphème de rang `index`), à
 * l'instant `tick`. Une espace reste une espace.
 */
export function scrambleGlyph(original: string, seed: string, index: number, tick: number, charset = "auto"): string {
  if (!original.trim()) return original;
  const set = charsetFor(original, charset);
  if (set === null) return original;
  const glyphs = [...set];
  return glyphs[Math.floor(unitRandom(seed, index, `scramble:${tick}`) * glyphs.length)] ?? original;
}

/** Ordre de fixation des caractères : rang de 0 (le premier fixé) à 1 (le dernier). */
export function lockRanks(count: number, order: string, seed: string): number[] {
  const last = Math.max(1, count - 1);
  if (count <= 1) return Array.from({ length: count }, () => 0);
  switch (order) {
    case "end":
      return Array.from({ length: count }, (_, i) => (last - i) / last);
    case "center":
      return Array.from({ length: count }, (_, i) => Math.abs(i - last / 2) / (last / 2));
    case "random": {
      const random = createRandom(`${seed}#lock#${count}`);
      const order = Array.from({ length: count }, (_, i) => i);
      for (let i = count - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const ranks = new Array<number>(count);
      order.forEach((unit, rank) => (ranks[unit] = rank / last));
      return ranks;
    }
    default:
      return Array.from({ length: count }, (_, i) => i / last);
  }
}

/**
 * Lignes d'un texte brouillé à l'avancement `progress` de l'effet : chaque
 * caractère est remplacé par un caractère tiré, jusqu'à son instant de
 * fixation (après `delay`, dans l'ordre `order`). Le nombre de graphèmes de
 * chaque ligne ne change pas : la coupe des lignes reste celle du texte.
 */
export function scrambleLines(lines: readonly string[], progress: number, options: Options, seed: string, tick: number): string[] {
  const delay = Math.min(0.95, Math.max(0, num(options, "delay", 0)));
  const charset = str(options, "charset", "auto");
  const graphemes = lines.map((line) => splitGraphemes(line));
  const total = graphemes.reduce((sum, line) => sum + line.length, 0);
  const ranks = lockRanks(total, str(options, "order", "start"), seed);
  const p = Math.min(1, Math.max(0, progress));
  let index = 0;
  return graphemes.map((line) =>
    line
      .map((grapheme) => {
        const rank = ranks[index];
        const lockAt = delay + rank * (1 - delay);
        const shown = p >= lockAt && p > delay ? grapheme : scrambleGlyph(grapheme, seed, index, tick, charset);
        index++;
        return shown;
      })
      .join("")
  );
}

/** Texte d'une unité brouillée (lettre, mot), graphème par graphème. */
export function scrambleUnit(text: string, seed: string, unitIndex: number, tick: number, charset = "auto"): string {
  return splitGraphemes(text)
    .map((grapheme, offset) => scrambleGlyph(grapheme, seed, unitIndex * 64 + offset, tick, charset))
    .join("");
}

// ─── Curseur ─────────────────────────────────────────────────────

/**
 * Curseur visible à l'instant `ms` : plein pendant la frappe, puis
 * clignotant (moitié allumé, moitié éteint sur `blinkMs`).
 */
export function caretVisible(typing: boolean, ms: number, blinkMs: number): boolean {
  if (typing) return true;
  const period = Math.max(50, blinkMs);
  return Math.floor(Math.max(0, ms) / (period / 2)) % 2 === 0;
}
