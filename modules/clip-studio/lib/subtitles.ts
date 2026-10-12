/**
 * Sous-titres d'un clip au format SubRip (`.srt`), rendus à côté de la vidéo
 * (dossier 01 ter, § 3.1). Fonction pure : l'écran Exporter la calcule, le
 * serveur contrôle ce qu'il reçoit.
 *
 * Source : les sous-titres animés du projet (éléments de texte qui suivent
 * une voix mot à mot) ; à défaut, les mots des voix off. Les mots sont
 * regroupés en lignes courtes, coupées à la ponctuation, comme on lit un
 * sous-titre.
 */

import type { AudioItem, ClipProject, TextItem, TimedWord } from "../engine/types";

export interface SrtCue {
  startMs: number;
  endMs: number;
  text: string;
}

export interface SrtOptions {
  /** Plage exportée, en millisecondes du projet : les instants repartent de son début. */
  range?: { fromMs: number; toMs: number };
  /** Caractères par ligne au plus (42 par défaut, l'usage des plateformes). */
  maxChars?: number;
  /** Mots par ligne au plus. */
  maxWords?: number;
}

/** Un silence plus long ouvre une nouvelle ligne. */
const PAUSE_MS = 700;
/** Une ligne reste affichée au moins ce temps, si la suivante le permet. */
const MIN_CUE_MS = 700;

interface PlacedWord {
  text: string;
  startMs: number;
  endMs: number;
}

/** Mots d'une voix ramenés au temps du projet, limités à la fenêtre où l'élément joue. */
function placeWords(words: TimedWord[], itemStartMs: number, offsetMs: number, windowEndMs: number): PlacedWord[] {
  const placed: PlacedWord[] = [];
  for (const word of words) {
    const text = String(word.text ?? "").replace(/\s+/g, " ").trim();
    if (!text || !Number.isFinite(word.startMs) || !Number.isFinite(word.endMs)) continue;
    const startMs = itemStartMs + word.startMs - offsetMs;
    const endMs = Math.min(itemStartMs + word.endMs - offsetMs, windowEndMs);
    if (startMs < itemStartMs || startMs >= windowEndMs) continue;
    placed.push({ text, startMs, endMs: Math.max(startMs, endMs) });
  }
  return placed;
}

/** Mots du projet, dans l'ordre : sous-titres animés d'abord, sinon voix off. */
export function projectWords(project: Pick<ClipProject, "tracks" | "fps">): PlacedWord[] {
  const fps = project.fps > 0 ? project.fps : 30;
  const toMs = (frames: number) => (frames / fps) * 1000;
  const items = project.tracks.flatMap((track) => track.items);
  const karaoke = items.filter((item): item is TextItem => item.type === "text" && Boolean(item.karaoke?.words?.length));
  let words: PlacedWord[];
  if (karaoke.length > 0) {
    words = karaoke.flatMap((item) => placeWords(item.karaoke!.words, toMs(item.start), toMs(item.karaoke!.offset), toMs(item.start + item.duration)));
  } else {
    const voices = items.filter((item): item is AudioItem => item.type === "audio" && Boolean(item.source.words?.length));
    words = voices.flatMap((item) => placeWords(item.source.words!, toMs(item.start), toMs(item.trimStart), toMs(item.start + item.duration)));
  }
  return words.sort((a, b) => a.startMs - b.startMs);
}

/** Regroupe des mots en lignes de sous-titre. */
export function groupCues(words: PlacedWord[], options: SrtOptions = {}): SrtCue[] {
  const maxChars = options.maxChars ?? 42;
  const maxWords = options.maxWords ?? 8;
  const cues: SrtCue[] = [];
  let current: PlacedWord[] = [];
  const flush = () => {
    if (current.length === 0) return;
    cues.push({ startMs: current[0].startMs, endMs: current[current.length - 1].endMs, text: current.map((word) => word.text).join(" ") });
    current = [];
  };
  for (const word of words) {
    const previous = current[current.length - 1];
    const length = current.reduce((sum, entry) => sum + Array.from(entry.text).length + 1, 0) + Array.from(word.text).length;
    if (previous && (length > maxChars || current.length >= maxWords || word.startMs - previous.endMs > PAUSE_MS)) flush();
    current.push(word);
    if (/[.!?…]$/.test(word.text)) flush();
  }
  flush();
  // Durées lisibles, sans chevauchement : une ligne s'efface au plus tard quand la suivante arrive.
  for (let index = 0; index < cues.length; index++) {
    const cue = cues[index];
    const next = cues[index + 1];
    const wanted = Math.max(cue.endMs, cue.startMs + MIN_CUE_MS);
    cue.endMs = next ? Math.min(wanted, next.startMs) : wanted;
  }
  return cues;
}

/** « 00:01:02,345 » : heures, minutes, secondes, virgule, millisecondes. */
export function srtTimestamp(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

/** Fichier SubRip : numéro, plage, texte, ligne blanche. Vide sans aucun mot. */
export function cuesToSrt(cues: SrtCue[]): string {
  return cues.map((cue, index) => `${index + 1}\n${srtTimestamp(cue.startMs)} --> ${srtTimestamp(cue.endMs)}\n${cue.text}\n`).join("\n");
}

/** Sous-titres d'un projet au format SubRip ; chaîne vide quand le projet n'a ni sous-titres ni voix minutée. */
export function projectToSrt(project: Pick<ClipProject, "tracks" | "fps">, options: SrtOptions = {}): string {
  let cues = groupCues(projectWords(project), options);
  if (options.range) {
    const { fromMs, toMs } = options.range;
    cues = cues
      .filter((cue) => cue.endMs > fromMs && cue.startMs < toMs)
      .map((cue) => ({ ...cue, startMs: Math.max(cue.startMs, fromMs) - fromMs, endMs: Math.min(cue.endMs, toMs) - fromMs }));
  }
  return cuesToSrt(cues);
}

const TIMING = /^(\d{2,}):([0-5]\d):([0-5]\d),(\d{3}) --> (\d{2,}):([0-5]\d):([0-5]\d),(\d{3})$/;

/**
 * Contrôle d'un fichier SubRip reçu du navigateur : blocs numérotés, plages
 * valides, texte sans balise. Rend le texte normalisé (fins de ligne `\n`),
 * ou lève une erreur.
 */
export function validateSrt(input: unknown, maxBytes = 512 * 1024): string {
  if (typeof input !== "string") throw new Error("Sous-titres invalides.");
  if (new TextEncoder().encode(input).length > maxBytes) throw new Error("Sous-titres trop lourds.");
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!text) throw new Error("Sous-titres vides.");
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(text)) throw new Error("Sous-titres invalides : caractères de contrôle.");
  const blocks = text.split(/\n{2,}/);
  if (blocks.length > 10_000) throw new Error("Sous-titres trop longs.");
  for (const block of blocks) {
    const [number, timing, ...lines] = block.split("\n");
    if (!/^\d+$/.test(number ?? "") || !TIMING.test(timing ?? "") || lines.length === 0) throw new Error("Sous-titres invalides : bloc mal formé.");
    if (lines.some((line) => /<\s*\/?\s*(script|style|iframe)/i.test(line))) throw new Error("Sous-titres invalides : balise refusée.");
  }
  return `${text}\n`;
}
