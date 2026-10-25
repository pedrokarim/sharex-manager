/**
 * Dessin d'une image du clip sur un canevas 2D.
 *
 * C'est l'unique fonction de rendu : l'aperçu l'appelle à chaque image
 * affichée, l'export à chaque image encodée. Ce que l'on voit dans l'éditeur
 * est donc exactement ce qui sort dans le MP4.
 */

import { itemAtFrame } from "./keys";
import { formatColor, parseColor } from "./motion/color";
import { caretVisible, counterText, scrambleLines, scrambleTick, scrambleUnit } from "./motion/effects";
import { getShotFx, getTransition, shotBlendAt, shotFxValues, type ShotTracks } from "./motion/scenes";
import {
  echoProgress,
  isRestState,
  restState,
  sampleKeyframes,
  sampleTracks,
  stateForUnit,
  tileCount,
  unitProgress,
  unitRandom,
  type ActiveEffect,
  type UnitOptions,
} from "./motion/interpret";
import {
  graphemeCount,
  sliceGraphemes,
  textLayout,
  wrapText,
  type TextLayout,
  type TextUnit,
} from "./motion/text-layout";
import type { MotionEffect, MotionLayer, MotionMask, MotionState } from "./motion/types";
import {
  cameraAt,
  isActive,
  motionAt,
  splitPhaseAt,
  transitionAt,
  type ActivePhase,
  type AnimState,
  type CameraState,
  type ItemMotion,
  type LayerSample,
  type SplitPhase,
  type TransitionState,
} from "./timeline";
import type {
  ClipProject,
  ImageItem,
  ShotEffect,
  ShapeItem,
  StrokePath,
  TextMark,
  TextItem,
  TextStyle,
  TimedWord,
  VideoItem,
  VisualItem,
} from "./types";
import { MAX_STROKE_PATHS, MAX_STROKE_POINTS, MAX_TEXT_MARKS } from "./types";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Fournit l'image source d'un élément image ou vidéo à l'instant dessiné. */
export type VisualResolver = (
  item: ImageItem | VideoItem,
  frame: number
) => CanvasImageSource | null;

export function drawFrame(
  ctx: Ctx,
  project: ClipProject,
  frame: number,
  resolve: VisualResolver
) {
  const { width: W, height: H } = project;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = project.background;
  ctx.fillRect(0, 0, W, H);

  // La première piste est au-dessus : on dessine de la dernière à la première.
  for (let index = project.tracks.length - 1; index >= 0; index--) {
    const track = project.tracks[index];
    if (track.kind !== "visual" || track.hidden) continue;
    const items = track.items as VisualItem[];
    const paintTrack = () => {
      for (const item of items) {
        if (!isActive(item, frame)) continue;
        const transition = transitionAt(items, item, frame);
        if (transition) drawTransition(ctx, project, item, transition, frame, resolve);
        else drawItem(ctx, project, item, frame, resolve);
      }
    };
    const shot = track.effects?.length ? shotFxAt(track.effects, frame, project.fps) : null;
    if (shot) drawShotFx(ctx, project, shot, paintTrack);
    else paintTrack();
  }
  ctx.restore();
}

// ─── Effets de plan ──────────────────────────────────────────────

/** Effets de plan d'une piste à une image, cumulés. */
interface ShotState {
  shiftX: number;
  shiftY: number;
  zoom: number;
  rotate: number;
  brightness: number;
  flash: number;
  flashColor: string;
  chroma: number;
}

/**
 * Cumule les effets de plan actifs à l'image `frame` : les décalages et les
 * rotations s'ajoutent, les zooms et les luminosités se multiplient, le flash
 * le plus fort l'emporte. `null` si aucun n'est actif.
 */
export function shotFxAt(effects: ShotEffect[], frame: number, fps: number): ShotState | null {
  let state: ShotState | null = null;
  for (const effect of effects) {
    const preset = getShotFx(effect.kind);
    const frames = Math.max(1, Math.round(effect.frames || ((preset?.durationMs ?? 0) / 1000) * fps));
    const local = frame - Math.round(effect.at);
    if (!preset || local < 0 || local >= frames) continue;
    const values = shotFxValues(preset, local / Math.max(1, frames - 1));
    state ??= { shiftX: 0, shiftY: 0, zoom: 1, rotate: 0, brightness: 1, flash: 0, flashColor: "#ffffff", chroma: 0 };
    state.shiftX += values.shiftX;
    state.shiftY += values.shiftY;
    state.zoom *= values.zoom;
    state.rotate += values.rotate;
    state.brightness *= values.brightness;
    state.chroma += values.chroma;
    if (values.flash > state.flash) {
      state.flash = values.flash;
      state.flashColor = preset.flashColor ?? "#ffffff";
    }
  }
  return state;
}

/**
 * Piste dessinée avec ses effets de plan : le cadre entier bouge (secousse,
 * zoom, rotation), s'éclaire, se dédouble en rouge et cyan, puis un flash
 * le recouvre.
 */
function drawShotFx(ctx: Ctx, project: ClipProject, shot: ShotState, paint: () => void) {
  const { width: W, height: H } = project;
  ctx.save();
  if (shot.shiftX || shot.shiftY || shot.zoom !== 1 || shot.rotate) {
    ctx.translate(W / 2 + shot.shiftX * W, H / 2 + shot.shiftY * H);
    if (shot.rotate) ctx.rotate((shot.rotate * Math.PI) / 180);
    if (shot.zoom !== 1) ctx.scale(shot.zoom, shot.zoom);
    ctx.translate(-W / 2, -H / 2);
  }
  const brightness = shot.brightness !== 1 ? `brightness(${Math.max(0, shot.brightness).toFixed(4)})` : "";
  if (shot.chroma) {
    for (const [channel, sign] of [["red", -1], ["cyan", 1]] as const) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.translate(sign * shot.chroma * W, 0);
      ctx.filter = brightness ? `${brightness} ${CHANNEL_FILTERS[channel]}` : CHANNEL_FILTERS[channel];
      paint();
      ctx.restore();
    }
  }
  if (brightness) ctx.filter = brightness;
  paint();
  ctx.restore();
  if (shot.flash > 0.001) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = Math.min(1, shot.flash);
    ctx.fillStyle = shot.flashColor;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/** Retouches qu'une transition applique au dessin d'un plan. */
interface Blend {
  opacity?: number;
  dx?: number;
  scale?: number;
  wipe?: number;
  dy?: number;
  scaleX?: number;
  scaleY?: number;
  rotate?: number;
  /** Flou ajouté, en part du petit côté du cadre. */
  blur?: number;
  brightness?: number;
  /** Masque de forme du plan qui arrive. */
  mask?: number;
  maskShape?: MotionMask;
}

/** Le plan qui s'en va : figé sur sa dernière image, sans son animation de sortie. */
export function heldFrameOf(item: VisualItem): number {
  return item.start + item.duration - 1;
}

/** Retouches d'un plan à l'avancement `t` d'une transition. */
function blendOf(tracks: ShotTracks, t: number, mask?: MotionMask): Blend {
  const blend: Blend = shotBlendAt(tracks, t);
  if (mask && blend.mask !== undefined) blend.maskShape = mask;
  return blend;
}

/**
 * Transition : le plan qui part (figé) et celui qui arrive, chacun avec ses
 * retouches lues sur les pistes de la transition, puis le voile éventuel.
 */
function drawTransition(
  ctx: Ctx,
  project: ClipProject,
  item: VisualItem,
  { kind, progress: t, from }: TransitionState,
  frame: number,
  resolve: VisualResolver
) {
  const preset = getTransition(kind);
  const outgoing = from ? ({ ...from, animOut: { kind: "none", frames: 0 } } as VisualItem) : null;
  const drawOutgoing = () => {
    if (outgoing) drawItem(ctx, project, outgoing, heldFrameOf(outgoing), resolve, blendOf(preset.from, t));
  };
  const drawIncoming = () => drawItem(ctx, project, item, frame, resolve, blendOf(preset.to, t, preset.mask));
  if (preset.fromOnTop) {
    drawIncoming();
    drawOutgoing();
  } else {
    drawOutgoing();
    drawIncoming();
  }
  if (preset.veil) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = Math.min(1, Math.max(0, sampleKeyframes(preset.veil.opacity, t, 0)));
    ctx.fillStyle = preset.veil.color;
    ctx.fillRect(0, 0, project.width, project.height);
    ctx.restore();
  }
}

/**
 * État d'un élément avec les retouches d'une transition. Seules les retouches
 * déclarées changent quelque chose : hors transition, l'état est intact.
 */
function withBlend(base: AnimState, blend: Blend, unit: number, frameUnit: number): AnimState {
  const state = {
    ...base,
    opacity: base.opacity * (blend.opacity ?? 1),
    dx: base.dx + (blend.dx ?? 0),
    scale: base.scale * (blend.scale ?? 1),
    wipe: Math.min(base.wipe, blend.wipe ?? 1),
  };
  if (blend.dy !== undefined) state.dy += blend.dy;
  if (blend.scaleX !== undefined) state.scaleX *= blend.scaleX;
  if (blend.scaleY !== undefined) state.scaleY *= blend.scaleY;
  if (blend.rotate !== undefined) state.rotate += blend.rotate;
  if (blend.blur !== undefined) state.blur += (blend.blur * frameUnit) / unit;
  if (blend.brightness !== undefined) state.brightness *= blend.brightness;
  if (blend.maskShape && blend.mask !== undefined) {
    state.mask = Math.min(state.maskShape ? state.mask : 1, blend.mask);
    state.maskShape = blend.maskShape;
  }
  return state;
}

function drawItem(
  ctx: Ctx,
  project: ClipProject,
  original: VisualItem,
  frame: number,
  resolve: VisualResolver,
  blend: Blend = {}
) {
  const { width: W, height: H } = project;
  // Images clés : le cadre de l'élément à cette image, et son agrandissement.
  const keyed = itemAtFrame(original, frame);
  const item = keyed.item;
  if (item.type === "text" && (item.marks?.length || item.count)) textLocalFrame.set(item, frame - item.start);
  const motion = motionAt(item, frame);
  const base = motion.state;
  const blended = withBlend(base, blend, lengthUnit(item, base, W, H), Math.min(W, H));
  const anim = keyed.scale === 1 ? blended : { ...blended, scale: blended.scale * keyed.scale };
  const t = item.transform;
  const opacity = t.opacity * anim.opacity;
  const layers = motion.layers;
  // Un anneau ou une ombre gardent leur propre opacité : ils se voient même
  // quand l'élément est encore transparent (une onde qui annonce son arrivée).
  if (opacity <= 0.001 && !layers.some(ownsOpacity)) return;

  const w = t.width * W;
  const h = t.height * H;
  const unit = lengthUnit(item, anim, W, H);
  const fx = effectsOf(item, motion, project.fps);
  const scene: Scene = { ctx, project, item, frame, resolve, w, h, fx };
  if (layers.length) drawLayers(scene, motion, anim, blend, "behind");
  if (opacity > 0.001) {
    const active = motion.active;
    if (active?.preset.grid) drawTiles(scene, anim, active, unit);
    else drawBody(scene, anim, unit, opacity);
  }
  if (layers.length) drawLayers(scene, motion, anim, blend, "front");
}

/** Ce que partagent toutes les passes de dessin d'un élément à une image. */
interface Scene {
  ctx: Ctx;
  project: ClipProject;
  item: VisualItem;
  frame: number;
  resolve: VisualResolver;
  /** Taille de la boîte de l'élément, en pixels. */
  w: number;
  h: number;
  /** Effets actifs, ou `null`. */
  fx: Fx | null;
}

/**
 * Place le contexte au centre de l'élément, avec son état : décalages,
 * rotation, inclinaison, échelles, autour du centre ou de l'ancrage du
 * préréglage. Chaque retouche n'est appliquée que si elle change quelque
 * chose : un élément au repos se dessine exactement comme avant les pistes.
 */
function placeItem(ctx: Ctx, item: VisualItem, anim: AnimState, W: number, H: number, unit: number, w: number, h: number) {
  const t = item.transform;
  ctx.translate((t.x + anim.dx) * W + anim.x * unit, (t.y + anim.dy) * H + anim.y * unit);
  const origin = anim.origin;
  if (origin && (origin[0] !== 0.5 || origin[1] !== 0.5)) {
    // Ancrage : la rotation du cadre reste autour du centre, l'animation
    // tourne et s'agrandit autour de son point.
    if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180);
    const ox = (origin[0] - 0.5) * w;
    const oy = (origin[1] - 0.5) * h;
    ctx.translate(ox, oy);
    applyMotionTransform(ctx, anim.rotate, anim.skewX, anim.scale * anim.scaleX, anim.scale * anim.scaleY);
    ctx.translate(-ox, -oy);
    return;
  }
  const rotation = t.rotation + anim.rotate;
  if (rotation) ctx.rotate((rotation * Math.PI) / 180);
  if (anim.skewX) ctx.transform(1, 0, Math.tan((anim.skewX * Math.PI) / 180), 1, 0, 0);
  const scaleX = anim.scale * anim.scaleX;
  const scaleY = anim.scale * anim.scaleY;
  if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
}

function applyMotionTransform(ctx: Ctx, rotate: number, skewX: number, scaleX: number, scaleY: number) {
  if (rotate) ctx.rotate((rotate * Math.PI) / 180);
  if (skewX) ctx.transform(1, 0, Math.tan((skewX * Math.PI) / 180), 1, 0, 0);
  if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
}

/** Filtre de flou et de luminosité d'un état ; `null` s'il ne change rien. */
function filterOf(state: MotionState, unit: number): string | null {
  const filters: string[] = [];
  if (state.blur > 0) filters.push(`blur(${(state.blur * unit).toFixed(2)}px)`);
  if (state.brightness !== 1) filters.push(`brightness(${Math.max(0, state.brightness).toFixed(4)})`);
  return filters.length ? filters.join(" ") : null;
}

/** L'élément lui-même, avec son état. */
function drawBody(scene: Scene, anim: AnimState, unit: number, opacity: number) {
  const { ctx, project, item, w, h } = scene;
  const { width: W, height: H } = project;
  ctx.save();
  ctx.globalAlpha = opacity;
  placeItem(ctx, item, anim, W, H, unit, w, h);

  // Flou et luminosité : le filtre vit dans l'état sauvegardé, `restore` l'ôte.
  const filter = filterOf(anim, unit);
  if (filter) ctx.filter = filter;

  // Balayage : on ne dessine qu'une bande grandissante de gauche à droite.
  if (anim.wipe < 1) {
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w * anim.wipe, h);
    ctx.clip();
  }

  // Découpe : chaque bord rentre de sa part de l'élément.
  const [top, right, bottom, left] = anim.clip;
  if (top || right || bottom || left) {
    ctx.beginPath();
    ctx.rect(-w / 2 + left * w, -h / 2 + top * h, Math.max(0, w * (1 - left - right)), Math.max(0, h * (1 - top - bottom)));
    ctx.clip();
  }

  // Masque de forme : cercle, biais, taches, stores…
  if (anim.maskShape && anim.mask < 1) {
    if (!(anim.mask > 0)) {
      ctx.restore();
      return;
    }
    maskPath(ctx, anim.maskShape, anim.mask, -w / 2, -h / 2, w, h, item.id);
    ctx.clip();
  }

  const slices = scene.fx?.slices;
  if (slices) drawSlices(scene, slices, () => paintContent(scene, anim));
  else paintContent(scene, anim);
  ctx.restore();
}

/** Le contenu de l'élément, dans son cadre déjà placé. */
function paintContent(scene: Scene, anim: AnimState) {
  const { ctx, project, item, frame, resolve, w, h, fx } = scene;
  const { width: W, height: H } = project;
  switch (item.type) {
    case "image":
    case "video":
      drawMedia(ctx, item, frame, w, h, resolve, project.fps);
      break;
    case "text": {
      // Une entrée, une sortie ou une mise en avant découpée (lignes, mots,
      // lettres) se dessine unité par unité ; sinon, le bloc, comme toujours.
      const split = splitPhaseAt(item, frame);
      if (item.karaoke) drawKaraoke(ctx, item, frame, project.fps, w, H, anim.color, split, W);
      else if (split) drawSplitText(ctx, item, w, h, W, H, split, anim.color, anim.tracking, fx);
      else drawText(ctx, item, w, h, H, anim.reveal, anim.color, anim.tracking, fx);
      break;
    }
    case "shape":
      drawShape(ctx, item, frame, w, h, anim.color, Math.min(W, H));
      break;
  }
}

/**
 * Longueur, en pixels, d'une unité de `x`, `y` et `blur` : la taille du
 * texte pour un préréglage en « em » posé sur un texte, le petit côté du
 * cadre sinon (un « em » n'a pas de sens sur une image).
 */
function lengthUnit(item: VisualItem, anim: AnimState, W: number, H: number): number {
  if (anim.unit === "em" && item.type === "text") return item.style.size * H;
  return Math.min(W, H);
}

// ─── Effets ──────────────────────────────────────────────────────

/** Effet actif, avec son avancement et ses réglages. */
interface FxEntry {
  progress: number;
  options: MotionEffect["options"];
}

/**
 * Effets d'un élément à une image. Ils ne dépendent que de la phase en
 * cours (préréglage, image dans la phase, cadence) et de l'identifiant de
 * l'élément : l'aperçu et l'export tirent les mêmes caractères.
 */
interface Fx {
  seed: string;
  /** Instant dans la phase, en millisecondes. */
  ms: number;
  /** Image dans la phase, et sa cadence. */
  local: number;
  fps: number;
  counter?: FxEntry;
  scramble?: FxEntry;
  cursor?: FxEntry;
  slices?: FxEntry;
  /** Un calque « fond » dessine le fond du texte à la place du bloc. */
  noBackground?: boolean;
  /** Phase en cours, pour l'avancement propre de chaque unité. */
  active: ActivePhase | null;
}

function entryOf(effects: ActiveEffect[], type: string): FxEntry | undefined {
  for (const { effect, progress } of effects) if (effect.type === type) return { progress, options: effect.options };
  return undefined;
}

/** Calque qui prend la place du fond du texte. */
function takesBackground(item: VisualItem, layer: MotionLayer): boolean {
  return layer.kind === "plate" && item.type === "text" && !!item.style.background && layer.options?.source !== "own";
}

function effectsOf(item: VisualItem, motion: ItemMotion, fps: number): Fx | null {
  const noBackground = motion.layers.some((sample) => takesBackground(item, sample.layer));
  if (!motion.effects.length && !noBackground) return null;
  const local = motion.active?.local ?? 0;
  return {
    seed: item.id,
    ms: (local / Math.max(1, fps)) * 1000,
    local,
    fps,
    counter: entryOf(motion.effects, "counter"),
    scramble: entryOf(motion.effects, "scramble"),
    cursor: entryOf(motion.effects, "cursor"),
    slices: entryOf(motion.effects, "slices"),
    noBackground,
    active: motion.active,
  };
}

const optionNumber = (options: MotionEffect["options"], key: string, fallback: number) => {
  const value = options?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const optionString = (options: MotionEffect["options"], key: string, fallback: string) => {
  const value = options?.[key];
  return typeof value === "string" && value ? value : fallback;
};

/**
 * Glitch en tranches : la silhouette est coupée en bandes horizontales, et
 * certaines glissent de côté quelques images, tirées au hasard (reproductible).
 */
function drawSlices(scene: Scene, entry: FxEntry, paint: () => void) {
  const { ctx, w, h, fx, project } = scene;
  const count = Math.max(2, Math.round(optionNumber(entry.options, "count", 6)));
  const amount = optionNumber(entry.options, "amount", 0.04) * Math.min(project.width, project.height);
  const chance = optionNumber(entry.options, "chance", 0.6);
  const tick = scrambleTick(fx?.local ?? 0, fx?.fps ?? 30, optionNumber(entry.options, "rate", 12));
  // L'intensité retombe vers la fin de la fenêtre de l'effet.
  const fade = optionNumber(entry.options, "fade", 0.3);
  const strength = fade > 0 ? Math.min(1, (1 - entry.progress) / fade) : 1;
  const band = h / count;
  for (let index = 0; index < count; index++) {
    const roll = unitRandom(scene.item.id, index, `slice:${tick}`);
    const offset = roll < chance ? (unitRandom(scene.item.id, index, `shift:${tick}`) * 2 - 1) * amount * strength : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w / 2 - Math.abs(amount), -h / 2 + index * band, w + 2 * Math.abs(amount), band);
    ctx.clip();
    if (offset) ctx.translate(offset, 0);
    paint();
    ctx.restore();
  }
}

// ─── Masques de forme ────────────────────────────────────────────

/**
 * Tracé du masque `mask` à l'avancement `m` (de 0 à 1) sur la boîte
 * `(x, y, w, h)`. À 1, la boîte entière est montrée.
 */
function maskPath(ctx: Ctx, mask: MotionMask, m: number, x: number, y: number, w: number, h: number, seed: string) {
  const [ux, uy] = mask.center ?? [0.5, 0.5];
  const cx = x + ux * w;
  const cy = y + uy * h;
  const corners: [number, number][] = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
  const far = Math.max(...corners.map(([px, py]) => Math.hypot(px - cx, py - cy)));
  ctx.beginPath();
  switch (mask.shape) {
    case "circle":
      ctx.arc(cx, cy, Math.max(0, far * m), 0, Math.PI * 2);
      return;
    case "diamond": {
      const reach = Math.max(...corners.map(([px, py]) => Math.abs(px - cx) + Math.abs(py - cy))) * m;
      ctx.moveTo(cx, cy - reach);
      ctx.lineTo(cx + reach, cy);
      ctx.lineTo(cx, cy + reach);
      ctx.lineTo(cx - reach, cy);
      ctx.closePath();
      return;
    }
    case "diagonal": {
      // Un bord droit perpendiculaire à la direction `angle` traverse la boîte.
      const angle = ((mask.angle ?? 0) * Math.PI) / 180;
      const ax = Math.cos(angle);
      const ay = Math.sin(angle);
      const mx = x + w / 2;
      const my = y + h / 2;
      const projections = corners.map(([px, py]) => (px - mx) * ax + (py - my) * ay);
      const low = Math.min(...projections);
      const edge = low + (Math.max(...projections) - low) * m;
      const span = w + h;
      const bx = -ay;
      const by = ax;
      const at = (along: number, across: number): [number, number] => [mx + ax * along + bx * across, my + ay * along + by * across];
      const points = [at(low - span, -span), at(edge, -span), at(edge, span), at(low - span, span)];
      ctx.moveTo(...points[0]);
      for (const point of points.slice(1)) ctx.lineTo(...point);
      ctx.closePath();
      return;
    }
    case "blob": {
      // Taches d'encre : chacune part de son point, un peu après la précédente,
      // et finit par couvrir toute la boîte.
      const count = Math.max(1, Math.round(mask.count ?? 4));
      for (let index = 0; index < count; index++) {
        const px = x + w * (0.2 + 0.6 * unitRandom(seed, index, "blob-x"));
        const py = y + h * (0.2 + 0.6 * unitRandom(seed, index, "blob-y"));
        const delay = (index / count) * 0.35;
        const grow = Math.min(1, Math.max(0, (m - delay) / (1 - delay)));
        const reach = Math.max(...corners.map(([qx, qy]) => Math.hypot(qx - px, qy - py)));
        if (grow <= 0) continue;
        ctx.moveTo(px + reach * grow, py);
        ctx.arc(px, py, reach * grow, 0, Math.PI * 2);
      }
      return;
    }
    case "blinds":
    case "bars": {
      const count = Math.max(1, Math.round(mask.count ?? 8));
      const step = 0.5 / count;
      const vertical = mask.shape === "bars";
      const size = (vertical ? w : h) / count;
      for (let index = 0; index < count; index++) {
        const open = Math.min(1, Math.max(0, (m - index * step) / (1 - (count - 1) * step)));
        if (open <= 0) continue;
        if (vertical) ctx.rect(x + index * size + (size * (1 - open)) / 2, y, size * open, h);
        else ctx.rect(x, y + index * size, w, size * open);
      }
      return;
    }
    case "clock": {
      const start = -Math.PI / 2;
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, far, start, start + Math.PI * 2 * m);
      ctx.closePath();
      return;
    }
    case "tiles": {
      const side = Math.max(1, Math.round(mask.count ?? 6));
      const tw = w / side;
      const th = h / side;
      for (let index = 0; index < side * side; index++) {
        if (unitRandom(seed, index, "tile") >= m) continue;
        ctx.rect(x + (index % side) * tw, y + Math.floor(index / side) * th, tw, th);
      }
      return;
    }
  }
  ctx.rect(x, y, w, h);
}

// ─── Grilles ─────────────────────────────────────────────────────

/** États des carreaux, réutilisés d'une image à l'autre. */
const tileStates: MotionState[] = [];
const tileOptions: UnitOptions = {};

/**
 * Élément découpé en carreaux : chaque carreau suit les pistes du préréglage
 * autour de son centre, avec son décalage. Le contenu entier est dessiné
 * dans chaque carreau, coupé à sa taille.
 */
function drawTiles(scene: Scene, anim: AnimState, active: ActivePhase, unit: number) {
  const { ctx, project, item, w, h } = scene;
  const { width: W, height: H } = project;
  const grid = active.preset.grid!;
  const columns = Math.max(1, Math.round(grid.columns));
  const rows = Math.max(1, Math.round(grid.rows));
  const count = tileCount(grid);
  tileOptions.params = active.params;
  tileOptions.context = { baseColor: item.type === "text" ? item.style.color : item.type === "shape" ? item.fill : undefined };
  let moving = false;
  for (let index = 0; index < count; index++) {
    const state = (tileStates[index] ??= restState());
    tileOptions.into = state;
    stateForUnit(active.preset, index, count, active.local, active.frames, item.id, tileOptions);
    if (!moving && !isRestState(state)) moving = true;
  }
  tileOptions.into = undefined;
  const opacity = item.transform.opacity * anim.opacity;
  if (!moving) {
    drawBody(scene, anim, unit, opacity);
    return;
  }
  const tw = w / columns;
  const th = h / rows;
  const length = Math.min(W, H);
  for (let index = 0; index < count; index++) {
    const state = tileStates[index];
    const alpha = opacity * Math.min(1, state.opacity);
    if (!(alpha > 0.001)) continue;
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cx = -w / 2 + (column + 0.5) * tw;
    const cy = -h / 2 + (row + 0.5) * th;
    // Rangées alternées : une sur deux arrive du côté opposé.
    const flipX = grid.alternate === "rows" && row % 2 === 1 ? -1 : 1;
    const flipY = grid.alternate === "columns" && column % 2 === 1 ? -1 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    placeItem(ctx, item, anim, W, H, unit, w, h);
    ctx.translate(cx + flipX * (state.dx * W + state.x * length), cy + flipY * (state.dy * H + state.y * length));
    applyMotionTransform(ctx, state.rotate, state.skewX, state.scale * state.scaleX, state.scale * state.scaleY);
    const filter = filterOf(state, length);
    if (filter) ctx.filter = filter;
    ctx.beginPath();
    ctx.rect(-tw / 2, -th / 2, tw * Math.max(0, Math.min(1, state.wipe)), th);
    ctx.clip();
    if (state.maskShape && state.mask < 1) {
      maskPath(ctx, state.maskShape, Math.max(0, state.mask), -tw / 2, -th / 2, tw, th, `${item.id}#${index}`);
      ctx.clip();
    }
    ctx.translate(-cx, -cy);
    paintContent(scene, { ...anim, color: state.color ?? anim.color });
    ctx.restore();
  }
}

// ─── Calques secondaires ─────────────────────────────────────────

/** Sortes de calques dessinées devant l'élément par défaut. */
const FRONT_KINDS = new Set<MotionLayer["kind"]>(["shine", "veil", "underline", "strike"]);

function placeOf(layer: MotionLayer): "behind" | "front" {
  return layer.place ?? (FRONT_KINDS.has(layer.kind) ? "front" : "behind");
}

/** Calques qui ont leur propre opacité, indépendante de celle de l'élément. */
function ownsOpacity(sample: LayerSample): boolean {
  const own = sample.layer.options?.ownOpacity;
  if (typeof own === "boolean") return own;
  return sample.layer.kind === "ring" || sample.layer.kind === "shadow";
}

const DEFAULT_LAYER_COLORS: Partial<Record<MotionLayer["kind"], string>> = {
  ring: "#ffffff",
  shine: "#ffffff",
  veil: "#ffffff",
  shadow: "#000000",
  plate: "#facc15",
  highlight: "#facc15",
};

/** Couleur d'un calque : la sienne, celle de l'élément pour `currentColor`, ou celle de sa sorte. */
function layerColor(item: VisualItem, layer: MotionLayer, state: MotionState): string {
  const own = state.color ?? layer.color;
  const base = item.type === "text" ? item.style.color : item.type === "shape" ? item.fill : "#ffffff";
  if (!own) return DEFAULT_LAYER_COLORS[layer.kind] ?? base;
  return own.trim().toLowerCase() === "currentcolor" ? base : own;
}

/** La même couleur, transparente : les bords d'un dégradé de reflet. */
function transparent(color: string): string {
  const parsed = parseColor(color);
  return parsed ? formatColor({ ...parsed, a: 0 }) : "rgba(255,255,255,0)";
}

function drawLayers(scene: Scene, motion: ItemMotion, anim: AnimState, blend: Blend, place: "behind" | "front") {
  const { ctx, project, item } = scene;
  const { width: W, height: H } = project;
  let still: AnimState | null = null;
  for (const sample of motion.layers) {
    const layer = sample.layer;
    if (placeOf(layer) !== place) continue;
    if (layer.kind === "echo") {
      drawEcho(scene, sample, blend);
      continue;
    }
    const opacity = item.transform.opacity * (ownsOpacity(sample) ? blend.opacity ?? 1 : anim.opacity) * sample.state.opacity;
    if (!(opacity > 0.001)) continue;
    // Un calque qui ne suit pas l'élément reste à sa place de repos (avec
    // les retouches d'une transition, qui déplacent tout le plan).
    const frameState = layer.follow === false ? (still ??= withBlend(restState(), blend, Math.min(W, H), Math.min(W, H))) : anim;
    ctx.save();
    ctx.globalAlpha = Math.min(1, opacity);
    placeItem(ctx, item, frameState, W, H, lengthUnit(item, frameState, W, H), scene.w, scene.h);
    drawLayer(scene, sample, anim);
    ctx.restore();
  }
}


/**
 * Traîne : des copies de l'élément, en retard sur son animation et de plus
 * en plus pâles, qui le rejoignent à la fin de la phase.
 */
function drawEcho(scene: Scene, sample: LayerSample, blend: Blend) {
  const { project, item } = scene;
  const { width: W, height: H } = project;
  const options = sample.layer.options;
  const count = Math.max(1, Math.round(optionNumber(options, "count", 3)));
  const delay = optionNumber(options, "delay", 0.08);
  const falloff = optionNumber(options, "falloff", 0.55);
  const context = { baseColor: item.type === "text" ? item.style.color : item.type === "shape" ? item.fill : undefined };
  for (let rank = count; rank >= 1; rank--) {
    const lagged = sampleTracks(sample.preset, echoProgress(sample.progress, rank, delay), sample.params, context);
    const state = withBlend(lagged, blend, lengthUnit(item, lagged, W, H), Math.min(W, H));
    const opacity = item.transform.opacity * state.opacity * sample.state.opacity * Math.pow(falloff, rank);
    if (!(opacity > 0.001)) continue;
    drawBody({ ...scene, fx: null }, state, lengthUnit(item, state, W, H), opacity);
  }
}

/** Boîte d'un calque, centrée sur l'élément : celle du texte mesuré, sinon celle de l'élément. */
interface LayerBox {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  ellipse: boolean;
  /** Texte : la géométrie du bloc, ligne par ligne. */
  text?: TextGeometry;
}

function layerBox(scene: Scene): LayerBox {
  const { ctx, item, w, h, project } = scene;
  if (item.type === "text") {
    const geometry = textGeometry(ctx, item, w, h, project.height, scene.fx);
    const box = geometry.bounds;
    return { ...box, radius: (geometry.style.background?.radius ?? 0.25) * geometry.fontPx, ellipse: false, text: geometry };
  }
  const radius = item.type === "shape" ? Math.min(item.radius * Math.min(w, h), Math.min(w, h) / 2) : Math.min(item.radius, Math.min(w, h) / 2);
  return { x: -w / 2, y: -h / 2, width: w, height: h, radius, ellipse: item.type === "shape" && item.shape === "ellipse" };
}

function drawLayer(scene: Scene, sample: LayerSample, anim: AnimState) {
  const { ctx, project, item } = scene;
  const { width: W, height: H } = project;
  const { layer, state } = sample;
  const box = layerBox(scene);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const kind = layer.kind;
  const color = layerColor(item, layer, state);
  const length = Math.min(W, H);

  // Décalage du calque, en part de sa boîte. Le reflet lit `x` comme la
  // position de sa bande, pas comme un déplacement.
  if (kind !== "shine" && (state.x || state.y || state.dx || state.dy)) {
    ctx.translate(state.x * box.width + state.dx * W, state.y * box.height + state.dy * H);
  }
  const scaleX = state.scale * state.scaleX;
  const scaleY = state.scale * state.scaleY;
  // L'anneau et l'ombre s'agrandissent sans épaissir leur trait : leur
  // échelle est appliquée au tracé.
  const scalesPath = kind === "ring" || kind === "shadow";
  if (state.rotate || state.skewX || (!scalesPath && (scaleX !== 1 || scaleY !== 1))) {
    const ox = layer.origin ? box.x + layer.origin[0] * box.width : cx;
    const oy = layer.origin ? box.y + layer.origin[1] * box.height : cy;
    ctx.translate(ox, oy);
    applyMotionTransform(ctx, state.rotate, state.skewX, scalesPath ? 1 : scaleX, scalesPath ? 1 : scaleY);
    ctx.translate(-ox, -oy);
  }
  const filter = filterOf(state, length);
  if (filter) ctx.filter = filter;
  const composite = layer.options?.composite;
  if (typeof composite === "string") ctx.globalCompositeOperation = composite as GlobalCompositeOperation;

  // Balayage et découpe sur la boîte du calque (un bandeau qui se déroule).
  const traces = kind === "highlight" || kind === "underline" || kind === "strike";
  if (!traces && state.wipe < 1) {
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.width * Math.max(0, state.wipe), box.height);
    ctx.clip();
  }
  const [top, right, bottom, left] = state.clip;
  if (top || right || bottom || left) {
    ctx.beginPath();
    ctx.rect(
      box.x + left * box.width,
      box.y + top * box.height,
      Math.max(0, box.width * (1 - left - right)),
      Math.max(0, box.height * (1 - top - bottom))
    );
    ctx.clip();
  }
  if (state.maskShape && state.mask < 1) {
    maskPath(ctx, state.maskShape, Math.max(0, state.mask), box.x, box.y, box.width, box.height, item.id);
    ctx.clip();
  }

  switch (kind) {
    case "copy":
      paintSilhouette(scene, box, layer.color || state.color ? color : null, anim, layer.options?.channel);
      return;
    case "veil":
      paintSilhouette(scene, box, color, anim);
      return;
    case "shine": {
      const angle = (optionNumber(layer.options, "angle", 20) * Math.PI) / 180;
      const half = (optionNumber(layer.options, "width", 0.35) * box.width) / 2;
      const center = cx + state.x * box.width;
      const ax = Math.cos(angle) * half;
      const ay = Math.sin(angle) * half;
      const gradient = ctx.createLinearGradient(center - ax, cy - ay, center + ax, cy + ay);
      const clear = transparent(color);
      gradient.addColorStop(0, clear);
      gradient.addColorStop(0.5, color);
      gradient.addColorStop(1, clear);
      paintSilhouette(scene, box, gradient, anim);
      return;
    }
    case "ring": {
      const width = Math.max(1.5, optionNumber(layer.options, "width", 0.03) * Math.min(box.width, box.height));
      const shape = optionString(layer.options, "shape", "auto");
      // L'anneau grandit d'une marge égale sur tous les côtés, comptée en
      // petit côté de la boîte : autour d'un titre large, il reste proche du
      // texte au lieu de déborder du cadre. Sur un carré, c'est l'échelle même.
      const side = Math.min(box.width, box.height);
      const padding = box.text ? optionNumber(layer.options, "padding", 0.2) * box.text.fontPx : 0;
      const rw = Math.max(0, box.width + 2 * padding + (scaleX - 1) * side);
      const rh = Math.max(0, box.height + 2 * padding + (scaleY - 1) * side);
      ctx.beginPath();
      if (shape === "circle") {
        ctx.arc(cx, cy, Math.max(rw, rh) / 2, 0, Math.PI * 2);
      } else if (shape === "ellipse" || (shape === "auto" && box.ellipse)) {
        ctx.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
      } else {
        roundedRect(ctx, cx - rw / 2, cy - rh / 2, rw, rh, Math.max(0, box.radius + padding + ((Math.min(scaleX, scaleY) - 1) * side) / 2));
      }
      if (layer.options?.fill === true) {
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
      }
      return;
    }
    case "shadow": {
      const rx = (box.width / 2) * optionNumber(layer.options, "width", 0.8) * scaleX;
      const ry = Math.max(1, rx * optionNumber(layer.options, "flatness", 0.16)) * (scaleY / Math.max(1e-6, scaleX));
      const y = box.y + box.height * (1 + optionNumber(layer.options, "offset", 0.08));
      if (!filter) ctx.filter = `blur(${(ry * 0.6).toFixed(2)}px)`;
      ctx.beginPath();
      ctx.ellipse(cx, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      return;
    }
    case "plate":
      paintPlate(ctx, item, box, color, layer);
      return;
    case "highlight":
    case "underline":
    case "strike":
      paintTrace(ctx, box, kind, color, state.wipe, layer);
      return;
  }
}

/** Approximations d'un canal de couleur sur une image (aberration chromatique). */
const CHANNEL_FILTERS: Record<string, string> = {
  red: "sepia(1) saturate(8) hue-rotate(-50deg)",
  cyan: "sepia(1) saturate(8) hue-rotate(140deg)",
  blue: "sepia(1) saturate(8) hue-rotate(190deg)",
  green: "sepia(1) saturate(8) hue-rotate(60deg)",
};

/**
 * Silhouette de l'élément remplie de `paint` : les lettres d'un texte (sans
 * contour, ombre ni fond), la forme d'une forme, la boîte arrondie d'une
 * image. Sans `paint`, l'élément tel quel. Une image peut être teinte vers un
 * canal (`channel`) au lieu d'être remplie.
 */
function paintSilhouette(
  scene: Scene,
  box: LayerBox,
  paint: string | CanvasGradient | null,
  anim: AnimState,
  channel?: number | string | boolean
) {
  const { ctx, item, frame, resolve, w, h } = scene;
  if (paint === null) {
    paintContent(scene, anim);
    return;
  }
  switch (item.type) {
    case "text":
      drawTextBlock(ctx, item, box.text!.style, w, scene.project.height, anim.reveal, undefined, anim.tracking, { fx: scene.fx, fill: paint });
      return;
    case "shape":
      drawShape(ctx, item, frame, w, h, paint, Math.min(scene.project.width, scene.project.height));
      return;
    default: {
      if (typeof channel === "string" && CHANNEL_FILTERS[channel]) {
        const current = String(ctx.filter ?? "none");
        ctx.filter = current && current !== "none" ? `${current} ${CHANNEL_FILTERS[channel]}` : CHANNEL_FILTERS[channel];
        drawMedia(ctx, item, frame, w, h, resolve, scene.project.fps);
        return;
      }
      roundedRect(ctx, box.x, box.y, box.width, box.height, box.radius);
      ctx.fillStyle = paint;
      ctx.fill();
    }
  }
}

/** Fond d'un calque : celui du texte, ligne par ligne, ou une plaque sous la boîte. */
function paintPlate(ctx: Ctx, item: VisualItem, box: LayerBox, color: string, layer: MotionLayer) {
  const geometry = box.text;
  ctx.fillStyle = color;
  if (geometry && takesBackground(item, layer)) {
    const background = geometry.style.background!;
    ctx.fillStyle = layer.color ? color : background.color;
    for (const line of geometry.lineBoxes) {
      roundedRect(ctx, line.x, line.y, line.width, line.height, background.radius * geometry.fontPx);
      ctx.fill();
    }
    return;
  }
  const padding = optionNumber(layer.options, "padding", geometry ? 0.25 : 0) * (geometry ? geometry.fontPx : 1);
  const radius = optionNumber(layer.options, "radius", geometry ? 0.15 : 0) * (geometry ? geometry.fontPx : Math.min(box.width, box.height));
  roundedRect(ctx, box.x - padding, box.y - padding * 0.5, box.width + padding * 2, box.height + padding, radius);
  ctx.fill();
}

/**
 * Surligneur, soulignement et trait barré : tracés ligne après ligne, de
 * gauche à droite, au rythme de `progress` (la piste `wipe` du calque).
 */
function paintTrace(ctx: Ctx, box: LayerBox, kind: "highlight" | "underline" | "strike", color: string, progress: number, layer: MotionLayer) {
  const geometry = box.text;
  const fontPx = geometry?.fontPx ?? box.height;
  const rows = geometry
    ? geometry.lineBoxes.map((line, index) => ({ x: line.x + line.padding, width: geometry.widths[index], y: line.y + line.height / 2 }))
    : [{ x: box.x, width: box.width, y: cyOf(box) }];
  const total = rows.reduce((sum, row) => sum + row.width, 0);
  let budget = Math.max(0, Math.min(1, progress)) * total;
  ctx.fillStyle = color;
  for (const row of rows) {
    const drawn = Math.min(row.width, budget);
    budget -= drawn;
    if (drawn <= 0) break;
    let top: number;
    let height: number;
    if (kind === "highlight") {
      const band = optionNumber(layer.options, "band", 0.42) * fontPx;
      top = row.y + fontPx * 0.42 - band;
      height = band;
    } else if (kind === "underline") {
      height = optionNumber(layer.options, "thickness", 0.08) * fontPx;
      top = row.y + fontPx * optionNumber(layer.options, "offset", 0.48);
    } else {
      height = optionNumber(layer.options, "thickness", 0.07) * fontPx;
      top = row.y - height / 2 + fontPx * 0.04;
    }
    const pad = kind === "highlight" ? fontPx * 0.08 : 0;
    ctx.fillRect(row.x - pad, top, drawn + (drawn >= row.width ? 2 * pad : pad), height);
  }
}

const cyOf = (box: LayerBox) => box.y + box.height / 2;

// ─── Images et vidéos ────────────────────────────────────────────

function sourceSize(source: CanvasImageSource): { width: number; height: number } {
  if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  const sized = source as { width: number; height: number };
  return { width: sized.width, height: sized.height };
}

function drawMedia(
  ctx: Ctx,
  item: ImageItem | VideoItem,
  frame: number,
  w: number,
  h: number,
  resolve: VisualResolver,
  fps = 30
) {
  const source = resolve(item, frame);
  const radius = Math.min(item.radius, Math.min(w, h) / 2);
  roundedRect(ctx, -w / 2, -h / 2, w, h, radius);
  ctx.clip();

  if (!source) {
    // Média pas encore chargé : un aplat neutre plutôt qu'un trou.
    ctx.fillStyle = "rgba(127,127,127,0.18)";
    ctx.fillRect(-w / 2, -h / 2, w, h);
    return;
  }

  const { width: sw, height: sh } = sourceSize(source);
  if (!sw || !sh) return;

  // Une vidéo n'a de mouvement de caméra que si on lui en a donné un.
  const camera: CameraState =
    item.type === "image" || item.motion
      ? cameraAt(item.motion, (frame - item.start) / Math.max(1, item.duration - 1), ((frame - item.start) / Math.max(1, fps)) * 1000)
      : { zoom: 1, panX: 0, panY: 0 };

  const coverScale = Math.max(w / sw, h / sh);
  const containScale = Math.min(w / sw, h / sh);
  const scale = (item.fit === "cover" ? coverScale : containScale) * camera.zoom;
  const dw = sw * scale;
  const dh = sh * scale;
  // La marge de débordement est ce que le panoramique peut parcourir.
  const marginX = Math.max(0, (dw - w) / 2);
  const marginY = Math.max(0, (dh - h) / 2);
  const dx = -dw / 2 + camera.panX * marginX;
  const dy = -dh / 2 + camera.panY * marginY;
  // Secousse, rotation, flou et luminosité de la caméra, seulement s'ils existent.
  if (camera.shiftX || camera.shiftY) ctx.translate((camera.shiftX ?? 0) * w, (camera.shiftY ?? 0) * h);
  if (camera.rotate) ctx.rotate((camera.rotate * Math.PI) / 180);
  if (camera.blur || camera.brightness !== undefined) {
    const extra = [
      camera.blur ? `blur(${(camera.blur * Math.min(w, h)).toFixed(2)}px)` : "",
      camera.brightness !== undefined ? `brightness(${Math.max(0, camera.brightness).toFixed(4)})` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const current = String(ctx.filter ?? "none");
    ctx.filter = current && current !== "none" ? `${current} ${extra}` : extra;
  }
  // Miroir : l'image se retourne dans son cadre, rien d'autre ne change.
  if (item.type === "image" && item.flipX) ctx.scale(-1, 1);
  ctx.drawImage(source, dx, dy, dw, dh);
}

// ─── Texte ───────────────────────────────────────────────────────

export function fontString(style: TextStyle, canvasHeight: number): string {
  const px = Math.max(1, style.size * canvasHeight);
  return `${style.weight} ${px}px "${style.font}", "Inter", system-ui, sans-serif`;
}

/** Découpe le texte en lignes ; voir `motion/text-layout.ts`. */
export { wrapText };

/** Applique police et espacement d'un style au contexte. */
function applyFont(ctx: Ctx, style: TextStyle, canvasHeight: number) {
  ctx.font = fontString(style, canvasHeight);
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D).letterSpacing = `${style.letterSpacing * style.size * canvasHeight}px`;
  }
}

/**
 * Style d'un texte « fit: shrink » : taille réduite par paliers jusqu'à ce que
 * la plus longue ligne tienne en largeur (un mot sans espace ne se coupe pas)
 * et le bloc en hauteur. Le calcul est relatif au cadre : la vignette et le
 * rendu plein format donnent la même mise en page.
 */
function fittedStyle(ctx: Ctx, item: TextItem, w: number, h: number, canvasHeight: number): TextStyle {
  let style = item.style;
  const content = style.uppercase ? item.text.toUpperCase() : item.text;
  for (let step = 0; step < 24; step++) {
    applyFont(ctx, style, canvasHeight);
    const fontPx = style.size * canvasHeight;
    const padding = style.background ? style.background.padding * fontPx : 0;
    const maxWidth = Math.max(10, w - padding * 2 - tailRoom(ctx, item, style, canvasHeight) - pillRoom(item, fontPx));
    const lines = wrapText(ctx, content, maxWidth);
    const widest = Math.max(0, ...lines.map((line) => ctx.measureText(line).width));
    const fits = widest <= maxWidth + 0.5 && lines.length * fontPx * style.lineHeight <= h + 0.5;
    if (fits || style.size <= item.style.size * 0.2) break;
    style = { ...style, size: style.size * 0.9 };
  }
  return style;
}

function drawText(
  ctx: Ctx,
  item: TextItem,
  w: number,
  h: number,
  canvasHeight: number,
  reveal: number,
  color?: string,
  tracking = 0,
  fx: Fx | null = null
) {
  const style = item.fit === "shrink" ? fittedStyle(ctx, item, w, h, canvasHeight) : item.style;
  applyFont(ctx, style, canvasHeight);
  drawTextBlock(ctx, item, style, w, canvasHeight, reveal, color, tracking, fx ? { fx } : undefined);
}

/**
 * Décalage qui centre les capitales d'une ligne sur son milieu, la police
 * déjà posée : avec `textBaseline: "middle"`, c'est la boîte de la police
 * qui est centrée, et des capitales paraissent plus basses ou plus hautes
 * selon la police. Mesuré sur un « H » : ni accent ni jambage ne déplacent
 * le texte d'une ligne à l'autre.
 */
export function opticalShift(ctx: Ctx): number {
  const previous = ctx.textBaseline;
  ctx.textBaseline = "middle";
  const metrics = ctx.measureText("H");
  ctx.textBaseline = previous;
  const ascent = metrics.actualBoundingBoxAscent;
  const descent = metrics.actualBoundingBoxDescent;
  if (!Number.isFinite(ascent) || !Number.isFinite(descent)) return 0;
  return (ascent - descent) / 2;
}

/** Retouches du dessin d'un bloc de texte. */
interface TextPaint {
  fx?: Fx | null;
  /**
   * Remplissage imposé (dégradé d'un reflet, teinte d'une copie) : ni
   * contour, ni ombre, ni fond, seulement les lettres.
   */
  fill?: string | CanvasGradient;
}

/** Texte affiché : capitales du style, et compteur en cours. */
function textContent(item: TextItem, style: TextStyle, fx: Fx | null | undefined): string {
  const content = style.uppercase ? item.text.toUpperCase() : item.text;
  if (item.count) {
    const local = textLocalFrame.get(item);
    const raw = local === undefined ? 1 : Math.min(1, Math.max(0, (local - item.count.at) / Math.max(1, item.count.frames)));
    return counterText(content, raw, { from: item.count.from, ease: "outCubic" });
  }
  return fx?.counter ? counterText(content, fx.counter.progress, fx.counter.options) : content;
}

/**
 * Image dessinée d'un texte, comptée depuis son début : l'instant de ses
 * marques et de son compteur. Rempli par `drawItem` juste avant le dessin ;
 * un texte dessiné hors de lui montre ses marques posées et son compteur
 * arrivé.
 */
const textLocalFrame = new WeakMap<TextItem, number>();

/** Avancement adouci d'une marque, de 0 à 1, à l'image dessinée. */
function markProgress(item: TextItem, mark: TextMark): number {
  if (mark.at === undefined) return 1;
  const local = textLocalFrame.get(item);
  if (local === undefined) return 1;
  const raw = Math.min(1, Math.max(0, (local - mark.at) / Math.max(1, mark.frames ?? 1)));
  return raw * raw * (3 - 2 * raw);
}

/** Place à garder en fin de ligne pour l'unité d'un compteur (espace compris). */
function tailRoom(ctx: Ctx, item: TextItem, style: TextStyle, canvasHeight: number): number {
  if (!item.tail?.text) return 0;
  const font = ctx.font;
  const space = ctx.measureText(" ").width;
  ctx.font = fontString({ ...style, size: style.size * item.tail.scale }, canvasHeight);
  const width = ctx.measureText(item.tail.text).width;
  ctx.font = font;
  return space + width;
}

/** Hauteur des capitales autour du milieu d'une ligne (ligne de base au milieu) : au-dessus, en dessous. */
function capBox(ctx: Ctx): { ascent: number; descent: number } {
  const previous = ctx.textBaseline;
  ctx.textBaseline = "middle";
  const metrics = ctx.measureText("H");
  ctx.textBaseline = previous;
  return { ascent: metrics.actualBoundingBoxAscent || 0, descent: metrics.actualBoundingBoxDescent || 0 };
}

/** Marge d'un pavé autour de ses mots, en part du corps : sur les côtés, au-dessus et en dessous des capitales. */
const PILL_PAD_X = 0.2;
const PILL_PAD_Y = 0.18;

/** Étendue d'un mot sur sa ligne, en pixels depuis le début de la ligne. */
interface WordSpan {
  line: number;
  word: number;
  text: string;
  /** Rang de son premier caractère dans la ligne. */
  offset: number;
  x0: number;
  x1: number;
}

interface MarkedLayout {
  spans: WordSpan[];
  /** Largeur de chaque ligne, marges des pavés et unité comprises. */
  widths: number[];
}

/** Vrai si le mot `word` est sous un pavé (posé ou à venir : sa place est gardée dès le début). */
const inPill = (marks: TextMark[], word: number) => marks.some((mark) => mark.kind === "pill" && word >= (mark.from ?? 0) && word < (mark.to ?? Infinity));

/**
 * Place de chaque mot des lignes d'un texte marqué. Un mot sous un pavé
 * reçoit la marge du pavé avant le premier et après le dernier mot du
 * pavé, en plus de l'espace : entre le bord du pavé et le mot voisin, il
 * reste exactement une espace.
 */
function layoutMarked(ctx: Ctx, lines: string[], marks: TextMark[], fontPx: number, tailWidth: number): MarkedLayout {
  const spans: WordSpan[] = [];
  const widths: number[] = [];
  const space = ctx.measureText(" ").width;
  const pad = fontPx * PILL_PAD_X;
  let word = 0;
  lines.forEach((line, lineIndex) => {
    let cursor = 0;
    let offset = 0;
    const tokens = line.split(" ");
    tokens.forEach((token, index) => {
      if (token) {
        const pill = inPill(marks, word);
        if (pill && !inPill(marks, word - 1)) cursor += pad;
        const width = ctx.measureText(token).width;
        spans.push({ line: lineIndex, word, text: token, offset, x0: cursor, x1: cursor + width });
        cursor += width;
        if (pill && !inPill(marks, word + 1)) cursor += pad;
        word++;
      }
      offset += token.length + 1;
      if (index < tokens.length - 1 && token) cursor += space;
    });
    widths.push(cursor + (lineIndex === lines.length - 1 ? tailWidth : 0));
  });
  return { spans, widths };
}

/** Largeur gardée en fin de ligne pour les marges des pavés d'un texte. */
function pillRoom(item: TextItem, fontPx: number): number {
  const pills = (item.marks ?? []).filter((mark) => mark.kind === "pill").length;
  return pills * 2 * fontPx * PILL_PAD_X;
}

/** Étendue d'une marque sur chaque ligne qu'elle touche : du premier au dernier de ses mots. */
function markRanges(spans: WordSpan[], mark: TextMark): { line: number; x0: number; x1: number }[] {
  const from = mark.from ?? 0;
  const to = mark.to ?? Infinity;
  const ranges = new Map<number, { line: number; x0: number; x1: number }>();
  for (const span of spans) {
    if (span.word < from || span.word >= to) continue;
    const range = ranges.get(span.line);
    if (range) range.x1 = span.x1;
    else ranges.set(span.line, { line: span.line, x0: span.x0, x1: span.x1 });
  }
  return [...ranges.values()];
}

/**
 * Lignes d'un texte marqué (pavé, soulignement, barre, cercle, couleur) ou
 * suivi d'une unité. Chaque mot est posé à sa place mesurée, et la ligne
 * entière (marges des pavés et unité comprises) suit l'alignement du texte :
 * un texte centré l'est au pixel près, et un texte qui se tape ne se
 * recentre pas à chaque lettre. Les marques suivent la hauteur réelle des
 * capitales : un pavé a autant de marge au-dessus qu'en dessous des lettres.
 */
function drawMarkedLines(
  ctx: Ctx,
  item: TextItem,
  style: TextStyle,
  lines: string[],
  visible: string[],
  firstY: number,
  lineHeight: number,
  anchorX: number,
  fontPx: number,
  canvasHeight: number,
  fill: string | CanvasGradient | undefined,
  color: string | undefined
) {
  const marks = (item.marks ?? []).slice(0, MAX_TEXT_MARKS);
  const tail = item.tail?.text ? item.tail : null;
  const tailWidth = tail ? tailRoom(ctx, item, style, canvasHeight) : 0;
  const last = lines.length - 1;
  const { spans, widths } = layoutMarked(ctx, lines, marks, fontPx, tailWidth);
  const starts = widths.map((width) => (style.align === "left" ? anchorX : style.align === "right" ? anchorX - width : -width / 2));
  const cap = capBox(ctx);
  const lineY = (index: number) => firstY + index * lineHeight;
  const ink = fill ?? color ?? style.color;
  const padX = fontPx * PILL_PAD_X;
  const padY = fontPx * PILL_PAD_Y;
  ctx.textAlign = "left";

  // Pavés, sous les lettres : autant de marge au-dessus qu'en dessous des capitales.
  for (const mark of marks) {
    if (mark.kind !== "pill" || fill) continue;
    const progress = markProgress(item, mark);
    if (progress <= 0) continue;
    ctx.save();
    ctx.fillStyle = mark.color;
    for (const range of markRanges(spans, mark)) {
      const y = lineY(range.line);
      const width = (range.x1 - range.x0 + padX * 2) * progress;
      roundedRect(ctx, starts[range.line] + range.x0 - padX, y - cap.ascent - padY, width, cap.ascent + cap.descent + padY * 2, fontPx * 0.16);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Mots d'une ligne, coupés à ce que la machine à écrire en montre. */
  const paintLine = (index: number, paintColor: string | CanvasGradient, withEffects: boolean) => {
    const shown = visible[index]?.length ?? 0;
    if (!shown) return;
    const y = lineY(index);
    const words = spans.filter((span) => span.line === index && span.offset < shown).map((span) => ({ ...span, text: span.text.slice(0, shown - span.offset) }));
    if (withEffects && !fill && style.stroke && style.stroke.width > 0) {
      ctx.save();
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.strokeStyle = style.stroke.color;
      ctx.lineWidth = style.stroke.width * fontPx * 2;
      for (const word of words) ctx.strokeText(word.text, starts[index] + word.x0, y);
      ctx.restore();
    }
    ctx.save();
    if (withEffects && !fill && style.shadow) {
      ctx.shadowColor = style.shadow.color;
      ctx.shadowBlur = style.shadow.blur * fontPx;
      ctx.shadowOffsetY = style.shadow.offsetY * fontPx;
    }
    ctx.fillStyle = paintColor;
    for (const word of words) ctx.fillText(word.text, starts[index] + word.x0, y);
    ctx.restore();
  };
  for (let index = 0; index < visible.length; index++) paintLine(index, ink, true);

  // Unité du compteur : même ligne de base que le nombre, dans son propre corps, une espace après lui.
  if (tail && visible[last] === lines[last]) {
    const lastWord = [...spans].reverse().find((span) => span.line === last);
    const x = starts[last] + (lastWord?.x1 ?? 0) + ctx.measureText(" ").width;
    ctx.save();
    ctx.font = fontString({ ...style, size: style.size * tail.scale }, canvasHeight);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = fill ?? tail.color ?? ink;
    ctx.fillText(tail.text, x, lineY(last) + cap.descent);
    ctx.restore();
  }

  // Mots recolorés (couleur, ou mots posés sur un pavé) : les mêmes lettres, redessinées dans leur cadre.
  for (const mark of marks) {
    const recolor = mark.kind === "color" ? mark.color : mark.kind === "pill" ? mark.textColor : undefined;
    if (!recolor || fill) continue;
    const progress = markProgress(item, mark);
    if (progress <= 0) continue;
    for (const range of markRanges(spans, mark)) {
      const y = lineY(range.line);
      const full = range.x1 - range.x0 + padX * 2;
      ctx.save();
      if (mark.kind === "color") ctx.globalAlpha *= progress;
      ctx.beginPath();
      ctx.rect(starts[range.line] + range.x0 - padX, y - lineHeight / 2, mark.kind === "pill" ? full * progress : full, lineHeight);
      ctx.clip();
      paintLine(range.line, recolor, false);
      ctx.restore();
    }
  }

  // Traits : soulignement sous la ligne de base, barre au milieu des capitales, cercle autour des mots.
  for (const mark of marks) {
    if (mark.kind !== "underline" && mark.kind !== "strike" && mark.kind !== "circle") continue;
    const progress = markProgress(item, mark);
    if (progress <= 0) continue;
    ctx.save();
    ctx.strokeStyle = mark.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1, fontPx * (mark.kind === "circle" ? 0.06 : 0.075));
    for (const range of markRanges(spans, mark)) {
      const y = lineY(range.line);
      const x0 = starts[range.line] + range.x0;
      const x1 = starts[range.line] + range.x1;
      ctx.beginPath();
      if (mark.kind === "circle") {
        const cx = (x0 + x1) / 2;
        const cy = y + (cap.descent - cap.ascent) / 2;
        const rx = (x1 - x0) / 2 + fontPx * 0.4;
        const ry = (cap.ascent + cap.descent) / 2 + fontPx * 0.36;
        const begin = -Math.PI * 0.6;
        ctx.ellipse(cx, cy, rx, ry, -0.04, begin, begin + Math.PI * 2.08 * progress);
      } else {
        const overhang = mark.kind === "strike" ? fontPx * 0.08 : 0;
        const markY = mark.kind === "strike" ? y + (cap.descent - cap.ascent) / 2 : y + cap.descent + fontPx * 0.14;
        ctx.moveTo(x0 - overhang, markY);
        ctx.lineTo(x0 - overhang + (x1 - x0 + overhang * 2) * progress, markY);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Dessin en bloc, la police du style déjà posée sur le contexte. */
function drawTextBlock(
  ctx: Ctx,
  item: TextItem,
  style: TextStyle,
  w: number,
  canvasHeight: number,
  reveal: number,
  color: string | undefined,
  tracking: number,
  paint?: TextPaint
) {
  const fx = paint?.fx ?? null;
  const fill = paint?.fill;
  const fontPx = style.size * canvasHeight;
  ctx.textBaseline = "middle";
  ctx.textAlign = style.align;

  const content = textContent(item, style, fx);
  const padding = style.background ? style.background.padding * fontPx : 0;
  const lines = wrapText(ctx, content, Math.max(10, w - padding * 2 - tailRoom(ctx, item, style, canvasHeight) - pillRoom(item, fontPx)));
  const lineHeight = fontPx * style.lineHeight;
  const blockHeight = lines.length * lineHeight;

  // Espacement animé : appliqué après la coupe des lignes, pour que le texte
  // s'étire sans changer de lignes en cours d'animation.
  if (tracking && "letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D).letterSpacing = `${(style.letterSpacing + tracking) * fontPx}px`;
  }

  // Brouillage : chaque caractère est remplacé par un caractère tiré jusqu'à
  // son instant de fixation ; les lignes gardent leur nombre de graphèmes.
  const drawn = fx?.scramble
    ? scrambleLines(lines, fx.scramble.progress, fx.scramble.options, fx.seed, scrambleTick(fx.local, fx.fps, optionNumber(fx.scramble.options, "rate", 20)))
    : lines;

  // Machine à écrire : on coupe le texte au nombre de graphèmes révélés ; un
  // émoji ou un accent combiné n'apparaît jamais à moitié. Tout révélé, les
  // lignes sont dessinées telles quelles.
  let visible = drawn;
  if (reveal < 1) {
    let remaining = Math.round(graphemeCount(content.replace(/\n/g, "")) * reveal);
    visible = drawn.map((line) => {
      const shown = sliceGraphemes(line, Math.max(0, remaining));
      remaining -= graphemeCount(line);
      return shown;
    });
  }

  const anchorX = style.align === "left" ? -w / 2 + padding : style.align === "right" ? w / 2 - padding : 0;
  const firstY = -blockHeight / 2 + lineHeight / 2 + (item.opticalCenter ? opticalShift(ctx) : 0);

  if (style.background && !fill && !fx?.noBackground) {
    ctx.save();
    ctx.fillStyle = style.background.color;
    for (let index = 0; index < lines.length; index++) {
      if (!visible[index]) continue;
      const lineWidth = ctx.measureText(lines[index]).width;
      const boxWidth = lineWidth + padding * 2;
      const x =
        style.align === "left" ? -w / 2 : style.align === "right" ? w / 2 - boxWidth : -boxWidth / 2;
      const y = firstY + index * lineHeight - lineHeight / 2;
      roundedRect(ctx, x, y, boxWidth, lineHeight, style.background.radius * fontPx);
      ctx.fill();
    }
    ctx.restore();
  }

  if (item.marks?.length || item.tail?.text) {
    drawMarkedLines(ctx, item, style, lines, visible, firstY, lineHeight, anchorX, fontPx, canvasHeight, fill, color);
  } else for (let index = 0; index < visible.length; index++) {
    const text = visible[index];
    if (!text) continue;
    const y = firstY + index * lineHeight;
    if (!fill && style.stroke && style.stroke.width > 0) {
      ctx.save();
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.strokeStyle = style.stroke.color;
      ctx.lineWidth = style.stroke.width * fontPx * 2;
      ctx.strokeText(text, anchorX, y);
      ctx.restore();
    }
    ctx.save();
    if (!fill && style.shadow) {
      ctx.shadowColor = style.shadow.color;
      ctx.shadowBlur = style.shadow.blur * fontPx;
      ctx.shadowOffsetY = style.shadow.offsetY * fontPx;
    }
    ctx.fillStyle = fill ?? color ?? style.color;
    ctx.fillText(text, anchorX, y);
    ctx.restore();
  }

  // Curseur de frappe, après le dernier caractère montré.
  if (fx?.cursor && !fill) {
    let index = visible.length - 1;
    while (index > 0 && !visible[index]) index--;
    const text = visible[index] ?? "";
    const width = text ? ctx.measureText(text).width : 0;
    const x = style.align === "left" ? anchorX + width : style.align === "right" ? anchorX : anchorX + width / 2;
    paintCaret(ctx, fx, fx.cursor, x, firstY + Math.max(0, index) * lineHeight, fontPx, color ?? style.color, reveal < 1);
  }
}

/**
 * Curseur : une barre (par défaut), un pavé ou un trait bas, plein pendant
 * la frappe puis clignotant.
 */
function paintCaret(ctx: Ctx, fx: Fx, entry: FxEntry, x: number, y: number, fontPx: number, color: string, typing: boolean) {
  if (!caretVisible(typing, fx.ms, optionNumber(entry.options, "blinkMs", 1000))) return;
  const shape = optionString(entry.options, "shape", "bar");
  ctx.save();
  ctx.fillStyle = optionString(entry.options, "color", color);
  const gap = fontPx * 0.06;
  if (shape === "block") ctx.fillRect(x + gap, y - fontPx * 0.5, fontPx * 0.55, fontPx);
  else if (shape === "underscore") ctx.fillRect(x + gap, y + fontPx * 0.36, fontPx * 0.55, fontPx * 0.09);
  else ctx.fillRect(x + gap, y - fontPx * 0.55, Math.max(1, fontPx * 0.08), fontPx * 1.1);
  ctx.restore();
}

/** Géométrie d'un bloc de texte : lignes, largeurs et boîtes, comme les dessine le bloc. */
interface TextGeometry {
  style: TextStyle;
  fontPx: number;
  lines: string[];
  widths: number[];
  /** Boîte de chaque ligne, marge du fond comprise (celle que remplit le fond). */
  lineBoxes: { x: number; y: number; width: number; height: number; padding: number }[];
  bounds: { x: number; y: number; width: number; height: number };
}

/** Mesure le texte dans la police du style (posée sur le contexte au passage). */
function textGeometry(ctx: Ctx, item: TextItem, w: number, h: number, canvasHeight: number, fx: Fx | null): TextGeometry {
  const style = item.fit === "shrink" ? fittedStyle(ctx, item, w, h, canvasHeight) : item.style;
  applyFont(ctx, style, canvasHeight);
  const fontPx = style.size * canvasHeight;
  const content = textContent(item, style, fx);
  const padding = style.background ? style.background.padding * fontPx : 0;
  const lines = wrapText(ctx, content, Math.max(10, w - padding * 2 - tailRoom(ctx, item, style, canvasHeight) - pillRoom(item, fontPx)));
  const widths = lines.map((line) => ctx.measureText(line).width);
  const lineHeight = fontPx * style.lineHeight;
  const firstY = -(lines.length * lineHeight) / 2 + lineHeight / 2 + (item.opticalCenter ? opticalShift(ctx) : 0);
  const lineBoxes = widths.map((width, index) => {
    const boxWidth = width + padding * 2;
    const x = style.align === "left" ? -w / 2 : style.align === "right" ? w / 2 - boxWidth : -boxWidth / 2;
    return { x, y: firstY + index * lineHeight - lineHeight / 2, width: boxWidth, height: lineHeight, padding };
  });
  if (lineBoxes.length === 0) return { style, fontPx, lines, widths, lineBoxes, bounds: { x: 0, y: 0, width: 0, height: 0 } };
  const left = Math.min(...lineBoxes.map((box) => box.x));
  const right = Math.max(...lineBoxes.map((box) => box.x + box.width));
  return {
    style,
    fontPx,
    lines,
    widths,
    lineBoxes,
    bounds: { x: left, y: lineBoxes[0].y, width: right - left, height: lines.length * lineHeight },
  };
}

// ─── Texte découpé ───────────────────────────────────────────────

/**
 * États des unités, gardés d'une image à l'autre et remplis en place : un
 * titre animé lettre par lettre n'alloue pas un état par lettre et par image.
 * Le dessin est synchrone, un seul tableau suffit.
 */
const unitStates: MotionState[] = [];
/** Avancement propre de chaque unité, quand un effet le lit (brouillage). */
const unitProgresses: number[] = [];
/** Opacité de la lettre la plus visible de chaque ligne, pour le fond. */
const lineAlphas: number[] = [];
const unitOptions: UnitOptions = {};

/**
 * Calcule l'état des `count` unités dans `unitStates`. Rend `false` si toutes
 * sont au repos : le texte se dessine alors en bloc, exactement comme hors
 * animation (dernière image d'une entrée, par exemple).
 */
function computeUnitStates(item: TextItem, phase: SplitPhase, count: number, withProgress = false): boolean {
  unitOptions.params = phase.params;
  unitOptions.context = { baseColor: item.style.color };
  let moving = false;
  for (let index = 0; index < count; index++) {
    const state = (unitStates[index] ??= restState());
    unitOptions.into = state;
    stateForUnit(phase.preset, index, count, phase.local, phase.frames, item.id, unitOptions);
    if (!moving && !isRestState(state)) moving = true;
    if (withProgress) unitProgresses[index] = unitProgress(phase.preset, index, count, phase.local, phase.frames, item.id);
  }
  unitOptions.into = undefined;
  return moving;
}

/** Part révélée d'une unité, coupée entre deux graphèmes. */
function revealedText(unit: TextUnit, reveal: number): string {
  if (reveal >= 1) return unit.text;
  const ends = unit.graphemeEnds;
  const shown = Math.round(ends.length * Math.max(0, reveal));
  if (shown <= 0) return "";
  return shown >= ends.length ? unit.text : unit.text.slice(0, ends[shown - 1]);
}

/** Bord gauche d'une ligne dans le cadre de l'élément, selon l'alignement. */
function lineLeft(align: TextStyle["align"], w: number, padding: number, lineWidth: number): number {
  if (align === "left") return -w / 2 + padding;
  if (align === "right") return w / 2 - padding - lineWidth;
  return -lineWidth / 2;
}

/**
 * Place le contexte au centre d'une unité, avec son état : décalages,
 * rotation, inclinaison, échelles, flou et luminosité, autour du centre de
 * l'unité ou de l'ancrage du préréglage (dans la boîte `boxWidth × boxHeight`).
 * Comme pour un élément, rien n'est appliqué qui ne change rien.
 */
function enterUnit(
  ctx: Ctx,
  state: MotionState,
  cx: number,
  cy: number,
  length: number,
  W: number,
  H: number,
  extraScale = 1,
  boxWidth = 0,
  boxHeight = 0
) {
  ctx.translate(cx + state.dx * W + state.x * length, cy + state.dy * H + state.y * length);
  const origin = state.origin;
  if (origin && (origin[0] !== 0.5 || origin[1] !== 0.5) && (boxWidth || boxHeight)) {
    const ox = (origin[0] - 0.5) * boxWidth;
    const oy = (origin[1] - 0.5) * boxHeight;
    ctx.translate(ox, oy);
    applyMotionTransform(ctx, state.rotate, state.skewX, extraScale * state.scale * state.scaleX, extraScale * state.scale * state.scaleY);
    ctx.translate(-ox, -oy);
  } else {
    if (state.rotate) ctx.rotate((state.rotate * Math.PI) / 180);
    if (state.skewX) ctx.transform(1, 0, Math.tan((state.skewX * Math.PI) / 180), 1, 0, 0);
    const scaleX = extraScale * state.scale * state.scaleX;
    const scaleY = extraScale * state.scale * state.scaleY;
    if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
  }
  if (state.blur > 0 || state.brightness !== 1) {
    const blur = state.blur > 0 ? `blur(${(state.blur * length).toFixed(2)}px)` : "";
    const brightness = state.brightness !== 1 ? `brightness(${Math.max(0, state.brightness).toFixed(4)})` : "";
    ctx.filter = blur && brightness ? `${blur} ${brightness}` : blur || brightness;
  }
}

/** Brouillage d'un texte découpé : chaque unité est brouillée jusqu'à son seuil. */
interface UnitScramble {
  seed: string;
  tick: number;
  charset: string;
  /** Avancement propre à partir duquel l'unité est fixée. */
  lock: number;
  /** Couleur des unités encore brouillées ; absente : celle du texte. */
  color?: string;
}

/** Ce que partagent toutes les unités d'un texte à une image donnée. */
interface UnitPass {
  style: TextStyle;
  lines: TextLayout["lines"];
  w: number;
  W: number;
  H: number;
  padding: number;
  fontPx: number;
  lineHeight: number;
  firstY: number;
  /** Décalage de chaque unité dû à l'espacement animé de ses voisines, en pixels. */
  shifts: number[] | null;
  scramble: UnitScramble | null;
}

function drawUnit(ctx: Ctx, unit: TextUnit, state: MotionState, pass: UnitPass, stroke: boolean, index: number) {
  const opacity = Math.min(1, state.opacity);
  if (!(opacity > 0.001)) return;
  let text = revealedText(unit, state.reveal);
  if (!text) return;
  const scramble = pass.scramble;
  const scrambled = scramble !== null && unitProgresses[index] < scramble.lock;
  if (scrambled) text = scrambleUnit(text, scramble.seed, index, scramble.tick, scramble.charset);
  const left = lineLeft(pass.style.align, pass.w, pass.padding, pass.lines[unit.line].width) + unit.x + (pass.shifts ? pass.shifts[index] : 0);
  const length = state.unit === "em" ? pass.fontPx : Math.min(pass.W, pass.H);
  const half = unit.width / 2;

  ctx.save();
  if (opacity < 1) ctx.globalAlpha *= opacity;
  enterUnit(ctx, state, left + half, pass.firstY + unit.line * pass.lineHeight, length, pass.W, pass.H, 1, unit.width, pass.lineHeight);

  // Balayage et découpe, sur la boîte de l'unité (sa largeur, la hauteur de ligne).
  const top = -pass.lineHeight / 2;
  if (state.wipe < 1) {
    ctx.beginPath();
    ctx.rect(-half, top, unit.width * Math.max(0, state.wipe), pass.lineHeight);
    ctx.clip();
  }
  const clip = state.clip;
  if (clip[0] || clip[1] || clip[2] || clip[3]) {
    ctx.beginPath();
    ctx.rect(
      -half + clip[3] * unit.width,
      top + clip[0] * pass.lineHeight,
      Math.max(0, unit.width * (1 - clip[3] - clip[1])),
      Math.max(0, pass.lineHeight * (1 - clip[0] - clip[2]))
    );
    ctx.clip();
  }
  if (state.maskShape && state.mask < 1) {
    if (!(state.mask > 0)) {
      ctx.restore();
      return;
    }
    maskPath(ctx, state.maskShape, state.mask, -half, top, unit.width, pass.lineHeight, `${pass.scramble?.seed ?? ""}#${index}`);
    ctx.clip();
  }

  if (stroke) ctx.strokeText(text, -half, 0);
  else {
    if (scrambled && scramble.color) ctx.fillStyle = scramble.color;
    else if (state.color !== undefined) ctx.fillStyle = state.color;
    ctx.fillText(text, -half, 0);
  }
  ctx.restore();
}

/**
 * Espacement animé par lettre : chaque unité s'écarte de la somme des
 * espacements de celles qui la précèdent sur sa ligne, et la ligne reste
 * alignée (centrée, à gauche ou à droite) pendant qu'elle s'étire.
 */
function trackingShifts(units: TextUnit[], count: number, align: TextStyle["align"], fontPx: number): number[] | null {
  let any = false;
  for (let index = 0; index < count; index++) {
    if (unitStates[index].tracking) {
      any = true;
      break;
    }
  }
  if (!any) return null;
  const shifts = new Array<number>(count).fill(0);
  let start = 0;
  while (start < count) {
    const line = units[start].line;
    let end = start;
    let sum = 0;
    for (; end < count && units[end].line === line; end++) {
      shifts[end] = sum;
      sum += unitStates[end].tracking * fontPx;
    }
    const adjust = align === "center" ? -sum / 2 : align === "right" ? -sum : 0;
    for (let index = start; index < end; index++) shifts[index] += adjust;
    start = end;
  }
  return shifts;
}

/**
 * Texte animé par unités : chaque ligne, mot ou lettre est dessiné avec son
 * propre état, autour de son centre. La mise en page est celle du bloc
 * (mêmes lignes, positions mesurées) : au repos, chaque unité est exactement
 * à sa place dans la ligne.
 *
 * Le contour est tracé pour toutes les unités avant le remplissage : le
 * contour épais d'une lettre ne mord pas sur le remplissage de sa voisine,
 * comme dans le bloc. Le fond (étiquette) reste celui du bloc ; chaque ligne
 * prend l'opacité de son unité la plus visible, et n'apparaît pas avant elle.
 */
function drawSplitText(
  ctx: Ctx,
  item: TextItem,
  w: number,
  h: number,
  W: number,
  H: number,
  phase: SplitPhase,
  color: string | undefined,
  tracking: number,
  fx: Fx | null = null
) {
  const style = item.fit === "shrink" ? fittedStyle(ctx, item, w, h, H) : item.style;
  const fontPx = style.size * H;
  applyFont(ctx, style, H);
  const content = textContent(item, style, fx);
  const padding = style.background ? style.background.padding * fontPx : 0;
  const tracked = tracking && "letterSpacing" in ctx ? `${(style.letterSpacing + tracking) * fontPx}px` : null;
  const { lines, units } = textLayout(ctx, content, Math.max(10, w - padding * 2), phase.split, tracked);
  const count = units.length;
  // Le brouillage d'un texte découpé suit chaque unité : une lettre reste
  // brouillée tant que son propre avancement n'a pas atteint le seuil.
  const scrambleEntry = fx?.scramble;
  let moving = count > 0 && computeUnitStates(item, phase, count, !!scrambleEntry);
  let scramble: UnitScramble | null = null;
  if (scrambleEntry && count > 0) {
    const lock = optionNumber(scrambleEntry.options, "lock", 1);
    let pending = false;
    for (let index = 0; index < count; index++) if (unitProgresses[index] < lock) pending = true;
    if (pending) {
      moving = true;
      const scrambleColor = scrambleEntry.options?.color;
      scramble = {
        seed: item.id,
        tick: scrambleTick(fx!.local, fx!.fps, optionNumber(scrambleEntry.options, "rate", 20)),
        charset: optionString(scrambleEntry.options, "charset", "auto"),
        lock,
        color: typeof scrambleColor === "string" ? scrambleColor : undefined,
      };
    }
  }
  if (!moving) {
    // Toutes les unités sont posées : les mêmes appels que le bloc au repos
    // (seules s'ajoutent les mesures de la mise en page, qui ne dessinent rien).
    drawTextBlock(ctx, item, style, w, H, 1, color, tracking, fx ? { fx: { ...fx, scramble: undefined } } : undefined);
    return;
  }
  if (tracked) (ctx as CanvasRenderingContext2D).letterSpacing = tracked;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  const lineHeight = fontPx * style.lineHeight;
  const firstY = -(lines.length * lineHeight) / 2 + lineHeight / 2 + (item.opticalCenter ? opticalShift(ctx) : 0);

  for (let index = 0; index < lines.length; index++) lineAlphas[index] = 0;
  for (let index = 0; index < count; index++) {
    const state = unitStates[index];
    const unit = units[index];
    const shown = state.reveal >= 1 || Math.round(unit.graphemeEnds.length * state.reveal) > 0;
    const alpha = shown ? Math.min(1, Math.max(0, state.opacity)) : 0;
    if (alpha > lineAlphas[unit.line]) lineAlphas[unit.line] = alpha;
  }

  if (style.background && !fx?.noBackground) {
    ctx.save();
    ctx.fillStyle = style.background.color;
    const base = ctx.globalAlpha;
    for (let index = 0; index < lines.length; index++) {
      const alpha = lineAlphas[index];
      if (!(alpha > 0.001)) continue;
      ctx.globalAlpha = base * alpha;
      const boxWidth = lines[index].width + padding * 2;
      const x = style.align === "left" ? -w / 2 : style.align === "right" ? w / 2 - boxWidth : -boxWidth / 2;
      const y = firstY + index * lineHeight - lineHeight / 2;
      roundedRect(ctx, x, y, boxWidth, lineHeight, style.background.radius * fontPx);
      ctx.fill();
    }
    ctx.restore();
  }

  const shifts = trackingShifts(units, count, style.align, fontPx);
  const pass: UnitPass = { style, lines, w, W, H, padding, fontPx, lineHeight, firstY, shifts, scramble };
  if (style.stroke && style.stroke.width > 0) {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeStyle = style.stroke.color;
    ctx.lineWidth = style.stroke.width * fontPx * 2;
    for (let index = 0; index < count; index++) drawUnit(ctx, units[index], unitStates[index], pass, true, index);
    ctx.restore();
  }
  ctx.save();
  if (style.shadow) {
    ctx.shadowColor = style.shadow.color;
    ctx.shadowBlur = style.shadow.blur * fontPx;
    ctx.shadowOffsetY = style.shadow.offsetY * fontPx;
  }
  ctx.fillStyle = color ?? style.color;
  for (let index = 0; index < count; index++) drawUnit(ctx, units[index], unitStates[index], pass, false, index);
  ctx.restore();

  // Curseur : après la dernière unité montrée, plein tant qu'il en reste à taper.
  const cursor = fx?.cursor;
  if (cursor) {
    let last = -1;
    let typing = false;
    for (let index = 0; index < count; index++) {
      const state = unitStates[index];
      const visible = state.opacity > 0.001;
      const some = visible && (state.reveal >= 1 || Math.round(units[index].graphemeEnds.length * state.reveal) > 0);
      if (some) last = index;
      if (!(visible && state.reveal >= 1)) typing = true;
    }
    const lineOf = last >= 0 ? units[last].line : 0;
    const x =
      last >= 0
        ? lineLeft(style.align, w, padding, lines[lineOf].width) + units[last].x + units[last].width + (shifts ? shifts[last] : 0)
        : lineLeft(style.align, w, padding, lines[0]?.width ?? 0);
    paintCaret(ctx, fx!, cursor, x, firstY + lineOf * lineHeight, fontPx, color ?? style.color, typing);
  }
}

// ─── Sous-titres animés ──────────────────────────────────────────

/**
 * Groupes de mots affichés ensemble : au plus `size` mots, et une coupure
 * après une ponctuation forte pour suivre les phrases.
 */
export function wordGroups(words: TimedWord[], size: number): number[][] {
  const groups: number[][] = [];
  let current: number[] = [];
  words.forEach((word, index) => {
    current.push(index);
    if (current.length >= Math.max(1, size) || /[.!?…:;,]$/.test(word.text)) {
      groups.push(current);
      current = [];
    }
  });
  if (current.length) groups.push(current);
  return groups;
}

/**
 * Sous-titres animés. Une animation découpée posée sur l'élément s'applique
 * aux mots du groupe affiché (quelle que soit son unité : un sous-titre se
 * découpe en mots), en plus de la mise en valeur du mot prononcé.
 */
function drawKaraoke(
  ctx: Ctx,
  item: TextItem,
  frame: number,
  fps: number,
  w: number,
  canvasHeight: number,
  color?: string,
  phase: SplitPhase | null = null,
  canvasWidth = canvasHeight
) {
  const karaoke = item.karaoke!;
  const words = karaoke.words;
  if (words.length === 0) return;
  const nowMs = ((frame - item.start + karaoke.offset) / fps) * 1000;

  // Mot en cours : le dernier commencé. Entre deux groupes, le groupe suivant
  // n'apparaît qu'à son premier mot ; après la fin, plus rien.
  let active = -1;
  for (let index = 0; index < words.length; index++) {
    if (words[index].startMs <= nowMs) active = index;
    else break;
  }
  if (active === -1) return;
  if (nowMs > words[words.length - 1].endMs + 250) return;
  const group = wordGroups(words, karaoke.groupSize).find((entry) => entry.includes(active))!;
  const moving = phase !== null && computeUnitStates(item, phase, group.length);

  const style = item.style;
  const fontPx = style.size * canvasHeight;
  ctx.font = fontString(style, canvasHeight);
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D).letterSpacing = `${style.letterSpacing * fontPx}px`;
  }
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  const texts = group.map((index) => (style.uppercase ? words[index].text.toUpperCase() : words[index].text));
  const space = ctx.measureText(" ").width;
  const widths = texts.map((text) => ctx.measureText(text).width);

  // Lignes : les mots du groupe qui tiennent dans la largeur de l'élément.
  const lines: number[][] = [];
  let line: number[] = [];
  let lineWidth = 0;
  texts.forEach((_, index) => {
    const extra = (line.length ? space : 0) + widths[index];
    if (line.length && lineWidth + extra > w) {
      lines.push(line);
      line = [];
      lineWidth = 0;
    }
    lineWidth += (line.length ? space : 0) + widths[index];
    line.push(index);
  });
  if (line.length) lines.push(line);

  const lineHeight = fontPx * style.lineHeight;
  const firstY = -(lines.length * lineHeight) / 2 + lineHeight / 2 + (item.opticalCenter ? opticalShift(ctx) : 0);

  lines.forEach((entries, lineIndex) => {
    const total = entries.reduce((sum, index, position) => sum + widths[index] + (position ? space : 0), 0);
    let x = style.align === "left" ? -w / 2 : style.align === "right" ? w / 2 - total : -total / 2;
    const y = firstY + lineIndex * lineHeight;
    for (const index of entries) {
      const wordIndex = group[index];
      const current = wordIndex === active;
      // Le mot prononcé grossit brièvement à son arrivée.
      const age = nowMs - words[wordIndex].startMs;
      const pop = current ? 1 + 0.12 * Math.max(0, 1 - age / 180) : 1;
      // Animation découpée en cours : l'état du mot, à son rang dans le groupe.
      const state = moving ? unitStates[index] : null;
      const opacity = state ? Math.min(1, state.opacity) : 1;
      const text =
        state && state.reveal < 1
          ? sliceGraphemes(texts[index], Math.round(graphemeCount(texts[index]) * Math.max(0, state.reveal)))
          : texts[index];
      if (!(opacity > 0.001) || !text) {
        x += widths[index] + space;
        continue;
      }
      ctx.save();
      if (state) {
        if (opacity < 1) ctx.globalAlpha *= opacity;
        const length = state.unit === "em" ? fontPx : Math.min(canvasWidth, canvasHeight);
        enterUnit(ctx, state, x + widths[index] / 2, y, length, canvasWidth, canvasHeight, pop);
      } else {
        ctx.translate(x + widths[index] / 2, y);
        ctx.scale(pop, pop);
      }
      if (style.stroke && style.stroke.width > 0) {
        ctx.save();
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        ctx.strokeStyle = style.stroke.color;
        ctx.lineWidth = style.stroke.width * fontPx * 2;
        ctx.strokeText(text, -widths[index] / 2, 0);
        ctx.restore();
      }
      if (style.shadow) {
        ctx.shadowColor = style.shadow.color;
        ctx.shadowBlur = style.shadow.blur * fontPx;
        ctx.shadowOffsetY = style.shadow.offsetY * fontPx;
      }
      const emphasized = !current && karaoke.emphasis?.indices.includes(wordIndex);
      ctx.fillStyle = current ? karaoke.highlight : emphasized ? karaoke.emphasis!.color : (state?.color ?? color ?? style.color);
      ctx.fillText(text, -widths[index] / 2, 0);
      ctx.restore();
      x += widths[index] + space;
    }
  });
}

// ─── Formes ──────────────────────────────────────────────────────

function drawShape(ctx: Ctx, item: ShapeItem, frame: number, w: number, h: number, color?: string | CanvasGradient, minSide = Math.min(w, h)) {
  const fill = color ?? item.fill;
  if (item.shape === "stroke") {
    drawStroke(ctx, item, frame, w, h, fill, minSide);
    return;
  }
  const radius = Math.min(item.radius * Math.min(w, h), Math.min(w, h) / 2);
  if (item.shape === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    return;
  }
  if (item.shape === "progress") {
    // Barre de compte à rebours : se remplit (ou se vide) sur toute la durée.
    const progress = Math.min(1, Math.max(0, (frame - item.start) / Math.max(1, item.duration - 1)));
    const ratio = item.progress?.reverse ? 1 - progress : progress;
    roundedRect(ctx, -w / 2, -h / 2, w, h, radius);
    ctx.fillStyle = item.progress?.track ?? "rgba(255,255,255,0.25)";
    ctx.fill();
    ctx.save();
    roundedRect(ctx, -w / 2, -h / 2, w, h, radius);
    ctx.clip();
    ctx.fillStyle = fill;
    ctx.fillRect(-w / 2, -h / 2, w * ratio, h);
    ctx.restore();
    return;
  }
  roundedRect(ctx, -w / 2, -h / 2, w, h, radius);
  ctx.fillStyle = fill;
  if (item.shadow && !color) {
    ctx.save();
    ctx.shadowColor = item.shadow.color;
    ctx.shadowBlur = item.shadow.blur * minSide;
    ctx.shadowOffsetY = item.shadow.offsetY * minSide;
    ctx.fill();
    ctx.restore();
  } else ctx.fill();
  if (item.pattern && !color) paintDots(ctx, item, w, h, radius);
}

/**
 * Trame en points d'un aplat : une seule forme, des points en quinconce,
 * coupée aux bords de l'aplat. Le pas suit le petit côté de l'aplat : la
 * vignette et le rendu plein format montrent la même trame.
 */
function paintDots(ctx: Ctx, item: ShapeItem, w: number, h: number, radius: number) {
  const pattern = item.pattern!;
  const step = Math.max(4, pattern.spacing * Math.min(w, h));
  const dot = step * 0.28;
  ctx.save();
  roundedRect(ctx, -w / 2, -h / 2, w, h, radius);
  ctx.clip();
  ctx.globalAlpha *= Math.min(1, Math.max(0, pattern.opacity));
  ctx.fillStyle = pattern.color;
  ctx.beginPath();
  let row = 0;
  for (let y = -h / 2; y <= h / 2 + step; y += step * 0.866, row++) {
    for (let x = -w / 2 - (row % 2 ? step / 2 : 0); x <= w / 2 + step; x += step) {
      ctx.moveTo(x + dot, y);
      ctx.arc(x, y, dot, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.restore();
}

// ─── Tracés ──────────────────────────────────────────────────────

/** Points par segment d'une courbe lissée : assez pour qu'aucun angle ne se voie à 1080 px. */
const CURVE_STEPS = 14;

/**
 * Points d'un tracé dans la boîte de l'élément, centrée sur l'origine. Une
 * courbe lissée passe par chaque point (Catmull-Rom) ; un tracé fermé
 * revient à son premier point.
 */
export function strokePolyline(path: StrokePath, w: number, h: number): [number, number][] {
  const points = path.points.slice(0, MAX_STROKE_POINTS).map(([x, y]): [number, number] => [(x - 0.5) * w, (y - 0.5) * h]);
  if (points.length < 2 || !path.smooth) return path.closed && points.length > 2 ? [...points, points[0]] : points;
  const count = points.length;
  const at = (index: number): [number, number] => {
    if (path.closed) return points[((index % count) + count) % count];
    return points[Math.min(count - 1, Math.max(0, index))];
  };
  const result: [number, number][] = [points[0]];
  const segments = path.closed ? count : count - 1;
  for (let index = 0; index < segments; index++) {
    const [p0, p1, p2, p3] = [at(index - 1), at(index), at(index + 1), at(index + 2)];
    for (let step = 1; step <= CURVE_STEPS; step++) {
      const t = step / CURVE_STEPS;
      const t2 = t * t;
      const t3 = t2 * t;
      const blend = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      result.push([blend(p0[0], p1[0], p2[0], p3[0]), blend(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return result;
}

/** Les premiers `fraction` de la longueur d'une ligne brisée (le dernier point coupé au bon endroit). */
export function partialPolyline(points: [number, number][], fraction: number): [number, number][] {
  if (fraction >= 1 || points.length < 2) return points;
  const lengths = [0];
  for (let index = 1; index < points.length; index++) {
    lengths.push(lengths[index - 1] + Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]));
  }
  const target = lengths[lengths.length - 1] * Math.max(0, fraction);
  const result: [number, number][] = [points[0]];
  for (let index = 1; index < points.length; index++) {
    if (lengths[index] < target) {
      result.push(points[index]);
      continue;
    }
    const span = lengths[index] - lengths[index - 1];
    const t = span > 0 ? (target - lengths[index - 1]) / span : 0;
    result.push([points[index - 1][0] + (points[index][0] - points[index - 1][0]) * t, points[index - 1][1] + (points[index][1] - points[index - 1][1]) * t]);
    break;
  }
  return result;
}

/** Pointe de flèche ouverte en `tip`, dans le sens qui va de `from` à `tip`. */
function arrowHead(ctx: Ctx, from: [number, number], tip: [number, number], length: number) {
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const spread = 0.52;
  ctx.beginPath();
  ctx.moveTo(tip[0] - length * Math.cos(angle - spread), tip[1] - length * Math.sin(angle - spread));
  ctx.lineTo(tip[0], tip[1]);
  ctx.lineTo(tip[0] - length * Math.cos(angle + spread), tip[1] - length * Math.sin(angle + spread));
  ctx.stroke();
}

/** Point de la ligne brisée assez loin de son bout pour donner le sens de la pointe. */
function headBase(points: [number, number][], fromEnd: boolean, distance: number): [number, number] {
  const ordered = fromEnd ? [...points].reverse() : points;
  const tip = ordered[0];
  for (const point of ordered) if (Math.hypot(point[0] - tip[0], point[1] - tip[1]) >= distance) return point;
  return ordered[ordered.length - 1];
}

/**
 * Tracé : chaque trait se dessine sur sa longueur réelle entre ses deux
 * instants (adouci aux deux bouts), avec des bouts arrondis. La pointe d'une
 * flèche pousse pendant le dernier cinquième du tracé.
 */
function drawStroke(ctx: Ctx, item: ShapeItem, frame: number, w: number, h: number, color: string | CanvasGradient, minSide: number) {
  const stroke = item.stroke;
  if (!stroke?.paths?.length) return;
  const lineWidth = Math.max(1, stroke.width * minSide);
  const local = frame - item.start;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const path of stroke.paths.slice(0, MAX_STROKE_PATHS)) {
    const raw = path.draw ? Math.min(1, Math.max(0, (local - path.draw.at) / Math.max(1, path.draw.frames))) : 1;
    if (raw <= 0) continue;
    const progress = raw * raw * (3 - 2 * raw);
    const points = partialPolyline(strokePolyline(path, w, h), progress);
    if (points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let index = 1; index < points.length; index++) ctx.lineTo(points[index][0], points[index][1]);
    ctx.stroke();
    const headLength = lineWidth * 3.4 * Math.min(1, Math.max(0, (progress - 0.8) / 0.2));
    if (headLength > 0.5 && (path.head === "end" || path.head === "both")) {
      arrowHead(ctx, headBase(points, true, lineWidth * 2), points[points.length - 1], headLength);
    }
    if (path.head === "start" || path.head === "both") {
      const startLength = lineWidth * 3.4 * Math.min(1, progress / 0.2);
      arrowHead(ctx, headBase(points, false, lineWidth * 2), points[0], startLength);
    }
  }
  ctx.restore();
}

function roundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  const radius = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
