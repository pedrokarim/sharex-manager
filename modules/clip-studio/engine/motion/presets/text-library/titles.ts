/**
 * Titres, bandeaux, impacts et compte à rebours : le texte animé en bloc.
 *
 * Ces préréglages bougent le titre entier (`split: "whole"`) ; leurs
 * longueurs sont en « em » pour rester proportionnées à la taille du texte.
 * `strap-lines` et `stamp-words` découpent par ligne et par mot.
 */

import { cubicBezier } from "../../easing";
import type { EaseSpec, MotionParam, MotionPreset } from "../../types";
import { fadeIn, HOLD, intensity, sampled, tween } from "./shared";

/** Courbe d'entrée-sortie appuyée, celle des bandeaux et des ouvertures. */
const IN_OUT: EaseSpec = { bezier: [0.65, 0, 0.35, 1] };

const trackingBlur: MotionParam = {
  id: "blur",
  kind: "amount",
  label: "Flou",
  min: 0,
  max: 2,
  default: 0.25,
  affects: ["blur"],
};

/** Plongée dans le titre : un zoom exponentiel, régulier à l'œil. */
const diveEase = cubicBezier(0.65, 0, 0.35, 1);
const DIVE_SCALE = 40;

export const TITLE_PRESETS: MotionPreset[] = [
  {
    // Le titre classique de bande-annonce : des lettres très espacées qui
    // apparaissent et se resserrent lentement. Le réglage « Flou » ajoute
    // une mise au point pendant le resserrement.
    id: "title-tracking-contract",
    label: "Resserrement",
    category: "title",
    phase: "in",
    target: "text",
    durationMs: 2800,
    ease: "outQuart",
    units: "em",
    split: "whole",
    tracks: {
      tracking: tween(0.2, 0),
      opacity: fadeIn(0.3, "outSine"),
      blur: [
        { at: 0, value: 0.3 },
        { at: 0.6, value: 0, ease: "outCubic" },
      ],
    },
    params: [intensity(["tracking"]), trackingBlur],
  },
  {
    // Des lettres serrées à se chevaucher apparaissent pendant que
    // l'espacement s'ouvre jusqu'au naturel.
    id: "title-tracking-expand",
    label: "Ouverture de l'espacement",
    category: "title",
    phase: "in",
    target: "text",
    durationMs: 700,
    ease: "outCubic",
    units: "em",
    split: "whole",
    tracks: {
      tracking: tween(-0.5, 0),
      opacity: fadeIn(0.34, "outCubic"),
    },
    params: [intensity(["tracking"])],
  },
  {
    // Sortie lente : pendant qu'il reste à l'écran, le titre s'élargit sans
    // cesse, puis s'efface. Pour une longue durée de sortie.
    id: "title-tracking-drift",
    label: "Élargissement lent",
    category: "title",
    phase: "out",
    target: "text",
    durationMs: 5000,
    ease: "linear",
    units: "em",
    split: "whole",
    tracks: {
      tracking: tween(0, 0.15),
      opacity: [
        { at: 0, value: 1 },
        { at: 0.89, value: 1 },
        { at: 1, value: 0, ease: "inOutSine" },
      ],
    },
    params: [intensity(["tracking"])],
  },
  {
    // Légende de télévision : de rien à 110 % en quatre images, puis 100 %.
    id: "title-pop",
    label: "Pop de légende",
    category: "title",
    phase: "in",
    target: "text",
    durationMs: 200,
    ease: "outQuad",
    split: "whole",
    tracks: {
      scale: [
        { at: 0, value: 0 },
        { at: 0.67, value: 1.1 },
        { at: 1, value: 1 },
      ],
    },
  },
  {
    // Bande dessinée : le titre jaillit d'une légère inclinaison et se redresse.
    id: "title-comic-pop",
    label: "Pop bande dessinée",
    category: "title",
    phase: "in",
    target: "text",
    durationMs: 600,
    split: "whole",
    tracks: {
      opacity: fadeIn(0.25, IN_OUT),
      scale: tween(0.8, 1, "outBack"),
      rotate: tween(-2, 0, "outCubic"),
    },
    params: [intensity(["scale", "rotate"])],
  },
  {
    // Le titre pivote d'un quart de tour en grandissant, sur une courbe très
    // appuyée : un mouvement de caméra vers le texte.
    id: "title-quarter-turn",
    label: "Quart de tour",
    category: "title",
    phase: "in",
    target: "text",
    durationMs: 400,
    ease: { bezier: [0.8, 0, 0.2, 1] },
    split: "whole",
    tracks: {
      opacity: fadeIn(0.3),
      rotate: tween(90, 0),
      scale: tween(0.5, 1),
    },
  },
  {
    // Bandeau nom et fonction : chaque ligne glisse et se découvre depuis la
    // gauche, la seconde un peu après la première.
    id: "strap-lines",
    label: "Bandeau nom et titre",
    category: "title",
    phase: "in",
    target: "text",
    durationMs: 400,
    ease: "outExpo",
    split: "line",
    stagger: { eachMs: 170, from: "start" },
    tracks: {
      opacity: fadeIn(0.5),
      x: tween(-0.5, 0),
      clip: tween([0, 1, 0, 0], [0, 0, 0, 0]),
    },
  },
  {
    id: "strap-lines",
    label: "Bandeau nom et titre",
    category: "title",
    phase: "out",
    target: "text",
    durationMs: 300,
    ease: IN_OUT,
    split: "line",
    tracks: {
      clip: tween([0, 0, 0, 0], [0, 0, 0, 1]),
      opacity: [
        { at: 0, value: 1 },
        { at: 0.5, value: 1 },
        { at: 1, value: 0, ease: "linear" },
      ],
    },
  },
  {
    // Coup de tampon, à douze images par seconde : chaque mot tombe d'un coup,
    // un peu trop grand, s'écrase et se pose.
    id: "stamp-words",
    label: "Coup de tampon",
    category: "title",
    phase: "in",
    target: "text",
    durationMs: 250,
    split: "word",
    stagger: { eachMs: 360, from: "start" },
    tracks: {
      opacity: [
        { at: 0, value: 0 },
        { at: 0.01, value: 1, ease: HOLD },
      ],
      scale: [
        { at: 0, value: 1.18 },
        { at: 0.34, value: 0.95, ease: HOLD },
        { at: 0.67, value: 1, ease: HOLD },
      ],
    },
  },
  {
    // Sortie : la caméra plonge dans le titre, qui grossit jusqu'à remplir
    // l'image, puis s'efface.
    id: "title-zoom-through",
    label: "Plongée dans le titre",
    category: "title",
    phase: "out",
    target: "text",
    durationMs: 1700,
    split: "whole",
    tracks: {
      scale: sampled((t) => Math.pow(DIVE_SCALE, diveEase(t)), 40),
      opacity: [
        { at: 0, value: 1 },
        { at: 0.85, value: 1 },
        { at: 1, value: 0, ease: "linear" },
      ],
    },
  },
  {
    // Le titre est martelé : il tombe de trois fois sa taille, en accélérant,
    // flou de vitesse compris.
    id: "title-slam",
    label: "Impact",
    category: "impact",
    phase: "in",
    target: "text",
    durationMs: 200,
    ease: { bezier: [0.7, 0, 1, 1] },
    units: "em",
    split: "whole",
    tracks: {
      opacity: fadeIn(0.25, IN_OUT),
      scale: tween(3, 1),
      blur: tween(0.11, 0, "linear"),
    },
    params: [intensity(["scale", "blur"])],
  },
  {
    // Le titre tombe d'en haut sur un ressort lourd, s'écrase à
    // l'atterrissage et rebondit à peine.
    id: "title-slam-drop",
    label: "Atterrissage lourd",
    category: "impact",
    phase: "in",
    target: "text",
    durationMs: 960,
    ease: { spring: { mass: 1, stiffness: 260, damping: 16 } },
    units: "em",
    split: "whole",
    tracks: {
      opacity: fadeIn(0.02),
      y: tween(-1.43, 0),
      scaleY: [
        { at: 0, value: 1 },
        { at: 0.16, value: 0.82, ease: HOLD },
        { at: 0.31, value: 1, ease: HOLD },
      ],
      scaleX: [
        { at: 0, value: 1 },
        { at: 0.16, value: 1.22, ease: HOLD },
        { at: 0.31, value: 1, ease: HOLD },
      ],
    },
    params: [intensity(["y", "scaleX", "scaleY"])],
  },
  {
    // Le titre arrive de la droite en penchant, et se redresse à l'instant
    // où il se pose.
    id: "title-skew-swipe",
    label: "Glissé penché",
    category: "slide",
    phase: "in",
    target: "text",
    durationMs: 400,
    ease: "outExpo",
    units: "em",
    split: "whole",
    tracks: {
      opacity: fadeIn(0.2),
      x: tween(4.6, 0),
      skewX: [
        { at: 0, value: 20 },
        { at: 0.5, value: 20 },
        { at: 1, value: 0, ease: "outCubic" },
      ],
    },
    params: [intensity(["x", "skewX"])],
  },
  {
    // Sortie : le titre penche et file vers la gauche hors de l'image.
    id: "title-skew-swipe",
    label: "Glissé penché",
    category: "slide",
    phase: "out",
    target: "text",
    durationMs: 300,
    ease: "inCubic",
    units: "em",
    split: "whole",
    tracks: {
      x: tween(0, -6.25),
      skewX: [
        { at: 0, value: 0 },
        { at: 0.33, value: 20, ease: "linear" },
        { at: 1, value: 20 },
      ],
      opacity: tween(1, 0),
    },
    params: [intensity(["x", "skewX"])],
  },
  {
    // Compte à rebours : le chiffre surgit à sa taille…
    id: "title-countdown",
    label: "Zoom de compte à rebours",
    category: "counter",
    phase: "in",
    target: "text",
    durationMs: 150,
    ease: "outBack",
    split: "whole",
    tracks: {
      opacity: fadeIn(0.7),
      scale: tween(0.6, 1),
    },
  },
  {
    // … puis grossit en s'effaçant pour laisser place au suivant.
    id: "title-countdown",
    label: "Zoom de compte à rebours",
    category: "counter",
    phase: "out",
    target: "text",
    durationMs: 850,
    ease: "inQuad",
    split: "whole",
    tracks: {
      opacity: tween(1, 0),
      scale: tween(1, 2.2),
    },
  },
];
