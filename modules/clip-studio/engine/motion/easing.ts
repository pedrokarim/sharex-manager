/**
 * Bibliothèque de courbes d'accélération.
 *
 * Une courbe reçoit l'avancement d'un segment (0 à 1) et rend l'avancement
 * de la valeur. Elle vaut 0 au départ et 1 à l'arrivée ; entre les deux, elle
 * peut dépasser (back, elastic, ressort) : c'est voulu, c'est le rebond.
 *
 * Tout est déterministe : un ressort est résolu une fois, puis échantillonné ;
 * l'aperçu et l'export lisent exactement la même table.
 */

import type { EaseFamily, EaseMode, EaseName, EaseSpec } from "./types";

export type EaseFn = (t: number) => number;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

// ─── Familles classiques ─────────────────────────────────────────

/** Puissance d'exposant libre : quad = 2, cubic = 3, quart = 4, quint = 5. */
function powerEase(exponent: number, mode: EaseMode): EaseFn {
  const e = Math.max(0.0001, exponent);
  switch (mode) {
    case "in":
      return (t) => Math.pow(t, e);
    case "out":
      return (t) => 1 - Math.pow(1 - t, e);
    default:
      return (t) => (t < 0.5 ? Math.pow(2, e - 1) * Math.pow(t, e) : 1 - Math.pow(-2 * t + 2, e) / 2);
  }
}

/** Recul puis élan ; `overshoot` règle l'amplitude (1,70158 donne environ 10 %). */
function backEase(overshoot: number, mode: EaseMode): EaseFn {
  const c1 = overshoot;
  const c3 = c1 + 1;
  switch (mode) {
    case "in":
      return (t) => c3 * t * t * t - c1 * t * t;
    case "out":
      return (t) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    default: {
      const c2 = c1 * 1.525;
      return (t) =>
        t < 0.5
          ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
          : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
    }
  }
}

/**
 * Élastique : une sinusoïde amortie. `amplitude` (au moins 1) grossit les
 * oscillations, `period` (en part du segment) les espace. Avec 1 et 0,3, on
 * retrouve la courbe classique ; l'entrée-sortie prend 0,45 par défaut.
 */
function elasticEase(mode: EaseMode, amplitude = 1, period?: number): EaseFn {
  const a = Math.max(1, amplitude);
  const p = period ?? (mode === "inOut" ? 0.45 : 0.3);
  const shift = (p / (2 * Math.PI)) * Math.asin(1 / a);
  const out: EaseFn = (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : a * Math.pow(2, -10 * t) * Math.sin(((t - shift) * 2 * Math.PI) / p) + 1;
  switch (mode) {
    case "in":
      return (t) => 1 - out(1 - t);
    case "out":
      return out;
    default:
      return (t) => (t < 0.5 ? (1 - out(1 - 2 * t)) / 2 : (1 + out(2 * t - 1)) / 2);
  }
}

const outBounce: EaseFn = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

/** Construit les trois variantes d'une famille à partir de sa version « entrée ». */
function fromIn(easeIn: EaseFn): Record<EaseMode, EaseFn> {
  return {
    in: easeIn,
    out: (t) => 1 - easeIn(1 - t),
    inOut: (t) => (t < 0.5 ? easeIn(2 * t) / 2 : 1 - easeIn(2 - 2 * t) / 2),
  };
}

const FAMILIES: Record<EaseFamily, Record<EaseMode, EaseFn>> = {
  sine: {
    in: (t) => 1 - Math.cos((t * Math.PI) / 2),
    out: (t) => Math.sin((t * Math.PI) / 2),
    inOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  },
  quad: { in: powerEase(2, "in"), out: powerEase(2, "out"), inOut: powerEase(2, "inOut") },
  // Cubique écrite à part : l'ancien moteur calculait `t * t * t`, et les
  // animations historiques doivent rester identiques au bit près.
  cubic: { in: (t) => t * t * t, out: (t) => 1 - Math.pow(1 - t, 3), inOut: powerEase(3, "inOut") },
  quart: { in: powerEase(4, "in"), out: powerEase(4, "out"), inOut: powerEase(4, "inOut") },
  quint: { in: powerEase(5, "in"), out: powerEase(5, "out"), inOut: powerEase(5, "inOut") },
  expo: {
    in: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    out: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inOut: (t) =>
      t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  },
  circ: fromIn((t) => 1 - Math.sqrt(1 - Math.pow(clamp01(t), 2))),
  back: { in: backEase(1.70158, "in"), out: backEase(1.70158, "out"), inOut: backEase(1.70158, "inOut") },
  elastic: { in: elasticEase("in"), out: elasticEase("out"), inOut: elasticEase("inOut") },
  bounce: {
    in: (t) => 1 - outBounce(1 - t),
    out: outBounce,
    inOut: (t) => (t < 0.5 ? (1 - outBounce(1 - 2 * t)) / 2 : (1 + outBounce(2 * t - 1)) / 2),
  },
};

export const EASE_FAMILIES = Object.keys(FAMILIES) as EaseFamily[];
export const EASE_MODES: EaseMode[] = ["in", "out", "inOut"];

/** Nom d'une courbe de la bibliothèque : « outCubic », « inOutBack »… */
export function easeName(family: EaseFamily, mode: EaseMode): EaseName {
  const capitalized = (family[0].toUpperCase() + family.slice(1)) as Capitalize<EaseFamily>;
  return `${mode}${capitalized}`;
}

/** Toutes les courbes nommées, `linear` comprise. */
export const EASINGS = (() => {
  const table = { linear: (t: number) => t } as Record<EaseName, EaseFn>;
  for (const family of EASE_FAMILIES) {
    for (const mode of EASE_MODES) table[easeName(family, mode)] = FAMILIES[family][mode];
  }
  return table;
})();

export const EASE_NAMES = Object.keys(EASINGS) as EaseName[];

export function isEaseName(value: unknown): value is EaseName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(EASINGS, value);
}

// ─── Bézier cubique ──────────────────────────────────────────────

/**
 * Bézier de (0, 0) à (1, 1), comme `cubic-bezier()` en CSS. Pour un x donné,
 * on cherche le paramètre de la courbe par Newton, puis par dichotomie si
 * Newton ne converge pas (pente nulle) : c'est la méthode des navigateurs,
 * robuste même pour des points de contrôle extrêmes.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EaseFn {
  // Hors de [0, 1] en x, la courbe ne serait plus une fonction du temps.
  const ax1 = clamp01(x1);
  const ax2 = clamp01(x2);
  const cx = 3 * ax1;
  const bx = 3 * (ax2 - ax1) - cx;
  const axx = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ayy = 1 - cy - by;

  const sampleX = (u: number) => ((axx * u + bx) * u + cx) * u;
  const sampleY = (u: number) => ((ayy * u + by) * u + cy) * u;
  const slopeX = (u: number) => (3 * axx * u + 2 * bx) * u + cx;

  const solveU = (x: number) => {
    const epsilon = 1e-7;
    let u = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(u) - x;
      if (Math.abs(error) < epsilon) return u;
      const slope = slopeX(u);
      if (Math.abs(slope) < 1e-6) break;
      u -= error / slope;
    }
    let low = 0;
    let high = 1;
    u = x;
    for (let i = 0; i < 64 && high - low > epsilon; i++) {
      const value = sampleX(u);
      if (Math.abs(value - x) < epsilon) return u;
      if (value < x) low = u;
      else high = u;
      u = (low + high) / 2;
    }
    return u;
  };

  if (ax1 === y1 && ax2 === y2) return (t) => t;
  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : sampleY(solveU(t)));
}

/** Courbes nommées de CSS. */
export const CSS_BEZIERS = {
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

// ─── Ressort ─────────────────────────────────────────────────────

export interface SpringOptions {
  mass: number;
  stiffness: number;
  damping: number;
  /** Vitesse initiale, en unités de déplacement par seconde (0 par défaut). */
  velocity?: number;
}

/** Nombre d'échantillons de la table d'un ressort. */
const SPRING_SAMPLES = 512;
/** Écart à l'arrivée sous lequel le ressort est considéré au repos. */
const SPRING_REST = 0.0005;
const SPRING_MAX_SECONDS = 10;

/**
 * Position d'un ressort amorti parti de 0 vers 1, à l'instant `time` (s).
 * Solution exacte de l'oscillateur : aucun pas d'intégration, donc aucune
 * dérive selon la cadence.
 */
function springPosition(options: SpringOptions, time: number): number {
  const mass = Math.max(0.0001, options.mass);
  const stiffness = Math.max(0.0001, options.stiffness);
  const damping = Math.max(0, options.damping);
  const omega = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  // Écart à l'arrivée : x0 = -1, vitesse initiale v0.
  const x0 = -1;
  const v0 = options.velocity ?? 0;
  if (zeta < 1) {
    const omegaD = omega * Math.sqrt(1 - zeta * zeta);
    const envelope = Math.exp(-zeta * omega * time);
    return (
      1 +
      envelope * (x0 * Math.cos(omegaD * time) + ((v0 + zeta * omega * x0) / omegaD) * Math.sin(omegaD * time))
    );
  }
  if (zeta === 1) {
    return 1 + Math.exp(-omega * time) * (x0 + (v0 + omega * x0) * time);
  }
  const root = Math.sqrt(zeta * zeta - 1);
  const r1 = -omega * (zeta - root);
  const r2 = -omega * (zeta + root);
  const c2 = (v0 - r1 * x0) / (r2 - r1);
  const c1 = x0 - c2;
  return 1 + c1 * Math.exp(r1 * time) + c2 * Math.exp(r2 * time);
}

/** Durée au bout de laquelle le ressort ne bouge plus à l'œil. */
export function springSettleSeconds(options: SpringOptions): number {
  const step = 1 / 600;
  let last = step;
  for (let time = step; time <= SPRING_MAX_SECONDS; time += step) {
    if (Math.abs(springPosition(options, time) - 1) > SPRING_REST) last = time;
  }
  return Math.min(SPRING_MAX_SECONDS, last + step);
}

/**
 * Ressort ramené à une courbe : on le résout jusqu'au repos, on l'échantillonne
 * sur une table fixe, et on divise par la dernière valeur pour finir
 * exactement à 1. La durée de l'animation étire le ressort, elle ne le coupe
 * pas.
 */
export function springEase(options: SpringOptions): EaseFn {
  const seconds = springSettleSeconds(options);
  const table = new Float64Array(SPRING_SAMPLES + 1);
  for (let i = 0; i <= SPRING_SAMPLES; i++) table[i] = springPosition(options, (i / SPRING_SAMPLES) * seconds);
  const end = table[SPRING_SAMPLES] || 1;
  for (let i = 0; i <= SPRING_SAMPLES; i++) table[i] /= end;
  table[0] = 0;
  table[SPRING_SAMPLES] = 1;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const position = t * SPRING_SAMPLES;
    const index = Math.floor(position);
    const fraction = position - index;
    return table[index] + (table[index + 1] - table[index]) * fraction;
  };
}

// ─── Marches ─────────────────────────────────────────────────────

/**
 * `n` paliers, comme `steps()` en CSS. « end » (par défaut) saute à la fin de
 * chaque palier, « start » au début ; la valeur finale est toujours 1.
 */
export function stepsEase(count: number, jump: "start" | "end" = "end"): EaseFn {
  const n = Math.max(1, Math.round(count));
  return (t) => {
    if (t >= 1) return 1;
    if (t <= 0) return jump === "start" ? 1 / n : 0;
    const step = jump === "start" ? Math.ceil(t * n) : Math.floor(t * n);
    return Math.min(1, step / n);
  };
}

// ─── Résolution ──────────────────────────────────────────────────

const resolved = new Map<string, EaseFn>();
const resolvedObjects = new WeakMap<object, EaseFn>();

/**
 * Courbe correspondant à une description. Un nom inconnu (projet venu d'une
 * version plus récente) donne une courbe linéaire plutôt qu'une erreur.
 */
export function resolveEase(spec: EaseSpec | undefined): EaseFn {
  if (spec === undefined) return EASINGS.linear;
  if (typeof spec === "string") return isEaseName(spec) ? EASINGS[spec] : EASINGS.linear;
  // Un préréglage est figé : la même description revient à chaque image et
  // pour chaque lettre ; on la retrouve sans la resérialiser.
  const known = resolvedObjects.get(spec);
  if (known) return known;
  const key = JSON.stringify(spec);
  let fn = resolved.get(key);
  if (!fn) {
    fn = buildEase(spec);
    resolved.set(key, fn);
  }
  resolvedObjects.set(spec, fn);
  return fn;
}

function buildEase(spec: Exclude<EaseSpec, string>): EaseFn {
  if ("bezier" in spec) return cubicBezier(...spec.bezier);
  if ("spring" in spec) return springEase(spec.spring);
  if ("steps" in spec) return stepsEase(spec.steps, spec.jump);
  if ("power" in spec) return powerEase(spec.power, spec.mode);
  if ("back" in spec) return backEase(spec.back, spec.mode);
  if ("elastic" in spec) return elasticEase(spec.mode, spec.elastic.amplitude, spec.elastic.period);
  return EASINGS.linear;
}

// ─── Notations des autres outils ─────────────────────────────────

/**
 * Correspondance des notations courantes vers nos courbes, pour le
 * convertisseur de préréglages. Ces noms ne sont jamais montrés : l'éditeur
 * ne parle que de nos courbes.
 */
export const EASE_ALIASES: Readonly<Record<string, EaseSpec>> = (() => {
  const table: Record<string, EaseSpec> = {
    linear: "linear",
    none: "linear",
    "power0.none": "linear",
    "power0.in": "linear",
    "power0.out": "linear",
    "power0.inOut": "linear",
    "Power0.easeNone": "linear",
    "Linear.easeNone": "linear",
    easeLinear: "linear",
    ease: { bezier: [...CSS_BEZIERS.ease] },
    "ease-in": { bezier: [...CSS_BEZIERS["ease-in"]] },
    "ease-out": { bezier: [...CSS_BEZIERS["ease-out"]] },
    "ease-in-out": { bezier: [...CSS_BEZIERS["ease-in-out"]] },
    "step-start": { steps: 1, jump: "start" },
    "step-end": { steps: 1, jump: "end" },
  };
  const modeSuffix: Record<EaseMode, string> = { in: "In", out: "Out", inOut: "InOut" };
  // Puissances numérotées : power1 = quad, power2 = cubic, power3 = quart, power4 = quint.
  const powers: EaseFamily[] = ["quad", "cubic", "quart", "quint"];
  powers.forEach((family, index) => {
    for (const mode of EASE_MODES) {
      table[`power${index + 1}.${mode}`] = easeName(family, mode);
      table[`Power${index + 1}.ease${modeSuffix[mode]}`] = easeName(family, mode);
    }
  });
  for (const family of EASE_FAMILIES) {
    const capitalized = family[0].toUpperCase() + family.slice(1);
    for (const mode of EASE_MODES) {
      const name = easeName(family, mode);
      table[name] = name; // outCubic
      table[`${family}.${mode}`] = name; // cubic.out
      table[`${capitalized}.ease${modeSuffix[mode]}`] = name; // Cubic.easeOut
      table[`ease${modeSuffix[mode]}${capitalized}`] = name; // easeOutCubic
      table[`ease-${mode === "inOut" ? "in-out" : mode}-${family}`] = name; // ease-out-cubic
    }
  }
  // Alias de la famille « sine » et « expo » écrits en entier.
  for (const mode of EASE_MODES) {
    table[`ease${modeSuffix[mode]}Sinusoidal`] = easeName("sine", mode);
    table[`ease${modeSuffix[mode]}Exponential`] = easeName("expo", mode);
    table[`ease${modeSuffix[mode]}Circular`] = easeName("circ", mode);
  }
  return Object.freeze(table);
})();

const MODE_WORDS: Record<string, EaseMode> = {
  in: "in",
  out: "out",
  inout: "inOut",
  "in-out": "inOut",
  easein: "in",
  easeout: "out",
  easeinout: "inOut",
};

/**
 * Lit une notation, paramétrée ou non : « power3.out », « easeOutCubic »,
 * « back.out(1.7) », « elastic.out(1, 0.3) », « inOut(3) », « out(2) »,
 * « cubic-bezier(0.2, 0.8, 0.2, 1) », « steps(4) », « steps(4, start) »,
 * « spring(1, 100, 10) » (masse, raideur, amortissement).
 *
 * Rend `null` pour une notation inconnue : le convertisseur marque alors le
 * préréglage « à compléter » au lieu de deviner.
 */
export function parseEase(notation: string): EaseSpec | null {
  const text = notation.trim();
  if (!text) return null;
  const direct = EASE_ALIASES[text];
  if (direct !== undefined) return direct;

  const call = /^([A-Za-z][\w.-]*)\s*\(([^)]*)\)$/.exec(text);
  if (!call) return null;
  const head = call[1];
  const rawArgs = call[2].split(",").map((part) => part.trim()).filter(Boolean);
  const numbers = rawArgs.map(Number);
  const allNumbers = numbers.every((value) => Number.isFinite(value));

  if (head === "cubic-bezier" || head === "cubicBezier") {
    return numbers.length === 4 && allNumbers ? { bezier: [numbers[0], numbers[1], numbers[2], numbers[3]] } : null;
  }
  if (head === "steps") {
    const count = Number(rawArgs[0]);
    if (!Number.isFinite(count) || count < 1) return null;
    const position = rawArgs[1];
    const jump = position === "start" || position === "jump-start" ? "start" : "end";
    return { steps: Math.round(count), jump };
  }
  if (head === "spring") {
    if (!allNumbers || numbers.length < 3) return null;
    return { spring: { mass: numbers[0], stiffness: numbers[1], damping: numbers[2], velocity: numbers[3] ?? 0 } };
  }
  if (!allNumbers) return null;

  // « in(2) », « out(3) », « inOut(1.5) » : puissance d'exposant libre.
  const bareMode = MODE_WORDS[head.toLowerCase()];
  if (bareMode) return numbers.length ? { power: numbers[0], mode: bareMode } : null;

  // « back.out(1.7) », « elastic.inOut(1, 0.3) », « outBack(2) », « easeOutElastic(1, .4) ».
  const dotted = /^([a-z]+)\.(in|out|inOut)$/i.exec(head);
  let family: string | null = null;
  let mode: EaseMode | null = null;
  if (dotted) {
    family = dotted[1].toLowerCase();
    mode = MODE_WORDS[dotted[2].toLowerCase()] ?? null;
  } else {
    const camel = /^(?:ease)?(inOut|InOut|in|In|out|Out)([A-Z][a-z]+)$/.exec(head);
    if (camel) {
      mode = MODE_WORDS[camel[1].toLowerCase()] ?? null;
      family = camel[2].toLowerCase();
    }
  }
  if (!family || !mode) return null;
  if (family === "back") return { back: numbers[0] ?? 1.70158, mode };
  if (family === "elastic") return { elastic: { amplitude: numbers[0] ?? 1, period: numbers[1] }, mode };
  if (/^power[0-4]$/.test(family) || family === "power") {
    // « power2.out(…) » : les arguments n'y ont pas de sens, on garde la courbe nommée.
    return EASE_ALIASES[`${family}.${mode}`] ?? null;
  }
  return isEaseName(easeName(family as EaseFamily, mode)) ? easeName(family as EaseFamily, mode) : null;
}
