/**
 * Dessin d'une image du clip sur un canevas 2D.
 *
 * C'est l'unique fonction de rendu : l'aperçu l'appelle à chaque image
 * affichée, l'export à chaque image encodée. Ce que l'on voit dans l'éditeur
 * est donc exactement ce qui sort dans le MP4.
 */

import { isRestState, restState, stateForUnit, type UnitOptions } from "./motion/interpret";
import {
  graphemeCount,
  sliceGraphemes,
  textLayout,
  wrapText,
  type TextLayout,
  type TextUnit,
} from "./motion/text-layout";
import type { MotionState } from "./motion/types";
import {
  animStateAt,
  cameraAt,
  isActive,
  splitPhaseAt,
  transitionAt,
  type AnimState,
  type SplitPhase,
  type TransitionState,
} from "./timeline";
import type {
  ClipProject,
  ImageItem,
  ShapeItem,
  TextItem,
  TextStyle,
  TimedWord,
  VideoItem,
  VisualItem,
} from "./types";

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

  // La première piste est au-dessus : on dessine de la dernière à la première.
  for (let index = project.tracks.length - 1; index >= 0; index--) {
    const track = project.tracks[index];
    if (track.kind !== "visual" || track.hidden) continue;
    const items = track.items as VisualItem[];
    for (const item of items) {
      if (!isActive(item, frame)) continue;
      const transition = transitionAt(items, item, frame);
      if (transition) drawTransition(ctx, project, item, transition, frame, resolve);
      else drawItem(ctx, project, item, frame, resolve);
    }
  }
  ctx.restore();
}

/** Retouches qu'une transition applique au dessin d'un plan. */
interface Blend {
  opacity?: number;
  dx?: number;
  scale?: number;
  wipe?: number;
}

/** Le plan qui s'en va : figé sur sa dernière image, sans son animation de sortie. */
export function heldFrameOf(item: VisualItem): number {
  return item.start + item.duration - 1;
}

function drawTransition(
  ctx: Ctx,
  project: ClipProject,
  item: VisualItem,
  { kind, progress: t, from }: TransitionState,
  frame: number,
  resolve: VisualResolver
) {
  const outgoing = from ? ({ ...from, animOut: { kind: "none", frames: 0 } } as VisualItem) : null;
  const drawOutgoing = (blend?: Blend) => {
    if (outgoing) drawItem(ctx, project, outgoing, heldFrameOf(outgoing), resolve, blend);
  };
  const veil = (alpha: number) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, project.width, project.height);
    ctx.restore();
  };

  switch (kind) {
    case "fade-black":
      // Le plan sortant s'éteint jusqu'au noir, puis le suivant s'en dégage.
      if (t < 0.5) {
        drawOutgoing();
        veil(t * 2);
      } else {
        drawItem(ctx, project, item, frame, resolve);
        veil((1 - t) * 2);
      }
      return;
    case "slide":
      // Le plan suivant pousse le précédent hors du cadre, vers la gauche.
      drawOutgoing({ dx: -t });
      drawItem(ctx, project, item, frame, resolve, { dx: 1 - t });
      return;
    case "wipe":
      drawOutgoing();
      drawItem(ctx, project, item, frame, resolve, { wipe: t });
      return;
    case "zoom":
      drawOutgoing({ scale: 1 + 0.12 * t, opacity: 1 - t });
      drawItem(ctx, project, item, frame, resolve, { opacity: t, scale: 1.15 - 0.15 * t });
      return;
    default:
      drawOutgoing();
      drawItem(ctx, project, item, frame, resolve, { opacity: t });
  }
}

function drawItem(
  ctx: Ctx,
  project: ClipProject,
  item: VisualItem,
  frame: number,
  resolve: VisualResolver,
  blend: Blend = {}
) {
  const { width: W, height: H } = project;
  const base = animStateAt(item, frame);
  const anim = {
    ...base,
    opacity: base.opacity * (blend.opacity ?? 1),
    dx: base.dx + (blend.dx ?? 0),
    scale: base.scale * (blend.scale ?? 1),
    wipe: Math.min(base.wipe, blend.wipe ?? 1),
  };
  const t = item.transform;
  const opacity = t.opacity * anim.opacity;
  if (opacity <= 0.001) return;

  const w = t.width * W;
  const h = t.height * H;
  const unit = lengthUnit(item, anim, W, H);
  ctx.save();
  ctx.globalAlpha = opacity;
  // Chaque retouche n'est appliquée que si elle change quelque chose : un
  // élément au repos se dessine exactement comme avant les pistes.
  ctx.translate((t.x + anim.dx) * W + anim.x * unit, (t.y + anim.dy) * H + anim.y * unit);
  const rotation = t.rotation + anim.rotate;
  if (rotation) ctx.rotate((rotation * Math.PI) / 180);
  if (anim.skewX) ctx.transform(1, 0, Math.tan((anim.skewX * Math.PI) / 180), 1, 0, 0);
  const scaleX = anim.scale * anim.scaleX;
  const scaleY = anim.scale * anim.scaleY;
  if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);

  // Flou et luminosité : le filtre vit dans l'état sauvegardé, `restore` l'ôte.
  const filters: string[] = [];
  if (anim.blur > 0) filters.push(`blur(${(anim.blur * unit).toFixed(2)}px)`);
  if (anim.brightness !== 1) filters.push(`brightness(${Math.max(0, anim.brightness).toFixed(4)})`);
  if (filters.length) ctx.filter = filters.join(" ");

  // Balayage : on ne dessine qu'une bande grandissante de gauche à droite.
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

  switch (item.type) {
    case "image":
    case "video":
      drawMedia(ctx, item, frame, w, h, resolve);
      break;
    case "text": {
      // Une entrée, une sortie ou une mise en avant découpée (lignes, mots,
      // lettres) se dessine unité par unité ; sinon, le bloc, comme toujours.
      const split = splitPhaseAt(item, frame);
      if (item.karaoke) drawKaraoke(ctx, item, frame, project.fps, w, H, anim.color, split, W);
      else if (split) drawSplitText(ctx, item, w, h, W, H, split, anim.color, anim.tracking);
      else drawText(ctx, item, w, h, H, anim.reveal, anim.color, anim.tracking);
      break;
    }
    case "shape":
      drawShape(ctx, item, frame, w, h, anim.color);
      break;
  }
  ctx.restore();
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
  resolve: VisualResolver
) {
  const source = resolve(item, frame);
  const radius = Math.min(item.radius, Math.min(w, h) / 2);
  roundedRect(ctx, -w / 2, -h / 2, w, h, radius);
  ctx.clip();

  if (!source) {
    // Média pas encore chargé : un aplat neutre plutôt qu'un trou.
    ctx.fillStyle = "rgba(127,127,127,0.18)";
    ctx.fillRect(-w / 2, -h / 2, w, h);
    return;
  }

  const { width: sw, height: sh } = sourceSize(source);
  if (!sw || !sh) return;

  const camera =
    item.type === "image"
      ? cameraAt(item.motion, (frame - item.start) / Math.max(1, item.duration - 1))
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
    const maxWidth = Math.max(10, w - padding * 2);
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
  tracking = 0
) {
  const style = item.fit === "shrink" ? fittedStyle(ctx, item, w, h, canvasHeight) : item.style;
  applyFont(ctx, style, canvasHeight);
  drawTextBlock(ctx, item, style, w, canvasHeight, reveal, color, tracking);
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
  tracking: number
) {
  const fontPx = style.size * canvasHeight;
  ctx.textBaseline = "middle";
  ctx.textAlign = style.align;

  const content = style.uppercase ? item.text.toUpperCase() : item.text;
  const padding = style.background ? style.background.padding * fontPx : 0;
  const lines = wrapText(ctx, content, Math.max(10, w - padding * 2));
  const lineHeight = fontPx * style.lineHeight;
  const blockHeight = lines.length * lineHeight;

  // Espacement animé : appliqué après la coupe des lignes, pour que le texte
  // s'étire sans changer de lignes en cours d'animation.
  if (tracking && "letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D).letterSpacing = `${(style.letterSpacing + tracking) * fontPx}px`;
  }

  // Machine à écrire : on coupe le texte au nombre de graphèmes révélés ; un
  // émoji ou un accent combiné n'apparaît jamais à moitié. Tout révélé, les
  // lignes sont dessinées telles quelles.
  let visible = lines;
  if (reveal < 1) {
    let remaining = Math.round(graphemeCount(content.replace(/\n/g, "")) * reveal);
    visible = lines.map((line) => {
      const shown = sliceGraphemes(line, Math.max(0, remaining));
      remaining -= graphemeCount(line);
      return shown;
    });
  }

  const anchorX = style.align === "left" ? -w / 2 + padding : style.align === "right" ? w / 2 - padding : 0;
  const firstY = -blockHeight / 2 + lineHeight / 2;

  if (style.background) {
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

  for (let index = 0; index < visible.length; index++) {
    const text = visible[index];
    if (!text) continue;
    const y = firstY + index * lineHeight;
    if (style.stroke && style.stroke.width > 0) {
      ctx.save();
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.strokeStyle = style.stroke.color;
      ctx.lineWidth = style.stroke.width * fontPx * 2;
      ctx.strokeText(text, anchorX, y);
      ctx.restore();
    }
    ctx.save();
    if (style.shadow) {
      ctx.shadowColor = style.shadow.color;
      ctx.shadowBlur = style.shadow.blur * fontPx;
      ctx.shadowOffsetY = style.shadow.offsetY * fontPx;
    }
    ctx.fillStyle = color ?? style.color;
    ctx.fillText(text, anchorX, y);
    ctx.restore();
  }
}

// ─── Texte découpé ───────────────────────────────────────────────

/**
 * États des unités, gardés d'une image à l'autre et remplis en place : un
 * titre animé lettre par lettre n'alloue pas un état par lettre et par image.
 * Le dessin est synchrone, un seul tableau suffit.
 */
const unitStates: MotionState[] = [];
/** Opacité de la lettre la plus visible de chaque ligne, pour le fond. */
const lineAlphas: number[] = [];
const unitOptions: UnitOptions = {};

/**
 * Calcule l'état des `count` unités dans `unitStates`. Rend `false` si toutes
 * sont au repos : le texte se dessine alors en bloc, exactement comme hors
 * animation (dernière image d'une entrée, par exemple).
 */
function computeUnitStates(item: TextItem, phase: SplitPhase, count: number): boolean {
  unitOptions.params = phase.params;
  unitOptions.context = { baseColor: item.style.color };
  let moving = false;
  for (let index = 0; index < count; index++) {
    const state = (unitStates[index] ??= restState());
    unitOptions.into = state;
    stateForUnit(phase.preset, index, count, phase.local, phase.frames, item.id, unitOptions);
    if (!moving && !isRestState(state)) moving = true;
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
 * rotation, inclinaison, échelles, flou et luminosité. Comme pour un élément,
 * rien n'est appliqué qui ne change rien.
 */
function enterUnit(
  ctx: Ctx,
  state: MotionState,
  cx: number,
  cy: number,
  length: number,
  W: number,
  H: number,
  extraScale = 1
) {
  ctx.translate(cx + state.dx * W + state.x * length, cy + state.dy * H + state.y * length);
  if (state.rotate) ctx.rotate((state.rotate * Math.PI) / 180);
  if (state.skewX) ctx.transform(1, 0, Math.tan((state.skewX * Math.PI) / 180), 1, 0, 0);
  const scaleX = extraScale * state.scale * state.scaleX;
  const scaleY = extraScale * state.scale * state.scaleY;
  if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
  if (state.blur > 0 || state.brightness !== 1) {
    const blur = state.blur > 0 ? `blur(${(state.blur * length).toFixed(2)}px)` : "";
    const brightness = state.brightness !== 1 ? `brightness(${Math.max(0, state.brightness).toFixed(4)})` : "";
    ctx.filter = blur && brightness ? `${blur} ${brightness}` : blur || brightness;
  }
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
}

function drawUnit(ctx: Ctx, unit: TextUnit, state: MotionState, pass: UnitPass, stroke: boolean) {
  const opacity = Math.min(1, state.opacity);
  if (!(opacity > 0.001)) return;
  const text = revealedText(unit, state.reveal);
  if (!text) return;
  const left = lineLeft(pass.style.align, pass.w, pass.padding, pass.lines[unit.line].width) + unit.x;
  const length = state.unit === "em" ? pass.fontPx : Math.min(pass.W, pass.H);
  const half = unit.width / 2;

  ctx.save();
  if (opacity < 1) ctx.globalAlpha *= opacity;
  enterUnit(ctx, state, left + half, pass.firstY + unit.line * pass.lineHeight, length, pass.W, pass.H);

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

  if (stroke) ctx.strokeText(text, -half, 0);
  else {
    if (state.color !== undefined) ctx.fillStyle = state.color;
    ctx.fillText(text, -half, 0);
  }
  ctx.restore();
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
  tracking: number
) {
  const style = item.fit === "shrink" ? fittedStyle(ctx, item, w, h, H) : item.style;
  const fontPx = style.size * H;
  applyFont(ctx, style, H);
  const content = style.uppercase ? item.text.toUpperCase() : item.text;
  const padding = style.background ? style.background.padding * fontPx : 0;
  const tracked = tracking && "letterSpacing" in ctx ? `${(style.letterSpacing + tracking) * fontPx}px` : null;
  const { lines, units } = textLayout(ctx, content, Math.max(10, w - padding * 2), phase.split, tracked);
  const count = units.length;
  if (count === 0 || !computeUnitStates(item, phase, count)) {
    // Toutes les unités sont posées : les mêmes appels que le bloc au repos
    // (seules s'ajoutent les mesures de la mise en page, qui ne dessinent rien).
    drawTextBlock(ctx, item, style, w, H, 1, color, tracking);
    return;
  }
  if (tracked) (ctx as CanvasRenderingContext2D).letterSpacing = tracked;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  const lineHeight = fontPx * style.lineHeight;
  const firstY = -(lines.length * lineHeight) / 2 + lineHeight / 2;

  for (let index = 0; index < lines.length; index++) lineAlphas[index] = 0;
  for (let index = 0; index < count; index++) {
    const state = unitStates[index];
    const unit = units[index];
    const shown = state.reveal >= 1 || Math.round(unit.graphemeEnds.length * state.reveal) > 0;
    const alpha = shown ? Math.min(1, Math.max(0, state.opacity)) : 0;
    if (alpha > lineAlphas[unit.line]) lineAlphas[unit.line] = alpha;
  }

  if (style.background) {
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

  const pass: UnitPass = { style, lines, w, W, H, padding, fontPx, lineHeight, firstY };
  if (style.stroke && style.stroke.width > 0) {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeStyle = style.stroke.color;
    ctx.lineWidth = style.stroke.width * fontPx * 2;
    for (let index = 0; index < count; index++) drawUnit(ctx, units[index], unitStates[index], pass, true);
    ctx.restore();
  }
  ctx.save();
  if (style.shadow) {
    ctx.shadowColor = style.shadow.color;
    ctx.shadowBlur = style.shadow.blur * fontPx;
    ctx.shadowOffsetY = style.shadow.offsetY * fontPx;
  }
  ctx.fillStyle = color ?? style.color;
  for (let index = 0; index < count; index++) drawUnit(ctx, units[index], unitStates[index], pass, false);
  ctx.restore();
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
  const firstY = -(lines.length * lineHeight) / 2 + lineHeight / 2;

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
      ctx.fillStyle = current ? karaoke.highlight : (state?.color ?? color ?? style.color);
      ctx.fillText(text, -widths[index] / 2, 0);
      ctx.restore();
      x += widths[index] + space;
    }
  });
}

// ─── Formes ──────────────────────────────────────────────────────

function drawShape(ctx: Ctx, item: ShapeItem, frame: number, w: number, h: number, color?: string) {
  const fill = color ?? item.fill;
  const radius = Math.min(item.radius * Math.min(w, h), Math.min(w, h) / 2);
  if (item.shape === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    return;
  }
  if (item.shape === "progress") {
    // Barre de compte à rebours : se remplit (ou se vide) sur toute la durée.
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
  ctx.fill();
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
