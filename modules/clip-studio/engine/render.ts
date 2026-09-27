/**
 * Dessin d'une image du clip sur un canevas 2D.
 *
 * C'est l'unique fonction de rendu : l'aperçu l'appelle à chaque image
 * affichée, l'export à chaque image encodée. Ce que l'on voit dans l'éditeur
 * est donc exactement ce qui sort dans le MP4.
 */

import {
  animStateAt,
  cameraAt,
  isActive,
  transitionAt,
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
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate((t.x + anim.dx) * W, (t.y + anim.dy) * H);
  if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180);
  if (anim.scale !== 1) ctx.scale(anim.scale, anim.scale);

  // Balayage : on ne dessine qu'une bande grandissante de gauche à droite.
  if (anim.wipe < 1) {
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w * anim.wipe, h);
    ctx.clip();
  }

  switch (item.type) {
    case "image":
    case "video":
      drawMedia(ctx, item, frame, w, h, resolve);
      break;
    case "text":
      if (item.karaoke) drawKaraoke(ctx, item, frame, project.fps, w, H);
      else drawText(ctx, item, w, H, anim.reveal);
      break;
    case "shape":
      drawShape(ctx, item, frame, w, h);
      break;
  }
  ctx.restore();
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

/** Découpe le texte en lignes qui tiennent dans `maxWidth`. */
export function wrapText(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (ctx.measureText(candidate).width <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawText(
  ctx: Ctx,
  item: TextItem,
  w: number,
  canvasHeight: number,
  reveal: number
) {
  const style = item.style;
  const fontPx = style.size * canvasHeight;
  ctx.font = fontString(style, canvasHeight);
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D).letterSpacing = `${style.letterSpacing * fontPx}px`;
  }
  ctx.textBaseline = "middle";
  ctx.textAlign = style.align;

  const content = style.uppercase ? item.text.toUpperCase() : item.text;
  const padding = style.background ? style.background.padding * fontPx : 0;
  const lines = wrapText(ctx, content, Math.max(10, w - padding * 2));
  const lineHeight = fontPx * style.lineHeight;
  const blockHeight = lines.length * lineHeight;

  // Machine à écrire : on coupe le texte au nombre de caractères révélés.
  let remaining = Math.round(content.replace(/\n/g, "").length * reveal);
  const visible = lines.map((line) => {
    const shown = line.slice(0, Math.max(0, remaining));
    remaining -= line.length;
    return shown;
  });

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
    ctx.fillStyle = style.color;
    ctx.fillText(text, anchorX, y);
    ctx.restore();
  }
}

// ─── Sous-titres animés ──────────────────────────────────────────

/**
 * Groupes de mots affichés ensemble : au plus `size` mots, et une coupure
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

function drawKaraoke(ctx: Ctx, item: TextItem, frame: number, fps: number, w: number, canvasHeight: number) {
  const karaoke = item.karaoke!;
  const words = karaoke.words;
  if (words.length === 0) return;
  const nowMs = ((frame - item.start + karaoke.offset) / fps) * 1000;

  // Mot en cours : le dernier commencé. Entre deux groupes, le groupe suivant
  // n'apparaît qu'à son premier mot ; après la fin, plus rien.
  let active = -1;
  for (let index = 0; index < words.length; index++) {
    if (words[index].startMs <= nowMs) active = index;
    else break;
  }
  if (active === -1) return;
  if (nowMs > words[words.length - 1].endMs + 250) return;
  const group = wordGroups(words, karaoke.groupSize).find((entry) => entry.includes(active))!;

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

  // Lignes : les mots du groupe qui tiennent dans la largeur de l'élément.
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
      ctx.save();
      ctx.translate(x + widths[index] / 2, y);
      ctx.scale(pop, pop);
      if (style.stroke && style.stroke.width > 0) {
        ctx.save();
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        ctx.strokeStyle = style.stroke.color;
        ctx.lineWidth = style.stroke.width * fontPx * 2;
        ctx.strokeText(texts[index], -widths[index] / 2, 0);
        ctx.restore();
      }
      if (style.shadow) {
        ctx.shadowColor = style.shadow.color;
        ctx.shadowBlur = style.shadow.blur * fontPx;
        ctx.shadowOffsetY = style.shadow.offsetY * fontPx;
      }
      ctx.fillStyle = current ? karaoke.highlight : style.color;
      ctx.fillText(texts[index], -widths[index] / 2, 0);
      ctx.restore();
      x += widths[index] + space;
    }
  });
}

// ─── Formes ──────────────────────────────────────────────────────

function drawShape(ctx: Ctx, item: ShapeItem, frame: number, w: number, h: number) {
  const radius = Math.min(item.radius * Math.min(w, h), Math.min(w, h) / 2);
  if (item.shape === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = item.fill;
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
    ctx.fillStyle = item.fill;
    ctx.fillRect(-w / 2, -h / 2, w * ratio, h);
    ctx.restore();
    return;
  }
  roundedRect(ctx, -w / 2, -h / 2, w, h, radius);
  ctx.fillStyle = item.fill;
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
