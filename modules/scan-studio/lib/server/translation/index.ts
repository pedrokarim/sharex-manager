/**
 * Traduction, vue de `index.process.ts` : ce fichier contrôle ce qui arrive du
 * navigateur, retrouve le chapitre et son dossier, puis confie le lot au
 * routeur (`router.ts`).
 *
 * Le serveur ne touche pas aux pages : il rend des textes, que l'atelier pose
 * dans les zones avant d'enregistrer. Un texte reçu est une donnée : il n'est
 * jamais interprété, seulement borné, puis sérialisé en JSON vers le service.
 */

import type {
  EngineCatalogue,
  EngineSettingsPatch,
  TranslationBatch,
  TranslationEngineId,
  TranslationEstimate,
  TranslationItem,
} from "../../types";
import { requireChapter, requireFolder } from "../library";
import { isEngineId } from "./engines";
import { TranslationRouter } from "./router";
import { applySettingsPatch } from "./settings";

/** Phrases traduites en un appel : une page, même très chargée, en compte bien moins. */
export const MAX_ITEMS = 400;
export const MAX_TEXT_LENGTH = 2000;
/** Tous les textes d'un appel, ensemble. */
export const MAX_TOTAL_LENGTH = 200_000;
const MAX_ID_LENGTH = 64;

/** Le retour à la ligne est le seul caractère de contrôle qu'une phrase peut porter. */
const CONTROL_IN_TEXT = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/;
/** Séparateurs de ligne et de paragraphe d'Unicode (2028 et 2029) : des retours à la ligne déguisés. */
const LINE_SEPARATORS = new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`);
const CONTROL_IN_ID = /[\u0000-\u001f\u007f-\u009f]/;

// ─── Routeur ─────────────────────────────────────────────────────

// Un seul routeur par processus : c'est lui qui tient les files et les
// disjoncteurs. Rangé sur `globalThis` pour survivre au rechargement à chaud.
const holder = globalThis as typeof globalThis & { __scanStudioTranslationRouter?: TranslationRouter };
let override: TranslationRouter | null = null;

function router(): TranslationRouter {
  if (override) return override;
  holder.__scanStudioTranslationRouter ??= new TranslationRouter();
  return holder.__scanStudioTranslationRouter;
}

/** Remplace le routeur, pour les tests : de faux moteurs, une fausse horloge. `null` rétablit le vrai. */
export function setRouter(replacement: TranslationRouter | null) {
  override = replacement;
}

// ─── Contrôles ───────────────────────────────────────────────────

function cleanText(value: unknown, where: string): string {
  if (typeof value !== "string") throw new Error(`${where} : texte manquant.`);
  if (value.length > MAX_TEXT_LENGTH) throw new Error(`${where} : texte trop long (${MAX_TEXT_LENGTH} caractères au plus).`);
  // Les fins de ligne de Windows sont ramenées à un simple retour à la ligne avant le contrôle.
  const text = value.replace(/\r\n?/g, "\n");
  if (CONTROL_IN_TEXT.test(text) || LINE_SEPARATORS.test(text)) throw new Error(`${where} : le texte contient des caractères de contrôle.`);
  return text;
}

function assertTotal(texts: string[]) {
  const total = texts.reduce((sum, text) => sum + text.length, 0);
  if (total > MAX_TOTAL_LENGTH) throw new Error(`Trop de texte d'un coup (${MAX_TOTAL_LENGTH} caractères au plus) : traduisez page par page.`);
}

function cleanItems(value: unknown): TranslationItem[] {
  if (!Array.isArray(value)) throw new Error("Liste de textes à traduire invalide.");
  if (value.length > MAX_ITEMS) throw new Error(`Trop de textes d'un coup (${MAX_ITEMS} au plus) : traduisez page par page.`);
  const items = value.map((entry, index) => {
    const where = `Texte ${index + 1}`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`${where} : entrée mal formée.`);
    const { id, text } = entry as Record<string, unknown>;
    if (typeof id !== "string" || id.length === 0 || id.length > MAX_ID_LENGTH || CONTROL_IN_ID.test(id)) {
      throw new Error(`${where} : identifiant invalide.`);
    }
    return { id, text: cleanText(text, where) };
  });
  assertTotal(items.map((item) => item.text));
  return items;
}

function cleanOptions(value: unknown): { engine?: TranslationEngineId; force?: boolean } {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Options de traduction invalides.");
  const { engine, force } = value as Record<string, unknown>;
  if (engine !== undefined && engine !== null && !isEngineId(engine)) throw new Error("Moteur de traduction inconnu.");
  if (force !== undefined && force !== null && typeof force !== "boolean") throw new Error("Options de traduction invalides.");
  return { ...(isEngineId(engine) ? { engine } : {}), ...(force === true ? { force: true } : {}) };
}

/** Langues, glossaire et mémoire viennent du chapitre et de son dossier, jamais du navigateur. */
function contextOf(chapterId: unknown) {
  const chapter = requireChapter(chapterId);
  const folder = requireFolder(chapter.folderId);
  return {
    source: chapter.settings.sourceLanguage,
    target: chapter.settings.targetLanguage,
    glossary: Array.isArray(folder.glossary) ? folder.glossary : [],
    folderId: folder.id,
    // En dessous du niveau 2, rien ne part chez un service (§ 3 du dossier).
    allowEngines: chapter.settings.maxLevel >= 2,
  };
}

// ─── Fonctions du module ─────────────────────────────────────────

export async function translateTexts(chapterId: unknown, items: unknown, options?: unknown): Promise<TranslationBatch> {
  const cleanedItems = cleanItems(items);
  const cleanedOptions = cleanOptions(options);
  const context = contextOf(chapterId);
  if (cleanedItems.length === 0) return { results: [], failed: [], sentCharacters: 0 };
  return router().translate({ ...context, ...cleanedOptions, items: cleanedItems });
}

export async function estimateTranslation(chapterId: unknown, texts: unknown): Promise<TranslationEstimate> {
  if (!Array.isArray(texts)) throw new Error("Liste de textes à estimer invalide.");
  if (texts.length > MAX_ITEMS) throw new Error(`Trop de textes d'un coup (${MAX_ITEMS} au plus) : estimez page par page.`);
  const cleaned = texts.map((text, index) => cleanText(text, `Texte ${index + 1}`));
  assertTotal(cleaned);
  return router().estimate({ ...contextOf(chapterId), texts: cleaned });
}

export async function getEngines(): Promise<EngineCatalogue> {
  return router().catalogue();
}

/** Réservé aux administrateurs : la fonction n'est pas déclarée dans `module.json`. */
export async function saveEngineSettings(patch: EngineSettingsPatch): Promise<EngineCatalogue> {
  applySettingsPatch(patch);
  return router().catalogue();
}

/** Réservé aux administrateurs : une requête d'essai, une seule. */
export async function testEngine(engineId: unknown): Promise<{ ok: boolean; message: string }> {
  if (!isEngineId(engineId)) throw new Error("Moteur de traduction inconnu.");
  return router().test(engineId);
}
