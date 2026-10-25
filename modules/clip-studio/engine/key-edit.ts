/**
 * Images clés posées à la main dans l'éditeur (dossier 01, illustrations,
 * étape I6).
 *
 * Une image clé du moteur est un mouvement : à partir de son instant `at`,
 * l'élément rejoint ses valeurs en `frames` images (`keys.ts`). Dans
 * l'éditeur, on pose une valeur à la tête de lecture : la clé créée y
 * **arrive**, son mouvement part `KEY_SECONDS` plus tôt. Ainsi, ce que l'on
 * voit à la tête de lecture est exactement ce que l'on vient de poser, et le
 * cadre de sélection suit l'élément au lieu de rester à son ancienne place.
 *
 * Sans « Animer », déplacer ou redimensionner un élément animé déplace tout
 * son mouvement : la position de départ et chaque clé glissent d'autant (et
 * les tailles changent dans la même proportion). Un élément sans image clé
 * change comme avant, par son seul `transform`.
 *
 * Fonctions pures, testées sous Node.
 */

import { keyedFrame } from "./keys";
import { MAX_MOVE_KEYS, type MoveKey, type Transform, type VisualItem } from "./types";

/** Durée par défaut du mouvement d'une image clé posée à la main. */
export const KEY_SECONDS = 0.6;

/** Valeurs du cadre qu'un geste de l'éditeur peut poser. */
export type Placement = Partial<Pick<Transform, "x" | "y" | "width" | "height" | "rotation" | "opacity">>;

const PLACED = ["x", "y", "width", "height", "rotation", "opacity"] as const;
type PlacedKey = (typeof PLACED)[number];

/** Nombre d'images du mouvement d'une clé, tel que le moteur le lit. */
export const keyFrames = (key: MoveKey) => Math.max(1, Math.round(key.frames));

/** Image, comptée depuis le début de l'élément, où une clé atteint ses valeurs. */
export const keyArrival = (key: MoveKey) => Math.round(key.at) + keyFrames(key);

export interface PlaceOptions {
  /** « Animer » : à un autre instant que le début, le geste pose une image clé. */
  animate: boolean;
  fps: number;
  /** Durée du mouvement d'une clé créée (`KEY_SECONDS` par défaut). */
  seconds?: number;
}

/**
 * Ce que devient l'élément quand on le pose à `next` à l'image `frame` du
 * projet : son `transform` et ses images clés. Les valeurs absentes de
 * `next` ne changent pas.
 *
 * - « Animer », ailleurs qu'à la première image : une clé qui arrive à la
 *   tête de lecture est créée, ou mise à jour si une clé y arrive déjà.
 * - « Animer », à la première image : la position de départ change, les
 *   clés gardent leurs cibles (l'élément part d'ailleurs, arrive au même
 *   endroit).
 * - Sans « Animer » : tout le mouvement suit (voir l'en-tête).
 */
export function placeAt(item: VisualItem, frame: number, next: Placement, options: PlaceOptions): Pick<VisualItem, "transform" | "keys"> {
  const local = Math.round(frame - item.start);
  const current = keyedFrame(item, frame).transform;
  const changed = PLACED.filter((property) => next[property] !== undefined && Number.isFinite(next[property]) && Math.abs(next[property]! - current[property]) > 1e-9);
  if (changed.length === 0) return { transform: item.transform, keys: item.keys };
  const values = Object.fromEntries(changed.map((property) => [property, next[property]])) as Placement;

  if (options.animate && local > 0 && local < item.duration) {
    const frames = Math.max(1, Math.min(local, Math.round((options.seconds ?? KEY_SECONDS) * options.fps)));
    return { transform: item.transform, keys: upsertKey(item.keys, local, values, frames) };
  }
  if (options.animate || !item.keys?.length) {
    return { transform: { ...item.transform, ...values }, keys: item.keys };
  }
  return retarget(item, current, values);
}

/** Tout le mouvement suit : décalage des positions et de la rotation, proportion des tailles. */
function retarget(item: VisualItem, current: Transform, values: Placement): Pick<VisualItem, "transform" | "keys"> {
  const map = (property: PlacedKey, value: number): number => {
    const target = values[property];
    if (target === undefined) return value;
    if (property === "width" || property === "height") {
      // Une taille nulle ne donne pas de proportion : la valeur demandée remplace celle de départ.
      return current[property] > 1e-9 ? value * (target / current[property]) : target;
    }
    const shifted = value + (target - current[property]);
    return property === "opacity" ? Math.min(1, Math.max(0, shifted)) : shifted;
  };
  const transform = { ...item.transform };
  for (const property of PLACED) transform[property] = map(property, item.transform[property]);
  const keys = item.keys?.map((key) => {
    const moved: MoveKey = { ...key };
    for (const property of PLACED) {
      const value = key[property];
      if (value !== undefined) moved[property] = map(property, value);
    }
    return moved;
  });
  return { transform, keys };
}

/**
 * Pose `values` sur la clé qui arrive à l'image `arrival` (comptée depuis le
 * début de l'élément), ou crée cette clé : un ressort sans rebond de
 * `frames` images qui finit à `arrival`.
 */
export function upsertKey(keys: MoveKey[] | undefined, arrival: number, values: Placement, frames: number): MoveKey[] {
  const list = [...(keys ?? [])];
  const index = list.findIndex((key) => keyArrival(key) === arrival);
  if (index !== -1) {
    list[index] = { ...list[index], ...values };
    return list;
  }
  if (list.length >= MAX_MOVE_KEYS) return list;
  const length = Math.max(1, Math.min(arrival, Math.round(frames)));
  list.push({ at: arrival - length, frames: length, ...values, ease: "spring" });
  return list.sort((a, b) => keyArrival(a) - keyArrival(b));
}

/** Retire la clé `index` (rang dans `keys`) ; plus aucune clé : `undefined`. */
export function removeKey(keys: MoveKey[] | undefined, index: number): MoveKey[] | undefined {
  if (!keys) return keys;
  const list = keys.filter((_, rank) => rank !== index);
  return list.length ? list : undefined;
}

/**
 * Déplace la clé `index` dans le temps : elle arrive à `arrival` (borné à
 * l'élément) et garde sa durée, raccourcie si elle partirait avant le début.
 */
export function moveKeyTo(keys: MoveKey[], index: number, arrival: number, duration: number): MoveKey[] {
  const key = keys[index];
  if (!key) return keys;
  const target = Math.max(1, Math.min(Math.round(duration), Math.round(arrival)));
  const frames = Math.min(keyFrames(key), target);
  return keys.map((entry, rank) => (rank === index ? { ...entry, at: target - frames, frames } : entry));
}

/** Change la durée du mouvement de la clé `index` sans changer son instant d'arrivée. */
export function setKeyFrames(keys: MoveKey[], index: number, frames: number): MoveKey[] {
  const key = keys[index];
  if (!key) return keys;
  const arrival = keyArrival(key);
  const length = Math.max(1, Math.min(arrival, Math.round(frames)));
  return keys.map((entry, rank) => (rank === index ? { ...entry, at: arrival - length, frames: length } : entry));
}

/** Ce qu'une clé fait bouger, en mots, pour la chronologie et l'inspecteur. */
export function keySummary(key: MoveKey): string {
  const parts: string[] = [];
  if (key.x !== undefined || key.y !== undefined) parts.push("position");
  if (key.width !== undefined || key.height !== undefined || key.scale !== undefined) parts.push("taille");
  if (key.rotation !== undefined) parts.push("rotation");
  if (key.opacity !== undefined) parts.push("opacité");
  const text = parts.join(", ");
  return text ? text[0].toUpperCase() + text.slice(1) : "Aucune valeur";
}

/** Clés d'un élément dans l'ordre de leur arrivée, avec leur rang dans `keys`. */
export function keysByArrival(item: VisualItem): { key: MoveKey; index: number; arrival: number }[] {
  return (item.keys ?? [])
    .map((key, index) => ({ key, index, arrival: keyArrival(key) }))
    .filter((entry) => Number.isFinite(entry.arrival))
    .sort((a, b) => a.arrival - b.arrival);
}

/**
 * Cadre d'un élément qui accompagne celui que l'on tient (le texte d'une
 * carte) : même déplacement, et, quand l'élément tenu change de taille, même
 * proportion autour de son centre. Tout est en parts du canevas.
 */
export function followBox(before: Transform, after: Placement, companion: Transform): Placement {
  const x = after.x ?? before.x;
  const y = after.y ?? before.y;
  const ratioX = after.width !== undefined && before.width > 1e-9 ? after.width / before.width : 1;
  const ratioY = after.height !== undefined && before.height > 1e-9 ? after.height / before.height : 1;
  const next: Placement = { x: x + (companion.x - before.x) * ratioX, y: y + (companion.y - before.y) * ratioY };
  if (ratioX !== 1) next.width = companion.width * ratioX;
  if (ratioY !== 1) next.height = companion.height * ratioY;
  return next;
}
