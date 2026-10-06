/**
 * Un texte lu ressemble-t-il à du japonais, du chinois ou du coréen, ou à du
 * dessin pris pour des signes ?
 *
 * Les règles de l'anglais (mots connus, voyelles, forme des mots) ne disent
 * rien d'un texte en signes pleins. Ici, c'est l'écriture qui parle : une
 * réplique est faite presque entièrement des signes de sa langue (kana et
 * kanji, hanzi, hangul). Une trame ou un trait lus par le moteur donnent au
 * contraire des lettres latines éparses, des symboles, ou quelques signes
 * faits de traits droits (« 一 », « 二 », « 口 ») répétés.
 *
 * Fonctions pures, sans DOM.
 */

import type { SourceLanguage } from "../types";
import { readingLanguage } from "./languages";

const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;

const HAN = /\p{Script=Han}/gu;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}\u30fc]/gu;
const HANGUL = /\p{Script=Hangul}/gu;
const LATIN = /\p{Script=Latin}/gu;
const DIGIT = /\p{N}/gu;
/** Signes qu'une réplique ne porte presque jamais, et qu'un trait de dessin fait lire. */
const JUNK_SYMBOL = /[=<>_|\\/[\]{}^*+#@$%&\u00a7\u00a2\u00a3\u00a5\u00a9\u00ae\u00b0\u00ac\u00a6\u00a4]/gu;
/** Signes faits de quelques traits droits : ce qu'une trame de lignes ou un cadre font lire. */
const STROKE_SIGNS = /[\u4e00\u4e8c\u4e09\u5341\u53e3\u65e5\u4e28\u4e36\u4e3f\u5de5\u571f\u738b\u7530\u76ee\u30fc\u30a8\u30cb\u30ed\u30a4\u30ce\u30cf\u3078\u304f\u3057\u3044\u3131\u3134\u3139\u3141\u3145\u3147\u3163\u3161]/gu;

/** Sous cette confiance moyenne, un texte en signes pleins est rejeté. */
export const MIN_CJK_CONFIDENCE = 0.4;
/** Sous cette confiance moyenne, un texte en signes pleins posé sur le dessin est rejeté. */
export const MIN_FREE_CJK_CONFIDENCE = 0.6;
/** Part des signes d'un texte qui doit être de l'écriture de la langue. */
export const MIN_NATIVE_SHARE = 0.6;

export interface ScriptShares {
  /** Signes qui comptent : lettres de toute écriture, chiffres et symboles ; ni espaces ni ponctuation. */
  total: number;
  han: number;
  /** Hiragana, katakana et marque d'allongement. */
  kana: number;
  hangul: number;
  latin: number;
  digits: number;
  /** Signes qui n'ont rien à faire dans une réplique. */
  symbols: number;
}

/** Compte des écritures d'un texte. */
export function scriptShares(text: string): ScriptShares {
  const han = count(text, HAN);
  const kana = count(text, KANA);
  const hangul = count(text, HANGUL);
  const latin = count(text, LATIN);
  const digits = count(text, DIGIT);
  const symbols = count(text, JUNK_SYMBOL);
  return { total: han + kana + hangul + latin + digits + symbols, han, kana, hangul, latin, digits, symbols };
}

/** Signes d'un texte qui sont de l'écriture de la langue donnée. */
export function nativeSigns(shares: ScriptShares, language: SourceLanguage): number {
  const script = readingLanguage(language).script;
  if (script === "japanese") return shares.han + shares.kana;
  if (script === "chinese") return shares.han;
  if (script === "korean") return shares.hangul;
  return shares.latin;
}

/** Un texte est-il surtout fait de signes pleins, quelle qu'en soit la langue ? */
export function isMostlyCjk(text: string): boolean {
  const shares = scriptShares(text);
  const wide = shares.han + shares.kana + shares.hangul;
  return wide > 0 && wide >= shares.latin;
}

export interface CjkNoiseContext {
  /** Faux : le texte est posé sur le dessin, là où le moteur invente le plus. */
  enclosed?: boolean;
}

/**
 * Vrai si le texte lu n'est pas une réplique de la langue donnée :
 *  - aucun signe de la langue (ponctuation seule, lettres latines éparses) ;
 *  - une lecture trop peu sûre ;
 *  - trop de signes étrangers à la langue : lettres latines, symboles, et
 *    hangul dans un texte japonais ou kana dans un texte coréen ;
 *  - quelques signes faits de traits droits, lus sans conviction : une trame ;
 *  - en japonais, un long texte sans un seul kana, lu sans conviction : une
 *    phrase japonaise en porte presque toujours.
 *
 * Un signe seul peut être une réplique (« え », « 네 ») : il est gardé s'il est
 * dans une bulle et lu avec assurance. Une lecture sûre n'est jamais rejetée
 * pour sa seule brièveté au-delà d'un signe.
 */
export function isCjkNoise(text: string, confidence: number, language: SourceLanguage, context: CjkNoiseContext = {}): boolean {
  const enclosed = context.enclosed ?? true;
  const compact = text.replace(/\s+/g, "");
  if (!compact) return true;
  const shares = scriptShares(compact);
  const native = nativeSigns(shares, language);
  if (native === 0) return true;
  if (confidence < MIN_CJK_CONFIDENCE) return true;
  if (native === 1 && !(enclosed && confidence >= 0.85 && shares.total === 1)) return true;
  if (native / shares.total < MIN_NATIVE_SHARE) return true;
  // Symboles mêlés aux signes : le contour ou le dessin a été lu.
  if (shares.symbols >= 2 && shares.symbols * 4 >= native && confidence < 0.8) return true;

  const strokes = count(compact, STROKE_SIGNS);
  // Rien que des signes en traits droits : une trame, sauf lecture très sûre.
  if (strokes >= native && confidence < (native <= 3 ? 0.9 : 0.75)) return true;
  // Un même signe répété sans conviction.
  const distinct = new Set(compact.match(/[\p{L}\p{N}]/gu) ?? []).size;
  if (distinct < 2 && native >= 3 && confidence < 0.75) return true;
  // Peu de signes et peu de confiance : le dessin lu comme un mot.
  if (native < 3 && confidence < 0.7) return true;

  const script = readingLanguage(language).script;
  if (script === "japanese" && native >= 6 && shares.kana === 0 && confidence < 0.75) return true;

  if (!enclosed) {
    if (confidence < MIN_FREE_CJK_CONFIDENCE) return true;
    if (native < 3) return true;
  }
  return false;
}

/** Rôles d'une équipe de traduction suivis de deux-points ou d'une barre : une page de crédits. */
const CJK_CREDITS =
  /(?:\u7ffb\u8a33|\u7ffb\u8bd1|\u7ffb\u8b6f|\u6821\u6b63|\u6821\u5bf9|\u6821\u5c0d|\u5199\u690d|\u5d4c\u5b57|\u4fee\u56f3|\u4fee\u56fe|\u4fee\u5716|\u6c49\u5316|\u6f22\u5316|\ubc88\uc5ed|\uc2dd\uc790|\uac80\uc218)\s*[:\uff1a/\uff0f|]/u;

/** Le texte est-il celui d'une page de crédits en japonais, en chinois ou en coréen ? */
export function isCjkCreditsText(text: string): boolean {
  return CJK_CREDITS.test(text.normalize("NFKC"));
}

/** Confiance à partir de laquelle un texte en signes pleins compte comme du texte à traduire. */
const MIN_SOLID_CONFIDENCE = 0.55;
/** Confiance demandée à un texte d'un ou deux signes. */
const MIN_SHORT_CONFIDENCE = 0.8;

/**
 * Le texte d'une zone, en signes pleins, vaut-il d'être traduit ? Assez de
 * signes de l'une des trois écritures, peu de signes étrangers, et une lecture
 * assez sûre pour sa longueur.
 */
export function isTranslatableCjk(text: string, confidence: number): boolean {
  const shares = scriptShares(text.replace(/\s+/g, ""));
  const wide = shares.han + shares.kana + shares.hangul;
  if (wide === 0 || wide / shares.total < MIN_NATIVE_SHARE) return false;
  return confidence >= (wide >= 3 ? MIN_SOLID_CONFIDENCE : MIN_SHORT_CONFIDENCE);
}
