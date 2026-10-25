/**
 * Banque de bruitages (dossier 07 sexies, D3 ; dossier 01, « illustrations
 * animées », étape I4).
 *
 * Les sons sont synthétisés par le code, d'après une recette fixe : aucun
 * enregistrement d'autrui, donc aucune licence à vérifier ni à créditer.
 * Le serveur les écrit une fois dans les données du module
 * (`lib/sfx.ts`), et un clip les pose comme des sons ordinaires, sur une
 * piste « Bruitages » : on les déplace, on les baisse ou on les retire dans
 * l'éditeur comme n'importe quel son.
 *
 * Deux familles :
 * - les temps forts (D3) : impact, whoosh, pop, révélation ;
 * - les sons de la planche (I4), rares et attachés à ce qui bouge : frappe
 *   d'un terminal (une boucle de quatre touches et une rafale), tic d'un
 *   compteur, coup sourd d'un papier posé sur un bureau (un chiffre qui se
 *   pose, une barre), clic d'un pointeur. Plus discrets que les premiers :
 *   chacun a son volume (`SFX_VOLUMES`), toujours nettement sous la voix.
 *
 * Tout ici est pur : la synthèse rend des échantillons, sans disque.
 */

import { uid } from "./edit";
import type { AudioItem, MediaSource } from "./types";

export const SFX_IDS = ["impact", "whoosh", "pop", "reveal", "type", "type-burst", "tick", "thud", "click"] as const;
export type SfxId = (typeof SFX_IDS)[number];

export const SFX_LABELS: Record<SfxId, string> = {
  impact: "Impact",
  whoosh: "Whoosh",
  pop: "Pop",
  reveal: "Révélation",
  type: "Frappe",
  "type-burst": "Frappe en rafale",
  tick: "Tic",
  thud: "Coup sourd",
  click: "Clic",
};

/** Durée de chaque son, en millisecondes : la synthèse et les éléments posés la partagent. */
export const SFX_DURATION_MS: Record<SfxId, number> = {
  impact: 700,
  whoosh: 600,
  pop: 160,
  reveal: 1100,
  type: 400,
  "type-burst": 640,
  tick: 60,
  thud: 320,
  click: 30,
};

export const SFX_SAMPLE_RATE = 44100;

/** Volume d'un bruitage de temps fort : nettement sous la voix off (0,9). */
export const SFX_VOLUME = 0.45;

/**
 * Volume de chaque son. Les sons de la planche se répètent (une frappe, des
 * tics) ou accompagnent un geste : ils restent sous les temps forts. Mesuré
 * sur 50 ms glissantes, le plus fort d'entre eux, posé à son volume, reste
 * au moins 3 dB sous l'impact posé au sien (voir les tests).
 */
export const SFX_VOLUMES: Record<SfxId, number> = {
  impact: SFX_VOLUME,
  whoosh: SFX_VOLUME,
  pop: SFX_VOLUME,
  reveal: SFX_VOLUME,
  type: 0.35,
  "type-burst": 0.35,
  tick: 0.25,
  thud: 0.2,
  click: 0.3,
};

/**
 * Instants des touches dans la boucle de frappe (`type`), en millisecondes.
 * La boucle commence et finit dans le silence, et l'écart entre la dernière
 * touche et la première de la boucle suivante (103 ms) vaut celui des
 * autres : posées bout à bout, les boucles font une frappe régulière.
 */
export const TYPE_KEY_ONSETS_MS = [8, 108, 212, 305] as const;

/** Durée d'une touche, relâchement compris : une boucle coupée juste avant une touche ne coupe aucun son. */
export const TYPE_KEY_LENGTH_MS = 70;

/** Fichier du son dans les données du module (`data/resources/sfx/`). */
export const sfxFile = (id: SfxId) => `${id}.wav`;

export function sfxSource(id: SfxId): MediaSource {
  return {
    url: `/api/modules/clip-studio/data/resources/sfx/${sfxFile(id)}`,
    ref: `module:clip-studio/resources/sfx/${sfxFile(id)}`,
    name: `Bruitage – ${SFX_LABELS[id]}`,
    kind: "audio",
    durationMs: SFX_DURATION_MS[id],
  };
}

/** Un bruitage posé à l'image `start`, à son volume (`SFX_VOLUMES`). */
export function sfxItem(id: SfxId, start: number, fps: number, label?: string): AudioItem {
  return {
    id: uid("a-"),
    type: "audio",
    start: Math.max(0, Math.round(start)),
    duration: Math.max(1, Math.round((SFX_DURATION_MS[id] / 1000) * fps)),
    source: sfxSource(id),
    trimStart: 0,
    volume: SFX_VOLUMES[id],
    fadeIn: 0,
    fadeOut: 0,
    ...(label ? { label } : {}),
  };
}

/**
 * Le même bruitage à plusieurs instants (les tics d'un compteur, les clics
 * d'un pointeur), en images. Deux sons plus proches que `minGapMs` (par
 * défaut, la durée du son plus 20 ms, 70 ms au moins) n'en font qu'un, et
 * il n'y en a jamais plus de `max` (24 par défaut) : un son reste rare.
 */
export function sfxSeries(id: SfxId, starts: readonly number[], fps: number, options: { label?: string; minGapMs?: number; max?: number } = {}): AudioItem[] {
  const minGap = ((options.minGapMs ?? Math.max(70, SFX_DURATION_MS[id] + 20)) / 1000) * fps;
  const max = options.max ?? 24;
  const items: AudioItem[] = [];
  let last = -Infinity;
  for (const start of [...starts].filter(Number.isFinite).sort((a, b) => a - b)) {
    if (items.length >= max) break;
    if (start - last < minGap) continue;
    items.push(sfxItem(id, start, fps, options.label));
    last = start;
  }
  return items;
}

/**
 * La frappe d'un texte, de l'image `start` pendant `frames` images : des
 * boucles `type` bout à bout. La dernière est raccourcie juste avant la
 * première touche qui ne tiendrait pas entière, jamais au milieu d'un son.
 * Une frappe plus courte qu'une touche ne fait aucun son.
 */
export function typingSfx(start: number, frames: number, fps: number, label?: string): AudioItem[] {
  const first = Math.max(0, Math.round(start));
  const end = first + Math.max(0, Math.round(frames));
  const loop = (SFX_DURATION_MS.type / 1000) * fps;
  const items: AudioItem[] = [];
  for (let index = 0; first + index * loop < end; index++) {
    const at = first + Math.round(index * loop);
    const room = ((end - at) / fps) * 1000;
    // Touches qui tiennent entières dans ce qui reste de la frappe.
    const keys = TYPE_KEY_ONSETS_MS.filter((onset) => onset + TYPE_KEY_LENGTH_MS <= room).length;
    if (keys === 0) break;
    const item = sfxItem("type", at, fps, label);
    if (keys < TYPE_KEY_ONSETS_MS.length) {
      // Coupe dans le silence qui précède la touche suivante.
      const cutMs = TYPE_KEY_ONSETS_MS[keys - 1] + TYPE_KEY_LENGTH_MS;
      item.duration = Math.max(1, Math.min(item.duration, Math.floor((cutMs / 1000) * fps)));
    }
    items.push(item);
  }
  return items;
}

/** Est-ce un bruitage de la banque ? */
export function isSfxSource(source: MediaSource): boolean {
  return /^module:clip-studio\/resources\/sfx\//.test(source.ref);
}

// ─── Synthèse ────────────────────────────────────────────────────

/** Bruit blanc reproductible, de −1 à 1. */
function noise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 4294967296) * 2 - 1;
  };
}

/** Filtre passe-bas à un pôle, réglé à chaque échantillon. */
function onePole() {
  let last = 0;
  return (input: number, cutoff: number, rate: number) => {
    const k = 1 - Math.exp((-2 * Math.PI * cutoff) / rate);
    last += k * (input - last);
    return last;
  };
}

/** Filtre du second ordre (biquad, formules usuelles de l'égaliseur), réglage fixe. */
function biquad(kind: "lowpass" | "bandpass", frequency: number, q: number, rate: number) {
  const w = (2 * Math.PI * frequency) / rate;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  const [b0, b1, b2] = kind === "lowpass" ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2] : [alpha, 0, -alpha];
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (input: number) => {
    const output = (b0 * input + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = input;
    y2 = y1;
    y1 = output;
    return output;
  };
}

/** Montée linéaire sur `seconds` : une attaque jamais instantanée, donc sans claquement numérique. */
const rise = (t: number, seconds: number) => Math.min(1, t / seconds);

/**
 * Une touche de clavier plat, douce : l'enfoncement (souffle bref et filtré,
 * plus le « corps » grave de la touche qui touche le fond), puis le
 * relâchement, plus faible, 45 à 55 ms après. Ajoutée à `out` à l'instant `at`.
 */
function addKeystroke(out: Float32Array, rate: number, at: number, key: { gain: number; tone: number; release: number; seed: number; space?: boolean }) {
  const random = noise(key.seed);
  const press = biquad("bandpass", key.space ? 1500 : 2400, 0.9, rate);
  const lift = biquad("bandpass", key.space ? 1900 : 3000, 1.1, rate);
  const soft = biquad("lowpass", 6500, 0.7, rate);
  const start = Math.round(at * rate);
  const length = Math.round((TYPE_KEY_LENGTH_MS / 1000) * rate);
  const bodyDecay = key.space ? 0.016 : 0.009;
  for (let index = 0; index < length && start + index < out.length; index++) {
    const t = index / rate;
    let value = press(random()) * Math.exp(-t / 0.0022) * 1.6;
    value += Math.sin(2 * Math.PI * key.tone * t) * rise(t, 0.0005) * Math.exp(-t / bodyDecay) * 0.55;
    const after = t - key.release;
    if (after >= 0) {
      value += lift(random()) * Math.exp(-after / 0.0016) * 0.5;
      value += Math.sin(2 * Math.PI * key.tone * 1.4 * after) * rise(after, 0.0004) * Math.exp(-after / 0.005) * 0.14;
    }
    // Les dernières millisecondes de la touche s'éteignent : rien ne déborde sur la suivante.
    const tail = Math.min(1, (length - index) / (0.008 * rate));
    out[start + index] += soft(value) * key.gain * tail;
  }
}

/** Recettes des sons de la planche ; les sons des temps forts gardent leur boucle d'origine plus bas. */
function synthesizeBoardSfx(id: Exclude<SfxId, "impact" | "whoosh" | "pop" | "reveal">, rate: number, out: Float32Array) {
  const random = noise(1234 + SFX_IDS.indexOf(id) * 7919);
  if (id === "type" || id === "type-burst") {
    // Touches un peu différentes l'une de l'autre (hauteur, force, relâchement) : jamais une mitraillette.
    const keys =
      id === "type"
        ? TYPE_KEY_ONSETS_MS.map((onset, index) => ({ at: onset / 1000, gain: [1, 0.82, 0.93, 0.78][index], tone: [310, 280, 335, 295][index], release: [0.048, 0.052, 0.045, 0.05][index] }))
        : [
            { at: 0.01, gain: 0.9, tone: 300, release: 0.05 },
            { at: 0.105, gain: 0.8, tone: 330, release: 0.047 },
            { at: 0.19, gain: 0.95, tone: 285, release: 0.052 },
            { at: 0.285, gain: 0.78, tone: 315, release: 0.046 },
            { at: 0.36, gain: 0.88, tone: 300, release: 0.05 },
            // La dernière est la barre d'espace : plus grave, plus longue.
            { at: 0.47, gain: 1, tone: 170, release: 0.055, space: true },
          ];
    keys.forEach((key, index) => addKeystroke(out, rate, key.at, { ...key, seed: 4242 + index * 131 + (id === "type" ? 0 : 977) }));
    return;
  }
  const length = out.length;
  if (id === "tick") {
    // Tic sec et feutré : une note brève vers 1,9 kHz, un souffle plus aigu encore plus bref, un peu de corps.
    const air = biquad("bandpass", 3200, 1.5, rate);
    const soft = biquad("lowpass", 7000, 0.7, rate);
    for (let index = 0; index < length; index++) {
      const t = index / rate;
      const attack = rise(t, 0.0003);
      const value =
        Math.sin(2 * Math.PI * 1900 * t) * Math.exp(-t / 0.004) * 0.7 +
        air(random()) * Math.exp(-t / 0.0015) * 1.2 +
        Math.sin(2 * Math.PI * 750 * t) * Math.exp(-t / 0.007) * 0.25;
      out[index] = soft(value * attack);
    }
    return;
  }
  if (id === "thud") {
    // Papier posé sur un bureau : un coup grave et mat (de 100 à 55 Hz), un corps de bruit très filtré, à peine de froissement.
    const body = biquad("lowpass", 220, 0.8, rate);
    const body2 = biquad("lowpass", 220, 0.8, rate);
    const paper = biquad("bandpass", 2800, 0.7, rate);
    let phase = 0;
    for (let index = 0; index < length; index++) {
      const t = index / rate;
      phase += (2 * Math.PI * (55 + 45 * Math.exp(-t / 0.035))) / rate;
      const thump = Math.sin(phase) * rise(t, 0.004) * Math.exp(-t / 0.075);
      const felt = body2(body(random())) * rise(t, 0.002) * Math.exp(-t / 0.035) * 9;
      const rustle = paper(random()) * Math.exp(-t / 0.012) * 0.06;
      out[index] = thump * 0.9 + felt * 0.6 + rustle;
    }
    return;
  }
  // Clic de pavé tactile : un « toc » sec à l'enfoncement, un plus faible au relâchement, 12 ms après.
  const press = biquad("bandpass", 1600, 1, rate);
  const lift = biquad("bandpass", 2000, 1.2, rate);
  for (let index = 0; index < length; index++) {
    const t = index / rate;
    let value = press(random()) * rise(t, 0.0002) * Math.exp(-t / 0.0012) * 1.4 + Math.sin(2 * Math.PI * 240 * t) * rise(t, 0.0003) * Math.exp(-t / 0.0045) * 0.5;
    const after = t - 0.012;
    if (after >= 0) value += lift(random()) * Math.exp(-after / 0.001) * 0.6 + Math.sin(2 * Math.PI * 300 * after) * rise(after, 0.0003) * Math.exp(-after / 0.003) * 0.3;
    out[index] = value;
  }
}

/** Fin adoucie : les sons longs s'éteignent sur 20 ms, les sons très courts sur le dixième de leur durée. */
const TAIL_SECONDS = (id: SfxId) => Math.min(0.02, SFX_DURATION_MS[id] / 10000);

/**
 * Échantillons d'un bruitage, mono, crête à −3 dB :
 * - impact : coup sourd (sinus qui plonge de 110 à 42 Hz) et claquement bref ;
 * - whoosh : souffle filtré qui monte puis retombe ;
 * - pop : petite bulle (sinus qui grimpe de 500 à 1 300 Hz, très court) ;
 * - révélation : trois notes claires en arpège (do, mi, sol), qui résonnent ;
 * - frappe : quatre touches douces en boucle (`TYPE_KEY_ONSETS_MS`) ; en
 *   rafale, six touches dont une barre d'espace ;
 * - tic : un tic sec et feutré de 60 ms, pour un compteur ;
 * - coup sourd : un papier posé sur un bureau, l'énergie sous 300 Hz ;
 * - clic : un clic de pavé tactile, 30 ms, enfoncement et relâchement.
 */
export function synthesizeSfx(id: SfxId, rate = SFX_SAMPLE_RATE): Float32Array {
  const length = Math.round((SFX_DURATION_MS[id] / 1000) * rate);
  const out = new Float32Array(length);
  if (id !== "impact" && id !== "whoosh" && id !== "pop" && id !== "reveal") {
    synthesizeBoardSfx(id, rate, out);
    const fade = TAIL_SECONDS(id) * rate;
    for (let index = 0; index < length; index++) out[index] *= Math.min(1, (length - index) / fade);
    return normalize(out);
  }
  const random = noise(1234 + SFX_IDS.indexOf(id) * 7919);
  const low = onePole();
  const band = onePole();
  let phase = 0;
  for (let index = 0; index < length; index++) {
    const t = index / rate;
    const p = index / length;
    let value = 0;
    if (id === "impact") {
      const frequency = 42 + 68 * Math.exp(-t / 0.05);
      phase += (2 * Math.PI * frequency) / rate;
      const body = Math.sin(phase) * Math.exp(-t / 0.18);
      const click = low(random(), 2400, rate) * Math.exp(-t / 0.012) * 2.2;
      value = body + click;
    } else if (id === "whoosh") {
      const envelope = Math.sin(Math.PI * Math.min(1, p * 1.15)) ** 2;
      const cutoff = 300 + 2600 * Math.sin(Math.PI * p);
      const air = low(random(), cutoff, rate) - band(random(), cutoff * 0.35, rate) * 0.6;
      value = air * envelope * 3.2;
    } else if (id === "pop") {
      const frequency = 500 + 800 * Math.min(1, t / 0.06);
      phase += (2 * Math.PI * frequency) / rate;
      const envelope = Math.min(1, t / 0.004) * Math.exp(-t / 0.035);
      value = Math.sin(phase) * envelope;
    } else {
      for (const [offset, frequency] of [
        [0, 1046.5],
        [0.09, 1318.5],
        [0.18, 1568],
      ] as const) {
        const local = t - offset;
        if (local < 0) continue;
        const envelope = Math.min(1, local / 0.006) * Math.exp(-local / 0.32);
        value += (Math.sin(2 * Math.PI * frequency * local) + 0.25 * Math.sin(4 * Math.PI * frequency * local)) * envelope * 0.42;
      }
    }
    // Fin adoucie sur les dernières 20 ms : jamais de claquement à la coupure.
    const tail = Math.min(1, (length - index) / (0.02 * rate));
    out[index] = value * tail;
  }
  return normalize(out);
}

/** Crête ramenée à −3 dB (0,708). */
function normalize(out: Float32Array): Float32Array {
  let peak = 0;
  for (const sample of out) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0 ? 0.708 / peak : 0;
  for (let index = 0; index < out.length; index++) out[index] *= gain;
  return out;
}

/** Fichier WAV (PCM 16 bits, mono) des échantillons. */
export function encodeWav(samples: Float32Array, rate = SFX_SAMPLE_RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true));
  return bytes;
}
