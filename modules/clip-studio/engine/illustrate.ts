/**
 * Illustrer à la main dans l'éditeur (dossier 01, illustrations, étape I6).
 *
 * Les acteurs et les traits du panneau « Illustrer » sont des éléments
 * ordinaires, faits dans la langue visuelle de la planche (`board.ts`) :
 * mêmes tailles de la grille (`SPACE`), même palette (`board-palette.ts`),
 * même indication `theme.board` pour qu'une marque appliquée ensuite les
 * recolore. Les acteurs passent par le compilateur de planche lui-même
 * (`compileBoard`, un seul acteur, sans entrée ni sortie) ; les traits sont
 * tracés ici, sur le modèle de ceux de la planche.
 *
 * Placement exact : un acteur ou un trait ajouté se pose au centre de la
 * zone d'écriture du format (`takeGeometry(aspect).content`, sous la barre du
 * haut d'un short), le centre de son dessin (courbe échantillonnée, pas ses
 * seuls points) sur le centre de la zone.
 *
 * Les éléments d'un même acteur (le fond d'une carte, son repère, son texte)
 * portent des identifiants d'une même famille (`ill-<famille>-<rang>`) :
 * l'aperçu les déplace ensemble (`groupOf`).
 *
 * Fonctions pures.
 */

import { DEFAULT_BOARD_PALETTE, type BoardPalette, type BoardPaletteKey } from "./board-palette";
import { compileBoard, SPACE, type BoardActor, type BoardSpec } from "./board";
import { keyedFrame } from "./keys";
import { followBox, placeAt, type Placement, type PlaceOptions } from "./key-edit";
import { strokePolyline } from "./render";
import { takeGeometry, type Box } from "./take-templates";
import { findItem, updateItem } from "./edit";
import type { AspectPreset, ClipItem, ClipProject, ShapeItem, StrokePath, TextMark, TextRole, Track, Transform, VisualItem } from "./types";

// ─── Contexte ────────────────────────────────────────────────────

/** Police d'un rôle de texte (celle de la marque du projet). */
export type RoleFonts = Partial<Record<TextRole, { font: string; weight: number }>>;

export interface IllustrateContext {
  aspect: AspectPreset;
  width: number;
  height: number;
  fps: number;
  /** Première image : la tête de lecture. */
  start: number;
  /** Palette de planche de la marque du projet ; par défaut, celle de la planche. */
  palette?: BoardPalette;
  /** Polices des rôles de la marque, que reçoivent les textes (la marque les leur donnerait aussi). */
  fonts?: RoleFonts;
}

/** Durée d'un acteur ou d'un trait ajouté, en secondes. */
export const ILLUSTRATION_SECONDS = 3;
/** Un trait se dessine en ce temps à partir de son début, comme sur la planche. */
export const DRAW_SECONDS = 0.45;
const CIRCLE_SECONDS = 0.6;
const FADE_IN_SECONDS = 0.4;
const FADE_OUT_SECONDS = 0.26;

/** Nom des pistes où se rangent les illustrations. */
export const ILLUSTRATION_TRACK = "Illustrations";

/** Zone d'écriture du format : là où un acteur ajouté se pose, au centre. */
export function illustrationZone(aspect: AspectPreset): Box {
  return takeGeometry(aspect).content;
}

const frameOf = (context: Pick<IllustrateContext, "width" | "height">) => ({ width: context.width, height: context.height });

/** Pixels d'un cadre de 1080 de large, en pixels du canevas (comme la planche). */
const pxOf = (context: Pick<IllustrateContext, "width">) => (value: number) => (value * context.width) / 1080;

// ─── Familles d'éléments ─────────────────────────────────────────

const GROUP_ID = /^ill-([a-z0-9]+)-\d+$/;

/** Nouvel identifiant de famille. */
function groupStem(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Famille d'un élément posé par « Illustrer », ou `null`. */
export function groupOf(id: string): string | null {
  return GROUP_ID.exec(id)?.[1] ?? null;
}

/** Les autres éléments visuels de la même famille que `itemId`. */
export function companionsOf(project: ClipProject, itemId: string): VisualItem[] {
  const stem = groupOf(itemId);
  if (!stem) return [];
  return project.tracks.flatMap((track) => track.items).filter((item): item is VisualItem => item.id !== itemId && item.type !== "audio" && groupOf(item.id) === stem);
}

// ─── Traits ──────────────────────────────────────────────────────

export type StrokeKind = "arrow" | "cross" | "strike" | "underline" | "circle" | "link";
/** Traits tracés à la souris sur l'aperçu. */
export type DrawTool = "arrow" | "line" | "link";

type Point = [number, number];

/** Style d'un trait de la planche : épaisseur (pixels d'un cadre de 1080), couleur, pointe. */
const STROKE_LOOK: Record<StrokeKind | DrawTool, { width: number; color: BoardPaletteKey; head?: StrokePath["head"]; label: string }> = {
  arrow: { width: 6, color: "ink", head: "end", label: "Flèche" },
  line: { width: 6, color: "ink", label: "Trait" },
  cross: { width: 10, color: "ink", label: "Croix" },
  strike: { width: 8, color: "ink", label: "Barre" },
  underline: { width: 8, color: "ink", label: "Soulignement" },
  circle: { width: 6, color: "accent", label: "Cercle" },
  link: { width: 4, color: "muted", label: "Liaison" },
};

/**
 * Point du milieu d'un trait de `a` à `b`, poussé perpendiculairement de
 * `bend` fois sa longueur (en pixels réels, comme la planche). Tout en parts
 * du canevas.
 */
export function bendPoint(a: Point, b: Point, bend: number, frame: { width: number; height: number }): Point {
  const ax = a[0] * frame.width;
  const ay = a[1] * frame.height;
  const bx = b[0] * frame.width;
  const by = b[1] * frame.height;
  const length = Math.hypot(bx - ax, by - ay) || 1;
  return [((ax + bx) / 2 - ((by - ay) / length) * length * bend) / frame.width, ((ay + by) / 2 + ((bx - ax) / length) * length * bend) / frame.height];
}

/** Courbure d'un trait à trois points : l'écart de son milieu, en part de sa longueur (signé). */
export function strokeBend(points: [Point, Point, Point], frame: { width: number; height: number }): number {
  const [a, mid, b] = points.map(([x, y]) => [x * frame.width, y * frame.height]);
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length < 1e-6) return 0;
  const normal = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
  return ((mid[0] - (a[0] + b[0]) / 2) * normal[0] + (mid[1] - (a[1] + b[1]) / 2) * normal[1]) / length;
}

/**
 * Boîte d'un tracé dont les points sont donnés en parts du canevas : la
 * boîte de la courbe réellement dessinée (échantillonnée), plus `padPx`
 * pixels (d'un cadre de 1080 de large) tout autour, et les points ramenés
 * dans cette boîte (0 à 1).
 */
export function fitStroke(
  paths: FramePath[],
  frame: { width: number; height: number },
  padPx: number = SPACE.l,
  lineWidthPx = 0
): { box: Pick<Transform, "x" | "y" | "width" | "height">; paths: Point[][] } {
  // La courbe échantillonnée en pixels : `strokePolyline` lit des points de boîte (0 à 1) ; une boîte
  // d'un pixel de côté centrée sur l'origine donne des pixels.
  const samples = paths.flatMap((path) => {
    const line = strokePolyline({ points: path.points.map(([x, y]): Point => [x * frame.width + 0.5, y * frame.height + 0.5]), smooth: path.smooth, closed: path.closed }, 1, 1);
    return [...line, ...headWings(line, lineWidthPx, path.head)];
  });
  const xs = samples.map(([x]) => x);
  const ys = samples.map(([, y]) => y);
  const pad = (padPx * frame.width) / 1080;
  const left = Math.min(...xs) - pad;
  const right = Math.max(...xs) + pad;
  const top = Math.min(...ys) - pad;
  const bottom = Math.max(...ys) + pad;
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  return {
    box: { x: (left + right) / 2 / frame.width, y: (top + bottom) / 2 / frame.height, width: width / frame.width, height: height / frame.height },
    paths: paths.map((path) => path.points.map(([x, y]): Point => [(x * frame.width - left) / width, (y * frame.height - top) / height])),
  };
}

/**
 * Bouts des ailes d'une pointe de flèche, comme `drawStroke` (`render.ts`) les
 * dessine : longueur de 3,4 épaisseurs, ouverture de 0,52 radian, sens donné
 * par le point situé à deux épaisseurs du bout. Ils comptent dans le centre
 * du dessin : une flèche se centre pointe comprise.
 */
function headWings(line: Point[], lineWidthPx: number, head: StrokePath["head"]): Point[] {
  if (!head || lineWidthPx <= 0 || line.length < 2) return [];
  const wings = (ordered: Point[]): Point[] => {
    const tip = ordered[0];
    const base = ordered.find((point) => Math.hypot(point[0] - tip[0], point[1] - tip[1]) >= lineWidthPx * 2) ?? ordered[ordered.length - 1];
    const angle = Math.atan2(tip[1] - base[1], tip[0] - base[0]);
    const length = lineWidthPx * 3.4;
    return [-0.52, 0.52].map((spread): Point => [tip[0] - length * Math.cos(angle + spread), tip[1] - length * Math.sin(angle + spread)]);
  };
  return [...(head === "end" || head === "both" ? wings([...line].reverse()) : []), ...(head === "start" || head === "both" ? wings(line) : [])];
}

type FramePath = { points: Point[]; smooth?: boolean; closed?: boolean; head?: StrokePath["head"] };

/** Points (parts du canevas) décalés pour que le centre de leur dessin, pointes comprises, tombe sur `center`. */
function centerDrawing<T extends FramePath>(paths: T[], center: Point, frame: { width: number; height: number }, lineWidthPx: number): T[] {
  const { box } = fitStroke(paths, frame, 0, lineWidthPx);
  const dx = center[0] - box.x;
  const dy = center[1] - box.y;
  return paths.map((path) => ({ ...path, points: path.points.map(([x, y]): Point => [x + dx, y + dy]) }));
}

function strokeShape(
  id: string,
  kind: StrokeKind | DrawTool,
  context: IllustrateContext,
  framePaths: (Omit<StrokePath, "points"> & { points: Point[] })[],
  padPx: number
): ShapeItem {
  const frame = frameOf(context);
  const palette = context.palette ?? DEFAULT_BOARD_PALETTE;
  const look = STROKE_LOOK[kind];
  const fitted = fitStroke(framePaths, frame, padPx, pxOf(context)(look.width));
  const minSide = Math.min(frame.width, frame.height);
  return {
    id,
    type: "shape",
    shape: "stroke",
    start: context.start,
    duration: Math.max(1, Math.round(ILLUSTRATION_SECONDS * context.fps)),
    label: look.label,
    fill: palette[look.color],
    radius: 0,
    theme: { board: true, boardColor: look.color },
    stroke: {
      width: pxOf(context)(look.width) / minSide,
      paths: framePaths.map((path, index) => ({ ...path, points: fitted.paths[index] })),
    },
    transform: { ...fitted.box, rotation: 0, opacity: 1 },
    animIn: { kind: "none", frames: 1 },
    animOut: { kind: "fade", frames: Math.max(1, Math.round(FADE_OUT_SECONDS * context.fps)) },
  };
}

const drawOver = (fps: number, seconds = DRAW_SECONDS) => ({ at: 0, frames: Math.max(1, Math.round(seconds * fps)) });

/**
 * Trait du panneau, au centre de la zone d'écriture : flèche légèrement
 * courbée, croix, barre, soulignement, cercle à main levée, liaison. Chaque
 * trait se dessine à partir de son début.
 */
export function createStroke(kind: StrokeKind, context: IllustrateContext): ShapeItem {
  const frame = frameOf(context);
  const zone = illustrationZone(context.aspect);
  const center: Point = [zone.left + zone.width / 2, zone.top + zone.height / 2];
  // Longueurs en pixels d'un cadre de 1080 de large, rendues en parts du canevas.
  const px = pxOf(context);
  const dx = (value: number) => px(value) / frame.width;
  const dy = (value: number) => px(value) / frame.height;
  const id = `ill-${groupStem()}-0`;
  const draw = drawOver(context.fps);
  const line = (length: number, bend: number): Point[] => {
    const a: Point = [center[0] - dx(length) / 2, center[1]];
    const b: Point = [center[0] + dx(length) / 2, center[1]];
    return [a, bendPoint(a, b, bend, frame), b];
  };

  switch (kind) {
    case "cross": {
      // Les deux branches vont d'un coin à l'autre de leur boîte : la croix se dessine en deux temps.
      const half = Math.max(1, Math.round(draw.frames / 2));
      const side = 200;
      const box: Point[] = [[center[0] - dx(side) / 2, center[1] - dy(side) / 2], [center[0] + dx(side) / 2, center[1] + dy(side) / 2]];
      return strokeShape(id, kind, context, [
        { points: [box[0], box[1]], draw: { at: 0, frames: half } },
        { points: [[box[1][0], box[0][1]], [box[0][0], box[1][1]]], draw: { at: half, frames: half } },
      ], 0);
    }
    case "circle": {
      // Ellipse à main levée : départ en haut à gauche, un tour et un peu plus, rayon qui varie à peine.
      const jitter = [1, 1.02, 0.98, 1.01, 0.99, 1.03, 0.98, 1.0, 1.02, 0.97, 1.01];
      const points: Point[] = jitter.map((factor, index) => {
        const angle = (-110 + (index * 400) / (jitter.length - 1)) * (Math.PI / 180);
        return [dx(200 * factor * Math.cos(angle)), dy(112 * factor * Math.sin(angle))];
      });
      const [path] = centerDrawing([{ points, smooth: true }], center, frame, px(STROKE_LOOK.circle.width));
      return strokeShape(id, kind, context, [{ points: path.points, smooth: true, draw: drawOver(context.fps, CIRCLE_SECONDS) }], SPACE.s);
    }
    case "arrow":
    case "link":
    case "strike":
    case "underline": {
      const geometry = { arrow: { length: 360, bend: 0.08 }, link: { length: 360, bend: 0.12 }, strike: { length: 420, bend: 0 }, underline: { length: 420, bend: 0.02 } }[kind];
      const [path] = centerDrawing([{ points: line(geometry.length, geometry.bend), smooth: true, head: STROKE_LOOK[kind].head }], center, frame, px(STROKE_LOOK[kind].width));
      return strokeShape(id, kind, context, [{ points: path.points, smooth: true, head: STROKE_LOOK[kind].head, draw }], SPACE.l);
    }
  }
}

/** Plus courte distance, en pixels du canevas, pour qu'un tracé à la souris compte (en deçà : un simple clic). */
export const MIN_DRAW_PX = 24;

/**
 * Trait tracé à la souris de `from` à `to` (parts du canevas) : flèche et
 * trait droits, liaison courbée comme sur la planche. `null` quand le geste
 * est trop court pour être un trait.
 */
export function createDrawnStroke(tool: DrawTool, from: Point, to: Point, context: IllustrateContext): ShapeItem | null {
  const frame = frameOf(context);
  if (Math.hypot((to[0] - from[0]) * frame.width, (to[1] - from[1]) * frame.height) < MIN_DRAW_PX) return null;
  const bend = tool === "link" ? 0.12 : 0;
  return strokeShape(`ill-${groupStem()}-0`, tool, context, [{ points: [from, bendPoint(from, to, bend, frame), to], smooth: true, head: STROKE_LOOK[tool].head, draw: drawOver(context.fps) }], SPACE.l);
}

// ─── Tracés modifiables ──────────────────────────────────────────

/** Un tracé à trois points (départ, milieu, arrivée) : il a des poignées de bout et de courbe. */
export function isEditableStroke(item: VisualItem): item is ShapeItem {
  return item.type === "shape" && item.shape === "stroke" && item.stroke?.paths.length === 1 && item.stroke.paths[0].points.length === 3 && !item.stroke.paths[0].closed;
}

/**
 * Points d'un tracé modifiable à l'image `frame`, en parts du canevas, tels
 * qu'ils sont dessinés (images clés et agrandissement compris). `null` pour
 * un tracé tourné : ses poignées seraient fausses, il garde son cadre.
 */
export function strokeHandles(item: VisualItem, frame: number): [Point, Point, Point] | null {
  if (!isEditableStroke(item)) return null;
  const { transform: t, scale } = keyedFrame(item, frame);
  if (Math.abs(t.rotation) > 0.01) return null;
  return item.stroke!.paths[0].points.map(([u, v]): Point => [t.x + (u - 0.5) * t.width * scale, t.y + (v - 0.5) * t.height * scale]) as [Point, Point, Point];
}

/**
 * Déplace un point d'un tracé modifiable (0 départ, 1 milieu, 2 arrivée) à
 * `point` (parts du canevas), vu à l'image `frame` : la boîte se recale sur
 * la nouvelle courbe, et tout le mouvement de l'élément suit.
 */
export function moveStrokePoint(item: ShapeItem, frame: number, index: 0 | 1 | 2, point: Point, size: { width: number; height: number }): Partial<ShapeItem> | null {
  const handles = strokeHandles(item, frame);
  if (!handles) return null;
  const points = handles.map((entry, rank) => (rank === index ? point : entry)) as [Point, Point, Point];
  return withStrokePoints(item, frame, points, size);
}

/** Change la courbure d'un tracé modifiable, ses deux bouts restant en place. */
export function bendStroke(item: ShapeItem, frame: number, bend: number, size: { width: number; height: number }): Partial<ShapeItem> | null {
  const handles = strokeHandles(item, frame);
  if (!handles) return null;
  return withStrokePoints(item, frame, [handles[0], bendPoint(handles[0], handles[2], bend, size), handles[2]], size);
}

function withStrokePoints(item: ShapeItem, frame: number, points: [Point, Point, Point], size: { width: number; height: number }): Partial<ShapeItem> {
  const path = item.stroke!.paths[0];
  const fitted = fitStroke([{ points, smooth: path.smooth, closed: path.closed, head: path.head }], size, SPACE.l, item.stroke!.width * Math.min(size.width, size.height));
  // La boîte dessinée est agrandie de `scale` : la boîte de l'élément l'est d'autant moins.
  const { scale } = keyedFrame(item, frame);
  const ratio = scale > 1e-6 ? scale : 1;
  const placed = placeAt(item, frame, { x: fitted.box.x, y: fitted.box.y, width: fitted.box.width / ratio, height: fitted.box.height / ratio }, { animate: false, fps: 30 });
  return { ...placed, stroke: { ...item.stroke!, paths: [{ ...path, points: fitted.paths[0] }] } };
}

// ─── Acteurs ─────────────────────────────────────────────────────

export type ActorKind = "card" | "card-index" | "chip" | "note" | "counter" | "title";

/** Libellés des pistes et de la chronologie pour les fonds d'acteurs. */
const SHAPE_LABELS: Record<string, string> = {
  "Planche – carte": "Carte",
  "Planche – note": "Note",
};

/**
 * Acteur du panneau, au centre de la zone d'écriture, compilé par la planche
 * elle-même : carte (avec ou sans repère « 01 »), pastille à point, note
 * collée, compteur avec son unité, grand titre dont un mot est sur un pavé.
 * Rend ses éléments du plus haut au plus bas (texte avant le fond).
 */
export function createActor(kind: ActorKind, context: IllustrateContext): VisualItem[] {
  const frame = frameOf(context);
  const zone = illustrationZone(context.aspect);
  const palette = context.palette ?? DEFAULT_BOARD_PALETTE;
  const px = pxOf(context);
  // Pixels d'un cadre de 1080, en parts de la zone (largeur, hauteur).
  const zx = (value: number) => Math.min(1, px(value) / (zone.width * frame.width));
  const zy = (value: number) => Math.min(1, px(value) / (zone.height * frame.height));
  const place = { id: "actor", x: 0.5, y: 0.5, persist: true } as const;
  const actor: BoardActor = (() => {
    switch (kind) {
      case "card":
        return { ...place, kind: "card", text: "Une idée claire", w: zx(640), h: zy(200), size: 0.036 };
      case "card-index":
        return { ...place, kind: "card", index: "01", text: "Première étape", w: zx(760), h: zy(150), size: 0.03 };
      case "chip":
        return { ...place, kind: "chip", text: "Repère", dot: true, size: 0.031 };
      case "note":
        return { ...place, kind: "note", text: "Et pourquoi ça marche ?", w: zx(460), h: zy(240), tilt: -3, size: 0.032 };
      case "counter":
        return { ...place, kind: "counter", value: "16 709", unit: "vues", from: 0, size: 0.085 };
      case "title":
        return { ...place, kind: "text", text: "Un mot clé", size: 0.06, role: "title", marks: [{ kind: "pill", from: 2, to: 3 }] };
    }
  })();
  const duration = Math.max(1, Math.round(ILLUSTRATION_SECONDS * context.fps));
  const spec: BoardSpec = { area: zone, start: context.start, end: context.start + duration, actors: [actor] };
  const compiled = compileBoard(spec, { fps: context.fps, frame, words: [], palette });
  const stem = groupStem();
  // Du plus haut au plus bas : les calques dans leur ordre, et dans un calque ce qui est posé après
  // passe au-dessus (le texte d'une note sur son fond), comme le range `boardTracks`.
  return compiled.layers
    .flatMap((entry) => [...entry.items].reverse())
    .filter((item): item is VisualItem => item.type !== "audio")
    .map((item, index) => {
      const next: VisualItem = {
        ...item,
        id: `ill-${stem}-${index}`,
        // Un fondu, le même pour toutes les pièces : le texte et sa carte apparaissent et partent ensemble.
        animIn: { kind: "fade", frames: Math.max(1, Math.round(FADE_IN_SECONDS * context.fps)) },
        animOut: { kind: "fade", frames: Math.max(1, Math.round(FADE_OUT_SECONDS * context.fps)) },
      };
      // Pas de mouvement caché : les pièces d'un acteur posé à la main n'ont aucune image clé.
      delete next.keys;
      if (next.label && SHAPE_LABELS[next.label]) next.label = SHAPE_LABELS[next.label];
      if (next.type === "text") {
        const font = context.fonts?.[next.theme?.role ?? "body"];
        if (font) next.style = { ...next.style, font: font.font, weight: font.weight };
      }
      return next;
    });
}

// ─── Ajout au projet ─────────────────────────────────────────────

let trackCounter = 0;
const trackId = () => `t-${Date.now().toString(36)}${(trackCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Ajoute une illustration (ses éléments du plus haut au plus bas) : un trait
 * seul va sur une piste « Illustrations » libre, sinon une nouvelle, posée
 * au-dessus des autres ; un acteur en plusieurs pièces reçoit ses propres
 * pistes, au-dessus de tout, dans l'ordre de ses pièces (le texte sur sa
 * carte).
 */
export function insertIllustration(project: ClipProject, items: VisualItem[]): ClipProject {
  if (items.length === 0) return project;
  if (items.length === 1) {
    const item = items[0];
    const free = project.tracks.find(
      (track) => track.kind === "visual" && !track.locked && track.name.startsWith(ILLUSTRATION_TRACK) && !track.items.some((other) => item.start < other.start + other.duration && other.start < item.start + item.duration)
    );
    if (free) return { ...project, tracks: project.tracks.map((track) => (track === free ? { ...track, items: [...track.items, item].sort((a, b) => a.start - b.start) } : track)), updatedAt: Date.now() };
  }
  const tracks: Track[] = items.map((item) => ({ id: trackId(), kind: "visual", name: ILLUSTRATION_TRACK, items: [item as ClipItem] }));
  return { ...project, tracks: [...tracks, ...project.tracks], updatedAt: Date.now() };
}

/**
 * Pose un élément à `next` à l'image `frame` (`placeAt`), et ses pièces
 * sœurs avec lui : même déplacement, même proportion autour de son centre,
 * même rotation ajoutée. Une seule modification du projet, donc une seule
 * étape d'annulation.
 */
export function placeWithGroup(project: ClipProject, itemId: string, frame: number, next: Placement, options: PlaceOptions): ClipProject {
  const found = findItem(project, itemId);
  if (!found || found.item.type === "audio") return project;
  const item = found.item;
  const before = keyedFrame(item, frame).transform;
  let result = updateItem(project, itemId, placeAt(item, frame, next, options) as Partial<ClipItem>);
  const geometry = next.x !== undefined || next.y !== undefined || next.width !== undefined || next.height !== undefined;
  if (!geometry && next.rotation === undefined) return result;
  for (const companion of companionsOf(project, itemId)) {
    const current = keyedFrame(companion, frame).transform;
    const target: Placement = geometry ? followBox(before, next, current) : {};
    if (next.rotation !== undefined) target.rotation = current.rotation + (next.rotation - before.rotation);
    result = updateItem(result, companion.id, placeAt(companion, frame, target, options) as Partial<ClipItem>);
  }
  return result;
}

// ─── Sélection sur l'aperçu ──────────────────────────────────────

/**
 * Élément le plus haut sous `point` (parts du canevas) à l'image `frame`,
 * dans l'ordre de `items` (le premier est au-dessus) : son cadre animé
 * (images clés, agrandissement, rotation). Un tracé ne se prend que près de
 * son trait (`tolerancePx` pixels du canevas, plus la moitié de son
 * épaisseur) : un clic dans le vide de sa boîte atteint ce qui est dessous.
 */
export function hitTestAt(items: VisualItem[], point: Point, frame: number, size: { width: number; height: number }, tolerancePx: number): VisualItem | null {
  for (const item of items) {
    const { transform: t, scale } = keyedFrame(item, frame);
    const w = t.width * scale * size.width;
    const h = t.height * scale * size.height;
    // Le point dans le repère de l'élément (pixels, centre à l'origine, rotation défaite).
    const px = (point[0] - t.x) * size.width;
    const py = (point[1] - t.y) * size.height;
    const angle = (-t.rotation * Math.PI) / 180;
    const lx = px * Math.cos(angle) - py * Math.sin(angle);
    const ly = px * Math.sin(angle) + py * Math.cos(angle);
    if (item.type === "shape" && item.shape === "stroke" && item.stroke?.paths.length) {
      const reach = tolerancePx + (item.stroke.width * Math.min(size.width, size.height)) / 2;
      if (item.stroke.paths.some((path) => distanceToPolyline([lx, ly], strokePolyline(path, w, h)) <= reach)) return item;
      continue;
    }
    if (Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2) return item;
  }
  return null;
}

function distanceToPolyline(point: Point, line: Point[]): number {
  if (line.length === 1) return Math.hypot(point[0] - line[0][0], point[1] - line[0][1]);
  let best = Infinity;
  for (let index = 1; index < line.length; index++) {
    const [ax, ay] = line[index - 1];
    const [bx, by] = line[index];
    const length = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = length > 0 ? Math.min(1, Math.max(0, ((point[0] - ax) * (bx - ax) + (point[1] - ay) * (by - ay)) / length)) : 0;
    best = Math.min(best, Math.hypot(point[0] - (ax + (bx - ax) * t), point[1] - (ay + (by - ay) * t)));
  }
  return best;
}

// ─── Réglages de l'inspecteur ────────────────────────────────────

/** Ombre douce d'une carte de la planche, dans la palette donnée. */
export function boardShadow(palette: BoardPalette, size: { width: number; height: number }): NonNullable<ShapeItem["shadow"]> {
  const minSide = Math.min(size.width, size.height);
  const px = (value: number) => (value * size.width) / 1080;
  return { color: palette.shadow, blur: px(28) / minSide, offsetY: px(8) / minSide };
}

/**
 * Durée totale du dessin d'un tracé : ses traits se dessinent l'un après
 * l'autre (une croix : une branche, puis l'autre) ; `null` s'il est entier
 * dès son apparition.
 */
export function strokeDrawFrames(item: ShapeItem): number | null {
  const paths = item.stroke?.paths ?? [];
  const drawn = paths.filter((path) => path.draw);
  if (drawn.length === 0) return null;
  return Math.max(...drawn.map((path) => path.draw!.at + path.draw!.frames)) - Math.min(...drawn.map((path) => path.draw!.at));
}

/**
 * Tracés qui se dessinent en `frames` images à partir du même instant que
 * maintenant (le début de l'élément par défaut), chaque trait à son tour ;
 * `null` : entiers dès leur apparition.
 */
export function withDrawFrames(paths: StrokePath[], frames: number | null): StrokePath[] {
  if (frames === null) return paths.map(({ draw: _draw, ...rest }) => rest);
  const start = Math.min(...paths.map((path) => path.draw?.at ?? 0));
  const share = Math.max(1, Math.round(frames / Math.max(1, paths.length)));
  return paths.map((path, index) => ({ ...path, draw: { at: start + index * share, frames: share } }));
}

// ─── Marques sur les mots ────────────────────────────────────────

/**
 * Mots d'un texte, comptés comme le rendu compte ceux d'une marque : coupés
 * aux espaces sécables seulement (une espace insécable garde « ? » collé à
 * son mot), lignes comprises.
 */
export function markWords(text: string): string[] {
  return text.split("\n").flatMap((paragraph) => paragraph.split(/[^\S\u00A0\u202F\u2007]+/).filter(Boolean));
}

/** Couleur d'une marque nouvelle : l'encre pour barrer et souligner, l'accent pour le reste (comme la planche). */
export function markColor(kind: TextMark["kind"], palette: BoardPalette): string {
  return kind === "strike" || kind === "underline" ? palette.ink : palette.accent;
}

/**
 * Marque sur les mots `from` à `to` (exclu) : posée dès l'apparition du texte
 * (`at` absent), ou tracée à partir de l'image `at` (comptée depuis le début
 * de l'élément) en `DRAW_SECONDS`.
 */
export function createMark(kind: TextMark["kind"], range: { from: number; to: number }, palette: BoardPalette, fps: number, at?: number, color?: string): TextMark {
  const mark: TextMark = { kind, from: range.from, to: range.to, color: color ?? markColor(kind, palette) };
  if (kind === "pill") mark.textColor = palette.onAccent;
  if (at !== undefined) {
    mark.at = Math.max(0, Math.round(at));
    mark.frames = Math.max(1, Math.round(DRAW_SECONDS * fps));
  }
  return mark;
}
