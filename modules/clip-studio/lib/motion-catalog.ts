/**
 * Catalogue des animations proposées dans l'éditeur : filtrage par phase et
 * par type d'élément, recherche, rangement par catégorie et favoris.
 *
 * Tout est pur (le stockage des favoris est passé en argument) : le
 * sélecteur de l'inspecteur et le menu de la timeline lisent la même liste,
 * et les tests la vérifient sans navigateur.
 */

import { getPreset, listPresets } from "../engine/motion/registry";
import { suggestedAnimFrames } from "../engine/timeline";
import { MOTION_CATEGORY_LABELS } from "../engine/motion/types";
import type { MotionCategory, MotionPhase, MotionPreset, MotionSplit } from "../engine/motion/types";
import type { AnimKind, VisualItem } from "../engine/types";

/**
 * Phases du sélecteur. La mise en avant regroupe les préréglages joués une
 * fois (`emphasis`) et ceux qui bouclent (`loop`) : le moteur les lit tous
 * deux dans `animEmphasis`.
 */
export type PickerPhase = "in" | "out" | "emphasis";

export type PickerItemType = VisualItem["type"];

export const PICKER_PHASE_LABELS: Record<PickerPhase, string> = {
  in: "Entrée",
  out: "Sortie",
  emphasis: "Mise en avant",
};

/** Libellé de « aucune animation ». */
export const NO_ANIMATION_LABEL = "Aucune";

/** Ordre d'affichage des catégories : celui du registre des types. */
export const CATEGORY_ORDER = Object.keys(MOTION_CATEGORY_LABELS) as MotionCategory[];

const SPLIT_LABELS: Record<MotionSplit, string> = {
  whole: "bloc",
  line: "ligne par ligne",
  word: "mot par mot",
  char: "lettre par lettre",
};

/** Phases du registre lues par une phase du sélecteur, dans l'ordre de priorité du moteur. */
export function registryPhases(phase: PickerPhase): MotionPhase[] {
  return phase === "emphasis" ? ["emphasis", "loop"] : [phase];
}

/** Vrai si le préréglage découpe un texte (lignes, mots, lettres). */
export function isSplitPreset(preset: MotionPreset): boolean {
  return preset.split !== undefined && preset.split !== "whole";
}

/** Vrai si le préréglage peut se poser sur ce type d'élément. */
export function fitsItemType(preset: MotionPreset, itemType: PickerItemType): boolean {
  // Un texte découpé n'a de sens que sur un texte, quelle que soit la cible déclarée.
  if (itemType !== "text" && isSplitPreset(preset)) return false;
  if (preset.target === "any") return true;
  if (itemType === "video") return preset.target === "image";
  return preset.target === itemType;
}

/**
 * Préréglages proposés pour une phase et un type d'élément, dans l'ordre
 * d'enregistrement. Seules les phases déclarées par chaque préréglage
 * comptent ; un identifiant présent dans deux phases lues (mise en avant et
 * boucle) n'apparaît qu'une fois, sous la phase que le moteur choisit.
 */
export function presetsFor(phase: PickerPhase, itemType: PickerItemType): MotionPreset[] {
  const seen = new Set<string>();
  const result: MotionPreset[] = [];
  for (const registryPhase of registryPhases(phase)) {
    for (const preset of listPresets({ phase: registryPhase })) {
      if (seen.has(preset.id) || !fitsItemType(preset, itemType)) continue;
      seen.add(preset.id);
      result.push(preset);
    }
  }
  return result;
}

/** Préréglage effectivement joué pour un identifiant et une phase (variante à rebours comprise). */
export function resolvePreset(kind: AnimKind | undefined, phase: PickerPhase): MotionPreset | undefined {
  if (!kind || kind === "none") return undefined;
  for (const registryPhase of registryPhases(phase)) {
    const preset = getPreset(kind, registryPhase);
    if (preset) return preset;
  }
  return undefined;
}

/** Nom affiché d'une animation, y compris « Aucune » et un identifiant inconnu. */
export function presetLabel(kind: AnimKind | undefined, phase: PickerPhase): string {
  if (!kind || kind === "none") return NO_ANIMATION_LABEL;
  return resolvePreset(kind, phase)?.label ?? `Inconnue (${kind})`;
}

/** Ligne secondaire d'un préréglage : sa catégorie, et son découpage pour un texte. */
export function presetDetail(preset: MotionPreset): string {
  const category = MOTION_CATEGORY_LABELS[preset.category] ?? preset.category;
  if (!isSplitPreset(preset)) return category;
  const split = SPLIT_LABELS[preset.split!];
  // « Lettre par lettre · lettre par lettre » n'apprendrait rien.
  return category.toLowerCase() === split ? category : `${category} · ${split}`;
}

// ─── Recherche ───────────────────────────────────────────────────

/** Texte comparable : minuscules, sans accents ni apostrophes typographiques. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Ce que la recherche lit d'un préréglage : nom, catégorie, découpage, identifiant. */
function haystackOf(preset: MotionPreset): string {
  const parts = [preset.label, MOTION_CATEGORY_LABELS[preset.category] ?? "", preset.id.replace(/-/g, " ")];
  if (preset.split) parts.push(SPLIT_LABELS[preset.split]);
  if (preset.split && preset.split !== "whole") parts.push("texte");
  return normalizeSearch(parts.join(" "));
}

/**
 * Filtre et classe par pertinence. Chaque mot de la recherche doit se
 * trouver quelque part (nom, catégorie, découpage, identifiant) ; le nom qui
 * commence par la recherche passe devant, puis le nom qui la contient, puis
 * le reste. À pertinence égale, l'ordre d'origine est gardé.
 */
export function searchPresets(presets: readonly MotionPreset[], query: string): MotionPreset[] {
  const needle = normalizeSearch(query);
  if (!needle) return [...presets];
  const words = needle.split(" ");
  const scored: { preset: MotionPreset; score: number; index: number }[] = [];
  presets.forEach((preset, index) => {
    const haystack = haystackOf(preset);
    if (!words.every((word) => haystack.includes(word))) return;
    const label = normalizeSearch(preset.label);
    const score = label.startsWith(needle) ? 0 : label.includes(needle) ? 1 : words.every((word) => label.includes(word)) ? 2 : 3;
    scored.push({ preset, score, index });
  });
  return scored.sort((a, b) => a.score - b.score || a.index - b.index).map((entry) => entry.preset);
}

// ─── Catégories ──────────────────────────────────────────────────

export interface PresetGroup {
  category: MotionCategory;
  label: string;
  presets: MotionPreset[];
}

/** Range par catégorie, dans l'ordre des catégories ; les catégories vides sont omises. */
export function groupByCategory(presets: readonly MotionPreset[]): PresetGroup[] {
  const groups = new Map<MotionCategory, MotionPreset[]>();
  for (const preset of presets) {
    const list = groups.get(preset.category);
    if (list) list.push(preset);
    else groups.set(preset.category, [preset]);
  }
  const ordered = CATEGORY_ORDER.filter((category) => groups.has(category));
  // Une catégorie ajoutée au moteur sans libellé reste visible, à la fin.
  for (const category of groups.keys()) if (!ordered.includes(category)) ordered.push(category);
  return ordered.map((category) => ({
    category,
    label: MOTION_CATEGORY_LABELS[category] ?? category,
    presets: groups.get(category)!,
  }));
}

// ─── Favoris ─────────────────────────────────────────────────────

/** Clé de stockage des favoris, propre au navigateur. */
export const FAVORITES_STORAGE_KEY = "clip-studio:motion-favorites";

/** Au-delà, les plus anciens favoris sont oubliés : la liste reste lisible. */
export const MAX_FAVORITES = 60;

/** Stockage minimal : `localStorage` ou un double de test. */
export type FavoritesStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * Lit une liste de favoris enregistrée. Une valeur abîmée (JSON invalide,
 * autre forme, entrées vides) donne la partie valable, jamais une erreur.
 */
export function parseFavorites(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (!id || id === "none" || result.includes(id)) continue;
    result.push(id);
  }
  return result.slice(-MAX_FAVORITES);
}

/** Ajoute ou retire un favori ; le dernier ajouté va en tête de liste. */
export function toggleFavorite(favorites: readonly string[], id: string): string[] {
  if (!id || id === "none") return [...favorites];
  if (favorites.includes(id)) return favorites.filter((entry) => entry !== id);
  return [id, ...favorites].slice(0, MAX_FAVORITES);
}

/** Lit les favoris d'une clé (celle des animations par défaut ; les transitions et la caméra ont la leur). */
export function readFavorites(storage: FavoritesStorage | null | undefined, key: string = FAVORITES_STORAGE_KEY): string[] {
  if (!storage) return [];
  try {
    return parseFavorites(storage.getItem(key));
  } catch {
    // Stockage bloqué (navigation privée, données effacées) : pas de favoris.
    return [];
  }
}

/** Enregistre les favoris ; rend faux si le stockage refuse (la liste reste valable en mémoire). */
export function writeFavorites(
  storage: FavoritesStorage | null | undefined,
  favorites: readonly string[],
  key: string = FAVORITES_STORAGE_KEY
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(favorites.slice(0, MAX_FAVORITES)));
    return true;
  } catch {
    return false;
  }
}

/** Favoris disponibles parmi les préréglages proposés, dans l'ordre des favoris. */
export function favoritePresets(presets: readonly MotionPreset[], favorites: readonly string[]): MotionPreset[] {
  const byId = new Map(presets.map((preset) => [preset.id, preset]));
  return favorites.map((id) => byId.get(id)).filter((preset): preset is MotionPreset => Boolean(preset));
}

// ─── Choix d'une animation ───────────────────────────────────────

/**
 * Modification d'un élément quand on lui choisit une animation. La durée
 * devient la durée naturelle du préréglage (pour un texte découpé, assez
 * pour que chaque unité joue avec son décalage), bornée à l'élément ; les
 * réglages repartent de leurs défauts, car chaque préréglage a les siens.
 * Une mise en avant commence à la fin de l'entrée, une fois, ou en boucle si
 * le préréglage est une boucle.
 */
export function pickPatch(item: VisualItem, phase: PickerPhase, kind: AnimKind, fps: number): Partial<VisualItem> {
  const naturalFrames = (current: number) => {
    const suggested = suggestedAnimFrames(item, kind, phase, fps);
    return Math.max(1, Math.min(suggested > 0 ? suggested : current, Math.max(1, item.duration)));
  };
  if (phase === "emphasis") {
    if (kind === "none") return { animEmphasis: undefined };
    const current = item.animEmphasis;
    const loops = resolvePreset(kind, "emphasis")?.phase === "loop";
    const inFrames = item.animIn.kind !== "none" ? item.animIn.frames : 0;
    return {
      animEmphasis: {
        kind,
        frames: naturalFrames(current?.frames ?? Math.round(fps * 0.6)),
        at: current?.at ?? inFrames,
        repeat: loops ? 0 : current?.repeat && current.repeat > 0 ? current.repeat : 1,
      },
    };
  }
  const key = phase === "in" ? "animIn" : "animOut";
  const current = item[key];
  if (kind === "none") return { [key]: { kind: "none", frames: current.frames } };
  return { [key]: { kind, frames: naturalFrames(current.frames) } };
}

// ─── Réglages ────────────────────────────────────────────────────

/**
 * Valeur d'un réglage : celle choisie si elle est valable, sinon le défaut
 * du préréglage. Lit aussi des réglages de formes futures (liste d'options,
 * plage numérique) sans les connaître.
 */
export function paramValue(param: LooseMotionParam, values: Record<string, unknown> | undefined): number | string | undefined {
  const chosen = values?.[param.id];
  const options = paramOptions(param);
  if (options) {
    return typeof chosen === "string" && options.includes(chosen) ? chosen : typeof param.default === "string" ? param.default : options[0];
  }
  if (typeof param.min === "number" && typeof param.max === "number") {
    const fallback = typeof param.default === "number" ? param.default : param.min;
    const raw = typeof chosen === "number" && Number.isFinite(chosen) ? chosen : fallback;
    return Math.min(param.max, Math.max(param.min, raw));
  }
  return typeof chosen === "number" || typeof chosen === "string" ? chosen : (param.default as number | string | undefined);
}

/**
 * Forme lâche d'un réglage : celles du moteur (`amount`, `direction`) et
 * celles qu'il pourra déclarer plus tard (ordre, unité de découpe…), lues
 * par leurs champs plutôt que par leur nom.
 */
export interface LooseMotionParam {
  id: string;
  kind: string;
  label: string;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly unknown[];
}

const DIRECTION_OPTIONS = ["up", "down", "left", "right"];

/** Options d'un réglage à choix, ou `null` pour un réglage numérique. */
export function paramOptions(param: LooseMotionParam): string[] | null {
  if (Array.isArray(param.options)) {
    const options = param.options.filter((option): option is string => typeof option === "string");
    if (options.length > 0) return options;
  }
  if (param.kind === "direction") return DIRECTION_OPTIONS;
  return null;
}

/** Retire les valeurs égales au défaut : un projet ne garde que ce qui change le rendu. */
export function compactParams(
  params: readonly LooseMotionParam[] | undefined,
  values: Record<string, number | string>
): Record<string, number | string> | undefined {
  const result: Record<string, number | string> = {};
  for (const param of params ?? []) {
    const value = values[param.id];
    if (value === undefined || value === param.default) continue;
    result[param.id] = value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
