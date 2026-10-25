/**
 * « Monter ma prise » (dossier 01, V6 ; illustrations, étapes I2 et I3) : le
 * projet monté.
 *
 * La prise coupée (`take-cut.ts`) devient une suite de plans vidéo, un par
 * passage gardé, avec leur son détaché sur une piste « Voix » (la musique
 * s'efface dessous, et la vidéo et son son restent liés dans l'éditeur). Le
 * plan des tableaux (`take-plan.ts`) dispose la page, tableau par tableau :
 *
 * - **split** : une planche d'illustrations en haut (en 16:9, à gauche), la
 *   caméra en bas, cadrée sur le visage ;
 * - **full** : la caméra plein cadre, pour une phrase directe de 5 s ou plus ;
 * - **board** : la planche seule, plein écran, pendant que la voix continue.
 *
 * Chaque tableau devient une planche (`take-scenes.ts`, puis `board.ts`) :
 * ses objets entrent sur leurs mots, se barrent, se croisent, se relient.
 * D'une mise en page à l'autre, le papier et la caméra glissent au lieu de
 * sauter. Chaque coupe change le cadrage (un léger zoom une fois sur deux),
 * et rien ne reste plus de 4 s sans changer. Les sous-titres mot à mot
 * suivent le montage, mettent en valeur les mots clés, et se taisent quand la
 * planche écrit déjà ce qui est dit. La marque fournit couleurs, police,
 * filigrane et carton de fin ; elle n'impose aucune construction. Musique et
 * bruitages sont posés ensuite (`lib/take-edit.ts`). Tout est éditable : ce
 * sont des éléments ordinaires. Fonction pure.
 */

import { boardPaletteOf } from "./board-palette";
import { boardTracks, compileBoard, type CompiledBoard } from "./board";
import { accentList, applyBrandTheme, SHORT_SAFE_ZONE, type BrandTheme } from "./brand";
import { CAPTION_STYLE, createProject, uid } from "./edit";
import { contrastRatio, distinctColors, opaqueHex } from "./legibility";
import { captionCenterBounds, captionLineCount, measuredPlan } from "./measured-style";
import { wordGroups } from "./render";
import { sfxItem, sfxSeries, typingSfx } from "./sfx";
import { MAX_STILL_MS, beatSpans, captionHideSpans, planSignature, type BeatSpan, type TakeLayout, type TakePlan } from "./take-plan";
import { sceneBoard } from "./take-scenes";
import type { KeptSegment } from "./take-cut";
import {
  ASPECTS,
  type AspectPreset,
  type AudioItem,
  type ClipItem,
  type ClipProject,
  type MediaSource,
  type TextItem,
  type TimedWord,
  type Track,
  type Transform,
  type VideoItem,
} from "./types";

/** Boîte dans le cadre, en parts du cadre (coin haut gauche). */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TakeGeometry {
  orientation: "vertical" | "horizontal";
  /** Planche et caméra en mise en page « split ». */
  board: Box;
  camera: Box;
  /** Où écrire sur la planche : hors des zones couvertes par l'interface des plateformes. */
  content: Box;
  /** Centre vertical des sous-titres en « split » (la couture) et en plein cadre. */
  captionSplitY: number;
  captionFullY: number;
  /** Centre vertical des sous-titres sur la planche seule. */
  captionBoardY: number;
}

/**
 * Mise en page d'un format. En vertical, la planche occupe le haut (60 % d'un
 * short, comme une feuille posée au-dessus de la caméra) ; en 16:9, la
 * gauche. Le texte de la planche reste sous la barre du haut d'un short.
 */
export function takeGeometry(aspect: AspectPreset): TakeGeometry {
  if (aspect === "16:9") {
    return {
      orientation: "horizontal",
      board: { left: 0, top: 0, width: 0.56, height: 1 },
      camera: { left: 0.56, top: 0, width: 0.44, height: 1 },
      content: { left: 0.05, top: 0.1, width: 0.46, height: 0.62 },
      captionSplitY: 0.84,
      captionFullY: 0.84,
      captionBoardY: 0.84,
    };
  }
  const seam = aspect === "9:16" ? 0.6 : aspect === "4:5" ? 0.56 : 0.5;
  const top = aspect === "9:16" ? SHORT_SAFE_ZONE.top + 0.01 : 0.07;
  return {
    orientation: "vertical",
    board: { left: 0, top: 0, width: 1, height: seam },
    camera: { left: 0, top: seam, width: 1, height: 1 - seam },
    content: { left: 0.07, top, width: 0.86, height: seam - top - 0.08 },
    captionSplitY: seam,
    captionFullY: aspect === "9:16" ? 0.67 : 0.78,
    // Planche seule : sous ce qui est écrit, au-dessus de la bande du bas des plateformes.
    captionBoardY: aspect === "9:16" ? 0.71 : 0.8,
  };
}

/**
 * Cadrage de la caméra dans `region` : la vidéo garde ses proportions,
 * agrandie de `zoom` au-delà de ce qu'il faut pour couvrir la région, et
 * décalée pour mettre le visage (`focus`, en parts de l'image source) au
 * centre horizontal et aux deux cinquièmes de la hauteur, sans jamais
 * découvrir un bord. Ce qui dépasse de la région est caché par la planche
 * (posée au-dessus) ou par le bord du cadre. Rendu en `cover` sur une boîte
 * aux proportions de la source : rien n'est coupé dans la boîte elle-même.
 */
export function cameraTransform(
  source: { width?: number; height?: number },
  focus: { x: number; y: number } | null | undefined,
  region: Box,
  frame: { width: number; height: number },
  zoom = 1
): Transform {
  const sw = source.width || 16;
  const sh = source.height || 9;
  const rw = region.width * frame.width;
  const rh = region.height * frame.height;
  const scale = Math.max(rw / sw, rh / sh) * Math.max(1, zoom);
  const dw = sw * scale;
  const dh = sh * scale;
  const fx = focus ? Math.min(1, Math.max(0, focus.x)) : 0.5;
  const fy = focus ? Math.min(1, Math.max(0, focus.y)) : 0.4;
  const regionX = region.left * frame.width;
  const regionY = region.top * frame.height;
  // Centre voulu de la boîte, borné pour qu'elle couvre toute la région.
  const cx = Math.min(regionX + dw / 2, Math.max(regionX + rw - dw / 2, regionX + rw / 2 + (0.5 - fx) * dw));
  const cy = Math.min(regionY + dh / 2, Math.max(regionY + rh - dh / 2, regionY + rh * 0.4 + (0.5 - fy) * dh));
  return { x: cx / frame.width, y: cy / frame.height, width: dw / frame.width, height: dh / frame.height, rotation: 0, opacity: 1 };
}

// ─── Entrée ──────────────────────────────────────────────────────

export interface TakeSource {
  /** Média lu par les plans (déjà accéléré si la vitesse n'est pas 1). */
  source: MediaSource;
  /** Visage repéré, en parts de l'image ; absent : cadrage au centre. */
  focus?: { x: number; y: number } | null;
}

export interface TakeProjectInput {
  name: string;
  aspect: AspectPreset;
  takes: TakeSource[];
  /** Passages gardés, en images (le temps de la source est celui du média lu). */
  segments: KeptSegment[];
  /** Mots du montage, en ms du montage. */
  words: TimedWord[];
  plan: TakePlan;
  /** Logos trouvés, par rang du temps fort dans `plan.beats`. */
  logos?: Map<string, MediaSource>;
  theme?: BrandTheme | null;
  /** Phrases dites, pour rédiger les textes de publication. */
  script?: string[];
}

/** Zooms de la caméra, une coupe sur deux : en plein cadre, puis dans la carte du bas. */
const FULL_ZOOMS = [1, 1.14];
const CARD_ZOOMS = [1.2, 1.36];

interface CameraPiece {
  segment: KeptSegment;
  start: number;
  end: number;
  layout: TakeLayout;
  zoomStep: number;
}

export const layoutAt = (spans: BeatSpan[], frame: number) => spans.find((span) => frame >= span.start && frame < span.end)?.beat.layout ?? "split";

/** Plans de caméra : chaque passage, coupé là où la mise en page change. */
export function cameraPieces(segments: KeptSegment[], spans: BeatSpan[]): CameraPiece[] {
  const pieces: CameraPiece[] = [];
  const changes = spans.slice(1).map((span) => span.start);
  segments.forEach((segment, index) => {
    const end = segment.start + segment.duration;
    const cuts = [segment.start, ...changes.filter((frame) => frame > segment.start && frame < end), end];
    for (let at = 0; at + 1 < cuts.length; at++) {
      pieces.push({ segment, start: cuts[at], end: cuts[at + 1], layout: layoutAt(spans, cuts[at]), zoomStep: index % 2 });
    }
  });
  return pieces;
}

/**
 * Aucun moment de plus de `MAX_STILL_MS` sans changement : le plan de
 * caméra qui couvre le milieu d'un trop long moment est coupé là, et sa
 * seconde moitié change de zoom.
 */
export function fillCameraCadence(pieces: CameraPiece[], changeFrames: number[], totalFrames: number, fps: number): CameraPiece[] {
  const limit = Math.round((MAX_STILL_MS / 1000) * fps);
  let result = pieces;
  for (let pass = 0; pass < 6; pass++) {
    const points = [...new Set([0, ...changeFrames, ...result.map((piece) => piece.start), totalFrames])].filter((frame) => frame <= totalFrames).sort((a, b) => a - b);
    let split = false;
    for (let index = 1; index < points.length; index++) {
      const gap = points[index] - points[index - 1];
      if (gap <= limit) continue;
      const at = points[index - 1] + Math.round(gap / 2);
      const position = result.findIndex((piece) => at > piece.start && at < piece.end);
      if (position < 0) continue;
      const piece = result[position];
      result = [...result.slice(0, position), { ...piece, end: at }, { ...piece, start: at, zoomStep: 1 - piece.zoomStep }, ...result.slice(position + 1)];
      split = true;
    }
    if (!split) break;
  }
  return alternateZooms(result);
}

/** Chaque plan change de cadrage par rapport au précédent de même mise en page : zoom une fois sur deux. */
export function alternateZooms(pieces: CameraPiece[]): CameraPiece[] {
  const result: CameraPiece[] = [];
  for (const piece of pieces) {
    const previous = result[result.length - 1];
    result.push({ ...piece, zoomStep: previous && previous.layout === piece.layout ? 1 - previous.zoomStep : 0 });
  }
  return result;
}

// ─── Sous-titres ─────────────────────────────────────────────────

/**
 * Sous-titres mot à mot : un élément par plage de même mise en page, hors
 * des plages où une planche écrit déjà ce qui est dit. Les mots d'un
 * élément sont en ms depuis son début ; les mots mis en valeur gardent leur
 * rang.
 */
export function takeCaptions(words: TimedWord[], spans: BeatSpan[], hidden: { start: number; end: number }[], geometry: TakeGeometry, project: ClipProject, emphasis: number[], theme: BrandTheme | null | undefined): TextItem[] {
  const fps = project.fps;
  const total = spans.length ? spans[spans.length - 1].end : 0;
  const cuts = new Set<number>([0, total]);
  spans.forEach((span, index) => {
    if (index > 0 && span.beat.layout !== spans[index - 1].beat.layout) cuts.add(span.start);
  });
  for (const window of hidden) {
    cuts.add(window.start);
    cuts.add(window.end);
  }
  const points = [...cuts].filter((frame) => frame >= 0 && frame <= total).sort((a, b) => a - b);
  const vertical = project.height > project.width;
  const plan = theme?.pace === "measured" ? measuredPlan(theme.measuredStyle, ASPECTS[project.aspect], SHORT_SAFE_ZONE) : null;
  const size = plan?.caption?.size ?? (vertical ? 0.046 : 0.06);
  const fullGroup = plan?.caption?.groupSize ?? (vertical ? 3 : 5);
  const emphasized = new Set(emphasis);
  const items: TextItem[] = [];
  for (let index = 0; index + 1 < points.length; index++) {
    const start = points[index];
    const end = points[index + 1];
    if (end - start < 1) continue;
    if (hidden.some((window) => start >= window.start && end <= window.end)) continue;
    const startMs = (start / fps) * 1000;
    const endMs = (end / fps) * 1000;
    const chosen = words.map((word, wordIndex) => ({ word, wordIndex })).filter(({ word }) => word.startMs >= startMs && word.startMs < endMs);
    if (chosen.length === 0) continue;
    const local = chosen.map(({ word }) => ({ text: word.text, startMs: Math.max(0, Math.round(word.startMs - startMs)), endMs: Math.max(1, Math.round(Math.min(word.endMs, endMs) - startMs)) }));
    const layout = layoutAt(spans, start);
    let y = layout === "full" ? geometry.captionFullY : layout === "board" ? geometry.captionBoardY : geometry.captionSplitY;
    // Sur la couture, entre planche et caméra : deux mots à la fois au plus, pour ne déborder ni sur l’une ni sur l’autre.
    const groupSize = layout === "split" && vertical ? Math.min(2, fullGroup) : fullGroup;
    const groups = wordGroups(local, groupSize).map((group) => group.map((entry) => local[entry].text).join(" "));
    if (vertical) {
      const bounds = captionCenterBounds(size, SHORT_SAFE_ZONE, captionLineCount(groups, size, project));
      y = Math.min(bounds.max, Math.max(bounds.min, y));
    }
    const indices = chosen.flatMap(({ wordIndex }, position) => (emphasized.has(wordIndex) ? [position] : []));
    items.push({
      id: uid("x-"),
      type: "text",
      start,
      duration: end - start,
      text: local.map((word) => word.text).join(" "),
      style: { ...structuredClone(CAPTION_STYLE), size },
      karaoke: { words: local, offset: 0, highlight: "#facc15", groupSize, ...(indices.length ? { emphasis: { indices, color: "#facc15" } } : {}) },
      transform: { x: 0.5, y, width: vertical ? 0.86 : 0.8, height: 0.16, rotation: 0, opacity: 1 },
      animIn: { kind: "none", frames: 6 },
      animOut: { kind: "none", frames: 6 },
      label: "Sous-titres",
    });
  }
  return items;
}

/**
 * Couleur des mots mis en valeur, une fois la marque appliquée : une teinte
 * de la marque lisible sur le contour des sous-titres (4,5:1) et distincte
 * du texte comme du mot prononcé ; à défaut, celle du mot prononcé.
 */
export function emphasisColor(caption: TextItem, theme: BrandTheme | null | undefined): string {
  const karaoke = caption.karaoke!;
  const ground = opaqueHex(caption.style.stroke?.color) ?? "#000000";
  const candidates = [...accentList(theme ?? null), "#facc15", "#38bdf8", "#f472b6"];
  for (const color of candidates) {
    const hex = opaqueHex(color);
    if (!hex) continue;
    if (contrastRatio(hex, ground) >= 4.5 && distinctColors(hex, karaoke.highlight) && distinctColors(hex, caption.style.color)) return hex;
  }
  return karaoke.highlight;
}

// ─── Projet ──────────────────────────────────────────────────────

/**
 * Pistes d'éléments qui se chevauchent dans le temps : chaque élément va sur
 * la première piste libre à son début (« Planche », « Planche 2 »…). L'ordre
 * des éléments donne l'ordre des pistes : le premier posé reste au-dessus.
 */
export function lanes(items: ClipItem[], name: string): Track[] {
  const tracks: Track[] = [];
  for (const item of [...items].sort((a, b) => a.start - b.start)) {
    let track = tracks.find((entry) => entry.items.every((other) => other.start + other.duration <= item.start || other.start >= item.start + item.duration));
    if (!track) {
      track = { id: uid("t-"), kind: "visual", name: tracks.length ? `${name} ${tracks.length + 1}` : name, items: [] };
      tracks.push(track);
    }
    track.items.push(item);
  }
  return tracks;
}

/**
 * Sons de la planche : les tics des compteurs, et un coup sourd quand un
 * chiffre se pose ou qu'une croix tombe (une seconde au moins entre deux
 * coups sourds, six au plus sur la vidéo). Une piste par son : leurs écarts
 * minimaux font qu'aucun ne chevauche le suivant.
 */
export function boardSounds(boards: CompiledBoard[], fps: number): Track[] {
  const cues = boards.flatMap((board) => board.cues);
  const ticks = sfxSeries("tick", cues.filter((cue) => cue.sound === "tick").map((cue) => cue.frame), fps, { label: "Bruitage – compteur", minGapMs: 90 });
  const thuds = sfxSeries("thud", cues.filter((cue) => cue.sound === "thud").map((cue) => cue.frame), fps, { label: "Bruitage – temps posé", minGapMs: 1000, max: 6 });
  // La frappe d'une commande ou d'une demande, sous les lettres qui s'écrivent ; deux frappes ne se chevauchent pas.
  const typing: AudioItem[] = [];
  for (const cue of cues.filter((entry) => entry.sound === "type").sort((a, b) => a.frame - b.frame)) {
    const last = typing[typing.length - 1];
    const from = Math.max(cue.frame, last ? last.start + last.duration : 0);
    typing.push(...typingSfx(from, (cue.frames ?? 0) - (from - cue.frame), fps, "Bruitage – frappe"));
  }
  return [
    ...(typing.length ? [{ id: uid("t-"), kind: "audio" as const, name: "Bruitages – frappe", items: typing }] : []),
    ...(ticks.length ? [{ id: uid("t-"), kind: "audio" as const, name: "Bruitages – compteurs", items: ticks }] : []),
    ...(thuds.length ? [{ id: uid("t-"), kind: "audio" as const, name: "Bruitages – planche", items: thuds }] : []),
  ];
}

/**
 * Planches d'un plan : une par tableau qui en a une, dans la palette et avec
 * la mascotte de la marque ; le papier glisse depuis la mise en page d'avant.
 * Commun au montage d'une prise et à celui d'une voix off.
 */
export function planBoards(input: {
  spans: BeatSpan[];
  plan: TakePlan;
  words: TimedWord[];
  fps: number;
  frame: { width: number; height: number };
  geometry: TakeGeometry;
  logos?: Map<string, MediaSource>;
  theme?: BrandTheme | null;
}): CompiledBoard[] {
  const { spans, fps, frame, geometry } = input;
  const palette = boardPaletteOf(input.theme ? input.theme.palette : null);
  // La mascotte n'est plus posée d'office : elle réagit sur la planche, quand le plan le demande.
  const mascot = input.theme?.mascot ? { library: input.theme.mascot.library, reactions: input.theme.mascot.reactions } : undefined;
  const usedPoses: string[] = [];
  const boards: CompiledBoard[] = [];
  spans.forEach((span, index) => {
    const spec = sceneBoard(span, {
      fps,
      frame,
      geometry,
      logos: input.logos,
      palette,
      previousLayout: index > 0 ? spans[index - 1].beat.layout : undefined,
      index: input.plan.beats.indexOf(span.beat),
      opening: index === 0,
      mascot,
      usedPoses,
    });
    if (spec) boards.push(compileBoard(spec, { fps, frame, words: input.words, palette }));
  });
  return boards;
}

/** Région de la caméra d'une mise en page : le cadre entier en plein cadre, la carte du bas sinon (cachée par le papier sur la planche seule). */
export const cameraRegion = (geometry: TakeGeometry, layout: TakeLayout): Box => (layout === "full" ? { left: 0, top: 0, width: 1, height: 1 } : geometry.camera);

/** Durée du glissement de la caméra et du papier d'une mise en page à l'autre. */
export const LAYOUT_GLIDE_SECONDS = 0.4;

/**
 * Projet d'une prise montée. Pistes, de haut en bas : « Sous-titres », les
 * pistes de la planche (traits, devant, textes, images, cartes, liaisons,
 * papier), « Principale » (la caméra), puis « Voix – prise » (le son de la
 * prise, lié aux plans). La marque habille le tout (filigrane, carton de
 * fin, police, couleurs et lisibilité), sans mascotte.
 */
export function buildTakeProject(input: TakeProjectInput): ClipProject {
  const base = createProject(input.name.slice(0, 200) || "Prise montée", input.aspect);
  const fps = base.fps;
  const frame = { width: base.width, height: base.height };
  const geometry = takeGeometry(input.aspect);
  const last = input.segments[input.segments.length - 1];
  const totalFrames = last ? last.start + last.duration : fps;
  const spans = beatSpans(input.plan, input.words, totalFrames, fps);
  const boards = planBoards({ spans, plan: input.plan, words: input.words, fps, frame, geometry, logos: input.logos, theme: input.theme });
  const changes = boards.flatMap((board) => board.changes);

  // Caméra : un plan par passage gardé, recadré à chaque coupe, sans moment figé de plus de 4 s.
  const pieces = fillCameraCadence(cameraPieces(input.segments, spans), changes, totalFrames, fps);
  const videos: VideoItem[] = [];
  const voices: AudioItem[] = [];
  let previous: { layout: TakeLayout; transform: Transform; end: number } | null = null;
  for (const piece of pieces) {
    const take = input.takes[piece.segment.take];
    if (!take) continue;
    const zoom = (piece.layout === "full" ? FULL_ZOOMS : CARD_ZOOMS)[piece.zoomStep];
    const transform = cameraTransform(take.source, take.focus, cameraRegion(geometry, piece.layout), frame, zoom);
    const video: VideoItem = {
      id: uid("v-"),
      type: "video",
      start: piece.start,
      duration: piece.end - piece.start,
      source: take.source,
      fit: "cover",
      trimStart: piece.segment.sourceStart + (piece.start - piece.segment.start),
      volume: 1,
      radius: 0,
      transform,
      animIn: { kind: "none", frames: 6 },
      animOut: { kind: "none", frames: 6 },
      label: piece.layout === "full" ? "Caméra – plein cadre" : piece.layout === "board" ? "Caméra – sous la planche" : "Caméra",
    };
    // La caméra passe du plein cadre à la carte du bas (ou l'inverse) sans couper : elle glisse d'un cadre à l'autre.
    const glide = previous !== null && previous.end === piece.start && previous.layout !== piece.layout && (previous.layout === "full" || piece.layout === "full");
    if (previous && glide) {
      video.transform = { ...previous.transform };
      video.keys = [{ at: 0, frames: Math.round(LAYOUT_GLIDE_SECONDS * fps), x: transform.x, y: transform.y, width: transform.width, height: transform.height, ease: "smooth" }];
    }
    const voice: AudioItem = {
      id: uid("a-"),
      type: "audio",
      start: video.start,
      duration: video.duration,
      source: take.source,
      trimStart: video.trimStart,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      linkedVideoId: video.id,
      label: "Prise",
    };
    video.audioLinkId = voice.id;
    videos.push(video);
    voices.push(voice);
    previous = { layout: piece.layout, transform, end: piece.end };
  }

  const project0: ClipProject = { ...base, tracks: [] };
  const hidden = captionHideSpans(spans, input.words, fps);
  const captions = takeCaptions(input.words, spans, hidden, geometry, project0, input.plan.emphasis, input.theme);

  const tracks: Track[] = [
    { id: uid("t-"), kind: "visual", name: "Sous-titres", items: captions },
    // Une piste ne porte qu'un élément à la fois (l'éditeur le suppose) : la planche se range par calques.
    ...boardTracks(boards),
    { id: uid("t-"), kind: "visual", name: "Principale", items: videos },
    { id: uid("t-"), kind: "audio", name: "Voix – prise", items: voices },
    ...boardSounds(boards, fps),
  ];
  const brief: NonNullable<ClipProject["brief"]> = {
    prompt: `Prise de parole montée : ${input.plan.hook}`.slice(0, 4000),
    title: input.plan.hook.slice(0, 200),
    script: (input.script ?? []).slice(0, 100).map((line) => line.slice(0, 2000)),
    montage: planSignature(input.plan).slice(0, 400),
  };
  return dressBoardProject({ ...base, tracks, brief, origin: "take" }, input.theme);
}

/**
 * Habillage d'un montage en planches : la marque donne filigrane, carton de
 * fin, police, couleurs et lisibilité, sans poser sa mascotte d'office (elle
 * n'apparaît que sur la planche, quand le plan la fait réagir) ; puis les
 * mots mis en valeur prennent une couleur de la marque lisible sur le
 * contour des sous-titres.
 */
export function dressBoardProject(project: ClipProject, theme: BrandTheme | null | undefined): ClipProject {
  let dressed = project;
  if (theme) {
    const { mascot: _mascot, ...rest } = theme;
    dressed = applyBrandTheme(dressed, rest);
  }
  return {
    ...dressed,
    tracks: dressed.tracks.map((track) => ({
      ...track,
      items: track.items.map((item) => (item.type === "text" && item.karaoke?.emphasis ? { ...item, karaoke: { ...item.karaoke, emphasis: { ...item.karaoke.emphasis, color: emphasisColor(item, theme) } } } : item)),
    })),
  };
}

/**
 * Bruitages des vrais temps forts : un impact sur l'accroche, la révélation
 * sur les temps forts marqués `payoff` (deux au plus), à une seconde l'un de
 * l'autre au moins. Jamais de bruit de mouvement.
 */
export function takeBeatSounds(plan: TakePlan, words: TimedWord[], totalFrames: number, fps: number): AudioItem[] {
  const spans = beatSpans(plan, words, totalFrames, fps);
  const sounds: AudioItem[] = [sfxItem("impact", 0, fps, "Bruitage – accroche")];
  for (const span of spans) {
    if (!span.beat.payoff || span.start === 0) continue;
    if (sounds.some((sound) => Math.abs(sound.start - span.start) < fps)) continue;
    sounds.push(sfxItem("reveal", span.start, fps, "Bruitage – temps fort"));
    if (sounds.length >= 3) break;
  }
  return sounds;
}
