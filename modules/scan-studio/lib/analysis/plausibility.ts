/**
 * Un texte lu ressemble-t-il à de l'anglais, ou à du dessin pris pour des
 * lettres ?
 *
 * Le moteur de lecture rend toujours quelque chose : sur une trame, des
 * cheveux ou du lettrage japonais, il sort des suites de signes, de consonnes
 * et de lettres isolées. Ce fichier mesure ce qui distingue une réplique de ce
 * bruit : des mots connus ou bien formés, des voyelles, peu de signes.
 *
 * Aucun dictionnaire complet : une courte liste de mots très courants et
 * quelques règles de forme. Fonctions pures, sans DOM.
 */

/** Mots anglais très courants et interjections de bande dessinée, en minuscules. */
const COMMON_WORDS = new Set(
  (
    "a i o an am as at be by do go he if in is it me my no of oh ok on or so to up us we ah eh ha hm uh um ya yo " +
    "all and any are but can day did for get got had has her hey him his how its let man may new nor not now off old one our out own " +
    "say see she sir the too try two use was way who why yes yet you huh hmm shh tsk ugh wow aah ooh mmm grr pff mr mrs ms dr vs tv " +
    "also away back been both came come does done down each even ever from gave give goes gone good have here into just keep knew know " +
    "last left like look made make many more most much must need next only over said same seen some such sure take tell than that them " +
    "then they this time told took very want well went were what when will with your about after again being could every first great " +
    "never other right shall still their there these thing think those three under until where which while would please thanks sorry"
  ).split(" "),
);

/** Signes qu'une réplique ne porte presque jamais, et qu'un trait de dessin fait lire. */
const JUNK_SYMBOL = /[=<>_|\\[\]{}~^*+§¢£¥©®°¬¦«»¤]/gu;
const LETTER = /\p{L}/gu;
const LATIN_LETTER = /\p{Script=Latin}/gu;
const VOWEL = /[aeiouyàâäéèêëîïôöùûü]/giu;
/** Nombre, avec ou sans suffixe : « 12 », « 198th », « 3rd », « 100m ». */
const NUMBER = /^\d+(?:[.,]\d+)*(?:st|nd|rd|th|[skmx%])?$/i;

export interface Plausibility {
  /** Mots du texte, signes de bord retirés. */
  words: number;
  /** Lettres du texte. */
  letters: number;
  /** Part des lettres portée par des mots connus ou bien formés, de 0 à 1. */
  wordLike: number;
  /** Mots de la liste des mots courants. */
  known: number;
  /** Part de voyelles parmi les lettres, de 0 à 1. */
  vowels: number;
  /** Signes qui n'ont rien à faire dans une réplique. */
  symbols: number;
  /** Part des lettres qui ne sont pas de l'alphabet latin, de 0 à 1. */
  foreign: number;
}

const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;

/** Le mot est-il de la liste des mots courants ? */
export function isCommonWord(word: string): boolean {
  return COMMON_WORDS.has(word.toLowerCase().replace(/[’']/g, "'").replace(/'(?:s|m|d|t|ll|re|ve)$/, ""));
}

/**
 * Un mot a-t-il la forme d'un mot ? Connu, ou bien : trois lettres au moins,
 * une voyelle, pas plus de quatre consonnes d'affilée, pas de lettre triplée,
 * une casse régulière et aucun chiffre mêlé aux lettres.
 */
export function isWordLike(word: string): boolean {
  if (NUMBER.test(word)) return true;
  if (isCommonWord(word)) return true;
  // Apostrophes et traits d'union internes : « DON'T », « HALF-BAKED ».
  const bare = word.replace(/[’'-]/g, "");
  if (bare.length < 3 || count(bare, LETTER) !== bare.length) return false;
  if (count(bare, LATIN_LETTER) !== bare.length) return false;
  if (count(bare, VOWEL) === 0) return false;
  if (/[^aeiouyàâäéèêëîïôöùûü]{5,}/i.test(bare) || /(.)\1\1/i.test(bare)) return false;
  const regular = bare === bare.toUpperCase() || bare === bare.toLowerCase() || bare.slice(1) === bare.slice(1).toLowerCase();
  return regular;
}

/** Mesure d'un texte lu : ses mots, ses voyelles, ses signes. */
export function plausibility(text: string): Plausibility {
  const tokens = text
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
  let weight = 0;
  let wordLike = 0;
  let known = 0;
  for (const token of tokens) {
    const size = Math.max(1, token.length);
    weight += size;
    if (isWordLike(token)) wordLike += size;
    if (isCommonWord(token)) known++;
  }
  const letters = count(text, LETTER);
  return {
    words: tokens.length,
    letters,
    wordLike: weight > 0 ? wordLike / weight : 0,
    known,
    vowels: letters > 0 ? count(text, VOWEL) / letters : 0,
    symbols: count(text, JUNK_SYMBOL),
    foreign: letters > 0 ? 1 - count(text, LATIN_LETTER) / letters : 0,
  };
}

import { isCjkCreditsText } from "./plausibility-cjk";

/** Adresse de site, de serveur ou de messagerie : jamais une réplique. */
const LINK = /(?:https?:\/\/|www\.|\b[\w-]+\.(?:com|net|org|gg|io|me|co|to|xyz)\b|\b[\w.-]+@[\w-]+\.\w+)/i;
/** Vocabulaire d'une page de crédits d'équipe de traduction. */
const CREDIT_WORDS =
  /\b(?:translat(?:or|ion|ed)s?|proof ?read(?:er|ing)?s?|type ?sett?(?:er|ing)s?|re ?draw(?:er|ing)?s?|clean(?:er|ing)s?|quality ?check(?:er)?s?|raw provider|scanlat(?:ion|or)s?|discord|patreon|ko-?fi|donat(?:e|ing|ions?)|recruit(?:ing|ment)|credits?)\b/i;

/** Le texte est-il celui d'une page de crédits : une adresse, un rôle d'équipe ? */
export function isCreditsText(text: string): boolean {
  return LINK.test(text) || CREDIT_WORDS.test(text) || isCjkCreditsText(text);
}
