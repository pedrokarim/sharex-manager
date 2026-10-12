/**
 * Interpréteur des pistes d'images clés.
 *
 * Une seule fonction lit tous les préréglages : `sampleTracks` rend l'état
 * d'un élément à un avancement donné, `stateForUnit` celui d'une unité de
 * texte (ligne, mot, lettre) avec son décalage. Tout est pur et ne dépend que
 * de ses arguments : l'aperçu et l'export tombent sur les mêmes valeurs, et
 * le « hasard » est tiré d'un générateur initialisé par l'élément.
 */

import { mixColors } from "./color";
import { resolveEase } from "./easing";
import type {
  ClipInsets,
  EaseSpec,
  Keyframe,
  KeyframeValue,
  MotionDirection,
  MotionEffect,
  MotionGrid,
  MotionLayer,
  MotionParamValues,
  MotionPreset,
  MotionProperty,
  MotionState,
  MotionUnit,
} from "./types";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

type NumericProperty = Exclude<MotionProperty, "clip" | "color">;

/** Valeurs de repos : une propriété à son repos ne change rien au dessin. */
const REST_VALUES: Record<NumericProperty, number> = {
  opacity: 1,
  x: 0,
  y: 0,
  dx: 0,
  dy: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
  skewX: 0,
  blur: 0,
  brightness: 1,
  reveal: 1,
  wipe: 1,
  tracking: 0,
  mask: 1,
};

const REST_KEYS = Object.keys(REST_VALUES) as NumericProperty[];

const REST_CLIP: ClipInsets = [0, 0, 0, 0];

/** État de repos, neuf à chaque appel (la découpe est un tableau). */
export function restState(unit: MotionUnit = "frame"): MotionState {
  return { ...REST_VALUES, clip: [0, 0, 0, 0], unit };
}

/**
 * Remet un état existant au repos, sans rien allouer : le dessin d'un texte
 * découpé réutilise les mêmes états d'une image à l'autre. La découpe n'est
 * remplacée que si elle n'est pas déjà nulle (personne ne la modifie en place).
 */
function resetState(state: MotionState, unit: MotionUnit): MotionState {
  for (const key of REST_KEYS) state[key] = REST_VALUES[key];
  const clip = state.clip;
  if (!clip || clip[0] || clip[1] || clip[2] || clip[3]) state.clip = [0, 0, 0, 0];
  state.color = undefined;
  state.maskShape = undefined;
  state.origin = undefined;
  state.unit = unit;
  return state;
}

/** Vrai si l'état ne change rien au dessin de l'élément. */
export function isRestState(state: MotionState): boolean {
  for (const key of REST_KEYS) {
    if (state[key] !== REST_VALUES[key]) return false;
  }
  const clip = state.clip;
  return !clip[0] && !clip[1] && !clip[2] && !clip[3] && state.color === undefined;
}

/** Unité de `x`, `y` et `blur` : « em » pour un texte découpé, le cadre sinon. */
export function presetUnit(preset: MotionPreset): MotionUnit {
  if (preset.units) return preset.units;
  return preset.split && preset.split !== "whole" ? "em" : "frame";
}

/** Ce que l'interpréteur sait de l'élément animé. */
export interface MotionContext {
  /** Couleur propre de l'élément, que désigne `currentColor` dans une piste. */
  baseColor?: string;
}

// ─── Pistes ──────────────────────────────────────────────────────

/**
 * Images clés triées et complétées par le repos aux bornes (images clés
 * implicites, comme en CSS). Gardées en cache par piste : un préréglage est
 * une donnée figée.
 */
const normalized = new WeakMap<Keyframe[], Keyframe[]>();

function restValue(property: MotionProperty): KeyframeValue {
  if (property === "clip") return REST_CLIP;
  if (property === "color") return "currentColor";
  return REST_VALUES[property];
}

function normalizeTrack(property: MotionProperty, keyframes: Keyframe[]): Keyframe[] {
  return normalizeKeyframes(keyframes, restValue(property));
}

function normalizeKeyframes(keyframes: Keyframe[], rest: KeyframeValue): Keyframe[] {
  const cached = normalized.get(keyframes);
  if (cached) return cached;
  const sorted = keyframes
    .filter((frame) => Number.isFinite(frame.at))
    .map((frame) => ({ ...frame, at: clamp01(frame.at) }))
    .sort((a, b) => a.at - b.at);
  if (sorted.length > 0) {
    if (sorted[0].at > 0) sorted.unshift({ at: 0, value: rest });
    if (sorted[sorted.length - 1].at < 1) sorted.push({ at: 1, value: rest });
  }
  normalized.set(keyframes, sorted);
  return sorted;
}

/**
 * Valeur d'une piste numérique hors d'un préréglage d'élément : caméra,
 * transitions, effets de plan. Même lecture que les pistes d'un élément
 * (images clés implicites au repos, courbe par segment, dépassement gardé).
 */
export function sampleKeyframes(
  keyframes: Keyframe[] | undefined,
  progress: number,
  rest: number,
  defaultEase?: EaseSpec
): number {
  if (!keyframes || keyframes.length === 0) return rest;
  const track = normalizeKeyframes(keyframes, rest);
  if (track.length === 1) return asNumber(track[0].value, rest);
  const p = Number.isFinite(progress) ? clamp01(progress) : 1;
  const { from, to, eased } = locate(track, p, defaultEase);
  const a = asNumber(from.value, rest);
  const b = asNumber(to.value, rest);
  const value = eased === 0 ? a : eased === 1 ? b : a + (b - a) * eased;
  return Number.isFinite(value) ? value : rest;
}

/** Segment de la piste qui contient `progress`, et l'avancement adouci dans ce segment. */
function locate(track: Keyframe[], progress: number, defaultEase: MotionPreset["ease"]) {
  // Plusieurs images clés au même instant : la dernière l'emporte (saut franc).
  let index = 1;
  while (index < track.length - 1 && track[index].at <= progress) index++;
  const from = track[index - 1];
  const to = track[index];
  if (progress <= from.at) return { from, to, eased: 0 };
  const span = to.at - from.at;
  if (span <= 0 || progress >= to.at) return { from, to, eased: 1 };
  const local = (progress - from.at) / span;
  return { from, to, eased: resolveEase(to.ease ?? defaultEase)(local) };
}

function asNumber(value: KeyframeValue, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asClip(value: KeyframeValue): ClipInsets {
  if (Array.isArray(value) && value.length === 4 && value.every(Number.isFinite)) return value;
  return REST_CLIP;
}

function asColor(value: KeyframeValue, context: MotionContext): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.trim().toLowerCase() === "currentcolor") return context.baseColor;
  return value;
}

function sampleInto(
  state: MotionState,
  property: MotionProperty,
  keyframes: Keyframe[],
  progress: number,
  preset: MotionPreset,
  context: MotionContext
) {
  const track = normalizeTrack(property, keyframes);
  if (track.length === 0) return;
  if (track.length === 1) {
    assignValue(state, property, track[0].value, track[0].value, 0, context);
    return;
  }
  const { from, to, eased } = locate(track, progress, preset.ease);
  assignValue(state, property, from.value, to.value, eased, context);
}

function assignValue(
  state: MotionState,
  property: MotionProperty,
  from: KeyframeValue,
  to: KeyframeValue,
  t: number,
  context: MotionContext
) {
  if (property === "color") {
    const a = asColor(from, context);
    const b = asColor(to, context);
    // Sans la couleur de l'élément, on ne sait pas mélanger : l'élément garde la sienne.
    state.color = a === undefined || b === undefined ? undefined : t <= 0 ? a : t >= 1 ? b : mixColors(a, b, t);
    return;
  }
  if (property === "clip") {
    const a = asClip(from);
    const b = asClip(to);
    state.clip = [0, 1, 2, 3].map((side) => (t === 0 ? a[side] : t === 1 ? b[side] : a[side] + (b[side] - a[side]) * t)) as ClipInsets;
    return;
  }
  const rest = REST_VALUES[property];
  const a = asNumber(from, rest);
  const b = asNumber(to, rest);
  // Écrit `a + (b - a) * t` et non une moyenne pondérée : c'est la forme
  // qui redonne exactement les valeurs des animations historiques. Les
  // bornes sont rendues telles quelles, mais une courbe qui dépasse (recul,
  // rebond) garde son dépassement : on ne borne pas `t`.
  const value = t === 0 ? a : t === 1 ? b : a + (b - a) * t;
  state[property] = Number.isFinite(value) ? value : rest;
}

// ─── Réglages ────────────────────────────────────────────────────

const DIRECTIONS: MotionDirection[] = ["right", "down", "left", "up"];

/** Quart de tour dans le sens des aiguilles d'une montre (l'axe y descend). */
function quarterTurns(x: number, y: number, turns: number): [number, number] {
  let a = x;
  let b = y;
  for (let i = 0; i < turns; i++) [a, b] = [b === 0 ? 0 : -b, a];
  return [a, b];
}

function applyParams(state: MotionState, preset: MotionPreset, params: MotionParamValues | undefined) {
  if (!preset.params) return;
  for (const param of preset.params) {
    const chosen = params?.[param.id];
    if (param.kind === "amount") {
      const raw = typeof chosen === "number" && Number.isFinite(chosen) ? chosen : param.default;
      const amount = Math.min(param.max, Math.max(param.min, raw));
      if (amount === 1) continue;
      // L'intensité étire l'écart au repos ; c'est linéaire, donc équivalent à
      // étirer chaque image clé.
      for (const property of param.affects) {
        if (property === "color") continue;
        if (property === "clip") {
          state.clip = state.clip.map((side) => side * amount) as ClipInsets;
          continue;
        }
        const rest = REST_VALUES[property];
        state[property] = rest + (state[property] - rest) * amount;
      }
    } else {
      const direction = typeof chosen === "string" && DIRECTIONS.includes(chosen as MotionDirection)
        ? (chosen as MotionDirection)
        : param.default;
      const turns = (DIRECTIONS.indexOf(direction) - DIRECTIONS.indexOf(param.default) + 4) % 4;
      if (turns === 0) continue;
      // Les décalages en part du cadre tournent tels quels : 12 % de la
      // largeur deviennent 12 % de la hauteur.
      [state.x, state.y] = quarterTurns(state.x, state.y, turns);
      [state.dx, state.dy] = quarterTurns(state.dx, state.dy, turns);
    }
  }
}

// ─── Échantillonnage ─────────────────────────────────────────────

/** Propriétés animées d'un préréglage, lues une fois (un préréglage est figé). */
const trackKeys = new WeakMap<MotionPreset["tracks"], MotionProperty[]>();

function propertiesOf(tracks: MotionPreset["tracks"]): MotionProperty[] {
  let keys = trackKeys.get(tracks);
  if (!keys) {
    keys = Object.keys(tracks) as MotionProperty[];
    trackKeys.set(tracks, keys);
  }
  return keys;
}

function sampleForward(
  preset: MotionPreset,
  progress: number,
  params: MotionParamValues | undefined,
  context: MotionContext,
  into?: MotionState
): MotionState {
  const unit = presetUnit(preset);
  const state = into ? resetState(into, unit) : restState(unit);
  const p = Number.isFinite(progress) ? clamp01(progress) : 1;
  for (const property of propertiesOf(preset.tracks)) {
    const keyframes = preset.tracks[property];
    if (keyframes) sampleInto(state, property, keyframes, p, preset, context);
  }
  applyParams(state, preset, params);
  if (preset.mask) state.maskShape = preset.mask;
  if (preset.origin) state.origin = preset.origin;
  return state;
}

/**
 * État d'un élément à l'avancement `progress` (0 au début de l'animation, 1
 * à la fin), toutes pistes lues. Un préréglage joué à rebours est lu de 1
 * vers 0.
 */
export function sampleTracks(
  preset: MotionPreset,
  progress: number,
  params?: MotionParamValues,
  context: MotionContext = {}
): MotionState {
  return sampleForward(preset, preset.reversed ? 1 - progress : progress, params, context);
}

/** Effet actif à un avancement, et son propre avancement dans sa fenêtre. */
export interface ActiveEffect {
  effect: MotionEffect;
  progress: number;
}

/** Effets (étape A4) dont la fenêtre contient l'avancement. */
export function effectsAt(preset: MotionPreset, progress: number): ActiveEffect[] {
  if (!preset.effects) return [];
  const p = clamp01(preset.reversed ? 1 - progress : progress);
  const active: ActiveEffect[] = [];
  for (const effect of preset.effects) {
    const from = clamp01(effect.from ?? 0);
    const to = clamp01(effect.to ?? 1);
    if (p < from || p > to) continue;
    active.push({ effect, progress: to > from ? (p - from) / (to - from) : 1 });
  }
  return active;
}

// ─── Hasard reproductible ────────────────────────────────────────

/** Empreinte 32 bits d'une chaîne, point de départ du générateur. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Générateur pseudo-aléatoire à 32 bits : même graine, même suite, sur
 * toutes les machines. Rend des nombres dans [0, 1).
 */
export function createRandom(seed: string | number): () => number {
  let state = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Nombre tiré pour une unité : l'identifiant de l'élément et le rang de
 * l'unité suffisent à le retrouver. `salt` sépare plusieurs tirages d'une
 * même unité (brouillage, secousse…).
 */
export function unitRandom(seed: string, index: number, salt = ""): number {
  return createRandom(`${seed}#${index}#${salt}`)();
}

/** Ordres aléatoires déjà tirés, par élément et nombre d'unités. */
const shuffles = new Map<string, number[]>();
const MAX_SHUFFLES = 256;

/** Rang de départ de chaque unité, dans un ordre mélangé et reproductible. */
function shuffledRanks(seed: string, count: number): number[] {
  const key = `${seed}#${count}`;
  const cached = shuffles.get(key);
  if (cached) return cached;
  const random = createRandom(key);
  const order = Array.from({ length: count }, (_, index) => index);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const ranks = new Array<number>(count);
  order.forEach((unit, rank) => (ranks[unit] = rank));
  if (shuffles.size >= MAX_SHUFFLES) shuffles.delete(shuffles.keys().next().value!);
  shuffles.set(key, ranks);
  return ranks;
}

// ─── Unités décalées ─────────────────────────────────────────────

/** Place d'une unité dans la phase : départ et durée, en part de la phase. */
export interface UnitTiming {
  delay: number;
  span: number;
}

/**
 * Départ et durée d'une unité. Toutes les unités tiennent dans la phase :
 * la dernière finit avec elle. Les durées du préréglage donnent les
 * proportions (une unité de 600 ms décalée de 50 ms), la durée choisie dans
 * l'inspecteur donne l'échelle ; ainsi les décalages restent bornés à la
 * durée de l'élément, quelle que soit la longueur du texte.
 */
export function unitTiming(preset: MotionPreset, index: number, count: number, seed: string): UnitTiming {
  const stagger = preset.stagger;
  if (!stagger || count <= 1 || stagger.eachMs <= 0) return { delay: 0, span: 1 };
  const unitMs = Math.max(1, preset.durationMs);
  const total = unitMs + stagger.eachMs * (count - 1);
  const span = unitMs / total;
  const last = count - 1;
  const position = Math.min(last, Math.max(0, index));
  let rank: number;
  switch (stagger.from) {
    case "end":
      rank = (last - position) / last;
      break;
    case "center":
      rank = Math.abs(position - last / 2) / (last / 2);
      break;
    case "random":
      rank = shuffledRanks(seed, count)[position] / last;
      break;
    default:
      rank = position / last;
  }
  const spread = clamp01(resolveEase(stagger.ease)(rank));
  return { delay: spread * (1 - span), span };
}

export interface UnitOptions {
  params?: MotionParamValues;
  context?: MotionContext;
  /**
   * État à remplir au lieu d'en créer un : le dessin d'un texte découpé
   * garde ses états d'une image à l'autre, sans allocation par unité.
   */
  into?: MotionState;
}

const NO_CONTEXT: MotionContext = {};

/**
 * État de l'unité `index` (sur `count`) à l'image `localFrame` d'une phase de
 * `frames` images. `seed` est l'identifiant de l'élément : il fixe l'ordre
 * « au hasard ». Le découpage du texte est dans `text-layout.ts`, le dessin
 * par unité dans `render.ts`.
 *
 * Même convention que `animStateAt` : la dernière image de la phase est à
 * l'avancement 1.
 */
export function stateForUnit(
  preset: MotionPreset,
  index: number,
  count: number,
  localFrame: number,
  frames: number,
  seed: string,
  options: UnitOptions = {}
): MotionState {
  const progress = unitProgress(preset, index, count, localFrame, frames, seed);
  return sampleForward(preset, progress, options.params, options.context ?? NO_CONTEXT, options.into);
}

/**
 * Avancement propre d'une unité ou d'un carreau, dans le sens des pistes
 * (0 au départ de l'animation écrite, 1 à son arrivée), à l'image
 * `localFrame` d'une phase. Le brouillage d'une lettre, par exemple, cesse
 * quand son avancement atteint le seuil de l'effet.
 */
export function unitProgress(
  preset: MotionPreset,
  index: number,
  count: number,
  localFrame: number,
  frames: number,
  seed: string
): number {
  const phase = clamp01((localFrame + 1) / Math.max(1, frames));
  // À rebours, c'est la phase entière qui se rejoue à l'envers : la dernière
  // unité entrée part la première.
  const forward = preset.reversed ? 1 - phase : phase;
  const { delay, span } = preset.grid ? tileTiming(preset, preset.grid, index, seed) : unitTiming(preset, index, count, seed);
  return clamp01((forward - delay) / span);
}

/**
 * Durée naturelle d'une phase, en images : une unité plus les décalages.
 * Sert à proposer une durée quand on pose un préréglage sur un texte.
 */
export function naturalFrames(preset: MotionPreset, count: number, fps: number): number {
  const stagger = preset.stagger && count > 1 ? preset.stagger.eachMs * (count - 1) : 0;
  return Math.max(1, Math.round(((preset.durationMs + stagger) / 1000) * fps));
}

// ─── Grilles ─────────────────────────────────────────────────────

/** Rangs de départ déjà calculés, par grille. */
const gridRankCache = new Map<string, number[]>();

/**
 * Rang de départ de chaque carreau d'une grille, de 0 (le premier parti) à
 * 1 (le dernier), selon l'ordre demandé. Les carreaux sont numérotés ligne
 * après ligne, de gauche à droite.
 */
export function gridRanks(grid: MotionGrid, seed: string): number[] {
  const columns = Math.max(1, Math.round(grid.columns));
  const rows = Math.max(1, Math.round(grid.rows));
  const key = `${columns}x${rows}:${grid.order}:${grid.order === "random" ? seed : ""}`;
  const cached = gridRankCache.get(key);
  if (cached) return cached;
  const count = columns * rows;
  const cx = (columns - 1) / 2;
  const cy = (rows - 1) / 2;
  const column = (i: number) => i % columns;
  const row = (i: number) => Math.floor(i / columns);
  let raw: number[];
  switch (grid.order) {
    case "columns":
      // Colonne après colonne, un léger décalage de haut en bas dans chacune.
      raw = Array.from({ length: count }, (_, i) => column(i) + (row(i) / rows) * 0.25);
      break;
    case "diagonal":
      raw = Array.from({ length: count }, (_, i) => column(i) + row(i));
      break;
    case "center":
      // Anneaux carrés : le centre, puis le carré qui l'entoure, et ainsi de suite.
      raw = Array.from({ length: count }, (_, i) => Math.max(Math.abs(column(i) - cx), Math.abs(row(i) - cy)));
      break;
    case "spiral":
      raw = spiralOrder(columns, rows);
      break;
    case "random":
      raw = shuffledRanks(`${seed}#grid`, count).slice();
      break;
    default:
      // Lignes de haut en bas, un léger décalage de gauche à droite dans chacune.
      raw = Array.from({ length: count }, (_, i) => row(i) + (column(i) / columns) * 0.25);
  }
  const min = Math.min(...raw);
  const max = Math.max(...raw);
  const ranks = raw.map((value) => (max > min ? (value - min) / (max - min) : 0));
  if (gridRankCache.size >= MAX_SHUFFLES) gridRankCache.delete(gridRankCache.keys().next().value!);
  gridRankCache.set(key, ranks);
  return ranks;
}

/** Ordre d'une spirale qui part du centre et tourne vers l'extérieur. */
function spiralOrder(columns: number, rows: number): number[] {
  const order = new Array<number>(columns * rows).fill(-1);
  const directions: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let x = Math.floor((columns - 1) / 2);
  let y = Math.floor((rows - 1) / 2);
  let rank = 0;
  const visit = () => {
    if (x >= 0 && x < columns && y >= 0 && y < rows && order[y * columns + x] < 0) order[y * columns + x] = rank++;
  };
  visit();
  for (let step = 1, turn = 0; rank < columns * rows && step <= 2 * (columns + rows); step++) {
    for (let repeat = 0; repeat < 2; repeat++, turn++) {
      const [dx, dy] = directions[turn % 4];
      for (let i = 0; i < step; i++) {
        x += dx;
        y += dy;
        visit();
      }
    }
  }
  return order;
}

/** Nombre d'intervalles entre le premier et le dernier départ : rangs distincts, moins un. */
function distinctSteps(ranks: number[]): number {
  return Math.max(1, new Set(ranks.map((rank) => Math.round(rank * 1e6))).size - 1);
}

/**
 * Départ et durée d'un carreau : comme `unitTiming`, avec le rang que donne
 * l'ordre de la grille. Le dernier carreau finit avec la phase.
 */
export function tileTiming(preset: MotionPreset, grid: MotionGrid, index: number, seed: string): UnitTiming {
  const count = Math.max(1, Math.round(grid.columns)) * Math.max(1, Math.round(grid.rows));
  const stagger = preset.stagger;
  if (!stagger || count <= 1 || stagger.eachMs <= 0) return { delay: 0, span: 1 };
  const ranks = gridRanks(grid, seed);
  const unitMs = Math.max(1, preset.durationMs);
  const total = unitMs + stagger.eachMs * distinctSteps(ranks);
  const span = unitMs / total;
  const rank = ranks[Math.min(count - 1, Math.max(0, index))] ?? 0;
  const spread = clamp01(resolveEase(stagger.ease)(rank));
  return { delay: spread * (1 - span), span };
}

/** Nombre de carreaux d'une grille. */
export function tileCount(grid: MotionGrid): number {
  return Math.max(1, Math.round(grid.columns)) * Math.max(1, Math.round(grid.rows));
}

/** Durée naturelle d'une phase en grille, en images : un carreau plus les décalages. */
export function naturalGridFrames(preset: MotionPreset, fps: number): number {
  if (!preset.grid || !preset.stagger) return naturalFrames(preset, 1, fps);
  const steps = distinctSteps(gridRanks(preset.grid, ""));
  return Math.max(1, Math.round(((preset.durationMs + preset.stagger.eachMs * steps) / 1000) * fps));
}

// ─── Calques secondaires ─────────────────────────────────────────

/** Préréglage taillé pour chaque calque, gardé : un calque est figé. */
const layerPresets = new WeakMap<MotionLayer, MotionPreset>();

function layerPreset(preset: MotionPreset, layer: MotionLayer): MotionPreset {
  let cached = layerPresets.get(layer);
  if (!cached) {
    cached = {
      id: `${preset.id}#${layer.kind}`,
      label: preset.label,
      category: preset.category,
      phase: preset.phase,
      target: preset.target,
      durationMs: preset.durationMs,
      ease: preset.ease,
      units: "frame",
      tracks: layer.tracks,
      origin: layer.origin,
    };
    layerPresets.set(layer, cached);
  }
  return cached;
}

/**
 * État d'un calque à l'avancement `progress` de la phase, le même que celui
 * de l'élément : un préréglage joué à rebours rejoue aussi ses calques à
 * rebours. Les réglages d'intensité ne s'y appliquent pas, un calque garde
 * sa forme.
 */
export function sampleLayer(
  preset: MotionPreset,
  layer: MotionLayer,
  progress: number,
  context: MotionContext = NO_CONTEXT
): MotionState {
  const p = Number.isFinite(progress) ? clamp01(progress) : 1;
  return sampleForward(layerPreset(preset, layer), preset.reversed ? 1 - p : p, undefined, context);
}

/**
 * Avancement d'une copie en retard dans une traîne : la copie de rang
 * `rank` (à partir de 1) part `rank × delay` après l'élément et le rejoint à
 * la fin de la phase, pour qu'aucune copie ne reste en arrière quand la phase
 * s'arrête.
 */
export function echoProgress(progress: number, rank: number, delay: number): number {
  const lag = Math.min(0.95, Math.max(0, rank * delay));
  if (lag <= 0) return progress;
  return clamp01((progress - lag) / (1 - lag));
}
