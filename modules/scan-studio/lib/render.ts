/**
 * Dessin d'une page sur un contexte 2D.
 *
 * La scène de l'atelier et l'export appellent la même fonction, `renderPage` :
 * ce qu'on voit dans la vue « traduit » est ce qu'on exporte. Le repère est
 * celui de la page, en pixels ; à l'appelant de poser avant l'échelle et le
 * décalage de sa vue.
 *
 * Ce fichier n'importe ni React ni les polices : le choix de la graisse
 * disponible lui est passé (`resolveWeight`), ce qui le laisse testable sous
 * Node avec un faux contexte.
 */

import { offsetPolygon } from "./geometry";
import { layoutText, minReadableSize, type Measure, type TextLayout } from "./text-layout";
import { boundsOf, resolveStyle, type BrushStroke, type ChapterSettings, type Point, type RegionMask, type ScanRegion, type TextStyle } from "./types";

export type ResolveWeight = (family: string, weight: number) => number;

export interface PageRenderOptions {
  /** `original` : l'image seule ; `translated` : masques et textes par-dessus. */
  view: "original" | "translated";
  /** Masques et textes se coupent séparément, pour voir ce qu'il y a dessous. */
  showMasks?: boolean;
  showTexts?: boolean;
  resolveWeight?: ResolveWeight;
  /** Taille minimale lisible ; par défaut déduite de la largeur de la page. */
  minSize?: number;
  /** Mises en lignes déjà calculées. À vider quand les polices finissent de charger. */
  layoutCache?: WeakMap<ScanRegion, TextLayout>;
}

/** Valeur de `ctx.font` pour un style et une taille. Le nom de police est une donnée : il est assaini. */
export function fontOf(style: TextStyle, size: number, resolveWeight?: ResolveWeight): string {
  const family = style.font.replace(/["\\;]/g, "");
  const weight = resolveWeight ? resolveWeight(style.font, style.weight) : style.weight;
  return `${style.italic ? "italic " : ""}${weight} ${size}px "${family}", sans-serif`;
}

/** Mesure fondée sur un canevas. Elle modifie `ctx.font` : l'appelant l'entoure d'un `save` / `restore`. */
export function createMeasure(ctx: CanvasRenderingContext2D, resolveWeight?: ResolveWeight): Measure {
  return (text, style, size) => {
    ctx.font = fontOf(style, size, resolveWeight);
    return ctx.measureText(text).width;
  };
}

/** Épaisseur visible du contour du texte, de chaque côté des lettres. */
function strokeWidthOf(style: TextStyle): number {
  return style.stroke && style.stroke.width > 0 ? style.stroke.width : 0;
}

/**
 * Marge gardée entre le texte et sa boîte : la place du contour, et, en
 * ajustement automatique, un peu d'air pour ne pas toucher le bord de la bulle.
 */
export function textPadding(region: ScanRegion, style: TextStyle): number {
  const box = region.text.box;
  const breathing = region.text.autoFit ? Math.min(box.width, box.height) * 0.04 : 0;
  return strokeWidthOf(style) + breathing;
}

/** Mise en lignes de la traduction d'une zone dans sa boîte. */
export function layoutRegion(
  region: ScanRegion,
  settings: ChapterSettings,
  measure: Measure,
  options: { minSize: number; cache?: WeakMap<ScanRegion, TextLayout> },
): TextLayout {
  const cached = options.cache?.get(region);
  if (cached) return cached;
  const style = resolveStyle(region, settings);
  const layout = layoutText(region.translation.text, style, region.text.box, measure, {
    autoFit: region.text.autoFit,
    minSize: options.minSize,
    padding: textPadding(region, style),
  });
  options.cache?.set(region, layout);
  return layout;
}

// ─── Masque ──────────────────────────────────────────────────────

function tracePolygon(ctx: CanvasRenderingContext2D, points: Point[]) {
  points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
  ctx.closePath();
}

/** Trace (sans le remplir) le chemin de la forme du masque autour d'un contour. */
export function traceMaskShape(ctx: CanvasRenderingContext2D, mask: RegionMask, outline: Point[]): void {
  ctx.beginPath();
  if (mask.shape === "outline") {
    tracePolygon(ctx, offsetPolygon(outline, mask.grow));
    return;
  }

  const bounds = boundsOf(outline);
  const width = Math.max(0, bounds.width + 2 * mask.grow);
  const height = Math.max(0, bounds.height + 2 * mask.grow);
  const x = bounds.x + bounds.width / 2 - width / 2;
  const y = bounds.y + bounds.height / 2 - height / 2;

  if (mask.shape === "rect") {
    ctx.rect(x, y, width, height);
  } else if (mask.shape === "rounded") {
    const radius = Math.min(width, height) * 0.25;
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  } else {
    // Plus petite ellipse, aux proportions du rectangle englobant, qui contient
    // tout le contour : √2 fois le rectangle pour un contour rectangulaire.
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const halfWidth = Math.max(bounds.width / 2, 0.5);
    const halfHeight = Math.max(bounds.height / 2, 0.5);
    const reach = outline.reduce(
      (furthest, point) => Math.max(furthest, Math.hypot((point.x - centerX) / halfWidth, (point.y - centerY) / halfHeight)),
      1,
    );
    ctx.ellipse(centerX, centerY, Math.max(0, halfWidth * reach + mask.grow), Math.max(0, halfHeight * reach + mask.grow), 0, 0, Math.PI * 2);
  }
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: BrushStroke) {
  if (stroke.points.length === 0) return;
  if (stroke.points.length === 1) {
    ctx.fillStyle = stroke.color;
    ctx.beginPath();
    ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  stroke.points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
  ctx.stroke();
}

/** Aplat du masque, puis les retouches au pinceau. Un masque `none` ne cache rien. */
/**
 * Une zone dont le texte a été lu mais pas encore traduit garde son original
 * visible : la masquer laisserait une bulle vide, sans rien à lire ni à
 * traduire. Une zone tracée à la main, sans texte lu, se masque tout de suite.
 */
export function awaitsTranslation(region: ScanRegion): boolean {
  return !region.translation.text.trim() && Boolean(region.reading.clean.trim());
}

export function drawMask(ctx: CanvasRenderingContext2D, region: ScanRegion): void {
  const { mask, outline } = region;
  if (mask.kind === "none") return;
  ctx.save();
  if (outline.length >= 3) {
    ctx.fillStyle = mask.color;
    traceMaskShape(ctx, mask, outline);
    ctx.fill();
  }
  for (const stroke of mask.strokes) drawStroke(ctx, stroke);
  ctx.restore();
}

// ─── Texte ───────────────────────────────────────────────────────

/** Dessine les lignes d'une zone dans sa boîte, tournée autour de son centre. */
export function drawText(ctx: CanvasRenderingContext2D, region: ScanRegion, style: TextStyle, layout: TextLayout, resolveWeight?: ResolveWeight): void {
  if (layout.lines.length === 0) return;
  const box = region.text.box;
  const padding = textPadding(region, style);

  ctx.save();
  ctx.translate(box.x + box.width / 2, box.y + box.height / 2);
  if (box.rotation) ctx.rotate((box.rotation * Math.PI) / 180);
  ctx.font = fontOf(style, layout.size, resolveWeight);
  ctx.textAlign = style.align;
  ctx.textBaseline = "middle";

  const anchor = style.align === "left" ? -box.width / 2 + padding : style.align === "right" ? box.width / 2 - padding : 0;
  const top = -layout.height / 2;
  const baselines = layout.lines.map((_, index) => top + (index + 0.5) * layout.lineHeight);

  // Le contour passe entièrement sous le remplissage : une ligne ne mord pas sur la précédente.
  const strokeWidth = strokeWidthOf(style);
  if (style.stroke && strokeWidth > 0) {
    ctx.strokeStyle = style.stroke.color;
    ctx.lineWidth = strokeWidth * 2;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    layout.lines.forEach((line, index) => line && ctx.strokeText(line, anchor, baselines[index]));
  }
  ctx.fillStyle = style.color;
  layout.lines.forEach((line, index) => line && ctx.fillText(line, anchor, baselines[index]));
  ctx.restore();
}

// ─── Page ────────────────────────────────────────────────────────

/**
 * Dessine une page : l'image d'origine, puis le masque de chaque zone, puis
 * chaque bloc de texte. Tous les masques passent avant tous les textes, pour
 * qu'un masque ne recouvre jamais le texte d'une zone voisine.
 */
export function renderPage(
  ctx: CanvasRenderingContext2D,
  page: { width: number; height: number },
  image: CanvasImageSource | null,
  regions: ScanRegion[],
  settings: ChapterSettings,
  options: PageRenderOptions,
): void {
  if (image) {
    ctx.drawImage(image, 0, 0, page.width, page.height);
  } else {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, page.width, page.height);
    ctx.restore();
  }
  if (options.view === "original") return;

  if (options.showMasks !== false) {
    for (const region of regions) {
      if (!awaitsTranslation(region)) drawMask(ctx, region);
    }
  }
  if (options.showTexts !== false) {
    const minSize = options.minSize ?? minReadableSize(page.width);
    ctx.save();
    const measure = createMeasure(ctx, options.resolveWeight);
    const layouts = regions.map((region) =>
      region.translation.text.trim() ? layoutRegion(region, settings, measure, { minSize, cache: options.layoutCache }) : null,
    );
    ctx.restore();
    regions.forEach((region, index) => {
      const layout = layouts[index];
      if (layout) drawText(ctx, region, resolveStyle(region, settings), layout, options.resolveWeight);
    });
  }
}
