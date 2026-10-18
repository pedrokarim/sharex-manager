/**
 * Transitions, mouvements de caméra et effets de plan (étape A5), en pistes
 * d'images clés.
 *
 * - Une **transition** a deux jeux de pistes : celles du plan qui part
 *   (`from`) et celles du plan qui arrive (`to`), plus un voile plein cadre
 *   et un masque de forme pour le plan qui arrive. L'avancement est adouci
 *   une fois par la courbe du préréglage, puis chaque piste lit ses images
 *   clés. Les cinq transitions d'origine sont réécrites ainsi, sous leur
 *   identifiant, et rendent les mêmes valeurs (voir les tests).
 * - Un **mouvement de caméra** anime le cadrage d'une image : zoom, cadrage
 *   (`panX`, `panY`, de −1 à 1 dans la marge), rotation, petit décalage,
 *   flou et luminosité. Il couvre tout le plan (`span`), se joue une fois au
 *   début du plan puis tient sa dernière valeur (`start`), ou boucle (`loop`).
 *   Les sept mouvements d'origine gardent leur identifiant et leurs valeurs.
 * - Un **effet de plan** (impact) s'applique à toute une piste à un instant
 *   donné : secousse du cadre, flash, zoom de frappe, aberration de couleur.
 *
 * Tout est pur : l'aperçu et l'export lisent les mêmes valeurs.
 */

import { resolveEase } from "./easing";
import { sampleKeyframes } from "./interpret";
import type { EaseSpec, Keyframe, KeyframeValue, MotionMask } from "./types";

const keys = (...frames: [number, KeyframeValue, EaseSpec?][]): Keyframe[] =>
  frames.map(([at, value, ease]) => (ease === undefined ? { at, value } : { at, value, ease }));

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

// ─── Transitions ─────────────────────────────────────────────────

/** Propriétés d'un plan pendant une transition ; longueurs en part du cadre. */
export type ShotProperty = "opacity" | "dx" | "dy" | "scale" | "scaleX" | "scaleY" | "rotate" | "blur" | "brightness" | "wipe" | "mask";

export type ShotTracks = Partial<Record<ShotProperty, Keyframe[]>>;

/** Valeurs de repos des propriétés d'un plan. */
export const SHOT_REST: Record<ShotProperty, number> = {
  opacity: 1,
  dx: 0,
  dy: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
  blur: 0,
  brightness: 1,
  wipe: 1,
  mask: 1,
};

export interface TransitionPreset {
  id: string;
  /** Nom affiché : « Fondu enchaîné ». */
  label: string;
  /** Durée conseillée. */
  durationMs: number;
  /** Courbe appliquée à l'avancement entier avant de lire les pistes. */
  ease: EaseSpec;
  /** Plan qui part, figé sur sa dernière image. */
  from: ShotTracks;
  /** Plan qui arrive. */
  to: ShotTracks;
  /** Masque de forme du plan qui arrive, piloté par sa piste `mask`. */
  mask?: MotionMask;
  /** Voile plein cadre, par-dessus les deux plans (fondu au noir, flash). */
  veil?: { color: string; opacity: Keyframe[] };
  /** Le plan qui part est dessiné par-dessus celui qui arrive (il s'en va et le découvre). */
  fromOnTop?: boolean;
}

/** Retouches d'un plan à un instant d'une transition : seules les pistes déclarées. */
export type ShotBlend = Partial<Record<ShotProperty, number>>;

/** Lit les pistes d'un plan à l'avancement (déjà adouci) `t`. */
export function shotBlendAt(tracks: ShotTracks, t: number): ShotBlend {
  const blend: ShotBlend = {};
  for (const key of Object.keys(tracks) as ShotProperty[]) {
    blend[key] = sampleKeyframes(tracks[key], t, SHOT_REST[key]);
  }
  return blend;
}

/** Bascule franche d'un plan à l'autre à l'instant `at` : visible avant, puis caché (ou l'inverse). */
const until = (at: number) => keys([0, 1], [at, 1], [at, 0], [1, 0]);
const after = (at: number) => keys([0, 0], [at, 0], [at, 1], [1, 1]);
/** Montée et descente du voile, nul aux deux bouts. */
const peak = (at: number, height = 1, rise: EaseSpec = "linear", fall: EaseSpec = "linear") => keys([0, 0], [at, height, rise], [1, 0, fall]);

const LEGACY_TRANSITIONS: TransitionPreset[] = [
  {
    // Le plan suivant apparaît par-dessus le précédent, figé.
    id: "fade",
    label: "Fondu enchaîné",
    durationMs: 600,
    ease: "inOutSine",
    from: {},
    to: { opacity: keys([0, 0], [1, 1]) },
  },
  {
    // Le plan sortant s'éteint jusqu'au noir, puis le suivant s'en dégage.
    id: "fade-black",
    label: "Fondu au noir",
    durationMs: 600,
    ease: "inOutSine",
    from: { opacity: until(0.5) },
    to: { opacity: after(0.5) },
    veil: { color: "#000000", opacity: peak(0.5) },
  },
  {
    // Le plan suivant pousse le précédent hors du cadre, vers la gauche.
    id: "slide",
    label: "Glissement",
    durationMs: 600,
    ease: "inOutSine",
    from: { dx: keys([0, 0], [1, -1]) },
    to: { dx: keys([0, 1], [1, 0]) },
  },
  {
    id: "wipe",
    label: "Balayage",
    durationMs: 600,
    ease: "inOutSine",
    from: {},
    to: { wipe: keys([0, 0], [1, 1]) },
  },
  {
    // Le plan qui part grossit en s'effaçant ; le suivant arrive un peu grand.
    id: "zoom",
    label: "Zoom",
    durationMs: 600,
    ease: "inOutSine",
    from: { scale: keys([0, 1], [1, 1.12]), opacity: keys([0, 1], [1, 0]) },
    to: { opacity: keys([0, 0], [1, 1]), scale: keys([0, 1.15], [1, 1]) },
  },
];

/** Transition dont seul le plan qui arrive s'ouvre par un masque de forme. */
const masked = (id: string, label: string, durationMs: number, mask: MotionMask, ease: EaseSpec): TransitionPreset => ({
  id,
  label,
  durationMs,
  ease,
  from: {},
  to: { mask: keys([0, 0], [1, 1]) },
  mask,
});

const push = (id: string, label: string, axis: "dx" | "dy", sign: 1 | -1): TransitionPreset => ({
  id,
  label,
  durationMs: 450,
  ease: "inOutCubic",
  from: { [axis]: keys([0, 0], [1, sign]) },
  to: { [axis]: keys([0, -sign], [1, 0]) },
});

const NEW_TRANSITIONS: TransitionPreset[] = [
  push("push-right", "Poussée vers la droite", "dx", 1),
  push("push-up", "Poussée vers le haut", "dy", -1),
  push("push-down", "Poussée vers le bas", "dy", 1),
  {
    // Le plan suivant glisse par-dessus le précédent, qui ne bouge pas.
    id: "cover-left",
    label: "Recouvrement",
    durationMs: 500,
    ease: "outCubic",
    from: {},
    to: { dx: keys([0, 1], [1, 0]) },
  },
  {
    // Le plan précédent s'en va vers la gauche et découvre le suivant, déjà en place.
    id: "uncover-left",
    label: "Découverte",
    durationMs: 500,
    ease: "inCubic",
    from: { dx: keys([0, 0], [1, -1]) },
    to: {},
    fromOnTop: true,
  },
  masked("wipe-left", "Balayage vers la gauche", 500, { shape: "diagonal", angle: 180 }, "inOutSine"),
  masked("wipe-down", "Balayage vers le bas", 500, { shape: "diagonal", angle: 90 }, "inOutSine"),
  masked("wipe-up", "Balayage vers le haut", 500, { shape: "diagonal", angle: 270 }, "inOutSine"),
  masked("wipe-bias", "Balayage en biais", 550, { shape: "diagonal", angle: 30 }, "inOutCubic"),
  // Le cercle s'ouvre jusqu'au coin le plus loin du cadre.
  masked("iris", "Iris", 600, { shape: "circle" }, "inQuad"),
  masked("iris-diamond", "Losange", 600, { shape: "diamond" }, "inQuad"),
  // Deux portes s'écartent depuis le milieu.
  masked("doors", "Portes", 550, { shape: "bars", count: 1 }, "inOutCubic"),
  masked("clock", "Horloge", 700, { shape: "clock" }, "inOutSine"),
  masked("blinds", "Stores", 700, { shape: "blinds", count: 7 }, "outQuad"),
  masked("pixels", "Pixels", 600, { shape: "tiles", count: 12 }, "linear"),
  masked("ink", "Encre", 800, { shape: "blob", count: 4 }, "inOutSine"),
  {
    // Les deux plans se fondent l'un dans l'autre en passant par un flou.
    id: "blur",
    label: "Flou croisé",
    durationMs: 600,
    ease: "inOutSine",
    from: { blur: keys([0, 0], [0.5, 0.025], [1, 0.025]), opacity: keys([0, 1], [0.3, 1], [0.7, 0]) },
    to: { blur: keys([0, 0.025], [0.5, 0.025], [1, 0]), opacity: keys([0, 0], [0.3, 0], [0.7, 1]) },
  },
  {
    // On plonge dans le plan qui part ; le suivant arrive de plus loin.
    id: "zoom-through",
    label: "Zoom traversant",
    durationMs: 600,
    ease: "linear",
    from: { scale: keys([0, 1], [0.583, 1.3, "inCubic"]), opacity: keys([0, 1], [0.583, 0, "inQuad"], [1, 0]) },
    to: { scale: keys([0, 0.8], [0.417, 0.8], [1, 1, "outCubic"]), opacity: keys([0, 0], [0.417, 0], [1, 1, "outQuad"]) },
  },
  {
    // Le plan qui part s'éloigne ; le suivant arrive en grandissant vers nous.
    id: "zoom-back",
    label: "Zoom arrière",
    durationMs: 600,
    ease: "inOutCubic",
    from: { scale: keys([0, 1], [1, 0.7]), opacity: keys([0, 1], [0.6, 0]) },
    to: { scale: keys([0, 1.3], [1, 1]), opacity: keys([0, 0], [0.4, 0], [1, 1]) },
  },
  {
    // Un panoramique très vif, flou de vitesse : la coupe se cache dans le mouvement.
    id: "whip",
    label: "Fouetté",
    durationMs: 300,
    ease: "inOutQuart",
    from: { dx: keys([0, 0], [1, -1]), blur: keys([0, 0], [1, 0.04]) },
    to: { dx: keys([0, 1], [1, 0]), blur: keys([0, 0.04], [1, 0]) },
  },
  {
    // Le même fouetté, de bas en haut.
    id: "whip-up",
    label: "Fouetté vertical",
    durationMs: 300,
    ease: "inOutQuart",
    from: { dy: keys([0, 0], [1, -1]), blur: keys([0, 0], [1, 0.04]) },
    to: { dy: keys([0, 1], [1, 0]), blur: keys([0, 0.04], [1, 0]) },
  },
  {
    // Le plan s'éclaircit jusqu'au blanc, puis le suivant s'en dégage.
    id: "fade-white",
    label: "Fondu au blanc",
    durationMs: 600,
    ease: "inOutSine",
    from: { opacity: until(0.5) },
    to: { opacity: after(0.5) },
    veil: { color: "#ffffff", opacity: peak(0.5) },
  },
  {
    // Coupe franche masquée par un éclair blanc qui retombe.
    id: "flash",
    label: "Flash",
    durationMs: 400,
    ease: "linear",
    from: { opacity: until(0.15) },
    to: { opacity: after(0.15) },
    veil: { color: "#ffffff", opacity: keys([0, 0], [0.15, 1, "outQuad"], [1, 0, "outCubic"]) },
  },
  {
    // Une lumière chaude envahit le cadre jusqu'à le brûler ; les plans changent dessous.
    id: "light-leak",
    label: "Fuite de lumière",
    durationMs: 800,
    ease: "linear",
    from: { opacity: until(0.5), brightness: keys([0, 1], [0.5, 2.2, "inQuad"]) },
    to: { opacity: after(0.5), brightness: keys([0, 2.2], [0.5, 2.2], [1, 1, "outQuad"]) },
    veil: { color: "#ffd9a8", opacity: peak(0.5, 0.75, "inQuad", "outQuad") },
  },
  {
    // Le plan tourne sur lui-même et rapetisse ; le suivant arrive en tournant.
    id: "spin",
    label: "Tourbillon",
    durationMs: 700,
    ease: "inOutCubic",
    from: { rotate: keys([0, 0], [0.5, 180]), scale: keys([0, 1], [0.5, 0]), opacity: until(0.5) },
    to: { rotate: keys([0, -180], [0.5, -180], [1, 0]), scale: keys([0, 0], [0.5, 0], [1, 1]), opacity: after(0.5) },
  },
  {
    // Le plan se retourne comme une carte : il s'amincit, et le suivant s'élargit au dos.
    id: "flip",
    label: "Retournement",
    durationMs: 600,
    ease: "inOutSine",
    from: { scaleX: keys([0, 1], [0.5, 0, "inSine"]), opacity: until(0.5) },
    to: { scaleX: keys([0, 0], [0.5, 0], [1, 1, "outSine"]), opacity: after(0.5) },
  },
  {
    // Le plan précédent bascule et tombe, et découvre le suivant.
    id: "drop",
    label: "Chute",
    durationMs: 700,
    ease: "inQuad",
    from: { dy: keys([0, 0], [1, 1.2]), rotate: keys([0, 0], [1, 10]) },
    to: {},
    fromOnTop: true,
  },
  {
    // Le plan précédent s'aplatit vers le bas et laisse le suivant.
    id: "squeeze",
    label: "Écrasement",
    durationMs: 500,
    ease: "inOutCubic",
    from: { scaleY: keys([0, 1], [1, 0]), dy: keys([0, 0], [1, 0.25]) },
    to: {},
    fromOnTop: true,
  },
  {
    // Le plan suivant monte du bas et dépasse un peu sa place avant de s'y poser.
    id: "rise-bounce",
    label: "Arrivée par le bas",
    durationMs: 600,
    ease: "linear",
    from: {},
    to: { dy: keys([0, 1], [1, 0, "outBack"]) },
  },
];

const transitions = new Map<string, TransitionPreset>();
for (const preset of [...LEGACY_TRANSITIONS, ...NEW_TRANSITIONS]) {
  if (transitions.has(preset.id)) throw new Error(`Transition en double : ${preset.id}`);
  transitions.set(preset.id, preset);
}

/** Identifiants des cinq transitions d'origine. */
export const LEGACY_TRANSITION_IDS = LEGACY_TRANSITIONS.map((preset) => preset.id);

/** Transition d'un identifiant ; inconnue (projet plus récent), elle devient un fondu enchaîné. */
export function getTransition(id: string): TransitionPreset {
  return transitions.get(id) ?? transitions.get("fade")!;
}

/** Vrai si l'identifiant désigne une transition connue. */
export function isKnownTransition(id: string): boolean {
  return transitions.has(id);
}

/** Toutes les transitions, les cinq d'origine en tête. */
export function listTransitions(): TransitionPreset[] {
  return [...transitions.values()];
}

/** Avancement adouci d'une transition, de 0 à 1. */
export function transitionProgress(preset: TransitionPreset, linear: number): number {
  return resolveEase(preset.ease)(clamp01(linear));
}

// ─── Caméra ──────────────────────────────────────────────────────

/** Propriétés de la caméra d'une image. */
export type CameraProperty = "zoom" | "panX" | "panY" | "rotate" | "shiftX" | "shiftY" | "blur" | "brightness";

export const CAMERA_REST: Record<CameraProperty, number> = {
  zoom: 1,
  panX: 0,
  panY: 0,
  rotate: 0,
  shiftX: 0,
  shiftY: 0,
  blur: 0,
  brightness: 1,
};

export interface CameraPreset {
  id: string;
  label: string;
  /**
   * `span` : le mouvement couvre tout le plan ; `start` : il se joue au début
   * du plan, en `durationMs`, puis tient sa dernière valeur ; `loop` : il
   * recommence toutes les `durationMs`.
   */
  timing: "span" | "start" | "loop";
  durationMs: number;
  ease: EaseSpec;
  tracks: Partial<Record<CameraProperty, Keyframe[]>>;
}

/** Bruit reproductible pour les secousses, de −1 à 1. */
function noise(seed: number, count: number): number[] {
  let state = seed >>> 0;
  return Array.from({ length: count }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 4294967296) * 2 - 1;
  });
}

/**
 * Secousse amortie : des points tirés une fois pour toutes, dont l'amplitude
 * décroît comme `e^(−decay·t)`, refermée au repos.
 */
function shake(seed: number, points: number, amplitude: number, decay: number): Keyframe[] {
  const values = noise(seed, points);
  const frames: Keyframe[] = [{ at: 0, value: 0 }];
  for (let i = 1; i < points; i++) {
    const at = i / points;
    frames.push({ at, value: Math.round(values[i] * amplitude * Math.exp(-decay * at) * 10000) / 10000, ease: "inOutSine" });
  }
  frames.push({ at: 1, value: 0, ease: "inOutSine" });
  return frames;
}

/** Retour exponentiel de `from` au repos `rest` (constante `tau` en part de la durée). */
function decayTo(from: number, rest: number, tau: number, steps = 16): Keyframe[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const at = i / steps;
    const value = i === steps ? rest : rest + (from - rest) * Math.exp(-at / tau);
    return i === 0 ? { at, value: from } : { at, value: Math.round(value * 10000) / 10000, ease: "linear" as const };
  });
}

/** Somme de sinus refermée sur la boucle : `cycles` entiers par passage. */
function sway(harmonics: [cycles: number, weight: number, phase: number][], amplitude: number, steps = 48): Keyframe[] {
  const raw = (p: number) => harmonics.reduce((sum, [cycles, weight, phase]) => sum + weight * (Math.sin(2 * Math.PI * cycles * p + phase) - Math.sin(phase)), 0);
  let top = 0;
  for (let i = 0; i <= 240; i++) top = Math.max(top, Math.abs(raw(i / 240)));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const at = i / steps;
    const value = i === steps ? 0 : Math.round(((amplitude * raw(at)) / (top || 1)) * 10000) / 10000;
    return i === 0 ? { at, value } : { at, value, ease: "linear" as const };
  });
}

const LEGACY_CAMERA: CameraPreset[] = [
  { id: "none", label: "Fixe", timing: "span", durationMs: 0, ease: "inOutSine", tracks: {} },
  { id: "zoom-in", label: "Zoom avant", timing: "span", durationMs: 0, ease: "inOutSine", tracks: { zoom: keys([0, 1], [1, 1.15]) } },
  { id: "zoom-out", label: "Zoom arrière", timing: "span", durationMs: 0, ease: "inOutSine", tracks: { zoom: keys([0, 1.15], [1, 1]) } },
  { id: "pan-left", label: "Panoramique vers la gauche", timing: "span", durationMs: 0, ease: "inOutSine", tracks: { zoom: keys([0, 1.12], [1, 1.12]), panX: keys([0, 1], [1, -1]) } },
  { id: "pan-right", label: "Panoramique vers la droite", timing: "span", durationMs: 0, ease: "inOutSine", tracks: { zoom: keys([0, 1.12], [1, 1.12]), panX: keys([0, -1], [1, 1]) } },
  { id: "pan-up", label: "Panoramique vers le haut", timing: "span", durationMs: 0, ease: "inOutSine", tracks: { zoom: keys([0, 1.12], [1, 1.12]), panY: keys([0, 1], [1, -1]) } },
  { id: "pan-down", label: "Panoramique vers le bas", timing: "span", durationMs: 0, ease: "inOutSine", tracks: { zoom: keys([0, 1.12], [1, 1.12]), panY: keys([0, -1], [1, 1]) } },
];

const NEW_CAMERA: CameraPreset[] = [
  // Ken Burns : un lent agrandissement qui glisse en biais.
  { id: "ken-burns", label: "Ken Burns", timing: "span", durationMs: 0, ease: "linear", tracks: { zoom: keys([0, 1.06], [1, 1.16]), panX: keys([0, 0.6], [1, -0.6]), panY: keys([0, 0.4], [1, -0.4]) } },
  { id: "ken-burns-out", label: "Ken Burns inversé", timing: "span", durationMs: 0, ease: "linear", tracks: { zoom: keys([0, 1.16], [1, 1.06]), panX: keys([0, -0.6], [1, 0.6]), panY: keys([0, -0.4], [1, 0.4]) } },
  // Grand recul : on découvre l'image en entier.
  { id: "pull-out", label: "Grand recul", timing: "span", durationMs: 0, ease: "inOutSine", tracks: { zoom: keys([0, 1.3], [1, 1]) } },
  // Grue : la caméra s'élève en s'inclinant un peu.
  { id: "crane-up", label: "Plan grue", timing: "span", durationMs: 0, ease: "inOutSine", tracks: { zoom: keys([0, 1.2], [1, 1.2]), panY: keys([0, 0.75], [1, -0.75]), rotate: keys([0, 0], [1, 1.5]) } },
  // Dérive : un glissement à peine tourné, pour une image qui ne doit pas sembler figée.
  { id: "drift", label: "Dérive lente", timing: "span", durationMs: 0, ease: "inOutSine", tracks: { zoom: keys([0, 1.12], [1, 1.12]), panX: keys([0, -0.5], [1, 0.5]), rotate: keys([0, -0.8], [1, 0.8]) } },
  // Zoom tournant : on s'approche en vrillant légèrement.
  { id: "zoom-twist", label: "Zoom tournant", timing: "span", durationMs: 0, ease: "inOutSine", tracks: { zoom: keys([0, 1.1], [1, 1.28]), rotate: keys([0, 0], [1, 4]) } },
  // Zoom coup de poing : un bond de 7 % au début du plan, qui retombe très vite.
  { id: "punch-zoom", label: "Zoom coup de poing", timing: "start", durationMs: 320, ease: "linear", tracks: { zoom: decayTo(1.07, 1, 0.3) } },
  // Secousse : forte à l'impact, puis amortie.
  { id: "shake", label: "Secousse", timing: "start", durationMs: 450, ease: "linear", tracks: { zoom: decayTo(1.05, 1, 0.45), shiftX: shake(7, 14, 0.03, 4), shiftY: shake(11, 14, 0.024, 4) } },
  // Tremblement d'impact : la secousse, plus une rotation qui claque.
  { id: "impact-shake", label: "Tremblement d'impact", timing: "start", durationMs: 600, ease: "linear", tracks: { zoom: decayTo(1.12, 1, 0.35), shiftX: shake(13, 18, 0.045, 5), shiftY: shake(17, 18, 0.035, 5), rotate: shake(19, 18, 2.5, 5) } },
  // Bascule : quelques degrés, très vite, puis le retour.
  { id: "roll-hit", label: "Bascule", timing: "start", durationMs: 300, ease: "linear", tracks: { zoom: keys([0, 1.1], [1, 1, "outCubic"]), rotate: keys([0, 0], [0.2, 2.5, "outQuad"], [1, 0, "outCubic"]) } },
  // Panoramique fouetté : arrivée très rapide, floue, et un atterrissage net.
  { id: "whip-in", label: "Panoramique fouetté", timing: "start", durationMs: 450, ease: "outQuart", tracks: { zoom: keys([0, 1.12], [1, 1.12]), panX: keys([0, -1], [1, 0]), blur: keys([0, 0.03], [0.6, 0], [1, 0]) } },
  // Mise au point : l'image sort du flou au début du plan.
  { id: "focus-in", label: "Mise au point", timing: "start", durationMs: 650, ease: "inOutSine", tracks: { blur: keys([0, 0.012], [1, 0]) } },
  // Caméra à l'épaule : un balancement lent et irrégulier, en boucle.
  {
    id: "handheld",
    label: "Caméra à l'épaule",
    timing: "loop",
    durationMs: 6000,
    ease: "linear",
    tracks: {
      zoom: keys([0, 1.05], [1, 1.05]),
      shiftX: sway([[1, 0.5, 0.3], [2, 0.3, 1.7], [3, 0.2, 2.9]], 0.008),
      shiftY: sway([[1, 0.45, 2.1], [2, 0.35, 0.6], [3, 0.2, 4.0]], 0.006),
      rotate: sway([[1, 0.6, 1.1], [3, 0.4, 0.2]], 0.35),
    },
  },
  // Fond flou : l'image floue et assombrie, agrandie pour que le flou ne ronge pas les bords. Sert de fond à une
  // vidéo posée en entier par-dessus (« Image entière sur fond flou » de « Sous-titrer un clip »).
  { id: "backdrop-blur", label: "Fond flou", timing: "span", durationMs: 0, ease: "linear", tracks: { zoom: keys([0, 1.12], [1, 1.12]), blur: keys([0, 0.035], [1, 0.035]), brightness: keys([0, 0.55], [1, 0.55]) } },
];

const cameras = new Map<string, CameraPreset>();
for (const preset of [...LEGACY_CAMERA, ...NEW_CAMERA]) {
  if (cameras.has(preset.id)) throw new Error(`Mouvement de caméra en double : ${preset.id}`);
  cameras.set(preset.id, preset);
}

/** Identifiants des sept mouvements d'origine (et « none »). */
export const LEGACY_CAMERA_IDS = LEGACY_CAMERA.map((preset) => preset.id);

/** Mouvement d'un identifiant ; inconnu, il vaut « Fixe ». */
export function getCameraMove(id: string | undefined): CameraPreset {
  return (id && cameras.get(id)) || cameras.get("none")!;
}

export function listCameraMoves(): CameraPreset[] {
  return [...cameras.values()];
}

export type CameraValues = Record<CameraProperty, number>;

/**
 * Valeurs d'un mouvement : `progress` est l'avancement dans le plan (de 0 à
 * 1), `elapsedMs` le temps écoulé depuis son début (pour `start` et `loop`).
 */
export function cameraValues(preset: CameraPreset, progress: number, elapsedMs = 0): CameraValues {
  let local: number;
  if (preset.timing === "span" || !(preset.durationMs > 0)) local = clamp01(progress);
  else if (preset.timing === "start") local = clamp01(elapsedMs / preset.durationMs);
  else local = (((elapsedMs % preset.durationMs) + preset.durationMs) % preset.durationMs) / preset.durationMs;
  const p = resolveEase(preset.ease)(local);
  const values = { ...CAMERA_REST };
  for (const key of Object.keys(preset.tracks) as CameraProperty[]) values[key] = sampleKeyframes(preset.tracks[key], p, CAMERA_REST[key]);
  return values;
}

// ─── Effets de plan ──────────────────────────────────────────────

/**
 * Propriétés d'un effet de plan, appliqué à toute une piste : décalage du
 * cadre (part de sa largeur et de sa hauteur), zoom autour du centre,
 * rotation, luminosité, voile de couleur (`flash`), et écart des copies rouge
 * et cyan de l'aberration (`chroma`, part de la largeur).
 */
export type ShotFxProperty = "shiftX" | "shiftY" | "zoom" | "rotate" | "brightness" | "flash" | "chroma";

export const SHOT_FX_REST: Record<ShotFxProperty, number> = {
  shiftX: 0,
  shiftY: 0,
  zoom: 1,
  rotate: 0,
  brightness: 1,
  flash: 0,
  chroma: 0,
};

export interface ShotFxPreset {
  id: string;
  label: string;
  durationMs: number;
  tracks: Partial<Record<ShotFxProperty, Keyframe[]>>;
  /** Couleur du flash. */
  flashColor?: string;
}

const SHOT_FX: ShotFxPreset[] = [
  // Un éclair blanc qui retombe aussitôt.
  { id: "impact-flash", label: "Flash d'impact", durationMs: 250, tracks: { flash: keys([0, 0.9], [1, 0, "outCubic"]) } },
  // Un éclair noir, pour un choc sourd.
  { id: "dark-flash", label: "Éclair noir", durationMs: 250, flashColor: "#000000", tracks: { flash: keys([0, 0.85], [1, 0, "outCubic"]) } },
  // Tout le cadre secoué, très fort puis de moins en moins.
  { id: "frame-shake", label: "Secousse du cadre", durationMs: 450, tracks: { zoom: decayTo(1.04, 1, 0.45), shiftX: shake(23, 14, 0.025, 4), shiftY: shake(29, 14, 0.02, 4) } },
  // Le temps fort : zoom bref, secousse et flash ensemble.
  {
    id: "impact-hit",
    label: "Impact",
    durationMs: 500,
    tracks: { zoom: decayTo(1.08, 1, 0.25), shiftX: shake(31, 16, 0.02, 5), shiftY: shake(37, 16, 0.016, 5), flash: keys([0, 0.6], [0.5, 0, "outCubic"], [1, 0]) },
  },
  // Les couleurs se séparent un instant, puis se recalent.
  { id: "chroma-hit", label: "Aberration d'impact", durationMs: 350, tracks: { chroma: keys([0, 0.012], [1, 0, "outCubic"]) } },
  // Un zoom de frappe sur le temps fort, sans secousse.
  { id: "beat-zoom", label: "Zoom sur le temps fort", durationMs: 300, tracks: { zoom: decayTo(1.07, 1, 0.3) } },
  // Le cadre penche d'un coup et se redresse.
  { id: "tilt-hit", label: "Coup de travers", durationMs: 350, tracks: { zoom: keys([0, 1.12], [1, 1, "outCubic"]), rotate: keys([0, 3], [1, 0, "outCubic"]) } },
  // Le cadre s'éclaire puis revient, comme une surexposition.
  { id: "exposure-pop", label: "Surexposition", durationMs: 400, tracks: { brightness: keys([0, 1.8], [1, 1, "outQuad"]) } },
];

const shotFx = new Map(SHOT_FX.map((preset) => [preset.id, preset]));

export function getShotFx(id: string): ShotFxPreset | undefined {
  return shotFx.get(id);
}

export function listShotFx(): ShotFxPreset[] {
  return [...SHOT_FX];
}

/** Valeurs d'un effet de plan à l'avancement `progress` (de 0 à 1). */
export function shotFxValues(preset: ShotFxPreset, progress: number): Record<ShotFxProperty, number> {
  const values = { ...SHOT_FX_REST };
  for (const key of Object.keys(preset.tracks) as ShotFxProperty[]) values[key] = sampleKeyframes(preset.tracks[key], clamp01(progress), SHOT_FX_REST[key]);
  return values;
}
