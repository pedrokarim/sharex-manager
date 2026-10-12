/**
 * Premiers préréglages de texte découpé : de quoi valider le dessin par
 * unité (lettre, mot, ligne) avant les lots complets.
 *
 * Réglés pour une vidéo verticale : une lettre part 30 à 60 ms après la
 * précédente, un mot 80 à 150 ms, une ligne un peu plus. Les longueurs sont
 * en « em » (taille du texte) : un titre et une légende bougent dans les
 * mêmes proportions.
 *
 * `durationMs` est la durée d'une unité ; la phase entière dure une unité
 * plus les décalages (`naturalFrames`), et se resserre si l'élément est plus
 * court.
 */

import type { Keyframe, MotionParam, MotionPreset } from "../types";

const fadeIn = (until = 1): Keyframe[] => [
  { at: 0, value: 0 },
  { at: until, value: 1, ease: "linear" },
];

const intensity = (affects: Extract<MotionParam, { kind: "amount" }>["affects"]): MotionParam => ({
  id: "intensity",
  kind: "amount",
  label: "Intensité",
  min: 0,
  max: 2,
  default: 1,
  affects,
});

const direction = (fallback: "up" | "down"): MotionParam => ({
  id: "direction",
  kind: "direction",
  label: "Direction",
  default: fallback,
});

export const TEXT_PRESETS: MotionPreset[] = [
  {
    id: "rise-letters",
    label: "Montée lettre par lettre",
    category: "by-letter",
    phase: "in",
    target: "text",
    durationMs: 500,
    ease: "outCubic",
    split: "char",
    stagger: { eachMs: 40, from: "start" },
    tracks: {
      opacity: fadeIn(0.6),
      y: [
        { at: 0, value: 0.6 },
        { at: 1, value: 0 },
      ],
    },
    params: [intensity(["y"]), direction("up")],
  },
  {
    id: "rise-words",
    label: "Montée mot par mot",
    category: "by-word",
    phase: "in",
    target: "text",
    durationMs: 600,
    ease: "outQuart",
    split: "word",
    stagger: { eachMs: 110, from: "start" },
    tracks: {
      opacity: fadeIn(0.5),
      y: [
        { at: 0, value: 0.8 },
        { at: 1, value: 0 },
      ],
    },
    params: [intensity(["y"]), direction("up")],
  },
  {
    id: "drop-bounce-letters",
    label: "Chute avec rebond",
    category: "by-letter",
    phase: "in",
    target: "text",
    durationMs: 800,
    split: "char",
    stagger: { eachMs: 45, from: "start" },
    tracks: {
      opacity: fadeIn(0.25),
      y: [
        { at: 0, value: -1.2 },
        { at: 1, value: 0, ease: "outBounce" },
      ],
    },
    params: [intensity(["y"]), direction("down")],
  },
  {
    // L'échelle se fait autour du centre de la lettre ; le décalage vertical,
    // qui suit la même courbe, garde la base de la lettre en place : elle
    // pousse depuis le bas (y = ½ em × (1 − échelle)).
    id: "grow-letters",
    label: "Éclosion lettre par lettre",
    category: "by-letter",
    phase: "in",
    target: "text",
    durationMs: 550,
    ease: "outBack",
    split: "char",
    stagger: { eachMs: 35, from: "start" },
    tracks: {
      opacity: fadeIn(0.3),
      scale: [
        { at: 0, value: 0 },
        { at: 1, value: 1 },
      ],
      y: [
        { at: 0, value: 0.5 },
        { at: 1, value: 0 },
      ],
    },
  },
  {
    id: "fade-lines",
    label: "Fondu ligne par ligne",
    category: "by-word",
    phase: "in",
    target: "text",
    durationMs: 700,
    ease: "outCubic",
    split: "line",
    stagger: { eachMs: 220, from: "start" },
    tracks: {
      opacity: [
        { at: 0, value: 0 },
        { at: 1, value: 1 },
      ],
      y: [
        { at: 0, value: 0.35 },
        { at: 1, value: 0 },
      ],
    },
    params: [intensity(["y"]), direction("up")],
  },
  {
    id: "fly-up-letters",
    label: "Envol lettre par lettre",
    category: "by-letter",
    phase: "out",
    target: "text",
    durationMs: 420,
    ease: "inCubic",
    split: "char",
    stagger: { eachMs: 30, from: "start" },
    tracks: {
      opacity: [
        { at: 0.4, value: 1 },
        { at: 1, value: 0, ease: "linear" },
      ],
      y: [
        { at: 0, value: 0 },
        { at: 1, value: -0.7 },
      ],
    },
    params: [intensity(["y"]), direction("up")],
  },
  {
    // Frappe : chaque graphème apparaît d'un coup, à son tour ; un émoji ou
    // une lettre accentuée ne s'affichent jamais à moitié.
    id: "type-letters",
    label: "Frappe lettre par lettre",
    category: "typing",
    phase: "in",
    target: "text",
    durationMs: 1,
    split: "char",
    stagger: { eachMs: 55, from: "start" },
    tracks: {
      reveal: [
        { at: 0, value: 0 },
        { at: 1, value: 1, ease: { steps: 1, jump: "start" } },
      ],
    },
  },
];
