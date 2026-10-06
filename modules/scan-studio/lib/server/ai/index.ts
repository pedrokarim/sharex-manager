/**
 * IA en dernier recours (niveau 3, § 3 et § 6.8 du dossier), vue de
 * `index.process.ts`. Trois actions, chacune lancée d'un clic sur une chose
 * précise, jamais par lot et jamais d'elle-même :
 *
 * - relire une zone que le moteur local n'a pas su lire ;
 * - traduire une zone, ou les zones d'une page, avec le contexte ;
 * - traduire la page entière, en une version gardée à côté du travail de
 *   l'atelier.
 *
 * Ce fichier contrôle ce qui arrive du navigateur, vérifie que le niveau du
 * chapitre autorise l'IA (le refus se fait ici, sur le serveur, pas seulement
 * dans l'interface), prépare ce qui part, puis confie l'appel au garde-fou
 * (`guard.ts`). Rien de ce qu'un modèle rend n'est écrit dans les zones : ce
 * sont des propositions, que l'atelier accepte ou écarte.
 */

import fs from "fs";
import sharp from "sharp";
import { assetExists, assetPath, assetUrl, newAssetName, readPage, removeAsset, referencedAssets, writePage, type AssetExtension } from "../../store";
import {
  boundsOf,
  isId,
  type AiAction,
  type AiCatalogue,
  type AiModelOption,
  type AiPageVersion,
  type AiReadingProposal,
  type AiSettingsPatch,
  type AiTranslationProposal,
  type ScanChapter,
  type ScanPage,
  type ScanRegion,
} from "../../types";
import { MAX_PIXELS } from "../images";
import { requireChapter, requireFolder, requirePage } from "../library";
import { AiGuard, applyAiSettings, requestKey } from "./guard";
import { PROMPT_VERSION, pagePrompt, parseReading, parseTranslations, readingPrompt, translationPrompt, type ContextLine } from "./prompts";
import { AiCallError, type AiModelRef, type AiPalette, type AiPaletteModel } from "./providers";

export const AI_LIMITS = {
  /** Zones traduites en un appel : une page, même très chargée, en compte bien moins. */
  zones: 400,
  /** Texte d'une zone envoyé à un modèle, en caractères. */
  text: 2000,
  /** Lignes de contexte jointes à une traduction, de part et d'autre des zones. */
  contextSpan: 3,
  contextLines: 12,
  /** Plus grand côté de l'image d'une zone envoyée à un modèle. */
  cropSide: 1568,
  /** Plus grand côté de la page envoyée à un moteur d'image. */
  pageSide: 4096,
  /** Versions traduites par IA gardées par page : au-delà, il faut en supprimer une. */
  versions: 4,
};

const LEVEL_REFUSAL = "Le niveau d’automatisation de ce chapitre n’autorise pas l’IA : passez-le au niveau 3 dans les réglages du chapitre.";
const ACTIONS: AiAction[] = ["reading", "translation", "page"];

// ─── Garde-fou et palette ────────────────────────────────────────

// Un seul garde-fou par processus : c'est lui qui sait qu'un appel est en
// cours. Rangé sur `globalThis` pour survivre au rechargement à chaud.
const holder = globalThis as typeof globalThis & { __scanStudioAiGuard?: AiGuard };
let guardOverride: AiGuard | null = null;
let paletteOverride: AiPalette | null = null;

function guard(): AiGuard {
  if (guardOverride) return guardOverride;
  holder.__scanStudioAiGuard ??= new AiGuard();
  return holder.__scanStudioAiGuard;
}

async function palette(): Promise<AiPalette> {
  if (paletteOverride) return paletteOverride;
  const { createPalette } = await import("./palette");
  return createPalette();
}

/** Remplace le garde-fou, pour les tests : une fausse horloge. `null` rétablit le vrai. */
export function setAiGuard(replacement: AiGuard | null) {
  guardOverride = replacement;
}

/** Remplace la palette, pour les tests : un faux fournisseur. `null` rétablit la vraie. */
export function setAiPalette(replacement: AiPalette | null) {
  paletteOverride = replacement;
}

// ─── Contrôles ───────────────────────────────────────────────────

function assertLevel(chapter: ScanChapter) {
  if (chapter.settings.maxLevel < 3) throw new Error(LEVEL_REFUSAL);
}

const keyOf = (model: AiModelRef) => `${model.provider}/${model.model}`;

function optionsOf(value: unknown): { model?: string } {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Options de l’IA invalides.");
  const { model } = value as { model?: unknown };
  if (model === undefined || model === null) return {};
  if (typeof model !== "string" || model.length > 140) throw new Error("Modèle d’IA invalide.");
  return { model };
}

/**
 * Modèle retenu pour une action : celui que la demande nomme, sinon celui que
 * le chapitre a retenu. Aucun n'est choisi d'office. Il doit être dans la
 * palette, et disponible.
 */
async function resolveModel(action: AiAction, chapter: ScanChapter, requested: string | undefined): Promise<AiPaletteModel> {
  const key = requested ?? chapter.settings.aiModels?.[action];
  if (!key) throw new Error("Choisissez d’abord le modèle qui fera ce travail.");
  const models = (await (await palette()).models())[action];
  const model = models.find((entry) => keyOf(entry) === key);
  if (!model) throw new Error("Ce modèle n’est pas dans la palette d’IA pour cette action.");
  if (!model.available) throw new Error(`${model.label} : ${model.reason ?? "indisponible"}`);
  return model;
}

function requireRegion(page: ScanPage, regionId: unknown): ScanRegion {
  const region = isId(regionId) ? page.regions.find((entry) => entry.id === regionId) : undefined;
  if (!region) throw new Error("Zone introuvable sur cette page : enregistrez la page puis réessayez.");
  return region;
}

async function readSource(page: ScanPage): Promise<Buffer> {
  if (!assetExists(page.source.file)) throw new Error("L’image de cette page est introuvable sur le serveur.");
  return fs.promises.readFile(/* turbopackIgnore: true */ assetPath(page.source.file));
}

// ─── Catalogue ───────────────────────────────────────────────────

/** Ce que l'atelier peut proposer pour un chapitre. N'appelle aucun fournisseur. */
export async function getAiCatalogue(chapterId: unknown): Promise<AiCatalogue> {
  const chapter = requireChapter(chapterId);
  const usage = guard().usage();
  const none: AiCatalogue["models"] = { reading: [], translation: [], page: [] };
  if (chapter.settings.maxLevel < 3) return { allowed: false, reason: LEVEL_REFUSAL, models: none, defaults: {}, usage };

  let listed: Record<AiAction, AiPaletteModel[]>;
  try {
    listed = await (await palette()).models();
  } catch (error) {
    const detail = error instanceof Error && error.message ? error.message : "erreur inconnue";
    return { allowed: true, reason: `La palette d’IA n’a pas pu être lue : ${detail}`, models: none, defaults: {}, usage };
  }

  const models = { ...none };
  const defaults: AiCatalogue["defaults"] = {};
  for (const action of ACTIONS) {
    models[action] = listed[action].map((model): AiModelOption => {
      const paused = model.available ? guard().pauseReason(model.provider) : undefined;
      const reason = paused ?? model.reason;
      return {
        key: keyOf(model),
        provider: model.provider,
        providerLabel: model.providerLabel,
        model: model.model,
        label: model.label,
        available: model.available && !paused,
        ...(reason ? { reason } : {}),
      };
    });
    const preferred = chapter.settings.aiModels?.[action];
    if (preferred && models[action].some((model) => model.key === preferred)) defaults[action] = preferred;
  }
  return { allowed: true, models, defaults, usage };
}

/** Réservé aux administrateurs : le plafond mensuel d'appels. */
export async function saveAiSettings(patch: AiSettingsPatch): Promise<{ month: number; monthlyLimit: number }> {
  applyAiSettings(patch);
  return guard().usage();
}

/** Appels du mois et plafond, pour la page de réglages. */
export async function getAiUsage(): Promise<{ month: number; monthlyLimit: number }> {
  return guard().usage();
}

// ─── Relire une zone ─────────────────────────────────────────────

/** Image d'une zone, découpée dans la page d'origine avec un peu de marge, à une taille qu'un modèle lit bien. */
async function cropRegion(page: ScanPage, region: ScanRegion): Promise<Buffer> {
  const { width: pageWidth, height: pageHeight } = page.source;
  const bounds = boundsOf(region.outline);
  const padding = Math.max(8, Math.round(Math.min(bounds.width, bounds.height) * 0.08));
  const left = Math.max(0, Math.floor(bounds.x - padding));
  const top = Math.max(0, Math.floor(bounds.y - padding));
  const width = Math.max(1, Math.min(pageWidth, Math.ceil(bounds.x + bounds.width + padding)) - left);
  const height = Math.max(1, Math.min(pageHeight, Math.ceil(bounds.y + bounds.height + padding)) - top);
  const longest = Math.max(width, height);
  // Une zone minuscule est agrandie : les modèles lisent mal en dessous de quelques centaines de pixels.
  const target = longest < 256 ? 512 : Math.min(longest, AI_LIMITS.cropSide);

  try {
    return await sharp(await readSource(page), { limitInputPixels: MAX_PIXELS })
      .rotate()
      .extract({ left, top, width, height })
      .resize({ width: target, height: target, fit: "inside" })
      .png()
      .toBuffer();
  } catch (error) {
    if (error instanceof Error && error.message.includes("introuvable")) throw error;
    throw new Error("L’image de cette zone n’a pas pu être découpée dans la page.");
  }
}

/**
 * Relit une zone : son image part chez un modèle qui sait lire une image, et
 * la lecture revient comme une proposition. La page n'est pas modifiée.
 */
export async function askAiReading(pageId: unknown, regionId: unknown, options?: unknown): Promise<AiReadingProposal> {
  const { model: requested } = optionsOf(options);
  const page = requirePage(pageId);
  const chapter = requireChapter(page.chapterId);
  assertLevel(chapter);
  const region = requireRegion(page, regionId);
  const model = await resolveModel("reading", chapter, requested);

  const crop = await cropRegion(page, region);
  const prompt = readingPrompt(chapter.settings.sourceLanguage, region.direction);
  const service = await palette();
  const outcome = await guard().run({
    action: "reading",
    ref: model,
    providerLabel: model.providerLabel,
    key: requestKey("reading", model, PROMPT_VERSION, prompt, crop),
    sent: "crop",
    size: crop.byteLength,
    pageId: page.id,
    regionIds: [region.id],
    send: async (signal) => parseReading(await service.readImage(model, prompt, { b64: crop.toString("base64"), mimeType: "image/png" }, signal)),
  });
  return { regionId: region.id, text: outcome.value, trace: outcome.trace };
}

// ─── Traduire avec le contexte ───────────────────────────────────

function cleanRegionIds(value: unknown, page: ScanPage): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Aucune zone à traduire.");
  if (value.length > AI_LIMITS.zones) throw new Error(`Trop de zones d’un coup (${AI_LIMITS.zones} au plus).`);
  const known = new Set(page.regions.map((region) => region.id));
  const ids = new Set<string>();
  for (const id of value) {
    if (!isId(id) || !known.has(id)) throw new Error("Zone introuvable sur cette page : enregistrez la page puis réessayez.");
    ids.add(id);
  }
  return [...ids];
}

/** Lignes voisines des zones à traduire, dans l'ordre de lecture : ce qui aide à comprendre qui parle. */
function contextOf(page: ScanPage, wanted: ReadonlySet<string>): ContextLine[] {
  const positions = page.regions.flatMap((region, index) => (wanted.has(region.id) ? [index] : []));
  if (positions.length === 0) return [];
  const first = positions[0];
  const last = positions[positions.length - 1];
  const lines: ContextLine[] = [];
  page.regions.forEach((region, index) => {
    if (wanted.has(region.id)) return;
    const text = region.reading.clean.trim();
    if (!text) return;
    const near = positions.some((position) => Math.abs(position - index) <= AI_LIMITS.contextSpan);
    if (!near) return;
    const translation = region.translation.text.trim();
    lines.push({
      kind: region.kind,
      text: text.slice(0, AI_LIMITS.text),
      ...(translation ? { translation: translation.slice(0, AI_LIMITS.text) } : {}),
      position: index < first ? "before" : index > last ? "after" : "before",
    });
  });
  return lines.slice(0, AI_LIMITS.contextLines);
}

/**
 * Traduit une zone, ou les zones d'une page, en un seul appel : le modèle
 * reçoit le texte des zones, les lignes voisines, le type de chaque texte et
 * les termes du glossaire que la page cite. Rend des propositions : la page
 * n'est pas modifiée.
 */
export async function askAiTranslation(pageId: unknown, regionIds: unknown, options?: unknown): Promise<AiTranslationProposal> {
  const { model: requested } = optionsOf(options);
  const page = requirePage(pageId);
  const chapter = requireChapter(page.chapterId);
  assertLevel(chapter);
  const ids = cleanRegionIds(regionIds, page);
  const wanted = new Set(ids);
  const folder = requireFolder(chapter.folderId);

  const failed: AiTranslationProposal["failed"] = [];
  const zones = page.regions.flatMap((region) => {
    if (!wanted.has(region.id)) return [];
    const text = region.reading.clean.trim();
    if (!text) {
      failed.push({ regionId: region.id, error: "Cette zone n’a pas de texte d’origine à traduire." });
      return [];
    }
    if (text.length > AI_LIMITS.text) {
      failed.push({ regionId: region.id, error: `Texte trop long pour un appel (${AI_LIMITS.text} caractères au plus).` });
      return [];
    }
    return [{ id: region.id, kind: region.kind, text }];
  });
  if (zones.length === 0) throw new Error(failed[0]?.error ?? "Aucune zone à traduire.");

  const model = await resolveModel("translation", chapter, requested);
  const prompt = translationPrompt({
    source: chapter.settings.sourceLanguage,
    target: chapter.settings.targetLanguage,
    format: chapter.settings.format,
    zones,
    context: contextOf(page, wanted),
    glossary: Array.isArray(folder.glossary) ? folder.glossary : [],
  });
  const zoneIds = zones.map((zone) => zone.id);
  const service = await palette();
  const outcome = await guard().run({
    action: "translation",
    ref: model,
    providerLabel: model.providerLabel,
    key: requestKey("translation", model, PROMPT_VERSION, prompt),
    sent: "text",
    size: prompt.length,
    pageId: page.id,
    regionIds: zoneIds,
    // La réponse est contrôlée avant d'entrer au cache : une réponse inexploitable n'y reste pas.
    send: async (signal) => {
      let translations: Map<string, string>;
      try {
        translations = parseTranslations(await service.completeText(model, prompt, signal), zoneIds);
      } catch (error) {
        if (error instanceof AiCallError) throw error;
        throw new AiCallError("refused", error instanceof Error ? error.message : "Réponse inexploitable.");
      }
      if (translations.size === 0) throw new AiCallError("refused", "Le modèle n’a rendu aucune traduction.");
      return JSON.stringify([...translations]);
    },
  });

  const translations = new Map(JSON.parse(outcome.value) as [string, string][]);
  const results: AiTranslationProposal["results"] = [];
  for (const id of zoneIds) {
    const text = translations.get(id);
    if (text) results.push({ regionId: id, text });
    else failed.push({ regionId: id, error: "Le modèle n’a rien rendu pour cette zone." });
  }
  return { results, failed, trace: outcome.trace };
}

// ─── Traduire la page entière ────────────────────────────────────

const RESULT_EXTENSIONS: Record<string, AssetExtension> = { png: "png", jpeg: "jpg", webp: "webp" };
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

const freshVersionId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join("");

/** Version telle que l'atelier la reçoit : avec l'adresse de son image, servie avec la session. */
function withUrl(version: AiPageVersion): AiPageVersion {
  return { ...version, url: assetUrl(version.file) };
}

/** Les versions d'une page traduites par IA, de la plus ancienne à la plus récente. */
export async function listAiPageVersions(pageId: unknown): Promise<AiPageVersion[]> {
  return (requirePage(pageId).aiVersions ?? []).filter((version) => assetExists(version.file)).map(withUrl);
}

/**
 * Traduit la page entière par un moteur d'image (§ 6.8). La page d'origine
 * part chez le moteur ; ce qu'il rend est gardé comme une version, à côté du
 * travail de l'atelier : ni les zones ni l'export ne sont touchés, et la
 * révision de la page ne bouge pas.
 */
export async function askAiPage(pageId: unknown, options?: unknown): Promise<AiPageVersion> {
  const { model: requested } = optionsOf(options);
  const page = requirePage(pageId);
  const chapter = requireChapter(page.chapterId);
  assertLevel(chapter);
  const model = await resolveModel("page", chapter, requested);

  let sent: Buffer;
  try {
    sent = await sharp(await readSource(page), { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize({ width: AI_LIMITS.pageSide, height: AI_LIMITS.pageSide, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch (error) {
    if (error instanceof Error && error.message.includes("introuvable")) throw error;
    throw new Error("L’image de cette page n’a pas pu être préparée pour l’envoi.");
  }

  const prompt = pagePrompt(chapter.settings.sourceLanguage, chapter.settings.targetLanguage);
  const key = requestKey("page", model, PROMPT_VERSION, prompt, sent);
  const existing = (candidate: string) => (readPage(page.id)?.aiVersions ?? []).find((version) => version.id === candidate && assetExists(version.file));

  // Refusé avant tout envoi : une page ne garde que quelques versions, et aucune n'est effacée d'office.
  if ((page.aiVersions ?? []).length >= AI_LIMITS.versions) {
    throw new Error(`Cette page garde déjà ${AI_LIMITS.versions} versions traduites par IA : supprimez-en une avant d’en demander une autre.`);
  }
  const service = await palette();
  const outcome = await guard().run({
    action: "page",
    ref: model,
    providerLabel: model.providerLabel,
    key,
    sent: "page",
    size: sent.byteLength,
    pageId: page.id,
    regionIds: [],
    stillValid: (versionId) => existing(versionId) !== undefined,
    send: async (signal) => {
      const rendered = await service.editImage(model, prompt, { b64: sent.toString("base64"), mimeType: "image/png" }, page.source, signal);
      const bytes = Buffer.from(rendered.b64, "base64");
      let info: { format?: string; width?: number; height?: number };
      try {
        info = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).metadata();
      } catch {
        throw new AiCallError("refused", "Le moteur a rendu autre chose qu’une image.");
      }
      const extension = RESULT_EXTENSIONS[info.format ?? ""];
      if (!extension || !info.width || !info.height) throw new AiCallError("refused", "Le moteur a rendu une image dans un format inattendu.");

      const file = newAssetName(extension);
      fs.writeFileSync(/* turbopackIgnore: true */ assetPath(file), bytes);
      const version: AiPageVersion = {
        id: freshVersionId(),
        file,
        width: info.width,
        height: info.height,
        promptVersion: PROMPT_VERSION,
        trace: { action: "page", provider: model.provider, model: model.model, at: Date.now(), sent: "page" },
      };
      // Relue juste avant d'écrire : l'atelier a pu enregistrer la page pendant l'appel.
      const current = requirePage(page.id);
      writePage({ ...current, aiVersions: [...(current.aiVersions ?? []), version] });
      return version.id;
    },
  });

  const version = existing(outcome.value);
  if (!version) throw new Error("La version rendue par le moteur est introuvable.");
  return withUrl({ ...version, trace: { ...version.trace, ...(outcome.trace.cached ? { cached: true } : {}) } });
}

/** Supprime une version traduite par IA, et son image si rien d'autre ne s'en sert. */
export async function deleteAiPageVersion(pageId: unknown, versionId: unknown): Promise<{ deleted: boolean }> {
  const page = requirePage(pageId);
  const version = isId(versionId) ? (page.aiVersions ?? []).find((entry) => entry.id === versionId) : undefined;
  if (!version) throw new Error("Version introuvable.");
  const remaining = (page.aiVersions ?? []).filter((entry) => entry.id !== version.id);
  const next: ScanPage = { ...page };
  if (remaining.length > 0) next.aiVersions = remaining;
  else delete next.aiVersions;
  writePage(next);
  if (!referencedAssets().has(version.file)) removeAsset(version.file);
  return { deleted: true };
}
