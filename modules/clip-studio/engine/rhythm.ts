/**
 * Rythme du montage (dossier 07 sexies, D3).
 *
 * Dans un short qui se regarde jusqu'au bout, l'image change toutes les 1 à
 * 2,5 s : une coupe, un recadrage, un élément qui arrive. Ce module découpe
 * le fond de chaque segment en plans courts (le même visuel, cadré
 * autrement, avec un mouvement de caméra existant), comble les moments
 * encore immobiles d'un zoom bref sur le temps fort, et pose des bruitages
 * sur deux ou trois temps forts seulement : l'accroche, la révélation, la
 * fin.
 *
 * Tout ce qui est posé est ordinaire (plans, effets de plan, sons sur une
 * piste « Bruitages ») : l'éditeur le retouche comme le reste. Tout est pur.
 */

import { uid } from "./edit";
import { sfxItem, isSfxSource, type SfxId } from "./sfx";
import { projectDuration } from "./timeline";
import type { ClipItem, ClipProject, ImageItem, SegmentCue, Track, VisualItem } from "./types";

/** Rythme du montage réglé par une marque : « calm » n'ajoute rien, « lively » change le plus souvent. */
export const EDIT_PACES = ["calm", "normal", "lively"] as const;
export type EditPace = (typeof EDIT_PACES)[number];

export const EDIT_PACE_LABELS: Record<EditPace, string> = { calm: "Calme", normal: "Normal", lively: "Vif" };

/** Rythme lu avec rigueur ; hors de la liste, `undefined`. */
export function readPace(value: unknown): EditPace | undefined {
  return typeof value === "string" && (EDIT_PACES as readonly string[]).includes(value) ? (value as EditPace) : undefined;
}

/** Durée visée d'un plan, en secondes : sous la limite de 2,5 s, avec de la marge. */
export const PACE_SHOT_SECONDS: Record<Exclude<EditPace, "calm">, number> = { normal: 2.2, lively: 1.4 };

/** Un plan ne reste jamais plus longtemps sans changement (critère de D3). */
export const MAX_STILL_SECONDS = 2.5;

/** Mouvements de caméra des plans d'un même segment, dans l'ordre : chaque coupe recadre. */
const SHOT_MOTIONS = ["zoom-in", "pan-right", "zoom-out", "pan-left"] as const;

/** Zoom bref qui marque un temps fort, ou comble un moment immobile (`motion/scenes.ts`). */
export const STILL_EFFECT = "beat-zoom";

const shotFrames = (project: ClipProject, pace: Exclude<EditPace, "calm">) => Math.round(PACE_SHOT_SECONDS[pace] * project.fps);

const isMainTrack = (track: Track) => track.kind === "visual" && track.origin !== "brand" && /^Principale( \d+)?$/.test(track.name);

/**
 * Découpe le fond image de chaque segment en plans de 1 à 2,2 s (1,4 s en
 * rythme vif) : le même visuel, chaque plan avec un autre mouvement de
 * caméra (zoom avant, panoramique, zoom arrière…), qui part d'un autre
 * cadrage. La coupe est franche ; le premier plan garde l'entrée du fond.
 * Seuls les fonds de modèle (`cue`) sont découpés.
 */
export function cutShots(project: ClipProject, pace: EditPace): ClipProject {
  if (pace === "calm") return project;
  const target = shotFrames(project, pace);
  const tracks = project.tracks.map((track) => {
    if (!isMainTrack(track)) return track;
    let changed = false;
    const items = track.items.flatMap((item): ClipItem[] => {
      if (item.type !== "image" || !item.cue || item.duration <= target) return [item];
      const count = Math.ceil(item.duration / target);
      const base = Math.floor(item.duration / count);
      const extra = item.duration - base * count;
      const first = Math.max(0, SHOT_MOTIONS.indexOf(item.motion as (typeof SHOT_MOTIONS)[number]));
      changed = true;
      let start = item.start;
      return Array.from({ length: count }, (_, index) => {
        const duration = base + (index < extra ? 1 : 0);
        const shot: ImageItem = {
          ...item,
          id: index === 0 ? item.id : uid("i-"),
          start,
          duration,
          motion: SHOT_MOTIONS[(first + index) % SHOT_MOTIONS.length],
          cue: { ...item.cue! },
          label: `Plan ${index + 1}/${count}`,
          animIn: index === 0 ? item.animIn : { kind: "none", frames: 1 },
          animOut: index === count - 1 ? item.animOut : { kind: "none", frames: 1 },
        };
        if (index > 0) delete shot.transition;
        start += duration;
        return shot;
      });
    });
    return changed ? { ...track, items } : track;
  });
  return { ...project, tracks };
}

// ─── Changements et temps forts ──────────────────────────────────

const transparent = (color: string) => /^rgba\([^)]*,\s*0(\.0+)?\)$/.test(color.replace(/\s/g, "")) || color === "transparent";

/**
 * Instants où l'image change : un plan qui commence (coupe), un élément qui
 * apparaît, un effet de plan. Les sous-titres mot à mot n'en sont pas : ils
 * changent sans cesse, sans que le plan change.
 */
export function changeFrames(project: ClipProject): number[] {
  const frames = new Set<number>();
  for (const track of project.tracks) {
    if (track.kind !== "visual" || track.hidden) continue;
    for (const item of track.items as VisualItem[]) {
      if (item.type === "text" && item.karaoke) continue;
      if (item.transform.opacity <= 0.02) continue;
      if (item.type === "shape" && transparent(item.fill)) continue;
      frames.add(item.start);
    }
    for (const effect of track.effects ?? []) frames.add(Math.round(effect.at));
  }
  return [...frames].sort((a, b) => a - b);
}

/** Plus long moment sans changement, en images, et où il commence. */
export function longestStill(project: ClipProject): { frames: number; at: number } {
  const end = projectDuration(project);
  const changes = changeFrames(project).filter((frame) => frame < end);
  let best = { frames: 0, at: 0 };
  const points = [...(changes[0] === 0 ? [] : [0]), ...changes, end];
  for (let index = 1; index < points.length; index++) {
    const gap = points[index] - points[index - 1];
    if (gap > best.frames) best = { frames: gap, at: points[index - 1] };
  }
  return best;
}

/** Segment d'un modèle : ses plans de fond, réunis par leur rang. */
interface Segment {
  index: number;
  start: number;
  end: number;
  cue: SegmentCue;
}

export function segmentsOf(project: ClipProject): Segment[] {
  const byIndex = new Map<number, Segment>();
  for (const track of project.tracks) {
    if (!isMainTrack(track)) continue;
    for (const item of track.items) {
      if (!item.cue) continue;
      const known = byIndex.get(item.cue.index);
      if (known) {
        known.start = Math.min(known.start, item.start);
        known.end = Math.max(known.end, item.start + item.duration);
      } else byIndex.set(item.cue.index, { index: item.cue.index, start: item.start, end: item.start + item.duration, cue: item.cue });
    }
  }
  return [...byIndex.values()].sort((a, b) => a.start - b.start);
}

/** Temps forts du clip : accroche, révélation, fin (le carton de fin de la marque, sinon la conclusion). */
export function beatsOf(project: ClipProject): { kind: NonNullable<SegmentCue["beat"]>; at: number }[] {
  const beats: { kind: NonNullable<SegmentCue["beat"]>; at: number }[] = [];
  for (const segment of segmentsOf(project)) {
    if (segment.cue.beat === "hook") beats.push({ kind: "hook", at: segment.start });
    if (segment.cue.beat === "reveal") beats.push({ kind: "reveal", at: segment.start + (segment.cue.beatOffset ?? 0) });
    if (segment.cue.beat === "end") beats.push({ kind: "end", at: segment.start });
  }
  const card = project.tracks.filter((track) => track.origin === "brand" && /^Fin\b/.test(track.name)).flatMap((track) => track.items);
  if (card.length) {
    const start = Math.min(...card.map((item) => item.start));
    const end = beats.findIndex((beat) => beat.kind === "end");
    if (end >= 0) beats.splice(end, 1);
    beats.push({ kind: "end", at: start });
  }
  return beats.sort((a, b) => a.at - b.at);
}

/** Bruitage de chaque temps fort : l'impact pour l'accroche, la révélation, le souffle de la fin. */
const BEAT_SOUNDS: Record<NonNullable<SegmentCue["beat"]>, SfxId> = { hook: "impact", reveal: "reveal", end: "whoosh" };
const BEAT_LABELS: Record<NonNullable<SegmentCue["beat"]>, string> = { hook: "Bruitage – accroche", reveal: "Bruitage – révélation", end: "Bruitage – fin" };

/** Bruitages au plus par clip : seulement les temps forts, jamais un son par élément. */
export const MAX_BEAT_SOUNDS = 3;

/**
 * Temps forts : le carton de fin, s'il dure plus que 2,5 s, montre son appel
 * un peu après le reste ; puis un bruitage sur l'accroche, la révélation et
 * la fin (trois au plus), sur une piste « Bruitages », sous la voix.
 */
export function addBeats(project: ClipProject, pace: EditPace): ClipProject {
  if (pace === "calm") return project;
  const fps = project.fps;
  let tracks = staggerEndCard(project.tracks, fps);
  const sounds: ClipItem[] = [];
  let last = -Infinity;
  for (const beat of beatsOf({ ...project, tracks })) {
    if (sounds.length >= MAX_BEAT_SOUNDS || beat.at - last < fps) continue;
    sounds.push(sfxItem(BEAT_SOUNDS[beat.kind], beat.at, fps, BEAT_LABELS[beat.kind]));
    last = beat.at;
  }
  if (sounds.length === 0) return { ...project, tracks };
  // Les bruitages vont au-dessus de la musique, sous les voix.
  const track: Track = { id: uid("t-"), kind: "audio", name: "Bruitages", items: sounds };
  const music = tracks.findIndex((entry) => entry.kind === "audio" && /^Musique/.test(entry.name));
  tracks = music >= 0 ? [...tracks.slice(0, music), track, ...tracks.slice(music)] : [...tracks, track];
  return { ...project, tracks };
}

/** Appel à l'action du carton de fin montré un peu après le reste, quand le carton dure plus de 2,5 s. */
function staggerEndCard(tracks: Track[], fps: number): Track[] {
  const card = tracks.filter((track) => track.origin === "brand" && /^Fin\b/.test(track.name));
  const items = card.flatMap((track) => track.items);
  if (items.length < 2) return tracks;
  const start = Math.min(...items.map((item) => item.start));
  const length = Math.max(...items.map((item) => item.start + item.duration)) - start;
  if (length <= MAX_STILL_SECONDS * fps) return tracks;
  const name = ["Fin – appel", "Fin – accroche", "Fin – mascotte"].find((entry) => card.some((track) => track.name === entry));
  if (!name) return tracks;
  const delay = Math.round(Math.min(1.2 * fps, length / 2));
  return tracks.map((track) =>
    track.name === name && track.origin === "brand"
      ? { ...track, items: track.items.map((item) => (item.start === start ? { ...item, start: start + delay, duration: item.duration - delay } : item)) }
      : track
  );
}

/**
 * Comble les moments encore immobiles (un aplat sans image, un carton) :
 * un zoom bref sur le texte ou l'image principale de l'instant, assez
 * souvent pour qu'aucun plan ne dépasse la durée visée.
 */
export function fillStills(project: ClipProject, pace: EditPace): ClipProject {
  if (pace === "calm") return project;
  const limit = shotFrames(project, pace);
  const end = projectDuration(project);
  const changes = changeFrames(project).filter((frame) => frame < end);
  const points = [...(changes[0] === 0 ? [] : [0]), ...changes, end];
  const additions: number[] = [];
  for (let index = 1; index < points.length; index++) {
    const gap = points[index] - points[index - 1];
    if (gap <= limit) continue;
    const parts = Math.ceil(gap / limit);
    for (let part = 1; part < parts; part++) additions.push(points[index - 1] + Math.round((gap * part) / parts));
  }
  if (additions.length === 0) return project;
  const frames = Math.max(1, Math.round(0.3 * project.fps));
  const tracks = project.tracks.map((track) => ({ ...track }));
  for (const at of additions) {
    const index = stillTarget(tracks, at);
    if (index < 0) continue;
    tracks[index] = { ...tracks[index], effects: [...(tracks[index].effects ?? []), { kind: STILL_EFFECT, at, frames }] };
  }
  return { ...project, tracks };
}

/** Piste qui reçoit le zoom : celle du texte de l'instant, sinon d'une image posée, sinon du fond. */
function stillTarget(tracks: Track[], frame: number): number {
  let best = -1;
  let bestScore = -1;
  tracks.forEach((track, index) => {
    if (track.kind !== "visual" || track.hidden) return;
    for (const item of track.items as VisualItem[]) {
      if (frame < item.start || frame >= item.start + item.duration) continue;
      if (item.type === "text" && item.karaoke) continue;
      const full = item.transform.width >= 0.95 && item.transform.height >= 0.95;
      const score = item.type === "text" ? 3 : !full ? 2 : item.type === "image" ? 1 : 0;
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    }
  });
  return best;
}

/** Bruitages d'un projet (sons de la banque). */
export function beatSounds(project: ClipProject): ClipItem[] {
  return project.tracks.flatMap((track) => track.items).filter((item) => item.type === "audio" && isSfxSource(item.source));
}
