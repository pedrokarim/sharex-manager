/**
 * Mot par mot : le rythme de la lecture, plus posé que lettre par lettre.
 */

import type { MotionPreset } from "../../types";
import { ACCENT, anchorY, direction, fadeIn, intensity, tween } from "./shared";

export const WORD_PRESETS: MotionPreset[] = [
  {
    // Chaque mot surgit sur un ressort : il gonfle, dépasse un peu sa
    // taille et s'y pose en oscillant. L'opacité suit le ressort.
    id: "spring-pop-words",
    label: "Ressort mot par mot",
    category: "by-word",
    phase: "in",
    target: "text",
    durationMs: 1540,
    ease: { spring: { mass: 1, stiffness: 100, damping: 10 } },
    split: "word",
    stagger: { eachMs: 167, from: "start" },
    tracks: {
      opacity: tween(0, 1),
      scale: tween(0.6, 1),
      y: tween(anchorY(0.6, 0.6), 0),
    },
    params: [intensity(["scale", "y"])],
  },
  {
    // Sous-titre « coup de poing » : chaque mot claque à 110 % puis se pose.
    id: "punch-words",
    label: "Mots coup de poing",
    category: "by-word",
    phase: "in",
    target: "text",
    durationMs: 180,
    ease: "outQuad",
    split: "word",
    stagger: { eachMs: 150, from: "start" },
    tracks: {
      opacity: fadeIn(0.28),
      scale: [
        { at: 0, value: 0.8 },
        { at: 0.56, value: 1.1 },
        { at: 1, value: 1 },
      ],
    },
    params: [intensity(["scale"])],
  },
  {
    // Le texte est déjà là, très pâle ; chaque mot s'éclaire à son tour dans
    // l'ordre de lecture, avec un éclat de couleur au passage.
    id: "light-up-words",
    label: "Lecture éclairée",
    category: "by-word",
    phase: "in",
    target: "text",
    durationMs: 450,
    split: "word",
    stagger: { eachMs: 220, from: "start" },
    tracks: {
      opacity: tween(0.15, 1, "linear"),
      color: [
        { at: 0, value: "currentColor" },
        { at: 0.5, value: ACCENT, ease: "inOutSine" },
        { at: 1, value: "currentColor", ease: "inOutSine" },
      ],
    },
  },
  {
    // Un balayage découvre chaque mot de gauche à droite, à son tour.
    id: "wipe-words",
    label: "Balayage mot par mot",
    category: "by-word",
    phase: "in",
    target: "text",
    durationMs: 700,
    ease: "outExpo",
    split: "word",
    stagger: { eachMs: 120, from: "start" },
    tracks: { wipe: tween(0, 1) },
  },
  {
    // Sortie : les mots se brouillent, s'effacent et montent un peu, du
    // dernier au premier, comme s'ils s'évaporaient.
    id: "evaporate-words",
    label: "Évaporation mot par mot",
    category: "by-word",
    phase: "out",
    target: "text",
    durationMs: 700,
    ease: "outQuad",
    split: "word",
    stagger: { eachMs: 150, from: "end" },
    tracks: {
      opacity: tween(1, 0),
      blur: tween(0, 0.21),
      y: tween(0, -0.4),
    },
    params: [intensity(["y", "blur"]), direction("up")],
  },
  {
    // Les mots s'affichent d'un coup, un par un, à leur place définitive.
    id: "type-words",
    label: "Apparition mot par mot",
    category: "typing",
    phase: "in",
    target: "text",
    durationMs: 1,
    split: "word",
    stagger: { eachMs: 300, from: "start" },
    tracks: {
      reveal: [
        { at: 0, value: 0 },
        { at: 1, value: 1, ease: { steps: 1, jump: "start" } },
      ],
    },
  },
];
