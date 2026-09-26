/**
 * Création et modification de projets, sans effet de bord : chaque opération
 * renvoie un nouveau projet. C'est ce qui rend « Annuler » trivial.
 */

import { msToFrames, projectDuration } from "./timeline";
import {
  ASPECTS,
  type Anim,
  type AspectPreset,
  type AudioItem,
  type ClipItem,
  type ClipProject,
  type ImageItem,
  type MediaSource,
  type ShapeItem,
  type TextItem,
  type TextStyle,
  type Track,
  type VideoItem,
  type VisualItem,
} from "./types";

export const DEFAULT_FPS = 30;

export function uid(prefix = "") {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const NO_ANIM: Anim = { kind: "none", frames: 10 };

// ─── Projet ──────────────────────────────────────────────────────

export function createProject(name: string, aspect: AspectPreset): ClipProject {
  const { width, height } = ASPECTS[aspect];
  const now = Date.now();
  return {
    version: 1,
    id: uid("clip-"),
    name,
    aspect,
    width,
    height,
    fps: DEFAULT_FPS,
    background: "#000000",
    tracks: [
      { id: uid("t-"), kind: "visual", name: "Texte", items: [] },
      { id: uid("t-"), kind: "visual", name: "Principale", items: [] },
      { id: uid("t-"), kind: "audio", name: "Audio", items: [] },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Styles de texte ─────────────────────────────────────────────

const BASE_STYLE: TextStyle = {
  font: "Montserrat",
  weight: 800,
  size: 0.05,
  color: "#ffffff",
  align: "center",
  lineHeight: 1.15,
  uppercase: false,
  letterSpacing: 0,
  stroke: null,
  shadow: { color: "rgba(0,0,0,0.55)", blur: 0.25, offsetY: 0.06 },
  background: null,
};

/** Styles prêts à l'emploi, pensés pour les formats courts. */
export const TEXT_PRESETS: { id: string; label: string; style: TextStyle; sample: string }[] = [
  {
    id: "impact",
    label: "Impact",
    sample: "Le saviez-vous ?",
    style: { ...BASE_STYLE, font: "Anton", weight: 400, size: 0.065, uppercase: true, stroke: { color: "#000000", width: 0.08 }, shadow: null },
  },
  {
    id: "caption",
    label: "Légende",
    sample: "Une légende lisible",
    style: { ...BASE_STYLE, font: "Montserrat", weight: 800, size: 0.04, stroke: { color: "#000000", width: 0.1 }, shadow: null },
  },
  {
    id: "boxed",
    label: "Encadré",
    sample: "Question 1",
    style: { ...BASE_STYLE, font: "Poppins", weight: 700, size: 0.04, color: "#111111", shadow: null, background: { color: "#ffffff", padding: 0.35, radius: 0.3 } },
  },
  {
    id: "neon",
    label: "Néon",
    sample: "Bonne réponse !",
    style: { ...BASE_STYLE, font: "Bebas Neue", weight: 400, size: 0.07, color: "#fdf6ff", shadow: { color: "#d946ef", blur: 0.6, offsetY: 0 } },
  },
  {
    id: "comic",
    label: "BD",
    sample: "Boum !",
    style: { ...BASE_STYLE, font: "Bangers", weight: 400, size: 0.07, color: "#fde047", letterSpacing: 0.03, stroke: { color: "#1f1f1f", width: 0.09 }, shadow: null },
  },
  {
    id: "clean",
    label: "Sobre",
    sample: "Un titre sobre",
    style: { ...BASE_STYLE, font: "Inter", weight: 600, size: 0.035, shadow: null },
  },
];

// ─── Éléments ────────────────────────────────────────────────────

function fullFrame() {
  return { x: 0.5, y: 0.5, width: 1, height: 1, rotation: 0, opacity: 1 };
}

export function createImageItem(source: MediaSource, start: number, fps: number): ImageItem {
  return {
    id: uid("i-"),
    type: "image",
    start,
    duration: 3 * fps,
    source,
    fit: "cover",
    motion: "zoom-in",
    radius: 0,
    transform: fullFrame(),
    animIn: { kind: "fade", frames: 8 },
    animOut: NO_ANIM,
  };
}

export function createVideoItem(source: MediaSource, start: number, fps: number): VideoItem {
  const duration = source.durationMs ? Math.max(1, msToFrames(source.durationMs, fps)) : 5 * fps;
  return {
    id: uid("v-"),
    type: "video",
    start,
    duration,
    source,
    fit: "cover",
    trimStart: 0,
    volume: 1,
    radius: 0,
    transform: fullFrame(),
    animIn: NO_ANIM,
    animOut: NO_ANIM,
  };
}

export function createAudioItem(source: MediaSource, start: number, fps: number): AudioItem {
  const duration = source.durationMs ? Math.max(1, msToFrames(source.durationMs, fps)) : 10 * fps;
  return {
    id: uid("a-"),
    type: "audio",
    start,
    duration,
    source,
    trimStart: 0,
    volume: 0.8,
    fadeIn: 0,
    fadeOut: Math.round(fps * 0.8),
  };
}

export function createTextItem(
  presetId: string,
  start: number,
  fps: number,
  text?: string
): TextItem {
  const preset = TEXT_PRESETS.find((entry) => entry.id === presetId) ?? TEXT_PRESETS[0];
  return {
    id: uid("x-"),
    type: "text",
    start,
    duration: 3 * fps,
    text: text ?? preset.sample,
    style: structuredClone(preset.style),
    transform: { x: 0.5, y: 0.5, width: 0.86, height: 0.2, rotation: 0, opacity: 1 },
    animIn: { kind: "pop", frames: 10 },
    animOut: { kind: "fade", frames: 6 },
  };
}

export function createShapeItem(shape: ShapeItem["shape"], start: number, fps: number): ShapeItem {
  const progress = shape === "progress";
  return {
    id: uid("s-"),
    type: "shape",
    start,
    duration: 3 * fps,
    shape,
    fill: progress ? "#facc15" : "#ffffff",
    radius: progress ? 0.5 : 0.08,
    progress: progress ? { track: "rgba(255,255,255,0.25)", reverse: true } : undefined,
    transform: progress
      ? { x: 0.5, y: 0.82, width: 0.8, height: 0.018, rotation: 0, opacity: 1 }
      : { x: 0.5, y: 0.5, width: 0.4, height: 0.2, rotation: 0, opacity: 0.9 },
    animIn: { kind: "fade", frames: 6 },
    animOut: NO_ANIM,
  };
}

// ─── Recherche ───────────────────────────────────────────────────

export function findItem(
  project: ClipProject,
  itemId: string
): { track: Track; item: ClipItem; index: number } | null {
  for (const track of project.tracks) {
    const index = track.items.findIndex((item) => item.id === itemId);
    if (index !== -1) return { track, item: track.items[index], index };
  }
  return null;
}

function overlaps(items: ClipItem[], start: number, duration: number, ignoreId?: string) {
  return items.some(
    (item) =>
      item.id !== ignoreId && start < item.start + item.duration && item.start < start + duration
  );
}

// ─── Opérations ──────────────────────────────────────────────────

function touch(project: ClipProject, tracks: Track[]): ClipProject {
  return { ...project, tracks, updatedAt: Date.now() };
}

function mapTrack(project: ClipProject, trackId: string, map: (track: Track) => Track) {
  return touch(
    project,
    project.tracks.map((track) => (track.id === trackId ? map(track) : track))
  );
}

/**
 * Ajoute un élément à la position voulue, sur la première piste compatible
 * où il ne chevauche rien. Faute de place, une piste est créée : pour un
 * visuel, au-dessus des autres (il sera visible) ; pour un son, en bas.
 */
/**
 * Place un élément sur la première piste libre, en commençant par
 * `preferredTrackId`. Avec `trackName`, seules les pistes de ce nom sont
 * candidates et une piste de ce nom est créée s'il n'y a pas de place.
 */
export function addItem(project: ClipProject, item: ClipItem, preferredTrackId?: string, trackName?: string): ClipProject {
  const kind = item.type === "audio" ? "audio" : "visual";
  const candidates = project.tracks.filter(
    (track) => track.kind === kind && !track.locked && (!trackName || track.name.startsWith(trackName))
  );
  const preferred = candidates.find((track) => track.id === preferredTrackId);
  const ordered = preferred ? [preferred, ...candidates.filter((track) => track !== preferred)] : candidates;
  const target = ordered.find((track) => !overlaps(track.items, item.start, item.duration));

  if (target) {
    return mapTrack(project, target.id, (track) => ({
      ...track,
      items: [...track.items, item].sort((a, b) => a.start - b.start),
    }));
  }

  const track: Track = {
    id: uid("t-"),
    kind,
    name: trackName ?? (kind === "audio" ? "Audio" : "Calque"),
    items: [item],
  };
  const tracks =
    kind === "audio" ? [...project.tracks, track] : [track, ...project.tracks];
  return touch(project, tracks);
}

/** Ajoute une suite d'éléments bout à bout sur la piste principale. */
export function appendSequence(project: ClipProject, items: VisualItem[]): ClipProject {
  let next = project;
  for (const item of items) next = addItem(next, item, mainTrackId(next));
  return next;
}

export function mainTrackId(project: ClipProject): string | undefined {
  return (
    project.tracks.find((track) => track.kind === "visual" && track.name === "Principale")?.id ??
    project.tracks.filter((track) => track.kind === "visual").at(-1)?.id
  );
}

/** Fin de la piste principale : là où s'ajoute le média suivant. */
export function mainTrackEnd(project: ClipProject): number {
  const track = project.tracks.find((entry) => entry.id === mainTrackId(project));
  return track ? Math.max(0, ...track.items.map((item) => item.start + item.duration)) : 0;
}

export function updateItem(
  project: ClipProject,
  itemId: string,
  patch: Partial<ClipItem> | ((item: ClipItem) => ClipItem)
): ClipProject {
  return touch(
    project,
    project.tracks.map((track) => ({
      ...track,
      items: track.items.map((item) =>
        item.id === itemId
          ? typeof patch === "function"
            ? patch(item)
            : ({ ...item, ...patch } as ClipItem)
          : item
      ),
    }))
  );
}

export function removeItem(project: ClipProject, itemId: string): ClipProject {
  return touch(
    project,
    project.tracks.map((track) => ({
      ...track,
      items: track.items.filter((item) => item.id !== itemId),
    }))
  );
}

/**
 * Déplace un élément dans le temps et, si demandé, vers une autre piste du
 * même type. Refusé s'il chevaucherait un autre élément : la timeline reste
 * lisible, un élément par endroit.
 */
export function moveItem(
  project: ClipProject,
  itemId: string,
  start: number,
  trackId?: string
): ClipProject {
  const found = findItem(project, itemId);
  if (!found) return project;
  const target = project.tracks.find((track) => track.id === (trackId ?? found.track.id));
  if (!target || target.locked) return project;
  const kind = found.item.type === "audio" ? "audio" : "visual";
  if (target.kind !== kind) return project;
  const nextStart = Math.max(0, Math.round(start));
  if (overlaps(target.items, nextStart, found.item.duration, itemId)) return project;

  const moved = { ...found.item, start: nextStart };
  return touch(
    project,
    project.tracks.map((track) => {
      let items = track.items.filter((item) => item.id !== itemId);
      if (track.id === target.id) items = [...items, moved].sort((a, b) => a.start - b.start);
      return { ...track, items };
    })
  );
}

/**
 * Rogne un élément par le début ou la fin. Pour une vidéo ou un son, le
 * début rogné avance dans la source, et la fin ne dépasse pas sa durée.
 */
export function trimItem(
  project: ClipProject,
  itemId: string,
  edge: "start" | "end",
  frame: number
): ClipProject {
  const found = findItem(project, itemId);
  if (!found) return project;
  const item = found.item;
  const end = item.start + item.duration;
  const sourceFrames =
    "source" in item && item.source.durationMs && item.type !== "image"
      ? msToFrames(item.source.durationMs, project.fps)
      : Infinity;
  const trim = "trimStart" in item ? item.trimStart : 0;
  const neighbours = found.track.items.filter((other) => other.id !== itemId);

  if (edge === "start") {
    const previousEnd = Math.max(0, ...neighbours.filter((o) => o.start < item.start).map((o) => o.start + o.duration));
    let start = Math.min(Math.max(Math.round(frame), previousEnd), end - 1);
    // On ne peut pas reculer avant le début de la source.
    if ("trimStart" in item) start = Math.max(start, item.start - trim);
    const delta = start - item.start;
    return updateItem(project, itemId, (current: ClipItem) => ({
      ...current,
      start,
      duration: end - start,
      ...("trimStart" in current ? { trimStart: current.trimStart + delta } : {}),
    }) as ClipItem);
  }

  const nextStart = Math.min(...neighbours.filter((o) => o.start >= end).map((o) => o.start), Infinity);
  let newEnd = Math.max(Math.round(frame), item.start + 1);
  newEnd = Math.min(newEnd, nextStart, item.start + (sourceFrames - trim));
  return updateItem(project, itemId, { duration: newEnd - item.start } as Partial<ClipItem>);
}

/** Coupe un élément en deux à l'image `frame`. */
export function splitItem(project: ClipProject, itemId: string, frame: number): ClipProject {
  const found = findItem(project, itemId);
  if (!found) return project;
  const item = found.item;
  const cut = Math.round(frame);
  if (cut <= item.start || cut >= item.start + item.duration) return project;

  const left = { ...item, duration: cut - item.start } as ClipItem;
  const right = {
    ...structuredClone(item),
    id: uid(item.id.split("-")[0] + "-"),
    start: cut,
    duration: item.start + item.duration - cut,
    ...("trimStart" in item ? { trimStart: item.trimStart + (cut - item.start) } : {}),
  } as ClipItem;
  if ("animOut" in left) (left as VisualItem).animOut = { kind: "none", frames: 10 };
  if ("animIn" in right) (right as VisualItem).animIn = { kind: "none", frames: 10 };

  return mapTrack(project, found.track.id, (track) => ({
    ...track,
    items: track.items
      .flatMap((entry) => (entry.id === itemId ? [left, right] : [entry]))
      .sort((a, b) => a.start - b.start),
  }));
}

/** Duplique un élément juste après lui, ou sur une autre piste s'il n'y a pas la place. */
export function duplicateItem(project: ClipProject, itemId: string): { project: ClipProject; id: string } {
  const found = findItem(project, itemId);
  if (!found) return { project, id: itemId };
  const copy = {
    ...structuredClone(found.item),
    id: uid(found.item.id.split("-")[0] + "-"),
    start: found.item.start + found.item.duration,
  } as ClipItem;
  return { project: addItem(project, copy, found.track.id), id: copy.id };
}

export function updateTrack(project: ClipProject, trackId: string, patch: Partial<Track>): ClipProject {
  return mapTrack(project, trackId, (track) => ({ ...track, ...patch }));
}

/** Retire les pistes vides en trop, en gardant au moins une piste de chaque type. */
export function pruneTracks(project: ClipProject): ClipProject {
  const keep = (kind: Track["kind"]) => {
    const tracks = project.tracks.filter((track) => track.kind === kind);
    const nonEmpty = tracks.filter((track) => track.items.length > 0);
    return new Set((nonEmpty.length ? nonEmpty : tracks.slice(0, 1)).map((track) => track.id));
  };
  const visual = keep("visual");
  const audio = keep("audio");
  const tracks = project.tracks.filter(
    (track) => visual.has(track.id) || audio.has(track.id) || track.name === "Principale"
  );
  return tracks.length === project.tracks.length ? project : touch(project, tracks);
}

export function changeAspect(project: ClipProject, aspect: AspectPreset): ClipProject {
  const { width, height } = ASPECTS[aspect];
  return { ...project, aspect, width, height, updatedAt: Date.now() };
}

export { projectDuration };
