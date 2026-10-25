/**
 * Création et modification de projets, sans effet de bord : chaque opération
 * renvoie un nouveau projet. C'est ce qui rend « Annuler » trivial.
 */

import { shiftTimed } from "./keys";
import { msToFrames, projectDuration, speedOf } from "./timeline";
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
  type TimedWord,
  type Track,
  type TranscriptInfo,
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

/**
 * Musique de fond de `start` à `end`, bouclée si le morceau est plus court,
 * avec une entrée et une sortie en fondu.
 */
export function createMusicItems(source: MediaSource, start: number, end: number, fps: number, volume = 0.35): AudioItem[] {
  const length = Math.max(fps, source.durationMs ? msToFrames(source.durationMs, fps) : end - start);
  const items: AudioItem[] = [];
  for (let at = start; at < end; at += length) {
    const duration = Math.min(length, end - at);
    if (duration < 1) break;
    items.push({
      id: uid("a-"),
      type: "audio",
      start: at,
      duration,
      source,
      trimStart: 0,
      volume,
      fadeIn: at === start ? Math.round(fps * 0.5) : 0,
      fadeOut: at + duration >= end ? Math.min(duration, Math.round(fps * 1.5)) : 0,
    });
  }
  return items;
}

/** Style des sous-titres animés : gros, contrastés, lisibles sur tout fond. */
export const CAPTION_STYLE: TextStyle = {
  font: "Montserrat",
  weight: 800,
  size: 0.05,
  color: "#ffffff",
  align: "center",
  lineHeight: 1.15,
  uppercase: true,
  letterSpacing: 0,
  stroke: { color: "#000000", width: 0.09 },
  shadow: { color: "rgba(0,0,0,0.55)", blur: 0.25, offsetY: 0.06 },
  background: null,
};

/** Sous-titres animés calés sur une voix posée à l'image `start`. */
export function createCaptionItem(words: TimedWord[], start: number, fps: number, vertical: boolean): TextItem {
  const last = words[words.length - 1];
  return {
    id: uid("x-"),
    type: "text",
    start,
    duration: Math.max(1, msToFrames(last ? last.endMs + 300 : 1000, fps)),
    text: words.map((word) => word.text).join(" "),
    style: structuredClone(CAPTION_STYLE),
    karaoke: { words, offset: 0, highlight: "#facc15", groupSize: vertical ? 3 : 5 },
    transform: { x: 0.5, y: vertical ? 0.74 : 0.84, width: vertical ? 0.86 : 0.8, height: 0.16, rotation: 0, opacity: 1 },
    animIn: { kind: "none", frames: 6 },
    animOut: { kind: "none", frames: 6 },
  };
}

/**
 * Élément dont on entend la parole : une voix ou un son, une vidéo qui garde
 * son son, ou le son détaché d'une vidéo (qui porte la même source). `null`
 * pour une vidéo muette.
 */
export function spokenItem(project: ClipProject, item: AudioItem | VideoItem): AudioItem | VideoItem | null {
  if (item.type === "audio") return item;
  const partner = linkedItem(project, item);
  if (partner) return partner.item;
  return item.muted || item.audioLinkId ? null : item;
}

/**
 * Sous-titres d'une voix, d'un son ou d'une vidéo transcrite, calés sur sa
 * place, son rognage et sa vitesse. Les mots sont en temps de la source : à
 * une vitesse autre que 1, ils sont ramenés au temps du projet (une vitesse
 * changée après coup ne recale pas des sous-titres déjà posés). D'un média
 * transcrit, seuls les mots du passage lu sont gardés.
 */
export function captionForVoice(project: ClipProject, voice: AudioItem | VideoItem): TextItem | null {
  const target = spokenItem(project, voice);
  if (!target) return null;
  const all = target.source.words;
  if (!all?.length) return null;
  const fps = project.fps;
  const speed = speedOf(target);
  let words = all;
  if (target.type === "video" || target.source.transcript) {
    const fromMs = (target.trimStart / fps) * 1000 - 1000;
    const toMs = ((target.trimStart + target.duration * speed) / fps) * 1000 + 1000;
    words = all.filter((word) => word.endMs >= fromMs && word.startMs <= toMs);
    if (!words.length) return null;
  }
  if (speed !== 1) words = words.map((word) => ({ ...word, startMs: Math.round(word.startMs / speed), endMs: Math.round(word.endMs / speed) }));
  const caption = createCaptionItem(words, target.start, fps, project.height > project.width);
  caption.duration = target.duration;
  caption.karaoke = { ...caption.karaoke!, offset: speed === 1 ? target.trimStart : target.trimStart / speed, voiceId: target.id };
  return caption;
}

/**
 * Range les mots d'une transcription dans tous les éléments qui lisent ce
 * média (`source.ref`), vidéos et sons détachés compris.
 */
export function setSourceTranscript(project: ClipProject, ref: string, words: TimedWord[], transcript: TranscriptInfo): ClipProject {
  let changed = false;
  const tracks = project.tracks.map((track) => ({
    ...track,
    items: track.items.map((item) => {
      if ((item.type !== "video" && item.type !== "audio") || item.source.ref !== ref) return item;
      changed = true;
      return { ...item, source: { ...item.source, words, transcript } };
    }),
  }));
  return changed ? touch(project, tracks) : project;
}

/**
 * Sous-titre toutes les voix et les vidéos transcrites du projet qui ne le
 * sont pas encore. Une vidéo muette est passée ; celle dont le son est
 * détaché l'est par son élément audio.
 */
export function captionAllVoices(project: ClipProject): { project: ClipProject; count: number } {
  const captioned = new Set(
    project.tracks.flatMap((track) => track.items).flatMap((item) => (item.type === "text" && item.karaoke?.voiceId ? [item.karaoke.voiceId] : []))
  );
  let next = project;
  let count = 0;
  for (const item of project.tracks.flatMap((track) => track.items)) {
    if ((item.type !== "audio" && item.type !== "video") || captioned.has(item.id)) continue;
    if (item.type === "video" && (item.muted || item.audioLinkId)) continue;
    const caption = captionForVoice(project, item);
    if (!caption) continue;
    next = addItem(next, caption, undefined, "Sous-titres");
    count++;
  }
  return { project: next, count };
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

/**
 * Modifie un élément. Une vidéo et son son détaché gardent la même place, la
 * même durée, le même rognage et la même vitesse : un changement de l'un est
 * reporté sur l'autre.
 */
export function updateItem(
  project: ClipProject,
  itemId: string,
  patch: Partial<ClipItem> | ((item: ClipItem) => ClipItem)
): ClipProject {
  const next = touch(
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
  return syncLinked(next, itemId);
}

/** Retire un élément ; une vidéo et son son détaché partent ensemble. */
export function removeItem(project: ClipProject, itemId: string): ClipProject {
  const found = findItem(project, itemId);
  const partnerId = found ? linkedItem(project, found.item)?.item.id : undefined;
  return touch(
    project,
    project.tracks.map((track) => ({
      ...track,
      items: track.items.filter((item) => item.id !== itemId && item.id !== partnerId),
    }))
  );
}

// ─── Son détaché d'une vidéo ─────────────────────────────────────

/** Piste audio où se range le son détaché des vidéos. */
export const VIDEO_SOUND_TRACK = "Son des vidéos";

/**
 * Élément lié à `item` : le son détaché d'une vidéo, ou la vidéo d'un son
 * détaché. `null` si le lien manque ou ne vaut pas dans les deux sens.
 */
export function linkedItem(
  project: ClipProject,
  item: ClipItem
): { track: Track; item: AudioItem | VideoItem } | null {
  const otherId = item.type === "video" ? item.audioLinkId : item.type === "audio" ? item.linkedVideoId : undefined;
  if (!otherId) return null;
  const found = findItem(project, otherId);
  if (!found) return null;
  const other = found.item;
  if (item.type === "video" && other.type === "audio" && other.linkedVideoId === item.id) return { track: found.track, item: other };
  if (item.type === "audio" && other.type === "video" && other.audioLinkId === item.id) return { track: found.track, item: other };
  return null;
}

/** `target` calé sur la place, la durée, le rognage et la vitesse de `from`. */
function withTimingOf<T extends AudioItem | VideoItem>(target: T, from: AudioItem | VideoItem): T {
  const next = { ...target, start: from.start, duration: from.duration, trimStart: from.trimStart };
  if (speedOf(from) === 1) delete next.speed;
  else next.speed = speedOf(from);
  return next;
}

/** Recale l'élément lié à `itemId` sur lui, s'il a bougé. */
function syncLinked(project: ClipProject, itemId: string): ClipProject {
  const found = findItem(project, itemId);
  if (!found || (found.item.type !== "video" && found.item.type !== "audio")) return project;
  const partner = linkedItem(project, found.item);
  if (!partner) return project;
  const item = found.item;
  const other = partner.item;
  if (other.start === item.start && other.duration === item.duration && other.trimStart === item.trimStart && speedOf(other) === speedOf(item)) {
    return project;
  }
  return {
    ...project,
    tracks: project.tracks.map((track) =>
      track.id !== partner.track.id
        ? track
        : {
            ...track,
            items: track.items
              .map((entry) => (entry.id === other.id ? withTimingOf(other, item) : entry))
              .sort((a, b) => a.start - b.start),
          }
    ),
  };
}

/**
 * Détache le son d'une vidéo sur une piste audio (« Son des vidéos » de
 * préférence, créée au besoin) : même source, même place, même rognage, même
 * vitesse, mêmes volume, fondus et creux sous la voix. La vidéo devient
 * muette tant que le lien dure. Rend le projet tel quel pour une vidéo sans
 * son ou déjà détachée.
 */
export function detachVideoAudio(project: ClipProject, videoId: string): { project: ClipProject; audioId: string | null } {
  const found = findItem(project, videoId);
  if (!found || found.item.type !== "video") return { project, audioId: null };
  const video = found.item;
  if (video.source.hasAudio === false || linkedItem(project, video)) return { project, audioId: null };
  const audio: AudioItem = {
    id: uid("a-"),
    type: "audio",
    start: video.start,
    duration: video.duration,
    source: video.source,
    trimStart: video.trimStart,
    volume: video.volume,
    fadeIn: video.fadeIn ?? 0,
    fadeOut: video.fadeOut ?? 0,
    linkedVideoId: video.id,
  };
  if (video.duck !== undefined) audio.duck = video.duck;
  if (speedOf(video) !== 1) audio.speed = speedOf(video);
  if (video.label) audio.label = video.label;
  // Le son détaché s'entend : la coupure éventuelle de la vidéo ne le suit pas.
  const linked = updateItem(project, videoId, (item) => {
    const { muted: _muted, ...rest } = item as VideoItem;
    return { ...rest, audioLinkId: audio.id };
  });
  return { project: addItem(linked, audio, undefined, VIDEO_SOUND_TRACK), audioId: audio.id };
}

/**
 * Rattache le son détaché d'une vidéo (depuis la vidéo ou depuis le son) : la
 * vidéo reprend le volume, les fondus et le creux réglés sur le son, et
 * l'élément audio disparaît, avec sa piste si elle reste vide. Un lien
 * orphelin (son déjà supprimé) est simplement effacé.
 */
export function reattachVideoAudio(project: ClipProject, itemId: string): ClipProject {
  const found = findItem(project, itemId);
  if (!found) return project;
  const partner = linkedItem(project, found.item);
  const video = found.item.type === "video" ? found.item : partner?.item.type === "video" ? partner.item : null;
  const audio = found.item.type === "audio" ? found.item : partner?.item.type === "audio" ? partner.item : null;
  if (!video) {
    // Son dont la vidéo a disparu : il redevient un son ordinaire.
    if (found.item.type !== "audio" || !found.item.linkedVideoId) return project;
    return updateItem(project, itemId, (item) => {
      const { linkedVideoId: _link, ...rest } = item as AudioItem;
      return rest;
    });
  }
  if (!audio || !partner) {
    if (!video.audioLinkId) return project;
    return updateItem(project, video.id, (item) => {
      const { audioLinkId: _link, ...rest } = item as VideoItem;
      return rest;
    });
  }
  const audioTrack = found.item.type === "audio" ? found.track : partner.track;
  const { audioLinkId: _link, duck: _duck, ...rest } = video;
  const restored: VideoItem = { ...rest, volume: audio.volume, fadeIn: audio.fadeIn, fadeOut: audio.fadeOut };
  if (audio.duck !== undefined) restored.duck = audio.duck;
  const others = project.tracks.filter((track) => track.kind === "audio" && track.id !== audioTrack.id);
  const tracks = project.tracks
    .map((track) => ({
      ...track,
      items: track.items.flatMap((item) => (item.id === audio.id ? [] : item.id === video.id ? [restored] : [item])),
    }))
    // La piste « Son des vidéos », vidée, s'en va s'il reste une autre piste audio.
    .filter(
      (track) =>
        !(track.id === audioTrack.id && track.name.startsWith(VIDEO_SOUND_TRACK) && track.items.length === 0 && others.length > 0)
    );
  return touch(project, tracks);
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
  const targetId = trackId ?? found.track.id;
  if (!canMoveItem(project, itemId, start, targetId)) return project;
  const nextStart = Math.max(0, Math.round(start));
  // Le son détaché suit la vidéo (et inversement), sur sa propre piste.
  const partner = linkedItem(project, found.item);

  const moved = { ...found.item, start: nextStart };
  return touch(
    project,
    project.tracks.map((track) => {
      let items = track.items.filter((item) => item.id !== itemId);
      if (track.id === targetId) items = [...items, moved].sort((a, b) => a.start - b.start);
      if (partner && track.id === partner.track.id) {
        items = items.map((item) => (item.id === partner.item.id ? { ...item, start: nextStart } : item)).sort((a, b) => a.start - b.start);
      }
      return { ...track, items };
    })
  );
}

/**
 * Le déplacement de `itemId` à `start`, sur `trackId`, est-il possible ? Mêmes
 * règles que `moveItem` (aucun chevauchement, son détaché compris) : la
 * timeline s'en sert pour dessiner le fantôme d'un glissement.
 */
export function canMoveItem(project: ClipProject, itemId: string, start: number, trackId: string): boolean {
  const found = findItem(project, itemId);
  if (!found) return false;
  const target = project.tracks.find((track) => track.id === trackId);
  if (!target || target.locked) return false;
  if (target.kind !== (found.item.type === "audio" ? "audio" : "visual")) return false;
  const nextStart = Math.max(0, Math.round(start));
  if (overlaps(target.items, nextStart, found.item.duration, itemId)) return false;
  const partner = linkedItem(project, found.item);
  return !partner || (!partner.track.locked && !overlaps(partner.track.items, nextStart, partner.item.duration, partner.item.id));
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
  // Une vidéo accélérée (ou son son détaché) consomme plus d'une image de source par image de timeline.
  const speed = item.type === "video" || item.type === "audio" ? speedOf(item) : 1;
  // Le son détaché se rogne avec sa vidéo (`updateItem`) : ses voisins bornent aussi le geste.
  const partner = linkedItem(project, item);
  const neighbours = [
    ...found.track.items.filter((other) => other.id !== itemId),
    ...(partner ? partner.track.items.filter((other) => other.id !== partner.item.id) : []),
  ];

  if (edge === "start") {
    const previousEnd = Math.max(0, ...neighbours.filter((o) => o.start < item.start).map((o) => o.start + o.duration));
    let start = Math.min(Math.max(Math.round(frame), previousEnd), end - 1);
    // On ne peut pas reculer avant le début de la source.
    if ("trimStart" in item) start = Math.max(start, item.start - Math.floor(trim / speed));
    const delta = start - item.start;
    return updateItem(project, itemId, (current: ClipItem) => ({
      ...current,
      start,
      duration: end - start,
      ...("trimStart" in current ? { trimStart: Math.max(0, current.trimStart + Math.round(delta * speed)) } : {}),
      ...(current.type === "text" && current.karaoke
        ? { karaoke: { ...current.karaoke, offset: current.karaoke.offset + delta } }
        : {}),
      // Images clés et tracés restent à leur instant dans le clip.
      ...(current.type !== "audio" ? shiftTimed(current, delta) : {}),
    }) as ClipItem);
  }

  const nextStart = Math.min(...neighbours.filter((o) => o.start >= end).map((o) => o.start), Infinity);
  let newEnd = Math.max(Math.round(frame), item.start + 1);
  newEnd = Math.min(newEnd, nextStart, item.start + Math.floor((sourceFrames - trim) / speed));
  return updateItem(project, itemId, { duration: newEnd - item.start } as Partial<ClipItem>);
}

/** Coupe un élément en deux à l'image `frame`. */
export function splitItem(project: ClipProject, itemId: string, frame: number): ClipProject {
  const found = findItem(project, itemId);
  if (!found) return project;
  const item = found.item;
  const cut = Math.round(frame);
  if (cut <= item.start || cut >= item.start + item.duration) return project;

  const [left, right] = splitParts(item, cut);
  // Une vidéo et son son détaché se scindent ensemble ; les deux moitiés de droite sont liées entre elles.
  const partner = linkedItem(project, item);
  const parts = new Map<string, ClipItem[]>([[itemId, [left, right]]]);
  if (partner) {
    const [otherLeft, otherRight] = splitParts(partner.item, cut);
    if (right.type === "video" && otherRight.type === "audio") {
      right.audioLinkId = otherRight.id;
      otherRight.linkedVideoId = right.id;
    } else if (right.type === "audio" && otherRight.type === "video") {
      right.linkedVideoId = otherRight.id;
      otherRight.audioLinkId = right.id;
    }
    parts.set(partner.item.id, [otherLeft, otherRight]);
  }

  return touch(
    project,
    project.tracks.map((track) =>
      track.items.some((entry) => parts.has(entry.id))
        ? {
            ...track,
            items: track.items.flatMap((entry) => parts.get(entry.id) ?? [entry]).sort((a, b) => a.start - b.start),
          }
        : track
    )
  );
}

/** Les deux moitiés d'un élément coupé à l'image `cut` (comprise dans l'élément). */
function splitParts(item: ClipItem, cut: number): [ClipItem, ClipItem] {
  const left = { ...item, duration: cut - item.start } as ClipItem;
  const right = {
    ...structuredClone(item),
    id: uid(item.id.split("-")[0] + "-"),
    start: cut,
    duration: item.start + item.duration - cut,
    ...("trimStart" in item
      ? { trimStart: item.trimStart + Math.round((cut - item.start) * speedOf(item)) }
      : {}),
    ...(item.type === "text" && item.karaoke
      ? { karaoke: { ...structuredClone(item.karaoke), offset: item.karaoke.offset + (cut - item.start) } }
      : {}),
    ...(item.type !== "audio" ? shiftTimed(structuredClone(item), cut - item.start) : {}),
  } as ClipItem;
  if ("animOut" in left) (left as VisualItem).animOut = { kind: "none", frames: 10 };
  if ("animIn" in right) {
    // La coupe est franche : la seconde moitié n'hérite pas de la transition.
    (right as VisualItem).animIn = { kind: "none", frames: 10 };
    delete (right as VisualItem).transition;
  }
  // Le son non plus ne s'éteint ni ne renaît à la coupe : chaque moitié garde son seul fondu extérieur.
  if (left.type === "audio" || (left.type === "video" && left.fadeOut !== undefined)) left.fadeOut = 0;
  if (right.type === "audio" || (right.type === "video" && right.fadeIn !== undefined)) right.fadeIn = 0;
  return [left, right];
}

/**
 * Change la vitesse d'une vidéo en gardant le même passage de la source : le
 * plan s'allonge ou raccourcit, sans déborder sur le plan qui suit.
 */
export function setVideoSpeed(project: ClipProject, itemId: string, speed: number): ClipProject {
  const patch = videoSpeedPatch(project, itemId, speed);
  return patch ? updateItem(project, itemId, patch as Partial<ClipItem>) : project;
}

/** Vitesse et durée qui en découle, sans les appliquer (pour l'inspecteur). */
export function videoSpeedPatch(project: ClipProject, itemId: string, speed: number): { speed: number; duration: number } | null {
  const found = findItem(project, itemId);
  if (!found || found.item.type !== "video") return null;
  const item = found.item;
  const next = speedOf({ speed });
  const sourceSpan = item.duration * speedOf(item);
  // Le son détaché change de vitesse avec la vidéo (`updateItem`) : il ne déborde pas non plus.
  const partner = linkedItem(project, item);
  const following = [
    ...found.track.items.filter((other) => other.id !== itemId),
    ...(partner ? partner.track.items.filter((other) => other.id !== partner.item.id) : []),
  ];
  const nextStart = Math.min(
    ...following.filter((other) => other.start >= item.start + item.duration).map((other) => other.start),
    Infinity
  );
  const duration = Math.max(1, Math.min(Math.round(sourceSpan / next), nextStart - item.start));
  return { speed: next, duration };
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
  // Une vidéo au son détaché se duplique avec lui : la nouvelle paire a ses propres liens.
  const partner = linkedItem(project, found.item);
  if (partner) {
    const other = { ...structuredClone(partner.item), id: uid(partner.item.id.split("-")[0] + "-"), start: copy.start } as AudioItem | VideoItem;
    if (copy.type === "video" && other.type === "audio") {
      copy.audioLinkId = other.id;
      other.linkedVideoId = copy.id;
    } else if (copy.type === "audio" && other.type === "video") {
      copy.linkedVideoId = other.id;
      other.audioLinkId = copy.id;
    }
    return { project: addItem(addItem(project, copy, found.track.id), other, partner.track.id), id: copy.id };
  }
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
