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
import { fittedPan, measuredBeatCount, measuredShotCount, MEASURED_BEAT_GAP_SECONDS, type MeasuredPlan } from "./measured-style";
import { sfxItem, isSfxSource, type SfxId } from "./sfx";
import { cameraAt, projectDuration } from "./timeline";
import type { ClipItem, ClipProject, ImageItem, SegmentCue, Track, VisualItem } from "./types";

/**
 * Rythme du montage réglé par une marque : « calm » n'ajoute rien, « lively »
 * change le plus souvent, « measured » reprend le style relevé sur une vidéo
 * de référence (D4, `measured-style.ts`) et vaut « normal » sans style.
 */
export const EDIT_PACES = ["calm", "normal", "lively", "measured"] as const;
export type EditPace = (typeof EDIT_PACES)[number];

export const EDIT_PACE_LABELS: Record<EditPace, string> = { calm: "Calme", normal: "Normal", lively: "Vif", measured: "D’après la vidéo de référence" };

/** Rythme lu avec rigueur ; hors de la liste, `undefined`. */
export function readPace(value: unknown): EditPace | undefined {
  return typeof value === "string" && (EDIT_PACES as readonly string[]).includes(value) ? (value as EditPace) : undefined;
}

/**
 * Durée visée d'un plan, en secondes : sous la limite de 2,5 s, avec de la
 * marge. « measured » sans style mesuré applicable : celle du rythme normal.
 */
export const PACE_SHOT_SECONDS: Record<Exclude<EditPace, "calm">, number> = { normal: 2.2, lively: 1.4, measured: 2.2 };

/** Un plan ne reste jamais plus longtemps sans changement (critère de D3). */
export const MAX_STILL_SECONDS = 2.5;

/** Mouvements de caméra des plans d'un même segment, dans l'ordre : chaque coupe recadre. */
const SHOT_MOTIONS = ["zoom-in", "pan-right", "zoom-out", "pan-left"] as const;

/** Zoom bref qui marque un temps fort, ou comble un moment immobile (`motion/scenes.ts`). */
export const STILL_EFFECT = "beat-zoom";

const shotFrames = (project: ClipProject, pace: Exclude<EditPace, "calm">, plan?: MeasuredPlan | null) =>
  Math.round((plan?.shots ? plan.shots.upper : PACE_SHOT_SECONDS[pace]) * project.fps);

const isMainTrack = (track: Track) => track.kind === "visual" && track.origin !== "brand" && /^Principale( \d+)?$/.test(track.name);

/**
 * Découpe le fond image de chaque segment en plans de 1 à 2,2 s (1,4 s en
 * rythme vif) : le même visuel, chaque plan avec un autre mouvement de
 * caméra (zoom avant, panoramique, zoom arrière…), qui part d'un autre
 * cadrage. La coupe est franche ; le premier plan garde l'entrée du fond.
 * Seuls les fonds de modèle (`cue`) sont découpés.
 *
 * Avec un style mesuré (`plan`, D4) : autant de plans qu'il faut pour rester
 * au plus près de la durée visée sans jamais dépasser la durée au plus, et
 * seulement la part mesurée de plans animés (les autres restent fixes), avec
 * les mouvements dont l'ampleur ressemble à ceux de la référence.
 */
export function cutShots(project: ClipProject, pace: EditPace, plan?: MeasuredPlan | null): ClipProject {
  if (pace === "calm") return project;
  const target = shotFrames(project, pace, plan);
  const moves: readonly string[] = plan?.motion?.moves ?? SHOT_MOTIONS;
  // Rang de chaque plan dans tout le clip : la part de plans animés se répartit régulièrement.
  let shotIndex = 0;
  const animated = () => {
    const share = plan?.motion?.animatedShare ?? 1;
    const index = shotIndex++;
    return Math.floor((index + 1) * share + 1e-9) > Math.floor(index * share + 1e-9);
  };
  const tracks = project.tracks.map((track) => {
    if (!isMainTrack(track)) return track;
    let changed = false;
    const items = track.items.flatMap((item): ClipItem[] => {
      if (item.type !== "image" || !item.cue) return [item];
      if (item.duration <= target) {
        if (!plan?.motion) return [item];
        // Un fond court reste d'un seul plan, mais suit la part de plans animés de la référence.
        changed = true;
        return [{ ...item, motion: animated() ? fittedPan(moves[0], item.source, project) : "none" }];
      }
      const count = plan?.shots ? measuredShotCount(item.duration, project.fps, plan.shots) : Math.ceil(item.duration / target);
      const base = Math.floor(item.duration / count);
      const extra = item.duration - base * count;
      const first = Math.max(0, moves.indexOf(item.motion as string));
      const framings = plan?.motion ? measuredFramings(count, first, moves, animated, item, project) : null;
      changed = true;
      let start = item.start;
      return Array.from({ length: count }, (_, index) => {
        const duration = base + (index < extra ? 1 : 0);
        const framing = framings?.[index];
        const shot: ImageItem = {
          ...item,
          id: index === 0 ? item.id : uid("i-"),
          start,
          duration,
          motion: framing ? framing.motion : moves[(first + index) % moves.length],
          cue: { ...item.cue! },
          label: `Plan ${index + 1}/${count}`,
          animIn: index === 0 ? item.animIn : { kind: "none", frames: 1 },
          animOut: index === count - 1 ? item.animOut : { kind: "none", frames: 1 },
        };
        // Plan fixe serré : le même visuel, agrandi de 15 % autour de son centre.
        if (framing?.close) shot.transform = { ...item.transform, width: item.transform.width * STILL_CLOSE, height: item.transform.height * STILL_CLOSE };
        if (index > 0) delete shot.transition;
        start += duration;
        return shot;
      });
    });
    return changed ? { ...track, items } : track;
  });
  return { ...project, tracks };
}

/** Agrandissement d'un plan fixe « serré », pour qu'une coupe entre deux plans fixes se voie. */
const STILL_CLOSE = 1.15;

interface Framing {
  zoom: number;
  panX: number;
  panY: number;
}

/** Cadrage au début (`at` = 0) ou à la fin (1) d'un mouvement de caméra. */
function framingOf(motion: string, at: 0 | 1, close = false): Framing {
  const camera = cameraAt(motion, at);
  return { zoom: camera.zoom * (close ? STILL_CLOSE : 1), panX: camera.panX, panY: camera.panY };
}

/** Deux cadrages qu'on ne distingue pas : une coupe entre eux ne se verrait pas. */
function sameFraming(a: Framing, b: Framing): boolean {
  if (Math.abs(a.zoom - b.zoom) >= 0.03) return false;
  // Sans zoom, l'image n'a pas de marge : le panoramique ne déplace rien.
  if (a.zoom < 1.02) return true;
  return Math.abs(a.panX - b.panX) < 0.25 && Math.abs(a.panY - b.panY) < 0.25;
}

/** Mouvement inverse : même ampleur, autre point de départ. */
const REVERSED: Record<string, string> = {
  "zoom-in": "zoom-out",
  "zoom-out": "zoom-in",
  "pull-out": "zoom-in",
  "pan-right": "pan-left",
  "pan-left": "pan-right",
  "pan-up": "pan-down",
  "pan-down": "pan-up",
};

/**
 * Mouvements des plans d'un fond, style mesuré : la part de plans animés
 * (les autres fixes), les mouvements à tour de rôle, chacun choisi pour que
 * la coupe avec le plan d'avant se voie (un zoom arrière qui finit au repos
 * suivi d'un plan fixe ne ferait aucune coupe visible). Un plan fixe qui
 * suivrait un cadrage au repos est serré.
 */
function measuredFramings(
  count: number,
  first: number,
  moves: readonly string[],
  animated: () => boolean,
  item: ImageItem,
  project: ClipProject
): { motion: string; close: boolean }[] {
  const result: { motion: string; close: boolean }[] = [];
  let previous: Framing | null = null;
  for (let index = 0; index < count; index++) {
    if (!animated()) {
      const close = previous !== null && sameFraming(previous, framingOf("none", 0));
      result.push({ motion: "none", close });
      previous = framingOf("none", 1, close);
      continue;
    }
    const rotation = moves.map((_, offset) => moves[(first + index + offset) % moves.length]);
    const candidates = [...rotation, ...rotation.map((move) => REVERSED[move] ?? move)].map((move) => fittedPan(move, item.source, project));
    const motion = candidates.find((move) => previous === null || !sameFraming(previous, framingOf(move, 0))) ?? candidates[0];
    result.push({ motion, close: false });
    previous = framingOf(motion, 1);
  }
  return result;
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
 *
 * Avec un style mesuré (D4), autant de bruitages que la densité de la
 * référence le demande, toujours sur des temps forts : d'abord l'accroche, la
 * révélation et la fin, puis le début des segments (whoosh) et les visuels
 * qui arrivent sur le mot (pop), répartis sur le clip, à 1 s l'un de l'autre
 * au moins. Faute d'assez de temps forts, il y en a moins.
 */
export function addBeats(project: ClipProject, pace: EditPace, plan?: MeasuredPlan | null): ClipProject {
  if (pace === "calm") return project;
  const fps = project.fps;
  let tracks = staggerEndCard(project.tracks, fps);
  const sounds: ClipItem[] = plan?.beats ? measuredBeats({ ...project, tracks }, plan.beats.perMinute) : [];
  let last = -Infinity;
  for (const beat of plan?.beats ? [] : beatsOf({ ...project, tracks })) {
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

/** Temps fort d'un style mesuré : son instant, son bruitage et son nom dans la piste. */
interface MeasuredBeat {
  at: number;
  sound: SfxId;
  label: string;
}

/**
 * Bruitages d'un style mesuré : les temps forts du clip d'abord (accroche,
 * révélation, fin), puis les temps forts secondaires (début d'un segment,
 * visuel qui arrive sur le mot), puis les coupes entre deux plans, chaque
 * rang réparti régulièrement sur le clip parmi les instants assez loin des
 * autres, jusqu'au nombre voulu.
 */
function measuredBeats(project: ClipProject, perMinute: number): ClipItem[] {
  const fps = project.fps;
  const wanted = measuredBeatCount(perMinute, projectDuration(project) / fps);
  if (wanted === 0) return [];
  const gap = MEASURED_BEAT_GAP_SECONDS * fps;
  const chosen: MeasuredBeat[] = [];
  const free = (at: number) => chosen.every((entry) => Math.abs(entry.at - at) >= gap);
  for (const beat of beatsOf(project)) {
    if (chosen.length >= wanted) break;
    if (free(beat.at)) chosen.push({ at: beat.at, sound: BEAT_SOUNDS[beat.kind], label: BEAT_LABELS[beat.kind] });
  }
  const secondary: MeasuredBeat[] = [
    ...segmentsOf(project)
      .filter((segment) => !segment.cue.beat)
      .map((segment) => ({ at: segment.start, sound: "whoosh" as const, label: "Bruitage – segment" })),
    ...project.tracks
      .filter((track) => track.kind === "visual" && track.name === "Icônes")
      .flatMap((track) => track.items)
      .map((item) => ({ at: item.start, sound: "pop" as const, label: "Bruitage – visuel" })),
  ].sort((a, b) => a.at - b.at);
  // Coupes posées par `cutShots` : chaque plan d'un fond, sauf le premier.
  const cuts: MeasuredBeat[] = project.tracks
    .filter(isMainTrack)
    .flatMap((track) => track.items)
    .filter((item) => /^Plan ([2-9]|\d{2,})\//.test(item.label ?? ""))
    .map((item) => ({ at: item.start, sound: "whoosh" as const, label: "Bruitage – coupe" }))
    .sort((a, b) => a.at - b.at);
  for (const tier of [secondary, cuts]) {
    const missing = wanted - chosen.length;
    if (missing <= 0 || tier.length === 0) continue;
    // Répartis sur tout le clip : les candidats à pas réguliers d'abord, puis les autres dans l'ordre.
    const step = tier.length / missing;
    const order = [...Array.from({ length: missing }, (_, index) => Math.min(tier.length - 1, Math.floor(index * step + step / 2))), ...tier.map((_, index) => index)];
    for (const index of order) {
      if (chosen.length >= wanted) break;
      if (free(tier[index].at)) chosen.push(tier[index]);
    }
  }
  return chosen.sort((a, b) => a.at - b.at).map((beat) => sfxItem(beat.sound, beat.at, fps, beat.label));
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
export function fillStills(project: ClipProject, pace: EditPace, plan?: MeasuredPlan | null): ClipProject {
  if (pace === "calm") return project;
  const limit = shotFrames(project, pace, plan);
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
