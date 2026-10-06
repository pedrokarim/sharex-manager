/**
 * Nettoyage du texte lu (§ 6.3 du dossier) : ce que la lecture rend n'est pas
 * encore une phrase.
 *
 * Dans l'ordre : normalisation Unicode, caractères de contrôle et invisibles
 * retirés, ponctuation ramenée à des formes régulières, lignes recollées et
 * césures réunies, confusions de lecture corrigées par règles, puis casse de
 * phrase quand le lettrage est en capitales.
 *
 * Le texte lu d'origine n'est jamais modifié : l'appelant le garde à côté.
 * Fonctions pures, sans DOM.
 */

export interface CleanOptions {
  /**
   * Termes à ne jamais toucher (glossaire du dossier) : ni correction de
   * lecture, ni changement de casse. Ils retrouvent la casse donnée ici.
   */
  protectedTerms?: string[];
}

/** Caractères de contrôle et invisibles, hors tabulation et retour à la ligne. */
const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/g;
/** Signes qu'un bord de bulle fait lire en début ou en fin de ligne. */
const EDGE_STROKES = /^(?:[|_~^`\\/]+\s+)+|(?:\s+[|_~^`\\/]+)+$/g;
const LETTER = /\p{L}/u;
const LETTERS = /\p{L}/gu;
const UPPERCASE = /\p{Lu}/gu;
/** Nombres, seuls ou suivis d'un suffixe : « 12 », « 1ST », « 10TH », « 100M ». On n'y touche pas. */
const ORDINAL = /^(?:\d+|\d+(?:st|nd|rd|th)|\d{2,}[skmx])$/i;
/** Mots assez courants pour corriger un chiffre lu à la place d'une lettre, quand il n'en reste qu'une de sûre. */
const SHORT_WORDS = new Set([
  ...["NO", "GO", "SO", "TO", "DO", "OK", "OH", "ON", "OF", "OR", "IT", "IS", "IN", "IF", "HI", "I'M", "I'D"],
  ...["TOO", "ZOO", "BOO", "MOO", "WOO"],
]);

/** Unicode, invisibles, guillemets, tirets, ponctuation pleine chasse. */
function normalizeCharacters(text: string): string {
  return (
    text
      .normalize("NFKC")
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, " ")
      // Trait d'union conditionnel : une césure s'il termine la ligne, rien sinon.
      .replace(/­(?=\s*\n)/g, "-")
      .replace(/­/g, "")
      .replace(INVISIBLE, "")
      .replace(/[‘’‚‛`´′]/g, "'")
      .replace(/[“”„‟«»″]/g, '"')
      .replace(/[「」『』]/g, '"')
      .replace(/。/g, ".")
      .replace(/、/g, ",")
      .replace(/[・･]{2,}/g, "...")
      .replace(/[‐‑‒–−]/g, "-")
      .replace(/―/g, "—")
      .replace(/-{2,}/g, "—")
  );
}

/**
 * Recolle les lignes d'une bulle. Une césure de fin de ligne (`IM-` /
 * `POSSIBLE`) est réunie ; un bégaiement (`W-` / `WHAT`) garde son trait.
 */
export function joinLines(lines: string[]): string {
  let result = "";
  for (const raw of lines) {
    const line = raw.replace(EDGE_STROKES, "").trim();
    if (!line) continue;
    if (!result) {
      result = line;
    } else if (/-$/.test(result) && LETTER.test(line[0])) {
      const fragment = result.match(/(\p{L}+)-$/u)?.[1] ?? "";
      result = fragment.length >= 2 ? result.slice(0, -1) + line : result + line;
    } else {
      result += ` ${line}`;
    }
  }
  return result;
}

/** Espaces et ponctuation : formes régulières, sans espace avant un signe. */
function normalizePunctuation(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\.(?:\s?\.)+/g, "...")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\.\.\.(?=\p{L})/gu, "... ")
    .replace(/([!?])\s+(?=[!?])/g, "$1")
    .trim();
}

/** Le lettrage est-il en capitales ? Vrai si trois lettres sur quatre le sont. */
export function isAllCaps(text: string): boolean {
  const letters = text.match(LETTERS)?.length ?? 0;
  const upper = text.match(UPPERCASE)?.length ?? 0;
  return letters >= 2 && upper / letters >= 0.75;
}

/** Corrige un mot : `0` lu pour `O`, `1`, `l` ou `|` lus pour `I`, et l'inverse en minuscules. */
function fixWord(word: string, allCaps: boolean): string {
  if (word === "|" || word === "l") return "I";
  if (ORDINAL.test(word) || /[2-9]/.test(word)) return word;
  const letters = word.match(LETTERS)?.length ?? 0;
  if (letters === 0) return word;

  if (allCaps) {
    if (!/[01|l]/.test(word)) return word;
    const fixed = word.replace(/0/g, "O").replace(/[1|l]/g, "I");
    if (!/[01|]/.test(word)) return fixed;
    // Un chiffre parmi les lettres : sûr dès deux lettres, sinon sur un mot courant.
    return letters >= 2 || SHORT_WORDS.has(fixed.toUpperCase()) ? fixed : word;
  }

  let fixed = word;
  // « l'm », « l'll » : un I majuscule lu comme un l.
  fixed = fixed.replace(/^[l|1](?=')/, "I");
  if (letters >= 2) {
    fixed = fixed
      .replace(/(?<=\p{Ll})0|0(?=\p{Ll})/gu, "o")
      .replace(/(?<=\p{Lu})0(?=\p{Lu}|$)/gu, "O")
      .replace(/(?<=\p{Ll})[1|]|[1|](?=\p{Ll})/gu, "l")
      // Un I majuscule au milieu d'un mot en minuscules est un l.
      .replace(/(?<=\p{Ll})I(?=\p{Ll})/gu, "l");
  }
  return fixed;
}

/** Applique `fixWord` à chaque mot, ponctuation de bord mise à part ; les termes protégés passent tels quels. */
function fixConfusions(text: string, allCaps: boolean, protectedWords: Set<string>): string {
  return text
    .split(" ")
    .map((token) => {
      const match = token.match(/^([^\p{L}\p{N}|]*)(.*?)([^\p{L}\p{N}|]*)$/u);
      if (!match || !match[2]) return token;
      if (protectedWords.has(match[2].toLowerCase())) return token;
      return match[1] + fixWord(match[2], allCaps) + match[3];
    })
    .join(" ");
}

/** Casse de phrase : tout en minuscules, majuscule en tête de phrase et au pronom « I ». */
export function toSentenceCase(text: string): string {
  const lower = text.toLowerCase();
  let result = "";
  let capitalize = true;
  for (let index = 0; index < lower.length; index++) {
    const char = lower[index];
    if (LETTER.test(char)) {
      result += capitalize ? char.toUpperCase() : char;
      capitalize = false;
      continue;
    }
    if (/\p{N}/u.test(char)) capitalize = false;
    else if (char === "!" || char === "?") capitalize = true;
    // Un point seul finit la phrase ; des points de suspension la laissent ouverte.
    else if (char === "." && lower[index - 1] !== "." && lower[index + 1] !== ".") capitalize = true;
    result += char;
  }
  return result.replace(/(?<![\p{L}\p{N}])i(?![\p{L}\p{N}])/gu, "I");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Rend aux termes protégés la casse du glossaire, où qu'ils soient dans le texte. */
function restoreTerms(text: string, terms: string[]): string {
  let result = text;
  for (const term of terms) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, "giu");
    result = result.replace(pattern, term);
  }
  return result;
}

/** Texte lu d'une zone, nettoyé et prêt à traduire. */
export function cleanReading(raw: string, options: CleanOptions = {}): string {
  const terms = (options.protectedTerms ?? []).map((term) => term.normalize("NFKC").trim()).filter(Boolean);
  const protectedWords = new Set(terms.flatMap((term) => term.toLowerCase().split(/\s+/)));

  const joined = normalizePunctuation(joinLines(normalizeCharacters(raw).split("\n")));
  if (!joined) return "";
  const allCaps = isAllCaps(joined);
  const fixed = fixConfusions(joined, allCaps, protectedWords);
  const cased = allCaps ? toSentenceCase(fixed) : fixed;
  return restoreTerms(cased, terms);
}
