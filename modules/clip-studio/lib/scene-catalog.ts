/**
 * Catalogue des transitions, des mouvements de caméra et des effets de plan
 * proposés dans l'éditeur : rangement par catégorie, recherche, libellés
 * (y compris d'un identifiant inconnu), et modifications d'un projet quand on
 * en choisit un ou qu'on pose, règle ou retire un effet de plan.
 *
 * Tout est pur : l'inspecteur, le menu de la timeline et les tests lisent la
 * même liste, tirée du moteur (`engine/motion/scenes.ts`).
 */

import {
  getShotFx,
  isKnownTransition,
  getTransition,
  listCameraMoves,
  listShotFx,
  listTransitions,
} from "../engine/motion/scenes";
import type { ShotEffect, Track, VisualItem } from "../engine/types";
import { normalizeSearch } from "./motion-catalog";

/** Les trois familles du catalogue de plans. */
export type SceneKind = "transition" | "camera" | "shotfx";

export interface SceneEntry {
  id: string;
  /** Nom affiché, celui du moteur. */
  label: string;
  category: string;
  categoryLabel: string;
  /** Durée conseillée ; 0 pour un mouvement qui couvre tout le plan. */
  durationMs: number;
}

export interface SceneGroup {
  category: string;
  label: string;
  entries: SceneEntry[];
}

interface CategoryDef {
  key: string;
  label: string;
  ids: readonly string[];
}

/** Catégorie des identifiants que le moteur ajoutera sans qu'on les range ici. */
export const OTHER_CATEGORY = { key: "other", label: "Autres" } as const;

/**
 * Catégories de chaque famille, dans l'ordre d'affichage. Un identifiant du
 * moteur absent d'ici va dans « Autres », à la fin : il reste proposé.
 */
export const SCENE_CATEGORIES: Record<SceneKind, readonly CategoryDef[]> = {
  transition: [
    { key: "fades", label: "Fondus", ids: ["fade", "fade-black", "fade-white", "blur"] },
    {
      key: "slides",
      label: "Glissements et poussées",
      ids: ["slide", "push-right", "push-up", "push-down", "cover-left", "uncover-left", "rise-bounce"],
    },
    {
      key: "wipes",
      label: "Balayages et formes",
      ids: ["wipe", "wipe-left", "wipe-down", "wipe-up", "wipe-bias", "iris", "iris-diamond", "doors", "clock", "blinds", "pixels", "ink"],
    },
    { key: "zooms", label: "Zooms et rotations", ids: ["zoom", "zoom-through", "zoom-back", "spin", "flip"] },
    { key: "fast", label: "Mouvements vifs", ids: ["whip", "whip-up", "drop", "squeeze"] },
    { key: "light", label: "Flashs et lumière", ids: ["flash", "light-leak"] },
  ],
  camera: [
    { key: "zooms", label: "Zooms", ids: ["zoom-in", "zoom-out", "pull-out", "zoom-twist"] },
    {
      key: "pans",
      label: "Panoramiques et travellings",
      ids: ["pan-left", "pan-right", "pan-up", "pan-down", "ken-burns", "ken-burns-out", "drift", "crane-up"],
    },
    { key: "impacts", label: "Impacts", ids: ["punch-zoom", "shake", "impact-shake", "roll-hit", "whip-in"] },
    { key: "mood", label: "Mise au point et ambiance", ids: ["focus-in", "handheld", "backdrop-blur"] },
  ],
  shotfx: [
    { key: "flashes", label: "Flashs et lumière", ids: ["impact-flash", "dark-flash", "exposure-pop"] },
    { key: "hits", label: "Secousses et zooms", ids: ["frame-shake", "impact-hit", "beat-zoom", "tilt-hit"] },
    { key: "color", label: "Couleur", ids: ["chroma-hit"] },
  ],
};

/** Ce que l'on montre pour « rien » : la coupe franche et l'image fixe. Pas d'équivalent pour un effet. */
export const SCENE_NONE_LABELS: Record<SceneKind, string | null> = {
  transition: "Coupe franche",
  camera: "Fixe",
  shotfx: null,
};

export const SCENE_KIND_LABELS: Record<SceneKind, { title: string; search: string; empty: string; more: string }> = {
  transition: {
    title: "Transition",
    search: "Rechercher une transition…",
    empty: "Aucune transition ne correspond.",
    more: "Plus de transitions…",
  },
  camera: {
    title: "Mouvement de caméra",
    search: "Rechercher un mouvement…",
    empty: "Aucun mouvement ne correspond.",
    more: "Plus de mouvements…",
  },
  shotfx: {
    title: "Effet de plan",
    search: "Rechercher un effet…",
    empty: "Aucun effet ne correspond.",
    more: "Tous les effets de plan…",
  },
};

/** Durée par défaut d'une transition sans préréglage connu, en secondes. */
export const DEFAULT_TRANSITION_SECONDS = 0.6;

function enginePresets(kind: SceneKind): { id: string; label: string; durationMs: number }[] {
  if (kind === "transition") return listTransitions();
  // « none » est un préréglage du moteur (« Fixe ») ; l'éditeur le montre comme l'entrée « rien ».
  if (kind === "camera") return listCameraMoves().filter((preset) => preset.id !== "none");
  return listShotFx();
}

const entriesCache = new Map<SceneKind, SceneEntry[]>();

/**
 * Entrées d'une famille, rangées dans l'ordre des catégories puis dans celui
 * de la catégorie. Les identifiants non rangés vont dans « Autres ».
 */
export function sceneEntries(kind: SceneKind): SceneEntry[] {
  const cached = entriesCache.get(kind);
  if (cached) return cached;
  const presets = new Map(enginePresets(kind).map((preset) => [preset.id, preset]));
  const result: SceneEntry[] = [];
  const placed = new Set<string>();
  for (const category of SCENE_CATEGORIES[kind]) {
    for (const id of category.ids) {
      const preset = presets.get(id);
      if (!preset || placed.has(id)) continue;
      placed.add(id);
      result.push({ id, label: preset.label, category: category.key, categoryLabel: category.label, durationMs: preset.durationMs });
    }
  }
  for (const preset of presets.values()) {
    if (placed.has(preset.id)) continue;
    result.push({
      id: preset.id,
      label: preset.label,
      category: OTHER_CATEGORY.key,
      categoryLabel: OTHER_CATEGORY.label,
      durationMs: preset.durationMs,
    });
  }
  entriesCache.set(kind, result);
  return result;
}

/** Entrée d'un identifiant, ou `undefined` s'il est inconnu (ou « none »). */
export function findSceneEntry(kind: SceneKind, id: string | undefined): SceneEntry | undefined {
  if (!id) return undefined;
  return sceneEntries(kind).find((entry) => entry.id === id);
}

/** Range par catégorie, dans l'ordre des entrées ; les catégories vides sont omises. */
export function groupSceneEntries(entries: readonly SceneEntry[]): SceneGroup[] {
  const groups: SceneGroup[] = [];
  const byKey = new Map<string, SceneGroup>();
  for (const entry of entries) {
    let group = byKey.get(entry.category);
    if (!group) {
      group = { category: entry.category, label: entry.categoryLabel, entries: [] };
      byKey.set(entry.category, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

/**
 * Filtre et classe par pertinence, comme la recherche d'animations : chaque
 * mot doit se trouver dans le nom, la catégorie ou l'identifiant ; le nom qui
 * commence par la recherche passe devant, puis celui qui la contient.
 */
export function searchSceneEntries(entries: readonly SceneEntry[], query: string): SceneEntry[] {
  const needle = normalizeSearch(query);
  if (!needle) return [...entries];
  const words = needle.split(" ");
  const scored: { entry: SceneEntry; score: number; index: number }[] = [];
  entries.forEach((entry, index) => {
    const haystack = normalizeSearch(`${entry.label} ${entry.categoryLabel} ${entry.id.replace(/-/g, " ")}`);
    if (!words.every((word) => haystack.includes(word))) return;
    const label = normalizeSearch(entry.label);
    const score = label.startsWith(needle) ? 0 : label.includes(needle) ? 1 : words.every((word) => label.includes(word)) ? 2 : 3;
    scored.push({ entry, score, index });
  });
  return scored.sort((a, b) => a.score - b.score || a.index - b.index).map((item) => item.entry);
}

// ─── Libellés ────────────────────────────────────────────────────

/** Nom d'une transition : « Coupe franche » sans transition, « Inconnue (…) » pour un identifiant inconnu. */
export function transitionLabel(kind: string | undefined | null): string {
  if (!kind || kind === "none") return SCENE_NONE_LABELS.transition!;
  return isKnownTransition(kind) ? getTransition(kind).label : `Inconnue (${kind})`;
}

/** Nom d'un mouvement de caméra : « Fixe » sans mouvement, « Inconnu (…) » pour un identifiant inconnu. */
export function cameraLabel(id: string | undefined | null): string {
  if (!id || id === "none") return SCENE_NONE_LABELS.camera!;
  return listCameraMoves().find((preset) => preset.id === id)?.label ?? `Inconnu (${id})`;
}

/** Nom d'un effet de plan, « Inconnu (…) » pour un identifiant inconnu. */
export function shotFxLabel(kind: string): string {
  return getShotFx(kind)?.label ?? `Inconnu (${kind || "?"})`;
}

/** Nom d'une entrée de n'importe quelle famille. */
export function sceneLabel(kind: SceneKind, id: string | undefined | null): string {
  if (kind === "transition") return transitionLabel(id);
  if (kind === "camera") return cameraLabel(id);
  return shotFxLabel(id ?? "");
}

/** Vrai si l'identifiant est « rien » ou désigne une entrée connue de la famille. */
export function isKnownScene(kind: SceneKind, id: string | undefined | null): boolean {
  if (!id || id === "none") return kind !== "shotfx";
  return Boolean(findSceneEntry(kind, id));
}

/** Durée affichée : « 0,6 s ». */
export function secondsText(ms: number): string {
  return `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} s`;
}

/** Ligne secondaire d'une entrée : sa catégorie, et sa durée conseillée quand elle en a une. */
export function sceneDetail(entry: SceneEntry, kind: SceneKind): string {
  if (kind === "camera" && entry.durationMs <= 0) return `${entry.categoryLabel} · tout le plan`;
  const preset = kind === "camera" ? listCameraMoves().find((item) => item.id === entry.id) : undefined;
  const suffix = preset?.timing === "loop" ? " en boucle" : preset?.timing === "start" ? " au début du plan" : "";
  return `${entry.categoryLabel} · ${secondsText(entry.durationMs)}${suffix}`;
}

// ─── Choix d'une transition ou d'un mouvement ────────────────────

/** Durée conseillée d'une transition, en images. */
export function advisedTransitionFrames(kind: string, fps: number): number {
  const ms = isKnownTransition(kind) ? getTransition(kind).durationMs : DEFAULT_TRANSITION_SECONDS * 1000;
  return Math.max(1, Math.round((ms / 1000) * fps));
}

/**
 * Modification d'un plan quand on lui choisit une transition. Une durée
 * réglée à la main est gardée ; une durée restée celle que conseillait la
 * transition précédente devient celle que conseille la nouvelle. Toujours
 * bornée à la durée du plan.
 */
export function transitionPatch(item: Pick<VisualItem, "transition" | "duration">, kind: string, fps: number): Pick<VisualItem, "transition"> {
  if (!kind || kind === "none") return { transition: undefined };
  const current = item.transition;
  let frames: number;
  if (!current || current.frames <= 0) frames = advisedTransitionFrames(kind, fps);
  else if (isKnownTransition(current.kind) && current.frames === advisedTransitionFrames(current.kind, fps)) {
    frames = advisedTransitionFrames(kind, fps);
  } else frames = current.frames;
  return { transition: { kind, frames: Math.max(1, Math.min(frames, Math.max(1, item.duration))) } };
}

/** Modification d'une image ou d'une vidéo quand on lui choisit un mouvement de caméra. */
export function cameraPatch(itemType: "image" | "video", id: string): { motion: string | undefined } {
  if (!id || id === "none") return { motion: itemType === "image" ? "none" : undefined };
  return { motion: id };
}

// ─── Effets de plan ──────────────────────────────────────────────

/** Bornes de la durée d'un effet de plan, en secondes. */
export const SHOT_FX_MIN_SECONDS = 0.1;
export const SHOT_FX_MAX_SECONDS = 3;

/** Durée naturelle d'un effet, en images ; un effet inconnu compte pour un tiers de seconde. */
export function shotFxNaturalFrames(kind: string, fps: number): number {
  const ms = getShotFx(kind)?.durationMs ?? 330;
  return Math.max(1, Math.round((ms / 1000) * fps));
}

/** Durée jouée d'un effet, en images : la sienne, ou celle de son préréglage (comme `shotFxAt`). */
export function shotEffectFrames(effect: ShotEffect, fps: number): number {
  return Math.max(1, Math.round(effect.frames || shotFxNaturalFrames(effect.kind, fps)));
}

function clampFrames(frames: number, fps: number): number {
  const min = Math.max(1, Math.round(SHOT_FX_MIN_SECONDS * fps));
  const max = Math.max(min, Math.round(SHOT_FX_MAX_SECONDS * fps));
  return Math.min(max, Math.max(min, Math.round(Number.isFinite(frames) ? frames : min)));
}

function clampAt(at: number): number {
  return Math.max(0, Math.round(Number.isFinite(at) ? at : 0));
}

/**
 * Ajoute un effet de plan à l'instant `at` (en images), à sa durée
 * naturelle. La liste rendue reste rangée par instant ; l'index du nouvel
 * effet est rendu pour pouvoir l'ouvrir aussitôt.
 */
export function addShotEffect(
  effects: readonly ShotEffect[] | undefined,
  kind: string,
  at: number,
  fps: number
): { effects: ShotEffect[]; index: number } {
  const effect: ShotEffect = { kind, at: clampAt(at), frames: clampFrames(shotFxNaturalFrames(kind, fps), fps) };
  const list = [...(effects ?? [])];
  let index = list.findIndex((other) => other.at > effect.at);
  if (index === -1) index = list.length;
  list.splice(index, 0, effect);
  return { effects: list, index };
}

/**
 * Règle un effet : identifiant, instant, durée. L'ordre de la liste ne change
 * pas, pour que l'effet ouvert reste le même pendant qu'on le règle. Changer
 * d'effet reprend la durée naturelle du nouveau si l'ancienne était la
 * naturelle de l'ancien. Un index hors de la liste la rend inchangée.
 */
export function updateShotEffect(
  effects: readonly ShotEffect[] | undefined,
  index: number,
  patch: Partial<ShotEffect>,
  fps: number
): ShotEffect[] {
  const list = [...(effects ?? [])];
  const current = list[index];
  if (!current) return list;
  const next: ShotEffect = { ...current };
  if (patch.kind !== undefined && patch.kind !== current.kind) {
    next.kind = patch.kind;
    if (patch.frames === undefined && shotEffectFrames(current, fps) === shotFxNaturalFrames(current.kind, fps)) {
      next.frames = clampFrames(shotFxNaturalFrames(patch.kind, fps), fps);
    }
  }
  if (patch.at !== undefined) next.at = clampAt(patch.at);
  if (patch.frames !== undefined) next.frames = clampFrames(patch.frames, fps);
  list[index] = next;
  return list;
}

/** Retire un effet ; `undefined` quand la piste n'en a plus (le projet n'en garde pas de trace). */
export function removeShotEffect(effects: readonly ShotEffect[] | undefined, index: number): ShotEffect[] | undefined {
  const list = (effects ?? []).filter((_, position) => position !== index);
  return list.length > 0 ? list : undefined;
}

/** Vrai si la piste peut recevoir des effets de plan : une piste visuelle non verrouillée. */
export function acceptsShotEffects(track: Pick<Track, "kind" | "locked">): boolean {
  return track.kind === "visual" && !track.locked;
}

// ─── Favoris ─────────────────────────────────────────────────────

/** Clé des favoris d'une famille : séparée de celle des animations, dont les identifiants se recoupent (« fade », « zoom »). */
export function sceneFavoritesKey(kind: SceneKind): string {
  return `clip-studio:scene-favorites:${kind}`;
}

/** Favoris disponibles parmi les entrées, dans l'ordre des favoris. */
export function favoriteSceneEntries(entries: readonly SceneEntry[], favorites: readonly string[]): SceneEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return favorites.map((id) => byId.get(id)).filter((entry): entry is SceneEntry => Boolean(entry));
}
