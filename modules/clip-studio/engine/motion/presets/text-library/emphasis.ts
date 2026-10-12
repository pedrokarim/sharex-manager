/**
 * Mises en avant : jouées pendant que le texte est à l'écran, elles partent
 * du repos et y reviennent.
 */

import type { Keyframe, MotionPreset } from "../../types";
import { ACCENT, anchorY, HOLD, intensity, sampled } from "./shared";

const outQuad = (t: number) => 1 - (1 - t) * (1 - t);
const inQuad = (t: number) => t * t;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Retour élastique classique : dépasse, revient, s'amortit. */
function outElastic(t: number) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * 2 * Math.PI) / 3) + 1;
}

interface Pose {
  y: number;
  sx: number;
  sy: number;
}

/**
 * Saut d'une lettre en 1,12 s : elle se tasse, s'élance étirée, retombe en
 * s'allongeant, s'écrase à l'atterrissage et reprend sa forme en vibrant.
 * `y` en em, sans le décalage d'ancrage.
 */
function jumpPose(u: number): Pose {
  const s = u * 1.12;
  const height = 0.6;
  if (s <= 0 || s >= 1.12) return { y: 0, sx: 1, sy: 1 };
  if (s < 0.08) {
    const k = Math.sin((Math.PI * s) / 0.08);
    return { y: 0, sx: 1 + 0.08 * k, sy: 1 - 0.1 * k };
  }
  if (s < 0.34) {
    const p = (s - 0.08) / 0.26;
    const stretch = 0.2 * (1 - p);
    return { y: -height * outQuad(p), sx: 1 - stretch * 0.75, sy: 1 + stretch };
  }
  if (s < 0.54) {
    const p = (s - 0.34) / 0.2;
    const stretch = 0.2 * inQuad(p);
    return { y: -height * (1 - inQuad(p)), sx: 1 - stretch * 0.75, sy: 1 + stretch };
  }
  if (s < 0.62) {
    const p = outQuad((s - 0.54) / 0.08);
    return { y: 0, sx: lerp(0.85, 1.25, p), sy: lerp(1.2, 0.7, p) };
  }
  const e = outElastic((s - 0.62) / 0.5);
  return { y: 0, sx: 1.25 - 0.25 * e, sy: 0.7 + 0.3 * e };
}

/** Base de la lettre, à peu près : le point qui touche le sol. */
const BASE = 0.72;

const bell = (x: number) => Math.exp(-x * x * 3);

/** Deux bonds de plus en plus petits, en part de la hauteur de ligne (négatif : vers le haut). */
function hop(p: number) {
  if (p <= 0 || p >= 1) return 0;
  if (p < 0.3) return -0.3 * outQuad(p / 0.3);
  if (p < 0.55) return -0.3 * (1 - inQuad((p - 0.3) / 0.25));
  if (p < 0.75) return -0.12 * outQuad((p - 0.55) / 0.2);
  if (p < 0.9) return -0.12 * (1 - inQuad((p - 0.75) / 0.15));
  return 0;
}

/** Tassement à chaque atterrissage. */
const squash = (p: number) => 0.1 * bell((p - 0.565) / 0.05) + 0.07 * bell((p - 0.915) / 0.045);

/** Ligne entière : 1,2 em, et son centre est à 0,6 em de sa base. */
const LINE = 1.2;

/** Gelée : étirée en largeur, écrasée, puis quelques rebonds qui s'amortissent. */
const JELLY: Array<[at: number, sx: number, sy: number]> = [
  [0, 1, 1],
  [0.3, 1.25, 0.75],
  [0.4, 0.75, 1.25],
  [0.5, 1.15, 0.85],
  [0.65, 0.95, 1.05],
  [0.75, 1.05, 0.95],
  [1, 1, 1],
];

const jellyTrack = (pick: (sx: number, sy: number) => number): Keyframe[] =>
  JELLY.map(([at, sx, sy], index) =>
    index === 0 ? { at, value: pick(sx, sy) } : { at, value: pick(sx, sy), ease: "inOutSine" }
  );

/** Influence d'un champ qui passe sur la lettre, avec un retour sur ressort. */
const FIELD: Array<[at: number, value: number]> = [
  [0, 0],
  [0.35, 1],
  [0.65, -0.15],
  [0.82, 0.05],
  [1, 0],
];

const fieldTrack = (scale: number, offset = 0): Keyframe[] =>
  FIELD.map(([at, value], index) => {
    const frame: Keyframe = { at, value: offset + value * scale };
    if (index > 0) frame.ease = index === 1 ? "outCubic" : "inOutSine";
    return frame;
  });

export const EMPHASIS_PRESETS: MotionPreset[] = [
  {
    // Chaque lettre saute à son tour : elle se tasse, s'élance étirée, et
    // s'écrase en touchant le sol avant de reprendre sa forme.
    id: "squash-hop-letters",
    label: "Saut écrasé",
    category: "attention",
    phase: "emphasis",
    target: "text",
    durationMs: 1120,
    split: "char",
    stagger: { eachMs: 45, from: "start" },
    tracks: {
      y: sampled((u) => {
        const pose = jumpPose(u);
        return pose.y + anchorY(BASE, pose.sy);
      }, 64),
      scaleX: sampled((u) => jumpPose(u).sx, 64),
      scaleY: sampled((u) => jumpPose(u).sy, 64),
    },
  },
  {
    // Le texte fait deux petits bonds et se tasse à chaque atterrissage.
    id: "hop-lines",
    label: "Petits bonds",
    category: "attention",
    phase: "emphasis",
    target: "text",
    durationMs: 800,
    split: "line",
    stagger: { eachMs: 80, from: "start" },
    tracks: {
      y: sampled((p) => hop(p) * LINE + anchorY(LINE, 1 - squash(p)), 48),
      scaleX: sampled((p) => 1 + 0.6 * squash(p), 48),
      scaleY: sampled((p) => 1 - squash(p), 48),
    },
    params: [intensity(["y", "scaleX", "scaleY"])],
  },
  {
    // Les lettres s'étirent, s'écrasent et rebondissent comme du caoutchouc,
    // posées sur leur base.
    id: "jelly-letters",
    label: "Gelée",
    category: "attention",
    phase: "emphasis",
    target: "text",
    durationMs: 900,
    split: "char",
    stagger: { eachMs: 25, from: "start" },
    tracks: {
      scaleX: jellyTrack((sx) => sx),
      scaleY: jellyTrack((_, sy) => sy),
      y: jellyTrack((_, sy) => anchorY(BASE, sy)),
    },
    params: [intensity(["scaleX", "scaleY", "y"])],
  },
  {
    // Une bosse parcourt le texte : seules les lettres qu'elle touche gonflent
    // et se soulèvent, puis retombent.
    id: "swell-wave-letters",
    label: "Vague gonflée",
    category: "attention",
    phase: "emphasis",
    target: "text",
    durationMs: 560,
    ease: "inOutCubic",
    split: "char",
    stagger: { eachMs: 56, from: "start" },
    tracks: {
      scale: [
        { at: 0, value: 1 },
        { at: 0.5, value: 1.5 },
        { at: 1, value: 1 },
      ],
      y: [
        { at: 0, value: 0 },
        { at: 0.5, value: anchorY(BASE, 1.5) - 0.12 },
        { at: 1, value: 0 },
      ],
    },
    params: [intensity(["scale", "y"])],
  },
  {
    // Un champ invisible balaie la ligne : chaque lettre touchée s'incline,
    // grossit et se soulève, puis revient sur un ressort.
    id: "tilt-wave-letters",
    label: "Vague inclinée",
    category: "attention",
    phase: "emphasis",
    target: "text",
    durationMs: 900,
    split: "char",
    stagger: { eachMs: 45, from: "start" },
    tracks: {
      rotate: fieldTrack(20),
      scale: fieldTrack(0.16, 1),
      y: fieldTrack(-0.28),
    },
    params: [intensity(["rotate", "scale", "y"])],
  },
  {
    // Sous-titre : le mot prononcé grossit, monte d'un cheveu et prend la
    // couleur de mise en avant, puis passe la main au suivant.
    id: "spotlight-words",
    label: "Mot actif",
    category: "attention",
    phase: "emphasis",
    target: "text",
    durationMs: 400,
    ease: "outCubic",
    split: "word",
    stagger: { eachMs: 400, from: "start" },
    tracks: {
      scale: [
        { at: 0, value: 1 },
        { at: 0.2, value: 1.1 },
        { at: 0.8, value: 1.1 },
        { at: 1, value: 1 },
      ],
      y: [
        { at: 0, value: 0 },
        { at: 0.2, value: -0.07 },
        { at: 0.8, value: -0.07 },
        { at: 1, value: 0 },
      ],
      color: [
        { at: 0, value: "currentColor" },
        { at: 0.1, value: ACCENT, ease: HOLD },
        { at: 0.9, value: "currentColor", ease: HOLD },
      ],
    },
  },
  {
    // Le mot clé claque à 130 %, se pose un peu plus grand dans la couleur de
    // mise en avant, puis revient.
    id: "title-punch-color",
    label: "Coup de poing coloré",
    category: "attention",
    phase: "emphasis",
    target: "text",
    durationMs: 2000,
    split: "whole",
    tracks: {
      scale: [
        { at: 0, value: 1 },
        { at: 0.06, value: 1.3, ease: "outQuad" },
        { at: 0.12, value: 1.1, ease: "inOutQuad" },
        { at: 0.85, value: 1.1 },
        { at: 1, value: 1, ease: "inOutSine" },
      ],
      color: [
        { at: 0, value: "currentColor" },
        { at: 0.04, value: ACCENT, ease: "linear" },
        { at: 0.85, value: ACCENT },
        { at: 1, value: "currentColor", ease: "inOutSine" },
      ],
    },
    params: [intensity(["scale"])],
  },
  {
    // L'espacement se resserre jusqu'à faire se toucher les lettres, qui
    // grossissent un peu, puis tout se relâche.
    id: "title-tracking-squeeze",
    label: "Pincement",
    category: "attention",
    phase: "emphasis",
    target: "text",
    durationMs: 2900,
    ease: { bezier: [0.65, 0, 0.35, 1] },
    units: "em",
    split: "whole",
    tracks: {
      tracking: [
        { at: 0, value: 0 },
        { at: 0.31, value: -0.3 },
        { at: 0.76, value: -0.3 },
        { at: 1, value: 0 },
      ],
      scale: [
        { at: 0, value: 1 },
        { at: 0.31, value: 1.12 },
        { at: 0.76, value: 1.12 },
        { at: 1, value: 1 },
      ],
    },
    params: [intensity(["tracking", "scale"])],
  },
  {
    // Signal numérique qui décroche : le titre saute de côté par à-coups, à
    // quinze images par seconde, et perd par instants le haut ou le bas.
    id: "title-glitch-jolt",
    label: "Secousse numérique",
    category: "glitch",
    phase: "emphasis",
    target: "text",
    durationMs: 600,
    units: "em",
    split: "whole",
    tracks: {
      x: [
        { at: 0, value: 0 },
        { at: 0.111, value: 0.35, ease: HOLD },
        { at: 0.222, value: -0.25, ease: HOLD },
        { at: 0.333, value: 0, ease: HOLD },
        { at: 0.556, value: -0.4, ease: HOLD },
        { at: 0.667, value: 0.18, ease: HOLD },
        { at: 0.778, value: 0, ease: HOLD },
        { at: 0.889, value: 0.08, ease: HOLD },
        { at: 0.95, value: 0, ease: HOLD },
      ],
      clip: [
        { at: 0, value: [0, 0, 0, 0] },
        { at: 0.111, value: [0, 0, 0.55, 0], ease: HOLD },
        { at: 0.222, value: [0, 0, 0, 0], ease: HOLD },
        { at: 0.556, value: [0.4, 0, 0, 0], ease: HOLD },
        { at: 0.667, value: [0, 0, 0.3, 0], ease: HOLD },
        { at: 0.778, value: [0, 0, 0, 0], ease: HOLD },
      ],
    },
    params: [intensity(["x"])],
  },
];
