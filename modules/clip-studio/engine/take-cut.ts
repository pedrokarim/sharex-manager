/**
 * « Monter ma prise » (dossier 01, V6) : la coupe d'une prise de parole.
 *
 * Une prise brute est pleine de blancs, de respirations, de faux départs et
 * de phrases reprises. Ce module décide, à partir du son et des mots
 * horodatés, ce qui reste :
 *
 * 1. **Blancs** : l'énergie du son par tranches de 10 ms dit où personne ne
 *    parle (seuil relatif à la voix de la prise). Un blanc plus long que le
 *    seuil choisi est coupé, en gardant une marge de chaque côté pour ne pas
 *    rogner une syllabe. Un trou entre deux mots ne compte que si le son y
 *    est vraiment calme (Whisper finit parfois un mot trop tôt).
 * 2. **Reprises** : la prise est découpée en phrases ; une phrase dont le
 *    début est repris par la suivante (« Alors aujourd'hui on va… Alors
 *    aujourd'hui on va voir… ») est un faux départ : seule la dernière
 *    tentative complète reste. Une phrase faite d'hésitations seules
 *    (« euh… ») part aussi.
 * 3. **Montage** : les passages gardés (liste de décisions de montage),
 *    calés sur les images du projet, et la correspondance du temps de la
 *    source vers le temps du montage, vitesse comprise. Les mots gardés y
 *    sont recalés, sans chevauchement.
 *
 * Tout est pur : le serveur fournit le son décodé et les mots.
 */

import type { TimedWord } from "./types";

// ─── Réglages ────────────────────────────────────────────────────

/** Seuil des blancs choisi à la création : doux (respire), normal, serré (rythme de short). */
export type SilenceMode = "soft" | "normal" | "tight";

export interface SilencePreset {
  /** Blanc le plus court qui soit coupé, en ms. */
  minPauseMs: number;
  /** Marges gardées après la fin et avant la reprise de la parole, en ms (80 à 120 ms). */
  padBeforeMs: number;
  padAfterMs: number;
  /** Marge plus large après une fin de phrase : la respiration reste naturelle. */
  sentencePadMs: number;
}

export const SILENCE_PRESETS: Record<SilenceMode, SilencePreset> = {
  soft: { minPauseMs: 600, padBeforeMs: 120, padAfterMs: 110, sentencePadMs: 180 },
  normal: { minPauseMs: 350, padBeforeMs: 100, padAfterMs: 90, sentencePadMs: 140 },
  tight: { minPauseMs: 220, padBeforeMs: 85, padAfterMs: 80, sentencePadMs: 100 },
};

/** Vitesse globale du montage : 1 à 1,3 (1,1 par défaut, le débit habituel d'un short). */
export const TAKE_SPEED = { min: 1, max: 1.3, default: 1.1 } as const;

export function cleanTakeSpeed(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return TAKE_SPEED.default;
  return Math.round(Math.max(TAKE_SPEED.min, Math.min(TAKE_SPEED.max, number)) * 100) / 100;
}

export interface Range {
  startMs: number;
  endMs: number;
}

// ─── Énergie du son ──────────────────────────────────────────────

export const ENERGY_STEP_MS = 10;

/** Niveau du son par tranches de 10 ms, en dB (échantillons de −1 à 1). */
export function energyFrames(samples: Float32Array, sampleRate: number): Float32Array {
  const hop = Math.max(1, Math.round((sampleRate * ENERGY_STEP_MS) / 1000));
  const frames = new Float32Array(Math.floor(samples.length / hop));
  for (let frame = 0; frame < frames.length; frame++) {
    let sum = 0;
    for (let i = frame * hop; i < (frame + 1) * hop; i++) sum += samples[i] * samples[i];
    frames[frame] = 10 * Math.log10(sum / hop + 1e-12);
  }
  return frames;
}

/**
 * Seuil sous lequel une tranche est un blanc : 24 dB sous la voix (95ᵉ
 * centile), mais jamais à moins de 6 dB du bruit de fond (10ᵉ centile) : un
 * souffle de pièce reste un blanc.
 */
export function quietThreshold(frames: Float32Array): number {
  if (frames.length === 0) return -60;
  const sorted = Float32Array.from(frames).sort();
  const at = (ratio: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
  const voice = at(0.95);
  const floor = at(0.1);
  return Math.max(voice - 24, floor + 6);
}

/** Passages calmes d'au moins `minMs`, en ms de la source. */
export function quietRuns(frames: Float32Array, threshold: number, minMs: number): Range[] {
  const runs: Range[] = [];
  let start = -1;
  for (let frame = 0; frame <= frames.length; frame++) {
    const quiet = frame < frames.length && frames[frame] < threshold;
    if (quiet && start < 0) start = frame;
    if (!quiet && start >= 0) {
      if ((frame - start) * ENERGY_STEP_MS >= minMs) runs.push({ startMs: start * ENERGY_STEP_MS, endMs: frame * ENERGY_STEP_MS });
      start = -1;
    }
  }
  return runs;
}

/** Part calme d'un passage (0 à 1). */
export function quietShare(frames: Float32Array, threshold: number, range: Range): number {
  const from = Math.max(0, Math.floor(range.startMs / ENERGY_STEP_MS));
  const to = Math.min(frames.length, Math.ceil(range.endMs / ENERGY_STEP_MS));
  if (to <= from) return 1;
  let quiet = 0;
  for (let frame = from; frame < to; frame++) if (frames[frame] < threshold) quiet++;
  return quiet / (to - from);
}

/** Du premier au dernier instant calme d'un passage ; `null` s'il n'y en a aucun. */
export function quietSpan(frames: Float32Array, threshold: number, range: Range): Range | null {
  const from = Math.max(0, Math.floor(range.startMs / ENERGY_STEP_MS));
  const to = Math.min(frames.length, Math.ceil(range.endMs / ENERGY_STEP_MS));
  let first = -1;
  let last = -1;
  for (let frame = from; frame < to; frame++) {
    if (frames[frame] >= threshold) continue;
    if (first < 0) first = frame;
    last = frame;
  }
  return first < 0 ? null : { startMs: first * ENERGY_STEP_MS, endMs: (last + 1) * ENERGY_STEP_MS };
}

/**
 * Instant où la parole reprend avant `atMs` : la fin du dernier passage
 * calme (100 ms au moins) qui finit entre `atMs − 700` et `atMs + 100`.
 * Whisper fait souvent commencer un mot un peu tard ; le son, lui, ne se
 * trompe pas. `atMs` si aucun calme n'est trouvé.
 */
export function speechOnset(frames: Float32Array, threshold: number, atMs: number): number {
  const runs = quietRuns(frames, threshold, 100).filter((run) => run.endMs >= atMs - 700 && run.endMs <= atMs + 100);
  return runs.length ? Math.min(atMs, runs[runs.length - 1].endMs) : atMs;
}

/** Réunit des passages qui se touchent ou se chevauchent, triés. */
export function mergeRanges(ranges: Range[], gapMs = 0): Range[] {
  const sorted = ranges.filter((range) => range.endMs > range.startMs).sort((a, b) => a.startMs - b.startMs);
  const merged: Range[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.startMs <= last.endMs + gapMs) last.endMs = Math.max(last.endMs, range.endMs);
    else merged.push({ ...range });
  }
  return merged;
}

const SENTENCE_END = /[.!?…]["»”) ]*$/;
const CLAUSE_END = /[,;:]["»”) ]*$/;

/**
 * Blancs à couper : les passages calmes du son, et les trous entre deux mots
 * dont le son est calme pour moitié au moins, réunis. Chacun est réduit de
 * ses marges (plus larges après une fin de phrase) ; il ne reste que ce qui
 * dépasse le seuil du réglage. Avant le premier mot et après le dernier,
 * tout le calme part, marges gardées.
 */
export function silenceCuts(words: TimedWord[], frames: Float32Array, preset: SilencePreset, durationMs: number): Range[] {
  const threshold = quietThreshold(frames);
  const fromAudio = quietRuns(frames, threshold, preset.minPauseMs);
  const fromWords: Range[] = [];
  for (let index = 0; index + 1 < words.length; index++) {
    const gap = { startMs: words[index].endMs, endMs: words[index + 1].startMs };
    if (gap.endMs - gap.startMs < preset.minPauseMs || quietShare(frames, threshold, gap) < 0.5) continue;
    // Seulement la part calme du trou : un mot que Whisper fait commencer trop tard n'est pas rogné.
    const quiet = quietSpan(frames, threshold, gap);
    if (quiet && quiet.endMs - quiet.startMs >= preset.minPauseMs) fromWords.push(quiet);
  }
  const pauses = mergeRanges([...fromAudio, ...fromWords]);
  const cuts: Range[] = [];
  for (const pause of pauses) {
    // Le mot qui précède le blanc dit s'il s'agit d'une fin de phrase.
    const before = [...words].reverse().find((word) => word.startMs < pause.startMs + 1);
    const sentence = before ? SENTENCE_END.test(before.text) : false;
    const padBefore = sentence ? preset.sentencePadMs : CLAUSE_END.test(before?.text ?? "") ? Math.round((preset.padBeforeMs + preset.sentencePadMs) / 2) : preset.padBeforeMs;
    const cut = { startMs: pause.startMs + padBefore, endMs: pause.endMs - preset.padAfterMs };
    if (cut.endMs - cut.startMs >= 40) cuts.push(cut);
  }
  // Calme du début et de la fin de la prise.
  if (words.length) {
    const head = Math.max(0, words[0].startMs - preset.padAfterMs - 60);
    if (head > 40) cuts.push({ startMs: 0, endMs: head });
    const tail = Math.min(durationMs, words[words.length - 1].endMs + preset.sentencePadMs + 160);
    if (durationMs - tail > 40) cuts.push({ startMs: tail, endMs: durationMs });
  }
  return mergeRanges(cuts);
}

// ─── Reprises et faux départs ────────────────────────────────────

/** Clé de comparaison d'un mot : lettres et chiffres, en minuscules, apostrophes réunies. */
export function takeKey(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}]/gu, "");
}

/** Hésitations : des mots qui ne disent rien, dans les langues courantes. */
const FILLERS = new Set(["euh", "heu", "hum", "hmm", "bah", "ben", "um", "uh", "uhm", "erm", "eh", "ehm", "äh", "ähm", "hm"]);

/** Marqueurs explicites d'une reprise, en début de phrase. */
const RESTART_MARKERS = [["je", "recommence"], ["je", "reprends"], ["on", "recommence"], ["on", "reprend"], ["pardon"], ["attends"], ["let", "me", "start", "again"], ["sorry"]];

/** Blanc qui sépare deux phrases quand rien ne les ponctue : une hésitation, pas un simple temps à la virgule. */
export const TAKE_PHRASE_PAUSE_MS = 650;

export interface Phrase {
  /** Indices du premier et du dernier mot (inclus). */
  first: number;
  last: number;
  /** Phrase finie par une ponctuation forte. */
  complete: boolean;
}

/**
 * Phrases d'une prise : une coupure après une ponctuation forte (points de
 * suspension compris) ou un blanc de `pauseMs` (une phrase abandonnée n'a
 * souvent pas de point). Une virgule seule ne coupe pas : « Le résultat,
 * c'est… » reste une phrase, même avec un temps après la virgule.
 */
export function splitPhrases(words: TimedWord[], pauseMs = TAKE_PHRASE_PAUSE_MS): Phrase[] {
  const phrases: Phrase[] = [];
  let first = 0;
  words.forEach((word, index) => {
    const next = words[index + 1];
    const gap = next ? next.startMs - word.endMs : Infinity;
    const strong = SENTENCE_END.test(word.text);
    const ellipsis = /(…|\.\.\.)["»”)]*$/.test(word.text);
    if (!next || strong || gap >= pauseMs) {
      phrases.push({ first, last: index, complete: strong && !ellipsis });
      first = index + 1;
    }
  });
  return phrases;
}

/** Mots-clés d'une phrase, hésitations écartées. */
function phraseKeys(words: TimedWord[], phrase: Phrase): string[] {
  const keys: string[] = [];
  for (let index = phrase.first; index <= phrase.last; index++) {
    const key = takeKey(words[index].text);
    if (key && !FILLERS.has(key)) keys.push(key);
  }
  return keys;
}

/**
 * Le début de `later` reprend-il `earlier` ? Les mots de `earlier` sont
 * cherchés dans le même ordre au début de `later` (un mot de plus ou de
 * moins toléré) : 60 % au moins retrouvés, et les deux premiers identiques.
 */
export function restarts(earlier: string[], later: string[]): boolean {
  if (earlier.length === 0 || later.length === 0) return false;
  if (earlier[0] !== later[0]) return false;
  if (earlier.length === 1) return later.length > 1 && earlier[0].length >= 3;
  if (earlier[1] !== later[1]) return false;
  // Alignement glouton : chaque mot de `earlier` cherché un peu plus loin dans `later`.
  let cursor = 0;
  let matched = 0;
  for (const key of earlier) {
    const window = later.slice(cursor, cursor + 3);
    const found = window.indexOf(key);
    if (found >= 0) {
      matched++;
      cursor += found + 1;
    }
  }
  // La reprise doit aller au moins aussi loin que la tentative : sinon c'est une simple répétition voulue.
  return matched / earlier.length >= 0.6 && later.length >= Math.min(earlier.length, matched + 1);
}

export interface Retake {
  /** Mots coupés, indices inclus. */
  first: number;
  last: number;
  reason: "restart" | "filler" | "marker" | "stutter";
  text: string;
}

const phraseText = (words: TimedWord[], first: number, last: number) =>
  words
    .slice(first, last + 1)
    .map((word) => word.text)
    .join(" ");

/**
 * Reprises à couper : faux départs repris par la phrase suivante (la
 * dernière tentative reste), phrases d'hésitations seules, marqueur de
 * reprise (« je recommence ») avec la phrase abandonnée qui le précède, mot
 * bégayé suivi d'une virgule ou d'un blanc (« je, je pense »).
 */
export function findRetakes(words: TimedWord[], pauseMs = TAKE_PHRASE_PAUSE_MS): Retake[] {
  const phrases = splitPhrases(words, pauseMs);
  const retakes: Retake[] = [];
  const keys = phrases.map((phrase) => phraseKeys(words, phrase));
  const dropped = new Set<number>();
  for (let index = 0; index < phrases.length; index++) {
    const phrase = phrases[index];
    if (keys[index].length === 0) {
      dropped.add(index);
      retakes.push({ first: phrase.first, last: phrase.last, reason: "filler", text: phraseText(words, phrase.first, phrase.last) });
      continue;
    }
    // Phrase suivante qui compte (les hésitations seules ne séparent pas une reprise de sa tentative).
    let next = index + 1;
    while (next < phrases.length && keys[next].length === 0) next++;
    if (next >= phrases.length) continue;
    const marker = RESTART_MARKERS.find((entry) => entry.every((key, offset) => keys[next][offset] === key));
    if (marker && !phrase.complete) {
      dropped.add(index);
      retakes.push({ first: phrase.first, last: phrase.last, reason: "marker", text: phraseText(words, phrase.first, phrase.last) });
      // Le marqueur lui-même part aussi.
      const markerWords = countLeadingWords(words, phrases[next], marker.length);
      if (markerWords > 0) {
        retakes.push({ first: phrases[next].first, last: phrases[next].first + markerWords - 1, reason: "marker", text: phraseText(words, phrases[next].first, phrases[next].first + markerWords - 1) });
      }
      continue;
    }
    // Une phrase complète et plus longue que sa reprise n'est pas un faux départ.
    if (phrase.complete && keys[index].length > keys[next].length) continue;
    if (restarts(keys[index], keys[next])) {
      dropped.add(index);
      retakes.push({ first: phrase.first, last: phrase.last, reason: "restart", text: phraseText(words, phrase.first, phrase.last) });
    }
  }
  // Bégaiement : le même mot court deux fois de suite, le premier suivi d'une virgule ou d'un blanc.
  phrases.forEach((phrase, index) => {
    if (dropped.has(index)) return;
    for (let at = phrase.first; at < phrase.last; at++) {
      const key = takeKey(words[at].text);
      if (!key || key.length > 6 || key !== takeKey(words[at + 1].text)) continue;
      const pause = words[at + 1].startMs - words[at].endMs;
      if (/[,…]$|\.\.\.$/.test(words[at].text) || pause >= 250) retakes.push({ first: at, last: at, reason: "stutter", text: words[at].text });
    }
  });
  return retakes.sort((a, b) => a.first - b.first);
}

/** Nombre de mots du texte qui portent les `count` premières clés d'une phrase. */
function countLeadingWords(words: TimedWord[], phrase: Phrase, count: number): number {
  let seen = 0;
  for (let index = phrase.first; index <= phrase.last; index++) {
    const key = takeKey(words[index].text);
    if (key && !FILLERS.has(key)) seen++;
    if (seen >= count) return index - phrase.first + 1;
  }
  return 0;
}

/**
 * Passages de la source à couper pour des reprises : du début du premier mot
 * coupé jusqu'au début du premier mot gardé qui suit (marge avant la parole
 * gardée). Le blanc entre la tentative et la reprise part avec elle.
 */
export function retakeCuts(words: TimedWord[], retakes: Retake[], preset: SilencePreset, frames?: Float32Array): Range[] {
  const cuts: Range[] = [];
  const threshold = frames ? quietThreshold(frames) : 0;
  for (const retake of retakes) {
    const previous = words[retake.first - 1];
    const next = words[retake.last + 1];
    const startMs = Math.max(previous ? previous.endMs + preset.padBeforeMs : 0, words[retake.first].startMs - 40);
    // La parole gardée reprend là où le son le dit, pas seulement où Whisper l'a placée.
    const resume = next ? (frames ? speechOnset(frames, threshold, next.startMs) : next.startMs) : 0;
    const endMs = next ? Math.max(startMs, resume - preset.padAfterMs) : words[retake.last].endMs + preset.sentencePadMs;
    if (endMs - startMs > 40) cuts.push({ startMs, endMs });
  }
  return mergeRanges(cuts);
}

// ─── Montage ─────────────────────────────────────────────────────

/** Un passage gardé : la source, ses bornes, et où il commence dans le montage, en images du projet. */
export interface KeptSegment {
  /** Rang de la prise (plusieurs enregistrements se suivent). */
  take: number;
  /** Bornes dans la source, en images du projet comptées en temps de la source. */
  sourceStart: number;
  sourceEnd: number;
  /** Image du montage où il commence. */
  start: number;
  /** Durée dans le montage, en images (vitesse appliquée). */
  duration: number;
}

/**
 * Passages gardés d'une prise : son étendue moins les coupes, calés sur les
 * images du projet. Un passage de moins de `minKeepMs` (un reste entre deux
 * coupes) est abandonné : il ne porterait qu'un souffle.
 */
export function keptRanges(durationMs: number, cuts: Range[], minKeepMs = 120): Range[] {
  const merged = mergeRanges(cuts);
  const kept: Range[] = [];
  let cursor = 0;
  for (const cut of merged) {
    if (cut.startMs > cursor) kept.push({ startMs: cursor, endMs: Math.min(cut.startMs, durationMs) });
    cursor = Math.max(cursor, cut.endMs);
  }
  if (cursor < durationMs) kept.push({ startMs: cursor, endMs: durationMs });
  return kept.filter((range) => range.endMs - range.startMs >= minKeepMs);
}

/**
 * Liste des décisions de montage : les passages de chaque prise, à la suite,
 * en images. Un passage est arrondi à l'image (début vers le bas, fin vers
 * le haut) ; sa durée dans le montage est celle de la source divisée par la
 * vitesse, arrondie : c'est elle qui place le suivant, sans dérive.
 */
export function editDecisionList(takes: Range[][], fps: number, speed: number): KeptSegment[] {
  const segments: KeptSegment[] = [];
  let at = 0;
  takes.forEach((ranges, take) => {
    for (const range of ranges) {
      const sourceStart = Math.floor((range.startMs / 1000) * fps);
      const sourceEnd = Math.max(sourceStart + 1, Math.ceil((range.endMs / 1000) * fps));
      const duration = Math.max(1, Math.round((sourceEnd - sourceStart) / speed));
      segments.push({ take, sourceStart, sourceEnd, start: at, duration });
      at += duration;
    }
  });
  return segments;
}

/** Instant du montage (ms) d'un instant de la source (ms) d'une prise, ou `null` s'il a été coupé. */
export function mapSourceTime(segments: KeptSegment[], take: number, sourceMs: number, fps: number, speed: number): number | null {
  const frame = (sourceMs / 1000) * fps;
  for (const segment of segments) {
    if (segment.take !== take || frame < segment.sourceStart || frame > segment.sourceEnd) continue;
    const local = (frame - segment.sourceStart) / speed;
    return ((segment.start + Math.min(local, segment.duration)) / fps) * 1000;
  }
  return null;
}

/**
 * Mots du montage, en ms du montage : chaque mot gardé (son milieu dans un
 * passage gardé) est recalé ; un mot coupé par une reprise disparaît ; un
 * mot avalé par une coupe de blanc (Whisper l'a placé dans le calme) se
 * fond dans son voisin. Aucun mot ne chevauche le suivant.
 */
export function rebaseWords(words: TimedWord[], take: number, segments: KeptSegment[], fps: number, speed: number, dropped: Set<number> = new Set()): TimedWord[] {
  const out: TimedWord[] = [];
  let carry = "";
  words.forEach((word, index) => {
    if (dropped.has(index)) return;
    const middle = (word.startMs + word.endMs) / 2;
    const mid = mapSourceTime(segments, take, middle, fps, speed);
    if (mid === null) {
      const last = out[out.length - 1];
      if (last && !SENTENCE_END.test(last.text)) last.text = `${last.text} ${word.text}`;
      else carry = `${carry}${word.text} `;
      return;
    }
    const start = mapSourceTime(segments, take, word.startMs, fps, speed) ?? mid - (middle - word.startMs) / speed;
    const end = mapSourceTime(segments, take, word.endMs, fps, speed) ?? mid + (word.endMs - middle) / speed;
    out.push({ text: `${carry}${word.text}`, startMs: Math.round(Math.min(start, mid)), endMs: Math.round(Math.max(end, mid)) });
    carry = "";
  });
  for (let index = 1; index < out.length; index++) {
    const previous = out[index - 1];
    const word = out[index];
    if (word.startMs < previous.startMs + 20) word.startMs = previous.startMs + 20;
    if (previous.endMs > word.startMs) previous.endMs = word.startMs;
    if (word.endMs < word.startMs + 20) word.endMs = word.startMs + 20;
  }
  return out;
}

export interface TakeCutResult {
  kept: Range[];
  silenceCuts: Range[];
  retakes: Retake[];
  /** Blancs coupés, en ms de la source (respirations comprises). */
  silenceMs: number;
  /** Durée de la source couverte par les reprises coupées, en ms. */
  retakeMs: number;
}

/** Coupe d'une prise : blancs, puis reprises (si demandé). Les deux listes de coupes sont réunies. */
export function cutTake(input: { words: TimedWord[]; frames: Float32Array; durationMs: number; mode: SilenceMode; removeRetakes: boolean }): TakeCutResult {
  const preset = SILENCE_PRESETS[input.mode];
  const silences = silenceCuts(input.words, input.frames, preset, input.durationMs);
  const retakes = input.removeRetakes ? findRetakes(input.words) : [];
  const retakeRanges = retakeCuts(input.words, retakes, preset, input.frames);
  const kept = keptRanges(input.durationMs, [...silences, ...retakeRanges]);
  const total = (ranges: Range[]) => mergeRanges(ranges).reduce((sum, range) => sum + Math.max(0, Math.min(range.endMs, input.durationMs) - Math.max(0, range.startMs)), 0);
  const retakeMs = total(retakeRanges);
  const allCut = total([...silences, ...retakeRanges]);
  return { kept, silenceCuts: silences, retakes, silenceMs: Math.max(0, allCut - retakeMs), retakeMs };
}

/** Indices des mots coupés par des reprises. */
export function droppedWords(retakes: Retake[]): Set<number> {
  const dropped = new Set<number>();
  for (const retake of retakes) for (let index = retake.first; index <= retake.last; index++) dropped.add(index);
  return dropped;
}
