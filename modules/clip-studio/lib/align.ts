/**
 * Instants des mots d'une voix de synthèse, sans modèle de reconnaissance.
 *
 * Piper ne fournit pas d'alignement. On le déduit du son :
 * 1. les pauses (silences d’au moins 60 ms) sont repérées dans le WAV ;
 * 2. le texte est découpé en phrases à la ponctuation, et chaque fin de
 *    phrase est calée sur la pause la plus proche de sa position attendue ;
 * 3. dans chaque phrase, les mots se partagent le temps réellement parlé
 *    au prorata de leur longueur prononcée (un nombre compte plus que ses
 *    chiffres).
 * La précision suffit à des sous-titres : l'erreur reste de l'ordre d'une
 * syllabe, et les coupures de phrase tombent juste.
 */

import fs from "fs";
import type { TimedWord } from "../engine/types";

const FRAME_MS = 10;
const MIN_GAP_FRAMES = 6;

interface Pcm {
  samples: Int16Array;
  sampleRate: number;
}

function readPcm(file: string): Pcm | null {
  const buffer = fs.readFileSync(file);
  let offset = 12;
  let sampleRate = 0;
  let bits = 0;
  let channels = 1;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("latin1", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bits = buffer.readUInt16LE(offset + 22);
    }
    if (id === "data") {
      if (bits !== 16 || !sampleRate) return null;
      const end = Math.min(buffer.length, offset + 8 + size);
      const view = new Int16Array(buffer.buffer.slice(buffer.byteOffset + offset + 8, buffer.byteOffset + end));
      if (channels === 1) return { samples: view, sampleRate };
      const mono = new Int16Array(Math.floor(view.length / channels));
      for (let index = 0; index < mono.length; index++) mono[index] = view[index * channels];
      return { samples: mono, sampleRate };
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

/** Vrai pour chaque tranche de 10 ms où la voix parle. */
function voicedFrames({ samples, sampleRate }: Pcm): boolean[] {
  const size = Math.max(1, Math.round((sampleRate * FRAME_MS) / 1000));
  const energy: number[] = [];
  for (let start = 0; start < samples.length; start += size) {
    let sum = 0;
    const end = Math.min(samples.length, start + size);
    for (let index = start; index < end; index++) sum += samples[index] * samples[index];
    energy.push(Math.sqrt(sum / Math.max(1, end - start)));
  }
  const sorted = [...energy].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  const threshold = Math.max(200, loud * 0.1);
  return energy.map((value) => value > threshold);
}

/** Longueur prononcée approximative d'un mot. */
function spokenWeight(word: string): number {
  const letters = (word.match(/\p{L}/gu) ?? []).length;
  const digits = (word.match(/\d/g) ?? []).length;
  return Math.max(1.5, letters + digits * 5);
}

interface Gap {
  start: number;
  end: number;
}

function findGaps(voiced: boolean[], first: number, last: number): Gap[] {
  const gaps: Gap[] = [];
  let runStart = -1;
  for (let index = first; index <= last; index++) {
    if (!voiced[index]) {
      if (runStart === -1) runStart = index;
    } else if (runStart !== -1) {
      if (index - runStart >= MIN_GAP_FRAMES) gaps.push({ start: runStart, end: index });
      runStart = -1;
    }
  }
  return gaps;
}

/** Répartit des mots sur les tranches parlées de [from, to[. */
function spread(words: string[], voiced: boolean[], from: number, to: number): TimedWord[] {
  const spoken: number[] = [];
  for (let index = from; index < to; index++) if (voiced[index]) spoken.push(index);
  if (spoken.length === 0) for (let index = from; index < to; index++) spoken.push(index);
  const weights = words.map(spokenWeight);
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cumulative = 0;
  return words.map((text, index) => {
    const startAt = Math.floor((cumulative / total) * spoken.length);
    cumulative += weights[index];
    const endAt = Math.max(startAt, Math.ceil((cumulative / total) * spoken.length) - 1);
    const startFrame = spoken[Math.min(startAt, spoken.length - 1)] ?? from;
    const endFrame = (spoken[Math.min(endAt, spoken.length - 1)] ?? to) + 1;
    return { text, startMs: startFrame * FRAME_MS, endMs: endFrame * FRAME_MS };
  });
}

/** Mots du texte ; une ponctuation isolée (« course ? ») rejoint le mot d'avant. */
function tokenize(text: string): string[] {
  const words: string[] = [];
  for (const token of text.split(/\s+/).filter(Boolean)) {
    if (words.length && !/[\p{L}\d]/u.test(token)) words[words.length - 1] += ` ${token}`;
    else words.push(token);
  }
  return words;
}

interface Bound {
  end: number;
  next: number;
}

function matchGaps(
  expected: number[],
  gaps: Gap[],
  spokenBefore: (frame: number) => number,
  spokenTotal: number,
  voiced: boolean[],
  first: number,
  last: number
): Bound[] {
  const count = expected.length;
  if (count === 0) return [];
  // Sans assez de pauses : position estimée, sur le temps parlé.
  const estimate = (target: number): Bound => {
    let frame = first;
    let spoken = 0;
    while (frame < last && spoken < target) {
      if (voiced[frame]) spoken++;
      frame++;
    }
    return { end: frame, next: frame };
  };
  if (gaps.length < count) return expected.map(estimate);

  const position = gaps.map((gap) => spokenBefore(gap.start));
  const cost = (bound: number, gap: number) =>
    Math.abs(position[gap] - expected[bound]) / Math.max(1, spokenTotal) -
    0.25 * Math.min(1, (gaps[gap].end - gaps[gap].start) / 40);

  // best[i][j] : coût minimal quand la fin de phrase i tombe sur la pause j.
  const best = expected.map(() => gaps.map(() => Infinity));
  const from = expected.map(() => gaps.map(() => -1));
  for (let j = 0; j < gaps.length; j++) best[0][j] = cost(0, j);
  for (let i = 1; i < count; i++) {
    let runningBest = Infinity;
    let runningIndex = -1;
    for (let j = 1; j < gaps.length; j++) {
      if (best[i - 1][j - 1] < runningBest) {
        runningBest = best[i - 1][j - 1];
        runningIndex = j - 1;
      }
      if (runningIndex >= 0) {
        best[i][j] = runningBest + cost(i, j);
        from[i][j] = runningIndex;
      }
    }
  }
  let j = 0;
  for (let candidate = 1; candidate < gaps.length; candidate++) {
    if (best[count - 1][candidate] < best[count - 1][j]) j = candidate;
  }
  const chosen: number[] = [];
  for (let i = count - 1; i >= 0; i--) {
    chosen.unshift(j);
    j = from[i][j];
  }
  return chosen.map((index) => ({ end: gaps[index].start, next: gaps[index].end }));
}

export function alignWords(file: string, text: string): TimedWord[] {
  const words = tokenize(text);
  if (words.length === 0) return [];
  const pcm = readPcm(file);
  if (!pcm) return [];
  const voiced = voicedFrames(pcm);
  const first = voiced.indexOf(true);
  const last = voiced.lastIndexOf(true);
  if (first === -1) return [];

  // Phrases : coupure après une ponctuation.
  const phrases: string[][] = [];
  let current: string[] = [];
  for (const word of words) {
    current.push(word);
    if (/[.,;:!?…]$/.test(word)) {
      phrases.push(current);
      current = [];
    }
  }
  if (current.length) phrases.push(current);

  // Fin de chaque phrase : une pause distincte, dans l'ordre. On choisit
  // l'ensemble qui colle le mieux aux positions attendues (au prorata des
  // mots), en préférant les pauses longues : Piper marque aussi quelques
  // respirations au milieu d'une phrase.
  const gaps = findGaps(voiced, first, last);
  const spokenBefore = (frame: number) => {
    let count = 0;
    for (let index = first; index < frame; index++) if (voiced[index]) count++;
    return count;
  };
  const spokenTotal = spokenBefore(last + 1);
  const totalWeight = words.reduce((sum, word) => sum + spokenWeight(word), 0);
  const expected: number[] = [];
  let weightSoFar = 0;
  for (const phrase of phrases.slice(0, -1)) {
    weightSoFar += phrase.reduce((sum, word) => sum + spokenWeight(word), 0);
    expected.push((weightSoFar / totalWeight) * spokenTotal);
  }
  const bounds = matchGaps(expected, gaps, spokenBefore, spokenTotal, voiced, first, last);

  const timed: TimedWord[] = [];
  let from = first;
  phrases.forEach((phrase, index) => {
    const bound = bounds[index];
    const to = bound ? Math.max(from + 1, bound.end) : last + 1;
    timed.push(...spread(phrase, voiced, from, to));
    if (bound) from = Math.max(to, bound.next);
  });
  return timed;
}
