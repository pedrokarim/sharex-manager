/**
 * Contrôle des réglages d'un dossier ou d'un chapitre : noms, langues, format,
 * styles par type de zone, glossaire. Même règle que pour les zones d'une
 * page : ce qui est mal formé est refusé, les champs inconnus ne sont pas
 * recopiés.
 */

import { sanitizeTextStyle } from "../sanitize-page";
import {
  DEFAULT_STYLES,
  REGION_KINDS,
  type AiAction,
  type AutomationLevel,
  type ChapterSettings,
  type GlossaryEntry,
  type ReadingFormat,
  type RegionKind,
  type SourceLanguage,
  type TextStyle,
} from "../types";

const SOURCE_LANGUAGES: SourceLanguage[] = ["en", "ja", "zh-Hans", "zh-Hant", "ko", "auto"];
const FORMATS: ReadingFormat[] = ["manga", "manhua", "webtoon"];
/** Code de langue : « fr », « pt-BR », « zh-Hans ». */
const LANGUAGE_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/;

const MAX_GLOSSARY = 2000;

/** Texte sur une ligne, sans caractère de contrôle, espaces resserrés. */
function oneLine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeFolderName(value: unknown): string {
  const name = oneLine(value);
  if (!name) throw new Error("Donnez un nom au dossier.");
  if (name.length > 120) throw new Error("Nom de dossier trop long (120 caractères au plus).");
  return name;
}

export function sanitizeChapterNumber(value: unknown): string {
  const number = oneLine(value);
  if (!number) throw new Error("Donnez un numéro au chapitre.");
  if (number.length > 40) throw new Error("Numéro de chapitre trop long (40 caractères au plus).");
  return number;
}

/** Titre facultatif : vide, le chapitre n'en a pas. */
export function sanitizeChapterTitle(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const title = oneLine(value);
  if (title === null) throw new Error("Titre de chapitre invalide.");
  if (title.length > 200) throw new Error("Titre de chapitre trop long (200 caractères au plus).");
  return title || undefined;
}

export function sanitizeSettings(value: unknown): ChapterSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Réglages invalides.");
  const input = value as Record<string, unknown>;

  if (!SOURCE_LANGUAGES.includes(input.sourceLanguage as SourceLanguage)) throw new Error("Langue source inconnue.");
  if (typeof input.targetLanguage !== "string" || !LANGUAGE_PATTERN.test(input.targetLanguage)) {
    throw new Error("Langue cible invalide.");
  }
  if (!FORMATS.includes(input.format as ReadingFormat)) throw new Error("Format de lecture inconnu.");
  if (![0, 1, 2, 3].includes(input.maxLevel as number)) throw new Error("Niveau d'automatisation invalide.");
  if (!input.styles || typeof input.styles !== "object" || Array.isArray(input.styles)) {
    throw new Error("Styles de texte manquants.");
  }

  const given = input.styles as Record<string, unknown>;
  const styles = {} as Record<RegionKind, TextStyle>;
  for (const kind of REGION_KINDS) {
    // Un type de zone ajouté après la création du dossier (le cri) n'a pas encore de style : il prend celui par défaut.
    styles[kind] = given[kind] === undefined ? DEFAULT_STYLES[kind] : sanitizeTextStyle(given[kind], `Style « ${kind} »`, "full");
  }
  const aiModels = sanitizeAiModels(input.aiModels);

  return {
    sourceLanguage: input.sourceLanguage as SourceLanguage,
    targetLanguage: input.targetLanguage,
    format: input.format as ReadingFormat,
    maxLevel: input.maxLevel as AutomationLevel,
    styles,
    ...(aiModels ? { aiModels } : {}),
  };
}

const AI_ACTIONS: AiAction[] = ["reading", "translation", "page"];
/** « fournisseur/modèle » : des identifiants, jamais du texte libre. */
const AI_MODEL_KEY = /^[a-z0-9][a-z0-9._-]{0,39}\/[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/;

/** Modèles d'IA proposés par défaut, par action. Absent ou vide : le chapitre n'en retient aucun. */
function sanitizeAiModels(value: unknown): Partial<Record<AiAction, string>> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Modèles d'IA par défaut invalides.");
  const given = value as Record<string, unknown>;
  const models: Partial<Record<AiAction, string>> = {};
  for (const action of AI_ACTIONS) {
    const key = given[action];
    if (key === undefined || key === null || key === "") continue;
    if (typeof key !== "string" || !AI_MODEL_KEY.test(key)) throw new Error("Modèle d'IA par défaut invalide.");
    models[action] = key;
  }
  return Object.keys(models).length > 0 ? models : undefined;
}

export function sanitizeGlossary(value: unknown): GlossaryEntry[] {
  if (!Array.isArray(value)) throw new Error("Glossaire invalide.");
  if (value.length > MAX_GLOSSARY) throw new Error(`Glossaire trop long (${MAX_GLOSSARY} termes au plus).`);

  return value.map((entry, index) => {
    const where = `Terme ${index + 1} du glossaire`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`${where} : entrée mal formée.`);
    const input = entry as Record<string, unknown>;
    const source = oneLine(input.source);
    const target = oneLine(input.target);
    if (!source) throw new Error(`${where} : le terme d'origine est vide.`);
    if (target === null) throw new Error(`${where} : traduction invalide.`);
    if (source.length > 200 || target.length > 200) throw new Error(`${where} : 200 caractères au plus.`);

    const clean: GlossaryEntry = { source, target };
    if (input.keep !== undefined) {
      if (typeof input.keep !== "boolean") throw new Error(`${where} : marque de nom propre invalide.`);
      if (input.keep) clean.keep = true;
    }
    if (input.note !== undefined && input.note !== null) {
      const note = oneLine(input.note);
      if (note === null || note.length > 500) throw new Error(`${where} : note invalide (500 caractères au plus).`);
      if (note) clean.note = note;
    }
    return clean;
  });
}
