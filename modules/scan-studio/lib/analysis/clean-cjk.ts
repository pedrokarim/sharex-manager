/**
 * Nettoyage d'un texte lu en japonais, en chinois ou en coréen (§ 6.3 du
 * dossier). Les règles de l'anglais (casse, césures, `I`/`l`/`1`) n'ont pas de
 * sens ici ; celles-ci les remplacent.
 *
 * Dans l'ordre : caractères invisibles retirés, formes de compatibilité
 * ramenées à leur forme ordinaire (chiffres et lettres pleine chasse, kana
 * demi-chasse, ponctuation des colonnes), lignes qui ne sont que des traits
 * écartées, lignes recollées, espaces que la lecture glisse entre les signes
 * retirés, ponctuation ramenée à celle de la langue, puis confusions de
 * lecture du japonais corrigées par règles.
 *
 * Les furigana ne sont pas traités ici : ils sont écartés avant la lecture,
 * sur leur position dans la page (`vertical.ts`).
 *
 * Tous les caractères particuliers sont écrits en échappements `\u` : un
 * séparateur de ligne littéral dans une expression régulière casse la
 * compilation. Fonctions pures, sans DOM.
 */

import type { SourceLanguage } from "../types";
import { readingLanguage, type Script } from "./languages";

export interface CjkCleanOptions {
  /** Termes à ne jamais toucher (glossaire du dossier). */
  protectedTerms?: string[];
}

/** Caractères de contrôle et invisibles, hors retour à la ligne. */
const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;
/** Signes qu'un bord de bulle ou une trame font lire au bord d'une ligne. */
const EDGE_STROKES = /^[\s|_`^\\/<>=*+]+|[\s|_`^\\/<>=*+]+$/g;
/** Kanji, kana, hangul : les signes pleins. */
const WIDE = "\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}\\u30fc\\u3005\\u3006";
/** Ponctuation pleine chasse : 、 。 crochets, points de suspension, tiret long, signes pleine chasse. */
const WIDE_MARK = "\\u3001\\u3002\\u300c-\\u300f\\u3010\\u3011\\u2026\\u2025\\u301c\\uff01\\uff1f\\uff0c\\uff1a\\uff1b\\uff08\\uff09";
const WIDE_CHAR = new RegExp(`[${WIDE}]`, "u");
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
/** Ponctuation qui tient lieu de réplique à elle seule : « …… », « ！？ ». */
const SENTENCE_MARKS = /^[\s.!?\u2026\u2025\u3002\u3001\uff01\uff1f\u30fb\u00b7]+$/u;

const KATAKANA = "\\p{Script=Katakana}\\u30fc";
const HIRAGANA = "\\p{Script=Hiragana}";
const HAN = "\\p{Script=Han}";

/**
 * Signes que la lecture confond : un katakana et le kanji qui lui ressemble.
 * Seul le voisinage les départage : entre deux katakana c'est un katakana,
 * entre deux kanji c'est un kanji.
 */
const LOOKALIKES: [katakana: string, han: string][] = [
  ["\u30ed", "\u53e3"],
  ["\u30ab", "\u529b"],
  ["\u30cb", "\u4e8c"],
  ["\u30cf", "\u516b"],
  ["\u30a8", "\u5de5"],
  ["\u30bf", "\u5915"],
  ["\u30c8", "\u535c"],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Invisibles, retours à la ligne, formes de compatibilité. */
function normalizeCharacters(text: string): string {
  return text
    .replace(/\r\n?|[\u2028\u2029]/g, "\n")
    .replace(/\t/g, " ")
    .replace(INVISIBLE, "")
    // Chiffres et lettres pleine chasse, kana demi-chasse, ponctuation des colonnes, espace idéographique.
    .normalize("NFKC");
}

/** Une ligne lue vaut-elle d'être gardée ? Pas si elle ne porte ni signe ni ponctuation de phrase. */
function isTextLine(line: string): boolean {
  return LETTER_OR_DIGIT.test(line) || SENTENCE_MARKS.test(line);
}

/** Recolle les lignes : sans espace entre deux signes pleins, avec une espace sinon. */
function joinLines(lines: string[], script: Script): string {
  let result = "";
  for (const raw of lines) {
    const line = raw.replace(EDGE_STROKES, "");
    if (!line || !isTextLine(line)) continue;
    if (!result) result = line;
    else if (script === "korean") result += ` ${line}`;
    else result += WIDE_CHAR.test(result[result.length - 1]) || WIDE_CHAR.test(line[0]) ? line : ` ${line}`;
  }
  return result;
}

/** Points de suspension : toute suite de points, de points médians ou de petits ronds devient « … ». */
function normalizeEllipsis(text: string): string {
  return text
    .replace(/[.\u00b7\u30fb\u2022](?:\s?[.\u00b7\u30fb\u2022\u3002])+/g, "\u2026")
    .replace(/\u3002{2,}/g, "\u2026")
    .replace(/[\u2025\u22ef]+/g, "\u2026")
    .replace(/\u2026(?:\s*\u2026)+/g, "\u2026\u2026");
}

/** Japonais et chinois : aucune espace entre deux signes pleins, ponctuation pleine chasse. */
function settleWideText(text: string, script: Script): string {
  const comma = script === "japanese" ? "\u3001" : "\uff0c";
  const wave = script === "japanese" ? "\u301c" : "\uff5e";
  let result = text.replace(/\s+/g, " ");
  // Ponctuation : la forme pleine chasse dès qu'elle touche un signe plein.
  result = result
    .replace(/\s*[!\uff01]/g, "\uff01")
    .replace(/\s*[?\uff1f]/g, "\uff1f")
    .replace(new RegExp(`(?<=[${WIDE}${WIDE_MARK}])\\s*,`, "gu"), comma)
    .replace(new RegExp(`(?<=[${WIDE}${WIDE_MARK}])\\s*\\.(?!\\d)`, "gu"), "\u3002")
    .replace(new RegExp(`(?<=[${WIDE}])\\s*:`, "gu"), "\uff1a")
    .replace(new RegExp(`(?<=[${WIDE}])\\s*;`, "gu"), "\uff1b")
    .replace(new RegExp(`\\((?=[${WIDE}])`, "gu"), "\uff08")
    .replace(new RegExp(`(?<=[${WIDE}${WIDE_MARK}])\\)`, "gu"), "\uff09")
    .replace(/~/g, wave);
  if (script === "japanese") result = result.replace(/\uff0c/g, "\u3001");
  // Espaces : aucune entre deux signes pleins, ni autour de leur ponctuation.
  // Les repères des termes protégés (zone privée) comptent comme des signes pleins.
  const wide = `[${WIDE}${WIDE_MARK}\\ue000\\ue001]`;
  result = result.replace(new RegExp(`(?<=${wide})\\s+(?=${wide})`, "gu"), "");
  result = result.replace(new RegExp(`\\s+(?=[${WIDE_MARK}])|(?<=[${WIDE_MARK}])\\s+`, "gu"), "");
  return result.trim();
}

/** Coréen : les mots restent séparés ; ponctuation ordinaire, sans espace devant. */
function settleKoreanText(text: string): string {
  return text
    .replace(/\u3002/g, ".")
    .replace(/\u3001/g, ",")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:\u2026])/g, "$1")
    .replace(/([!?])\s+(?=[!?])/g, "$1")
    .trim();
}

/**
 * Confusions de lecture du japonais :
 *  - la marque d'allongement « ー » lue comme un tiret, une barre ou le kanji
 *    « 一 » après un katakana (et en fin de mot après un hiragana) ;
 *  - un katakana et le kanji qui lui ressemble, départagés par leurs voisins ;
 *  - « へ », « べ », « ぺ », identiques en hiragana et en katakana.
 */
function fixJapaneseConfusions(text: string): string {
  let result = text
    .replace(new RegExp(`(?<=[${KATAKANA}])[\\u2014\\u2015\\u2500\\uff0d\\u2212|\\-]+`, "gu"), (run) => "\u30fc".repeat(run.length))
    .replace(new RegExp(`(?<=[${KATAKANA}])\\u4e00+(?![${HAN}])`, "gu"), (run) => "\u30fc".repeat(run.length))
    .replace(new RegExp(`(?<=[${HIRAGANA}])[\\u2014\\u2015\\u2500\\uff0d\\u2212\\-]+(?=$|[${WIDE_MARK}])`, "gu"), (run) => "\u30fc".repeat(run.length));
  for (const [katakana, han] of LOOKALIKES) {
    result = result
      .replace(new RegExp(`(?<=[${KATAKANA}])${han}(?=[${KATAKANA}])`, "gu"), katakana)
      .replace(new RegExp(`(?<=[${HAN}])${katakana}(?=[${HAN}])`, "gu"), han);
  }
  for (const [hiragana, katakana] of [
    ["\u3078", "\u30d8"],
    ["\u3079", "\u30d9"],
    ["\u307a", "\u30da"],
  ]) {
    result = result
      .replace(new RegExp(`(?<=[${HIRAGANA}])${katakana}(?=$|[${HIRAGANA}${HAN}${WIDE_MARK}])`, "gu"), hiragana)
      .replace(new RegExp(`(?<=[${KATAKANA}])${hiragana}(?=[${KATAKANA}])`, "gu"), katakana);
  }
  return result;
}

/** Texte lu d'une zone en japonais, en chinois ou en coréen, nettoyé et prêt à traduire. */
export function cleanCjkReading(raw: string, language: SourceLanguage, options: CjkCleanOptions = {}): string {
  const script = readingLanguage(language).script;
  const terms = (options.protectedTerms ?? []).map((term) => term.normalize("NFKC").trim()).filter(Boolean);

  let text = joinLines(normalizeCharacters(raw).split("\n"), script);
  if (!text) return "";

  // Les termes du glossaire sont mis à l'abri derrière un repère de la zone privée, le temps des règles.
  const kept: string[] = [];
  for (const term of [...terms].sort((a, b) => b.length - a.length)) {
    // Un terme peut avoir été lu avec des espaces entre ses signes.
    const spaced = [...term].map(escapeRegExp).join("\\s*");
    text = text.replace(new RegExp(spaced, "gu"), () => `\ue000${String.fromCharCode(0xe100 + kept.push(term) - 1)}\ue001`);
  }

  text = normalizeEllipsis(text);
  text = script === "korean" ? settleKoreanText(text) : settleWideText(text, script);
  if (script === "japanese") text = fixJapaneseConfusions(text);

  return text.replace(/\ue000(.)\ue001/gu, (_, mark: string) => kept[mark.charCodeAt(0) - 0xe100] ?? "").trim();
}
