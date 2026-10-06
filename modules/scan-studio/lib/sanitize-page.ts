/**
 * Contrôle et remise en forme de ce que l'atelier envoie à l'enregistrement
 * d'une page.
 *
 * Les zones viennent du navigateur : rien n'y est tenu pour acquis. Ce qui est
 * mal formé est refusé avec un message qui dit où ; ce qui déborde seulement
 * (une coordonnée hors de la page, une taille démesurée) est ramené dans les
 * bornes ; les champs inconnus ne sont pas recopiés.
 *
 * Ce fichier ne dépend ni de Node ni du disque : il se teste seul.
 */

import {
  REGION_KINDS,
  isId,
  type AiAction,
  type AiSentKind,
  type AiTrace,
  type BrushStroke,
  type MaskShape,
  type PageStatus,
  type Point,
  type RegionKind,
  type RegionMask,
  type RegionReading,
  type RegionTranslation,
  type ScanRegion,
  type TextBox,
  type TextStyle,
  type TranslationStatus,
} from "./types";

/** Plafonds d'une page. Au-delà, c'est une erreur ou une attaque, pas un lettrage. */
export const PAGE_LIMITS = {
  regions: 400,
  outlinePoints: 500,
  strokes: 200,
  strokePoints: 2000,
  /** Texte lu ou traduit d'une zone, en caractères. */
  text: 5000,
  /** Propositions gardées par zone : les plus anciennes sont oubliées. */
  history: 50,
  /** Nom de moteur ou de police. */
  label: 100,
  /** Traces d'appels à une IA gardées par zone : les plus anciennes sont oubliées. */
  aiTraces: 20,
};

export interface PageSize {
  width: number;
  height: number;
}

export const PAGE_STATUSES: PageStatus[] = ["imported", "analyzed", "translated", "reviewed", "exported"];
const TRANSLATION_STATUSES: TranslationStatus[] = ["todo", "proposed", "edited", "approved"];
const MASK_SHAPES: MaskShape[] = ["rect", "rounded", "ellipse", "outline"];
const ALIGNMENTS: TextStyle["align"][] = ["left", "center", "right"];

const COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isColor(value: unknown): value is string {
  return typeof value === "string" && COLOR_PATTERN.test(value);
}

export function isPageStatus(value: unknown): value is PageStatus {
  return PAGE_STATUSES.includes(value as PageStatus);
}

// ─── Briques ─────────────────────────────────────────────────────

type Fields = Record<string, unknown>;

function fail(where: string, problem: string): never {
  throw new Error(`${where} : ${problem}.`);
}

function asObject(value: unknown, where: string, name: string): Fields {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(where, `${name} manquant ou mal formé`);
  return value as Fields;
}

function asArray(value: unknown, where: string, name: string, max: number): unknown[] {
  if (!Array.isArray(value)) fail(where, `${name} mal formé`);
  if (value.length > max) fail(where, `${name} trop long (${max} éléments au plus)`);
  return value;
}

/** Nombre fini, ramené entre deux bornes et arrondi au centième. */
function asNumber(value: unknown, min: number, max: number, where: string, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(where, `${name} doit être un nombre`);
  return Math.round(Math.min(Math.max(value, min), max) * 100) / 100;
}

function asBoolean(value: unknown, where: string, name: string): boolean {
  if (typeof value !== "boolean") fail(where, `${name} doit valoir vrai ou faux`);
  return value;
}

/** Texte borné, débarrassé des caractères de contrôle (sauf tabulation et retour à la ligne). */
function asText(value: unknown, max: number, where: string, name: string): string {
  if (typeof value !== "string") fail(where, `${name} doit être un texte`);
  if (value.length > max) fail(where, `${name} trop long (${max} caractères au plus)`);
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

/** Nom court sur une ligne : moteur, police. */
function asLabel(value: unknown, where: string, name: string): string {
  const label = asText(value, PAGE_LIMITS.label, where, name).replace(/\s+/g, " ").trim();
  if (!label) fail(where, `${name} vide`);
  return label;
}

function asChoice<T extends string>(value: unknown, choices: readonly T[], where: string, name: string): T {
  if (!choices.includes(value as T)) fail(where, `${name} inconnu`);
  return value as T;
}

function asColor(value: unknown, where: string, name: string): string {
  if (!isColor(value)) fail(where, `${name} invalide (attendu : #rgb, #rrggbb ou #rrggbbaa)`);
  return value.toLowerCase();
}

function asPoint(value: unknown, size: PageSize, where: string, name: string): Point {
  const point = asObject(value, where, name);
  return {
    x: asNumber(point.x, 0, size.width, where, name),
    y: asNumber(point.y, 0, size.height, where, name),
  };
}

// ─── Style du texte ──────────────────────────────────────────────

/**
 * Style d'un texte. Complet pour les réglages d'un chapitre ; partiel pour une
 * zone, qui ne porte que ce qu'elle change au style de son type.
 */
export function sanitizeTextStyle(value: unknown, where: string, mode: "full"): TextStyle;
export function sanitizeTextStyle(value: unknown, where: string, mode: "partial"): Partial<TextStyle>;
export function sanitizeTextStyle(value: unknown, where: string, mode: "full" | "partial"): Partial<TextStyle> {
  const input = asObject(value, where, "style");
  const style: Partial<TextStyle> = {};
  const has = (key: keyof TextStyle) => mode === "full" || input[key] !== undefined;

  if (has("font")) style.font = asLabel(input.font, where, "police");
  if (has("size")) style.size = asNumber(input.size, 1, 2000, where, "taille du texte");
  if (has("weight")) style.weight = Math.round(asNumber(input.weight, 100, 900, where, "graisse"));
  if (has("italic")) style.italic = asBoolean(input.italic, where, "italique");
  if (has("uppercase")) style.uppercase = asBoolean(input.uppercase, where, "capitales");
  if (has("color")) style.color = asColor(input.color, where, "couleur du texte");
  if (has("lineHeight")) style.lineHeight = asNumber(input.lineHeight, 0.5, 4, where, "interligne");
  if (has("align")) style.align = asChoice(input.align, ALIGNMENTS, where, "alignement");
  // Le contour est facultatif partout : absent, le texte n'en a pas.
  if (input.stroke !== undefined && input.stroke !== null) {
    const stroke = asObject(input.stroke, where, "contour du texte");
    style.stroke = {
      color: asColor(stroke.color, where, "couleur du contour"),
      width: asNumber(stroke.width, 0, 200, where, "épaisseur du contour"),
    };
  }
  // Réglages des onomatopées, facultatifs partout : absents, les lettres gardent leur chasse.
  if (input.letterSpacing !== undefined && input.letterSpacing !== null) {
    style.letterSpacing = asNumber(input.letterSpacing, -0.2, 2, where, "espacement des lettres");
  }
  if (input.stretch !== undefined && input.stretch !== null) {
    style.stretch = asNumber(input.stretch, 0.25, 4, where, "étirement des lettres");
  }
  return style;
}

// ─── Zones ───────────────────────────────────────────────────────

function sanitizeReading(value: unknown, where: string): RegionReading {
  const input = asObject(value, where, "texte lu");
  return {
    raw: asText(input.raw, PAGE_LIMITS.text, where, "texte lu"),
    clean: asText(input.clean, PAGE_LIMITS.text, where, "texte nettoyé"),
    confidence: asNumber(input.confidence, 0, 1, where, "confiance"),
    engine: asLabel(input.engine, where, "moteur de lecture"),
    edited: asBoolean(input.edited, where, "marque de correction"),
  };
}

function sanitizeTranslation(value: unknown, where: string): RegionTranslation {
  const input = asObject(value, where, "traduction");
  // L'historique n'a pas de plafond côté atelier : on garde les dernières propositions.
  const history = asArray(input.history ?? [], where, "historique des traductions", 10_000)
    .slice(-PAGE_LIMITS.history)
    .map((entry) => {
      const item = asObject(entry, where, "proposition de traduction");
      return {
        text: asText(item.text, PAGE_LIMITS.text, where, "proposition de traduction"),
        engine: asLabel(item.engine, where, "moteur de traduction"),
        at: Math.round(asNumber(item.at, 0, Number.MAX_SAFE_INTEGER, where, "date de la proposition")),
      };
    });

  const translation: RegionTranslation = {
    text: asText(input.text, PAGE_LIMITS.text, where, "traduction"),
    status: asChoice(input.status, TRANSLATION_STATUSES, where, "état de la traduction"),
    history,
  };
  if (input.engine !== undefined && input.engine !== null) {
    translation.engine = asLabel(input.engine, where, "moteur de traduction");
  }
  return translation;
}

function sanitizeStroke(value: unknown, size: PageSize, where: string): BrushStroke {
  const input = asObject(value, where, "trait de pinceau");
  const points = asArray(input.points, where, "trait de pinceau", PAGE_LIMITS.strokePoints);
  if (points.length === 0) fail(where, "trait de pinceau vide");
  return {
    points: points.map((point) => asPoint(point, size, where, "point du trait")),
    width: asNumber(input.width, 1, 500, where, "largeur du trait"),
    color: asColor(input.color, where, "couleur du trait"),
  };
}

function sanitizeMask(value: unknown, size: PageSize, where: string): RegionMask {
  const input = asObject(value, where, "masque");
  return {
    kind: asChoice(input.kind, ["fill", "none", "inpaint"] as const, where, "type de masque"),
    shape: asChoice(input.shape, MASK_SHAPES, where, "forme du masque"),
    color: asColor(input.color, where, "couleur du masque"),
    grow: asNumber(input.grow, -200, 200, where, "marge du masque"),
    strokes: asArray(input.strokes ?? [], where, "traits de pinceau", PAGE_LIMITS.strokes).map((stroke) =>
      sanitizeStroke(stroke, size, where)
    ),
  };
}

/**
 * Boîte du texte traduit. Elle est libre : on la laisse dépasser de la page
 * (un texte posé à cheval sur le bord), mais pas s'en éloigner de plus d'une
 * page ni grandir sans limite.
 */
function sanitizeBox(value: unknown, size: PageSize, where: string): TextBox {
  const input = asObject(value, where, "boîte du texte");
  const rotation = asNumber(input.rotation ?? 0, -36_000, 36_000, where, "rotation");
  return {
    x: asNumber(input.x, -size.width, 2 * size.width, where, "position du texte"),
    y: asNumber(input.y, -size.height, 2 * size.height, where, "position du texte"),
    width: asNumber(input.width, 1, 2 * size.width, where, "largeur du texte"),
    height: asNumber(input.height, 1, 2 * size.height, where, "hauteur du texte"),
    // Ramenée entre -180 et 180 degrés : dix tours ne disent rien de plus qu'un seul.
    rotation: Math.round((((rotation + 180) % 360 + 360) % 360 - 180) * 100) / 100,
  };
}

const AI_ACTIONS: AiAction[] = ["reading", "translation", "page"];
const AI_SENT_KINDS: AiSentKind[] = ["crop", "text", "page"];

/** Traces des appels à une IA faits pour une zone : on garde les dernières. */
function sanitizeAiTraces(value: unknown, where: string): AiTrace[] {
  return asArray(value, where, "traces d'IA", 10_000)
    .slice(-PAGE_LIMITS.aiTraces)
    .map((entry) => {
      const input = asObject(entry, where, "trace d'IA");
      const trace: AiTrace = {
        action: asChoice(input.action, AI_ACTIONS, where, "action d'IA"),
        provider: asLabel(input.provider, where, "fournisseur d'IA"),
        model: asLabel(input.model, where, "modèle d'IA"),
        at: Math.round(asNumber(input.at, 0, Number.MAX_SAFE_INTEGER, where, "date de l'appel")),
        sent: asChoice(input.sent, AI_SENT_KINDS, where, "contenu envoyé"),
      };
      if (input.cached === true) trace.cached = true;
      return trace;
    });
}

function sanitizeRegion(value: unknown, size: PageSize, where: string): ScanRegion {
  const input = asObject(value, where, "zone");
  if (!isId(input.id)) fail(where, "identifiant de zone invalide");

  const outline = asArray(input.outline, where, "contour", PAGE_LIMITS.outlinePoints);
  if (outline.length < 3) fail(where, "le contour demande au moins trois points");

  const text = asObject(input.text, where, "bloc de texte");
  const ai = input.ai === undefined || input.ai === null ? [] : sanitizeAiTraces(input.ai, where);
  return {
    id: input.id,
    kind: asChoice<RegionKind>(input.kind, REGION_KINDS, where, "type de zone"),
    outline: outline.map((point) => asPoint(point, size, where, "point du contour")),
    direction: asChoice(input.direction, ["horizontal", "vertical"] as const, where, "sens d'écriture"),
    reading: sanitizeReading(input.reading, where),
    translation: sanitizeTranslation(input.translation, where),
    mask: sanitizeMask(input.mask, size, where),
    text: {
      box: sanitizeBox(text.box, size, where),
      style: text.style === null || text.style === undefined ? null : sanitizeTextStyle(text.style, where, "partial"),
      autoFit: asBoolean(text.autoFit, where, "ajustement automatique"),
      ...(text.maxSize === undefined || text.maxSize === null ? {} : { maxSize: asNumber(text.maxSize, 4, 600, where, "taille maximale du texte") }),
    },
    ...(ai.length > 0 ? { ai } : {}),
  };
}

/**
 * Zones d'une page, prêtes à être écrites. Lève une erreur en français, qui
 * nomme la zone fautive par son rang, dès qu'une zone est mal formée.
 */
export function sanitizeRegions(value: unknown, size: PageSize): ScanRegion[] {
  if (!Array.isArray(value)) throw new Error("Zones de la page mal formées.");
  if (value.length > PAGE_LIMITS.regions) {
    throw new Error(`Trop de zones sur cette page (${PAGE_LIMITS.regions} au plus).`);
  }
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const where = `Zone ${index + 1}`;
    const region = sanitizeRegion(entry, size, where);
    if (seen.has(region.id)) fail(where, "identifiant déjà porté par une autre zone");
    seen.add(region.id);
    return region;
  });
}
