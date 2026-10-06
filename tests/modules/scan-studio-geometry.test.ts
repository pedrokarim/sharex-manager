import { describe, expect, it } from "vitest";
import {
  boxCorners,
  handlePosition,
  hitBoxHandle,
  nearestEdgeIndex,
  nearestVertexIndex,
  normalizeAngle,
  offsetPolygon,
  pointInBox,
  pointInPolygon,
  rectFromCorners,
  rectToPolygon,
  resizeBox,
  rotatePoint,
  rotationToward,
  signedArea,
  snapAngle,
} from "@/modules/scan-studio/lib/geometry";
import { boundsOf, type TextBox } from "@/modules/scan-studio/lib/types";

const square = rectToPolygon({ x: 10, y: 10, width: 20, height: 20 });
const box: TextBox = { x: 100, y: 100, width: 200, height: 100, rotation: 0 };

const close = (actual: { x: number; y: number }, expected: { x: number; y: number }) => {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
};

describe("contours", () => {
  it("dit si un point est dans un polygone, y compris concave", () => {
    expect(pointInPolygon({ x: 20, y: 20 }, square)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 20 }, square)).toBe(false);
    // Un « L » : le creux en haut à droite est dehors.
    const shape = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ];
    expect(pointInPolygon({ x: 5, y: 5 }, shape)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, shape)).toBe(false);
    expect(pointInPolygon({ x: 15, y: 15 }, shape)).toBe(true);
  });

  it("dilate un contour de la marge demandée, dans les deux sens de parcours", () => {
    for (const polygon of [square, [...square].reverse()]) {
      expect(boundsOf(offsetPolygon(polygon, 4))).toEqual({ x: 6, y: 6, width: 28, height: 28 });
      expect(boundsOf(offsetPolygon(polygon, -4))).toEqual({ x: 14, y: 14, width: 12, height: 12 });
    }
    expect(Math.sign(signedArea(square))).toBe(-Math.sign(signedArea([...square].reverse())));
  });

  it("tronque la pointe d'un angle très aigu au lieu de l'étirer", () => {
    const needle = [
      { x: 0, y: 0 },
      { x: 100, y: 1 },
      { x: 0, y: 2 },
    ];
    const grown = offsetPolygon(needle, 2);
    expect(grown[1].x).toBeLessThanOrEqual(100 + 2 * 3 + 1e-6);
  });

  it("laisse intact un contour sans marge et ignore les points doublés", () => {
    expect(offsetPolygon(square, 0)).toEqual(square);
    expect(offsetPolygon([square[0], square[0], ...square.slice(1)], 2)).toHaveLength(4);
  });

  it("trouve le sommet et le côté les plus proches", () => {
    expect(nearestVertexIndex({ x: 31, y: 11 }, square, 3)).toBe(1);
    expect(nearestVertexIndex({ x: 20, y: 20 }, square, 3)).toBe(-1);
    expect(nearestEdgeIndex({ x: 20, y: 31 }, square, 3)).toBe(2);
    expect(nearestEdgeIndex({ x: 20, y: 20 }, square, 3)).toBe(-1);
  });

  it("construit un rectangle à partir de deux coins dans n'importe quel ordre", () => {
    expect(rectFromCorners({ x: 30, y: 5 }, { x: 10, y: 25 })).toEqual({ x: 10, y: 5, width: 20, height: 20 });
  });
});

describe("rotations", () => {
  it("tourne un point autour d'un centre", () => {
    close(rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90), { x: 0, y: 10 });
  });

  it("ramène les angles dans ]-180, 180] et les aimante", () => {
    expect(normalizeAngle(270)).toBe(-90);
    expect(normalizeAngle(-180)).toBe(180);
    expect(snapAngle(88.5, 15, 2)).toBe(90);
    expect(snapAngle(80, 15, 2)).toBe(80);
  });

  it("oriente la boîte vers le pointeur : en haut, aucune rotation", () => {
    expect(rotationToward(box, { x: 200, y: 0 })).toBeCloseTo(0);
    expect(rotationToward(box, { x: 400, y: 150 })).toBeCloseTo(90);
    expect(rotationToward(box, { x: 0, y: 150 })).toBeCloseTo(-90);
  });
});

describe("boîte tournée", () => {
  const turned: TextBox = { ...box, rotation: 90 };

  it("teste l'appartenance dans le repère de la boîte", () => {
    // Tournée d'un quart de tour, la boîte de 200 × 100 occupe 100 × 200.
    expect(pointInBox({ x: 200, y: 240 }, turned)).toBe(true);
    expect(pointInBox({ x: 290, y: 150 }, turned)).toBe(false);
    expect(pointInBox({ x: 290, y: 150 }, box)).toBe(true);
    expect(pointInBox({ x: 304, y: 150 }, box, 5)).toBe(true);
  });

  it("place les coins et les poignées après rotation", () => {
    close(boxCorners(turned)[0], { x: 250, y: 50 });
    close(handlePosition(box, "se"), { x: 300, y: 200 });
    close(handlePosition(box, "n"), { x: 200, y: 100 });
    close(handlePosition(box, "rotate", 30), { x: 200, y: 70 });
    close(handlePosition(turned, "rotate", 30), { x: 280, y: 150 });
  });

  it("reconnaît la poignée sous le pointeur", () => {
    expect(hitBoxHandle({ x: 301, y: 199 }, box, 6, 30)).toBe("se");
    expect(hitBoxHandle({ x: 200, y: 72 }, box, 6, 30)).toBe("rotate");
    expect(hitBoxHandle({ x: 100, y: 152 }, box, 6, 30)).toBe("w");
    expect(hitBoxHandle({ x: 200, y: 150 }, box, 6, 30)).toBeNull();
    expect(hitBoxHandle({ x: 279, y: 151 }, turned, 6, 30)).toBe("rotate");
  });

  it("redimensionne en gardant le coin opposé en place", () => {
    const resized = resizeBox(box, "se", { x: 350, y: 260 });
    expect(resized).toEqual({ x: 100, y: 100, width: 250, height: 160, rotation: 0 });
    const fromLeft = resizeBox(box, "w", { x: 60, y: 999 });
    expect(fromLeft).toEqual({ x: 60, y: 100, width: 240, height: 100, rotation: 0 });
  });

  it("garde le coin opposé fixe même quand la boîte est tournée", () => {
    const anchor = handlePosition(turned, "nw");
    const resized = resizeBox(turned, "se", { x: 120, y: 300 });
    close(handlePosition(resized, "nw"), anchor);
    close(handlePosition(resized, "se"), { x: 120, y: 300 });
  });

  it("ne descend pas sous la taille minimale", () => {
    const resized = resizeBox(box, "e", { x: 0, y: 150 }, 12);
    expect(resized.width).toBe(12);
    expect(resized.x).toBe(100);
  });
});
