/**
 * « Monter ma prise » (dossier 01, illustrations, étape I2) : du plan des
 * tableaux aux planches.
 *
 * Chaque tableau du plan (`take-plan.ts`) devient une partition de planche
 * (`board.ts`) : ses objets reçoivent une place calculée sur la grille
 * d'espacements, selon sa disposition, et entrent sur leurs mots ; les
 * barres, croix et liaisons tombent sur les mots qui les appellent. Le
 * titre et le corps d'un tableau sont centrés ensemble dans la zone où l'on
 * écrit ; un tableau trop haut pour elle est réduit, jamais coupé.
 *
 * Fonction pure : la seule entrée du monde extérieur est la liste des logos
 * trouvés.
 */

import { column, SPACE, stack, type BoardActor, type BoardAction, type BoardAt, type BoardMark, type BoardPalette, type BoardSpec, type EnterStyle } from "./board";
import type { Box, TakeGeometry } from "./take-templates";
import type { BeatSpan, SceneHeading, SceneItem, TakeLayout } from "./take-plan";
import type { MascotPose } from "./brand";
import { pickRankedPose, type PoseGesture } from "./poses";
import type { MediaSource } from "./types";

/** Zone d'écriture et boîte du papier d'une mise en page. */
export interface LayoutBoxes {
  /** Où l'on écrit, hors des bandes que couvre l'interface des plateformes et des sous-titres. */
  content: Box;
  /** Papier (le fond de la planche). */
  paper: Box;
}

/** Zone d'écriture et papier d'un tableau selon sa mise en page. */
export function layoutBoxes(geometry: TakeGeometry, layout: TakeLayout): LayoutBoxes {
  if (layout !== "board") return { content: geometry.content, paper: geometry.board };
  // Planche seule : le papier couvre tout le cadre ; on écrit au-dessus des sous-titres de la planche.
  if (geometry.orientation === "horizontal") return { content: { left: 0.06, top: 0.1, width: 0.88, height: 0.62 }, paper: { left: 0, top: 0, width: 1, height: 1 } };
  const top = geometry.content.top;
  const bottom = geometry.captionBoardY - 0.07;
  return { content: { left: geometry.content.left, top, width: geometry.content.width, height: bottom - top }, paper: { left: 0, top: 0, width: 1, height: 1 } };
}

export interface SceneContext {
  fps: number;
  frame: { width: number; height: number };
  geometry: TakeGeometry;
  /** Logos trouvés, par clé `tableau:objet`. */
  logos?: Map<string, MediaSource>;
  palette?: BoardPalette;
  /** Mise en page du tableau d'avant, pour faire glisser le papier de l'une à l'autre. */
  previousLayout?: TakeLayout;
  /** Rang du tableau dans le plan (clé des logos). */
  index: number;
  /** Premier tableau : ce qui est posé sans mot est là dès la première image. */
  opening: boolean;
  /** Mascotte de la marque : sa bibliothèque de poses, ou ses réactions sans étiquette. */
  mascot?: { library?: MascotPose[]; reactions: MediaSource[] };
  /**
   * Poses déjà montrées dans le montage, la dernière en premier : la même
   * pose ne revient pas deux fois de suite. Rempli au fil des tableaux.
   */
  usedPoses?: string[];
}

/** Pose de la mascotte pour une émotion (et un geste), jamais la dernière montrée ; `undefined` sans mascotte. */
export function mascotPose(context: SceneContext, emotion: string, gesture?: PoseGesture): MediaSource | undefined {
  const mascot = context.mascot;
  if (!mascot) return undefined;
  const used = context.usedPoses ?? [];
  if (mascot.library?.length) {
    const pose = pickRankedPose(mascot.library, (entry) => entry.tags, (entry) => entry.id, { emotion: emotion as never, gesture, exclude: used.slice(0, 1) });
    if (pose) {
      used.unshift(pose.id);
      return pose.source;
    }
  }
  // Sans bibliothèque étiquetée : les réactions de la marque, à tour de rôle.
  if (mascot.reactions.length === 0) return undefined;
  const next = mascot.reactions.find((source) => source.ref !== used[0]) ?? mascot.reactions[0];
  used.unshift(next.ref);
  return next;
}

/** Clé d'un logo dans la liste des logos trouvés. */
export const logoKey = (sceneIndex: number, itemIndex: number) => `${sceneIndex}:${itemIndex}`;

/** Corps des textes, en part de la hauteur du cadre. */
const SIZE = { heading: 0.046, single: 0.06, counter: 0.085, card: 0.03, chip: 0.026, note: 0.028, stackText: 0.048 } as const;

/**
 * Hauteur de la mascotte, en pixels d'un cadre de 1080 de large : seule, en
 * pile ou dans une rangée. Elle réagit : on la voit, elle n'est pas un timbre.
 */
const MASCOT_HEIGHT = { single: 700, stack: 500, row: 440 } as const;

/** Numérotation écrite par le modèle (« 1. », « 2) ») : la liste numérote déjà ses cartes. */
const stripNumbering = (text: string) => text.replace(/^\s*\d{1,2}\s*[.)\-–:]\s+/, "");

/** Nombre de lignes probable d'un texte dans une largeur (une lettre grasse fait environ 0,56 em). */
function estimateLines(text: string, sizePx: number, widthPx: number, max = 2): number {
  return Math.max(1, Math.min(max, Math.ceil((text.length * 0.56 * sizePx) / Math.max(1, widthPx))));
}

/** Mots d'un texte (coupé aux espaces) qui forment `mark` : leur rang, du premier au dernier exclu. */
export function wordRange(text: string, mark: string | undefined): { from: number; to: number } | undefined {
  if (!mark) return undefined;
  const clean = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const tokens = text.split(" ").filter(Boolean).map(clean);
  const target = mark.split(/\s+/).filter(Boolean).map(clean).filter(Boolean);
  if (target.length === 0) return undefined;
  for (let index = 0; index + target.length <= tokens.length; index++) {
    if (target.every((part, offset) => tokens[index + offset] === part)) return { from: index, to: index + target.length };
  }
  return undefined;
}

/** Marques d'un titre ou d'un objet : pavé sur un mot, trait sous un autre (qui se dessine sur son mot). */
function marksOf(text: string, pill?: string, underline?: string, underlineWord?: number): BoardMark[] {
  const marks: BoardMark[] = [];
  const pillRange = wordRange(text, pill);
  if (pillRange) marks.push({ kind: "pill", ...pillRange });
  const lineRange = wordRange(text, underline);
  if (lineRange) marks.push({ kind: "underline", ...lineRange, color: "ink", ...(underlineWord !== undefined ? { at: { word: underlineWord } } : {}) });
  return marks;
}

/** Plan de placement d'un tableau à l'échelle `scale` : acteurs posés autour de `y = 0`, et la hauteur du bloc. */
interface Layout {
  actors: BoardActor[];
  actions: BoardAction[];
  /** Haut et bas du bloc (titre compris), en pixels, depuis le centre. */
  height: number;
}

/**
 * Tableau → planche. Les tailles partent de la grille ; le bloc entier
 * (titre et corps) est centré dans la zone d'écriture, et réduit d'un coup
 * s'il ne tient pas dans sa hauteur.
 */
export function sceneBoard(span: BeatSpan, context: SceneContext): BoardSpec | null {
  const beat = span.beat;
  if (beat.layout === "full") return null;
  const boxes = layoutBoxes(context.geometry, beat.layout);
  const area = boxes.content;
  const areaPx = { width: area.width * context.frame.width, height: area.height * context.frame.height };
  // Un tableau remplit sa zone : trop haut, il est réduit ; trop petit (moins des deux tiers de la hauteur),
  // il est agrandi, d'un tiers au plus, pour que rien ne paraisse perdu sur le papier.
  // Chaque essai de mise en page choisit ses poses sur une copie : seul l'essai retenu les note comme montrées.
  const shown = context.usedPoses ?? [];
  const arrange = (scale: number) => {
    const used = [...shown];
    return { ...layoutScene(beat.heading, beat.items ?? [], beat.arrangement ?? "single", scale, areaPx, { ...context, usedPoses: used }), used };
  };
  let layout = arrange(1);
  if (layout.height > areaPx.height) layout = arrange((areaPx.height / layout.height) * 0.98);
  else if (layout.height > 0 && layout.height < areaPx.height * 0.66) {
    const grown = arrange(Math.min(MAX_GROWTH, (areaPx.height * 0.8) / layout.height));
    if (grown.height <= areaPx.height && fitsWidth(grown, areaPx)) layout = grown;
  }
  shown.splice(0, shown.length, ...layout.used);
  const previous = context.previousLayout && context.previousLayout !== "full" ? layoutBoxes(context.geometry, context.previousLayout).paper : context.previousLayout === "full" ? { ...boxes.paper, height: 0 } : undefined;
  return {
    area,
    paperBox: boxes.paper,
    ...(previous && !sameBox(previous, boxes.paper) ? { paperFrom: previous } : {}),
    start: span.start,
    end: span.end,
    paper: true,
    actors: layout.actors,
    actions: layout.actions,
  };
}

/** Agrandissement maximal d'un tableau qui ne remplit pas sa zone. */
const MAX_GROWTH = 1.34;

/** Les acteurs agrandis tiennent-ils dans la largeur de la zone (boîtes connues : cartes, notes, images) ? */
function fitsWidth(layout: Layout, areaPx: { width: number; height: number }): boolean {
  return layout.actors.every((actor) => !("w" in actor) || actor.w === undefined || (actor.x - actor.w / 2 >= -1e-6 && actor.x + actor.w / 2 <= 1 + 1e-6));
}

const sameBox = (a: Box, b: Box) => Math.abs(a.left - b.left) + Math.abs(a.top - b.top) + Math.abs(a.width - b.width) + Math.abs(a.height - b.height) < 1e-6;

function layoutScene(heading: SceneHeading | undefined, items: SceneItem[], arrangement: NonNullable<BeatSpan["beat"]["arrangement"]>, scale: number, areaPx: { width: number; height: number }, context: SceneContext): Layout {
  const { frame } = context;
  const s = (px: number) => px * scale * (frame.width / 1080);
  // Pixels du cadre en parts de la zone ; positions autour du centre de la zone.
  const ax = (px: number) => px / areaPx.width;
  const ay = (px: number) => px / areaPx.height;
  const actors: BoardActor[] = [];
  const actions: BoardAction[] = [];
  const enter = (word: number | undefined, style: EnterStyle): BoardActor["enter"] => {
    if (word === undefined) return context.opening ? undefined : { at: 0, style };
    if (context.opening && word === 0) return undefined;
    return { at: { word }, style };
  };

  // ── Corps : des blocs posés autour de y = 0 (pixels), puis centrés avec le titre.
  const body: { build: (top: number) => void; height: number } = bodyOf(items, arrangement, s, areaPx, context, actors, actions, enter);

  const headingSize = SIZE.heading * scale;
  const headingPx = heading ? estimateLines(heading.text, headingSize * frame.height, areaPx.width) * headingSize * frame.height * 1.12 : 0;
  const gap = heading && body.height > 0 ? s(SPACE.l) : 0;
  const total = headingPx + gap + body.height;
  const [headingCenter, bodyCenter] = column([ay(headingPx), ay(body.height)], ay(gap));
  if (heading) {
    actors.push({
      id: "heading",
      kind: "text",
      text: heading.text,
      size: headingSize,
      x: 0.5,
      y: headingCenter,
      w: 1,
      h: ay(headingPx),
      // Au-dessus d'une liste, le titre s'aligne sur elle (à gauche) ; sinon il est centré.
      align: arrangement === "list" ? "left" : "center",
      marks: marksOf(heading.text, heading.pill, heading.underline, heading.underlineWord),
      ...(context.opening ? {} : { enter: { at: 0, style: "rise" as EnterStyle } }),
    });
  }
  body.build((bodyCenter - ay(body.height) / 2) * areaPx.height);
  return { actors, actions, height: total };
}

type EnterFn = (word: number | undefined, style: EnterStyle) => BoardActor["enter"];

/**
 * Corps d'un tableau selon sa disposition : sa hauteur, et une fonction qui
 * pose ses acteurs à partir d'un haut donné (en pixels depuis le haut de la
 * zone).
 */
function bodyOf(items: SceneItem[], arrangement: string, s: (px: number) => number, areaPx: { width: number; height: number }, context: SceneContext, actors: BoardActor[], actions: BoardAction[], enter: EnterFn): { build: (top: number) => void; height: number } {
  const { frame } = context;
  const ax = (px: number) => px / areaPx.width;
  const ay = (px: number) => px / areaPx.height;
  const verbs = (id: string, item: SceneItem, crossPlace: "over" | "below" = "over") => {
    if (item.strike !== undefined) actions.push({ verb: "strike", actor: id, at: { word: item.strike } });
    if (item.cross !== undefined) actions.push({ verb: "cross", actor: id, at: { word: item.cross }, place: crossPlace });
  };
  const logoSource = (index: number) => context.logos?.get(logoKey(context.index, index));
  const cardHeight = s(150);

  /** Un objet en grand, centré, pour « single » et chaque étage d'une pile. */
  const hero = (item: SceneItem, index: number, inStack: boolean): { height: number; place: (centerY: number) => void } => {
    const id = `item-${index}`;
    const size = (value: number) => value * (s(1080) / 1080) * (1080 / frame.width) * (inStack ? 0.8 : 1);
    switch (item.kind) {
      case "counter": {
        const fontSize = size(SIZE.counter);
        const height = fontSize * frame.height * 1.12;
        return {
          height,
          place: (y) => {
            actors.push({ id, kind: "counter", value: item.text, unit: item.unit, from: 0, size: fontSize, x: 0.5, y: ay(y), enter: enter(item.word, "rise") });
            actions.push({ verb: "count", actor: id, at: item.word !== undefined ? { word: item.word } : 0, seconds: 1.2 });
          },
        };
      }
      case "logo": {
        const source = logoSource(index);
        if (source) {
          const side = s(inStack ? 220 : 300);
          return {
            height: side + (item.cross !== undefined ? s(SPACE.m + 18) : 0),
            place: (y) => {
              actors.push({ id, kind: "image", source, x: 0.5, y: ay(y - (item.cross !== undefined ? s(SPACE.m + 18) / 2 : 0)), w: ax(side), h: ay(side), tile: true, label: `Logo – ${item.text}`, enter: enter(item.word, "pop") });
              verbs(id, item, "below");
            },
          };
        }
        // Pas de logo officiel trouvé : le nom, en grand, plutôt qu'un faux.
        return hero({ ...item, kind: "text" }, index, inStack);
      }
      case "mascot": {
        const source = mascotPose(context, item.text, item.gesture);
        if (!source) return { height: 0, place: () => undefined };
        const side = s(inStack ? MASCOT_HEIGHT.stack : MASCOT_HEIGHT.single);
        const ratio = (source.width ?? 1) / Math.max(1, source.height ?? 1);
        // Une pose large tient dans la largeur de la zone ; une pose haute prend toute la hauteur voulue.
        const width = Math.min(ratio >= 1 ? side : side * ratio, areaPx.width);
        const height = width / ratio;
        return { height, place: (y) => actors.push({ id, kind: "image", source, x: 0.5, y: ay(y), w: ax(width), h: ay(height), label: `Mascotte – ${item.text}`, enter: enter(item.word, "pop") }) };
      }
      case "terminal": {
        const lines = item.lines ?? [];
        const fontSize = size(0.021);
        const height = s(64) + s(SPACE.m) * 2 + Math.max(1, lines.length) * fontSize * frame.height * 1.55;
        return {
          height,
          place: (y) =>
            actors.push({
              id,
              kind: "terminal",
              title: item.text,
              x: 0.5,
              y: ay(y),
              w: 1,
              size: fontSize,
              lines: lines.map((line) => ({ text: line.text, kind: line.kind, ...(line.word !== undefined ? { at: { word: line.word } } : {}) })),
              enter: enter(item.word, "rise"),
            }),
        };
      }
      case "prompt": {
        const fontSize = size(0.024);
        return { height: fontSize * frame.height * 2.9, place: (y) => actors.push({ id, kind: "prompt", text: item.text, placeholder: "Demander à l'assistant", x: 0.5, y: ay(y), w: 1, size: fontSize, ...(item.word !== undefined ? { typeAt: { word: item.word } } : {}), enter: enter(undefined, "rise") }) };
      }
      case "phone": {
        const height = Math.min(areaPx.height * (inStack ? 0.7 : 0.96), s(inStack ? 560 : 760));
        return { height, place: (y) => actors.push({ id, kind: "phone", title: item.title ?? "Statistiques", label: item.label, value: item.text, unit: item.unit, x: 0.5, y: ay(y), h: ay(height), ...(item.word !== undefined ? { countAt: { word: item.word } } : {}), enter: enter(undefined, "rise") }) };
      }
      case "tree": {
        const lines = item.lines ?? [];
        const fontSize = size(0.022);
        const height = s(SPACE.m) * 2 + fontSize * frame.height * (2 + lines.length * 1.9);
        return { height, place: (y) => actors.push({ id, kind: "tree", title: item.text, x: 0.5, y: ay(y), w: Math.min(1, ax(s(720))), size: fontSize, entries: lines.map((line) => ({ text: line.text, ...(line.word !== undefined ? { at: { word: line.word } } : {}) })), enter: enter(item.word, "rise") }) };
      }
      case "chip": {
        const fontSize = size(SIZE.chip) * 1.2;
        return { height: fontSize * frame.height * 1.2, place: (y) => (actors.push({ id, kind: "chip", text: item.text, size: fontSize, x: 0.5, y: ay(y), enter: enter(item.word, "pop") }), verbs(id, item)) };
      }
      case "card": {
        const height = s(200);
        return { height, place: (y) => (actors.push({ id, kind: "card", text: item.text, x: 0.5, y: ay(y), w: Math.min(1, ax(s(640))), h: ay(height), size: size(SIZE.card) * 1.2, marks: marksOf(item.text, item.pill, item.underline, item.underlineWord), enter: enter(item.word, "rise") }), verbs(id, item)) };
      }
      case "note": {
        const width = s(460);
        const height = s(240);
        return { height, place: (y) => actors.push({ id, kind: "note", text: item.text, x: 0.5, y: ay(y), w: ax(width), h: ay(height), tilt: -3, size: size(SIZE.note) * 1.15, enter: enter(item.word, "pop") }) };
      }
      default: {
        const fontSize = size(inStack ? SIZE.stackText / 0.8 * 0.9 : SIZE.single);
        const height = estimateLines(item.text, fontSize * frame.height, areaPx.width, 3) * fontSize * frame.height * 1.12;
        return { height, place: (y) => (actors.push({ id, kind: "text", text: item.text, size: fontSize, x: 0.5, y: ay(y), w: 1, h: ay(height), marks: marksOf(item.text, item.pill, item.underline, item.underlineWord), enter: enter(item.word, "rise") }), verbs(id, item)) };
      }
    }
  };

  switch (arrangement) {
    case "row": {
      const count = items.length;
      const gap = s(count > 3 ? SPACE.m : SPACE.l);
      const logos = items.every((item) => item.kind === "logo");
      // Les cartes se partagent toute la largeur ; des logos seuls restent carrés, jamais plus de 300 px.
      const share = (areaPx.width - gap * (count - 1)) / count;
      const side = logos ? Math.min(s(300), share) : share;
      const crossRoom = items.some((item) => item.cross !== undefined) ? s(SPACE.m + 18) : 0;
      const cellHeight = logos ? side : s(230);
      // Une mascotte dans la rangée y garde sa hauteur : la rangée s'aligne sur elle.
      const mascotHeight = items.some((item) => item.kind === "mascot") ? s(MASCOT_HEIGHT.row) : 0;
      const rowHeight = Math.max(cellHeight, mascotHeight);
      const xs = stack(count, ax(side), ax(gap), 0.5);
      return {
        height: rowHeight + crossRoom,
        build: (top) => {
          const y = ay(top + rowHeight / 2);
          items.forEach((item, index) => {
            const id = `item-${index}`;
            if (item.kind === "mascot") {
              const pose = mascotPose(context, item.text, item.gesture);
              if (!pose) return;
              const ratio = (pose.width ?? 1) / Math.max(1, pose.height ?? 1);
              const width = Math.min(side, mascotHeight * ratio);
              actors.push({ id, kind: "image", source: pose, x: xs[index], y, w: ax(width), h: ay(width / ratio), label: `Mascotte – ${item.text}`, enter: enter(item.word, "pop") });
              return;
            }
            const source = item.kind === "logo" ? logoSource(index) : undefined;
            const square = Math.min(side, s(300));
            if (source) actors.push({ id, kind: "image", source, x: xs[index], y, w: ax(square), h: ay(square), tile: true, label: `Logo – ${item.text}`, enter: enter(item.word, "pop") });
            else actors.push({ id, kind: "card", text: item.text, x: xs[index], y, w: ax(side), h: ay(cellHeight), size: SIZE.card * Math.min(1.15, side / s(260)), enter: enter(item.word, "pop") });
            verbs(id, item, "below");
          });
        },
      };
    }
    case "list": {
      // Les cartes se rangent dans l'ordre où elles entrent : la n-ième dite est la n-ième de la liste.
      const cards = items.filter((item) => item.kind !== "note").sort((a, b) => (a.word ?? -1) - (b.word ?? -1));
      const notes = items.filter((item) => item.kind === "note");
      const height = cards.length > 3 ? s(124) : cardHeight;
      const gap = s(28);
      // Un pense-bête se pose au-dessus de la liste, à droite et en biais : il ne cache jamais le texte d'une carte.
      const note = notes[0];
      const noteHeight = note ? s(190) : 0;
      const noteRoom = note ? noteHeight + s(SPACE.m) : 0;
      const cardsHeight = cards.length * height + (cards.length - 1) * gap;
      const total = noteRoom + cardsHeight;
      return {
        height: total,
        build: (top) => {
          if (note) {
            actors.push({ id: `item-${items.indexOf(note)}`, kind: "note", text: note.text, x: 1 - ax(s(360)) / 2, y: ay(top + noteHeight / 2), w: ax(s(360)), h: ay(noteHeight), tilt: 4, size: SIZE.note, enter: enter(note.word, "pop") });
          }
          const ys = column(cards.map(() => ay(height)), ay(gap), ay(top + noteRoom + cardsHeight / 2));
          cards.forEach((item, index) => {
            const id = `item-${items.indexOf(item)}`;
            actors.push({ id, kind: "card", index: String(index + 1).padStart(2, "0"), text: stripNumbering(item.text), x: 0.5, y: ys[index], w: 1, h: ay(height), size: SIZE.card, marks: marksOf(item.text, item.pill, item.underline, item.underlineWord), enter: enter(item.word, "rise") });
            verbs(id, item);
          });
        },
      };
    }
    case "hub": {
      const [center, ...around] = items;
      const centerSize = { width: Math.min(s(440), areaPx.width * 0.5), height: s(190) };
      const chip = s(56);
      // Pastilles à un écart franc de la carte : SPACE.l au-dessus ou en dessous d'elle.
      const dy = centerSize.height / 2 + s(SPACE.l) + chip / 2;
      const spots = [
        { x: 0.8, y: -dy },
        { x: 0.8, y: dy },
        { x: 0.2, y: dy },
        { x: 0.2, y: -dy },
        { x: 0.5, y: -dy - chip - s(SPACE.m) },
      ].slice(0, Math.min(5, around.length));
      // Hauteur du bloc : de la plus haute à la plus basse chose posée, carte comprise.
      const minY = Math.min(-centerSize.height / 2, ...spots.map((spot) => spot.y - chip / 2));
      const maxY = Math.max(centerSize.height / 2, ...spots.map((spot) => spot.y + chip / 2));
      return {
        height: maxY - minY,
        build: (top) => {
          const centerY = top - minY;
          actors.push({ id: "item-0", kind: "card", text: center.text, x: 0.5, y: ay(centerY), w: ax(centerSize.width), h: ay(centerSize.height), size: SIZE.card, enter: enter(center.word, "fade") });
          spots.forEach((spot, index) => {
            const item = around[index];
            const id = `item-${index + 1}`;
            actors.push({ id, kind: "chip", text: item.text, dot: true, size: SIZE.chip * 0.92, x: spot.x, y: ay(centerY + spot.y), enter: enter(item.word, "pop") });
            actions.push({ verb: "link", from: "item-0", to: id, at: item.word !== undefined ? ({ word: item.word } as BoardAt) : 0 });
          });
        },
      };
    }
    case "versus": {
      const [before, after] = items;
      const gap = s(SPACE.m);
      const width = (areaPx.width - gap) / 2;
      const height = s(240);
      const xs = stack(2, ax(width), ax(gap), 0.5);
      return {
        height,
        build: (top) => {
          const y = ay(top + height / 2);
          [before, after].forEach((item, index) => {
            const id = `item-${index}`;
            actors.push({ id, kind: "card", text: item.text, x: xs[index], y, w: ax(width), h: ay(height), size: SIZE.card * 1.1, marks: marksOf(item.text, item.pill, item.underline, item.underlineWord), enter: enter(item.word, index === 0 ? "rise" : "pop") });
            verbs(id, item);
          });
        },
      };
    }
    case "stack": {
      const floors = items.map((item, index) => hero(item, index, true));
      const gap = s(SPACE.m);
      const total = floors.reduce((sum, floor) => sum + floor.height, 0) + gap * (floors.length - 1);
      return {
        height: total,
        build: (top) => {
          let cursor = top;
          for (const floor of floors) {
            floor.place(cursor + floor.height / 2);
            cursor += floor.height + gap;
          }
        },
      };
    }
    default: {
      if (items.length === 0) return { height: 0, build: () => undefined };
      const floor = hero(items[0], 0, false);
      return { height: floor.height, build: (top) => floor.place(top + floor.height / 2) };
    }
  }
}
