/**
 * Préréglages d'éléments : images, vidéos, formes et textes en bloc.
 *
 * Entrées, sorties, mises en avant et boucles d'un élément entier. Les
 * longueurs sont des fractions du petit côté du cadre (`units: "frame"`) :
 * une entrée « depuis la gauche » parcourt la même part de l'image en 9:16
 * comme en 16:9. Les durées sont celles d'une lecture confortable ; la durée
 * choisie dans l'inspecteur étire ou resserre l'animation sans la changer.
 *
 * Les mouvements qui ne se décrivent pas en deux ou trois images clés
 * (ressorts, oscillations amorties, étirement selon la vitesse) sont
 * échantillonnés une fois, au chargement : le préréglage reste une donnée
 * figée, lue par l'interpréteur comme les autres.
 *
 * Tous les éléments pivotent et changent d'échelle autour de leur centre :
 * le moteur n'a pas de point de pivot réglable.
 */

import { cubicBezier, EASINGS, springEase, springSettleSeconds } from "../easing";
import type {
  ClipInsets,
  EaseSpec,
  Keyframe,
  KeyframeValue,
  MotionCategory,
  MotionDirection,
  MotionParam,
  MotionPhase,
  MotionPreset,
  MotionProperty,
  MotionTracks,
} from "../types";

// ─── Courbes ─────────────────────────────────────────────────────

/** Entrée-sortie appuyée : démarre et s'arrête en douceur, très vive au milieu. */
const SMOOTH: EaseSpec = { bezier: [0.65, 0, 0.35, 1] };
/** Départ très vif, arrivée qui n'en finit pas de se poser. */
const SNAP: EaseSpec = { bezier: [0.16, 1, 0.3, 1] };
/** Arrivée avec un léger dépassement. */
const OVERSHOOT: EaseSpec = { bezier: [0.34, 1.56, 0.64, 1] };
/** Départ avec un léger recul. */
const PULLBACK: EaseSpec = { bezier: [0.36, 0, 0.66, -0.56] };
/** Recul au départ, dépassement à l'arrivée. */
const ANTICIPATE: EaseSpec = { bezier: [0.68, -0.6, 0.32, 1.6] };
/** Freinage d'une toupie : vite tout de suite, puis un long ralenti. */
const BRAKE: EaseSpec = { bezier: [0.3, 0.45, 0.15, 1] };

const smooth = cubicBezier(0.65, 0, 0.35, 1);
const overshoot = cubicBezier(0.34, 1.56, 0.64, 1);
const pullback = cubicBezier(0.36, 0, 0.66, -0.56);

// ─── Outils ──────────────────────────────────────────────────────

/** Arrondi à 1e-5 ; « || 0 » chasse le zéro négatif. */
const round = (value: number) => Math.round(value * 1e5) / 1e5 || 0;

/** Image clé. */
const k = (at: number, value: KeyframeValue, ease?: EaseSpec): Keyframe =>
  ease === undefined ? { at: round(at), value } : { at: round(at), value, ease };

/**
 * Échantillonne une fonction de l'avancement en images clés reliées en
 * ligne droite, de `from` à `to` (de 0 à 1 par défaut).
 */
function sampled(fn: (p: number) => number, count: number, from = 0, to = 1): Keyframe[] {
  return Array.from({ length: count + 1 }, (_, index) => {
    const p = from + ((to - from) * index) / count;
    return k(p, round(fn(p)), "linear");
  });
}

/** Ressort amorti de masse 1 : courbe, durée de stabilisation et position à un instant. */
function spring(stiffness: number, damping: number) {
  const options = { mass: 1, stiffness, damping };
  const seconds = springSettleSeconds(options);
  const curve = springEase(options);
  return {
    ease: { spring: options } as EaseSpec,
    seconds,
    /** Avancement de 0 vers 1, `time` secondes après le départ. */
    at: (time: number) => curve(Math.min(1, Math.max(0, time / seconds))),
  };
}

/** Une période de sinus : repos, sommet, repos, creux, repos (pour les boucles). */
function wave(amplitude: number, rest = 0): Keyframe[] {
  return [
    k(0, rest),
    k(0.25, round(rest + amplitude), "outSine"),
    k(0.5, rest, "inSine"),
    k(0.75, round(rest - amplitude), "outSine"),
    k(1, rest, "inSine"),
  ];
}

/**
 * Oscillation amortie `amplitude·e^(−decay·t)·sin(2πt/period)` sur `total`
 * secondes, en images clés aux quarts de période : un sinus entre deux, ce
 * qui suffit à l'œil.
 */
function dampedSine(amplitude: number, decay: number, period: number, total: number): Keyframe[] {
  const frames: Keyframe[] = [k(0, 0)];
  for (let quarter = 1; (quarter * period) / 4 < total - 1e-9; quarter++) {
    const time = (quarter * period) / 4;
    const peak = quarter % 2 === 1;
    const sign = quarter % 4 === 1 ? 1 : -1;
    const value = peak ? round(sign * amplitude * Math.exp(-decay * time)) : 0;
    frames.push(k(time / total, value, peak ? "outSine" : "inSine"));
  }
  frames.push(k(1, 0, "inSine"));
  return frames;
}

/** Images clés données en secondes, ramenées à l'avancement sur `total` secondes. */
const timed = (total: number, frames: [seconds: number, value: KeyframeValue, ease?: EaseSpec][]): Keyframe[] =>
  frames.map(([seconds, value, ease]) => k(seconds / total, value, ease));

/** Inverse d'une échelle, pour garder la surface d'un élément qui s'écrase. */
const inverse = (frames: Keyframe[]): Keyframe[] =>
  frames.map((frame) => ({ ...frame, value: typeof frame.value === "number" ? round(1 / frame.value) : frame.value }));

const intensity = (affects: MotionProperty[], max = 2): MotionParam => ({
  id: "intensity",
  kind: "amount",
  label: "Intensité",
  min: 0,
  max,
  default: 1,
  affects,
});

const direction = (fallback: MotionDirection): MotionParam => ({
  id: "direction",
  kind: "direction",
  label: "Direction",
  default: fallback,
});

interface Definition {
  id: string;
  label: string;
  category: MotionCategory;
  phase: MotionPhase;
  durationMs: number;
  ease?: EaseSpec;
  tracks: MotionTracks;
  params?: MotionParam[];
}

/** Un préréglage d'élément : toute cible, longueurs en part du cadre. */
const element = (definition: Definition): MotionPreset => ({
  target: "any",
  units: "frame",
  ...definition,
  durationMs: Math.round(definition.durationMs),
});

// ─── Flous et lumières ───────────────────────────────────────────

const BLUR_AND_LIGHT: MotionPreset[] = [
  element({
    id: "rise-blur",
    label: "Montée floue",
    category: "blur-light",
    phase: "in",
    durationMs: 900,
    ease: "outSine",
    tracks: {
      opacity: [k(0, 0), k(1, 1)],
      y: [k(0, 0.12), k(1, 0)],
      blur: [k(0, 0.04), k(1, 0)],
    },
    params: [intensity(["y", "blur"]), direction("up")],
  }),
  element({
    id: "focus-in",
    label: "Mise au point",
    category: "blur-light",
    phase: "in",
    durationMs: 1000,
    ease: "outSine",
    tracks: {
      opacity: [k(0, 0.2), k(1, 1)],
      blur: [k(0, 0.02), k(1, 0)],
    },
    params: [intensity(["blur"])],
  }),
  element({
    id: "zoom-blur-in",
    label: "Zoom flou",
    category: "blur-light",
    phase: "in",
    durationMs: 720,
    ease: "outQuart",
    tracks: {
      opacity: [k(0, 0), k(1, 1)],
      scale: [k(0, 0.65), k(1, 1)],
      blur: [k(0, 0.035), k(1, 0)],
    },
    params: [intensity(["scale", "blur"], 1.5)],
  }),
  element({
    id: "depth-surge",
    label: "Surgissement du fond",
    category: "blur-light",
    phase: "in",
    durationMs: 740,
    ease: "inOutQuint",
    tracks: {
      opacity: [k(0, 0.2), k(1, 1)],
      scale: [k(0, 0.111), k(1, 1)],
      blur: [k(0, 0.03), k(1, 0)],
    },
    params: [intensity(["blur"])],
  }),
  element({
    id: "focus-pull",
    label: "Recul de mise au point",
    category: "blur-light",
    phase: "in",
    durationMs: 760,
    ease: SMOOTH,
    tracks: {
      scale: [k(0, 2.2), k(1, 1)],
      blur: [k(0, 0.04), k(1, 0)],
      brightness: [k(0, 1.35), k(1, 1)],
    },
    params: [intensity(["scale", "blur", "brightness"])],
  }),
  element({
    id: "bloom-in",
    label: "Éclosion lumineuse",
    category: "blur-light",
    phase: "in",
    durationMs: 780,
    ease: "outQuart",
    tracks: {
      opacity: [k(0, 0), k(0.02, 1, "linear")],
      scale: [k(0, 0.82), k(1, 1)],
      brightness: [k(0, 3), k(1, 1)],
      blur: [k(0, 0.02), k(1, 0)],
    },
    params: [intensity(["scale", "brightness", "blur"])],
  }),
  element({
    // Allumage d'un tube : quatre ratés de plus en plus brefs, puis la pleine lumière.
    id: "neon-on",
    label: "Néon qui s'allume",
    category: "blur-light",
    phase: "in",
    durationMs: 900,
    ease: "linear",
    tracks: {
      opacity: [
        k(0, 0.2),
        k(0.09, 0.2),
        k(0.09, 1),
        k(0.14, 1),
        k(0.14, 0.35),
        k(0.22, 0.35),
        k(0.22, 1),
        k(0.31, 1),
        k(0.31, 0.55),
        k(0.42, 0.55),
        k(0.42, 1),
        k(1, 1),
      ],
    },
  }),
  element({
    // Éclat bref : la luminosité monte et redescend, l'élément tressaille au début.
    id: "flash-pulse",
    label: "Éclat",
    category: "blur-light",
    phase: "emphasis",
    durationMs: 560,
    tracks: {
      brightness: [
        ...sampled((p) => 1 + 1.2 * Math.sin(Math.min(1, (p * 0.56) / 0.32) * Math.PI) ** 0.7, 24, 0, 0.32 / 0.56),
        k(1, 1),
      ],
      scale: [
        ...sampled((p) => {
          const time = p * 0.56;
          return 1 + 0.14 * Math.exp(-7 * time) * Math.sin(Math.min(22 * time, Math.PI));
        }, 12, 0, Math.PI / 22 / 0.56),
        k(1, 1),
      ],
    },
    params: [intensity(["brightness", "scale"])],
  }),
];

// ─── Glissements et trajectoires ─────────────────────────────────

const SPRING_LOOSE = spring(80, 10);
const SPRING_CARD = spring(240, 22);
const SPRING_POP = spring(160, 12);
const SLING_MOVE = spring(420, 20);
const SLING_STRETCH = spring(420, 12);
const RUBBER = spring(300, 11);
const RUBBER_PULL = 0.38;

/** Zigzag : trois segments droits, parcourus à vitesse adoucie. */
const ZIGZAG: [number, number][] = [
  [0, 0],
  [0.3134, -0.16],
  [0.6418, 0.14],
  [1, 0],
];
function zigzagY(u: number): number {
  for (let i = 1; i < ZIGZAG.length; i++) {
    const [x0, y0] = ZIGZAG[i - 1];
    const [x1, y1] = ZIGZAG[i];
    if (u <= x1) return y0 + ((y1 - y0) * (u - x0)) / (x1 - x0);
  }
  return 0;
}

/** Sauts de puce : trois bonds de 0,25 s séparés d'un appui de 0,05 s. */
function hopTracks(): MotionTracks {
  const total = 0.97;
  const stops = [-1, -0.665, -0.335, 0];
  const x: Keyframe[] = [k(0, stops[0])];
  const y: Keyframe[] = [];
  const scaleY: Keyframe[] = [k(0, 1)];
  for (let hop = 0; hop < 3; hop++) {
    const start = hop * 0.3;
    const land = start + 0.25;
    x.push(...timed(total, [[land, stops[hop + 1], "outCubic"]]));
    if (hop < 2) x.push(...timed(total, [[start + 0.3, stops[hop + 1]]]));
    y.push(...timed(total, [[start, 0], [start + 0.125, -0.14, "outSine"], [land, 0, "inSine"]]));
    scaleY.push(...timed(total, [[land, 1], [land + 0.06, 0.92, "outSine"], [land + 0.12, 1, "inSine"]]));
  }
  return { x, y, scaleY, scaleX: inverse(scaleY) };
}

const SLIDES: MotionPreset[] = [
  element({
    id: "slide-snap",
    label: "Glissement vif",
    category: "slide",
    phase: "in",
    durationMs: 380,
    ease: SNAP,
    tracks: { opacity: [k(0, 0), k(1, 1)], x: [k(0, -0.215), k(1, 0)] },
    params: [intensity(["x"]), direction("right")],
  }),
  element({
    id: "travel-linear",
    label: "Traversée régulière",
    category: "slide",
    phase: "in",
    durationMs: 800,
    ease: "linear",
    tracks: { x: [k(0, -1), k(1, 0)] },
    params: [intensity(["x"]), direction("right")],
  }),
  element({
    id: "travel-smooth",
    label: "Traversée douce",
    category: "slide",
    phase: "in",
    durationMs: 760,
    ease: SMOOTH,
    tracks: { x: [k(0, -1), k(1, 0)] },
    params: [intensity(["x"]), direction("right")],
  }),
  element({
    id: "travel-glide",
    label: "Traversée freinée",
    category: "slide",
    phase: "in",
    durationMs: 900,
    ease: "outCubic",
    tracks: { x: [k(0, -0.95), k(1, 0)] },
    params: [intensity(["x"]), direction("right")],
  }),
  element({
    // Trajectoire en cloche : avance régulière, montée puis descente paraboliques.
    id: "arc-in",
    label: "Arrivée en arc",
    category: "slide",
    phase: "in",
    durationMs: 900,
    tracks: {
      x: [k(0, -1.04), k(1, 0, "linear")],
      y: [k(0, 0), k(0.5, -0.31, "outQuad"), k(1, 0, "inQuad")],
    },
    params: [intensity(["x", "y"]), direction("right")],
  }),
  element({
    id: "zigzag-in",
    label: "Zigzag",
    category: "slide",
    phase: "in",
    durationMs: 920,
    tracks: {
      x: [k(0, -1.005), k(1, 0, "inOutSine")],
      y: sampled((p) => zigzagY(EASINGS.inOutSine(p)), 40),
    },
    params: [intensity(["x", "y"]), direction("right")],
  }),
  element({
    id: "hop-steps",
    label: "Sauts de puce",
    category: "slide",
    phase: "in",
    durationMs: 970,
    tracks: hopTracks(),
    params: [intensity(["x", "y"]), direction("right")],
  }),
  element({
    // Recul pour prendre de l'élan, puis départ franc ; l'élément s'étire avec la vitesse.
    id: "wind-up-in",
    label: "Élan",
    category: "slide",
    phase: "in",
    durationMs: 820,
    tracks: {
      x: [k(0, -0.9), k(0.1805, -1.065, "outQuad"), k(1, 0, SMOOTH)],
      scaleX: [
        k(0, 1.115),
        k(0.0125, 1.2, "linear"),
        k(0.06, 1.075, "linear"),
        k(0.1825, 0.915, "linear"),
        k(0.245, 1.024, "linear"),
        k(0.33, 1.071, "linear"),
        k(0.4025, 1.1365, "linear"),
        k(0.45, 1.2027, "linear"),
        k(0.4875, 1.275, "linear"),
        k(0.6825, 1.279, "linear"),
        k(0.7575, 1.162, "linear"),
        k(0.8175, 1.097, "linear"),
        k(0.9025, 1.039, "linear"),
        k(1, 1, "linear"),
      ],
      scaleY: [
        k(0, 0.897),
        k(0.0125, 0.831, "linear"),
        k(0.12, 1.042, "linear"),
        k(0.1825, 1.0925, "linear"),
        k(0.245, 0.977, "linear"),
        k(0.3775, 0.901, "linear"),
        k(0.4875, 0.784, "linear"),
        k(0.6825, 0.782, "linear"),
        k(0.83, 0.92, "linear"),
        k(1, 1, "linear"),
      ],
    },
    params: [intensity(["x"]), direction("right")],
  }),
  element({
    // Lancé lourd : dépasse un peu sa place, s'écrase à l'arrêt et vibre.
    id: "weighted-stop",
    label: "Arrêt lourd",
    category: "slide",
    phase: "in",
    durationMs: 800,
    tracks: {
      x: [k(0, -0.975), k(0.5775, 0.035, "outQuart"), k(0.85, 0, SMOOTH), k(1, 0)],
      scaleX: [
        k(0, 1),
        k(0.4, 1),
        k(0.5775, 0.82, "inQuad"),
        k(0.653, 1, "inSine"),
        k(0.7285, 1.0476, "outSine"),
        k(0.804, 1, "inSine"),
        k(0.8797, 0.9874, "outSine"),
        k(0.955, 1, "inSine"),
        k(1, 1),
      ],
      scaleY: [
        k(0, 1),
        k(0.4, 1),
        k(0.5775, 1.18, "inQuad"),
        k(0.653, 1, "inSine"),
        k(0.7285, 0.9524, "outSine"),
        k(0.804, 1, "inSine"),
        k(0.8797, 1.0126, "outSine"),
        k(0.955, 1, "inSine"),
        k(1, 1),
      ],
    },
    params: [intensity(["x"]), direction("right")],
  }),
  element({
    // Approche lente, aspiration soudaine, petit dépassement, puis l'élément colle.
    id: "magnet-snap",
    label: "Aimantation",
    category: "slide",
    phase: "in",
    durationMs: 640,
    tracks: {
      x: [k(0, -0.9), k(0.4063, -0.715, "inOutSine"), k(0.7563, 0.085, "inCubic"), k(0.9688, 0, "outCubic"), k(1, 0)],
      scaleX: [k(0, 1), k(0.6875, 1), k(0.8438, 0.86, "outSine"), k(1, 1, "inSine")],
      scaleY: [k(0, 1), k(0.6875, 1), k(0.8438, 1.14, "outSine"), k(1, 1, "inSine")],
    },
    params: [intensity(["x"]), direction("right")],
  }),
  element({
    id: "drift-in",
    label: "Glisse avec dérive",
    category: "slide",
    phase: "in",
    durationMs: 880,
    tracks: { x: [k(0, -0.85), k(0.6795, -0.035, "outCubic"), k(0.8398, 0.045, "outSine"), k(1, 0, SMOOTH)] },
    params: [intensity(["x"]), direction("right")],
  }),
  element({
    id: "overshoot-in",
    label: "Dépassement",
    category: "slide",
    phase: "in",
    durationMs: 600,
    tracks: { x: [k(0, -0.88), k(0.7167, 0.0704, "outCubic"), k(1, 0, SMOOTH)] },
    params: [intensity(["x"]), direction("right")],
  }),
  element({
    // Arrive trop loin, rebondit en arrière puis se cale ; écrasé à l'impact.
    id: "recoil-in",
    label: "Recul",
    category: "slide",
    phase: "in",
    durationMs: 520,
    tracks: {
      x: [k(0, -0.71), k(0.5, 0.11, "outQuart"), k(0.7192, -0.07, "outCubic"), k(1, 0, SMOOTH)],
      scaleX: [k(0, 1), k(0.3846, 1), k(0.5, 0.82, "linear"), k(0.6154, 1, "linear")],
      scaleY: [k(0, 1), k(0.3846, 1), k(0.5, 1.2195, "linear"), k(0.6154, 1, "linear")],
    },
    params: [intensity(["x"]), direction("right")],
  }),
  element({
    id: "spring-in",
    label: "Ressort",
    category: "slide",
    phase: "in",
    durationMs: SPRING_LOOSE.seconds * 1000,
    tracks: { x: [k(0, -0.9), k(1, 0, SPRING_LOOSE.ease)] },
    params: [intensity(["x"]), direction("right")],
  }),
  element({
    id: "spring-drop",
    label: "Arrivée à ressort",
    category: "slide",
    phase: "in",
    durationMs: SPRING_CARD.seconds * 1000,
    tracks: { y: [k(0, -0.37), k(1, 0, SPRING_CARD.ease)], opacity: [k(0, 0), k(0.03, 1, "linear")] },
    params: [intensity(["y"]), direction("down")],
  }),
  element({
    id: "surge-up",
    label: "Surgissement rebondi",
    category: "slide",
    phase: "in",
    durationMs: SPRING_POP.seconds * 1000,
    tracks: { y: [k(0, 0.29), k(1, 0, SPRING_POP.ease)], opacity: [k(0, 0), k(0.02, 1, "linear")] },
    params: [intensity(["y"]), direction("up")],
  }),
  element({
    // Lâché comme une fronde : la position se pose vite, l'étirement vibre plus longtemps.
    id: "slingshot-in",
    label: "Fronde",
    category: "slide",
    phase: "in",
    durationMs: SLING_STRETCH.seconds * 1000,
    tracks: {
      x: [k(0, 0.49), k(SLING_MOVE.seconds / SLING_STRETCH.seconds, 0, SLING_MOVE.ease), k(1, 0)],
      scaleX: [k(0, 1.5), k(1, 1, SLING_STRETCH.ease)],
      scaleY: sampled((p) => 1 / (1.5 - 0.5 * SLING_STRETCH.at(p * SLING_STRETCH.seconds)), 40),
    },
    params: [intensity(["x"]), direction("left")],
  }),
  element({
    // Tiré en s'étirant, puis relâché : il revient en vibrant jusqu'à sa place.
    id: "rubber-in",
    label: "Élastique",
    category: "slide",
    phase: "in",
    durationMs: (RUBBER_PULL + RUBBER.seconds) * 1000,
    tracks: (() => {
      const total = RUBBER_PULL + RUBBER.seconds;
      const pull = RUBBER_PULL / total;
      const stretch = (p: number) =>
        p < pull ? 1 + 0.8 * smooth(p / pull) : 1.8 - 0.8 * RUBBER.at((p - pull) * total);
      return {
        x: [k(0, -0.185), k(pull, 0.34, SMOOTH), k(1, 0, RUBBER.ease)],
        scaleX: [k(0, 1), k(pull, 1.8, SMOOTH), k(1, 1, RUBBER.ease)],
        scaleY: sampled((p) => 1 / stretch(p), 48),
      };
    })(),
    params: [intensity(["x"]), direction("right")],
  }),
  element({
    id: "dash-out",
    label: "Sortie filante",
    category: "slide",
    phase: "out",
    durationMs: 520,
    ease: "inQuart",
    tracks: { x: [k(0, 0), k(1, 1.05)], opacity: [k(0, 1), k(1, 0)] },
    params: [intensity(["x"]), direction("right")],
  }),
  element({
    id: "cascade-in",
    label: "Chute en cascade",
    category: "slide",
    phase: "in",
    durationMs: 640,
    tracks: {
      y: [k(0, -0.1), k(0.6, 0.015, "outQuart"), k(1, 0, SMOOTH)],
      opacity: [k(0, 0), k(0.625, 1, "outCubic")],
    },
    params: [intensity(["y"]), direction("down")],
  }),
  element({
    id: "rise-grow",
    label: "Montée en grandissant",
    category: "slide",
    phase: "in",
    durationMs: 680,
    ease: "outCubic",
    tracks: {
      y: [k(0, 0.09), k(1, 0)],
      scale: [k(0, 0.78), k(1, 1)],
      opacity: [...sampled((p) => Math.min(1, 1.8 * EASINGS.outCubic(p)), 6, 0, 0.2369), k(1, 1)],
    },
    params: [intensity(["y", "scale"]), direction("up")],
  }),
  element({
    id: "diagonal-in",
    label: "Arrivée en biais",
    category: "slide",
    phase: "in",
    durationMs: 470,
    ease: "outQuart",
    tracks: {
      x: [k(0, -0.09), k(1, 0)],
      y: [k(0, 0.09), k(1, 0)],
      opacity: [...sampled((p) => Math.min(1, 2 * EASINGS.outQuart(p)), 6, 0, 0.159), k(1, 1)],
    },
    params: [intensity(["x", "y"]), direction("up")],
  }),
  element({
    // Lancé à toute vitesse, l'élément s'allonge dans le sens du mouvement.
    id: "stretch-travel",
    label: "Étirement de vitesse",
    category: "slide",
    phase: "in",
    durationMs: 700,
    tracks: {
      x: [k(0, -1), k(1, 0, ANTICIPATE)],
      scaleX: [
        k(0, 1),
        k(0.015, 1.11, "linear"),
        k(0.115, 1.016, "linear"),
        k(0.2, 0.892, "linear"),
        k(0.2575, 0.992, "linear"),
        k(0.33, 1.23, "linear"),
        k(0.3875, 1.497, "linear"),
        k(0.615, 1.494, "linear"),
        k(0.7, 1.116, "linear"),
        k(0.8, 0.892, "linear"),
        k(0.885, 1.016, "linear"),
        k(0.985, 1.112, "linear"),
        k(1, 1, "linear"),
      ],
      scaleY: [
        k(0, 1),
        k(0.015, 0.932, "linear"),
        k(0.115, 0.99, "linear"),
        k(0.2, 1.066, "linear"),
        k(0.3, 0.929, "linear"),
        k(0.3875, 0.697, "linear"),
        k(0.615, 0.699, "linear"),
        k(0.7, 0.929, "linear"),
        k(0.8, 1.066, "linear"),
        k(0.885, 0.99, "linear"),
        k(0.985, 0.932, "linear"),
        k(1, 1, "linear"),
      ],
    },
    params: [intensity(["x"]), direction("right")],
  }),
];

// ─── Échelles, chutes et rebonds ─────────────────────────────────

const IMPACT_SETTLE = spring(300, 16);
const STAR_SETTLE = spring(400, 14);
const COMPRESS_SETTLE = spring(260, 14);

/**
 * Écrasement bref autour de chaque contact : `[instant, creux]`, demi-largeur
 * `width`. Deux contacts rapprochés se partagent l'intervalle sans se chevaucher.
 */
function squashes(contacts: [at: number, depth: number][], width: number): Keyframe[] {
  const frames: Keyframe[] = [k(0, 1)];
  let free = 0;
  contacts.forEach(([at, depth], index) => {
    const next = contacts[index + 1]?.[0] ?? 1;
    const end = Math.min(1, at + width, (at + next) / 2);
    frames.push(k(Math.max(free, at - width), 1), k(at, round(1 - depth), "linear"), k(end, 1, "linear"));
    free = end;
  });
  return frames;
}

const SCALES: MotionPreset[] = [
  element({
    id: "pop-in",
    label: "Éclosion",
    category: "scale",
    phase: "in",
    durationMs: 520,
    tracks: {
      scale: [k(0, 0.05), k(0.7192, 1.16, "outCubic"), k(1, 1, SMOOTH)],
      opacity: [k(0, 0), k(0.2308, 1, SMOOTH)],
    },
  }),
  element({
    id: "chip-pop",
    label: "Pastille",
    category: "scale",
    phase: "in",
    durationMs: 280,
    tracks: { scale: [k(0, 0), k(1, 1, { back: 2.2, mode: "out" })] },
  }),
  element({
    id: "punch-in",
    label: "Coup de poing",
    category: "scale",
    phase: "in",
    durationMs: 480,
    tracks: {
      scale: [k(0, 0.18), k(0.6229, 1.32, "outCubic"), k(1, 1, SMOOTH)],
      opacity: [k(0, 0), k(0.1667, 1, SMOOTH)],
    },
  }),
  element({
    id: "elastic-in",
    label: "Éclosion élastique",
    category: "scale",
    phase: "in",
    durationMs: 900,
    tracks: {
      scale: [
        k(0, 0.1),
        k(0.45, 1.2, "outCubic"),
        k(0.68, 0.92, "inOutSine"),
        k(0.84, 1.06, "inOutSine"),
        k(1, 1, "inOutSine"),
      ],
    },
  }),
  element({
    id: "unfold-x",
    label: "Dépliage horizontal",
    category: "scale",
    phase: "in",
    durationMs: 650,
    tracks: { scaleX: [k(0, 0.04), k(0.78, 1.08, "outQuart"), k(1, 1, SMOOTH)] },
  }),
  element({
    id: "unfold-y",
    label: "Dépliage vertical",
    category: "scale",
    phase: "in",
    durationMs: 520,
    tracks: {
      scaleY: sampled((p) => Math.max(0.08, overshoot(p)), 32),
      opacity: [...sampled((p) => Math.min(1, 3 * Math.max(0, overshoot(p))), 8, 0, 0.16), k(1, 1)],
    },
  }),
  element({
    id: "fold-out",
    label: "Repli vertical",
    category: "scale",
    phase: "out",
    durationMs: 560,
    tracks: {
      scaleY: [k(0, 1), k(1, 0.05, PULLBACK)],
      opacity: sampled((p) => Math.min(1, Math.max(0, 1 - 1.1 * pullback(p))), 24),
    },
  }),
  element({
    id: "shrink-out",
    label: "Rétrécissement en fondu",
    category: "scale",
    phase: "out",
    durationMs: 600,
    ease: "inCubic",
    tracks: {
      scale: [k(0, 1), k(1, 0.2)],
      opacity: [k(0, 1), k(1, 0)],
      blur: [k(0, 0), k(1, 0.015)],
    },
    params: [{ id: "softness", kind: "amount", label: "Flou", min: 0, max: 3, default: 1, affects: ["blur"] }],
  }),
  element({
    // Tombe en s'allongeant, s'écrase au sol puis reprend sa forme en rebondissant un peu.
    id: "drop-squash",
    label: "Chute écrasée",
    category: "scale",
    phase: "in",
    durationMs: 620,
    tracks: {
      y: [k(0, -0.495), k(0.65, 0, "inQuad"), k(1, 0)],
      scaleX: [k(0, 1), k(0.65, 0.909, "inQuart"), k(0.65, 1.55), k(1, 1, OVERSHOOT)],
      scaleY: [k(0, 1), k(0.65, 1.1, "inQuart"), k(0.65, 0.55), k(1, 1, OVERSHOOT)],
    },
    params: [intensity(["y"]), direction("down")],
  }),
  element({
    id: "drop-settle",
    label: "Chute amortie",
    category: "scale",
    phase: "in",
    durationMs: 930,
    tracks: {
      y: [k(0, -0.47), k(0.3441, 0, "inQuad"), k(1, 0)],
      scaleX: [k(0, 1), k(0.3441, 0.909, "inQuart"), k(0.3441, 1), k(0.4086, 1.45, "outCubic"), k(1, 1, "outCubic")],
      scaleY: [k(0, 1), k(0.3441, 1.1, "inQuart"), k(0.3441, 1), k(0.4086, 0.62, "outCubic"), k(1, 1, "outCubic")],
    },
    params: [intensity(["y"]), direction("down")],
  }),
  element({
    // Lâché de haut : deux rebonds paraboliques, écrasé à chaque contact.
    id: "drop-bounce",
    label: "Chute rebondissante",
    category: "scale",
    phase: "in",
    durationMs: 870,
    tracks: {
      y: [
        k(0, -0.5),
        k(0.3299, 0, "inQuad"),
        k(0.4948, -0.275, "outQuad"),
        k(0.6598, 0, "inQuad"),
        k(0.8011, -0.125, "outQuad"),
        k(0.9425, 0, "inQuad"),
        k(1, 0),
      ],
      scaleY: squashes([[0.3299, 0.3], [0.6598, 0.18], [0.9425, 0.08]], 0.0575),
      scaleX: inverse(squashes([[0.3299, 0.3], [0.6598, 0.18], [0.9425, 0.08]], 0.0575)),
    },
    params: [intensity(["y"]), direction("down")],
  }),
  element({
    // Avance en rebondissant trois fois, de plus en plus bas.
    id: "hop-bounce",
    label: "Rebonds en avant",
    category: "scale",
    phase: "in",
    durationMs: 780,
    tracks: {
      x: [k(0, -0.7), k(1, 0, "linear")],
      y: [
        k(0, -0.53),
        k(0.341, 0, "inQuad"),
        k(0.4853, -0.26, "outQuad"),
        k(0.6295, 0, "inQuad"),
        k(0.7205, -0.11, "outQuad"),
        k(0.8115, 0, "inQuad"),
        k(0.8667, -0.04, "outQuad"),
        k(0.9218, 0, "inQuad"),
        k(1, 0),
      ],
      scaleY: squashes([[0.341, 0.32], [0.6295, 0.2], [0.8115, 0.1], [0.9218, 0.04]], 0.0641),
      scaleX: inverse(squashes([[0.341, 0.32], [0.6295, 0.2], [0.8115, 0.1], [0.9218, 0.04]], 0.0641)),
    },
    params: [intensity(["x", "y"]), direction("right")],
  }),
  element({
    id: "zoom-settle",
    label: "Recul net",
    category: "scale",
    phase: "in",
    durationMs: 250,
    tracks: { scale: [k(0, 1.5), k(1, 1, SNAP)], opacity: [k(0, 0), k(0.32, 1, "linear")] },
    params: [intensity(["scale"])],
  }),
];

// ─── Impacts ─────────────────────────────────────────────────────

const STAMP_HIT = 0.55;
const SQUASH_HIT = 0.3273;

const IMPACTS: MotionPreset[] = [
  element({
    // Jaillit plus grand que nature, puis se pose en vibrant.
    id: "impact-pop",
    label: "Percussion",
    category: "impact",
    phase: "in",
    durationMs: (0.23 + IMPACT_SETTLE.seconds) * 1000,
    tracks: {
      scale: [k(0, 0), k(0.23 / (0.23 + IMPACT_SETTLE.seconds), 1.28, "outCubic"), k(1, 1, IMPACT_SETTLE.ease)],
    },
  }),
  element({
    // Tombe du premier plan comme un tampon et tremble à peine au contact.
    id: "stamp",
    label: "Tampon",
    category: "impact",
    phase: "in",
    durationMs: 400,
    tracks: {
      scale: [
        k(0, 2.6),
        k(STAMP_HIT, 1, "inQuad"),
        k(STAMP_HIT, 0.94),
        k(0.6482, 1, "inSine"),
        k(0.7464, 1.0146, "outSine"),
        k(0.8445, 1, "inSine"),
        k(0.9426, 0.9965, "outSine"),
        k(1, 1, "inSine"),
      ],
      opacity: [k(0, 0), k(0.25, 1, "linear")],
    },
    params: [intensity(["scale"], 1.5)],
  }),
  element({
    // Même chute, mais l'élément s'écrase à l'impact et oscille en largeur.
    id: "stamp-squash",
    label: "Tampon écrasé",
    category: "impact",
    phase: "in",
    durationMs: 550,
    tracks: {
      scale: [k(0, 2.6), k(SQUASH_HIT, 1, "inQuad")],
      scaleX: [
        k(0, 1),
        k(SQUASH_HIT, 1),
        k(SQUASH_HIT, 1.14),
        k(0.4113, 1, "inSine"),
        k(0.4953, 0.9616, "outSine"),
        k(0.5793, 1, "inSine"),
        k(0.6633, 1.0105, "outSine"),
        k(0.7473, 1, "inSine"),
        k(0.8313, 0.9971, "outSine"),
        k(0.9153, 1, "inSine"),
        k(1, 1),
      ],
      scaleY: [
        k(0, 1),
        k(SQUASH_HIT, 1),
        k(SQUASH_HIT, 0.86),
        k(0.4113, 1, "inSine"),
        k(0.4953, 1.0384, "outSine"),
        k(0.5793, 1, "inSine"),
        k(0.6633, 0.9895, "outSine"),
        k(0.7473, 1, "inSine"),
        k(0.8313, 1.0029, "outSine"),
        k(0.9153, 1, "inSine"),
        k(1, 1),
      ],
      opacity: [k(0, 0), k(0.1455, 1, "linear")],
    },
  }),
  element({
    // Tombe en tournant, s'enfonce un peu à l'arrivée et rebondit à sa taille.
    id: "star-land",
    label: "Atterrissage d'étoile",
    category: "impact",
    phase: "in",
    durationMs: (0.18 + STAR_SETTLE.seconds) * 1000,
    tracks: (() => {
      const total = 0.18 + STAR_SETTLE.seconds;
      const hit = 0.18 / total;
      return {
        scale: [k(0, 2.2), k(hit, 1, "inCubic"), k(hit, 0.8), k(1, 1, STAR_SETTLE.ease)],
        rotate: [k(0, -40), k(hit, 0, "inCubic")],
        opacity: [k(0, 0), k(0.08 / total, 1, SMOOTH)],
      };
    })(),
    params: [intensity(["rotate"])],
  }),
  element({
    // Écrasé latéralement par un choc, puis détendu en ressort.
    id: "compress",
    label: "Compression",
    category: "impact",
    phase: "emphasis",
    durationMs: (0.29 + COMPRESS_SETTLE.seconds) * 1000,
    tracks: (() => {
      const total = 0.29 + COMPRESS_SETTLE.seconds;
      return {
        scaleX: [k(0, 1), k(0.15 / total, 0.72, "inCubic"), k(0.29 / total, 1.14, "outCubic"), k(1, 1, COMPRESS_SETTLE.ease)],
        scaleY: [k(0, 1), k(0.15 / total, 1.126, "inCubic"), k(0.29 / total, 0.937, "outCubic"), k(1, 1, COMPRESS_SETTLE.ease)],
      };
    })(),
    params: [intensity(["scaleX", "scaleY"])],
  }),
];

// ─── Rotations ───────────────────────────────────────────────────

/** Amplitude d'un balancier : 0,7 radian, soit 40°. */
const SWING = 0.7;

const ROTATIONS: MotionPreset[] = [
  element({
    id: "half-turn-in",
    label: "Demi-tour",
    category: "rotate",
    phase: "in",
    durationMs: 800,
    ease: SMOOTH,
    tracks: { rotate: [k(0, -180), k(1, 0)] },
    params: [intensity(["rotate"])],
  }),
  element({
    id: "spin-brake",
    label: "Toupie freinée",
    category: "rotate",
    phase: "in",
    durationMs: 1200,
    ease: BRAKE,
    tracks: { rotate: [k(0, -720), k(1, 0)] },
    params: [intensity(["rotate"])],
  }),
  element({
    id: "wheel-spin",
    label: "Roue de la fortune",
    category: "rotate",
    phase: "in",
    durationMs: 2050,
    ease: "outQuart",
    tracks: { rotate: [k(0, -1180), k(1, 0)] },
    params: [intensity(["rotate"])],
  }),
  element({
    // Roule depuis le côté et se redresse en fin de course.
    id: "roll-in",
    label: "Roulade",
    category: "rotate",
    phase: "in",
    durationMs: 820,
    tracks: {
      x: [k(0, -0.95), k(0.8195, 0, "outCubic"), k(1, 0)],
      rotate: [k(0, -180), k(0.8195, -24, "outQuad"), k(1, 0, "outCubic")],
    },
    params: [intensity(["x", "rotate"]), direction("right")],
  }),
  element({
    // Remise en place : déplacé, penché et réduit, l'élément revient dans sa case.
    id: "settle-in",
    label: "Remise en place",
    category: "rotate",
    phase: "in",
    durationMs: 720,
    ease: ANTICIPATE,
    tracks: {
      x: [k(0, -0.0993), k(1, 0)],
      y: [k(0, 0.1165), k(1, 0)],
      rotate: [k(0, 12.2), k(1, 0)],
      scale: [k(0, 0.72), k(1, 1)],
    },
    params: [intensity(["x", "y", "rotate"])],
  }),
  element({
    id: "spin-once",
    label: "Tour complet",
    category: "rotate",
    phase: "emphasis",
    durationMs: 1000,
    ease: "inOutSine",
    // Un tour entier revient à l'angle de départ : la dernière image se pose à 0°.
    tracks: { rotate: [k(0, 0), k(0.9999, -360), k(1, 0, { steps: 1 })] },
  }),
  element({
    // Trois tours d'une pièce posée sur la tranche, vus de face : la largeur bat.
    id: "coin-flip",
    label: "Pièce qui tourne",
    category: "rotate",
    phase: "emphasis",
    durationMs: 900,
    tracks: { scaleX: sampled((p) => Math.max(0.03, Math.abs(Math.cos(6 * Math.PI * EASINGS.outQuart(p)))), 96) },
  }),
  element({
    id: "half-flip",
    label: "Retournement",
    category: "rotate",
    phase: "emphasis",
    durationMs: 800,
    // Demi-tour vu de face, avec la perspective : le bord qui avance grandit un peu.
    tracks: {
      scaleX: sampled((p) => Math.abs(Math.cos(Math.PI * smooth(smooth(p)))), 48),
      scaleY: sampled((p) => 1 / (1 - 0.2 * Math.abs(Math.sin(Math.PI * smooth(smooth(p))))), 48),
    },
  }),
];

// ─── Mise en avant ───────────────────────────────────────────────

const LIFT_UP = spring(220, 16);
const LIFT_DOWN = spring(220, 22);
const LIFT_HOLD = 1.5;

const ATTENTION: MotionPreset[] = [
  element({
    id: "tilt-react",
    label: "Inclinaison réflexe",
    category: "attention",
    phase: "emphasis",
    durationMs: 480,
    tracks: { rotate: [k(0, 0), k(0.25, 16, "outCubic"), k(0.625, -3, SMOOTH), k(1, 0, SMOOTH)] },
    params: [intensity(["rotate"])],
  }),
  element({
    id: "nod",
    label: "Hochement",
    category: "attention",
    phase: "emphasis",
    durationMs: 620,
    ease: "inOutSine",
    tracks: { rotate: [k(0, 0), k(0.3548, -16), k(0.7097, 5), k(1, 0)] },
    params: [intensity(["rotate"])],
  }),
  element({
    id: "side-nudge",
    label: "Coup de coude",
    category: "attention",
    phase: "emphasis",
    durationMs: 520,
    ease: "inOutSine",
    tracks: { x: [k(0, 0), k(0.3462, 0.045), k(0.6346, -0.015), k(1, 0)] },
    params: [intensity(["x"]), direction("right")],
  }),
  element({
    id: "refuse",
    label: "Refus",
    category: "attention",
    phase: "emphasis",
    durationMs: 540,
    ease: "inOutSine",
    tracks: { x: [k(0, 0), k(0.1667, -0.06), k(0.3704, 0.05), k(0.5741, -0.03), k(0.7778, 0.02), k(1, 0)] },
    params: [intensity(["x"]), direction("right")],
  }),
  element({
    id: "shake-decay",
    label: "Secousse amortie",
    category: "attention",
    phase: "emphasis",
    durationMs: 720,
    tracks: { x: dampedSine(0.1, 6, 0.2, 0.72) },
    params: [intensity(["x"]), direction("right")],
  }),
  element({
    // Petit saut sur place : tassement avant de partir, écrasement à l'atterrissage.
    id: "bell-hop",
    label: "Sautillement",
    category: "attention",
    phase: "emphasis",
    durationMs: 700,
    ease: "inOutSine",
    tracks: {
      y: [k(0, 0), k(0.1143, 0), k(0.4857, -0.08), k(0.7286, 0.01), k(1, 0)],
      scaleY: [
        k(0, 1),
        k(0.0714, 0.96, "outSine"),
        k(0.1429, 1, "inSine"),
        k(0.6286, 1),
        k(0.7714, 0.92, "outSine"),
        k(0.9143, 1, "inSine"),
      ],
      scaleX: [
        k(0, 1),
        k(0.0714, 1.0417, "outSine"),
        k(0.1429, 1, "inSine"),
        k(0.6286, 1),
        k(0.7714, 1.087, "outSine"),
        k(0.9143, 1, "inSine"),
      ],
    },
    params: [intensity(["y", "scaleX", "scaleY"])],
  }),
  element({
    id: "jelly",
    label: "Gelée",
    category: "attention",
    phase: "emphasis",
    durationMs: 760,
    ease: "inOutSine",
    tracks: {
      scaleX: [k(0, 1), k(0.3421, 1.25), k(0.5658, 0.88), k(0.7763, 1.06), k(1, 1)],
      scaleY: [k(0, 1), k(0.3421, 0.78), k(0.5658, 1.12), k(0.7763, 0.96), k(1, 1)],
    },
    params: [intensity(["scaleX", "scaleY"])],
  }),
  element({
    id: "beat",
    label: "Pulsation",
    category: "attention",
    phase: "emphasis",
    durationMs: 240,
    tracks: { scale: [k(0, 1), k(0.5, 1.06, "outSine"), k(1, 1, "inSine")] },
    params: [intensity(["scale"], 3)],
  }),
  element({
    id: "press",
    label: "Enfoncement",
    category: "attention",
    phase: "emphasis",
    durationMs: 480,
    tracks: { scale: [k(0, 1), k(0.25, 0.94, "outCubic"), k(0.375, 0.94), k(1, 1, "outCubic")] },
    params: [intensity(["scale"], 3)],
  }),
  element({
    // Tiré vers la droite en s'étirant, puis lâché : il revient en ressort à sa place.
    id: "pull-release",
    label: "Tirer-lâcher",
    category: "attention",
    phase: "emphasis",
    durationMs: 1350,
    tracks: {
      x: [
        k(0, 0),
        k(0.1025, 0.0141, "linear"),
        k(0.17, 0.0602, "linear"),
        k(0.2075, 0.1173, "linear"),
        k(0.25, 0.237, "linear"),
        k(0.28, 0.2978, "linear"),
        k(0.385, 0.4155, "linear"),
        k(0.45, 0.4481, "linear"),
        k(0.55, 0.46, "linear"),
        k(0.5925, 0.46, "linear"),
        k(0.6075, 0.4416, "linear"),
        k(0.63, 0.364, "linear"),
        k(0.675, 0.1532, "linear"),
        k(0.6975, 0.0641, "linear"),
        k(0.72, 0, "linear"),
        k(0.7475, -0.0465, "linear"),
        k(0.7875, -0.0605, "linear"),
        k(0.905, 0, "linear"),
        k(1, 0, "linear"),
      ],
      scaleX: [
        k(0, 1),
        k(0.06, 1.02, "linear"),
        k(0.12, 1.089, "linear"),
        k(0.1625, 1.183, "linear"),
        k(0.2075, 1.35, "linear"),
        k(0.335, 1.347, "linear"),
        k(0.3775, 1.205, "linear"),
        k(0.415, 1.116, "linear"),
        k(0.46, 1.047, "linear"),
        k(0.51, 1.009, "linear"),
        k(0.5925, 1, "linear"),
        k(0.615, 1.168, "linear"),
        k(0.6225, 1.18, "linear"),
        k(0.7175, 1.18, "linear"),
        k(0.785, 1.003, "linear"),
        k(0.845, 1.048, "linear"),
        k(1, 1, "linear"),
      ],
      scaleY: [
        k(0, 1),
        k(0.0525, 0.986, "linear"),
        k(0.11, 0.931, "linear"),
        k(0.155, 0.86, "linear"),
        k(0.2075, 0.741, "linear"),
        k(0.335, 0.742, "linear"),
        k(0.43, 0.918, "linear"),
        k(0.475, 0.969, "linear"),
        k(0.52, 0.995, "linear"),
        k(0.5925, 1, "linear"),
        k(0.615, 0.856, "linear"),
        k(0.6225, 0.847, "linear"),
        k(0.7175, 0.847, "linear"),
        k(0.785, 0.997, "linear"),
        k(0.845, 0.954, "linear"),
        k(1, 1, "linear"),
      ],
    },
    params: [intensity(["x"]), direction("right")],
  }),
  element({
    // Se soulève en ressort, reste en l'air un moment, puis se repose.
    id: "lift",
    label: "Soulèvement",
    category: "attention",
    phase: "emphasis",
    durationMs: (LIFT_HOLD + LIFT_DOWN.seconds) * 1000,
    tracks: (() => {
      const total = LIFT_HOLD + LIFT_DOWN.seconds;
      return {
        y: [k(0, 0), k(LIFT_UP.seconds / total, -0.07, LIFT_UP.ease), k(LIFT_HOLD / total, -0.07), k(1, 0, LIFT_DOWN.ease)],
      };
    })(),
    params: [intensity(["y"]), direction("up")],
  }),
];

// ─── Boucles ─────────────────────────────────────────────────────

/**
 * Tremblement lent : trois sommes de sinus de périodes différentes, toutes
 * multiples de la boucle, donc refermées. Amplitudes ramenées à leur maximum.
 */
function wobble(harmonics: [cycles: number, weight: number, phase: number][], amplitude: number): Keyframe[] {
  const raw = (p: number) =>
    harmonics.reduce((sum, [cycles, weight, phase]) => sum + weight * (Math.sin(2 * Math.PI * cycles * p + phase) - Math.sin(phase)), 0);
  let peak = 0;
  for (let i = 0; i <= 400; i++) peak = Math.max(peak, Math.abs(raw(i / 400)));
  return sampled((p) => (amplitude * raw(p)) / (peak || 1), 64);
}

const LOOPS: MotionPreset[] = [
  element({
    // Balancier accroché au-dessus de l'élément : il décrit un arc en s'inclinant.
    id: "pendulum",
    label: "Balancier",
    category: "loop",
    phase: "loop",
    durationMs: 2000,
    tracks: {
      x: sampled((p) => 0.55 * Math.sin(SWING * Math.sin(2 * Math.PI * p)), 48),
      y: sampled((p) => -0.55 * (1 - Math.cos(SWING * Math.sin(2 * Math.PI * p))), 48),
      rotate: sampled((p) => (-SWING * Math.sin(2 * Math.PI * p) * 180) / Math.PI, 48),
    },
    params: [intensity(["x", "y", "rotate"])],
  }),
  element({
    id: "rock",
    label: "Balancement",
    category: "loop",
    phase: "loop",
    durationMs: 790,
    tracks: { rotate: wave(3.44) },
    params: [intensity(["rotate"], 3)],
  }),
  element({
    id: "spin-loop",
    label: "Rotation continue",
    category: "loop",
    phase: "loop",
    durationMs: 2000,
    tracks: { rotate: [k(0, 0), k(0.9999, 359.964, "linear"), k(1, 0, { steps: 1 })] },
  }),
  element({
    // Orbite vue de biais : l'élément grossit quand il passe devant.
    id: "orbit-loop",
    label: "Orbite",
    category: "loop",
    phase: "loop",
    durationMs: 3000,
    tracks: {
      x: [k(0, 0), k(0.25, -0.45, "inSine"), k(0.5, -0.9, "outSine"), k(0.75, -0.45, "inSine"), k(1, 0, "outSine")],
      y: wave(0.1),
      scale: wave(0.375, 1),
    },
    params: [intensity(["x", "y", "scale"])],
  }),
  element({
    id: "hover",
    label: "Flottement",
    category: "loop",
    phase: "loop",
    durationMs: 3000,
    tracks: { y: wave(0.05) },
    params: [intensity(["y"], 3)],
  }),
  element({
    id: "breathe",
    label: "Respiration",
    category: "loop",
    phase: "loop",
    durationMs: 3000,
    tracks: { scale: wave(0.04, 1) },
    params: [intensity(["scale"], 3)],
  }),
  element({
    id: "drift-wobble",
    label: "Tremblement lent",
    category: "loop",
    phase: "loop",
    durationMs: 4000,
    tracks: {
      x: wobble([[1, 0.6, 0.4], [2, 0.3, 1.9], [3, 0.2, 4.1]], 0.0266),
      y: wobble([[1, 0.5, 2.2], [2, 0.35, 0.7], [3, 0.25, 3.3]], 0.014),
      rotate: wobble([[1, 0.55, 5.1], [2, 0.3, 2.6], [3, 0.2, 0.9]], 20),
    },
    params: [intensity(["x", "y", "rotate"])],
  }),
];

// ─── Masques ─────────────────────────────────────────────────────

const MASKS: MotionPreset[] = [
  element({
    // Deux volets s'écartent depuis le milieu.
    id: "curtain-open",
    label: "Ouverture en rideau",
    category: "mask",
    phase: "in",
    durationMs: 720,
    tracks: {
      clip: Array.from({ length: 25 }, (_, index) => {
        const p = index / 24;
        const side = round(0.5 * (1 - Math.min(1, 1.05 * smooth(p))));
        return k(p, [0, side, 0, side] as ClipInsets, "linear");
      }),
    },
  }),
  element({
    id: "wipe-soft",
    label: "Balayage doux",
    category: "mask",
    phase: "in",
    durationMs: 700,
    tracks: { wipe: sampled((p) => Math.min(1, 1.15 * EASINGS.inOutQuint(p)), 24) },
  }),
];

/** Préréglages d'éléments, dans l'ordre du sélecteur. */
export const ELEMENT_PRESETS: MotionPreset[] = [
  ...SLIDES,
  ...SCALES,
  ...IMPACTS,
  ...ROTATIONS,
  ...BLUR_AND_LIGHT,
  ...MASKS,
  ...ATTENTION,
  ...LOOPS,
];
