/**
 * Géométrie de l'atelier : contours, boîtes tournées, poignées.
 *
 * Tout est en pixels de la page, axe vertical vers le bas. Ce fichier ne
 * dépend ni de React ni du DOM : la scène et les tests s'en servent tels quels.
 */

import type { Point, TextBox } from "./types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
export const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/** Ramène un angle dans ]-180, 180]. */
export function normalizeAngle(degrees: number): number {
  const wrapped = ((degrees % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

/** Aimante un angle sur le multiple de `step` le plus proche, s'il est à moins de `tolerance`. */
export function snapAngle(degrees: number, step: number, tolerance: number): number {
  const nearest = Math.round(degrees / step) * step;
  return Math.abs(nearest - degrees) <= tolerance ? normalizeAngle(nearest) : degrees;
}

export function rotatePoint(point: Point, center: Point, degrees: number): Point {
  const angle = toRadians(degrees);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
}

// ─── Contours ────────────────────────────────────────────────────

/** Lancer de rayon : le point est dedans si le rayon coupe un nombre impair de côtés. */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = a.y > point.y !== b.y > point.y;
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Aire signée : son signe donne le sens de parcours du contour. */
export function signedArea(polygon: Point[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Au-delà de ce rapport, la pointe d'un angle aigu est tronquée plutôt qu'étirée. */
const MITER_LIMIT = 3;

/**
 * Décale un contour de `margin` pixels vers l'extérieur (vers l'intérieur si
 * la marge est négative), quel que soit son sens de parcours. Chaque sommet
 * glisse le long de la bissectrice de ses deux côtés.
 */
export function offsetPolygon(polygon: Point[], margin: number): Point[] {
  const points = polygon.filter((point, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    return polygon.length < 2 || point.x !== previous.x || point.y !== previous.y;
  });
  if (points.length < 3 || margin === 0) return points.map((point) => ({ ...point }));

  const orientation = signedArea(points) >= 0 ? 1 : -1;
  const normalOf = (from: Point, to: Point): Point => {
    const length = distance(from, to) || 1;
    return { x: (orientation * (to.y - from.y)) / length, y: (-orientation * (to.x - from.x)) / length };
  };

  return points.map((vertex, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const before = normalOf(previous, vertex);
    const after = normalOf(vertex, next);
    let bisector = { x: before.x + after.x, y: before.y + after.y };
    const length = Math.hypot(bisector.x, bisector.y);
    // Demi-tour complet : pas de bissectrice, on suit la normale du premier côté.
    if (length < 1e-6) bisector = before;
    else bisector = { x: bisector.x / length, y: bisector.y / length };
    const cosine = Math.max(1 / MITER_LIMIT, bisector.x * before.x + bisector.y * before.y);
    return { x: vertex.x + (bisector.x * margin) / cosine, y: vertex.y + (bisector.y * margin) / cosine };
  });
}

export function rectToPolygon(rect: Rect): Point[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

/** Rectangle défini par deux coins opposés, dans n'importe quel ordre. */
export function rectFromCorners(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

export function translatePoints(points: Point[], dx: number, dy: number): Point[] {
  return points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

export function clampPoint(point: Point, width: number, height: number): Point {
  return { x: Math.max(0, Math.min(width, point.x)), y: Math.max(0, Math.min(height, point.y)) };
}

/** Indice du sommet le plus proche du point, ou -1 s'il est au-delà de `tolerance`. */
export function nearestVertexIndex(point: Point, polygon: Point[], tolerance: number): number {
  let best = -1;
  let bestDistance = tolerance;
  polygon.forEach((vertex, index) => {
    const gap = distance(point, vertex);
    if (gap <= bestDistance) {
      best = index;
      bestDistance = gap;
    }
  });
  return best;
}

/** Indice du côté (du sommet `i` au suivant) le plus proche du point, ou -1. */
export function nearestEdgeIndex(point: Point, polygon: Point[], tolerance: number): number {
  let best = -1;
  let bestDistance = tolerance;
  for (let index = 0; index < polygon.length; index++) {
    const gap = distanceToSegment(point, polygon[index], polygon[(index + 1) % polygon.length]);
    if (gap <= bestDistance) {
      best = index;
      bestDistance = gap;
    }
  }
  return best;
}

// ─── Boîtes tournées ─────────────────────────────────────────────

export function boxCenter(box: TextBox): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Coins de la boîte une fois tournée : haut-gauche, haut-droit, bas-droit, bas-gauche. */
export function boxCorners(box: TextBox): Point[] {
  const center = boxCenter(box);
  return rectToPolygon(box).map((corner) => rotatePoint(corner, center, box.rotation));
}

/** Point exprimé dans le repère de la boîte : origine au centre, rotation annulée. */
export function toBoxLocal(point: Point, box: TextBox): Point {
  const center = boxCenter(box);
  const local = rotatePoint(point, center, -box.rotation);
  return { x: local.x - center.x, y: local.y - center.y };
}

export function pointInBox(point: Point, box: TextBox, tolerance = 0): boolean {
  const local = toBoxLocal(point, box);
  return Math.abs(local.x) <= box.width / 2 + tolerance && Math.abs(local.y) <= box.height / 2 + tolerance;
}

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type BoxHandle = ResizeHandle | "rotate";

export const RESIZE_HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/**
 * Position d'une poignée, dans la page. La poignée de rotation se tient
 * au-dessus du milieu du bord haut, à `rotateOffset` pixels.
 */
export function handlePosition(box: TextBox, handle: BoxHandle, rotateOffset = 0): Point {
  const center = boxCenter(box);
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  let local: Point;
  if (handle === "rotate") {
    local = { x: 0, y: -halfHeight - rotateOffset };
  } else {
    local = {
      x: handle.includes("w") ? -halfWidth : handle.includes("e") ? halfWidth : 0,
      y: handle.includes("n") ? -halfHeight : handle.includes("s") ? halfHeight : 0,
    };
  }
  return rotatePoint({ x: center.x + local.x, y: center.y + local.y }, center, box.rotation);
}

/** Poignée sous le pointeur ; la rotation d'abord, puis les coins avant les côtés. */
export function hitBoxHandle(point: Point, box: TextBox, tolerance: number, rotateOffset: number): BoxHandle | null {
  const order: BoxHandle[] = ["rotate", "nw", "ne", "se", "sw", "n", "e", "s", "w"];
  for (const handle of order) {
    if (distance(point, handlePosition(box, handle, rotateOffset)) <= tolerance) return handle;
  }
  return null;
}

/**
 * Redimensionne une boîte en tirant une poignée jusqu'au pointeur. Le bord ou
 * le coin opposé reste à sa place dans la page, même si la boîte est tournée.
 */
export function resizeBox(box: TextBox, handle: ResizeHandle, pointer: Point, minSize = 8): TextBox {
  const local = toBoxLocal(pointer, box);
  let left = -box.width / 2;
  let right = box.width / 2;
  let top = -box.height / 2;
  let bottom = box.height / 2;
  if (handle.includes("w")) left = Math.min(local.x, right - minSize);
  if (handle.includes("e")) right = Math.max(local.x, left + minSize);
  if (handle.includes("n")) top = Math.min(local.y, bottom - minSize);
  if (handle.includes("s")) bottom = Math.max(local.y, top + minSize);

  const width = right - left;
  const height = bottom - top;
  // Le centre se déplace dans le repère de la boîte : on le ramène dans la page.
  const origin = boxCenter(box);
  const center = rotatePoint({ x: origin.x + (left + right) / 2, y: origin.y + (top + bottom) / 2 }, origin, box.rotation);
  return { x: center.x - width / 2, y: center.y - height / 2, width, height, rotation: box.rotation };
}

/** Rotation qui amène la poignée de rotation dans la direction du pointeur. */
export function rotationToward(box: TextBox, pointer: Point): number {
  const center = boxCenter(box);
  return normalizeAngle(toDegrees(Math.atan2(pointer.y - center.y, pointer.x - center.x)) + 90);
}
