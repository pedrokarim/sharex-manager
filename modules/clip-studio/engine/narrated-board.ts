/**
 * Vidéos de l'assistant narrées par une voix off (modèles « libre » et
 * « diaporama ») montées en tableaux, comme « Monter ma prise » (dossier 01,
 * illustrations) : c'est le même plan des tableaux, les mêmes planches, les
 * mêmes sous-titres et les mêmes sons. Seul change ce qui passe sous la
 * planche : à la place de la caméra, l'illustration de la phrase en cours
 * (l'image ou la vidéo trouvée pour son segment).
 *
 * - **split** : la planche en haut, l'illustration dans la carte du bas ;
 * - **full** : l'illustration plein cadre ;
 * - **board** : la planche seule, l'illustration attend dessous.
 *
 * Le modèle est d'abord monté sans marque ni rythme (`buildFromTemplate`) :
 * il fournit les voix posées et les illustrations de chaque segment, avec
 * leurs instants. Ses textes, voiles, icônes et sous-titres d'avant sont
 * remplacés par les tableaux. Fonction pure.
 */

import { boardTracks } from "./board";
import { uid } from "./edit";
import { loopSpans, sourceFrames } from "./rhythm";
import { beatSpans, captionHideSpans, type TakeLayout, type TakePlan } from "./take-plan";
import {
  boardSounds,
  cameraRegion,
  dressBoardProject,
  LAYOUT_GLIDE_SECONDS,
  lanes,
  layoutAt,
  planBoards,
  takeBeatSounds,
  takeCaptions,
  takeGeometry,
  type Box,
} from "./take-templates";
import { projectDuration } from "./timeline";
import type { BrandTheme } from "./brand";
import type { ClipItem, ClipProject, ImageItem, MediaSource, TimedWord, Track, Transform, VideoItem } from "./types";

type Illustration = ImageItem | VideoItem;

const MEDIA_TRACK = /^Principale( \d+)?$/;

/**
 * Mots de la narration, en ms du montage : ceux des voix posées et des
 * extraits cités qui gardent leur son, décalés à leur place sur la timeline.
 */
export function narrationWords(project: ClipProject): TimedWord[] {
  const fps = project.fps;
  const words: TimedWord[] = [];
  for (const track of project.tracks) {
    for (const item of track.items) {
      const audible =
        (item.type === "audio" && track.kind === "audio" && track.name.startsWith("Voix")) ||
        (item.type === "video" && !item.muted && item.volume > 0);
      if (!audible || (item.type !== "audio" && item.type !== "video")) continue;
      const own = item.source.words;
      if (!own?.length) continue;
      const speed = item.type === "video" ? item.speed ?? 1 : 1;
      const fromMs = (item.trimStart / fps) * 1000;
      const toMs = fromMs + (item.duration / fps) * 1000 * speed;
      const offset = (item.start / fps) * 1000;
      for (const word of own) {
        if (word.startMs < fromMs || word.startMs >= toMs) continue;
        words.push({
          text: word.text,
          startMs: Math.round(offset + (word.startMs - fromMs) / speed),
          endMs: Math.round(offset + (Math.min(word.endMs, toMs) - fromMs) / speed),
        });
      }
    }
  }
  return words.sort((a, b) => a.startMs - b.startMs);
}

/** Illustrations du modèle (images et vidéos de « Principale »), dans l'ordre du temps ; les aplats de repli sont écartés. */
export function illustrationsOf(project: ClipProject): Illustration[] {
  return project.tracks
    .filter((track) => track.kind === "visual" && MEDIA_TRACK.test(track.name))
    .flatMap((track) => track.items)
    .filter((item): item is Illustration => item.type === "image" || item.type === "video")
    .sort((a, b) => a.start - b.start);
}

/**
 * Plus aucun trou sous la planche : un passage sans illustration (la
 * conclusion, un segment resté sans image) garde l'illustration d'avant,
 * prolongée (une vidéo trop courte reprend depuis son début). Un trou au
 * tout début prend l'illustration qui suit.
 */
export function coverTimeline(items: Illustration[], totalFrames: number, fps: number): Illustration[] {
  const result: Illustration[] = [];
  const extend = (item: Illustration, until: number) => {
    const missing = until - (item.start + item.duration);
    if (missing <= 0) return;
    if (item.type === "image") {
      item.duration += missing;
      return;
    }
    const length = sourceFrames(item.source, fps);
    const speed = item.speed ?? 1;
    const end = item.trimStart + item.duration * speed;
    // Ce qui reste de la source après le passage, puis des reprises depuis son début.
    const room = Number.isFinite(length) ? Math.max(0, Math.floor((length - end) / speed)) : missing;
    const grow = Math.min(room, missing);
    item.duration += grow;
    let at = item.start + item.duration;
    for (const span of loopSpans(Number.isFinite(length) ? Math.max(1, Math.floor(length / speed)) : length, until - at, 0)) {
      if (span.duration <= 0) continue;
      result.push({ ...item, id: uid("v-"), start: at, duration: span.duration, trimStart: span.trimStart * speed, animIn: { kind: "none", frames: 1 } });
      at += span.duration;
    }
  };
  const sorted = items.map((item) => ({ ...item }) as Illustration);
  sorted.forEach((item, index) => {
    if (index === 0 && item.start > 0) {
      // Un trou au tout début : l'illustration commence avec la vidéo.
      if (item.type === "image") {
        item.duration += item.start;
        item.start = 0;
      }
    }
    result.push(item);
    const next = sorted[index + 1];
    extend(item, next ? next.start : totalFrames);
  });
  return result.sort((a, b) => a.start - b.start);
}

/** Cadre d'une région, en parts du cadre (centre et taille). */
const regionTransform = (region: Box): Transform => ({
  x: region.left + region.width / 2,
  y: region.top + region.height / 2,
  width: region.width,
  height: region.height,
  rotation: 0,
  opacity: 1,
});

/**
 * Illustrations posées sous les tableaux : chacune est coupée là où la mise
 * en page change, et cadrée (en `cover`) dans la carte du bas, plein cadre ou
 * sous le papier. Du plein cadre à la carte (ou l'inverse), une même
 * illustration glisse d'un cadre à l'autre au lieu de sauter.
 */
export function placeIllustrations(items: Illustration[], spans: ReturnType<typeof beatSpans>, geometry: ReturnType<typeof takeGeometry>, fps: number): Illustration[] {
  const changes = spans.slice(1).map((span) => span.start);
  const placed: Illustration[] = [];
  let previous: { item: Illustration; layout: TakeLayout; transform: Transform } | null = null;
  for (const item of items) {
    const end = item.start + item.duration;
    const cuts = [item.start, ...changes.filter((frame) => frame > item.start && frame < end), end];
    for (let index = 0; index + 1 < cuts.length; index++) {
      const start = cuts[index];
      const duration = cuts[index + 1] - start;
      if (duration <= 0) continue;
      const layout = layoutAt(spans, start);
      const transform = regionTransform(cameraRegion(geometry, layout));
      const { cue: _cue, ...rest } = item;
      const piece: Illustration =
        rest.type === "video"
          ? { ...rest, id: uid("v-"), start, duration, trimStart: rest.trimStart + (start - item.start) * (rest.speed ?? 1), transform, keys: undefined }
          : { ...rest, id: uid("i-"), start, duration, transform, keys: undefined };
      piece.label = layout === "full" ? "Illustration – plein cadre" : layout === "board" ? "Illustration – sous la planche" : "Illustration";
      // Au premier plan seulement, le fondu d'ouverture ; ensuite les coupes tombent sur les tableaux.
      piece.animIn = placed.length === 0 ? { kind: "fade", frames: 8 } : { kind: "none", frames: 1 };
      piece.animOut = { kind: "none", frames: 1 };
      delete piece.transition;
      const glide = previous !== null && previous.item.start + previous.item.duration === start && previous.layout !== layout && (previous.layout === "full" || layout === "full");
      if (previous && glide) {
        piece.transform = { ...previous.transform };
        piece.keys = [{ at: 0, frames: Math.round(LAYOUT_GLIDE_SECONDS * fps), x: transform.x, y: transform.y, width: transform.width, height: transform.height, ease: "smooth" }];
      }
      if (!piece.keys) delete piece.keys;
      placed.push(piece);
      previous = { item: piece, layout, transform };
    }
  }
  return placed;
}

export interface NarratedProjectInput {
  /** Le modèle monté sans marque ni rythme : voix posées, une illustration par segment. */
  base: ClipProject;
  plan: TakePlan;
  /** Mots de la narration, en ms du montage (`narrationWords`). */
  words: TimedWord[];
  /** Logos trouvés, par `logoKey(tableau, objet)`. */
  logos?: Map<string, MediaSource>;
  theme?: BrandTheme | null;
}

/**
 * Projet d'une voix off montée en tableaux. Pistes, de haut en bas :
 * « Sous-titres », les pistes de la planche, « Principale » (les
 * illustrations), les voix et la musique du modèle, puis les bruitages de la
 * planche et des temps forts. La marque habille le tout (filigrane, carton de
 * fin, police, couleurs) ; sa mascotte ne vient que sur la planche.
 */
export function buildNarratedProject(input: NarratedProjectInput): ClipProject {
  const base = input.base;
  const fps = base.fps;
  const frame = { width: base.width, height: base.height };
  const geometry = takeGeometry(base.aspect);
  const totalFrames = projectDuration(base);
  const spans = beatSpans(input.plan, input.words, totalFrames, fps);
  const boards = planBoards({ spans, plan: input.plan, words: input.words, fps, frame, geometry, logos: input.logos, theme: input.theme });

  const illustrations = placeIllustrations(coverTimeline(illustrationsOf(base), totalFrames, fps), spans, geometry, fps);
  const hidden = captionHideSpans(spans, input.words, fps);
  const captions = takeCaptions(input.words, spans, hidden, geometry, { ...base, tracks: [] }, input.plan.emphasis, input.theme);
  const beats = takeBeatSounds(input.plan, input.words, totalFrames, fps);
  const audio = base.tracks.filter((track) => track.kind === "audio");

  const tracks: Track[] = [
    { id: uid("t-"), kind: "visual", name: "Sous-titres", items: captions },
    ...boardTracks(boards),
    ...lanes(illustrations as ClipItem[], "Principale"),
    ...audio,
    ...(beats.length ? [{ id: uid("t-"), kind: "audio" as const, name: "Bruitages", items: beats }] : []),
    ...boardSounds(boards, fps),
  ];
  return dressBoardProject({ ...base, tracks, updatedAt: Date.now() }, input.theme);
}
