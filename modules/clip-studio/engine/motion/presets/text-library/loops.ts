/**
 * Boucles : chaque passage finit là où il commence, pour se répéter sans
 * à-coup tant que le texte reste à l'écran.
 *
 * Avec un décalage, une unité attend au repos son tour dans le passage : une
 * vague traverse le texte, puis la suivante repart du début.
 */

import type { Keyframe, MotionPreset } from "../../types";
import { anchorY, HOLD, intensity, jitterValues, sampled } from "./shared";

/**
 * Saut d'une lettre en 0,62 s : tassement d'élan, saut en cloche de 0,4 em,
 * tassement à l'atterrissage.
 */
function hopPose(u: number) {
  const s = u * 0.62;
  if (s <= 0 || s >= 0.62) return { y: 0, squash: 0 };
  if (s < 0.1) return { y: 0, squash: 0.5 * Math.sin((Math.PI * s) / 0.1) };
  if (s < 0.5) {
    const h = (s - 0.1) / 0.4;
    return { y: -0.4 * 4 * h * (1 - h), squash: 0 };
  }
  return { y: 0, squash: Math.sin((Math.PI * (s - 0.5)) / 0.12) };
}

/** Secousse lissée : des points tirés une fois pour toutes, refermés au repos. */
function shakeTrack(seed: number, points: number, amplitude: number): Keyframe[] {
  const values = jitterValues(seed, points - 1);
  const frames: Keyframe[] = [{ at: 0, value: 0 }];
  for (let i = 1; i < points; i++) frames.push({ at: i / points, value: Math.round(values[i - 1] * amplitude * 1000) / 1000, ease: "inOutSine" });
  frames.push({ at: 1, value: 0, ease: "inOutSine" });
  return frames;
}

/** Saccade de pellicule : une valeur par image à 24 images par seconde. */
function filmTrack(seed: number, frames: number, rest: number, spread: number): Keyframe[] {
  const values = jitterValues(seed, frames - 1);
  const track: Keyframe[] = [{ at: 0, value: rest }];
  for (let i = 1; i < frames; i++) track.push({ at: i / frames, value: Math.round((rest + values[i - 1] * spread) * 1000) / 1000, ease: HOLD });
  track.push({ at: 1, value: rest, ease: HOLD });
  return track;
}

/** Les teintes du cercle chromatique, vives et claires. */
const RAINBOW = ["#f26363", "#f2f263", "#63f263", "#63f2f2", "#6363f2", "#f263f2", "#f26363"];

export const LOOP_PRESETS: MotionPreset[] = [
  {
    // Comme une enseigne suspendue au-dessus du texte, le titre se balance
    // doucement de part et d'autre. Le point d'attache est loin au-dessus :
    // le balancement déplace aussi le titre de côté.
    id: "title-hanging-sway",
    label: "Enseigne qui se balance",
    category: "loop",
    phase: "loop",
    target: "text",
    durationMs: 4800,
    units: "em",
    split: "whole",
    tracks: {
      rotate: [
        { at: 0, value: 0 },
        { at: 0.25, value: 4, ease: "outSine" },
        { at: 0.75, value: -4, ease: "inOutSine" },
        { at: 1, value: 0, ease: "inSine" },
      ],
      x: [
        { at: 0, value: 0 },
        { at: 0.25, value: -0.17, ease: "outSine" },
        { at: 0.75, value: 0.17, ease: "inOutSine" },
        { at: 1, value: 0, ease: "inSine" },
      ],
    },
    params: [intensity(["rotate", "x"])],
  },
  {
    // Les lettres montent et redescendent l'une après l'autre : une vague
    // traverse le texte.
    id: "wave-letters",
    label: "Vague",
    category: "loop",
    phase: "loop",
    target: "text",
    durationMs: 1200,
    ease: "inOutSine",
    split: "char",
    stagger: { eachMs: 100, from: "start" },
    tracks: {
      y: [
        { at: 0, value: 0 },
        { at: 0.5, value: -0.3 },
        { at: 1, value: 0 },
      ],
    },
    params: [intensity(["y"])],
  },
  {
    // Les lettres sautent à la file, chacune se tassant avant et après son saut.
    id: "hop-letters-loop",
    label: "Saut à la file",
    category: "loop",
    phase: "loop",
    target: "text",
    durationMs: 620,
    split: "char",
    stagger: { eachMs: 70, from: "start" },
    tracks: {
      y: sampled((u) => {
        const pose = hopPose(u);
        return pose.y + anchorY(1, 1 - 0.14 * pose.squash);
      }, 40),
      scaleY: sampled((u) => 1 - 0.14 * hopPose(u).squash, 40),
      scaleX: sampled((u) => 1 + 0.1 * hopPose(u).squash, 40),
    },
    params: [intensity(["y", "scaleX", "scaleY"])],
  },
  {
    // Chaque lettre grossit et rapetisse à son rythme : le mot respire.
    id: "breathe-letters",
    label: "Respiration",
    category: "loop",
    phase: "loop",
    target: "text",
    durationMs: 1600,
    ease: "inOutSine",
    split: "char",
    stagger: { eachMs: 60, from: "random" },
    tracks: {
      scale: [
        { at: 0, value: 1 },
        { at: 0.25, value: 1.12 },
        { at: 0.75, value: 0.88 },
        { at: 1, value: 1 },
      ],
    },
    params: [intensity(["scale"])],
  },
  {
    // Les lettres tremblent chacune de leur côté, petits sauts et petits
    // pivots : la peur, le froid, la colère.
    id: "tremble-letters",
    label: "Tremblement",
    category: "loop",
    phase: "loop",
    target: "text",
    durationMs: 1000,
    split: "char",
    stagger: { eachMs: 20, from: "random" },
    tracks: {
      x: shakeTrack(11, 10, 0.08),
      y: shakeTrack(23, 10, 0.08),
      rotate: shakeTrack(37, 10, 3),
    },
    params: [intensity(["x", "y", "rotate"])],
  },
  {
    // Pellicule usée : le titre saute d'un rien à chaque image et sa lumière
    // vacille.
    id: "title-film-jitter",
    label: "Pellicule qui saute",
    category: "loop",
    phase: "loop",
    target: "text",
    durationMs: 1000,
    units: "em",
    split: "whole",
    tracks: {
      x: filmTrack(5, 24, 0, 0.04),
      y: filmTrack(9, 24, 0, 0.04),
      opacity: filmTrack(13, 24, 0.925, 0.075),
    },
    params: [intensity(["x", "y", "opacity"])],
  },
  {
    // Les couleurs du cercle chromatique défilent dans le titre.
    id: "title-rainbow",
    label: "Arc-en-ciel",
    category: "loop",
    phase: "loop",
    target: "text",
    durationMs: 4000,
    split: "whole",
    tracks: {
      color: RAINBOW.map((value, index) =>
        index === 0 ? { at: 0, value } : { at: index / (RAINBOW.length - 1), value, ease: "linear" as const }
      ),
    },
  },
  {
    // Le texte se tape, reste un moment, s'efface deux fois plus vite, et recommence.
    id: "title-type-erase",
    label: "Frappe et effacement",
    category: "typing",
    phase: "loop",
    target: "text",
    durationMs: 3000,
    split: "whole",
    tracks: {
      reveal: [
        { at: 0, value: 0 },
        { at: 0.39, value: 1, ease: "linear" },
        { at: 0.69, value: 1 },
        { at: 0.89, value: 0, ease: "linear" },
        { at: 1, value: 0 },
      ],
    },
  },
];
