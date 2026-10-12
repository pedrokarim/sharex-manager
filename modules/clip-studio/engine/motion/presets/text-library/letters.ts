/**
 * Entrées et sorties lettre par lettre.
 *
 * Chaque lettre joue la même courbe, décalée de la précédente ; l'ordre de
 * départ (début, fin, centre, hasard) donne le caractère de l'animation.
 */

import type { MotionPreset } from "../../types";
import { anchorY, direction, fadeIn, HOLD, intensity, MASK_LINE_HEIGHT, sampled, sampledClip, tween } from "./shared";

/** Oscillation amortie d'une lettre qui vient de se poser, en degrés. */
function settleSway(t: number) {
  // Pose à 25 % de l'animation, puis 0,75 s d'oscillation qui s'éteint.
  const since = (t - 0.25) / 0.75;
  if (since <= 0) return 0;
  const seconds = since * 0.75;
  return 28 * Math.exp(-seconds / 0.25) * Math.sin(seconds * 30) * (1 - since);
}

/** Recul puis élan, en entrée et en sortie (recul classique de 10 %). */
function inOutBack(t: number) {
  const c = 1.70158 * 1.525;
  return t < 0.5
    ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2
    : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2;
}

/**
 * Jaillissement : montée d'une ligne et un cinquième, étirement 2,3 × 0,7
 * depuis le sommet de la lettre, et part de la boîte rognée sous le sol
 * (le bas de la ligne, à 0,6 em sous son centre).
 */
function stretchRise(t: number) {
  const e = inOutBack(t);
  const sy = 2.3 - 1.3 * e;
  const sx = 0.7 + 0.3 * e;
  const y = 1.2 * (1 - e) + anchorY(-1, sy);
  const half = MASK_LINE_HEIGHT / 2;
  const floor = Math.min(1, Math.max(0, (half - (half - y) / sy) / MASK_LINE_HEIGHT));
  return { e, sy, sx, y, floor };
}

export const LETTER_PRESETS: MotionPreset[] = [
  {
    // La lettre jaillit d'un sol invisible, étirée en hauteur et amincie,
    // dépasse un peu sa place puis reprend ses proportions. L'étirement part
    // du sommet de la lettre, et ce qui est encore sous le sol est rogné.
    id: "stretch-rise-letters",
    label: "Jaillissement étiré",
    category: "by-letter",
    phase: "in",
    target: "text",
    durationMs: 900,
    split: "char",
    stagger: { eachMs: 35, from: "start" },
    tracks: {
      opacity: sampled((t) => Math.min(1, Math.max(0, 1.6 * stretchRise(t).e)), 40),
      y: sampled((t) => stretchRise(t).y, 40),
      scaleY: sampled((t) => stretchRise(t).sy, 40),
      scaleX: sampled((t) => stretchRise(t).sx, 40),
      clip: sampledClip((t) => [0, 0, stretchRise(t).floor, 0], 40),
    },
    params: [intensity(["y", "scaleX", "scaleY"])],
  },
  {
    // La lettre se déroule vers le bas depuis un trait à son sommet, comme
    // un store qu'on descend.
    id: "unfold-letters",
    label: "Déroulé vertical",
    category: "by-letter",
    phase: "in",
    target: "text",
    durationMs: 600,
    ease: "outBack",
    split: "char",
    stagger: { eachMs: 30, from: "start" },
    tracks: {
      opacity: fadeIn(0.06),
      scaleY: tween(0, 1),
      y: tween(anchorY(-1, 0), 0),
    },
  },
  {
    // Chaque lettre naît d'un point et gonfle sur un ressort : elle dépasse
    // sa taille, revient, et se pose. Un émoji ou une lettre accentuée
    // restent entiers (découpe en graphèmes).
    id: "spring-pop-letters",
    label: "Pop à ressort",
    category: "by-letter",
    phase: "in",
    target: "text",
    durationMs: 760,
    ease: { spring: { mass: 1, stiffness: 300, damping: 18 } },
    split: "char",
    stagger: { eachMs: 30, from: "start" },
    tracks: {
      opacity: fadeIn(0.03),
      scale: tween(0, 1),
      y: tween(anchorY(0.2, 0), 0),
    },
  },
  {
    // Les lettres arrivent de la gauche en traînées étirées et penchées, et
    // se resserrent en glyphes nets ; la dernière part la première.
    id: "smear-letters",
    label: "Traînée lettre par lettre",
    category: "by-letter",
    phase: "in",
    target: "text",
    durationMs: 800,
    ease: "outQuad",
    split: "char",
    stagger: { eachMs: 33, from: "end" },
    tracks: {
      opacity: tween(0, 1),
      x: tween(-2.8, 0),
      rotate: tween(45, 0),
      scaleX: tween(6, 1),
    },
    params: [intensity(["x", "rotate", "scaleX"])],
  },
  {
    // Fondu des lettres dans un ordre sans rapport avec leur place, jusqu'au
    // mot complet. Le tirage est reproductible : l'aperçu et l'export
    // tombent sur le même ordre.
    id: "fade-letters-random",
    label: "Fondu lettre par lettre au hasard",
    category: "by-letter",
    phase: "in",
    target: "text",
    durationMs: 300,
    ease: "outQuad",
    split: "char",
    stagger: { eachMs: 52, from: "random" },
    tracks: { opacity: tween(0, 1) },
  },
  {
    // La lettre du milieu paraît d'abord, puis les autres vers les deux
    // bords, en grandissant à peine.
    id: "fade-letters-center",
    label: "Éclosion depuis le centre",
    category: "by-letter",
    phase: "in",
    target: "text",
    durationMs: 450,
    ease: "outCubic",
    split: "char",
    stagger: { eachMs: 42, from: "center" },
    tracks: {
      opacity: tween(0, 1),
      scale: tween(0.86, 1),
    },
  },
  {
    // Les lettres tombent du haut dans le désordre et se posent net.
    id: "rain-letters",
    label: "Pluie de lettres",
    category: "by-letter",
    phase: "in",
    target: "text",
    durationMs: 500,
    ease: "outCubic",
    split: "char",
    stagger: { eachMs: 50, from: "random" },
    tracks: {
      opacity: fadeIn(0.12),
      y: tween(-3.4, 0),
    },
    params: [intensity(["y"]), direction("down")],
  },
  {
    // Les lettres montent vite, se posent, puis oscillent sur elles-mêmes
    // avec un balancement qui s'éteint : elles ont de l'inertie.
    id: "inertia-letters",
    label: "Arrivée avec inertie",
    category: "by-letter",
    phase: "in",
    target: "text",
    durationMs: 1000,
    split: "char",
    stagger: { eachMs: 80, from: "start" },
    tracks: {
      opacity: fadeIn(0.1),
      y: [
        { at: 0, value: 3.3 },
        { at: 0.25, value: 0, ease: "outCubic" },
      ],
      rotate: sampled(settleSway, 36),
    },
    params: [intensity(["y", "rotate"]), direction("up")],
  },
  {
    // Les lettres tombent d'au-dessus, trois fois plus grandes qu'au repos,
    // et rebondissent un peu en se posant.
    id: "giant-drop-letters",
    label: "Lettres parachutées",
    category: "by-letter",
    phase: "in",
    target: "text",
    durationMs: 900,
    ease: { back: 2, mode: "out" },
    split: "char",
    stagger: { eachMs: 38, from: "start" },
    tracks: {
      opacity: fadeIn(0.25),
      // Chute de 2,9 em, et la base de la lettre reste le point d'appui de l'échelle.
      y: tween(-2.9 + anchorY(0.72, 3), 0),
      scale: tween(3, 1),
    },
    params: [intensity(["y", "scale"])],
  },
  {
    // Sortie : chaque lettre se réduit vers son centre jusqu'à un point.
    id: "shrink-letters",
    label: "Rétrécissement lettre par lettre",
    category: "by-letter",
    phase: "out",
    target: "text",
    durationMs: 350,
    ease: "inQuad",
    split: "char",
    stagger: { eachMs: 24, from: "start" },
    tracks: { scale: tween(1, 0) },
  },
  {
    // Sortie : les lettres s'enfoncent un peu en s'effaçant, de la dernière
    // à la première. L'inverse d'une montée en fondu.
    id: "sink-letters",
    label: "Chute en fondu lettre par lettre",
    category: "by-letter",
    phase: "out",
    target: "text",
    durationMs: 600,
    ease: "inQuad",
    split: "char",
    stagger: { eachMs: 29, from: "end" },
    tracks: {
      opacity: tween(1, 0),
      y: tween(0, 0.6),
    },
    params: [intensity(["y"]), direction("down")],
  },
  {
    // Sortie : une lettre après l'autre, au hasard, se décroche en vacillant
    // puis tombe hors du cadre en accélérant.
    id: "fall-letters",
    label: "Chute libre",
    category: "by-letter",
    phase: "out",
    target: "text",
    durationMs: 750,
    split: "char",
    stagger: { eachMs: 40, from: "random" },
    tracks: {
      rotate: [
        { at: 0, value: 0 },
        { at: 0.1, value: 3.4, ease: "inOutSine" },
        { at: 0.2, value: -3.4, ease: "inOutSine" },
        { at: 0.3, value: 0, ease: "inOutSine" },
        { at: 1, value: 18, ease: "linear" },
      ],
      // Part du cadre : la lettre quitte l'image quelle que soit sa taille.
      dy: [
        { at: 0, value: 0 },
        { at: 0.3, value: 0 },
        { at: 1, value: 0.7, ease: "inQuad" },
      ],
      opacity: [
        { at: 0, value: 1 },
        { at: 0.85, value: 1 },
        { at: 1, value: 0, ease: "linear" },
      ],
    },
  },
  {
    // Frappe nerveuse : chaque lettre clignote deux fois avant de rester.
    id: "flicker-letters",
    label: "Clignotement lettre par lettre",
    category: "typing",
    phase: "in",
    target: "text",
    durationMs: 130,
    split: "char",
    stagger: { eachMs: 70, from: "start" },
    tracks: {
      opacity: [
        { at: 0, value: 0 },
        { at: 0.02, value: 1, ease: HOLD },
        { at: 0.38, value: 0, ease: HOLD },
        { at: 0.62, value: 1, ease: HOLD },
      ],
    },
  },
];
