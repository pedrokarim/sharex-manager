import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SFX_DURATION_MS,
  SFX_IDS,
  SFX_SAMPLE_RATE,
  SFX_VOLUME,
  SFX_VOLUMES,
  TYPE_KEY_LENGTH_MS,
  TYPE_KEY_ONSETS_MS,
  sfxFile,
  sfxItem,
  sfxSeries,
  synthesizeSfx,
  typingSfx,
  type SfxId,
} from "@/modules/clip-studio/engine/sfx";
import { ensureSfxBank } from "@/modules/clip-studio/lib/sfx";

const RATE = SFX_SAMPLE_RATE;
const BOARD_SOUNDS: SfxId[] = ["type", "type-burst", "tick", "thud", "click"];

const db = (value: number) => 20 * Math.log10(value);

function energy(samples: Float32Array, from = 0, to = samples.length): number {
  let sum = 0;
  for (let index = Math.max(0, from); index < Math.min(samples.length, to); index++) sum += samples[index] ** 2;
  return sum;
}

/** RMS la plus forte sur 50 ms glissantes : ce qu'on entend d'un son bref. */
function loudest50ms(samples: Float32Array): number {
  const window = Math.round(0.05 * RATE);
  let best = 0;
  for (let start = 0; start < samples.length; start += 32) best = Math.max(best, Math.sqrt(energy(samples, start, start + window) / window));
  return best;
}

/** Instant (ms) où le son a rendu 99 % de son énergie. */
function energyDurationMs(samples: Float32Array): number {
  const total = energy(samples);
  let sum = 0;
  for (let index = 0; index < samples.length; index++) {
    sum += samples[index] ** 2;
    if (sum >= 0.99 * total) return (index / RATE) * 1000;
  }
  return (samples.length / RATE) * 1000;
}

/** Spectre de puissance par FFT (radix 2, complété de zéros). */
function powerSpectrum(samples: Float32Array): { frequency: number; power: number }[] {
  let size = 1;
  while (size < samples.length) size <<= 1;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  samples.forEach((value, index) => (re[index] = value));
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    for (let start = 0; start < size; start += length) {
      for (let k = 0; k < length / 2; k++) {
        const wr = Math.cos(angle * k);
        const wi = Math.sin(angle * k);
        const a = start + k;
        const b = a + length / 2;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
  return Array.from({ length: size / 2 - 1 }, (_, index) => ({ frequency: ((index + 1) * RATE) / size, power: re[index + 1] ** 2 + im[index + 1] ** 2 }));
}

function shareBelow(samples: Float32Array, hertz: number): number {
  const spectrum = powerSpectrum(samples);
  const total = spectrum.reduce((sum, bin) => sum + bin.power, 0);
  return spectrum.filter((bin) => bin.frequency < hertz).reduce((sum, bin) => sum + bin.power, 0) / total;
}

function centroid(samples: Float32Array): number {
  const spectrum = powerSpectrum(samples);
  const total = spectrum.reduce((sum, bin) => sum + bin.power, 0);
  return spectrum.reduce((sum, bin) => sum + bin.power * bin.frequency, 0) / total;
}

/** Attaques : enveloppe sur 2 ms, un pic compté quand elle franchit 30 % de la crête après un silence de 30 ms. */
function onsetsMs(samples: Float32Array): number[] {
  const hop = Math.round(0.002 * RATE);
  const envelope: number[] = [];
  for (let start = 0; start < samples.length; start += hop) envelope.push(Math.sqrt(energy(samples, start, start + hop) / hop));
  const threshold = Math.max(...envelope) * 0.3;
  const onsets: number[] = [];
  let quietSince = -Infinity;
  envelope.forEach((value, index) => {
    const ms = index * 2;
    if (value >= threshold && ms - quietSince >= 30 && (onsets.length === 0 || ms - onsets[onsets.length - 1] >= 30)) onsets.push(ms);
    if (value >= threshold) quietSince = -Infinity;
    else if (quietSince === -Infinity) quietSince = ms;
  });
  return onsets;
}

describe("bruitages de la planche : synthèse", () => {
  it("chaque son a sa durée, sa crête à −3 dB, une fin et un début sans claquement, toujours le même", () => {
    for (const id of BOARD_SOUNDS) {
      const samples = synthesizeSfx(id);
      expect(samples.length, id).toBe(Math.round((SFX_DURATION_MS[id] / 1000) * RATE));
      const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
      expect(peak, id).toBeCloseTo(0.708, 3);
      expect(Math.abs(samples[0]), id).toBeLessThan(0.01);
      expect(Math.abs(samples[samples.length - 1]), id).toBeLessThan(0.001);
      expect(samples.every(Number.isFinite), id).toBe(true);
      expect(synthesizeSfx(id), id).toEqual(samples);
    }
  });

  it("les quatre sons des temps forts n'ont pas bougé", () => {
    // Crête, RMS et durée d'énergie relevées avant l'ajout des sons de la planche.
    const reference: Record<string, [number, number]> = { impact: [-19.8, 404], whoosh: [-18.1, 421], pop: [-15.2, 83], reveal: [-17.3, 815] };
    for (const [id, [rms, duration]] of Object.entries(reference)) {
      const samples = synthesizeSfx(id as SfxId);
      expect(db(Math.sqrt(energy(samples) / samples.length)), id).toBeCloseTo(rms, 0);
      expect(energyDurationMs(samples), id).toBeCloseTo(duration, -1);
    }
  });

  it("coup sourd : un papier posé, grave et mat, l'énergie sous 300 Hz", () => {
    const samples = synthesizeSfx("thud");
    expect(shareBelow(samples, 300)).toBeGreaterThan(0.9);
    expect(centroid(samples)).toBeLessThan(200);
    expect(energyDurationMs(samples)).toBeLessThan(250);
  });

  it("clic : bref (moins de 40 ms), sec", () => {
    const samples = synthesizeSfx("click");
    expect(SFX_DURATION_MS.click).toBeLessThan(40);
    expect(energyDurationMs(samples)).toBeLessThan(25);
    // Deux temps : l'enfoncement, puis le relâchement 12 ms après, plus faible.
    const press = energy(samples, 0, Math.round(0.011 * RATE));
    const release = energy(samples, Math.round(0.012 * RATE), Math.round(0.02 * RATE));
    expect(release).toBeGreaterThan(0);
    expect(release).toBeLessThan(press);
  });

  it("tic : très court, dans le médium aigu, jamais un bip", () => {
    const samples = synthesizeSfx("tick");
    expect(energyDurationMs(samples)).toBeLessThan(20);
    const middle = centroid(samples);
    expect(middle).toBeGreaterThan(1000);
    expect(middle).toBeLessThan(4000);
  });

  it("frappe : quatre touches en boucle, qui commence et finit dans le silence", () => {
    const samples = synthesizeSfx("type");
    const onsets = onsetsMs(samples);
    expect(onsets).toHaveLength(TYPE_KEY_ONSETS_MS.length);
    onsets.forEach((onset, index) => expect(Math.abs(onset - TYPE_KEY_ONSETS_MS[index])).toBeLessThanOrEqual(4));
    // Silence en tête et en fin : deux boucles bout à bout ne claquent pas à la jointure.
    const head = Math.round((TYPE_KEY_ONSETS_MS[0] / 1000) * RATE);
    const tailFrom = Math.round(((TYPE_KEY_ONSETS_MS[3] + TYPE_KEY_LENGTH_MS) / 1000) * RATE);
    expect(samples.subarray(0, head).every((value) => value === 0)).toBe(true);
    expect(samples.subarray(tailFrom).every((value) => value === 0)).toBe(true);
    // L'écart de la dernière touche à la première de la boucle suivante vaut celui des autres : de 90 à 110 ms, un peu irrégulier comme une main.
    const gaps = [...TYPE_KEY_ONSETS_MS.slice(1).map((onset, index) => onset - TYPE_KEY_ONSETS_MS[index]), SFX_DURATION_MS.type - TYPE_KEY_ONSETS_MS[3] + TYPE_KEY_ONSETS_MS[0]];
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(90);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(110);
    expect(new Set(gaps).size).toBeGreaterThan(1);
    // Des touches douces : l'essentiel du spectre sous 3 kHz.
    expect(centroid(samples)).toBeLessThan(1500);
  });

  it("frappe en rafale : six touches, la dernière (barre d'espace) plus grave", () => {
    const samples = synthesizeSfx("type-burst");
    const onsets = onsetsMs(samples);
    expect(onsets).toHaveLength(6);
    const space = samples.subarray(Math.round(0.47 * RATE), Math.round(0.54 * RATE));
    const key = samples.subarray(Math.round(0.36 * RATE), Math.round(0.43 * RATE));
    expect(centroid(space)).toBeLessThan(centroid(key));
  });
});

describe("bruitages de la planche : niveaux", () => {
  it("sous les temps forts et loin sous la voix", () => {
    const impact = loudest50ms(synthesizeSfx("impact")) * SFX_VOLUMES.impact;
    for (const id of BOARD_SOUNDS) {
      const placed = loudest50ms(synthesizeSfx(id)) * SFX_VOLUMES[id];
      expect(db(placed) - db(impact), id).toBeLessThanOrEqual(-3);
      // Jamais inaudible pour autant : moins de 20 dB sous l'impact.
      expect(db(placed) - db(impact), id).toBeGreaterThan(-20);
      expect(SFX_VOLUMES[id], id).toBeLessThan(SFX_VOLUME);
    }
    for (const id of ["impact", "whoosh", "pop", "reveal"] as const) expect(SFX_VOLUMES[id]).toBe(SFX_VOLUME);
  });
});

describe("bruitages de la planche : pose", () => {
  it("sfxItem pose chaque son à sa durée et à son volume", () => {
    for (const id of SFX_IDS) {
      const item = sfxItem(id, 12.4, 30, "Bruitage – essai");
      expect(item).toMatchObject({ type: "audio", start: 12, volume: SFX_VOLUMES[id], trimStart: 0, label: "Bruitage – essai" });
      expect(item.duration).toBe(Math.max(1, Math.round((SFX_DURATION_MS[id] / 1000) * 30)));
      expect(item.source.ref).toBe(`module:clip-studio/resources/sfx/${sfxFile(id)}`);
    }
  });

  it("une frappe pose des boucles bout à bout et coupe la dernière avant une touche", () => {
    // 1,5 s à 30 images/s : trois boucles entières (36 images), puis 9 images (300 ms) pour la quatrième.
    const items = typingSfx(10, 45, 30);
    expect(items.map((item) => item.start)).toEqual([10, 22, 34, 46]);
    expect(items.slice(0, 3).every((item) => item.duration === 12 && item.source.ref.endsWith("/type.wav"))).toBe(true);
    // Il reste 300 ms : trois touches tiennent entières (212 + 70 = 282 ms), pas la quatrième (305 + 70 = 375 ms).
    expect(items[3].duration).toBe(Math.floor(((TYPE_KEY_ONSETS_MS[2] + TYPE_KEY_LENGTH_MS) / 1000) * 30));
    expect(items[3].start + items[3].duration).toBeLessThanOrEqual(55);
    // À 25 images/s, les boucles restent espacées de 400 ms (10 images).
    expect(typingSfx(0, 50, 25).map((item) => item.start)).toEqual([0, 10, 20, 30, 40]);
    // Une frappe plus courte qu'une touche ne fait aucun son.
    expect(typingSfx(0, 2, 30)).toEqual([]);
  });

  it("une série reste rare : écart minimal et nombre borné", () => {
    const ticks = sfxSeries("tick", [0, 1, 3, 5, 6, 9, 30], 30);
    // 80 ms au moins entre deux tics (60 ms de son plus 20) : 2,4 images à 30 images/s.
    expect(ticks.map((item) => item.start)).toEqual([0, 3, 6, 9, 30]);
    expect(sfxSeries("click", Array.from({ length: 100 }, (_, index) => index * 10), 30)).toHaveLength(24);
    expect(sfxSeries("thud", [40, 10], 30, { max: 1 }).map((item) => item.start)).toEqual([10]);
  });
});

describe("bruitages de la planche : banque sur le disque", () => {
  it("écrit les nouveaux sons en WAV à côté des anciens", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sxm-sfx-"));
    try {
      expect(ensureSfxBank(directory)).toBe(SFX_IDS.length);
      for (const id of BOARD_SOUNDS) {
        const file = fs.readFileSync(path.join(directory, sfxFile(id)));
        expect(file.subarray(0, 4).toString("ascii")).toBe("RIFF");
        expect(file.length).toBe(44 + Math.round((SFX_DURATION_MS[id] / 1000) * RATE) * 2);
      }
      // Déjà là : rien n'est réécrit.
      expect(ensureSfxBank(directory)).toBe(0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
