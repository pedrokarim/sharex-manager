/**
 * Flous et lumières : mises au point, néon, balayage de couleur.
 */

import type { EaseSpec, MotionPreset } from "../../types";
import { DIM_GREY, direction, fadeIn, HOLD, intensity, sampled, tween } from "./shared";

/**
 * Flou et étirement de vitesse d'un glissement exponentiel : proportionnels
 * à sa vitesse, très forts au départ et nuls à l'arrêt.
 */
const speed = (t: number) => (Math.pow(2, -10 * t) - Math.pow(2, -10)) / (1 - Math.pow(2, -10));
const speedBlur = (t: number) => 1.02 * speed(t);
const speedStretch = (t: number) => 1.7 * speed(t);

/** Courbe douce des mises au point : départ et arrivée lents. */
const RACK: EaseSpec = { bezier: [0.65, 0, 0.35, 1] };

export const LIGHT_PRESETS: MotionPreset[] = [
  {
    // Chaque lettre sort d'un flou épais et se resserre un peu en devenant nette.
    id: "focus-letters",
    label: "Mise au point lettre par lettre",
    category: "blur-light",
    phase: "in",
    target: "text",
    durationMs: 700,
    ease: "outCubic",
    split: "char",
    stagger: { eachMs: 55, from: "start" },
    tracks: {
      opacity: tween(0, 1),
      blur: tween(0.22, 0),
      scale: tween(1.2, 1),
    },
    params: [intensity(["blur", "scale"])],
  },
  {
    // Les lettres sortent d'un flou très épais, une à une et dans le désordre.
    id: "focus-letters-random",
    label: "Mise au point au hasard",
    category: "blur-light",
    phase: "in",
    target: "text",
    durationMs: 600,
    ease: "inOutQuad",
    split: "char",
    stagger: { eachMs: 50, from: "random" },
    tracks: {
      opacity: tween(0, 1),
      blur: tween(0.37, 0),
    },
    params: [intensity(["blur"])],
  },
  {
    // Comme un texte qui s'écrit tout seul : les mots émergent du flou et de
    // la transparence, un par un.
    id: "focus-words",
    label: "Mise au point mot par mot",
    category: "blur-light",
    phase: "in",
    target: "text",
    durationMs: 800,
    ease: "outQuad",
    split: "word",
    stagger: { eachMs: 200, from: "start" },
    tracks: {
      opacity: tween(0, 1),
      blur: tween(0.3, 0),
    },
    params: [intensity(["blur"])],
  },
  {
    // Chaque mot tombe d'au-dessus en trois temps : flou, moins flou en
    // dépassant un peu sa ligne, puis net à sa place.
    id: "focus-drop-words",
    label: "Chute nette mot par mot",
    category: "blur-light",
    phase: "in",
    target: "text",
    durationMs: 700,
    split: "word",
    stagger: { eachMs: 200, from: "start" },
    tracks: {
      opacity: [
        { at: 0, value: 0 },
        { at: 0.5, value: 0.5, ease: "linear" },
        { at: 1, value: 1, ease: "linear" },
      ],
      y: [
        { at: 0, value: -1.14 },
        { at: 0.5, value: 0.11, ease: "outQuad" },
        { at: 1, value: 0, ease: "outQuad" },
      ],
      blur: [
        { at: 0, value: 0.23 },
        { at: 0.5, value: 0.11, ease: "linear" },
        { at: 1, value: 0, ease: "linear" },
      ],
    },
    params: [intensity(["y", "blur"]), direction("down")],
  },
  {
    // Les lettres s'allument comme un tube de néon qui chauffe : deux ou
    // trois ratés, puis la lumière tient.
    id: "neon-letters",
    label: "Néon qui s'allume",
    category: "blur-light",
    phase: "in",
    target: "text",
    durationMs: 600,
    split: "char",
    stagger: { eachMs: 80, from: "start" },
    tracks: {
      // Avant de s'allumer, le tube éteint se devine à peine.
      opacity: [
        { at: 0, value: 0.1 },
        { at: 0.01, value: 1, ease: HOLD },
        { at: 0.27, value: 0.15, ease: HOLD },
        { at: 0.4, value: 1, ease: HOLD },
        { at: 0.87, value: 0.35, ease: HOLD },
        // Dernier palier un peu avant la fin : la lettre est allumée quand la phase s'achève.
        { at: 0.95, value: 1, ease: HOLD },
      ],
    },
  },
  {
    // Le texte attend en gris ; une bande lumineuse le traverse de gauche à
    // droite et laisse chaque lettre dans sa couleur.
    id: "color-sweep-letters",
    label: "Vague de couleur",
    category: "blur-light",
    phase: "in",
    target: "text",
    durationMs: 350,
    split: "char",
    // La bande ralentit aux deux bords du texte : les départs suivent la
    // courbe inverse de son trajet.
    stagger: { eachMs: 60, from: "start", ease: { bezier: [0, 0.65, 1, 0.35] } },
    tracks: {
      color: [
        { at: 0, value: DIM_GREY },
        { at: 0.5, value: "#ffe9a8", ease: "linear" },
        { at: 1, value: "currentColor", ease: "linear" },
      ],
    },
  },
  {
    // Le titre entier part grossi et flou, puis se resserre net : une mise au
    // point d'objectif.
    id: "title-focus-zoom",
    label: "Zoom net",
    category: "blur-light",
    phase: "in",
    target: "text",
    durationMs: 700,
    ease: { bezier: [0.2, 0.7, 0.2, 1] },
    units: "em",
    split: "whole",
    tracks: {
      opacity: tween(0, 1),
      scale: tween(1.4, 1),
      blur: tween(0.24, 0),
    },
    params: [intensity(["scale", "blur"])],
  },
  {
    // Le titre arrive de la gauche en trombe, étiré et flou de vitesse, et
    // se fige net à l'arrêt. Le flou suit la vitesse du glissement.
    id: "title-whoosh",
    label: "Arrivée en trombe",
    category: "blur-light",
    phase: "in",
    target: "text",
    durationMs: 550,
    units: "em",
    split: "whole",
    tracks: {
      opacity: fadeIn(0.04),
      x: tween(-3.9, 0, "outExpo"),
      blur: sampled((t) => Math.min(0.35, speedBlur(t)), 24),
      scaleX: sampled((t) => 1 + Math.min(0.6, speedStretch(t)), 24),
    },
    params: [intensity(["x", "blur", "scaleX"])],
  },
  {
    id: "title-whoosh",
    label: "Arrivée en trombe",
    category: "blur-light",
    phase: "out",
    target: "text",
    durationMs: 400,
    units: "em",
    split: "whole",
    tracks: {
      x: tween(0, 3.9, "inExpo"),
      blur: sampled((t) => Math.min(0.35, speedBlur(1 - t)), 24),
      scaleX: sampled((t) => 1 + Math.min(0.6, speedStretch(1 - t)), 24),
      opacity: [
        { at: 0, value: 1 },
        { at: 0.96, value: 1 },
        { at: 1, value: 0, ease: "linear" },
      ],
    },
    params: [intensity(["x", "blur", "scaleX"])],
  },
  {
    // Sortie : le titre se brouille, grossit et s'envole en haut à droite.
    id: "title-blow-away",
    label: "Envol flou",
    category: "blur-light",
    phase: "out",
    target: "text",
    durationMs: 450,
    ease: "outCubic",
    units: "em",
    split: "whole",
    tracks: {
      opacity: tween(1, 0),
      x: tween(0, 0.95),
      y: tween(0, -0.95),
      scale: tween(1, 2),
      blur: tween(0, 0.19),
    },
  },
  {
    // Boucle : la netteté passe d'une ligne à l'autre ; celle qui attend est
    // floue et plus pâle. Pensée pour deux lignes.
    id: "rack-focus-lines",
    label: "Mise au point alternée",
    category: "blur-light",
    phase: "loop",
    target: "text",
    durationMs: 3100,
    ease: RACK,
    split: "line",
    stagger: { eachMs: 1900, from: "start" },
    tracks: {
      blur: [
        { at: 0, value: 0.2 },
        { at: 0.39, value: 0 },
        { at: 0.61, value: 0 },
        { at: 1, value: 0.2 },
      ],
      opacity: [
        { at: 0, value: 0.55 },
        { at: 0.39, value: 1 },
        { at: 0.61, value: 1 },
        { at: 1, value: 0.55 },
      ],
    },
  },
  {
    // Boucle : un seul mot est net à la fois, la netteté passe au suivant.
    id: "focus-travel-words",
    label: "Mise au point baladeuse",
    category: "blur-light",
    phase: "loop",
    target: "text",
    durationMs: 2000,
    ease: RACK,
    split: "word",
    stagger: { eachMs: 1500, from: "start" },
    tracks: {
      blur: [
        { at: 0, value: 0.14 },
        { at: 0.25, value: 0 },
        { at: 0.75, value: 0 },
        { at: 1, value: 0.14 },
      ],
      opacity: [
        { at: 0, value: 0.6 },
        { at: 0.25, value: 1 },
        { at: 0.75, value: 1 },
        { at: 1, value: 0.6 },
      ],
    },
  },
];
