/**
 * Mixage : la musique s'efface sous la voix off (dossier 07 sexies, D3).
 *
 * Une musique marquée `duck` descend à `volume × duck` pendant que parle une
 * voix off (un son de synthèse, ou tout son d'une piste « Voix »), puis
 * remonte. Les mêmes points servent à l'aperçu et à l'export. Un son sans
 * `duck` garde exactement son enveloppe d'avant.
 */

import { hasAudio, type AudioItem, type ClipProject, type VideoItem } from "./types";

/** Descente avant la voix et remontée après elle, en secondes. */
export const DUCK_ATTACK = 0.12;
export const DUCK_RELEASE = 0.3;
/** Deux répliques séparées de moins que ça : la musique reste basse entre les deux. */
const DUCK_MERGE = 0.6;

/** Est-ce une voix off ? Un son de synthèse (mots horodatés), ou un son posé sur une piste « Voix ». */
function isVoice(item: AudioItem | VideoItem, trackName: string): boolean {
  if (item.type !== "audio" || item.duck !== undefined) return false;
  return Boolean(item.source.words?.length || item.source.speech) || /^Voix\b/.test(trackName);
}

/** Moments où une voix parle, en secondes sur la timeline, fusionnés. */
export function voiceWindows(project: ClipProject): [number, number][] {
  const raw: [number, number][] = [];
  for (const track of project.tracks) {
    if (track.muted || track.kind !== "audio") continue;
    for (const item of track.items) {
      if (!hasAudio(item) || item.volume <= 0 || !isVoice(item, track.name)) continue;
      raw.push([item.start / project.fps, (item.start + item.duration) / project.fps]);
    }
  }
  raw.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const window of raw) {
    const last = merged[merged.length - 1];
    if (last && window[0] - last[1] < DUCK_MERGE) last[1] = Math.max(last[1], window[1]);
    else merged.push([...window]);
  }
  return merged;
}

/**
 * Enveloppe d'un son, en points (instant depuis le début du son, en
 * secondes ; gain), à relier par des rampes linéaires : fondus d'entrée et de
 * sortie, puis creux sous chaque fenêtre de voix (`windows`, en secondes sur
 * la timeline).
 */
export function gainPoints(item: AudioItem, fps: number, windows: [number, number][]): [number, number][] {
  const volume = item.volume;
  const duration = item.duration / fps;
  const fadeIn = item.fadeIn / fps;
  const fadeOut = item.fadeOut / fps;
  const duck = Math.max(0, Math.min(1, item.duck ?? 1));
  const start = item.start / fps;
  // Gain de base (fondus) à un instant du son.
  const base = (t: number) => {
    let gain = volume;
    if (fadeIn > 0 && t < fadeIn) gain *= Math.max(0, t / fadeIn);
    if (fadeOut > 0 && t > duration - fadeOut) gain *= Math.max(0, (duration - t) / fadeOut);
    return gain;
  };
  // Creux de voix à un instant du son : 1 hors voix, `duck` pendant, rampes autour.
  const local = windows.map(([from, to]) => [from - start, to - start] as [number, number]).filter(([from, to]) => to > -DUCK_RELEASE && from < duration + DUCK_ATTACK);
  const dip = (t: number) => {
    let factor = 1;
    for (const [from, to] of local) {
      let value = 1;
      if (t >= from && t <= to) value = duck;
      else if (t < from && t > from - DUCK_ATTACK) value = 1 - (1 - duck) * ((t - (from - DUCK_ATTACK)) / DUCK_ATTACK);
      else if (t > to && t < to + DUCK_RELEASE) value = duck + (1 - duck) * ((t - to) / DUCK_RELEASE);
      factor = Math.min(factor, value);
    }
    return factor;
  };
  const times = new Set<number>([0, duration]);
  if (fadeIn > 0) times.add(Math.min(duration, fadeIn));
  if (fadeOut > 0) times.add(Math.max(0, duration - fadeOut));
  if (duck < 1) {
    for (const [from, to] of local) for (const t of [from - DUCK_ATTACK, from, to, to + DUCK_RELEASE]) if (t > 0 && t < duration) times.add(t);
  }
  return [...times].sort((a, b) => a - b).map((t) => [t, base(t) * (duck < 1 ? dip(t) : 1)]);
}

/** Le son a-t-il une enveloppe propre (creux sous la voix) ? Sinon, l'enveloppe d'avant s'applique telle quelle. */
export function ducks(item: AudioItem | VideoItem): item is AudioItem {
  return item.type === "audio" && item.duck !== undefined && item.duck < 1;
}

/** Programme les points sur un paramètre de gain ; `itemStartTime` comme dans `applyGainEnvelope`. */
export function applyGainPoints(param: AudioParam, points: [number, number][], itemStartTime: number) {
  // Lecture prise en cours de son : on part de la valeur à l'instant 0 de l'horloge.
  let first = true;
  for (const [t, gain] of points) {
    const at = itemStartTime + t;
    if (at < 0) continue;
    if (first) {
      // Point manqué avant le début de la lecture : la valeur interpolée à l'instant de reprise.
      const previous = points.filter(([time]) => itemStartTime + time < 0).pop();
      if (previous && at > 0) {
        const span = t - previous[0];
        const ratio = span > 0 ? (-itemStartTime - previous[0]) / span : 1;
        param.setValueAtTime(previous[1] + (gain - previous[1]) * ratio, 0);
        param.linearRampToValueAtTime(gain, at);
      } else {
        param.setValueAtTime(gain, Math.max(0, at));
      }
      first = false;
      continue;
    }
    param.linearRampToValueAtTime(gain, at);
  }
}
