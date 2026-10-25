/**
 * Opérations de l'assistant de l'éditeur : la liste fermée des changements
 * que Codex peut demander sur un projet, leur lecture rigoureuse et leur
 * application.
 *
 * Codex répond par des objets JSON ; chacun est relu ici champ par champ
 * (`readEditorOp`) : type connu, identifiants bien formés, valeurs dans leurs
 * bornes. L'application (`applyEditorOps`) vérifie ensuite chaque opération
 * contre le projet tel qu'il est : élément introuvable, type d'élément qui ne
 * s'y prête pas, piste verrouillée, chevauchement… Une opération refusée est
 * écartée entière, avec sa raison, jamais appliquée à moitié ; les autres
 * s'appliquent dans l'ordre, chacune sur le résultat de la précédente.
 *
 * Les temps sont en secondes (ce que lit Codex), convertis en images à la
 * cadence du projet. Les modifications passent par les fonctions du moteur
 * (`edit.ts`, `key-edit.ts`, `illustrate.ts`, `mix.ts`) : l'assistant fait
 * exactement ce que ferait un geste de l'éditeur.
 *
 * Fonctions pures, testées sous Node.
 */

import {
  addItem,
  canMoveItem,
  createTextItem,
  findItem,
  moveItem,
  pruneTracks,
  removeItem,
  setVideoSpeed,
  splitItem,
  TEXT_PRESETS,
  trimItem,
  updateItem,
  updateTrack,
} from "./edit";
import { placeAt, type Placement } from "./key-edit";
import { placeWithGroup } from "./illustrate";
import { decibelsToDuck, DUCK_DB_MAX, DUCK_DB_MIN, setTrackDuck } from "./mix";
import { getPreset } from "./motion/registry";
import { isKnownTransition, listCameraMoves } from "./motion/scenes";
import { MAX_SPEED, MIN_SPEED } from "./timeline";
import { CODE_FONT, FONTS, isCatalogFamily, nearestCatalogWeight } from "../lib/font-catalog";
import type { Anim, ClipItem, ClipProject, TextItem, TextStyle, Track, VisualItem } from "./types";

// ─── Bornes ──────────────────────────────────────────────────────

/** Opérations lues par réponse au plus : au-delà, la demande est à découper. */
export const MAX_EDITOR_OPS = 40;
/** Éléments visés par une même opération (« tous les sous-titres »). */
export const MAX_OP_TARGETS = 60;
/** Trente minutes : la même borne que le contrôle des projets à l'enregistrement. */
const MAX_SECONDS = 30 * 60;
const MAX_TEXT = 2000;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_COLOR = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+|1\.0+)\s*)?\)$/i;

export const EDITOR_OP_NAMES = [
  "set_text",
  "style_text",
  "set_frame",
  "move",
  "trim",
  "split",
  "set_animation",
  "set_transition",
  "delete",
  "add_text",
  "set_audio",
  "set_track",
  "set_media",
  "set_shape",
  "set_background",
] as const;

export type EditorOpName = (typeof EDITOR_OP_NAMES)[number];

/**
 * Retouche de style d'un texte. `null` retire le contour, l'ombre ou le fond ;
 * un objet les pose, ses champs absents reprenant ceux du texte.
 */
export type TextStylePatch = Partial<Pick<TextStyle, "font" | "weight" | "size" | "color" | "align" | "uppercase" | "lineHeight" | "letterSpacing">> & {
  stroke?: Partial<NonNullable<TextStyle["stroke"]>> | null;
  shadow?: Partial<NonNullable<TextStyle["shadow"]>> | null;
  background?: Partial<NonNullable<TextStyle["background"]>> | null;
};

interface OpBase {
  /** Numéro (1, 2…) du point compris de la demande que l'opération traite. */
  point?: number;
  /** Pourquoi, en quelques mots, pour la conversation. */
  why?: string;
}

/** Cadre relatif au canevas : x et y désignent le centre (0 à 1). */
type FrameFields = Placement;

export type EditorOp = OpBase &
  (
    | { op: "set_text"; id: string; text: string }
    | { op: "style_text"; ids: string[]; style: TextStylePatch; highlight?: string }
    | ({ op: "set_frame"; ids: string[] } & FrameFields)
    | { op: "move"; id: string; start: number; trackId?: string }
    | { op: "trim"; id: string; start?: number; end?: number }
    | { op: "split"; id: string; at: number }
    | { op: "set_animation"; ids: string[]; phase: "in" | "out" | "emphasis"; kind: string; seconds?: number }
    | { op: "set_transition"; ids: string[]; kind: string; seconds?: number }
    | { op: "delete"; ids: string[] }
    | ({ op: "add_text"; text: string; start: number; duration: number; preset?: string; style?: TextStylePatch } & FrameFields)
    | { op: "set_audio"; ids: string[]; volume?: number; muted?: boolean; fadeIn?: number; fadeOut?: number }
    | { op: "set_track"; trackId: string; hidden?: boolean; muted?: boolean; volume?: number; duckDb?: number | null }
    | { op: "set_media"; ids: string[]; fit?: "cover" | "contain"; motion?: string; speed?: number }
    | { op: "set_shape"; ids: string[]; fill?: string; radius?: number }
    | { op: "set_background"; color: string }
  );

/**
 * Opération que la lecture a refusée, gardée à sa place dans la liste : les
 * numéros des changements restent ceux de la réponse de Codex.
 */
export interface InvalidEditorOp {
  op: "invalid";
  /** Nom d'opération demandé, s'il était lisible. */
  name?: string;
  reason: string;
  point?: number;
}

export type EditorOpEntry = EditorOp | InvalidEditorOp;

/** Un changement appliqué, ou écarté avec sa raison. */
export interface EditorChange {
  /** Rang de l'opération dans la réponse (0 pour la première). */
  index: number;
  op: string;
  summary: string;
  /** Élément concerné, pour le sélectionner depuis la conversation. */
  itemId?: string;
  /** Instant où amener la tête de lecture, en secondes. */
  seconds?: number;
  point?: number;
  /** Changement écarté : pourquoi. */
  reason?: string;
}

export interface EditorApplyResult {
  project: ClipProject;
  applied: EditorChange[];
  skipped: EditorChange[];
}

// ─── Lecture ─────────────────────────────────────────────────────

class OpError extends Error {}

function fail(reason: string): never {
  throw new OpError(reason);
}

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function has(raw: Raw, key: string) {
  return raw[key] !== undefined && raw[key] !== null;
}

function readNumber(raw: Raw, key: string, min: number, max: number, label: string): number | undefined {
  if (!has(raw, key)) return undefined;
  const value = raw[key];
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${label} n’est pas un nombre.`);
  if ((value as number) < min || (value as number) > max) fail(`${label} hors bornes (${formatNumber(min, 3)} à ${formatNumber(max, 3)}).`);
  return value as number;
}

function requireNumber(raw: Raw, key: string, min: number, max: number, label: string): number {
  const value = readNumber(raw, key, min, max, label);
  if (value === undefined) fail(`${label} manque.`);
  return value as number;
}

function readBoolean(raw: Raw, key: string, label: string): boolean | undefined {
  if (!has(raw, key)) return undefined;
  if (typeof raw[key] !== "boolean") fail(`${label} doit valoir true ou false.`);
  return raw[key] as boolean;
}

function readColor(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 40 || !(HEX_COLOR.test(value.trim()) || RGB_COLOR.test(value.trim()))) {
    fail(`${label} : couleur illisible (attendu #rrggbb ou rgba(…)).`);
  }
  return (value as string).trim();
}

/** Texte écrit par l'assistant : espaces réunies aux bords, tiret cadratin remplacé, longueur bornée. */
function readText(value: unknown, label: string): string {
  if (typeof value !== "string") fail(`${label} manque.`);
  const text = (value as string).replace(/\r\n?/g, "\n").replace(/\s*—\s*/g, " – ").trim();
  if (!text) fail(`${label} est vide.`);
  if (text.length > MAX_TEXT) fail(`${label} dépasse ${MAX_TEXT} caractères.`);
  return text;
}

function readId(value: unknown, label = "Identifiant"): string {
  if (typeof value !== "string" || !ID.test(value)) fail(`${label} illisible.`);
  return value as string;
}

/** `id` ou `ids` : la liste des éléments visés, sans doublon. */
function readTargets(raw: Raw, single: boolean): string[] {
  const list = Array.isArray(raw.ids) ? raw.ids : has(raw, "id") ? [raw.id] : [];
  if (list.length === 0) fail("Aucun élément visé (id).");
  if (single && list.length > 1) fail("Cette opération vise un seul élément à la fois.");
  if (list.length > MAX_OP_TARGETS) fail(`${MAX_OP_TARGETS} éléments au plus par opération.`);
  return [...new Set(list.map((value) => readId(value)))];
}

function readFrame(raw: Raw): Placement {
  const frame: Placement = {};
  const x = readNumber(raw, "x", -1, 2, "x");
  const y = readNumber(raw, "y", -1, 2, "y");
  const width = readNumber(raw, "width", 0.01, 4, "La largeur");
  const height = readNumber(raw, "height", 0.01, 4, "La hauteur");
  const rotation = readNumber(raw, "rotation", -360, 360, "La rotation");
  const opacity = readNumber(raw, "opacity", 0, 1, "L’opacité");
  if (x !== undefined) frame.x = x;
  if (y !== undefined) frame.y = y;
  if (width !== undefined) frame.width = width;
  if (height !== undefined) frame.height = height;
  if (rotation !== undefined) frame.rotation = rotation;
  if (opacity !== undefined) frame.opacity = opacity;
  return frame;
}

function readStyle(value: unknown): TextStylePatch {
  if (!isObject(value)) fail("Le style doit être un objet.");
  const raw = value as Raw;
  const style: TextStylePatch = {};
  if (has(raw, "font")) {
    if (typeof raw.font !== "string" || raw.font.length > 60 || !/^[\p{L}\p{N} '-]+$/u.test(raw.font)) fail("Police illisible.");
    style.font = (raw.font as string).trim();
  }
  const weight = readNumber(raw, "weight", 100, 900, "La graisse");
  if (weight !== undefined) style.weight = Math.round(weight / 100) * 100;
  const size = readNumber(raw, "size", 0.01, 0.3, "La taille");
  if (size !== undefined) style.size = size;
  if (has(raw, "color")) style.color = readColor(raw.color, "Couleur du texte");
  if (has(raw, "align")) {
    if (raw.align !== "left" && raw.align !== "center" && raw.align !== "right") fail("Alignement : left, center ou right.");
    style.align = raw.align as TextStyle["align"];
  }
  const uppercase = readBoolean(raw, "uppercase", "uppercase");
  if (uppercase !== undefined) style.uppercase = uppercase;
  const lineHeight = readNumber(raw, "lineHeight", 0.6, 3, "L’interligne");
  if (lineHeight !== undefined) style.lineHeight = lineHeight;
  const letterSpacing = readNumber(raw, "letterSpacing", -0.2, 0.5, "L’espacement des lettres");
  if (letterSpacing !== undefined) style.letterSpacing = letterSpacing;

  // `null` retire, un objet pose ; ses champs absents reprennent ceux du texte au moment d'appliquer.
  if (raw.stroke === null) style.stroke = null;
  else if (raw.stroke !== undefined) {
    if (!isObject(raw.stroke)) fail("Contour : objet {color, width} ou null.");
    const stroke = raw.stroke as Raw;
    const width = readNumber(stroke, "width", 0, 0.4, "L’épaisseur du contour");
    style.stroke = { ...(has(stroke, "color") ? { color: readColor(stroke.color, "Couleur du contour") } : {}), ...(width !== undefined ? { width } : {}) };
  }
  if (raw.shadow === null) style.shadow = null;
  else if (raw.shadow !== undefined) {
    if (!isObject(raw.shadow)) fail("Ombre : objet {color, blur, offsetY} ou null.");
    const shadow = raw.shadow as Raw;
    const blur = readNumber(shadow, "blur", 0, 2, "Le flou de l’ombre");
    const offsetY = readNumber(shadow, "offsetY", -0.5, 0.5, "Le décalage de l’ombre");
    style.shadow = {
      ...(has(shadow, "color") ? { color: readColor(shadow.color, "Couleur de l’ombre") } : {}),
      ...(blur !== undefined ? { blur } : {}),
      ...(offsetY !== undefined ? { offsetY } : {}),
    };
  }
  if (raw.background === null) style.background = null;
  else if (raw.background !== undefined) {
    if (!isObject(raw.background)) fail("Fond du texte : objet {color, padding, radius} ou null.");
    const background = raw.background as Raw;
    const padding = readNumber(background, "padding", 0, 2, "La marge du fond");
    const radius = readNumber(background, "radius", 0, 1, "L’arrondi du fond");
    style.background = {
      ...(has(background, "color") ? { color: readColor(background.color, "Couleur du fond") } : {}),
      ...(padding !== undefined ? { padding } : {}),
      ...(radius !== undefined ? { radius } : {}),
    };
  }
  if (Object.keys(style).length === 0) fail("Aucun réglage de style lisible.");
  return style;
}

function readSeconds(raw: Raw, key: string, label: string, min = 0): number | undefined {
  return readNumber(raw, key, min, MAX_SECONDS, label);
}

/**
 * Lit une opération telle que Codex l'a écrite. Rend l'opération normalisée
 * (même forme que celle acceptée : la relire donne la même), ou la raison du
 * refus.
 */
export function readEditorOp(value: unknown): { ok: true; op: EditorOp } | { ok: false; name?: string; reason: string; point?: number } {
  if (!isObject(value)) return { ok: false, reason: "Opération illisible : ce n’est pas un objet." };
  const raw = value;
  const name = typeof raw.op === "string" ? raw.op.slice(0, 40) : undefined;
  const point = typeof raw.point === "number" && Number.isInteger(raw.point) && raw.point >= 1 && raw.point <= 50 ? raw.point : undefined;
  if (!name || !(EDITOR_OP_NAMES as readonly string[]).includes(name)) {
    return { ok: false, name, point, reason: name ? `Opération inconnue « ${name} ».` : "Opération sans nom (op)." };
  }
  try {
    const base: OpBase = {
      ...(point !== undefined ? { point } : {}),
      ...(typeof raw.why === "string" && raw.why.trim() ? { why: raw.why.replace(/\s*—\s*/g, " – ").trim().slice(0, 200) } : {}),
    };
    const op = readBody(name as EditorOpName, raw);
    return { ok: true, op: { ...base, ...op } as EditorOp };
  } catch (error) {
    if (error instanceof OpError) return { ok: false, name, point, reason: error.message };
    throw error;
  }
}

function readBody(name: EditorOpName, raw: Raw): EditorOp {
  switch (name) {
    case "set_text":
      return { op: name, id: readTargets(raw, true)[0], text: readText(raw.text, "Le texte") };
    case "style_text": {
      const style = has(raw, "style") ? readStyle(raw.style) : undefined;
      const highlight = has(raw, "highlight") ? readColor(raw.highlight, "Couleur du mot prononcé") : undefined;
      if (!style && !highlight) fail("Aucun réglage de style (style ou highlight).");
      return { op: name, ids: readTargets(raw, false), style: style ?? {}, ...(highlight ? { highlight } : {}) };
    }
    case "set_frame": {
      const frame = readFrame(raw);
      if (Object.keys(frame).length === 0) fail("Aucune valeur de cadre (x, y, width, height, rotation, opacity).");
      return { op: name, ids: readTargets(raw, false), ...frame };
    }
    case "move": {
      const trackId = has(raw, "trackId") ? readId(raw.trackId, "Piste") : undefined;
      return { op: name, id: readTargets(raw, true)[0], start: requireNumber(raw, "start", 0, MAX_SECONDS, "Le début"), ...(trackId ? { trackId } : {}) };
    }
    case "trim": {
      const start = readSeconds(raw, "start", "Le début");
      const end = readSeconds(raw, "end", "La fin");
      if (start === undefined && end === undefined) fail("Ni début ni fin à rogner.");
      if (start !== undefined && end !== undefined && end <= start) fail("La fin doit venir après le début.");
      return { op: name, id: readTargets(raw, true)[0], ...(start !== undefined ? { start } : {}), ...(end !== undefined ? { end } : {}) };
    }
    case "split":
      return { op: name, id: readTargets(raw, true)[0], at: requireNumber(raw, "at", 0, MAX_SECONDS, "L’instant de la coupe") };
    case "set_animation": {
      if (raw.phase !== "in" && raw.phase !== "out" && raw.phase !== "emphasis") fail("Phase : in, out ou emphasis.");
      if (typeof raw.kind !== "string" || !/^[a-z0-9-]{1,60}$/.test(raw.kind)) fail("Animation illisible (kind).");
      const seconds = readNumber(raw, "seconds", 0.05, 5, "La durée de l’animation");
      return { op: name, ids: readTargets(raw, false), phase: raw.phase as "in" | "out" | "emphasis", kind: raw.kind as string, ...(seconds !== undefined ? { seconds } : {}) };
    }
    case "set_transition": {
      if (typeof raw.kind !== "string" || !/^[a-z0-9-]{1,60}$/.test(raw.kind)) fail("Transition illisible (kind).");
      const seconds = readNumber(raw, "seconds", 0.1, 3, "La durée de la transition");
      return { op: name, ids: readTargets(raw, false), kind: raw.kind as string, ...(seconds !== undefined ? { seconds } : {}) };
    }
    case "delete":
      return { op: name, ids: readTargets(raw, false) };
    case "add_text": {
      const preset = has(raw, "preset") ? String(raw.preset) : undefined;
      if (preset !== undefined && !TEXT_PRESETS.some((entry) => entry.id === preset)) fail(`Style de texte inconnu « ${preset.slice(0, 30)} ».`);
      const style = has(raw, "style") ? readStyle(raw.style) : undefined;
      return {
        op: name,
        text: readText(raw.text, "Le texte"),
        start: requireNumber(raw, "start", 0, MAX_SECONDS, "Le début"),
        duration: requireNumber(raw, "duration", 0.1, 600, "La durée"),
        ...(preset ? { preset } : {}),
        ...(style ? { style } : {}),
        ...readFrame(raw),
      };
    }
    case "set_audio": {
      const volume = readNumber(raw, "volume", 0, 2, "Le volume");
      const muted = readBoolean(raw, "muted", "muted");
      const fadeIn = readNumber(raw, "fadeIn", 0, 10, "Le fondu d’entrée");
      const fadeOut = readNumber(raw, "fadeOut", 0, 10, "Le fondu de sortie");
      if (volume === undefined && muted === undefined && fadeIn === undefined && fadeOut === undefined) fail("Aucun réglage du son (volume, muted, fadeIn, fadeOut).");
      return {
        op: name,
        ids: readTargets(raw, false),
        ...(volume !== undefined ? { volume } : {}),
        ...(muted !== undefined ? { muted } : {}),
        ...(fadeIn !== undefined ? { fadeIn } : {}),
        ...(fadeOut !== undefined ? { fadeOut } : {}),
      };
    }
    case "set_track": {
      const trackId = readId(raw.trackId, "Piste");
      const hidden = readBoolean(raw, "hidden", "hidden");
      const muted = readBoolean(raw, "muted", "muted");
      const volume = readNumber(raw, "volume", 0, 2, "Le volume");
      let duckDb: number | null | undefined;
      if (raw.duckDb === null) duckDb = null;
      else duckDb = readNumber(raw, "duckDb", DUCK_DB_MIN, DUCK_DB_MAX, "Le creux sous la voix");
      if (hidden === undefined && muted === undefined && volume === undefined && duckDb === undefined) fail("Aucun réglage de piste (hidden, muted, volume, duckDb).");
      return {
        op: name,
        trackId,
        ...(hidden !== undefined ? { hidden } : {}),
        ...(muted !== undefined ? { muted } : {}),
        ...(volume !== undefined ? { volume } : {}),
        ...(duckDb !== undefined ? { duckDb } : {}),
      };
    }
    case "set_media": {
      if (has(raw, "fit") && raw.fit !== "cover" && raw.fit !== "contain") fail("Cadrage : cover ou contain.");
      if (has(raw, "motion") && (typeof raw.motion !== "string" || !listCameraMoves().some((move) => move.id === raw.motion))) fail(`Mouvement de caméra inconnu « ${String(raw.motion).slice(0, 30)} ».`);
      const speed = readNumber(raw, "speed", MIN_SPEED, MAX_SPEED, "La vitesse");
      if (!has(raw, "fit") && !has(raw, "motion") && speed === undefined) fail("Aucun réglage du média (fit, motion, speed).");
      return {
        op: name,
        ids: readTargets(raw, false),
        ...(has(raw, "fit") ? { fit: raw.fit as "cover" | "contain" } : {}),
        ...(has(raw, "motion") ? { motion: raw.motion as string } : {}),
        ...(speed !== undefined ? { speed } : {}),
      };
    }
    case "set_shape": {
      const fill = has(raw, "fill") ? readColor(raw.fill, "Couleur de la forme") : undefined;
      const radius = readNumber(raw, "radius", 0, 1, "L’arrondi");
      if (fill === undefined && radius === undefined) fail("Aucun réglage de forme (fill, radius).");
      return { op: name, ids: readTargets(raw, false), ...(fill ? { fill } : {}), ...(radius !== undefined ? { radius } : {}) };
    }
    case "set_background": {
      const color = readColor(raw.color, "Couleur du fond");
      if (!HEX_COLOR.test(color)) fail("Le fond du projet prend une couleur #rrggbb.");
      return { op: name, color };
    }
  }
}

/** Lit la liste d'opérations d'une réponse : chacune lue, refusée à sa place, bornée en nombre. */
export function readEditorOps(value: unknown): EditorOpEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: EditorOpEntry[] = value.slice(0, MAX_EDITOR_OPS).map((raw) => {
    const read = readEditorOp(raw);
    return read.ok ? read.op : { op: "invalid", reason: read.reason, ...(read.name ? { name: read.name } : {}), ...(read.point ? { point: read.point } : {}) };
  });
  if (value.length > MAX_EDITOR_OPS) {
    entries.push({ op: "invalid", reason: `${value.length - MAX_EDITOR_OPS} opérations en trop (${MAX_EDITOR_OPS} au plus par réponse) : redemandez la suite.` });
  }
  return entries;
}

// ─── Application ─────────────────────────────────────────────────

interface Outcome {
  project: ClipProject;
  summary: string;
  itemId?: string;
  seconds?: number;
}

/**
 * Applique les opérations dans l'ordre, chacune sur le résultat de la
 * précédente. Le projet rendu porte tous les changements retenus : un seul
 * `commit` dans l'éditeur, donc une seule étape d'annulation.
 */
export function applyEditorOps(project: ClipProject, entries: readonly unknown[]): EditorApplyResult {
  let current = project;
  const applied: EditorChange[] = [];
  const skipped: EditorChange[] = [];
  let deleted = false;

  entries.slice(0, MAX_EDITOR_OPS + 1).forEach((entry, index) => {
    if (isObject(entry) && entry.op === "invalid") {
      const invalid = entry as unknown as InvalidEditorOp;
      skipped.push({ index, op: invalid.name ?? "?", summary: describeName(invalid.name), reason: String(invalid.reason ?? "Opération illisible.").slice(0, 300), ...(invalid.point ? { point: invalid.point } : {}) });
      return;
    }
    // Relue ici aussi : une opération rangée dans l'historique repasse les mêmes contrôles.
    const read = readEditorOp(entry);
    if (!read.ok) {
      skipped.push({ index, op: read.name ?? "?", summary: describeName(read.name), reason: read.reason, ...(read.point ? { point: read.point } : {}) });
      return;
    }
    const op = read.op;
    const point = op.point !== undefined ? { point: op.point } : {};
    try {
      const outcome = applyOne(current, op);
      if (!changed(current, outcome.project, op)) {
        skipped.push({ index, op: op.op, summary: outcome.summary, reason: "Rien à changer : c’est déjà le cas.", ...point, ...target(outcome) });
        return;
      }
      current = outcome.project;
      if (op.op === "delete") deleted = true;
      applied.push({ index, op: op.op, summary: outcome.summary, ...point, ...target(outcome) });
    } catch (error) {
      if (!(error instanceof OpError)) throw error;
      skipped.push({ index, op: op.op, summary: plannedSummary(project, op), reason: error.message, ...point });
    }
  });

  if (deleted) current = pruneTracks(current);
  return { project: current, applied, skipped };
}

function target(outcome: Outcome) {
  return {
    ...(outcome.itemId ? { itemId: outcome.itemId } : {}),
    ...(outcome.seconds !== undefined ? { seconds: Math.round(outcome.seconds * 100) / 100 } : {}),
  };
}

/** L'opération a-t-elle changé quelque chose ? Comparé sur ce qu'elle touche, pas sur tout le projet. */
function changed(before: ClipProject, after: ClipProject, op: EditorOp): boolean {
  if (after === before) return false;
  if (op.op === "set_background") return before.background !== after.background;
  if (op.op === "add_text" || op.op === "delete" || op.op === "split") return true;
  if (op.op === "set_track") return JSON.stringify(before.tracks.find((track) => track.id === op.trackId)) !== JSON.stringify(after.tracks.find((track) => track.id === op.trackId));
  const ids = "ids" in op ? op.ids : [op.id];
  return ids.some((id) => {
    const a = findItem(before, id);
    const b = findItem(after, id);
    return JSON.stringify(a?.item) !== JSON.stringify(b?.item) || a?.track.id !== b?.track.id;
  });
}

const frames = (seconds: number, fps: number) => Math.round(seconds * fps);
const secondsOf = (frame: number, fps: number) => frame / fps;

/** Élément visé, sur une piste qui accepte d'être modifiée. */
function targetItem(project: ClipProject, id: string): { item: ClipItem; track: Track } {
  const found = findItem(project, id);
  if (!found) fail(`Élément introuvable (${id}) : il a peut-être été supprimé depuis.`);
  if (found!.track.locked) fail(`La piste « ${found!.track.name} » est verrouillée.`);
  return { item: found!.item, track: found!.track };
}

function targetsOf<T extends ClipItem>(project: ClipProject, ids: string[], accept: (item: ClipItem) => item is T, what: string): T[] {
  return ids.map((id) => {
    const { item } = targetItem(project, id);
    if (!accept(item)) fail(`${capitalize(itemName(item))} n’est pas ${what}.`);
    return item as T;
  });
}

const isText = (item: ClipItem): item is TextItem => item.type === "text";
const isVisualItem = (item: ClipItem): item is VisualItem => item.type !== "audio";

/** Instant où l'élément se voit : après son entrée, pour qu'il soit lisible quand on y amène la tête de lecture. */
function lookAt(item: ClipItem, fps: number): number {
  const settle = item.type === "audio" ? 0 : Math.min(item.animIn.kind === "none" ? 0 : item.animIn.frames, Math.floor(item.duration / 2));
  return secondsOf(item.start + settle, fps);
}

function applyOne(project: ClipProject, op: EditorOp): Outcome {
  const fps = project.fps;
  switch (op.op) {
    case "set_text": {
      const [item] = targetsOf(project, [op.id], isText, "un texte");
      if (item.karaoke) fail("Des sous-titres calés sur une voix ne se réécrivent pas : leurs mots suivent la voix.");
      return {
        project: updateItem(project, item.id, { text: op.text } as Partial<ClipItem>),
        summary: `Texte « ${clip(item.text, 30)} » réécrit : « ${clip(op.text, 60)} »`,
        itemId: item.id,
        seconds: lookAt(item, fps),
      };
    }
    case "style_text": {
      const items = targetsOf(project, op.ids, isText, "un texte");
      if (op.highlight && items.some((item) => !item.karaoke)) fail("La couleur du mot prononcé ne vaut que pour des sous-titres animés.");
      if (op.style.font && !fontAvailable(project, op.style.font)) {
        fail(`Police « ${op.style.font} » indisponible : ${FONTS.map((font) => font.family).join(", ")}, ou une police déjà utilisée dans le projet.`);
      }
      let next = project;
      for (const item of items) next = updateItem(next, item.id, (current) => styled(current as TextItem, op.style, op.highlight) as ClipItem);
      const first = items[0];
      return {
        project: next,
        summary: `${capitalize(itemsName(items))} : ${styleSummary(first, op.style, op.highlight)}`,
        itemId: first.id,
        seconds: lookAt(first, fps),
      };
    }
    case "set_frame": {
      const items = targetsOf(project, op.ids, isVisualItem, "un élément visuel");
      const placement: Placement = pickFrame(op);
      let next = project;
      // Un seul élément : ses pièces sœurs (carte et son texte) le suivent, comme à la souris.
      if (items.length === 1) next = placeWithGroup(next, items[0].id, items[0].start, placement, { animate: false, fps });
      else for (const item of items) next = updateItem(next, item.id, placeAt(item, item.start, placement, { animate: false, fps }) as Partial<ClipItem>);
      return {
        project: next,
        summary: `${capitalize(itemsName(items))} : ${frameSummary(items[0], placement)}`,
        itemId: items[0].id,
        seconds: lookAt(items[0], fps),
      };
    }
    case "move": {
      const { item, track } = targetItem(project, op.id);
      const trackId = op.trackId ?? track.id;
      const destination = project.tracks.find((entry) => entry.id === trackId);
      if (!destination) fail(`Piste introuvable (${trackId}).`);
      if (destination!.locked) fail(`La piste « ${destination!.name} » est verrouillée.`);
      if (destination!.kind !== (item.type === "audio" ? "audio" : "visual")) fail(`La piste « ${destination!.name} » n’accueille pas ce type d’élément.`);
      const start = frames(op.start, fps);
      if (!canMoveItem(project, item.id, start, trackId)) fail(`À ${formatSeconds(op.start)}, ${itemName(item)} chevaucherait un autre élément de la piste « ${destination!.name} ».`);
      return {
        project: moveItem(project, item.id, start, trackId),
        summary: `${capitalize(itemName(item))} déplacé de ${formatSeconds(secondsOf(item.start, fps))} à ${formatSeconds(secondsOf(start, fps))}${trackId !== track.id ? ` sur la piste « ${destination!.name} »` : ""}`,
        itemId: item.id,
        seconds: secondsOf(start, fps),
      };
    }
    case "trim": {
      const { item } = targetItem(project, op.id);
      const end = item.start + item.duration;
      const wantedStart = op.start !== undefined ? frames(op.start, fps) : item.start;
      const wantedEnd = op.end !== undefined ? frames(op.end, fps) : end;
      if (wantedEnd - wantedStart < 1) fail("Il ne resterait rien de l’élément.");
      let next = project;
      if (op.start !== undefined) next = trimItem(next, item.id, "start", wantedStart);
      if (op.end !== undefined) next = trimItem(next, item.id, "end", wantedEnd);
      const after = findItem(next, item.id)!.item;
      const clamped = after.start !== wantedStart || after.start + after.duration !== wantedEnd;
      return {
        project: next,
        summary: `${capitalize(itemName(item))} : ${formatRange(item, fps)} → ${formatRange(after, fps)}${clamped ? " (borné par ses voisins ou par la fin du média)" : ""}`,
        itemId: item.id,
        seconds: secondsOf(after.start, fps),
      };
    }
    case "split": {
      const { item } = targetItem(project, op.id);
      const cut = frames(op.at, fps);
      if (cut <= item.start || cut >= item.start + item.duration) fail(`${formatSeconds(op.at)} n’est pas dans ${itemName(item)} (${formatRange(item, fps)}).`);
      return {
        project: splitItem(project, item.id, cut),
        summary: `${capitalize(itemName(item))} coupé en deux à ${formatSeconds(secondsOf(cut, fps))}`,
        itemId: item.id,
        seconds: secondsOf(cut, fps),
      };
    }
    case "set_animation": {
      const items = targetsOf(project, op.ids, isVisualItem, "un élément visuel");
      const preset = op.kind === "none" ? undefined : getPreset(op.kind, op.phase);
      if (op.kind !== "none" && !preset) fail(`Animation « ${op.kind} » inconnue pour ${PHASE_LABELS[op.phase]}.`);
      if (preset) {
        const wrong = items.find((item) => !presetFits(preset.target, item));
        if (wrong) fail(`L’animation « ${op.kind} » ne s’applique pas à ${itemName(wrong)} (réservée ${TARGET_LABELS[preset.target] ?? "à un autre type"}).`);
      }
      let next = project;
      for (const item of items) {
        const count = Math.max(1, Math.min(item.duration, op.seconds !== undefined ? frames(op.seconds, fps) : preset ? Math.round((preset.durationMs / 1000) * fps) : 10));
        next = updateItem(next, item.id, (current) => animated(current as VisualItem, op.phase, op.kind, count) as ClipItem);
      }
      const label = op.kind === "none" ? "aucune" : `« ${preset?.label ?? op.kind} »`;
      return {
        project: next,
        summary: `${capitalize(itemsName(items))} : ${PHASE_LABELS[op.phase]} ${label}${op.seconds !== undefined && op.kind !== "none" ? ` en ${formatSeconds(op.seconds)}` : ""}`,
        itemId: items[0].id,
        seconds: secondsOf(items[0].start, fps),
      };
    }
    case "set_transition": {
      const items = targetsOf(project, op.ids, isVisualItem, "un élément visuel");
      if (op.kind !== "none" && !isKnownTransition(op.kind)) fail(`Transition « ${op.kind} » inconnue.`);
      let next = project;
      for (const item of items) {
        next = updateItem(next, item.id, (current) => {
          const visual = { ...(current as VisualItem) };
          if (op.kind === "none") delete visual.transition;
          else {
            const count = op.seconds !== undefined ? frames(op.seconds, fps) : visual.transition?.frames ?? Math.round(0.4 * fps);
            visual.transition = { kind: op.kind, frames: Math.max(1, Math.min(count, visual.duration - 1 || 1)) };
          }
          return visual as ClipItem;
        });
      }
      return {
        project: next,
        summary: `${capitalize(itemsName(items))} : ${op.kind === "none" ? "transition retirée" : `transition « ${op.kind} »${op.seconds !== undefined ? ` en ${formatSeconds(op.seconds)}` : ""}`}`,
        itemId: items[0].id,
        seconds: secondsOf(items[0].start, fps),
      };
    }
    case "delete": {
      const items = op.ids.map((id) => targetItem(project, id).item);
      let next = project;
      for (const item of items) if (findItem(next, item.id)) next = removeItem(next, item.id);
      return {
        project: next,
        summary: `Supprimé : ${itemsName(items)}${items.length === 1 ? ` (${formatRange(items[0], fps)})` : ""}`,
        seconds: secondsOf(items[0].start, fps),
      };
    }
    case "add_text": {
      if (op.style?.font && !fontAvailable(project, op.style.font)) fail(`Police « ${op.style.font} » indisponible.`);
      const created = createTextItem(op.preset ?? "caption", frames(op.start, fps), fps, op.text);
      let item: TextItem = { ...created, duration: Math.max(1, frames(op.duration, fps)), transform: { ...created.transform, ...pickFrame(op) } };
      if (op.style) item = styled(item, op.style);
      const textTrack = project.tracks.find((track) => track.kind === "visual" && track.name === "Texte" && !track.locked);
      return {
        project: addItem(project, item, textTrack?.id),
        summary: `Texte ajouté « ${clip(op.text, 60)} » (${formatRange(item, fps)})`,
        itemId: item.id,
        seconds: lookAt(item, fps),
      };
    }
    case "set_audio": {
      const items = targetsOf(project, op.ids, (item): item is Extract<ClipItem, { type: "audio" | "video" }> => item.type === "audio" || item.type === "video", "un son ou une vidéo");
      if (op.muted !== undefined && items.some((item) => item.type === "audio")) fail("Un son se coupe par sa piste (set_track muted) ou par son volume, pas par muted.");
      let next = project;
      for (const item of items) {
        next = updateItem(next, item.id, (current) => {
          const sound = { ...current } as Extract<ClipItem, { type: "audio" | "video" }>;
          if (op.volume !== undefined) sound.volume = op.volume;
          if (op.fadeIn !== undefined) sound.fadeIn = Math.min(sound.duration, frames(op.fadeIn, fps));
          if (op.fadeOut !== undefined) sound.fadeOut = Math.min(sound.duration, frames(op.fadeOut, fps));
          if (op.muted !== undefined && sound.type === "video") {
            if (op.muted) sound.muted = true;
            else delete sound.muted;
          }
          return sound as ClipItem;
        });
      }
      const parts = [
        op.volume !== undefined ? `volume ${formatPercent(items[0].volume)} → ${formatPercent(op.volume)}` : "",
        op.muted !== undefined ? (op.muted ? "son coupé" : "son rétabli") : "",
        op.fadeIn !== undefined ? `fondu d’entrée ${formatSeconds(op.fadeIn)}` : "",
        op.fadeOut !== undefined ? `fondu de sortie ${formatSeconds(op.fadeOut)}` : "",
      ].filter(Boolean);
      return { project: next, summary: `${capitalize(itemsName(items))} : ${parts.join(", ")}`, itemId: items[0].id, seconds: secondsOf(items[0].start, fps) };
    }
    case "set_track": {
      const track = project.tracks.find((entry) => entry.id === op.trackId);
      if (!track) fail(`Piste introuvable (${op.trackId}).`);
      if (op.hidden !== undefined && track!.kind !== "visual") fail(`La piste « ${track!.name} » est une piste son : elle se coupe (muted), elle ne se masque pas.`);
      if (op.muted !== undefined && track!.kind !== "audio") fail(`La piste « ${track!.name} » est visuelle : elle se masque (hidden).`);
      if ((op.volume !== undefined || op.duckDb !== undefined) && track!.locked) fail(`La piste « ${track!.name} » est verrouillée.`);
      if ((op.volume !== undefined || op.duckDb !== undefined) && track!.kind !== "audio") fail(`La piste « ${track!.name} » n’a pas de son réglable.`);
      let next = project;
      if (op.hidden !== undefined) next = updateTrack(next, track!.id, { hidden: op.hidden });
      if (op.muted !== undefined) next = updateTrack(next, track!.id, { muted: op.muted });
      if (op.volume !== undefined) {
        for (const item of track!.items) if (item.type === "audio" || item.type === "video") next = updateItem(next, item.id, { volume: op.volume } as Partial<ClipItem>);
      }
      if (op.duckDb !== undefined) next = setTrackDuck(next, track!.id, op.duckDb === null ? undefined : decibelsToDuck(op.duckDb));
      const sound = track!.items.find((item): item is Extract<ClipItem, { type: "audio" | "video" }> => item.type === "audio" || item.type === "video");
      const parts = [
        op.hidden !== undefined ? (op.hidden ? "masquée" : "affichée") : "",
        op.muted !== undefined ? (op.muted ? "son coupé" : "son rétabli") : "",
        op.volume !== undefined ? `volume ${sound ? `${formatPercent(sound.volume)} → ` : ""}${formatPercent(op.volume)}` : "",
        op.duckDb === null ? "ne s’efface plus sous la voix" : op.duckDb !== undefined ? `s’efface de ${formatNumber(op.duckDb, 0)} dB sous la voix` : "",
      ].filter(Boolean);
      const first = track!.items[0];
      return { project: next, summary: `Piste « ${track!.name} » : ${parts.join(", ")}`, ...(first ? { itemId: first.id, seconds: secondsOf(first.start, fps) } : {}) };
    }
    case "set_media": {
      const items = targetsOf(project, op.ids, (item): item is Extract<ClipItem, { type: "image" | "video" }> => item.type === "image" || item.type === "video", "une image ou une vidéo");
      if (op.speed !== undefined && items.some((item) => item.type !== "video")) fail("Seule une vidéo change de vitesse.");
      let next = project;
      for (const item of items) {
        if (op.fit !== undefined || op.motion !== undefined) {
          next = updateItem(next, item.id, (current) => {
            const media = { ...current } as Extract<ClipItem, { type: "image" | "video" }>;
            if (op.fit !== undefined) media.fit = op.fit;
            if (op.motion !== undefined) {
              if (media.type === "video" && op.motion === "none") delete media.motion;
              else media.motion = op.motion;
            }
            return media as ClipItem;
          });
        }
        if (op.speed !== undefined) next = setVideoSpeed(next, item.id, op.speed);
      }
      const parts = [
        op.fit ? (op.fit === "cover" ? "remplit le cadre" : "entière dans le cadre") : "",
        op.motion ? (op.motion === "none" ? "caméra fixe" : `mouvement « ${op.motion} »`) : "",
        op.speed !== undefined ? `vitesse ×${formatNumber(op.speed, 2)}` : "",
      ].filter(Boolean);
      return { project: next, summary: `${capitalize(itemsName(items))} : ${parts.join(", ")}`, itemId: items[0].id, seconds: lookAt(items[0], fps) };
    }
    case "set_shape": {
      const items = targetsOf(project, op.ids, (item): item is Extract<ClipItem, { type: "shape" }> => item.type === "shape", "une forme");
      let next = project;
      for (const item of items) {
        next = updateItem(next, item.id, { ...(op.fill ? { fill: op.fill } : {}), ...(op.radius !== undefined ? { radius: op.radius } : {}) } as Partial<ClipItem>);
      }
      const parts = [op.fill ? `couleur ${op.fill}` : "", op.radius !== undefined ? `arrondi ${formatNumber(op.radius, 2)}` : ""].filter(Boolean);
      return { project: next, summary: `${capitalize(itemsName(items))} : ${parts.join(", ")}`, itemId: items[0].id, seconds: lookAt(items[0], fps) };
    }
    case "set_background":
      return {
        project: { ...project, background: op.color, updatedAt: Date.now() },
        summary: `Fond du clip : ${project.background} → ${op.color}`,
      };
  }
}

// ─── Réglages ────────────────────────────────────────────────────

function pickFrame(fields: Placement): Placement {
  const placement: Placement = {};
  for (const key of ["x", "y", "width", "height", "rotation", "opacity"] as const) if (fields[key] !== undefined) placement[key] = fields[key];
  return placement;
}

/** Police connue : du catalogue, de code, ou déjà portée par un texte du projet (police de la marque). */
function fontAvailable(project: ClipProject, font: string): boolean {
  if (isCatalogFamily(font) || font === CODE_FONT.family) return true;
  return project.tracks.some((track) => track.items.some((item) => item.type === "text" && item.style.font === font));
}

/** Le style retouché : les champs d'un contour, d'une ombre ou d'un fond absents reprennent ceux du texte. */
function styled(item: TextItem, patch: TextStylePatch, highlight?: string): TextItem {
  const style: TextStyle = { ...item.style };
  for (const key of ["font", "weight", "size", "color", "align", "uppercase", "lineHeight", "letterSpacing"] as const) {
    if (patch[key] !== undefined) (style as unknown as Record<string, unknown>)[key] = patch[key];
  }
  if (patch.stroke === null) style.stroke = null;
  else if (patch.stroke) {
    style.stroke = { color: patch.stroke.color ?? item.style.stroke?.color ?? "#000000", width: patch.stroke.width ?? item.style.stroke?.width ?? 0.08 };
  }
  if (patch.shadow === null) style.shadow = null;
  else if (patch.shadow) {
    style.shadow = {
      color: patch.shadow.color ?? item.style.shadow?.color ?? "rgba(0,0,0,0.55)",
      blur: patch.shadow.blur ?? item.style.shadow?.blur ?? 0.25,
      offsetY: patch.shadow.offsetY ?? item.style.shadow?.offsetY ?? 0.06,
    };
  }
  if (patch.background === null) style.background = null;
  else if (patch.background) {
    style.background = {
      color: patch.background.color ?? item.style.background?.color ?? "#ffffff",
      padding: patch.background.padding ?? item.style.background?.padding ?? 0.35,
      radius: patch.background.radius ?? item.style.background?.radius ?? 0.3,
    };
  }
  // Graisse ramenée à celle que la police possède vraiment.
  if (patch.font !== undefined || patch.weight !== undefined) style.weight = nearestCatalogWeight(style.font, style.weight);
  const next: TextItem = { ...item, style };
  if (highlight && item.karaoke) next.karaoke = { ...item.karaoke, highlight };
  return next;
}

function animated(item: VisualItem, phase: "in" | "out" | "emphasis", kind: string, count: number): VisualItem {
  const next = { ...item };
  if (phase === "emphasis") {
    if (kind === "none") delete next.animEmphasis;
    else {
      const enter = item.animIn.kind === "none" ? 0 : item.animIn.frames;
      const at = Math.max(0, Math.min(item.animEmphasis?.at ?? enter, item.duration - count));
      next.animEmphasis = { kind, frames: count, at, ...(item.animEmphasis?.repeat !== undefined ? { repeat: item.animEmphasis.repeat } : {}) };
    }
    return next;
  }
  // Une autre animation ne garde pas les réglages de la précédente.
  const anim: Anim = { kind, frames: count };
  if (phase === "in") next.animIn = anim;
  else next.animOut = anim;
  return next;
}

function presetFits(targetKind: string, item: VisualItem): boolean {
  if (targetKind === "any") return true;
  if (targetKind === "text") return item.type === "text";
  if (targetKind === "image") return item.type === "image" || item.type === "video";
  if (targetKind === "shape") return item.type === "shape";
  return false;
}

const PHASE_LABELS = { in: "entrée", out: "sortie", emphasis: "mise en avant" } as const;
const TARGET_LABELS: Record<string, string> = { text: "aux textes", image: "aux images et vidéos", shape: "aux formes" };

// ─── Résumés ─────────────────────────────────────────────────────

function formatNumber(value: number, digits: number): string {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: digits });
}

export function formatSeconds(seconds: number): string {
  return `${formatNumber(Math.round(seconds * 100) / 100, 2)} s`;
}

function formatPercent(ratio: number): string {
  return `${formatNumber(ratio * 100, 1)} %`;
}

function formatRange(item: ClipItem, fps: number): string {
  return `${formatNumber(item.start / fps, 2)}–${formatSeconds((item.start + item.duration) / fps)}`;
}

function clip(text: string, length: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1).trimEnd()}…` : flat;
}

function capitalize(text: string): string {
  return text ? text[0].toLocaleUpperCase("fr-FR") + text.slice(1) : text;
}

/** Nom lisible d'un élément, dans une phrase. */
export function itemName(item: ClipItem): string {
  switch (item.type) {
    case "text":
      return item.karaoke ? `les sous-titres « ${clip(item.text, 28)} »` : `le texte « ${clip(item.text, 32)} »`;
    case "image":
      return `l’image « ${clip(item.label || item.source.name, 32)} »`;
    case "video":
      return `la vidéo « ${clip(item.label || item.source.name, 32)} »`;
    case "audio":
      return `le son « ${clip(item.label || item.source.name, 32)} »`;
    case "shape":
      return item.label ? `la forme « ${clip(item.label, 32)} »` : item.shape === "stroke" ? "le tracé" : "la forme";
  }
}

function itemsName(items: ClipItem[]): string {
  if (items.length === 1) return itemName(items[0]);
  if (items.every((item) => item.type === "text" && item.karaoke)) return `${items.length} blocs de sous-titres`;
  if (items.every((item) => item.type === "text")) return `${items.length} textes`;
  return `${items.length} éléments`;
}

function describeName(name: string | undefined): string {
  return name ? `Opération « ${name} »` : "Opération illisible";
}

/** Ce que l'opération voulait faire, pour une opération écartée. */
function plannedSummary(project: ClipProject, op: EditorOp): string {
  const ids = "ids" in op ? op.ids : "id" in op ? [op.id] : [];
  const found = ids.map((id) => findItem(project, id)?.item).filter((item): item is ClipItem => Boolean(item));
  const subject = found.length ? itemsName(found) : ids.length ? `élément ${ids[0]}` : "";
  const what: Record<EditorOpName, string> = {
    set_text: "réécrire",
    style_text: "changer le style de",
    set_frame: "déplacer ou redimensionner",
    move: "déplacer dans le temps",
    trim: "rogner",
    split: "couper",
    set_animation: "changer l’animation de",
    set_transition: "changer la transition de",
    delete: "supprimer",
    add_text: "ajouter un texte",
    set_audio: "régler le son de",
    set_track: "régler la piste",
    set_media: "régler",
    set_shape: "régler",
    set_background: "changer le fond du clip",
  };
  return capitalize([what[op.op], subject].filter(Boolean).join(" "));
}

function styleSummary(item: TextItem, patch: TextStylePatch, highlight?: string): string {
  const parts: string[] = [];
  if (patch.size !== undefined) parts.push(`taille ${formatPercent(item.style.size)} → ${formatPercent(patch.size)} de la hauteur`);
  if (patch.color) parts.push(`couleur ${patch.color}`);
  if (patch.font) parts.push(`police ${patch.font}`);
  if (patch.weight !== undefined && !patch.font) parts.push(`graisse ${patch.weight}`);
  if (patch.align) parts.push({ left: "aligné à gauche", center: "centré", right: "aligné à droite" }[patch.align]);
  if (patch.uppercase !== undefined) parts.push(patch.uppercase ? "en capitales" : "en minuscules");
  if (patch.lineHeight !== undefined) parts.push(`interligne ${formatNumber(patch.lineHeight, 2)}`);
  if (patch.letterSpacing !== undefined) parts.push(`espacement ${formatNumber(patch.letterSpacing, 3)}`);
  if (patch.stroke !== undefined) parts.push(patch.stroke === null ? "sans contour" : "contour");
  if (patch.shadow !== undefined) parts.push(patch.shadow === null ? "sans ombre" : "ombre");
  if (patch.background !== undefined) parts.push(patch.background === null ? "sans fond" : "sur un fond");
  if (highlight) parts.push(`mot prononcé en ${highlight}`);
  return parts.join(", ") || "style retouché";
}

function frameSummary(item: VisualItem, placement: Placement): string {
  const before = item.transform;
  const parts: string[] = [];
  if (placement.x !== undefined || placement.y !== undefined) {
    parts.push(`centre (${formatNumber(before.x, 2)} ; ${formatNumber(before.y, 2)}) → (${formatNumber(placement.x ?? before.x, 2)} ; ${formatNumber(placement.y ?? before.y, 2)})`);
  }
  if (placement.width !== undefined) parts.push(`largeur ${formatPercent(before.width)} → ${formatPercent(placement.width)}`);
  if (placement.height !== undefined) parts.push(`hauteur ${formatPercent(before.height)} → ${formatPercent(placement.height)}`);
  if (placement.rotation !== undefined) parts.push(`rotation ${formatNumber(placement.rotation, 1)}°`);
  if (placement.opacity !== undefined) parts.push(`opacité ${formatPercent(placement.opacity)}`);
  return parts.join(", ");
}
