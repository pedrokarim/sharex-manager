/**
 * « Monter ma prise » (dossier 01, V6) : le projet monté.
 *
 * La prise coupée (`take-cut.ts`) devient une suite de plans vidéo, un par
 * passage gardé, avec leur son détaché sur une piste « Voix » (la musique
 * s'efface dessous, et la vidéo et son son restent liés dans l'éditeur). Le
 * plan des temps forts (`take-plan.ts`) dispose la page :
 *
 * - **split** : une planche aux couleurs de la marque en haut (en 16:9, à
 *   gauche), la caméra en bas, cadrée sur le visage ;
 * - **full** : la caméra plein cadre, pour une phrase directe de 5 s ou plus.
 *
 * Chaque coupe change le cadrage (un léger zoom une fois sur deux) : le saut
 * de la coupe devient un effet voulu, et rien ne reste plus de 4 s sans
 * changer. Les sous-titres mot à mot suivent le montage, se posent sur la
 * couture entre planche et caméra, mettent en valeur les mots clés, et se
 * taisent quand la planche écrit déjà ce qui est dit. Musique et bruitages
 * sont posés ensuite (`lib/take-edit.ts`). Tout est éditable : ce sont des
 * éléments ordinaires. Fonction pure.
 */

import { accentList, applyBrandTheme, SHORT_SAFE_ZONE, themedTextStyle, type BrandTheme } from "./brand";
import { CAPTION_STYLE, createProject, uid } from "./edit";
import { contrastRatio, distinctColors, opaqueHex } from "./legibility";
import { captionCenterBounds, captionLineCount, measuredPlan } from "./measured-style";
import { wordGroups } from "./render";
import { sfxItem } from "./sfx";
import { MAX_STILL_MS, beatSpans, captionHideSpans, type BeatSpan, type TakeBoard, type TakePlan } from "./take-plan";
import type { KeptSegment } from "./take-cut";
import {
  ASPECTS,
  type AspectPreset,
  type AudioItem,
  type ClipItem,
  type ClipProject,
  type ImageItem,
  type MediaSource,
  type ShapeItem,
  type TextItem,
  type TextRole,
  type ThemeHint,
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
  logos?: Map<number, MediaSource>;
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
  layout: "split" | "full";
  zoomStep: number;
}

const layoutAt = (spans: BeatSpan[], frame: number) => spans.find((span) => frame >= span.start && frame < span.end)?.beat.layout ?? "split";

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

// ─── Planche ─────────────────────────────────────────────────────

const NO_ANIM = { kind: "none", frames: 6 } as const;

function text(content: string, start: number, duration: number, box: { x: number; y: number; width: number; height: number }, size: number, role: TextRole, hint: Omit<ThemeHint, "role"> = {}, align: "left" | "center" = "center"): TextItem {
  return {
    id: uid("x-"),
    type: "text",
    start,
    duration: Math.max(1, duration),
    text: content,
    // Style du rôle dans le thème par défaut ; une marque le remplace ensuite par le sien.
    style: themedTextStyle(null, { role, ...hint }, { size, align }),
    theme: { role, ...hint },
    transform: { ...box, rotation: 0, opacity: 1 },
    animIn: { kind: "pop", frames: 8 },
    animOut: { ...NO_ANIM },
    fit: "shrink",
  };
}

function shape(start: number, duration: number, box: Box, paint: ThemeHint["paint"], radius = 0): ShapeItem {
  return {
    id: uid("s-"),
    type: "shape",
    shape: "rect",
    start,
    duration: Math.max(1, duration),
    fill: paint === "surface" ? "#ffffff" : "#1f1b2e",
    radius,
    theme: { paint },
    transform: { x: box.left + box.width / 2, y: box.top + box.height / 2, width: box.width, height: box.height, rotation: 0, opacity: 1 },
    animIn: { ...NO_ANIM },
    animOut: { ...NO_ANIM },
  };
}

/**
 * Taille d'une ligne de liste : deux lignes au plus dans sa hauteur, et
 * assez petite pour que le texte tienne sur ces deux lignes (une lettre
 * grasse fait environ 0,62 em de large, police de la marque comprise). Jamais
 * plus grande que 5,6 % de la hauteur, ni plus petite que 3,2 %.
 */
export function listRowSize(content: string, rowHeight: number, width: number, frame: { width: number; height: number }): number {
  const byHeight = (rowHeight * 0.92) / (2 * 1.3);
  const byWidth = (width * frame.width * 2) / (Math.max(1, content.length) * 0.62 * frame.height);
  return Math.max(0.032, Math.min(0.056, byHeight, byWidth));
}

/** Image du montage où un mot est prononcé, bornée à la plage. */
const wordFrame = (words: TimedWord[], index: number | undefined, span: BeatSpan, fps: number, fallback: number) => {
  const word = index !== undefined ? words[index] : undefined;
  const frame = word ? Math.floor((word.startMs / 1000) * fps) : fallback;
  return Math.min(span.end - 1, Math.max(span.start, frame));
};

/**
 * Éléments d'une planche, posés dans la zone d'écriture. Le premier temps
 * fort (l'accroche) n'a aucune entrée animée : il se lit dès la première
 * image. Les éléments d'une liste, la valeur « après » d'un avant / après ou
 * le mot mis en valeur arrivent sur le mot qui les dit.
 */
export function boardItems(board: TakeBoard, span: BeatSpan, geometry: TakeGeometry, frame: { width: number; height: number }, fps: number, words: TimedWord[], logo: MediaSource | undefined, opening: boolean): ClipItem[] {
  const area = geometry.content;
  const cx = area.left + area.width / 2;
  const cy = area.top + area.height / 2;
  const duration = span.end - span.start;
  const vertical = geometry.orientation === "vertical";
  const big = vertical ? 1 : 0.85;
  const items: ClipItem[] = [];
  const at = (frameIndex: number) => ({ start: frameIndex, duration: span.end - frameIndex });
  const later = (delaySeconds: number) => Math.min(span.end - 1, span.start + Math.round(delaySeconds * fps));

  switch (board.kind) {
    case "title":
    case "quote": {
      const hasEmphasis = Boolean(board.emphasis) && board.kind === "quote";
      const main = text(board.text, span.start, duration, { x: cx, y: hasEmphasis ? area.top + area.height * 0.32 : cy, width: area.width, height: area.height * (hasEmphasis ? 0.5 : 0.8) }, (board.kind === "title" ? 0.068 : 0.06) * big, "title");
      items.push(main);
      if (hasEmphasis) {
        const wordIndex = words.findIndex((word) => word.text.toLowerCase().includes(board.emphasis!.split(" ")[0].toLowerCase()));
        const start = opening ? span.start : wordFrame(words, wordIndex >= 0 ? wordIndex : undefined, span, fps, later(0.7));
        const emphasis = text(board.emphasis!, start, span.end - start, { x: cx, y: area.top + area.height * 0.74, width: area.width, height: area.height * 0.34 }, 0.1 * big, "title", { paint: "highlight" });
        emphasis.animIn = { kind: "highlight-in", frames: Math.round(0.8 * fps) };
        items.push(emphasis);
      }
      break;
    }
    case "counter": {
      const value = text(board.value, span.start, duration, { x: cx, y: area.top + area.height * 0.42, width: area.width, height: area.height * 0.42 }, 0.15 * big, "title", { paint: "highlight" });
      value.animIn = { kind: "count-up-pop", frames: Math.round(1.3 * fps) };
      items.push(value);
      if (board.label) items.push(text(board.label, span.start, duration, { x: cx, y: area.top + area.height * 0.78, width: area.width, height: area.height * 0.22 }, 0.05 * big, "subtitle"));
      break;
    }
    case "logo": {
      if (logo) {
        const side = Math.min(area.height * 0.5, area.width * 0.55);
        const image: ImageItem = {
          id: uid("i-"),
          type: "image",
          start: span.start,
          duration,
          source: logo,
          fit: "contain",
          motion: "none",
          radius: 0.16,
          label: `Logo – ${board.name}`,
          transform: { x: cx, y: area.top + area.height * 0.36, width: (side * frame.height) / frame.width, height: side, rotation: 0, opacity: 1 },
          animIn: { kind: "pop", frames: 9 },
          animOut: { ...NO_ANIM },
        };
        items.push(image);
        items.push(text(board.name, span.start, duration, { x: cx, y: area.top + area.height * 0.78, width: area.width, height: area.height * 0.2 }, 0.065 * big, "title"));
        if (board.caption) items.push(text(board.caption, later(0.5), span.end - later(0.5), { x: cx, y: area.top + area.height * 0.94, width: area.width, height: area.height * 0.12 }, 0.038 * big, "subtitle"));
      } else {
        // Pas de logo officiel trouvé : le nom, en grand, plutôt qu'un faux.
        items.push(text(board.name, span.start, duration, { x: cx, y: cy, width: area.width, height: area.height * 0.5 }, 0.09 * big, "title", { paint: "highlight" }));
        if (board.caption) items.push(text(board.caption, span.start, duration, { x: cx, y: area.top + area.height * 0.8, width: area.width, height: area.height * 0.2 }, 0.045 * big, "subtitle"));
      }
      break;
    }
    case "list": {
      const rows = board.items.length;
      const titleHeight = board.title ? area.height * 0.18 : 0;
      if (board.title) items.push(text(board.title, span.start, duration, { x: cx, y: area.top + titleHeight / 2, width: area.width, height: titleHeight }, 0.05 * big, "label", { accent: 0 }));
      const rowHeight = (area.height - titleHeight) / rows;
      board.items.forEach((entry, index) => {
        const start = opening && index === 0 ? span.start : wordFrame(words, entry.word, span, fps, later(0.4 + index * 0.9));
        const row = text(`${index + 1}. ${entry.text}`, start, span.end - start, { x: cx, y: area.top + titleHeight + rowHeight * (index + 0.5), width: area.width, height: rowHeight * 0.9 }, listRowSize(`${index + 1}. ${entry.text}`, rowHeight, area.width, frame), "subtitle", {}, "left");
        row.animIn = { kind: "slide-left", frames: 8 };
        items.push(row);
      });
      break;
    }
    case "compare": {
      const gap = area.width * 0.06;
      const cardWidth = (area.width - gap) / 2;
      const card = (side: 0 | 1): Box => ({ left: area.left + side * (cardWidth + gap), top: area.top + area.height * 0.12, width: cardWidth, height: area.height * 0.76 });
      const afterStart = opening ? span.start : wordFrame(words, board.after.word, span, fps, later(0.9));
      for (const side of [0, 1] as const) {
        const box = card(side);
        const entry = side === 0 ? board.before : board.after;
        const start = side === 0 ? span.start : afterStart;
        const panel = shape(start, span.end - start, box, "surface", 0.08);
        panel.animIn = side === 0 ? { ...NO_ANIM } : { kind: "pop", frames: 8 };
        items.push(panel);
        items.push(text(entry.label, start, span.end - start, { x: box.left + box.width / 2, y: box.top + box.height * 0.22, width: box.width * 0.86, height: box.height * 0.2 }, 0.04 * big, "label", side === 1 ? { accent: 0 } : {}));
        items.push(text(entry.value, start, span.end - start, { x: box.left + box.width / 2, y: box.top + box.height * 0.62, width: box.width * 0.9, height: box.height * 0.42 }, 0.085 * big, "title"));
      }
      break;
    }
  }
  if (opening) for (const item of items) if ("animIn" in item) item.animIn = { ...NO_ANIM };
  return items;
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
    let y = layout === "full" ? geometry.captionFullY : geometry.captionSplitY;
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

/** Instants des changements à l'image (planches, éléments qui arrivent), hors caméra et sous-titres. */
function boardChanges(items: ClipItem[]): number[] {
  return items.map((item) => item.start);
}

/**
 * Projet d'une prise montée. Pistes, de haut en bas : « Sous-titres »,
 * « Planche », « Planche – fond », « Principale » (la caméra), puis « Voix –
 * prise » (le son de la prise, lié aux plans). La marque habille le tout
 * (filigrane, carton de fin, styles et lisibilité), sans mascotte.
 */
export function buildTakeProject(input: TakeProjectInput): ClipProject {
  const base = createProject(input.name.slice(0, 200) || "Prise montée", input.aspect);
  const fps = base.fps;
  const frame = { width: base.width, height: base.height };
  const geometry = takeGeometry(input.aspect);
  const last = input.segments[input.segments.length - 1];
  const totalFrames = last ? last.start + last.duration : fps;
  const spans = beatSpans(input.plan, input.words, totalFrames, fps);

  // Planches, une par temps fort en « split ».
  const boardTexts: ClipItem[] = [];
  const boardGrounds: ClipItem[] = [];
  spans.forEach((span, index) => {
    if (span.beat.layout !== "split" || !span.beat.board) return;
    const ground = shape(span.start, span.end - span.start, geometry.board, "plate");
    ground.label = "Planche";
    boardGrounds.push(ground);
    const beatIndex = input.plan.beats.indexOf(span.beat);
    boardTexts.push(...boardItems(span.beat.board, span, geometry, frame, fps, input.words, input.logos?.get(beatIndex), index === 0));
  });

  // Caméra : un plan par passage gardé, recadré à chaque coupe, sans moment figé de plus de 4 s.
  const pieces = fillCameraCadence(cameraPieces(input.segments, spans), boardChanges([...boardTexts, ...boardGrounds]), totalFrames, fps);
  const videos: VideoItem[] = [];
  const voices: AudioItem[] = [];
  for (const piece of pieces) {
    const take = input.takes[piece.segment.take];
    if (!take) continue;
    const region: Box = piece.layout === "full" ? { left: 0, top: 0, width: 1, height: 1 } : geometry.camera;
    const zoom = (piece.layout === "full" ? FULL_ZOOMS : CARD_ZOOMS)[piece.zoomStep];
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
      transform: cameraTransform(take.source, take.focus, region, frame, zoom),
      animIn: { ...NO_ANIM },
      animOut: { ...NO_ANIM },
      label: piece.layout === "full" ? "Caméra – plein cadre" : "Caméra",
    };
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
  }

  const project0: ClipProject = { ...base, tracks: [] };
  const hidden = captionHideSpans(spans, input.words, fps);
  const captions = takeCaptions(input.words, spans, hidden, geometry, project0, input.plan.emphasis, input.theme);

  const tracks: Track[] = [
    { id: uid("t-"), kind: "visual", name: "Sous-titres", items: captions },
    // Une piste ne porte qu'un élément à la fois (l'éditeur le suppose) : les éléments d'une planche se rangent sur plusieurs pistes.
    ...lanes(boardTexts.filter((item) => item.type !== "shape"), "Planche"),
    ...lanes(boardTexts.filter((item) => item.type === "shape"), "Planche – cartes"),
    { id: uid("t-"), kind: "visual", name: "Planche – fond", items: boardGrounds },
    { id: uid("t-"), kind: "visual", name: "Principale", items: videos },
    { id: uid("t-"), kind: "audio", name: "Voix – prise", items: voices },
  ];
  const brief: NonNullable<ClipProject["brief"]> = {
    prompt: `Prise de parole montée : ${input.plan.hook}`.slice(0, 4000),
    title: input.plan.hook.slice(0, 200),
    script: (input.script ?? []).slice(0, 100).map((line) => line.slice(0, 2000)),
  };
  let project: ClipProject = { ...base, tracks, brief, origin: "take" };
  // La mascotte n'a pas sa place sur une vidéo filmée : la marque habille sans elle.
  if (input.theme) {
    const { mascot: _mascot, ...theme } = input.theme;
    project = applyBrandTheme(project, theme);
  }
  // Mots mis en valeur : une couleur de la marque lisible sur le contour, une fois la marque appliquée.
  project = {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      items: track.items.map((item) => (item.type === "text" && item.karaoke?.emphasis ? { ...item, karaoke: { ...item.karaoke, emphasis: { ...item.karaoke.emphasis, color: emphasisColor(item, input.theme) } } } : item)),
    })),
  };
  return project;
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
