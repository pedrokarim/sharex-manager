/**
 * Planche d'illustrations (dossier 01, « illustrations animées », étape I1).
 *
 * Une planche est une partition : des acteurs (titre, carte, pastille,
 * note, image, compteur, tracé) posés dans une zone du cadre, et des
 * actions calées sur les mots de la voix (entrer, glisser, compter, barrer,
 * souligner, relier, pâlir, sortir, se changer en un autre). `compileBoard`
 * la traduit en éléments ordinaires du projet, que l'éditeur déplace,
 * rogne et retouche comme les autres : rien n'est caché dans un format à
 * part.
 *
 * Placement exact : les places viennent de la grille d'espacements
 * (`SPACE`), les piles se centrent au pixel près (`stack`), les textes se
 * centrent sur la hauteur de leurs capitales (`opticalCenter`) et leurs
 * marques se posent sur les lettres mesurées au rendu.
 *
 * Mouvement calme : entrées par un ressort sans rebond, sorties courtes et
 * accélérées, qui finissent à zéro.
 *
 * Fonction pure.
 */

import { DEFAULT_TEXT_FONT } from "../lib/font-catalog";
import { uid } from "./edit";
import { lanes, type Box } from "./take-templates";
import type {
  ClipItem,
  ImageItem,
  MediaSource,
  MoveKey,
  ShapeItem,
  StrokePath,
  TextItem,
  TextMark,
  TextRole,
  TextStyle,
  TimedWord,
  Track,
  VisualItem,
} from "./types";

// ─── Grille et couleurs ──────────────────────────────────────────

/** Espacements, en pixels d'un cadre de 1080 de large : toutes les marges et tous les écarts en viennent. */
export const SPACE = { xs: 12, s: 24, m: 40, l: 64, xl: 96 } as const;

/** Couleurs d'une planche ; une marque les fournit (étape I3), sinon celles-ci. */
export interface BoardPalette {
  paper: string;
  sheet: string;
  ink: string;
  muted: string;
  accent: string;
  onAccent: string;
  shadow: string;
}

export const DEFAULT_BOARD_PALETTE: BoardPalette = {
  paper: "#f2efe8",
  sheet: "#ffffff",
  ink: "#16181d",
  muted: "#8d8a83",
  accent: "#2f74f5",
  onAccent: "#ffffff",
  shadow: "rgba(22, 24, 29, 0.14)",
};

/** Couleur nommée de la palette, ou valeur telle quelle. */
export type BoardColor = keyof BoardPalette | (string & {});

const paletteColor = (palette: BoardPalette, color: BoardColor | undefined, fallback: keyof BoardPalette) =>
  color === undefined ? palette[fallback] : color in palette ? palette[color as keyof BoardPalette] : color;

// ─── Partition ───────────────────────────────────────────────────

/** Instant : une image du montage, ou un mot de la voix (avec un délai en secondes). */
export type BoardAt = number | { word: number; delay?: number };

/** Marque sur des mots d'un texte d'acteur ; `at` absent : posée dès son entrée. */
export interface BoardMark {
  kind: TextMark["kind"];
  from?: number;
  to?: number;
  color?: BoardColor;
  textColor?: BoardColor;
  at?: BoardAt;
  /** Durée du tracé, en secondes. */
  seconds?: number;
}

interface ActorBase {
  id: string;
  /** Centre, en parts de la zone de la planche. */
  x: number;
  y: number;
  /** Recouvrement voulu (une note collée sur une liste) : le contrôle des chevauchements l'accepte. */
  overlap?: boolean;
  /** L'acteur continue sur la planche suivante, à la même place : il ne sort pas à la fin de celle-ci. */
  persist?: boolean;
  /** Entrée : instant et façon ; absente, l'acteur est là dès le début de la planche. */
  enter?: { at: BoardAt; style?: EnterStyle; seconds?: number };
}

export type EnterStyle = "rise" | "drop" | "pop" | "fade" | "none";

export interface TextActor extends ActorBase {
  kind: "text";
  text: string;
  /** Corps, en part de la hauteur du cadre. */
  size: number;
  role?: TextRole;
  align?: "left" | "center" | "right";
  /** Largeur et hauteur du cadre, en parts de la zone (le texte rétrécit pour y tenir). */
  w?: number;
  h?: number;
  color?: BoardColor;
  marks?: BoardMark[];
  tail?: { text: string; scale: number; color?: BoardColor };
}

export interface CardActor extends ActorBase {
  kind: "card";
  text: string;
  /** Repère avant le texte (« 01 »), dans la couleur d'accent. */
  index?: string;
  w: number;
  h: number;
  size?: number;
  marks?: BoardMark[];
  align?: "left" | "center" | "right";
}

export interface ChipActor extends ActorBase {
  kind: "chip";
  text: string;
  size?: number;
  /** Point d'accent devant le texte. */
  dot?: boolean;
}

export interface NoteActor extends ActorBase {
  kind: "note";
  text: string;
  w: number;
  h: number;
  /** Inclinaison, en degrés. */
  tilt?: number;
  size?: number;
}

export interface ImageActor extends ActorBase {
  kind: "image";
  source: MediaSource;
  w: number;
  h: number;
  /** Carreau blanc à ombre douce sous l'image, comme une icône d'application. */
  tile?: boolean;
  label?: string;
}

export interface CounterActor extends ActorBase {
  kind: "counter";
  /** Valeur d'arrivée, telle qu'écrite (« 16 709 »). */
  value: string;
  from?: number;
  unit?: string;
  size: number;
  color?: BoardColor;
}

export type BoardActor = TextActor | CardActor | ChipActor | NoteActor | ImageActor | CounterActor;

export type BoardAction =
  | { verb: "move"; actor: string; at: BoardAt; x?: number; y?: number; scale?: number; seconds?: number }
  | { verb: "count"; actor: string; at: BoardAt; seconds?: number }
  | { verb: "strike"; actor: string; at: BoardAt; seconds?: number; dim?: boolean }
  | { verb: "mark"; actor: string; at: BoardAt; mark: Omit<BoardMark, "at"> }
  | { verb: "cross"; actor: string; at: BoardAt; place?: "over" | "below"; seconds?: number }
  | { verb: "link"; from: string; to: string; at: BoardAt; seconds?: number; bend?: number }
  | { verb: "arrow"; from: string | { x: number; y: number }; to: string | { x: number; y: number }; at: BoardAt; seconds?: number; bend?: number }
  | { verb: "dim"; actor: string; at: BoardAt; opacity?: number }
  | { verb: "leave"; actor: string; at: BoardAt }
  | { verb: "morph"; actor: string; into: string; at: BoardAt; seconds?: number };

export interface BoardSpec {
  /** Zone de la planche, en parts du cadre. */
  area: Box;
  /** Première et dernière image (exclue) de la planche, dans le montage. */
  start: number;
  end: number;
  /** Fond de papier sous la planche. */
  paper?: boolean;
  /**
   * Boîte du papier, en parts du cadre ; absente : la zone. La zone est celle
   * où l'on écrit (hors des bandes que couvre l'interface des plateformes),
   * le papier peut aller jusqu'au bord.
   */
  paperBox?: Box;
  actors: BoardActor[];
  actions?: BoardAction[];
}

export interface BoardContext {
  fps: number;
  frame: { width: number; height: number };
  /** Mots du montage, en ms du montage. */
  words: TimedWord[];
  palette?: BoardPalette;
}

// ─── Placement ───────────────────────────────────────────────────

/**
 * Centres de `count` éléments de taille `size`, séparés de `gap`, dont le
 * bloc entier est centré sur `center` (tout en parts de la même longueur) :
 * autant de marge avant le premier qu'après le dernier.
 */
export function stack(count: number, size: number, gap: number, center = 0.5): number[] {
  const total = count * size + Math.max(0, count - 1) * gap;
  const first = center - total / 2 + size / 2;
  return Array.from({ length: count }, (_, index) => first + index * (size + gap));
}

/**
 * Centres d'éléments de tailles différentes posés l'un après l'autre,
 * séparés par `gaps` (un écart de moins que d'éléments, ou un seul pour
 * tous), dont le bloc entier est centré sur `center`.
 */
export function column(sizes: number[], gaps: number | number[], center = 0.5): number[] {
  const gapAt = (index: number) => (Array.isArray(gaps) ? gaps[index] ?? gaps[gaps.length - 1] ?? 0 : gaps);
  const total = sizes.reduce((sum, size) => sum + size, 0) + sizes.slice(1).reduce((sum, _, index) => sum + gapAt(index), 0);
  const centers: number[] = [];
  let cursor = center - total / 2;
  sizes.forEach((size, index) => {
    centers.push(cursor + size / 2);
    cursor += size + gapAt(index);
  });
  return centers;
}

/** Un espacement de la grille, en part de la largeur et de la hauteur de la zone. */
export function spaceIn(area: Box, frame: { width: number; height: number }, px: number): { x: number; y: number } {
  const scale = frame.width / 1080;
  return { x: (px * scale) / (area.width * frame.width), y: (px * scale) / (area.height * frame.height) };
}

// ─── Compilation ─────────────────────────────────────────────────

const ENTER_SECONDS = 0.5;
const LEAVE_SECONDS = 0.26;
const MOVE_SECONDS = 0.6;
const DRAW_SECONDS = 0.45;
const COUNT_SECONDS = 1.1;
/** Montée d'une entrée et levée d'une sortie, en pixels d'un cadre de 1080. */
const RISE_PX = 44;
const LIFT_PX = 34;

/** Un élément de la planche et son rôle dans la pile des calques (le plus haut d'abord). */
/** Calques, du plus haut au plus bas ; « front » porte les acteurs posés par-dessus les autres (une note collée), forme et texte ensemble. */
export type Layer = "overlay" | "front" | "text" | "image" | "card" | "link" | "ground";
const LAYER_ORDER: Layer[] = ["overlay", "front", "text", "image", "card", "link", "ground"];

interface Placed {
  item: VisualItem;
  layer: Layer;
}

/** Ce qu'un acteur est devenu : ses éléments, sa boîte (en parts du cadre), son texte principal. */
interface ActorBuild {
  actor: BoardActor;
  parts: Placed[];
  box: { x: number; y: number; width: number; height: number };
  text?: TextItem;
  enterFrame: number;
  endFrame: number;
}

export interface CompiledBoard {
  /** Éléments, du plus haut au plus bas. */
  items: ClipItem[];
  /** Les mêmes, par calque : `boardTracks` les range en pistes dans cet ordre. */
  layers: { layer: Layer; items: ClipItem[] }[];
  /** Acteurs qui se chevauchent sans l'avoir voulu, ou qui sortent de la zone : à corriger avant le montage. */
  issues: string[];
  /** Instants où la planche change (entrées, mouvements, traits), pour la cadence de la caméra. */
  changes: number[];
}

/** Nom des pistes de chaque calque, dans l'éditeur. */
const LAYER_NAMES: Record<Layer, string> = {
  overlay: "Planche – traits",
  front: "Planche – devant",
  text: "Planche – textes",
  image: "Planche – images",
  card: "Planche – cartes",
  link: "Planche – liaisons",
  ground: "Planche – papier",
};

/**
 * Pistes de planches qui se suivent : un groupe de pistes par calque, du
 * plus haut au plus bas, et dans chaque calque autant de pistes que
 * d'éléments à l'écran en même temps. Ranger par l'heure de début
 * mettrait le papier, posé le premier, au-dessus de tout ce qui arrive
 * ensuite.
 */
export function boardTracks(boards: CompiledBoard[]): Track[] {
  return LAYER_ORDER.flatMap((layer) => {
    const tracks = lanes(
      boards.flatMap((board) => board.layers.find((entry) => entry.layer === layer)?.items ?? []),
      LAYER_NAMES[layer]
    );
    // Dans un calque, ce qui arrive après se pose sur ce qui était là : la piste ouverte la dernière passe au-dessus.
    return tracks.reverse().map((track, index) => ({ ...track, name: index ? `${LAYER_NAMES[layer]} ${index + 1}` : LAYER_NAMES[layer] }));
  });
}

/** Image du montage d'un instant de la partition, bornée à la planche. */
export function resolveAt(at: BoardAt, spec: BoardSpec, context: BoardContext): number {
  let frame: number;
  if (typeof at === "number") frame = Math.round(at);
  else {
    const word = context.words[at.word];
    const ms = word ? word.startMs : (spec.start / context.fps) * 1000;
    frame = Math.round(((ms / 1000) + (at.delay ?? 0)) * context.fps);
  }
  return Math.min(spec.end - 1, Math.max(spec.start, frame));
}

/** Traduit une planche en éléments du projet. */
export function compileBoard(spec: BoardSpec, context: BoardContext): CompiledBoard {
  const palette = context.palette ?? DEFAULT_BOARD_PALETTE;
  const { fps, frame } = context;
  const area = spec.area;
  const seconds = (value: number) => Math.max(1, Math.round(value * fps));
  const at = (value: BoardAt) => resolveAt(value, spec, context);
  const px = (value: number) => (value * frame.width) / 1080;
  const toX = (x: number) => area.left + x * area.width;
  const toY = (y: number) => area.top + y * area.height;
  const changes = new Set<number>([spec.start]);

  // Fin de chaque acteur : sa sortie, sinon la fin de la planche.
  const leaveAt = new Map<string, number>();
  for (const action of spec.actions ?? []) if (action.verb === "leave") leaveAt.set(action.actor, at(action.at));
  // Un acteur qui se change en un autre disparaît à la fin de la métamorphose.
  for (const action of spec.actions ?? []) {
    if (action.verb !== "morph") continue;
    const end = Math.min(spec.end, at(action.at) + seconds(action.seconds ?? MOVE_SECONDS));
    leaveAt.set(action.actor, Math.min(leaveAt.get(action.actor) ?? spec.end, end));
  }

  // Entrées imposées par une action :
  // - un compteur n'attend jamais à zéro : il apparaît quand il commence à compter ;
  // - l'acteur dont naît une métamorphose arrive quand l'autre l'a presque rejoint, en fondu, sans que les deux se chevauchent.
  const forcedEnter = new Map<string, { frame: number; style?: EnterStyle; frames?: number }>();
  for (const action of spec.actions ?? []) {
    if (action.verb === "count") forcedEnter.set(action.actor, { frame: at(action.at) });
    if (action.verb === "morph") {
      const frames = seconds(action.seconds ?? MOVE_SECONDS);
      forcedEnter.set(action.into, { frame: Math.min(spec.end - 1, at(action.at) + Math.round(frames * 0.55)), style: "fade", frames: Math.max(1, Math.round(frames * 0.45)) });
    }
  }

  const builds = new Map<string, ActorBuild>();
  for (const actor of spec.actors) {
    const forced = forcedEnter.get(actor.id);
    const asked = actor.enter ? at(actor.enter.at) : spec.start;
    const enterFrame = forced ? Math.max(asked, forced.frame) : asked;
    const endFrame = Math.max(enterFrame + 1, leaveAt.get(actor.id) ?? spec.end);
    const build = buildActor(actor, enterFrame, endFrame, { area, frame, palette, toX, toY, px, at, seconds });
    builds.set(actor.id, build);
    changes.add(enterFrame);
    const style = forced?.style ?? actor.enter?.style ?? (actor.enter || forced ? "rise" : "none");
    applyEnter(build, style, forced?.frames ?? seconds(actor.enter?.seconds ?? ENTER_SECONDS), frame);
  }

  const extra: Placed[] = [];
  for (const action of spec.actions ?? []) {
    const frameAt = at(action.at);
    changes.add(frameAt);
    switch (action.verb) {
      case "move": {
        const build = builds.get(action.actor);
        if (!build) break;
        const target = {
          x: action.x !== undefined ? toX(action.x) : undefined,
          y: action.y !== undefined ? toY(action.y) : undefined,
        };
        moveGroup(build, frameAt, seconds(action.seconds ?? MOVE_SECONDS), target, action.scale);
        break;
      }
      case "count": {
        const build = builds.get(action.actor);
        if (!build?.text?.count) break;
        build.text.count = { ...build.text.count, at: frameAt - build.text.start, frames: seconds(action.seconds ?? COUNT_SECONDS) };
        break;
      }
      case "strike": {
        const build = builds.get(action.actor);
        if (!build?.text) break;
        addMark(build.text, { kind: "strike", color: palette.ink, at: frameAt - build.text.start, frames: seconds(action.seconds ?? DRAW_SECONDS) });
        if (action.dim !== false) fadeGroup(build, frameAt, seconds(DRAW_SECONDS), 0.5, (part) => part.layer === "text");
        break;
      }
      case "mark": {
        const build = builds.get(action.actor);
        if (!build?.text) break;
        const mark = action.mark;
        addMark(build.text, {
          kind: mark.kind,
          from: mark.from,
          to: mark.to,
          color: paletteColor(palette, mark.color, "accent"),
          textColor: mark.textColor !== undefined ? paletteColor(palette, mark.textColor, "onAccent") : mark.kind === "pill" ? palette.onAccent : undefined,
          at: frameAt - build.text.start,
          frames: seconds(mark.seconds ?? DRAW_SECONDS),
        });
        break;
      }
      case "cross": {
        const build = builds.get(action.actor);
        if (!build) break;
        extra.push(crossOf(build, action.place ?? "over", frameAt, seconds(action.seconds ?? DRAW_SECONDS), palette, frame, px));
        break;
      }
      case "link":
      case "arrow": {
        const from = endpoint(action.from, builds, toX, toY);
        const to = endpoint(action.to, builds, toX, toY);
        if (!from || !to) break;
        const visibleUntil = Math.min(...[action.from, action.to].map((end) => (typeof end === "string" ? builds.get(end)?.endFrame ?? spec.end : spec.end)));
        const placed = lineBetween(from, to, action.verb === "arrow", action.bend ?? (action.verb === "link" ? 0.12 : 0.08), frameAt, Math.max(frameAt + 1, visibleUntil), seconds(action.seconds ?? DRAW_SECONDS), palette, frame, px);
        extra.push(placed);
        break;
      }
      case "dim": {
        const build = builds.get(action.actor);
        if (build) fadeGroup(build, frameAt, seconds(0.35), action.opacity ?? 0.4);
        break;
      }
      case "leave":
        break;
      case "morph": {
        const build = builds.get(action.actor);
        const into = builds.get(action.into);
        if (!build || !into) break;
        const frames = seconds(action.seconds ?? MOVE_SECONDS);
        const scale = Math.min(into.box.width / Math.max(1e-6, build.box.width), into.box.height / Math.max(1e-6, build.box.height));
        moveGroup(build, frameAt, frames, { x: into.box.x, y: into.box.y }, scale);
        fadeGroup(build, frameAt + Math.round(frames * 0.45), Math.max(1, Math.round(frames * 0.55)), 0);
        break;
      }
    }
  }

  // Sorties : courtes, accélérées, jusqu'à zéro, avec une légère levée. Un acteur encore là à la fin
  // de la planche sort aussi, sur ses dernières images, sauf s'il continue sur la suivante.
  for (const build of builds.values()) {
    const leaving = leaveAt.has(build.actor.id) ? build.endFrame < spec.end : !build.actor.persist;
    if (!leaving) continue;
    if ((spec.actions ?? []).some((action) => action.verb === "morph" && action.actor === build.actor.id)) continue;
    const frames = seconds(LEAVE_SECONDS);
    for (const part of build.parts) {
      const local = build.endFrame - frames - part.item.start;
      pushKey(part.item, { at: Math.max(0, local), frames, opacity: 0, y: restY(part.item, build.endFrame - frames) - px(LIFT_PX) / frame.height, ease: "in" });
    }
  }
  // Les traits s'effacent avec ce qu'ils désignent, sur les mêmes dernières images.
  for (const placed of extra) {
    const frames = Math.min(seconds(LEAVE_SECONDS), Math.max(1, placed.item.duration - 1));
    pushKey(placed.item, { at: placed.item.duration - frames, frames, opacity: 0, ease: "in" });
  }

  const placed: Placed[] = [...extra, ...[...builds.values()].flatMap((build) => build.parts)];
  if (spec.paper) {
    const ground = shapeItem(spec.start, spec.end - spec.start, spec.paperBox ?? area, palette.paper, 0);
    ground.theme = { paint: "plate" };
    ground.label = "Planche – papier";
    placed.push({ item: ground, layer: "ground" });
  }
  const layers = LAYER_ORDER.map((layer) => ({ layer, items: placed.filter((entry) => entry.layer === layer).map((entry) => entry.item as ClipItem) }));
  return { items: layers.flatMap((entry) => entry.items), layers, changes: [...changes].sort((a, b) => a - b), issues: placementIssues(spec, builds, frame, fps) };
}

// ─── Acteurs ─────────────────────────────────────────────────────

interface BuildTools {
  area: Box;
  frame: { width: number; height: number };
  palette: BoardPalette;
  toX: (x: number) => number;
  toY: (y: number) => number;
  px: (value: number) => number;
  at: (value: BoardAt) => number;
  seconds: (value: number) => number;
}

/**
 * Styles des textes d'une planche sans marque : la police de texte de
 * l'application, sans capitales forcées ni contour (le papier porte le
 * texte), un titre serré. Une marque les remplace par ses rôles.
 */
const BOARD_TEXT: Record<"title" | "text" | "label", Omit<TextStyle, "size" | "align" | "color">> = {
  title: { font: DEFAULT_TEXT_FONT, weight: 700, lineHeight: 1.12, uppercase: false, letterSpacing: -0.02, stroke: null, shadow: null, background: null },
  text: { font: DEFAULT_TEXT_FONT, weight: 700, lineHeight: 1.2, uppercase: false, letterSpacing: -0.01, stroke: null, shadow: null, background: null },
  label: { font: DEFAULT_TEXT_FONT, weight: 500, lineHeight: 1.2, uppercase: false, letterSpacing: 0, stroke: null, shadow: null, background: null },
};

const styleForRole = (role: TextRole) => (role === "title" ? BOARD_TEXT.title : role === "label" ? BOARD_TEXT.label : BOARD_TEXT.text);

function textItem(content: string, start: number, duration: number, box: { x: number; y: number; width: number; height: number }, size: number, role: TextRole, color: string, align: "left" | "center" | "right" = "center"): TextItem {
  return {
    id: uid("x-"),
    type: "text",
    start,
    duration: Math.max(1, duration),
    text: content,
    style: { ...styleForRole(role), size, align, color },
    theme: { role },
    transform: { x: box.x, y: box.y, width: box.width, height: box.height, rotation: 0, opacity: 1 },
    animIn: { kind: "none", frames: 1 },
    animOut: { kind: "none", frames: 1 },
    fit: "shrink",
    opticalCenter: true,
  };
}

function shapeItem(start: number, duration: number, box: Box, fill: string, radius: number): ShapeItem {
  return {
    id: uid("s-"),
    type: "shape",
    shape: "rect",
    start,
    duration: Math.max(1, duration),
    fill,
    radius,
    transform: { x: box.left + box.width / 2, y: box.top + box.height / 2, width: box.width, height: box.height, rotation: 0, opacity: 1 },
    animIn: { kind: "none", frames: 1 },
    animOut: { kind: "none", frames: 1 },
  };
}

const boxAround = (x: number, y: number, width: number, height: number): Box => ({ left: x - width / 2, top: y - height / 2, width, height });

function buildActor(actor: BoardActor, start: number, end: number, tools: BuildTools): ActorBuild {
  const { area, frame, palette, toX, toY, px } = tools;
  const duration = end - start;
  const cx = toX(actor.x);
  const cy = toY(actor.y);
  const parts: Placed[] = [];
  const shadow = { color: palette.shadow, blur: px(28) / Math.min(frame.width, frame.height), offsetY: px(8) / Math.min(frame.width, frame.height) };
  let text: TextItem | undefined;
  let box = { x: cx, y: cy, width: 0, height: 0 };

  switch (actor.kind) {
    case "text": {
      const width = (actor.w ?? 1) * area.width;
      const height = (actor.h ?? actor.size * 1.6 / area.height) * area.height;
      text = textItem(actor.text, start, duration, { x: cx, y: cy, width, height }, actor.size, actor.role ?? "title", paletteColor(palette, actor.color, "ink"), actor.align);
      if (actor.tail) text.tail = { text: actor.tail.text, scale: actor.tail.scale, color: actor.tail.color ? paletteColor(palette, actor.tail.color, "accent") : undefined };
      parts.push({ item: text, layer: "text" });
      box = { x: cx, y: cy, width, height };
      break;
    }
    case "counter": {
      // Boîte d'une ligne de titre (interligne 1,12) : celle que dessine le texte, unité comprise.
      const width = area.width;
      const height = actor.size * BOARD_TEXT.title.lineHeight;
      text = textItem(actor.value, start, duration, { x: cx, y: cy, width, height: height * 1.2 }, actor.size, "title", paletteColor(palette, actor.color, "ink"));
      text.count = { from: actor.from ?? 0, at: 0, frames: tools.seconds(COUNT_SECONDS) };
      if (actor.unit) text.tail = { text: actor.unit, scale: 0.42, color: palette.accent };
      parts.push({ item: text, layer: "text" });
      box = { x: cx, y: cy, width, height };
      break;
    }
    case "card": {
      const width = actor.w * area.width;
      const height = actor.h * area.height;
      const card = shapeItem(start, duration, boxAround(cx, cy, width, height), palette.sheet, 0.16);
      card.shadow = shadow;
      card.theme = { paint: "surface" };
      card.label = "Planche – carte";
      parts.push({ item: card, layer: "card" });
      const size = actor.size ?? 0.026;
      // Rembourrage de la grille ; le repère occupe une colonne fixe, le texte le reste, centrés sur la même ligne.
      const padX = px(SPACE.m) / frame.width;
      let textLeft = cx - width / 2 + padX;
      if (actor.index) {
        const indexWidth = size * 1.9 * (frame.height / frame.width);
        const index = textItem(actor.index, start, duration, { x: textLeft + indexWidth / 2, y: cy, width: indexWidth, height: height * 0.8 }, size, "label", palette.accent, "left");
        parts.push({ item: index, layer: "text" });
        textLeft += indexWidth + px(SPACE.s) / frame.width;
      }
      const textWidth = cx + width / 2 - padX - textLeft;
      // Une carte à repère se lit comme une ligne de liste (à gauche) ; une carte seule a son texte au centre.
      text = textItem(actor.text, start, duration, { x: textLeft + textWidth / 2, y: cy, width: textWidth, height: height * 0.8 }, size, "subtitle", palette.ink, actor.align ?? (actor.index ? "left" : "center"));
      parts.push({ item: text, layer: "text" });
      box = { x: cx, y: cy, width, height };
      break;
    }
    case "chip": {
      const size = actor.size ?? 0.022;
      // La puce « • » existe dans toutes les polices de texte (« ● » manque à Poppins).
      const content = actor.dot ? `• ${actor.text}` : actor.text;
      // Le fond de la pastille a la hauteur d'une ligne (interligne du rôle) ; la largeur suit le texte au rendu.
      const width = area.width * 0.9;
      const height = size * BOARD_TEXT.label.lineHeight;
      text = textItem(content, start, duration, { x: cx, y: cy, width, height: height * 1.4 }, size, "label", palette.ink);
      text.style = { ...text.style, background: { color: palette.sheet, padding: 0.55, radius: 0.5 } };
      if (actor.dot) text.marks = [{ kind: "color", from: 0, to: 1, color: palette.accent }];
      parts.push({ item: text, layer: "text" });
      box = { x: cx, y: cy, width: size * (content.length * 0.6 + 1.1) * (frame.height / frame.width), height };
      break;
    }
    case "note": {
      const width = actor.w * area.width;
      const height = actor.h * area.height;
      const note = shapeItem(start, duration, boxAround(cx, cy, width, height), palette.accent, 0.06);
      note.shadow = shadow;
      note.theme = { paint: "accent" };
      note.transform.rotation = actor.tilt ?? -4;
      note.label = "Planche – note";
      parts.push({ item: note, layer: "front" });
      const size = actor.size ?? 0.024;
      const pad = px(SPACE.m);
      text = textItem(actor.text, start, duration, { x: cx, y: cy, width: width - (pad * 2) / frame.width, height: height - (pad * 2) / frame.height }, size, "subtitle", palette.onAccent, "left");
      text.transform.rotation = note.transform.rotation;
      parts.push({ item: text, layer: "front" });
      box = { x: cx, y: cy, width, height };
      break;
    }
    case "image": {
      // `w` et `h` sont la taille de l'acteur, carreau compris : deux acteurs posés par `stack` gardent l'écart voulu.
      const width = actor.w * area.width;
      const height = actor.h * area.height;
      let inner = { width, height };
      if (actor.tile) {
        const tile = shapeItem(start, duration, boxAround(cx, cy, width, height), palette.sheet, 0.24);
        tile.shadow = shadow;
        tile.theme = { paint: "surface" };
        tile.label = "Planche – carreau";
        parts.push({ item: tile, layer: "card" });
        // Marge du carreau : un cinquième de son petit côté, la même tout autour (en pixels réels).
        const side = Math.min(width * frame.width, height * frame.height);
        const pad = side * 0.2;
        inner = { width: width - (pad * 2) / frame.width, height: height - (pad * 2) / frame.height };
      }
      const image: ImageItem = {
        id: uid("i-"),
        type: "image",
        start,
        duration: Math.max(1, duration),
        source: actor.source,
        fit: "contain",
        motion: "none",
        radius: actor.tile ? 0 : 0.2,
        label: actor.label ?? "Planche – image",
        transform: { x: cx, y: cy, width: inner.width, height: inner.height, rotation: 0, opacity: 1 },
        animIn: { kind: "none", frames: 1 },
        animOut: { kind: "none", frames: 1 },
      };
      parts.push({ item: image, layer: "image" });
      box = { x: cx, y: cy, width, height };
      break;
    }
  }
  if (text && "marks" in actor && actor.marks?.length) {
    for (const mark of actor.marks) {
      addMark(text, {
        kind: mark.kind,
        from: mark.from,
        to: mark.to,
        color: paletteColor(palette, mark.color, "accent"),
        textColor: mark.textColor !== undefined ? paletteColor(palette, mark.textColor, "onAccent") : mark.kind === "pill" ? palette.onAccent : undefined,
        ...(mark.at !== undefined ? { at: tools.at(mark.at) - start, frames: tools.seconds(mark.seconds ?? DRAW_SECONDS) } : {}),
      });
    }
  }
  return { actor, parts, box, text, enterFrame: start, endFrame: end };
}

function addMark(text: TextItem, mark: TextMark) {
  text.marks = [...(text.marks ?? []), mark];
}

// ─── Mouvements ──────────────────────────────────────────────────

function pushKey(item: VisualItem, key: MoveKey) {
  item.keys = [...(item.keys ?? []), key].sort((a, b) => a.at - b.at);
}

/** Valeur de `y` atteinte par un élément à l'image `frame` du montage, d'après ses images clés. */
function restY(item: VisualItem, frame: number): number {
  let value = item.transform.y;
  for (const key of item.keys ?? []) if (key.y !== undefined && key.at <= frame - item.start) value = key.y;
  return value;
}

function restX(item: VisualItem, frame: number): number {
  let value = item.transform.x;
  for (const key of item.keys ?? []) if (key.x !== undefined && key.at <= frame - item.start) value = key.x;
  return value;
}

/**
 * Entrée d'un acteur : chaque élément part d'un peu plus bas (ou plus
 * haut, ou plus petit), transparent, et rejoint sa place sur un ressort
 * sans rebond. Une entrée « none » laisse l'acteur posé dès sa première image.
 */
function applyEnter(build: ActorBuild, style: EnterStyle, frames: number, frame: { width: number; height: number }) {
  if (style === "none") return;
  const offset = (RISE_PX * frame.width) / 1080 / frame.height;
  for (const part of build.parts) {
    const rest = { ...part.item.transform };
    const local = build.enterFrame - part.item.start;
    if (style === "rise" || style === "drop") {
      part.item.transform = { ...rest, y: rest.y + (style === "rise" ? offset : -offset), opacity: 0 };
      pushKey(part.item, { at: local, frames, y: rest.y, opacity: rest.opacity });
    } else if (style === "fade") {
      part.item.transform = { ...rest, opacity: 0 };
      pushKey(part.item, { at: local, frames, opacity: rest.opacity, ease: "smooth" });
    } else {
      // Arrivée en grand : depuis une taille réduite, autour du centre de l'acteur.
      const scale = 0.72;
      part.item.transform = {
        ...rest,
        x: build.box.x + (rest.x - build.box.x) * scale,
        y: build.box.y + (rest.y - build.box.y) * scale,
        opacity: 0,
      };
      part.item.keys = [{ at: local, frames: 1, scale, ease: "linear" }, ...(part.item.keys ?? [])];
      pushKey(part.item, { at: local + 1, frames, scale: 1, x: rest.x, y: rest.y, opacity: rest.opacity });
    }
  }
}

/** Glisse un acteur entier (et l'agrandit autour de son centre) à partir de `frameAt`. */
function moveGroup(build: ActorBuild, frameAt: number, frames: number, target: { x?: number; y?: number }, scale?: number) {
  const fromX = build.box.x;
  const fromY = build.box.y;
  const toCenterX = target.x ?? fromX;
  const toCenterY = target.y ?? fromY;
  const factor = scale ?? 1;
  for (const part of build.parts) {
    const local = frameAt - part.item.start;
    const x = restX(part.item, frameAt);
    const y = restY(part.item, frameAt);
    const key: MoveKey = {
      at: local,
      frames,
      x: toCenterX + (x - fromX) * factor,
      y: toCenterY + (y - fromY) * factor,
    };
    if (scale !== undefined) key.scale = factor;
    pushKey(part.item, key);
  }
  build.box = { x: toCenterX, y: toCenterY, width: build.box.width * factor, height: build.box.height * factor };
}

/** Pâlit un acteur (ou ses seuls textes) jusqu'à `opacity`. */
function fadeGroup(build: ActorBuild, frameAt: number, frames: number, opacity: number, only?: (part: Placed) => boolean) {
  for (const part of build.parts) {
    if (only && !only(part)) continue;
    pushKey(part.item, { at: frameAt - part.item.start, frames, opacity, ease: "smooth" });
  }
}

// ─── Traits ──────────────────────────────────────────────────────

function strokeItem(start: number, duration: number, box: Box, paths: StrokePath[], width: number, color: string, label: string): ShapeItem {
  const item = shapeItem(start, duration, box, color, 0);
  item.shape = "stroke";
  item.stroke = { paths, width };
  item.label = label;
  return item;
}

/** Croix dessinée sur un acteur, ou sous lui (une petite croix centrée sous un logo). */
function crossOf(build: ActorBuild, place: "over" | "below", frameAt: number, frames: number, palette: BoardPalette, frame: { width: number; height: number }, px: (value: number) => number): Placed {
  const minSide = Math.min(frame.width, frame.height);
  const box = build.box;
  const size = place === "over" ? { width: box.width * 0.86, height: box.height * 0.86 } : { width: (px(36) / frame.width), height: px(36) / frame.height };
  const center = place === "over" ? { x: box.x, y: box.y } : { x: box.x, y: box.y + box.height / 2 + px(SPACE.m) / frame.height };
  const half = Math.max(1, Math.round(frames / 2));
  const item = strokeItem(frameAt, build.endFrame - frameAt, boxAround(center.x, center.y, size.width, size.height), [
    { points: [[0, 0], [1, 1]], draw: { at: 0, frames: half } },
    { points: [[1, 0], [0, 1]], draw: { at: half, frames: half } },
  ], px(place === "over" ? 10 : 5) / minSide, palette.ink, "Planche – croix");
  return { item, layer: "overlay" };
}

/** Point de départ ou d'arrivée d'un trait : le centre d'un acteur, ou un point de la zone. */
function endpoint(end: string | { x: number; y: number }, builds: Map<string, ActorBuild>, toX: (x: number) => number, toY: (y: number) => number) {
  if (typeof end !== "string") return { x: toX(end.x), y: toY(end.y), box: null };
  const build = builds.get(end);
  return build ? { x: build.box.x, y: build.box.y, box: build.box } : null;
}

/** Où un segment qui part du centre d'une boîte en sort (avec une petite marge). */
function exitPoint(from: { x: number; y: number }, toward: { x: number; y: number }, box: { width: number; height: number } | null, margin: number): { x: number; y: number } {
  if (!box) return from;
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const tx = dx !== 0 ? (box.width / 2 + margin) / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? (box.height / 2 + margin) / Math.abs(dy) : Infinity;
  const t = Math.min(1, tx, ty);
  return { x: from.x + dx * t, y: from.y + dy * t };
}

/**
 * Trait entre deux points, légèrement courbé. Une liaison part des centres
 * (elle passe sous les acteurs, qui la cachent) ; une flèche part du bord
 * de l'acteur et s'arrête avant le suivant, pour que sa pointe se voie.
 */
function lineBetween(
  from: { x: number; y: number; box: { width: number; height: number } | null },
  to: { x: number; y: number; box: { width: number; height: number } | null },
  arrow: boolean,
  bend: number,
  start: number,
  end: number,
  frames: number,
  palette: BoardPalette,
  frame: { width: number; height: number },
  px: (value: number) => number
): Placed {
  const margin = px(SPACE.s) / frame.height;
  const a = arrow ? exitPoint(from, to, from.box, margin) : from;
  const b = arrow ? exitPoint(to, from, to.box, margin) : to;
  // Boîte du trait, avec de la place pour la courbe et la pointe.
  const pad = px(SPACE.l) / frame.height;
  const left = Math.min(a.x, b.x) - pad;
  const top = Math.min(a.y, b.y) - pad;
  const width = Math.abs(a.x - b.x) + pad * 2;
  const height = Math.abs(a.y - b.y) + pad * 2;
  const local = (point: { x: number; y: number }): [number, number] => [(point.x - left) / width, (point.y - top) / height];
  // Milieu poussé sur le côté, perpendiculaire au trait, en pixels réels.
  const ax = a.x * frame.width;
  const ay = a.y * frame.height;
  const bx = b.x * frame.width;
  const by = b.y * frame.height;
  const length = Math.hypot(bx - ax, by - ay) || 1;
  const mid = { x: ((ax + bx) / 2 - ((by - ay) / length) * length * bend) / frame.width, y: ((ay + by) / 2 + ((bx - ax) / length) * length * bend) / frame.height };
  const minSide = Math.min(frame.width, frame.height);
  const item = strokeItem(start, end - start, { left, top, width, height }, [
    { points: [local(a), local(mid), local(b)], smooth: true, head: arrow ? "end" : undefined, draw: { at: 0, frames } },
  ], px(arrow ? 6 : 4) / minSide, arrow ? palette.ink : palette.muted, arrow ? "Planche – flèche" : "Planche – liaison");
  return { item, layer: arrow ? "overlay" : "link" };
}

// ─── Contrôle du placement ───────────────────────────────────────

/**
 * Défauts de placement d'une planche, mesurés sur les boîtes des acteurs à
 * leur place finale : deux acteurs présents en même temps qui se touchent
 * à moins d'un petit écart de la grille (sauf recouvrement voulu, ou
 * acteur qui se change en l'autre), ou un acteur qui sort de la zone.
 */
function placementIssues(spec: BoardSpec, builds: Map<string, ActorBuild>, frame: { width: number; height: number }, fps: number): string[] {
  const issues: string[] = [];
  const gapX = (SPACE.xs * frame.width) / 1080 / frame.width;
  const gapY = (SPACE.xs * frame.width) / 1080 / frame.height;
  const morphing = new Set((spec.actions ?? []).flatMap((action) => (action.verb === "morph" ? [`${action.actor}|${action.into}`, `${action.into}|${action.actor}`] : [])));
  const list = [...builds.values()];
  const edge = 0.5 / Math.min(frame.width, frame.height);
  for (const build of list) {
    const box = build.box;
    const area = spec.area;
    if (box.x - box.width / 2 < area.left - edge || box.x + box.width / 2 > area.left + area.width + edge || box.y - box.height / 2 < area.top - edge || box.y + box.height / 2 > area.top + area.height + edge) {
      issues.push(`« ${build.actor.id} » sort de la zone de la planche`);
    }
  }
  // Jamais de papier vide : le premier acteur arrive dans le dixième de seconde qui suit le début de la planche.
  const firstEnter = Math.min(...list.map((build) => build.enterFrame));
  if (list.length === 0) issues.push("planche vide");
  else if (firstEnter - spec.start > Math.round(fps / 10)) issues.push(`planche vide pendant ${((firstEnter - spec.start) / fps).toFixed(2).replace(".", ",")} s au début`);
  for (let index = 0; index < list.length; index++) {
    for (let other = index + 1; other < list.length; other++) {
      const a = list[index];
      const b = list[other];
      if (a.actor.overlap || b.actor.overlap || morphing.has(`${a.actor.id}|${b.actor.id}`)) continue;
      if (a.endFrame <= b.enterFrame || b.endFrame <= a.enterFrame) continue;
      const apart =
        Math.abs(a.box.x - b.box.x) >= (a.box.width + b.box.width) / 2 + gapX ||
        Math.abs(a.box.y - b.box.y) >= (a.box.height + b.box.height) / 2 + gapY;
      if (!apart) issues.push(`« ${a.actor.id} » et « ${b.actor.id} » se chevauchent`);
    }
  }
  return issues;
}
