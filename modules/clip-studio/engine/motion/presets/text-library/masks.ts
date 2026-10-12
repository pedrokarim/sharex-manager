/**
 * Masques : le texte sort d'une fente ou s'y retire.
 *
 * La fente est simulée par la découpe de chaque unité : l'unité se déplace
 * d'une ligne et sa boîte est rognée d'autant, du même côté et sur la même
 * courbe. Le bord du masque reste ainsi immobile pendant que la lettre glisse
 * dessous.
 */

import type { ClipInsets, MotionPreset } from "../../types";
import { fadeIn, MASK_LINE_HEIGHT, tween } from "./shared";

const OPEN: ClipInsets = [0, 0, 0, 0];
/** Part rognée quand l'unité s'est décalée d'une ligne entière. */
const FULL = 1;
/** Décalage horizontal d'une lettre glissée dans sa case : sa largeur moyenne. */
const LETTER_WIDTH = 0.6;

export const MASK_PRESETS: MotionPreset[] = [
  {
    // Les lettres montent d'une fente invisible sous la ligne, à intervalles serrés.
    id: "mask-rise-letters",
    label: "Montée masquée lettre par lettre",
    category: "mask",
    phase: "in",
    target: "text",
    durationMs: 500,
    ease: "outCubic",
    split: "char",
    stagger: { eachMs: 35, from: "start" },
    tracks: {
      y: tween(MASK_LINE_HEIGHT, 0),
      clip: tween([0, 0, FULL, 0], OPEN),
    },
  },
  {
    // Sortie : les lettres filent vers le haut et disparaissent par le haut de la ligne.
    id: "mask-rise-letters",
    label: "Montée masquée lettre par lettre",
    category: "mask",
    phase: "out",
    target: "text",
    durationMs: 500,
    ease: "inCubic",
    split: "char",
    stagger: { eachMs: 24, from: "start" },
    tracks: {
      y: tween(0, -MASK_LINE_HEIGHT),
      clip: tween(OPEN, [FULL, 0, 0, 0]),
      opacity: tween(1, 0),
    },
  },
  {
    // Chaque ligne pousse depuis sa ligne de base, l'une après l'autre.
    id: "mask-rise-lines",
    label: "Montée masquée ligne par ligne",
    category: "mask",
    phase: "in",
    target: "text",
    durationMs: 1000,
    ease: "outExpo",
    split: "line",
    stagger: { eachMs: 100, from: "start" },
    tracks: {
      y: tween(MASK_LINE_HEIGHT, 0),
      clip: tween([0, 0, FULL, 0], OPEN),
    },
  },
  {
    id: "mask-rise-lines",
    label: "Montée masquée ligne par ligne",
    category: "mask",
    phase: "out",
    target: "text",
    durationMs: 600,
    ease: "inCubic",
    split: "line",
    stagger: { eachMs: 100, from: "start" },
    tracks: {
      y: tween(0, -MASK_LINE_HEIGHT),
      clip: tween(OPEN, [FULL, 0, 0, 0]),
    },
  },
  {
    // Chaque lettre glisse de la droite dans sa propre case : un balayage net.
    id: "mask-slide-letters",
    label: "Glissé masqué lettre par lettre",
    category: "mask",
    phase: "in",
    target: "text",
    durationMs: 800,
    ease: "outExpo",
    split: "char",
    stagger: { eachMs: 30, from: "start" },
    tracks: {
      x: tween(LETTER_WIDTH, 0),
      clip: tween([0, FULL, 0, 0], OPEN),
    },
  },
  {
    id: "mask-slide-letters",
    label: "Glissé masqué lettre par lettre",
    category: "mask",
    phase: "out",
    target: "text",
    durationMs: 500,
    ease: "inExpo",
    split: "char",
    stagger: { eachMs: 30, from: "start" },
    tracks: {
      x: tween(0, -LETTER_WIDTH),
      clip: tween(OPEN, [0, 0, 0, FULL]),
    },
  },
  {
    // Deux bandes s'écartent depuis le milieu, puis le titre se révèle en
    // fondu dans l'ouverture, comme un format cinémascope.
    id: "title-letterbox",
    label: "Ouverture cinémascope",
    category: "mask",
    phase: "in",
    target: "any",
    durationMs: 1000,
    split: "whole",
    tracks: {
      clip: [
        { at: 0, value: [0.5, 0, 0.5, 0] },
        { at: 0.8, value: OPEN, ease: { bezier: [0.65, 0, 0.35, 1] } },
      ],
      opacity: fadeIn(1, "linear", 0.2),
    },
  },
];
