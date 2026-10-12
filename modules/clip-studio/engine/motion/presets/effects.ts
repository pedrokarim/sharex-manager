/**
 * Effets (étape A4) : brouillage et décodage, compteurs, frappe avec curseur,
 * surligneur, soulignement, bandeaux, lueurs, reflets, aberration
 * chromatique, glitch, ondes, masques de forme, ancrage et espacement par
 * lettre.
 *
 * Ces préréglages s'appuient sur ce que le moteur sait faire depuis A4 :
 * effets (`effects`), calques secondaires (`layers`), masques de forme
 * (`mask`) et ancrage (`origin`). Les longueurs d'un préréglage d'élément
 * sont des parts du petit côté du cadre ; celles d'un texte, des « em ».
 * Dans un calque, `x` et `y` sont des parts de la boîte de l'élément et `dx`
 * une part de la largeur du cadre.
 *
 * Un calque d'entrée qui reste (`persist`) garde à la fin exactement son
 * dernier état : l'élément ne saute pas quand l'entrée s'achève.
 */

import { springSettleSeconds } from "../easing";
import type { EaseSpec, Keyframe, KeyframeValue, MotionLayer, MotionPreset } from "../types";
import { ACCENT, HOLD, intensity, jitterValues, MASK_LINE_HEIGHT, tween } from "./text-library/shared";

// ─── Outils ──────────────────────────────────────────────────────

/** Images clés écrites en entier : `[instant, valeur, courbe]`. Rien n'est implicite. */
const keys = (...frames: [number, KeyframeValue, EaseSpec?][]): Keyframe[] =>
  frames.map(([at, value, ease]) => (ease === undefined ? { at, value } : { at, value, ease }));

/** Une bosse : du repos à `peak` à mi-course, puis retour au repos. */
const swell = (rest: number, peak: number, at = 0.5, ease: EaseSpec = "inOutSine"): Keyframe[] =>
  keys([0, rest], [at, peak, ease], [1, rest, ease]);

/** Une apparition et une extinction, nulles aux deux bouts. */
const flare = (peak: number, rise = 0.5, ease: EaseSpec = "inOutSine"): Keyframe[] => keys([0, 0], [rise, peak, ease], [1, 0, ease]);

const OPEN: [number, number, number, number] = [0, 0, 0, 0];

/** Rouge et cyan de l'aberration chromatique. */
const RED = "#ff2d55";
const CYAN = "#00e5ff";

/** Courbe des masques qui s'ouvrent : départ lent, ouverture franche, arrivée douce. */
const IRIS: EaseSpec = { bezier: [0.7, 0, 0.3, 1] };
const IN_OUT: EaseSpec = { bezier: [0.65, 0, 0.35, 1] };

/** Préréglage d'élément : toute cible, longueurs en part du cadre. */
const anyTarget = (preset: Omit<MotionPreset, "target" | "units">): MotionPreset => ({ target: "any", units: "frame", ...preset });

/** Préréglage de texte en bloc, longueurs en « em ». */
const textBlock = (preset: Omit<MotionPreset, "target" | "units" | "split">): MotionPreset => ({
  target: "text",
  units: "em",
  split: "whole",
  ...preset,
});

/** Secousse en paliers (une valeur tenue par instant), refermée au repos à `until`. */
function jitter(seed: number, steps: number, amplitude: number, until: number): Keyframe[] {
  const values = jitterValues(seed, steps);
  const frames: Keyframe[] = [{ at: 0, value: 0 }];
  for (let i = 1; i < steps; i++) frames.push({ at: (i / steps) * until, value: Math.round(values[i] * amplitude * 1000) / 1000, ease: HOLD });
  frames.push({ at: until, value: 0, ease: HOLD }, { at: 1, value: 0 });
  return frames;
}

/** Copie teinte d'une aberration chromatique, décalée de `offset` (part de la largeur du cadre). */
function channel(color: string, offset: Keyframe[], opacity: Keyframe[], imageChannel: string): MotionLayer {
  return {
    kind: "copy",
    color,
    tracks: { dx: offset, opacity },
    options: { composite: "screen", channel: imageChannel, ownOpacity: true },
  };
}

// ─── Frappe et décodage ──────────────────────────────────────────

const TYPING: MotionPreset[] = [
  {
    // Toutes les cases brouillent des caractères à la fois ; la vraie lettre
    // se fixe ensuite de gauche à droite, et quitte la couleur d'accent.
    id: "decode-letters",
    label: "Décodage",
    category: "typing",
    phase: "in",
    target: "text",
    durationMs: 500,
    split: "char",
    stagger: { eachMs: 45, from: "start" },
    tracks: {},
    effects: [{ type: "scramble", options: { rate: 25, color: ACCENT } }],
  },
  {
    // Un chiffrement qui se défait du centre vers les bords, en symboles.
    id: "decode-center-letters",
    label: "Décryptage depuis le centre",
    category: "typing",
    phase: "in",
    target: "text",
    durationMs: 500,
    split: "char",
    stagger: { eachMs: 50, from: "center" },
    tracks: {},
    effects: [{ type: "scramble", options: { rate: 20, charset: "symbols", color: "#22d3ee" } }],
  },
  {
    // Les lettres se fixent dans le désordre, comme un code qui se trouve.
    id: "decode-random-letters",
    label: "Décodage au hasard",
    category: "typing",
    phase: "in",
    target: "text",
    durationMs: 450,
    split: "char",
    stagger: { eachMs: 40, from: "random" },
    tracks: { opacity: keys([0, 0], [0.15, 1, "linear"], [1, 1]) },
    effects: [{ type: "scramble", options: { rate: 22, charset: "alnum" } }],
  },
  {
    // Chaque lettre tombe dans sa case comme un rouleau de machine à sous,
    // en faisant défiler des lettres, et s'arrête sur la bonne.
    id: "slot-letters",
    label: "Rouleaux",
    category: "typing",
    phase: "in",
    target: "text",
    durationMs: 800,
    ease: "outCubic",
    split: "char",
    stagger: { eachMs: 60, from: "start" },
    tracks: {
      y: tween(-MASK_LINE_HEIGHT, 0),
      clip: tween([1, 0, 0, 0], OPEN),
    },
    effects: [{ type: "scramble", options: { rate: 18, lock: 0.8 } }],
    params: [intensity(["y"])],
  },
  {
    // Frappe régulière du texte entier, curseur plein pendant la frappe, qui
    // clignote une fois la ligne écrite.
    ...textBlock({
      id: "type-caret",
      label: "Frappe avec curseur",
      category: "typing",
      phase: "in",
      durationMs: 2400,
      tracks: { reveal: keys([0, 0], [0.82, 1, "linear"], [1, 1]) },
      effects: [{ type: "cursor", options: { blinkMs: 750 } }],
    }),
  },
  {
    // Terminal : chaque caractère tombe d'un coup, un pavé clignote au bout.
    id: "terminal-letters",
    label: "Terminal",
    category: "typing",
    phase: "in",
    target: "text",
    durationMs: 700,
    split: "char",
    stagger: { eachMs: 30, from: "start" },
    tracks: { reveal: keys([0, 0], [0.02, 1, { steps: 1, jump: "start" }], [1, 1]) },
    effects: [{ type: "cursor", options: { shape: "block", blinkMs: 1000 } }],
  },
  {
    // Le curseur seul, qui clignote tant que le texte est à l'écran : la
    // suite naturelle d'une frappe.
    ...textBlock({
      id: "caret-blink",
      label: "Curseur qui clignote",
      category: "typing",
      phase: "loop",
      durationMs: 1000,
      tracks: {},
      effects: [{ type: "cursor", options: { blinkMs: 1000 } }],
    }),
  },
];

// ─── Compteurs ───────────────────────────────────────────────────

const COUNTERS: MotionPreset[] = [
  textBlock({
    // Le premier nombre du texte monte de 0 à sa valeur, vite puis de plus
    // en plus lentement, et s'arrête pile dessus (« 0 → 1 250 »).
    id: "count-up",
    label: "Compteur",
    category: "counter",
    phase: "in",
    durationMs: 2000,
    tracks: { opacity: keys([0, 0], [0.08, 1, "linear"], [1, 1]) },
    effects: [{ type: "counter", options: { ease: "outExpo" } }],
  }),
  textBlock({
    // Même montée, à vitesse régulière : un chronomètre, un score qui défile.
    id: "count-up-steady",
    label: "Compteur régulier",
    category: "counter",
    phase: "in",
    durationMs: 2000,
    tracks: {},
    effects: [{ type: "counter", options: { ease: "linear" } }],
  }),
  textBlock({
    // Le nombre monte, puis claque en grossissant quand il atteint sa valeur.
    id: "count-up-pop",
    label: "Compteur qui claque",
    category: "counter",
    phase: "in",
    durationMs: 2200,
    tracks: {
      opacity: keys([0, 0], [0.06, 1, "linear"], [1, 1]),
      scale: keys([0, 1], [0.78, 1], [0.86, 1.18, "outCubic"], [1, 1, "outBack"]),
    },
    effects: [{ type: "counter", from: 0, to: 0.78, options: { ease: "outCubic" } }],
    params: [intensity(["scale"])],
  }),
  {
    // Chaque chiffre roule depuis le bas dans sa case, en faisant défiler
    // des chiffres, puis se fixe : un compteur mécanique.
    id: "number-roll-letters",
    label: "Compteur à rouleaux",
    category: "counter",
    phase: "in",
    target: "text",
    durationMs: 750,
    ease: "outCubic",
    split: "char",
    stagger: { eachMs: 70, from: "end" },
    tracks: {
      y: tween(MASK_LINE_HEIGHT, 0),
      clip: tween([0, 0, 1, 0], OPEN),
      opacity: keys([0, 0], [0.45, 1, "outQuad"], [1, 1]),
    },
    effects: [{ type: "scramble", options: { rate: 20, lock: 0.75 } }],
  },
  textBlock({
    // Une valeur qui vient de monter : un éclair vert et un petit saut.
    id: "tick-up",
    label: "Mise à jour en hausse",
    category: "counter",
    phase: "emphasis",
    durationMs: 700,
    tracks: {
      color: keys([0, "currentColor"], [0.08, "#22c55e", "linear"], [0.55, "#22c55e"], [1, "currentColor", "linear"]),
      y: keys([0, 0], [0.18, -0.12, "outCubic"], [0.5, 0, "inOutSine"], [1, 0]),
    },
    params: [intensity(["y"])],
  }),
  textBlock({
    // Une valeur qui vient de baisser : un éclair rouge et un petit plongeon.
    id: "tick-down",
    label: "Mise à jour en baisse",
    category: "counter",
    phase: "emphasis",
    durationMs: 700,
    tracks: {
      color: keys([0, "currentColor"], [0.08, "#ef4444", "linear"], [0.55, "#ef4444"], [1, "currentColor", "linear"]),
      y: keys([0, 0], [0.18, 0.12, "outCubic"], [0.5, 0, "inOutSine"], [1, 0]),
    },
    params: [intensity(["y"])],
  }),
];

// ─── Surligneur, soulignement, bandeaux ──────────────────────────

const DECORATIONS: MotionPreset[] = [
  textBlock({
    // Un trait de surligneur passe derrière le texte, ligne après ligne, et
    // reste jusqu'à la sortie.
    id: "highlight-in",
    label: "Surligneur",
    category: "mask",
    phase: "in",
    durationMs: 1400,
    tracks: {},
    layers: [{ kind: "highlight", persist: true, color: ACCENT, tracks: { wipe: keys([0, 0], [0.3, 0], [1, 1, "inOutCubic"]) } }],
  }),
  textBlock({
    // Un trait se dessine sous le texte depuis la gauche, et reste.
    id: "underline-in",
    label: "Soulignement",
    category: "mask",
    phase: "in",
    durationMs: 450,
    tracks: {},
    layers: [{ kind: "underline", persist: true, color: "currentColor", tracks: { wipe: keys([0, 0], [1, 1, IN_OUT]) } }],
  }),
  textBlock({
    // Le texte est barré d'un trait, pâlit, puis s'efface.
    id: "strike-out",
    label: "Barré puis effacé",
    category: "mask",
    phase: "out",
    durationMs: 900,
    tracks: { opacity: keys([0, 1], [0.4, 1], [0.6, 0.4, "outQuad"], [0.75, 0.4], [1, 0, "inQuad"]) },
    layers: [{ kind: "strike", color: "currentColor", tracks: { wipe: keys([0, 0], [0.4, 1, IN_OUT], [1, 1]) } }],
  }),
  textBlock({
    // Bandeau télé : une plaque se déroule depuis la gauche, puis le texte
    // glisse dessus. Sur un texte qui a un fond, c'est ce fond qui se déroule.
    id: "plate-wipe-in",
    label: "Bandeau qui se déroule",
    category: "title",
    phase: "in",
    durationMs: 750,
    tracks: {
      opacity: keys([0, 0], [0.35, 0], [0.6, 1, "linear"], [1, 1]),
      x: keys([0, -0.25], [0.35, -0.25], [0.8, 0, "outCubic"], [1, 0]),
    },
    layers: [{ kind: "plate", persist: true, origin: [0, 0.5], options: { ownOpacity: true }, tracks: { scaleX: keys([0, 0], [0.55, 1, "outExpo"], [1, 1]) } }],
    params: [intensity(["x"])],
  }),
  textBlock({
    // Alerte : un bandeau rouge s'étire, clignote rouge et blanc, puis le
    // titre claque dessus.
    id: "banner-flash-in",
    label: "Bandeau d'alerte",
    category: "title",
    phase: "in",
    durationMs: 1300,
    tracks: {
      opacity: keys([0, 0], [0.5, 0], [0.52, 1, "linear"], [1, 1]),
      scale: keys([0, 1.4], [0.5, 1.4], [0.62, 1, "outCubic"], [1, 1]),
    },
    layers: [
      {
        kind: "plate",
        persist: true,
        origin: [0, 0.5],
        options: { source: "own", padding: 0.45, radius: 0.05, ownOpacity: true },
        tracks: {
          scaleX: keys([0, 0], [0.22, 1, "outQuart"], [1, 1]),
          color: keys(
            [0, "#dc2626"],
            [0.25, "#dc2626"],
            [0.33, "#ffffff", HOLD],
            [0.42, "#dc2626", HOLD],
            [0.51, "#ffffff", HOLD],
            [0.6, "#dc2626", HOLD],
            [1, "#dc2626"]
          ),
        },
      },
    ],
    params: [intensity(["scale"])],
  }),
  textBlock({
    // Une barre de couleur traverse le texte ; en se retirant, elle le laisse derrière elle.
    id: "bar-wipe-in",
    label: "Barre qui dévoile",
    category: "mask",
    phase: "in",
    durationMs: 900,
    tracks: { wipe: keys([0, 0], [0.45, 0], [1, 1, "inOutCubic"]) },
    layers: [
      {
        kind: "plate",
        options: { source: "own", padding: 0.12, ownOpacity: true },
        tracks: { clip: keys([0, [0, 1, 0, 0]], [0.45, OPEN, "outCubic"], [1, [0, 0, 0, 1], "inOutCubic"]) },
      },
    ],
  }),
  textBlock({
    // L'étiquette jaillit, un peu trop grande, puis le texte apparaît dedans.
    id: "label-pop-in",
    label: "Étiquette qui claque",
    category: "title",
    phase: "in",
    durationMs: 700,
    tracks: {
      opacity: keys([0, 0], [0.35, 0], [0.55, 1, "linear"], [1, 1]),
      scale: keys([0, 0.85], [0.35, 0.85], [0.75, 1, "outBack"], [1, 1]),
    },
    layers: [
      {
        kind: "plate",
        persist: true,
        options: { ownOpacity: true },
        tracks: {
          opacity: keys([0, 0], [0.15, 1, "linear"], [1, 1]),
          scale: keys([0, 0.6], [0.45, 1.08, "outCubic"], [0.7, 1, "inOutSine"], [1, 1]),
        },
      },
    ],
    params: [intensity(["scale"])],
  }),
];

// ─── Lueurs et reflets ───────────────────────────────────────────

const LIGHTS: MotionPreset[] = [
  anyTarget({
    // Un halo de la couleur de l'élément grandit autour de lui et s'éteint.
    id: "glow-pulse",
    label: "Halo lumineux",
    category: "blur-light",
    phase: "emphasis",
    durationMs: 900,
    tracks: { brightness: swell(1, 1.15) },
    layers: [{ kind: "copy", color: "currentColor", tracks: { blur: swell(0.01, 0.05), opacity: flare(0.9) } }],
    params: [intensity(["brightness"])],
  }),
  anyTarget({
    // Lueur qui respire doucement autour de l'élément, en boucle.
    id: "glow-breathe",
    label: "Lueur qui respire",
    category: "loop",
    phase: "loop",
    durationMs: 1100,
    tracks: {},
    layers: [{ kind: "copy", color: "currentColor", tracks: { blur: swell(0.02, 0.06), opacity: flare(0.85) } }],
  }),
  anyTarget({
    // Seul le contour s'allume et s'éteint, en boucle.
    id: "rim-glow",
    label: "Contour lumineux",
    category: "loop",
    phase: "loop",
    durationMs: 1000,
    tracks: {},
    layers: [{ kind: "ring", color: "currentColor", options: { width: 0.025 }, tracks: { blur: swell(0.003, 0.01), opacity: flare(1) } }],
  }),
  anyTarget({
    // Un reflet étroit et incliné traverse la silhouette, comme sur du métal.
    id: "shine-sweep",
    label: "Reflet",
    category: "blur-light",
    phase: "emphasis",
    durationMs: 820,
    tracks: {},
    layers: [
      {
        kind: "shine",
        options: { width: 0.3, angle: 18 },
        tracks: { x: keys([0, -0.9], [1, 0.9, "inOutSine"]), opacity: keys([0, 0], [0.15, 0.8, "linear"], [0.85, 0.8], [1, 0, "linear"]) },
      },
    ],
  }),
  anyTarget({
    // Une large bande de lumière douce passe sur l'élément.
    id: "light-sweep",
    label: "Balayage de lumière",
    category: "blur-light",
    phase: "emphasis",
    durationMs: 950,
    tracks: {},
    layers: [
      {
        kind: "shine",
        options: { width: 0.8, angle: 10, composite: "lighter" },
        tracks: { x: keys([0, -1.2], [1, 1.2, "inOutSine"]), opacity: keys([0, 0], [0.2, 0.55, "linear"], [0.8, 0.55], [1, 0, "linear"]) },
      },
    ],
  }),
  anyTarget({
    // Le reflet passe, puis l'élément attend avant le passage suivant.
    id: "shine-loop",
    label: "Reflet en boucle",
    category: "loop",
    phase: "loop",
    durationMs: 3000,
    tracks: {},
    layers: [
      {
        kind: "shine",
        options: { width: 0.3, angle: 18 },
        tracks: {
          x: keys([0, -0.9], [0.4, 0.9, { bezier: [0.6, 0.6, 0, 1] }], [0.41, -0.9, HOLD], [1, -0.9]),
          opacity: keys([0, 0], [0.04, 0.8, "linear"], [0.36, 0.8], [0.4, 0, "linear"], [1, 0]),
        },
      },
    ],
  }),
  anyTarget({
    // Éclair blanc posé sur la silhouette, qui retombe aussitôt.
    id: "flash-white",
    label: "Éclair blanc",
    category: "impact",
    phase: "emphasis",
    durationMs: 450,
    tracks: { scale: keys([0, 1], [0.12, 1.04, "outQuad"], [1, 1, "outCubic"]) },
    layers: [{ kind: "veil", color: "#ffffff", tracks: { opacity: keys([0, 0], [0.12, 0.9, "outQuad"], [1, 0, "outCubic"]) } }],
    params: [intensity(["scale"])],
  }),
  anyTarget({
    // La luminosité monte et redescend, sans que l'élément bouge.
    id: "color-pulse",
    label: "Pulsation lumineuse",
    category: "loop",
    phase: "loop",
    durationMs: 760,
    tracks: { brightness: swell(1, 1.35) },
    params: [intensity(["brightness"])],
  }),
];

// ─── Glitch et aberration ────────────────────────────────────────

const GLITCH: MotionPreset[] = [
  anyTarget({
    // Une copie rouge et une cyan, bien écartées, tiennent un instant, puis
    // se resserrent sur l'élément qui tremble à peine.
    id: "chromatic-in",
    label: "Aberration chromatique",
    category: "glitch",
    phase: "in",
    durationMs: 900,
    tracks: {
      opacity: keys([0, 0], [0.12, 1, "linear"], [1, 1]),
      x: jitter(17, 8, 0.012, 0.6),
    },
    layers: [
      channel(RED, keys([0, -0.106], [0.35, -0.094, "outQuad"], [0.7, -0.038, "inOutQuad"], [1, 0, "outQuad"]), keys([0, 1], [0.7, 0.8], [1, 0, "linear"]), "red"),
      channel(CYAN, keys([0, 0.106], [0.35, 0.094, "outQuad"], [0.7, 0.038, "inOutQuad"], [1, 0, "outQuad"]), keys([0, 1], [0.7, 0.8], [1, 0, "linear"]), "cyan"),
    ],
    params: [intensity(["x"])],
  }),
  anyTarget({
    // Des copies rouge et cyan sautent par à-coups pendant que la silhouette
    // se coupe en tranches qui glissent.
    id: "rgb-split",
    label: "Décalage RVB",
    category: "glitch",
    phase: "emphasis",
    durationMs: 700,
    tracks: {},
    effects: [{ type: "slices", from: 0.1, to: 0.6, options: { count: 7, amount: 0.035, rate: 14 } }],
    layers: [
      channel(RED, jitter(5, 10, 0.03, 0.85), keys([0, 0], [0.05, 0.9, HOLD], [0.85, 0, HOLD], [1, 0]), "red"),
      channel(CYAN, jitter(9, 10, 0.03, 0.85), keys([0, 0], [0.05, 0.9, HOLD], [0.85, 0, HOLD], [1, 0]), "cyan"),
    ],
  }),
  anyTarget({
    // Le signal accroche : décalages, inclinaison et tranches pendant la
    // première moitié, puis l'image se stabilise net.
    id: "glitch-in",
    label: "Glitch d'entrée",
    category: "glitch",
    phase: "in",
    durationMs: 650,
    tracks: {
      opacity: keys([0, 0], [0.04, 1, HOLD], [1, 1]),
      x: [...jitter(23, 9, 0.035, 0.45).slice(0, -2), { at: 0.45, value: 0.02, ease: HOLD }, { at: 0.65, value: -0.006, ease: "outQuad" }, { at: 1, value: 0, ease: "outQuad" }],
      skewX: jitter(31, 9, 5, 0.45),
    },
    effects: [{ type: "slices", from: 0, to: 0.45, options: { count: 6, amount: 0.04, rate: 15 } }],
    params: [intensity(["x", "skewX"])],
  }),
];

// ─── Ondes, traînées, ombres ─────────────────────────────────────

const RINGS: MotionPreset[] = [
  anyTarget({
    // Deux ondes partent du centre pendant que l'élément apparaît.
    id: "ripple-in",
    label: "Apparition en onde",
    category: "fade",
    phase: "in",
    durationMs: 950,
    tracks: { opacity: keys([0, 0], [1, 1, "outCubic"]) },
    layers: [
      { kind: "ring", color: "currentColor", options: { width: 0.02 }, tracks: { scale: keys([0, 0.2], [1, 2.2, "outCubic"]), opacity: keys([0, 0.8], [1, 0, "outQuad"]) } },
      {
        kind: "ring",
        color: "currentColor",
        options: { width: 0.015 },
        tracks: { scale: keys([0, 0.2], [0.12, 0.2], [1, 2.2, "outCubic"]), opacity: keys([0, 0], [0.12, 0.6, HOLD], [1, 0, "outQuad"]) },
      },
    ],
  }),
  anyTarget({
    // Une onde s'échappe de l'élément et s'efface, encore et encore.
    id: "pulse-ring",
    label: "Onde en boucle",
    category: "loop",
    phase: "loop",
    durationMs: 1200,
    tracks: {},
    layers: [{ kind: "ring", color: "currentColor", options: { width: 0.025 }, tracks: { scale: keys([0, 1], [1, 2.2, "outCubic"]), opacity: keys([0, 0], [0.08, 0.7, "linear"], [1, 0, "outQuad"]) } }],
  }),
  anyTarget({
    // Un anneau se resserre sur l'élément qui se charge de lumière, puis tout se libère.
    id: "energy-charge",
    label: "Charge d'énergie",
    category: "blur-light",
    phase: "emphasis",
    durationMs: 1200,
    tracks: { brightness: keys([0, 1], [0.85, 1.6, "inQuad"], [1, 1, "outQuad"]) },
    layers: [
      { kind: "copy", color: "currentColor", tracks: { blur: keys([0, 0.01], [0.85, 0.05, "inQuad"], [1, 0.02]), opacity: keys([0, 0], [0.85, 0.8, "inQuad"], [1, 0, "outQuad"]) } },
      {
        kind: "ring",
        color: "currentColor",
        options: { width: 0.03 },
        tracks: { scale: keys([0, 1.6], [0.85, 0.95, "inCubic"], [1, 1.3, "outCubic"]), opacity: keys([0, 0], [0.3, 0.9, "linear"], [0.85, 0.9], [1, 0, "linear"]) },
      },
    ],
    params: [intensity(["brightness"])],
  }),
  anyTarget({
    // L'élément file d'un coup et revient, une traînée de copies pâles derrière lui.
    id: "zip-trail",
    label: "Élan avec traînée",
    category: "attention",
    phase: "emphasis",
    durationMs: 900,
    tracks: { x: keys([0, 0], [0.4, 0.14, "outCubic"], [1, 0, "inOutCubic"]) },
    layers: [{ kind: "echo", options: { count: 3, delay: 0.05, falloff: 0.5 }, tracks: { opacity: keys([0, 0], [0.1, 1, "linear"], [0.9, 1], [1, 0, "linear"]) } }],
    params: [intensity(["x"])],
  }),
  anyTarget({
    // L'élément décolle un instant ; son ombre reste au sol et rétrécit.
    id: "lift-shadow",
    label: "Envol avec ombre",
    category: "attention",
    phase: "emphasis",
    durationMs: 1000,
    tracks: {
      y: keys([0, 0], [0.35, -0.06, "outCubic"], [0.65, -0.06], [1, 0, "inCubic"]),
      scale: keys([0, 1], [0.35, 1.03, "outCubic"], [0.65, 1.03], [1, 1, "inCubic"]),
    },
    layers: [
      {
        kind: "shadow",
        follow: false,
        tracks: { opacity: keys([0, 0], [0.35, 0.4, "outCubic"], [0.65, 0.4], [1, 0, "inCubic"]), scale: keys([0, 1], [0.35, 0.8, "outCubic"], [0.65, 0.8], [1, 1, "inCubic"]) },
      },
    ],
    params: [intensity(["y", "scale"])],
  }),
];

// ─── Masques de forme ────────────────────────────────────────────

const mask = (id: string, label: string, durationMs: number, shape: NonNullable<MotionPreset["mask"]>, ease: EaseSpec): MotionPreset =>
  anyTarget({ id, label, category: "mask", phase: "in", durationMs, mask: shape, tracks: { mask: keys([0, 0], [1, 1, ease]) } });

const MASKS: MotionPreset[] = [
  // Un cercle s'ouvre depuis le centre jusqu'aux coins.
  mask("iris-in", "Ouverture en iris", 800, { shape: "circle" }, IRIS),
  mask("diamond-in", "Ouverture en losange", 700, { shape: "diamond" }, "inOutCubic"),
  // Un bord incliné traverse l'élément.
  mask("bias-wipe-in", "Balayage en biais", 680, { shape: "diagonal", angle: 35 }, "inOutQuart"),
  // Quelques taches s'étendent et se rejoignent, comme de l'encre sur du papier.
  mask("ink-in", "Tache d'encre", 980, { shape: "blob", count: 3 }, "inOutSine"),
  mask("blinds-in", "Stores", 1000, { shape: "blinds", count: 10 }, "outQuad"),
  mask("bars-in", "Barres verticales", 800, { shape: "bars", count: 7 }, "outCubic"),
  mask("clock-in", "Tour d'horloge", 800, { shape: "clock" }, "inOutCubic"),
  mask("tiles-in", "Mosaïque", 900, { shape: "tiles", count: 8 }, "linear"),
  {
    // Chaque lettre s'ouvre en cercle, l'une après l'autre.
    id: "iris-letters",
    label: "Iris lettre par lettre",
    category: "by-letter",
    phase: "in",
    target: "text",
    durationMs: 450,
    split: "char",
    stagger: { eachMs: 40, from: "start" },
    mask: { shape: "circle" },
    tracks: { mask: keys([0, 0], [1, 1, "outCubic"]) },
  },
];

// ─── Ancrage et espacement ───────────────────────────────────────

const SWING = { mass: 1, stiffness: 90, damping: 4.5 };

const ANCHORED: MotionPreset[] = [
  {
    // Chaque lettre pend à son bord haut et se balance jusqu'à la verticale.
    id: "swing-in-letters",
    label: "Balancier lettre par lettre",
    category: "by-letter",
    phase: "in",
    target: "text",
    durationMs: Math.round(springSettleSeconds(SWING) * 1000),
    split: "char",
    stagger: { eachMs: 60, from: "start" },
    origin: [0.5, 0],
    tracks: { rotate: tween(90, 0, { spring: SWING }), opacity: keys([0, 0], [0.08, 1, "linear"], [1, 1]) },
    params: [intensity(["rotate"])],
  },
  {
    // Chaque lettre pousse depuis sa ligne de base, avec un léger dépassement.
    id: "grow-up-letters",
    label: "Pousse depuis la ligne",
    category: "by-letter",
    phase: "in",
    target: "text",
    durationMs: 500,
    split: "char",
    stagger: { eachMs: 30, from: "start" },
    origin: [0.5, 1],
    tracks: { scaleY: keys([0, 0], [1, 1, "outBack"]), opacity: keys([0, 0], [0.3, 1, "linear"], [1, 1]) },
  },
  textBlock({
    // Le titre s'étire en largeur sur sa ligne de base, puis revient en ressort.
    id: "title-elastic",
    label: "Étirement élastique",
    category: "attention",
    phase: "emphasis",
    durationMs: 800,
    origin: [0.5, 1],
    tracks: {
      scaleX: keys([0, 1], [0.25, 1.4, "outCubic"], [0.45, 0.9, "inOutSine"], [0.62, 1.08, "inOutSine"], [0.78, 0.97, "inOutSine"], [0.9, 1.01, "inOutSine"], [1, 1, "inOutSine"]),
      scaleY: keys([0, 1], [0.25, 0.88, "outCubic"], [0.45, 1.05, "inOutSine"], [0.62, 0.97, "inOutSine"], [0.78, 1.01, "inOutSine"], [1, 1, "inOutSine"]),
    },
    params: [intensity(["scaleX", "scaleY"])],
  }),
  {
    // Lettres très espacées et floues qui se resserrent en devenant nettes,
    // l'une après l'autre : le titre de film classique, au rythme des lettres.
    id: "tracking-blur-letters",
    label: "Resserrement net lettre par lettre",
    category: "by-letter",
    phase: "in",
    target: "text",
    durationMs: 1200,
    ease: "outCubic",
    split: "char",
    stagger: { eachMs: 25, from: "start" },
    tracks: { tracking: tween(0.5, 0), blur: tween(0.4, 0), opacity: tween(0, 1) },
    params: [intensity(["tracking", "blur"])],
  },
  {
    // Les lettres s'écartent les unes des autres en s'effaçant.
    id: "spread-out-letters",
    label: "Dispersion de l'espacement",
    category: "by-letter",
    phase: "out",
    target: "text",
    durationMs: 900,
    ease: "inCubic",
    split: "char",
    stagger: { eachMs: 20, from: "start" },
    tracks: {
      tracking: tween(0, 0.6),
      blur: tween(0, 0.2),
      opacity: keys([0, 1], [0.3, 1], [1, 0, "linear"]),
    },
    params: [intensity(["tracking", "blur"])],
  },
];

/** Préréglages d'effets, dans l'ordre du sélecteur. */
export const EFFECT_PRESETS: MotionPreset[] = [...TYPING, ...COUNTERS, ...DECORATIONS, ...LIGHTS, ...GLITCH, ...RINGS, ...MASKS, ...ANCHORED];
