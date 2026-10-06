/**
 * Glossaire d'un dossier, côté traduction. Pur : ni disque, ni réseau.
 *
 * Un terme imposé ne se traduit pas, il se remplace (§ 6.5 et § 7.5 du
 * dossier). Avant l'envoi, chaque terme trouvé dans une phrase laisse sa place
 * à un repère, « ⟦0⟧ », « ⟦1⟧ »… qu'un moteur de traduction recopie sans y
 * toucher ; au retour, le repère laisse sa place à la traduction imposée.
 *
 * Le repère ne contient pas le terme : rétablir une phrase demande de la
 * protéger de nouveau, ce qui redonne les mêmes termes dans le même ordre. Le
 * cache garde donc la phrase protégée, et un terme dont la traduction change
 * dans le glossaire se corrige sans rien redemander au moteur.
 */

import type { GlossaryEntry } from "../../types";

const OPEN = "⟦";
const CLOSE = "⟧";

/** Un moteur peut glisser des espaces dans un repère, ou en changer les crochets pour leur forme pleine chasse. */
const PLACEHOLDER = /[⟦〚]\s*(\d{1,4})\s*[⟧〛]/g;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
/** Écritures sans espace entre les mots : « mot entier » n'y a pas de sens. */
const UNSPACED_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export interface PreparedGlossary {
  /** Ce qui remplace chaque terme, dans l'ordre des groupes de `pattern`. */
  replacements: string[];
  /** Tous les termes en une expression, les plus longs d'abord ; `null` si le glossaire est vide. */
  pattern: RegExp | null;
  /** Terme d'origine, en minuscules et espaces resserrés, vers son remplacement. */
  exact: Map<string, string>;
}

const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Un nom propre (`keep`) sans transcription se recopie tel quel ; un terme sans traduction est ignoré. */
function replacementOf(entry: GlossaryEntry): string | null {
  const target = entry.target.trim();
  if (target) return target;
  return entry.keep ? entry.source.trim() : null;
}

/**
 * Expression d'un terme : insensible à la casse, espaces souples, et bornée
 * aux mots entiers du côté où le terme commence ou finit par une lettre d'une
 * écriture à espaces (« Ace » ne doit pas mordre sur « Peace »).
 */
function termPattern(source: string): string {
  const characters = [...source];
  const first = characters[0];
  const last = characters[characters.length - 1];
  const bounded = (edge: string) => LETTER_OR_DIGIT.test(edge) && !UNSPACED_SCRIPT.test(edge);
  const body = source.split(/\s+/).map(escapeRegExp).join("\\s+");
  return `${bounded(first) ? "(?<![\\p{L}\\p{N}])" : ""}(${body})${bounded(last) ? "(?![\\p{L}\\p{N}])" : ""}`;
}

export function prepareGlossary(entries: GlossaryEntry[]): PreparedGlossary {
  const exact = new Map<string, string>();
  const terms: { source: string; replacement: string }[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry.source !== "string" || typeof entry.target !== "string") continue;
    const source = entry.source.normalize("NFKC").replace(/\s+/g, " ").trim();
    const replacement = replacementOf(entry);
    const key = normalize(source);
    // Le premier terme déclaré l'emporte sur un doublon.
    if (!source || replacement === null || exact.has(key)) continue;
    exact.set(key, replacement);
    terms.push({ source, replacement });
  }
  // Les plus longs d'abord : « Monkey D. Luffy » passe avant « Luffy ».
  terms.sort((a, b) => b.source.length - a.source.length);
  return {
    replacements: terms.map((term) => term.replacement),
    pattern: terms.length > 0 ? new RegExp(terms.map((term) => termPattern(term.source)).join("|"), "giu") : null,
    exact,
  };
}

/** Une phrase qui est exactement un terme du glossaire se remplace sans moteur. `null` sinon. */
export function exactGlossaryMatch(text: string, glossary: PreparedGlossary): string | null {
  return glossary.exact.get(normalize(text)) ?? null;
}

export interface ProtectedText {
  /** Phrase à envoyer, repères à la place des termes. */
  text: string;
  /** Remplacement de chaque repère, par numéro. */
  terms: string[];
}

/**
 * Remplace les termes du glossaire par des repères. Une phrase qui contient
 * déjà un crochet de repère n'est pas protégée : on ne saurait plus distinguer
 * les nôtres au retour.
 */
export function protectTerms(text: string, glossary: PreparedGlossary): ProtectedText {
  if (!glossary.pattern || /[⟦⟧〚〛]/.test(text)) return { text, terms: [] };
  const terms: string[] = [];
  const protectedText = text.replace(glossary.pattern, (...match) => {
    // Les groupes suivent l'ordre des termes : celui qui a capturé désigne le terme.
    const groups = match.slice(1, 1 + glossary.replacements.length) as (string | undefined)[];
    const index = groups.findIndex((group) => group !== undefined);
    if (index === -1) return match[0] as string;
    terms.push(glossary.replacements[index]);
    return `${OPEN}${terms.length - 1}${CLOSE}`;
  });
  return { text: protectedText, terms };
}

/**
 * Remet les traductions imposées à la place des repères. `intact` dit si
 * chaque repère est revenu exactement une fois : sinon le moteur en a perdu ou
 * dupliqué un, et la phrase mérite un regard.
 */
export function restoreTerms(translated: string, terms: string[]): { text: string; intact: boolean } {
  if (terms.length === 0) return { text: translated, intact: true };
  const seen = new Array<number>(terms.length).fill(0);
  const text = translated.replace(PLACEHOLDER, (whole, digits: string) => {
    const index = Number(digits);
    if (index >= terms.length) return whole;
    seen[index]++;
    return terms[index];
  });
  return { text, intact: seen.every((count) => count === 1) };
}

/** Il ne reste que des repères et de la ponctuation : la phrase se rétablit sans moteur (« Luffy !! »). */
export function isOnlyTerms(protectedText: ProtectedText): boolean {
  if (protectedText.terms.length === 0) return false;
  return !LETTER_OR_DIGIT.test(protectedText.text.replace(PLACEHOLDER, ""));
}
