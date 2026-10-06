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
  /**
   * Fond reconstruit d'une zone dont le masque est en mode « inpaint », s'il est
   * prêt. Absent ou `null` : la zone garde son aplat de couleur.
   */
  resolveInpaint?: (region: ScanRegion) => InpaintPatch | null;
}

/** Fond reconstruit, prêt à être posé : une image transparente hors du masque, et son coin dans la page. */
export interface InpaintPatch {
  image: CanvasImageSource;
  x: number;
  y: number;
}

/** Valeur de `ctx.font` pour un style et une taille. Le nom de police est une donnée : il est assaini. */
export function fontOf(style: TextStyle, size: number, resolveWeight?: ResolveWeight): string {
  const family = style.font.replace(/["\\;]/g, "");
  const weight = resolveWeight ? resolveWeight(style.font, style.weight) : style.weight;
  return `${style.italic ? "italic " : ""}${weight} ${size}px "${family}", sans-serif`;
}

/** Espace ajouté entre deux lettres, en pixels, à une taille donnée. */
export function letterSpacingOf(style: TextStyle, size: number): number {
  return style.letterSpacing ? style.letterSpacing * size : 0;
}

/** Étirement horizontal des lettres ; 1 quand le style n'en demande pas. */
export function stretchOf(style: TextStyle): number {
  return style.stretch && style.stretch > 0 ? style.stretch : 1;
}

/**
 * Chasse de chaque caractère d'une ligne, quand les lettres sont espacées : le
 * texte est alors posé lettre par lettre, par la mesure comme par le dessin.
 */
function advancesOf(ctx: CanvasRenderingContext2D, line: string): { characters: string[]; advances: number[] } {
  const characters = Array.from(line);
  return { characters, advances: characters.map((character) => ctx.measureText(character).width) };
}

/** Largeur d'une ligne telle qu'elle sera dessinée, espacement et étirement compris. `ctx.font` est déjà réglé. */
function lineWidth(ctx: CanvasRenderingContext2D, line: string, style: TextStyle, size: number): number {
  const spacing = letterSpacingOf(style, size);
  if (!spacing) return ctx.measureText(line).width * stretchOf(style);
  const { advances } = advancesOf(ctx, line);
  const letters = advances.reduce((sum, advance) => sum + advance, 0);
  return (letters + spacing * Math.max(0, advances.length - 1)) * stretchOf(style);
}

/** Mesure fondée sur un canevas. Elle modifie `ctx.font` : l'appelant l'entoure d'un `save` / `restore`. */
export function createMeasure(ctx: CanvasRenderingContext2D, resolveWeight?: ResolveWeight): Measure {
  return (text, style, size) => {
    ctx.font = fontOf(style, size, resolveWeight);
    return lineWidth(ctx, text, style, size);
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
    // Jamais plus gros que le lettrage d'origine : les bulles d'une page gardent une taille voisine.
    ...(region.text.maxSize ? { maxSize: Math.max(options.minSize, region.text.maxSize) } : {}),
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

/**
 * Forme du masque et retouches au pinceau. Avec `color`, tout est peint de
 * cette seule couleur : c'est la silhouette du masque, celle qui délimite le
 * fond à reconstruire.
 */
export function paintMask(ctx: CanvasRenderingContext2D, region: ScanRegion, color?: string): void {
  const { mask, outline } = region;
  ctx.save();
  if (outline.length >= 3) {
    ctx.fillStyle = color ?? mask.color;
    traceMaskShape(ctx, mask, outline);
    ctx.fill();
  }
  for (const stroke of mask.strokes) drawStroke(ctx, color ? { ...stroke, color } : stroke);
  ctx.restore();
}

/**
 * Masque d'une zone. En mode « inpaint », le fond reconstruit est posé s'il est
 * prêt ; tant qu'il ne l'est pas, ou s'il n'a pas pu être calculé, la zone
 * garde son aplat de couleur.
 */
export function drawMask(ctx: CanvasRenderingContext2D, region: ScanRegion, patch?: InpaintPatch | null): void {
  if (region.mask.kind === "none") return;
  if (region.mask.kind === "inpaint" && patch) {
    ctx.drawImage(patch.image, patch.x, patch.y);
    return;
  }
  paintMask(ctx, region);
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

  // Lettres espacées ou étirées (onomatopées) : chaque ligne est posée lettre par lettre.
  const spacing = letterSpacingOf(style, layout.size);
  const stretch = stretchOf(style);
  if (spacing !== 0 || stretch !== 1) {
    drawSpacedLines(ctx, layout.lines, baselines, style, { anchor, spacing, stretch });
    ctx.restore();
    return;
  }

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

/**
 * Lignes dont les lettres sont espacées ou étirées. Le repère est élargi de
 * `stretch` à l'horizontale ; les positions y sont donc divisées d'autant. Le
 * contour suit l'étirement, comme les lettres.
 */
function drawSpacedLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  baselines: number[],
  style: TextStyle,
  options: { anchor: number; spacing: number; stretch: number },
) {
  const { anchor, spacing, stretch } = options;
  ctx.scale(stretch, 1);
  ctx.textAlign = "left";

  const placed = lines.map((line) => {
    const { characters, advances } = advancesOf(ctx, line);
    const width = advances.reduce((sum, advance) => sum + advance, 0) + spacing * Math.max(0, advances.length - 1);
    const start = anchor / stretch - (style.align === "center" ? width / 2 : style.align === "right" ? width : 0);
    const positions: number[] = [];
    let cursor = start;
    for (const advance of advances) {
      positions.push(cursor);
      cursor += advance + spacing;
    }
    return { characters, positions };
  });

  // Le contour passe entièrement sous le remplissage, pour toutes les lettres de toutes les lignes.
  if (style.stroke && strokeWidthOf(style) > 0) {
    ctx.strokeStyle = style.stroke.color;
    ctx.lineWidth = strokeWidthOf(style) * 2;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    placed.forEach((line, index) => line.characters.forEach((character, at) => ctx.strokeText(character, line.positions[at], baselines[index])));
  }
  ctx.fillStyle = style.color;
  placed.forEach((line, index) => line.characters.forEach((character, at) => ctx.fillText(character, line.positions[at], baselines[index])));
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
      if (!awaitsTranslation(region)) drawMask(ctx, region, options.resolveInpaint?.(region));
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
