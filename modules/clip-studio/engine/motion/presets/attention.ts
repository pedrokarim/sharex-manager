/**
 * Mises en avant, boucles et grilles (étape A6).
 *
 * Une mise en avant se joue pendant que l'élément est à l'écran
 * (`animEmphasis`), une fois ou en boucle ; elle part du repos et y revient,
 * et s'arrête net au début de la sortie. Une boucle finit exactement là où
 * elle commence, pour se répéter sans à-coup.
 *
 * Les grilles découpent un élément entier (image, forme, texte en bloc) en
 * carreaux qui arrivent chacun à leur tour : une image qui se reconstitue,
 * une liste dont les rangées montent l'une après l'autre. Les longueurs sont
 * des parts du petit côté du cadre ; dans une grille, chaque carreau bouge
 * autour de son propre centre.
 */

import type { EaseSpec, Keyframe, KeyframeValue, MotionGrid, MotionPreset } from "../types";
import { HOLD, intensity, jitterValues } from "./text-library/shared";

const keys = (...frames: [number, KeyframeValue, EaseSpec?][]): Keyframe[] =>
  frames.map(([at, value, ease]) => (ease === undefined ? { at, value } : { at, value, ease }));

/** Mise en avant ou boucle d'un élément entier, longueurs en part du cadre. */
const anyTarget = (preset: Omit<MotionPreset, "target" | "units">): MotionPreset => ({ target: "any", units: "frame", ...preset });

/** Inverse d'une échelle : l'élément garde sa surface quand il s'écrase. */
const inverse = (frames: Keyframe[]): Keyframe[] =>
  frames.map((frame) => ({ ...frame, value: typeof frame.value === "number" ? Math.round((1 / frame.value) * 10000) / 10000 : frame.value }));

/** Tremblement en paliers, `rate` valeurs par passage, refermé au repos. */
function jitter(seed: number, rate: number, amplitude: number): Keyframe[] {
  const values = jitterValues(seed, rate);
  const frames: Keyframe[] = [{ at: 0, value: 0 }];
  for (let i = 1; i < rate; i++) frames.push({ at: i / rate, value: Math.round(values[i] * amplitude * 1000) / 1000, ease: HOLD });
  frames.push({ at: 1, value: 0, ease: HOLD });
  return frames;
}

/** Une période de sinus refermée : repos, sommet, repos, creux, repos. */
const wave = (amplitude: number, rest = 0): Keyframe[] => {
  const points = [0, 0.25, 0.5, 0.75, 1].map((at) => ({ at, value: Math.round((rest + amplitude * Math.sin(2 * Math.PI * at)) * 10000) / 10000 }));
  return points.map((point, index) => (index === 0 ? point : { ...point, ease: "inOutSine" as const }));
};

// ─── Mises en avant ──────────────────────────────────────────────

const EMPHASIS: MotionPreset[] = [
  anyTarget({
    // Rétréci, puis agrandi en se trémoussant, puis reposé : « tada ».
    id: "tada",
    label: "Tada",
    category: "attention",
    phase: "emphasis",
    durationMs: 1000,
    ease: "inOutSine",
    tracks: {
      scale: keys([0, 1], [0.1, 0.9], [0.2, 0.9], [0.3, 1.1], [0.9, 1.1], [1, 1]),
      rotate: keys([0, 0], [0.1, -3], [0.2, -3], [0.3, 3], [0.4, -3], [0.5, 3], [0.6, -3], [0.7, 3], [0.8, -3], [0.9, 3], [1, 0]),
    },
    params: [intensity(["scale", "rotate"])],
  }),
  anyTarget({
    // Étiré en largeur, puis en hauteur, de moins en moins : un élastique.
    id: "rubber-band",
    label: "Élastique",
    category: "attention",
    phase: "emphasis",
    durationMs: 1000,
    ease: "inOutSine",
    tracks: {
      scaleX: keys([0, 1], [0.3, 1.25], [0.4, 0.75], [0.5, 1.15], [0.65, 0.95], [0.75, 1.05], [1, 1]),
      scaleY: keys([0, 1], [0.3, 0.75], [0.4, 1.25], [0.5, 0.85], [0.65, 1.05], [0.75, 0.95], [1, 1]),
    },
    params: [intensity(["scaleX", "scaleY"])],
  }),
  anyTarget({
    // Suspendu par son bord haut, l'élément se balance et s'arrête.
    id: "swing",
    label: "Balancement",
    category: "attention",
    phase: "emphasis",
    durationMs: 1000,
    ease: "inOutSine",
    origin: [0.5, 0],
    tracks: { rotate: keys([0, 0], [0.2, 15], [0.4, -10], [0.6, 5], [0.8, -5], [1, 0]) },
    params: [intensity(["rotate"])],
  }),
  anyTarget({
    // Il vacille de côté en s'inclinant, de moins en moins.
    id: "wobble",
    label: "Vacillement",
    category: "attention",
    phase: "emphasis",
    durationMs: 1000,
    ease: "inOutSine",
    tracks: {
      x: keys([0, 0], [0.15, -0.06], [0.3, 0.05], [0.45, -0.04], [0.6, 0.03], [0.75, -0.01], [1, 0]),
      rotate: keys([0, 0], [0.15, -5], [0.3, 3], [0.45, -3], [0.6, 2], [0.75, -1], [1, 0]),
    },
    params: [intensity(["x", "rotate"])],
  }),
  anyTarget({
    // Deux extinctions franches : un signal qui attire l'œil.
    id: "flash-blink",
    label: "Double éclipse",
    category: "attention",
    phase: "emphasis",
    durationMs: 1000,
    tracks: { opacity: keys([0, 1], [0.25, 0, "inOutSine"], [0.5, 1, "inOutSine"], [0.75, 0, "inOutSine"], [1, 1, "inOutSine"]) },
  }),
];

// ─── Boucles ─────────────────────────────────────────────────────

const LOOPS: MotionPreset[] = [
  anyTarget({
    // Une pulsation régulière, tant que l'élément est à l'écran.
    id: "pulse-loop",
    label: "Pulsation en boucle",
    category: "loop",
    phase: "loop",
    durationMs: 1000,
    tracks: { scale: keys([0, 1], [0.5, 1.06, "inOutSine"], [1, 1, "inOutSine"]) },
    params: [intensity(["scale"], "Intensité")],
  }),
  anyTarget({
    // Deux battements rapprochés, puis un repos : un cœur.
    id: "heartbeat",
    label: "Battement de cœur",
    category: "loop",
    phase: "loop",
    durationMs: 1100,
    tracks: { scale: keys([0, 1], [0.14, 1.12, "outSine"], [0.28, 1, "inSine"], [0.42, 1.08, "outSine"], [0.7, 1, "inSine"], [1, 1]) },
    params: [intensity(["scale"])],
  }),
  anyTarget({
    // Allumé, éteint, allumé : un voyant qui clignote.
    id: "blink",
    label: "Clignotant",
    category: "loop",
    phase: "loop",
    durationMs: 1000,
    tracks: { opacity: keys([0, 1], [0.5, 0, HOLD], [1, 1, HOLD]) },
  }),
  anyTarget({
    // Il saute sur place et s'écrase un peu en retombant, encore et encore.
    id: "bounce-loop",
    label: "Rebond en boucle",
    category: "loop",
    phase: "loop",
    durationMs: 900,
    tracks: (() => {
      const scaleY = keys([0, 1], [0.8, 1], [0.88, 0.9, "outQuad"], [1, 1, "inOutQuad"]);
      return { y: keys([0, 0], [0.4, -0.08, "outQuad"], [0.8, 0, "inQuad"], [1, 0]), scaleY, scaleX: inverse(scaleY) };
    })(),
    params: [intensity(["y", "scaleX", "scaleY"])],
  }),
  anyTarget({
    // Un tremblement nerveux et continu, à douze secousses par seconde.
    id: "shake-loop",
    label: "Tremblement continu",
    category: "loop",
    phase: "loop",
    durationMs: 1000,
    tracks: { x: jitter(41, 12, 0.008), y: jitter(43, 12, 0.006) },
    params: [intensity(["x", "y"])],
  }),
  {
    // Chaque lettre tressaille de côté et s'incline, chacune à son moment.
    id: "jitter-letters",
    label: "Lettres nerveuses",
    category: "loop",
    phase: "loop",
    target: "text",
    durationMs: 700,
    split: "char",
    stagger: { eachMs: 25, from: "random" },
    tracks: { x: jitter(53, 7, 0.08), y: jitter(59, 7, 0.06), rotate: jitter(61, 7, 6) },
    params: [intensity(["x", "y", "rotate"])],
  },
  {
    // En apesanteur : les lettres flottent, s'écartent et tournent doucement.
    id: "drift-letters",
    label: "Apesanteur",
    category: "loop",
    phase: "loop",
    target: "text",
    durationMs: 4000,
    split: "char",
    stagger: { eachMs: 120, from: "random" },
    tracks: {
      x: wave(0.12),
      // Deux allers-retours verticaux par passage : une boucle en huit.
      y: keys([0, 0], [0.125, -0.15, "inOutSine"], [0.25, 0, "inOutSine"], [0.375, 0.15, "inOutSine"], [0.5, 0, "inOutSine"], [0.625, -0.15, "inOutSine"], [0.75, 0, "inOutSine"], [0.875, 0.15, "inOutSine"], [1, 0, "inOutSine"]),
      rotate: wave(-12),
    },
    params: [intensity(["x", "y", "rotate"])],
  },
];

// ─── Grilles ─────────────────────────────────────────────────────

const grid = (columns: number, rows: number, order: MotionGrid["order"], alternate?: MotionGrid["alternate"]): MotionGrid =>
  alternate ? { columns, rows, order, alternate } : { columns, rows, order };

const GRIDS: MotionPreset[] = [
  anyTarget({
    // Les carreaux naissent au centre, puis anneau par anneau vers les bords.
    id: "grid-center-in",
    label: "Grille depuis le centre",
    category: "scale",
    phase: "in",
    durationMs: 720,
    ease: "outBack",
    grid: grid(3, 3, "center"),
    stagger: { eachMs: 70, from: "start" },
    tracks: { scale: keys([0, 0.3], [1, 1]), y: keys([0, 0.11], [1, 0, "outCubic"]), opacity: keys([0, 0], [0.4, 1, "linear"], [1, 1]) },
    params: [intensity(["scale", "y"])],
  }),
  anyTarget({
    // Rangée après rangée, chaque carreau glisse depuis la gauche.
    id: "grid-rows-in",
    label: "Grille ligne à ligne",
    category: "slide",
    phase: "in",
    durationMs: 600,
    ease: "outCubic",
    grid: grid(3, 3, "rows"),
    stagger: { eachMs: 24, from: "start" },
    tracks: { x: keys([0, -0.17], [1, 0]), opacity: keys([0, 0], [1, 1]) },
    params: [intensity(["x"])],
  }),
  anyTarget({
    // Une spirale part du carreau central et fait le tour de la grille.
    id: "grid-spiral-in",
    label: "Grille en spirale",
    category: "scale",
    phase: "in",
    durationMs: 600,
    ease: "outBack",
    grid: grid(3, 3, "spiral"),
    stagger: { eachMs: 62, from: "start" },
    tracks: { scale: keys([0, 0.35], [1, 1]), opacity: keys([0, 0], [0.35, 1, "linear"], [1, 1]) },
    params: [intensity(["scale"])],
  }),
  anyTarget({
    // De petits carreaux apparaissent dans le désordre et reconstituent l'image.
    id: "pixel-assemble-in",
    label: "Assemblage en pixels",
    category: "scale",
    phase: "in",
    durationMs: 480,
    ease: "outCubic",
    grid: grid(4, 4, "random"),
    stagger: { eachMs: 28, from: "start" },
    tracks: { scale: keys([0, 0], [1, 1]), opacity: keys([0, 0], [1, 1]) },
  }),
  anyTarget({
    // Une vague en diagonale, du coin haut gauche au coin bas droit.
    id: "grid-diagonal-in",
    label: "Grille en diagonale",
    category: "slide",
    phase: "in",
    durationMs: 500,
    ease: "outCubic",
    grid: grid(4, 4, "diagonal"),
    stagger: { eachMs: 60, from: "start" },
    tracks: { y: keys([0, 0.06], [1, 0]), opacity: keys([0, 0], [1, 1]) },
    params: [intensity(["y"])],
  }),
  anyTarget({
    // Les rangées d'une liste montent chacune dans leur case, l'une après l'autre.
    id: "list-rise-in",
    label: "Liste qui monte",
    category: "slide",
    phase: "in",
    durationMs: 650,
    ease: "outCubic",
    grid: grid(1, 4, "rows"),
    stagger: { eachMs: 82, from: "start" },
    tracks: { y: keys([0, 0.24], [1, 0]), opacity: keys([0, 0], [0.6, 1, "linear"], [1, 1]) },
    params: [intensity(["y"])],
  }),
  anyTarget({
    // Des tranches arrivent alternativement de gauche et de droite et se rejoignent.
    id: "slices-in",
    label: "Tranches alternées",
    category: "glitch",
    phase: "in",
    durationMs: 730,
    ease: "outCubic",
    grid: grid(1, 4, "rows", "rows"),
    stagger: { eachMs: 36, from: "start" },
    tracks: { x: keys([0, -0.21], [1, 0]), opacity: keys([0, 0], [0.5, 1, "linear"], [1, 1]) },
    params: [intensity(["x"])],
  }),
  anyTarget({
    // Six lamelles foncent depuis les deux bords et assemblent le titre.
    id: "split-bars-in",
    label: "Titre en lamelles",
    category: "title",
    phase: "in",
    durationMs: 800,
    ease: "outExpo",
    grid: grid(1, 6, "rows", "rows"),
    stagger: { eachMs: 60, from: "start" },
    tracks: { dx: keys([0, -1.2], [1, 0]) },
  }),
];

/** Préréglages de mise en avant, de boucle et de grille, dans l'ordre du sélecteur. */
export const ATTENTION_PRESETS: MotionPreset[] = [...EMPHASIS, ...LOOPS, ...GRIDS];
