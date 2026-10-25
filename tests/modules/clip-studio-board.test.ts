import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { boardTracks, column, compileBoard, stack, type BoardSpec } from "@/modules/clip-studio/engine/board";
import { createProject, splitItem, trimItem } from "@/modules/clip-studio/engine/edit";
import { keyedFrame, moveEase, shiftTimed } from "@/modules/clip-studio/engine/keys";
import { drawFrame, partialPolyline, strokePolyline } from "@/modules/clip-studio/engine/render";
import type { ClipProject, ShapeItem, TextItem, VisualItem } from "@/modules/clip-studio/engine/types";
import { SAMPLE_AREA, SAMPLE_FPS, SAMPLE_WORDS, sampleBoards } from "./clip-studio-board-sample";

/**
 * Planche d'illustrations (dossier 01, illustrations, étape I1) : images
 * clés, tracés, marques de texte, compteur, centrage sur les capitales,
 * compilation d'une partition et contrôle du placement.
 */

const FRAME = { width: 1080, height: 1920 };
const logos = [0, 1, 2].map((index) => ({ url: `/api/test/logo-${index}.png`, ref: `test:${index}`, name: `Logo ${index}`, kind: "image" as const, width: 256, height: 256 }));

function shape(patch: Partial<ShapeItem> = {}): ShapeItem {
  return {
    id: "s-1",
    type: "shape",
    shape: "rect",
    start: 10,
    duration: 60,
    fill: "#000000",
    radius: 0,
    transform: { x: 0.2, y: 0.5, width: 0.2, height: 0.1, rotation: 0, opacity: 1 },
    animIn: { kind: "none", frames: 1 },
    animOut: { kind: "none", frames: 1 },
    ...patch,
  };
}

function projectWith(items: VisualItem[], background = "#ffffff"): ClipProject {
  return { ...createProject("Essai", "9:16"), background, tracks: [{ id: "t-1", kind: "visual", name: "Piste", items }] };
}

/** Lignes de pixels sombres d'une colonne de l'image (haut et bas de l'encre). */
function inkSpan(project: ClipProject, frame: number, x0: number, x1: number, y0: number, y1: number) {
  const canvas = createCanvas(project.width, project.height);
  const ctx = canvas.getContext("2d");
  drawFrame(ctx as unknown as CanvasRenderingContext2D, project, frame, () => null);
  const data = ctx.getImageData(0, 0, project.width, project.height).data;
  let top = -1;
  let bottom = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (data[(y * project.width + x) * 4] < 128) {
        if (top < 0) top = y;
        bottom = y;
        break;
      }
    }
  }
  return { top, bottom };
}

describe("images clés", () => {
  it("rejoignent leur cible sur un ressort sans rebond, valeur par valeur", () => {
    for (let step = 0; step <= 20; step++) {
      const value = moveEase("spring", step / 20);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(moveEase("spring", 1)).toBeCloseTo(1, 9);
    const item = shape({ keys: [{ at: 10, frames: 10, x: 0.6 }, { at: 30, frames: 5, opacity: 0.4, ease: "linear" }] });
    expect(keyedFrame(item, 15).transform.x).toBe(0.2);
    expect(keyedFrame(item, 30).transform.x).toBeCloseTo(0.6, 9);
    // La clé d'opacité ne touche pas à x, et inversement.
    expect(keyedFrame(item, 42).transform.opacity).toBeCloseTo(0.76, 9);
    expect(keyedFrame(item, 50).transform).toMatchObject({ x: 0.6, opacity: 0.4, y: 0.5 });
  });

  it("restent à leur instant dans le clip quand on scinde ou qu'on rogne le début", () => {
    const item = shape({ keys: [{ at: 10, frames: 20, x: 0.8 }] });
    const project = projectWith([item]);
    const before = [25, 35, 50].map((frame) => keyedFrame(item, frame).transform.x);

    const split = splitItem(project, item.id, 30);
    const right = split.tracks[0].items[1] as VisualItem;
    expect(right.start).toBe(30);
    expect(keyedFrame(right, 35).transform.x).toBeCloseTo(before[1], 9);
    expect(keyedFrame(right, 50).transform.x).toBeCloseTo(before[2], 9);

    const trimmed = trimItem(project, item.id, "start", 22).tracks[0].items[0] as VisualItem;
    expect(keyedFrame(trimmed, 25).transform.x).toBeCloseTo(before[0], 9);
    expect(shiftTimed(item, 0)).toEqual({ keys: item.keys });
  });
});

describe("tracés", () => {
  it("se dessinent sur leur longueur réelle et passent par chaque point d'une courbe", () => {
    const straight = partialPolyline([[0, 0], [100, 0], [100, 100]], 0.75);
    expect(straight[straight.length - 1][0]).toBeCloseTo(100, 6);
    expect(straight[straight.length - 1][1]).toBeCloseTo(50, 6);
    const curve = strokePolyline({ points: [[0, 0], [0.5, 1], [1, 0]], smooth: true }, 200, 100);
    expect(curve[0]).toEqual([-100, -50]);
    expect(curve.some(([x, y]) => Math.abs(x) < 1e-9 && Math.abs(y - 50) < 1e-9)).toBe(true);
    expect(curve[curve.length - 1][0]).toBeCloseTo(100, 9);
  });

  it("n'apparaissent pas avant leur instant de dessin", () => {
    const stroke = shape({ shape: "stroke", fill: "#000000", stroke: { width: 0.02, paths: [{ points: [[0, 0.5], [1, 0.5]], draw: { at: 20, frames: 10 } }] } });
    const project = projectWith([stroke]);
    const y = Math.round(0.5 * project.height);
    expect(inkSpan(project, 25, 100, 300, y - 30, y + 30).top).toBe(-1);
    expect(inkSpan(project, 45, 100, 300, y - 30, y + 30).top).toBeGreaterThan(0);
  });
});

describe("centrage d'un texte", () => {
  it("pose les capitales au milieu de la boîte, au pixel près", () => {
    const text: TextItem = {
      id: "x-1",
      type: "text",
      start: 0,
      duration: 30,
      text: "HHHH",
      style: { font: "sans-serif", weight: 700, size: 0.04, color: "#000000", align: "center", lineHeight: 1.2, uppercase: false, letterSpacing: 0, stroke: null, shadow: null, background: null },
      transform: { x: 0.5, y: 0.5, width: 0.6, height: 0.08, rotation: 0, opacity: 1 },
      animIn: { kind: "none", frames: 1 },
      animOut: { kind: "none", frames: 1 },
      opticalCenter: true,
    };
    const project = projectWith([text]);
    const ink = inkSpan(project, 0, 300, 780, 860, 1060);
    expect(ink.top).toBeGreaterThan(0);
    expect(Math.abs((ink.top + ink.bottom + 1) / 2 - project.height / 2)).toBeLessThanOrEqual(1);
  });

  it("fait défiler un compteur de sa valeur de départ à sa valeur écrite, puis s'y arrête", () => {
    const counter: TextItem = {
      id: "x-2",
      type: "text",
      start: 0,
      duration: 90,
      text: "1000",
      style: { font: "sans-serif", weight: 700, size: 0.05, color: "#000000", align: "center", lineHeight: 1.2, uppercase: false, letterSpacing: 0, stroke: null, shadow: null, background: null },
      transform: { x: 0.5, y: 0.5, width: 0.8, height: 0.1, rotation: 0, opacity: 1 },
      animIn: { kind: "none", frames: 1 },
      animOut: { kind: "none", frames: 1 },
      count: { from: 0, at: 30, frames: 30 },
    };
    const width = (frame: number) => {
      const canvas = createCanvas(1080, 1920);
      const ctx = canvas.getContext("2d");
      drawFrame(ctx as unknown as CanvasRenderingContext2D, projectWith([counter]), frame, () => null);
      const data = ctx.getImageData(0, 900, 1080, 120).data;
      let left = 1080;
      let right = -1;
      for (let y = 0; y < 120; y++) for (let x = 0; x < 1080; x++) if (data[(y * 1080 + x) * 4] < 128) { left = Math.min(left, x); right = Math.max(right, x); }
      return right - left;
    };
    // Avant le comptage, « 0 » (un chiffre) ; à la fin, « 1000 » (quatre chiffres).
    expect(width(10)).toBeLessThan(width(80) / 2);
    expect(width(80)).toBe(width(89));
  });
});

describe("planche", () => {
  it("centre une pile au pixel près, marges égales avant et après", () => {
    const centers = stack(3, 0.2, 0.05, 0.5);
    expect(centers[1]).toBeCloseTo(0.5, 12);
    expect(centers[0] - 0.1 - 0).toBeCloseTo(1 - (centers[2] + 0.1), 12);
    const mixed = column([0.1, 0.3], 0.05, 0.5);
    expect(mixed[0] - 0.05).toBeCloseTo(1 - (mixed[1] + 0.15), 12);
  });

  it("compile la planche d'essai sans défaut de placement, en pistes rangées par calque", () => {
    const compiled = sampleBoards(logos).map((spec) => compileBoard(spec, { fps: SAMPLE_FPS, frame: FRAME, words: SAMPLE_WORDS }));
    expect(compiled.flatMap((board) => board.issues)).toEqual([]);
    const tracks = boardTracks(compiled);
    expect(tracks.length).toBeLessThanOrEqual(30);
    const names = tracks.map((track) => track.name);
    // Traits au-dessus de tout, papier en dessous de tout.
    expect(names[0]).toMatch(/^Planche – traits/);
    expect(names[names.length - 1]).toMatch(/^Planche – papier/);
    for (const track of tracks) {
      const items = [...track.items].sort((a, b) => a.start - b.start);
      for (let index = 1; index < items.length; index++) expect(items[index].start).toBeGreaterThanOrEqual(items[index - 1].start + items[index - 1].duration);
    }
  });

  it("n'entre jamais avant le mot qui l'appelle, et le compteur n'attend pas à zéro", () => {
    const [, list, , last] = sampleBoards(logos);
    const compiled = compileBoard(list, { fps: SAMPLE_FPS, frame: FRAME, words: SAMPLE_WORDS });
    const row = compiled.items.find((item) => item.type === "text" && item.text === "Trois idées")!;
    const spoken = SAMPLE_WORDS.findIndex((word, index) => index > 10 && word.text.toLowerCase().startsWith("trois"));
    expect(row.start).toBe(Math.round((SAMPLE_WORDS[spoken].startMs / 1000) * SAMPLE_FPS));

    const counter = compileBoard(last, { fps: SAMPLE_FPS, frame: FRAME, words: SAMPLE_WORDS }).items.find((item): item is TextItem => item.type === "text" && Boolean(item.count))!;
    expect(counter.count!.at).toBe(0);
  });

  it("signale deux acteurs qui se chevauchent, et accepte un recouvrement voulu", () => {
    const spec: BoardSpec = {
      area: SAMPLE_AREA,
      start: 0,
      end: 60,
      actors: [
        { id: "a", kind: "card", text: "Un", x: 0.5, y: 0.5, w: 0.5, h: 0.2 },
        { id: "b", kind: "card", text: "Deux", x: 0.6, y: 0.55, w: 0.5, h: 0.2 },
      ],
    };
    expect(compileBoard(spec, { fps: 30, frame: FRAME, words: [] }).issues).toEqual(["« a » et « b » se chevauchent"]);
    const allowed = { ...spec, actors: spec.actors.map((actor) => (actor.id === "b" ? { ...actor, overlap: true } : actor)) };
    expect(compileBoard(allowed, { fps: 30, frame: FRAME, words: [] }).issues).toEqual([]);
    const late = { ...spec, actors: [{ ...spec.actors[0], enter: { at: 20 } }] };
    expect(compileBoard(late, { fps: 30, frame: FRAME, words: [] }).issues).toEqual(["planche vide pendant 0,67 s au début"]);
  });
});
