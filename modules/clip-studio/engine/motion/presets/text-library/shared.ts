/**
 * Outils communs aux préréglages de la bibliothèque de texte.
 *
 * Conventions, les mêmes que `presets/text.ts` :
 *
 * - `durationMs` est la durée d'une unité (lettre, mot, ligne) ; la phase
 *   entière dure une unité plus les décalages, et se resserre si l'élément
 *   est plus court ;
 * - les longueurs sont en « em » (taille du texte) : un titre et une légende
 *   bougent dans les mêmes proportions. Un préréglage sur le bloc entier
 *   (`split: "whole"`) le précise par `units: "em"` ;
 * - une échelle ou une rotation se fait autour du centre de l'unité. Pour
 *   faire pousser une lettre depuis sa base ou son sommet, un décalage
 *   vertical suit la même courbe que l'échelle (voir `anchorY`) ;
 * - un masque immobile (la lettre qui sort d'une fente) se simule par la
 *   découpe, qui rogne la boîte de l'unité d'autant que l'unité s'est
 *   déplacée (voir `MASK_LINE_HEIGHT`).
 */

import type { ClipInsets, EaseSpec, Keyframe, KeyframeValue, MotionDirection, MotionParam, MotionProperty } from "../../types";

/**
 * Couleur de mise en avant par défaut : le jaune du karaoké de Clip Studio.
 * Un réglage de couleur par préréglage viendra avec les couleurs de la marque.
 */
export const ACCENT = "#facc15";

/** Gris d'un texte encore « éteint », avant qu'une couleur le traverse. */
export const DIM_GREY = "#9a9a9a";

/**
 * Interligne supposé pour simuler un masque par la découpe. La découpe se
 * mesure en part de la hauteur de ligne ; un décalage de 1,2 em vaut une
 * ligne entière avec l'interligne courant des titres (1,15 à 1,25).
 */
export const MASK_LINE_HEIGHT = 1.2;

export const intensity = (affects: MotionProperty[], label = "Intensité", fallback = 1): MotionParam => ({
  id: "intensity",
  kind: "amount",
  label,
  min: 0,
  max: 2,
  default: fallback,
  affects,
});

export const direction = (fallback: MotionDirection): MotionParam => ({
  id: "direction",
  kind: "direction",
  label: "Direction",
  default: fallback,
});

/**
 * De `from` à `to`, entre `since` et `until` (toute la durée par défaut). La
 * valeur de départ est tenue avant `since` : sans image clé à 0, la piste
 * partirait du repos.
 */
export function tween(from: KeyframeValue, to: KeyframeValue, ease?: EaseSpec, until = 1, since = 0): Keyframe[] {
  const frames: Keyframe[] = since > 0 ? [{ at: 0, value: from }, { at: since, value: from }] : [{ at: 0, value: from }];
  frames.push(ease === undefined ? { at: until, value: to } : { at: until, value: to, ease });
  return frames;
}

/** Fondu d'apparition, terminé à `until`. */
export const fadeIn = (until = 1, ease: EaseSpec = "linear", since = 0): Keyframe[] => tween(0, 1, ease, until, since);

/** Fondu de disparition, commencé à `since`. */
export const fadeOut = (since = 0, ease: EaseSpec = "linear"): Keyframe[] => [
  { at: 0, value: 1 },
  { at: since, value: 1 },
  { at: 1, value: 0, ease },
];

/**
 * Images clés tirées d'une fonction, à pas réguliers et reliées en ligne
 * droite. Pour les formes qu'aucune courbe seule ne décrit : rebonds
 * successifs, oscillation amortie, écrasement à l'atterrissage.
 */
export function sampled(fn: (t: number) => number, steps = 32, from = 0, to = 1): Keyframe[] {
  const frames: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const at = from + ((to - from) * i) / steps;
    const value = Math.round(fn(at) * 10000) / 10000;
    frames.push(i === 0 ? { at, value } : { at, value, ease: "linear" });
  }
  return frames;
}

/** Comme `sampled`, pour une découpe (haut, droite, bas, gauche). */
export function sampledClip(fn: (t: number) => ClipInsets, steps = 32): Keyframe[] {
  const frames: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const at = i / steps;
    const value = fn(at).map((side) => Math.round(side * 10000) / 10000) as ClipInsets;
    frames.push(i === 0 ? { at, value } : { at, value, ease: "linear" });
  }
  return frames;
}

/**
 * Décalage vertical (en em) qui garde un point de la lettre immobile pendant
 * une mise à l'échelle verticale : `origin` vaut −1 pour le sommet de la
 * lettre, 1 pour sa base (une demi-hauteur de corps de part et d'autre du
 * centre). Valeur pour une échelle `scaleY` donnée.
 */
export const anchorY = (origin: number, scaleY: number) => origin * 0.5 * (1 - scaleY);

/** Paliers : la valeur saute à l'image clé suivante, sans transition. */
export const HOLD: EaseSpec = { steps: 1 };

/** Bruit reproductible pour les secousses écrites en images clés. */
export function jitterValues(seed: number, count: number): number[] {
  let state = seed >>> 0;
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    values.push((state / 4294967296) * 2 - 1);
  }
  return values;
}

/** Courbe « montée puis descente » en sinus, de 0 à 1 puis 0 : une bosse. */
export const bump = (t: number) => (t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t));
