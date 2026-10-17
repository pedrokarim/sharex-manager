/**
 * Banque de bruitages (dossier 07 sexies, D3).
 *
 * Les sons sont synthétisés par le code, d'après une recette fixe : aucun
 * enregistrement d'autrui, donc aucune licence à vérifier ni à créditer.
 * Le serveur les écrit une fois dans les données du module
 * (`lib/sfx.ts`), et un clip les pose comme des sons ordinaires, sur une
 * piste « Bruitages » : on les déplace, on les baisse ou on les retire dans
 * l'éditeur comme n'importe quel son.
 *
 * Tout ici est pur : la synthèse rend des échantillons, sans disque.
 */

import { uid } from "./edit";
import type { AudioItem, MediaSource } from "./types";

export const SFX_IDS = ["impact", "whoosh", "pop", "reveal"] as const;
export type SfxId = (typeof SFX_IDS)[number];

export const SFX_LABELS: Record<SfxId, string> = {
  impact: "Impact",
  whoosh: "Whoosh",
  pop: "Pop",
  reveal: "Révélation",
};

/** Durée de chaque son, en millisecondes : la synthèse et les éléments posés la partagent. */
export const SFX_DURATION_MS: Record<SfxId, number> = { impact: 700, whoosh: 600, pop: 160, reveal: 1100 };

export const SFX_SAMPLE_RATE = 44100;

/** Volume d'un bruitage : nettement sous la voix off (0,9). */
export const SFX_VOLUME = 0.45;

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

/** Un bruitage posé à l'image `start`. */
export function sfxItem(id: SfxId, start: number, fps: number, label?: string): AudioItem {
  return {
    id: uid("a-"),
    type: "audio",
    start: Math.max(0, Math.round(start)),
    duration: Math.max(1, Math.round((SFX_DURATION_MS[id] / 1000) * fps)),
    source: sfxSource(id),
    trimStart: 0,
    volume: SFX_VOLUME,
    fadeIn: 0,
    fadeOut: 0,
    ...(label ? { label } : {}),
  };
}

/** Est-ce un bruitage de la banque ? */
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

/**
 * Échantillons d'un bruitage, mono, crête à −3 dB :
 * - impact : coup sourd (sinus qui plonge de 110 à 42 Hz) et claquement bref ;
 * - whoosh : souffle filtré qui monte puis retombe ;
 * - pop : petite bulle (sinus qui grimpe de 500 à 1 300 Hz, très court) ;
 * - révélation : trois notes claires en arpège (do, mi, sol), qui résonnent.
 */
export function synthesizeSfx(id: SfxId, rate = SFX_SAMPLE_RATE): Float32Array {
  const length = Math.round((SFX_DURATION_MS[id] / 1000) * rate);
  const out = new Float32Array(length);
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
    // Fin adoucie sur les dernières 20 ms : jamais de claquement à la coupure.
    const tail = Math.min(1, (length - index) / (0.02 * rate));
    out[index] = value * tail;
  }
  let peak = 0;
  for (const sample of out) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0 ? 0.708 / peak : 0;
  for (let index = 0; index < length; index++) out[index] *= gain;
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
