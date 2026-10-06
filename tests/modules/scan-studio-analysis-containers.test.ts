import { describe, expect, it } from "vitest";
import { insetAround, isEnclosure, surveyContainer, type Container } from "@/modules/scan-studio/lib/analysis/containers";
import { findGlyphs, labelBackground, toBitmap } from "@/modules/scan-studio/lib/analysis/ink";
import {
  analyzeWithReader,
  detectCandidates,
  groupGlyphs,
  neighbourRects,
  readingRect,
  settleContainers,
  type Candidate,
  type PageGlyph,
  type PageReader,
  type ReadOptions,
} from "@/modules/scan-studio/lib/analysis/pipeline";
import type { Box, WordBox } from "@/modules/scan-studio/lib/analysis/words";
import type { Rect } from "@/modules/scan-studio/lib/geometry";
import type { PixelData } from "@/modules/scan-studio/lib/mask-color";
import { sanitizeRegions } from "@/modules/scan-studio/lib/sanitize-page";
import { DEFAULT_CHAPTER_SETTINGS, boundsOf } from "@/modules/scan-studio/lib/types";

// ─── Des pages dessinées en mémoire : des rectangles, rien d'autre ───

/** Image RVBA unie. Le gris moyen tient lieu de dessin : ni papier, ni noir. */
function createPage(width: number, height: number, gray = 150): PixelData {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let index = 0; index < data.length; index += 4) data[index] = data[index + 1] = data[index + 2] = gray;
  return { data, width, height };
}

function fill(page: PixelData, x: number, y: number, width: number, height: number, gray: number) {
  for (let row = y; row < y + height; row++) {
    for (let column = x; column < x + width; column++) {
      const offset = (row * page.width + column) * 4;
      page.data[offset] = page.data[offset + 1] = page.data[offset + 2] = gray;
    }
  }
}

/** Une ligne de « lettres » : des pavés de 12 × 18 px, séparés de 4 px, avec une espace tous les quatre. */
function letters(page: PixelData, x: number, y: number, count: number, gray = 20): Box {
  let cursor = x;
  let end = x;
  for (let index = 0; index < count; index++) {
    fill(page, cursor, y, 12, 18, gray);
    end = cursor + 12;
    cursor = end + (index % 4 === 3 ? 10 : 4);
  }
  return { x0: x, y0: y, x1: end, y1: y + 18 };
}

function fakeReader(page: PixelData, answer: (rect: Rect, options: ReadOptions) => WordBox[] = () => []) {
  const calls: { rect: Rect; options: ReadOptions }[] = [];
  const reader: PageReader = {
    size: { width: page.width, height: page.height },
    async read(rect, options) {
      calls.push({ rect, options });
      return answer(rect, options);
    },
    pixels(rect) {
      const x = Math.max(0, Math.floor(rect.x));
      const y = Math.max(0, Math.floor(rect.y));
      const width = Math.min(page.width - x, Math.ceil(rect.x + rect.width) - x);
      const height = Math.min(page.height - y, Math.ceil(rect.y + rect.height) - y);
      const data = new Uint8ClampedArray(width * height * 4);
      for (let row = 0; row < height; row++) {
        const start = ((y + row) * page.width + x) * 4;
        data.set(page.data.subarray(start, start + width * 4), row * width * 4);
      }
      return { pixels: { data, width, height }, offset: { x, y } };
    },
  };
  return { reader, calls };
}

/** Mots d'une lecture factice, une ligne par entrée. */
function reading(lines: string[], confidence = 0.95): WordBox[] {
  return lines.flatMap((line, row) => {
    let cursor = 10;
    return line.split(" ").map((text) => {
      const box = { text, confidence, x0: cursor, y0: 10 + row * 40, x1: cursor + text.length * 18, y1: 42 + row * 40 };
      cursor = box.x1 + 10;
      return box;
    });
  });
}

const contains = (rect: Rect, box: Box) => rect.x <= box.x0 && rect.y <= box.y0 && rect.x + rect.width >= box.x1 && rect.y + rect.height >= box.y1;
const limits = { minSize: 6, maxWidth: 150, maxHeight: 120 };

let counter = 0;
const createId = () => `cont${String(++counter).padStart(8, "0")}`;

/**
 * Deux cartouches blancs accolés sur un dessin gris, séparés par un trait de
 * deux pixels ; leurs lignes sont à la même hauteur, à 18 px l'une de l'autre.
 */
function drawTwinCaptions() {
  const page = createPage(700, 500);
  fill(page, 50, 100, 250, 200, 255);
  fill(page, 300, 100, 2, 200, 20);
  fill(page, 302, 100, 250, 200, 255);
  const left = letters(page, 160, 150, 8);
  letters(page, 170, 180, 6);
  const right = letters(page, 308, 150, 8);
  letters(page, 312, 180, 6);
  return { page, left: { ...left, y1: 198 }, right: { ...right, y1: 198 }, border: { x0: 300, x1: 302 } };
}

// ─── Plages de fond ──────────────────────────────────────────────

describe("plages de fond", () => {
  it("sépare deux plages qu'un trait d'un pixel divise", () => {
    const page = createPage(60, 30, 255);
    fill(page, 30, 0, 1, 30, 0);
    const map = labelBackground(toBitmap(page), "dark", 200);
    expect(map.areas.slice(1)).toEqual([900, 870]);
    expect(map.boxes[1]).toEqual({ x0: 0, y0: 0, x1: 30, y1: 30 });
    expect(map.labels[5]).not.toBe(map.labels[40]);
    // L'encre ne porte aucun numéro.
    expect(map.labels[30]).toBe(0);
  });

  it("ne laisse pas le fond passer par un coin", () => {
    const page = createPage(4, 4, 0);
    fill(page, 0, 0, 2, 2, 255);
    fill(page, 2, 2, 2, 2, 255);
    expect(labelBackground(toBitmap(page), "dark", 200).areas.slice(1)).toEqual([4, 4]);
  });

  it("découpe aussi le fond sombre d'un texte clair", () => {
    const page = createPage(40, 20, 10);
    fill(page, 20, 0, 2, 20, 255);
    expect(labelBackground(toBitmap(page), "light", 90).areas.slice(1)).toEqual([400, 360]);
  });

  it("donne à chaque tache la plage qui l'entoure et un point de cette plage", () => {
    const scene = drawTwinCaptions();
    const bitmap = toBitmap(scene.page);
    const map = labelBackground(bitmap, "dark", 200);
    const { glyphs } = findGlyphs(bitmap, "dark", 200, limits, map);
    expect(glyphs).toHaveLength(28);
    const ids = new Set(glyphs.map((glyph) => glyph.container));
    expect(ids.size).toBe(2);
    for (const glyph of glyphs) {
      expect(map.labels[glyph.anchor!.y * bitmap.width + glyph.anchor!.x]).toBe(glyph.container);
      expect(glyph.x0 < 300 ? map.boxes[glyph.container!].x1 : map.boxes[glyph.container!].x0).toBe(glyph.x0 < 300 ? 300 : 302);
    }
    // Sans découpage du fond, les taches sont rendues comme avant.
    expect(findGlyphs(bitmap, "dark", 200, limits).glyphs[0]).toEqual({ x0: 160, y0: 150, x1: 172, y1: 168 });
  });
});

describe("forme d'une bulle", () => {
  const page = { width: 1200, height: 1700 };
  const container = (overrides: Partial<Container>): Container => ({ id: 1, polarity: "dark", x0: 100, y0: 100, x1: 400, y1: 300, area: 54_000, threshold: 200, factor: 1, ...overrides });

  it("reconnaît une plage ramassée, bien plus petite que la page", () => {
    expect(isEnclosure(container({}), page)).toBe(true);
    // Une ellipse remplit environ les trois quarts de sa boîte, lettres déduites.
    expect(isEnclosure(container({ area: 40_000 }), page)).toBe(true);
  });

  it("écarte le papier, le fond d'une case et un blanc qui serpente dans le dessin", () => {
    expect(isEnclosure(container({ x0: 0, y0: 0, x1: 1200, y1: 1700, area: 600_000 }), page)).toBe(false);
    expect(isEnclosure(container({ x0: 40, y0: 40, x1: 1160, y1: 800, area: 700_000 }), page)).toBe(false);
    expect(isEnclosure(container({ area: 12_000 }), page)).toBe(false);
  });

  it("juge une bande de webtoon sur une hauteur d'écran", () => {
    const strip = { width: 800, height: 20_000 };
    expect(isEnclosure(container({ area: 54_000 }), strip)).toBe(true);
    expect(isEnclosure(container({ x0: 0, y0: 0, x1: 780, y1: 900, area: 650_000 }), strip)).toBe(false);
  });
});

// ─── Place disponible dans la bulle ──────────────────────────────

describe("relevé d'une bulle", () => {
  it("rend la place libre autour du texte, jusqu'au contour", () => {
    const scene = drawTwinCaptions();
    const survey = surveyContainer(scene.page, { x: 0, y: 0 }, { polarity: "dark", threshold: 200, factor: 1, anchors: [{ x: 166, y: 149 }] })!;
    expect(survey).not.toBeNull();
    // Sans limite de portée : tout l'intérieur du cartouche de gauche, rien au-delà du trait.
    expect(survey.room(scene.left, [], 1000)).toEqual({ x0: 50, y0: 100, x1: 300, y1: 300 });
    // La portée borne la place : un texte ne s'étale pas dans toute une grande plage.
    expect(survey.room(scene.left, [], 20)).toEqual({ x0: 140, y0: 130, x1: 300, y1: 218 });
  });

  it("s'arrête au bloc voisin de la même bulle", () => {
    const page = createPage(400, 300);
    fill(page, 20, 20, 360, 260, 255);
    const top = letters(page, 100, 60, 8);
    const bottom = letters(page, 100, 200, 8);
    const survey = surveyContainer(page, { x: 0, y: 0 }, { polarity: "dark", threshold: 200, factor: 1, anchors: [{ x: 106, y: 59 }] })!;
    const room = survey.room(top, [bottom], 1000);
    expect(room).toMatchObject({ x0: 20, y0: 20, x1: 380 });
    expect(room.y1).toBe(200);
  });

  it("ne rend jamais moins que le bloc, même s'il touche le contour", () => {
    const page = createPage(200, 100);
    fill(page, 40, 30, 120, 40, 255);
    const text = letters(page, 40, 41, 7);
    const survey = surveyContainer(page, { x: 0, y: 0 }, { polarity: "dark", threshold: 200, factor: 1, anchors: [{ x: 60, y: 40 }] })!;
    const room = survey.room(text, [], 100);
    expect(room.x0).toBe(40);
    expect(room.x1).toBeGreaterThanOrEqual(text.x1);
    expect(room.y0).toBe(30);
    expect(room.y1).toBe(70);
  });

  it("mesure ce qui sort de la bulle entre deux blocs", () => {
    // Deux rectangles blancs décalés : un coude, avec du dessin dans les deux angles rentrants.
    const page = createPage(500, 400);
    fill(page, 60, 40, 240, 160, 255);
    fill(page, 200, 200, 240, 160, 255);
    fill(page, 200, 190, 100, 10, 255);
    const upper = letters(page, 80, 100, 10);
    const lower = letters(page, 220, 260, 10);
    const survey = surveyContainer(page, { x: 0, y: 0 }, { polarity: "dark", threshold: 200, factor: 1, anchors: [{ x: 86, y: 99 }] })!;
    expect(survey.foreign([upper, lower])).toBeGreaterThan(0.3);
    expect(survey.foreign([upper])).toBe(0);

    // Deux blocs l'un sous l'autre dans un rectangle : rien ne sort.
    const plain = createPage(400, 300);
    fill(plain, 20, 20, 360, 260, 255);
    const top = letters(plain, 100, 60, 8);
    const bottom = letters(plain, 110, 200, 6);
    const inside = surveyContainer(plain, { x: 0, y: 0 }, { polarity: "dark", threshold: 200, factor: 1, anchors: [{ x: 106, y: 59 }] })!;
    expect(inside.foreign([top, bottom])).toBe(0);
  });

  it("renonce quand aucun point d'ancrage ne tombe sur du fond", () => {
    const page = createPage(100, 100);
    expect(surveyContainer(page, { x: 0, y: 0 }, { polarity: "dark", threshold: 200, factor: 1, anchors: [{ x: 50, y: 50 }] })).toBeNull();
  });

  it("travaille sur l'image réduite d'une grande page et rend des pixels de la page", () => {
    const page = createPage(400, 300);
    fill(page, 40, 40, 320, 220, 255);
    fill(page, 120, 120, 160, 40, 20);
    const text = { x0: 120, y0: 120, x1: 280, y1: 160 };
    const survey = surveyContainer(page, { x: 1000, y: 2000 }, { polarity: "dark", threshold: 200, factor: 2, anchors: [{ x: 1200, y: 2118 }] })!;
    expect(survey.room({ x0: 1120, y0: 2120, x1: 1280, y1: 2160 }, [], 1000)).toEqual({ x0: 1040, y0: 2040, x1: 1360, y1: 2260 });
    expect(text.x1 - text.x0).toBe(160);
  });

  it("rétrécit une place sans passer sous le texte", () => {
    const room = { x0: 0, y0: 0, x1: 200, y1: 100 };
    expect(insetAround(room, 10, { x0: 50, y0: 30, x1: 150, y1: 70 })).toEqual({ x0: 10, y0: 10, x1: 190, y1: 90 });
    expect(insetAround(room, 10, { x0: 4, y0: 30, x1: 198, y1: 70 })).toEqual({ x0: 4, y0: 10, x1: 198, y1: 90 });
  });
});

// ─── Du repérage aux zones ───────────────────────────────────────

describe("un texte, une bulle", () => {
  it("garde deux zones pour deux cartouches accolés", async () => {
    const scene = drawTwinCaptions();
    const { reader, calls } = fakeReader(scene.page, (rect) => {
      if (contains(rect, scene.left) && !contains(rect, scene.right)) return reading(["THE GATE WAS", "ALREADY OPEN"]);
      if (contains(rect, scene.right) && !contains(rect, scene.left)) return reading(["NOBODY STOOD", "GUARD THERE"]);
      return reading(["THE GATE WAS NOBODY STOOD"], 0.3);
    });
    const regions = await analyzeWithReader(reader, { ...DEFAULT_CHAPTER_SETTINGS, format: "manhua" }, { createId });

    expect(regions.map((region) => region.reading.clean)).toEqual(["The gate was already open", "Nobody stood guard there"]);
    // Aucune lecture ne franchit le trait qui sépare les deux cartouches.
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      const crossesLeft = call.rect.x < scene.border.x0 && call.rect.x + call.rect.width > scene.border.x0;
      expect(crossesLeft).toBe(false);
    }

    const [left, right] = regions;
    for (const [region, text, box] of [
      [left, scene.left, { x0: 50, x1: 300 }],
      [right, scene.right, { x0: 302, x1: 552 }],
    ] as const) {
      const outline = boundsOf(region.outline);
      // Le contour reste celui du texte d'origine, dans son cartouche.
      expect(outline.x).toBeLessThanOrEqual(text.x0);
      expect(outline.x + outline.width).toBeGreaterThanOrEqual(text.x1);
      expect(outline.x).toBeGreaterThanOrEqual(box.x0);
      expect(outline.x + outline.width).toBeLessThanOrEqual(box.x1);
      // Le masque, marge comprise, ne mord pas sur le contour du cartouche.
      expect(region.mask.kind).toBe("fill");
      expect(region.mask.grow).toBeGreaterThanOrEqual(0);
      expect(outline.x - region.mask.grow).toBeGreaterThanOrEqual(box.x0);
      expect(outline.x + outline.width + region.mask.grow).toBeLessThanOrEqual(box.x1);
      expect(outline.y - region.mask.grow).toBeGreaterThanOrEqual(100);
      expect(outline.y + outline.height + region.mask.grow).toBeLessThanOrEqual(300);
      // La boîte du texte traduit est plus grande que le texte d'origine, et reste dans le cartouche.
      const room = region.text.box;
      expect(room.width * room.height).toBeGreaterThan(outline.width * outline.height);
      expect(room.x).toBeLessThanOrEqual(outline.x);
      expect(room.y).toBeLessThanOrEqual(outline.y);
      expect(room.x + room.width).toBeGreaterThanOrEqual(outline.x + outline.width);
      expect(room.y + room.height).toBeGreaterThanOrEqual(outline.y + outline.height);
      expect(room.x).toBeGreaterThanOrEqual(box.x0);
      expect(room.x + room.width).toBeLessThanOrEqual(box.x1);
      expect(room.y).toBeGreaterThanOrEqual(100);
      expect(room.y + room.height).toBeLessThanOrEqual(300);
    }
    expect(sanitizeRegions(regions, reader.size)).toEqual(regions);
  });

  it("ne laisse pas une zone s'étendre aux taches du dessin voisin", () => {
    const scene = drawTwinCaptions();
    // Deux éclats blancs dans le dessin, à la hauteur des lignes et tout près du cartouche de droite.
    fill(scene.page, 556, 150, 14, 18, 255);
    fill(scene.page, 574, 150, 14, 18, 255);
    fill(scene.page, 560, 154, 6, 8, 20);
    fill(scene.page, 578, 154, 6, 8, 20);
    const { reader } = fakeReader(scene.page);
    const candidates = detectCandidates(reader);
    expect(candidates).toHaveLength(2);
    expect(Math.max(...candidates.map((candidate) => candidate.x1))).toBeLessThanOrEqual(552);
  });

  it("réunit en une zone deux blocs posés l'un sous l'autre dans la même bulle", () => {
    const page = createPage(1000, 800);
    fill(page, 20, 20, 360, 260, 255);
    letters(page, 100, 60, 8);
    letters(page, 110, 200, 6);
    const { reader } = fakeReader(page);
    const found = detectCandidates(reader);
    expect(found).toHaveLength(2);
    const settled = settleContainers(reader, found);
    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatchObject({ x0: 100, y0: 60, x1: 230, y1: 218, glyphs: 14 });
    expect(settled[0].siblings).toBeUndefined();
  });

  it("garde deux zones pour deux textes côte à côte dans la même bulle", () => {
    const page = createPage(1000, 800);
    fill(page, 20, 20, 460, 260, 255);
    // À gauche trois lignes ; à droite trois lignes décalées de 7 px, à 16 px des premières.
    for (const row of [0, 1, 2]) {
      letters(page, 60, 80 + row * 30, 8);
      letters(page, 206, 87 + row * 30, 8);
    }
    const { reader } = fakeReader(page);
    const settled = settleContainers(reader, detectCandidates(reader));
    expect(settled).toHaveLength(2);
    const [left, right] = [...settled].sort((a, b) => a.x0 - b.x0);
    expect(left).toMatchObject({ x0: 60, x1: 190, glyphs: 24 });
    expect(right).toMatchObject({ x0: 206, x1: 336, glyphs: 24 });
    // Chacun a sa place, qui s'arrête à l'autre.
    expect(left.room!.x1).toBeLessThanOrEqual(right.x0);
    expect(right.room!.x0).toBeGreaterThanOrEqual(left.x1);
    expect(left.siblings).toHaveLength(1);
  });

  it("laisse sans bulle un texte posé sur le papier, et lui demande trois taches", () => {
    const page = createPage(600, 400, 255);
    letters(page, 100, 100, 8);
    letters(page, 400, 300, 2);
    const { reader } = fakeReader(page);
    const candidates = detectCandidates(reader);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].container).toBeUndefined();
    expect(settleContainers(reader, candidates)[0].room).toBeUndefined();
  });

  it("rend aux lettres sans bulle les creux d'une grande lettre cernée", () => {
    const page = { width: 1200, height: 1700 };
    const hollow: Container = { id: 7, polarity: "dark", x0: 200, y0: 200, x1: 300, y1: 360, area: 11_000, threshold: 200, factor: 1 };
    const paper: Container = { id: 8, polarity: "dark", x0: 0, y0: 0, x1: 1200, y1: 1700, area: 1_500_000, threshold: 200, factor: 1 };
    const containers = new Map([
      [7, hollow],
      [8, paper],
    ]);
    const glyphs: PageGlyph[] = [
      // Un creux, seul dans la plage fermée d'une lettre cernée.
      { x0: 230, y0: 230, x1: 254, y1: 330, container: 7 },
      // Trois grandes lettres voisines, sur le papier.
      { x0: 320, y0: 210, x1: 420, y1: 350, container: 8 },
      { x0: 440, y0: 210, x1: 540, y1: 350, container: 8 },
      { x0: 560, y0: 210, x1: 660, y1: 350, container: 8 },
    ];
    const candidates = groupGlyphs(glyphs, "dark", page, containers);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ x0: 230, x1: 660, glyphs: 4 });
    expect(candidates[0].container).toBeUndefined();
  });

  it("écarte des taches de tailles trop inégales, hors d'une bulle", () => {
    const page = { width: 1200, height: 1700 };
    const paper: Container = { id: 8, polarity: "dark", x0: 0, y0: 0, x1: 1200, y1: 1700, area: 1_500_000, threshold: 200, factor: 1 };
    const blobs: PageGlyph[] = [
      { x0: 100, y0: 100, x1: 110, y1: 112, container: 8 },
      { x0: 114, y0: 100, x1: 124, y1: 112, container: 8 },
      { x0: 128, y0: 100, x1: 138, y1: 112, container: 8 },
      { x0: 142, y0: 96, x1: 190, y1: 112, container: 8 },
    ];
    expect(groupGlyphs(blobs, "dark", page, new Map([[8, paper]]))).toHaveLength(0);
    expect(groupGlyphs(blobs.slice(0, 3), "dark", page, new Map([[8, paper]]))).toHaveLength(1);
  });
});

describe("écriture en colonnes", () => {
  const page = { width: 1200, height: 1700 };
  /** Trois colonnes de cinq signes carrés, serrés de haut en bas. */
  const columns: PageGlyph[] = [0, 1, 2].flatMap((column) =>
    Array.from({ length: 5 }, (_, row) => ({ x0: 300 - column * 34, y0: 100 + row * 21, x1: 318 - column * 34, y1: 118 + row * 21 })),
  );

  it("écarte sans le lire un texte en colonnes quand la langue source est en lettres latines", () => {
    expect(groupGlyphs(columns, "dark", page, undefined, { latinOnly: true })).toHaveLength(0);
    expect(groupGlyphs(columns, "dark", page)).not.toHaveLength(0);
  });

  it("garde un texte en lignes et un mot couché, seul sur sa colonne", () => {
    const rows: PageGlyph[] = [0, 1, 2].flatMap((row) => Array.from({ length: 6 }, (_, index) => ({ x0: 100 + index * 16, y0: 100 + row * 30, x1: 112 + index * 16, y1: 118 + row * 30 })));
    expect(groupGlyphs(rows, "dark", page, undefined, { latinOnly: true })).toHaveLength(1);
    const upright: PageGlyph[] = Array.from({ length: 5 }, (_, index) => ({ x0: 100, y0: 100 + index * 50, x1: 170, y1: 140 + index * 50 }));
    expect(groupGlyphs(upright, "dark", page, undefined, { latinOnly: true })[0].angle).toBe(90);
  });
});

describe("rectangle lu", () => {
  const page = { width: 1000, height: 1000 };
  const candidate = (overrides: Partial<Candidate>): Candidate => ({ x0: 200, y0: 200, x1: 400, y1: 260, lineHeight: 20, glyphs: 20, polarity: "dark", angle: 0, ...overrides });

  it("prend une marge autour du texte posé sur le dessin", () => {
    expect(readingRect(candidate({}), page)).toEqual({ x: 190, y: 190, width: 220, height: 80 });
  });

  it("s'arrête au contour de la bulle", () => {
    const rect = readingRect(candidate({ room: { x0: 196, y0: 150, x1: 500, y1: 264 } }), page);
    expect(rect).toEqual({ x: 196, y: 190, width: 214, height: 74 });
  });

  it("garde la marge ordinaire quand le texte touche le contour", () => {
    const rect = readingRect(candidate({ room: { x0: 200, y0: 199, x1: 400, y1: 260 } }), page);
    expect(rect).toEqual({ x: 190, y: 190, width: 220, height: 80 });
  });

  it("fait recouvrir le bloc voisin qui dépasse dans le rectangle", () => {
    const rect = { x: 190, y: 190, width: 220, height: 80 };
    const below = { x0: 100, y0: 262, x1: 215, y1: 330 };
    expect(neighbourRects(candidate({ siblings: [below] }), rect)).toEqual([{ x: 190, y: 261, width: 26, height: 9 }]);
    // Un voisin hors du rectangle, ou qui chevauche trop le texte lui-même, est laissé.
    expect(neighbourRects(candidate({ siblings: [{ x0: 500, y0: 200, x1: 700, y1: 260 }] }), rect)).toEqual([]);
    expect(neighbourRects(candidate({ siblings: [{ x0: 300, y0: 200, x1: 500, y1: 260 }] }), rect)).toEqual([]);
    expect(neighbourRects(candidate({}), rect)).toEqual([]);
  });

  it("transmet au lecteur les voisins à recouvrir, et agrandit davantage un lettrage minuscule", async () => {
    // Une bulle en coude : un bloc en haut à droite, un autre juste dessous, décalé vers la gauche.
    const page = createPage(1000, 800);
    fill(page, 20, 20, 460, 280, 255);
    for (const row of [0, 1, 2]) {
      letters(page, 206, 80 + row * 30, 8);
      letters(page, 80, 160 + row * 30, 8);
    }
    const { reader, calls } = fakeReader(page, () => reading(["SOME WORDS HERE"]));
    const regions = await analyzeWithReader(reader, DEFAULT_CHAPTER_SETTINGS, { createId });
    expect(regions).toHaveLength(2);
    expect(calls).toHaveLength(2);
    // Les deux blocs se touchent presque : chacun fait recouvrir le coin de l'autre.
    for (const call of calls) {
      expect(call.options.erase).toHaveLength(1);
      const [patch] = call.options.erase!;
      expect(patch.x).toBeGreaterThanOrEqual(call.rect.x);
      expect(patch.y).toBeGreaterThanOrEqual(call.rect.y);
      expect(patch.x + patch.width).toBeLessThanOrEqual(call.rect.x + call.rect.width);
      expect(patch.y + patch.height).toBeLessThanOrEqual(call.rect.y + call.rect.height);
    }
    expect(sanitizeRegions(regions, reader.size)).toEqual(regions);

    const tiny = createPage(400, 200, 255);
    for (let index = 0; index < 12; index++) fill(tiny, 60 + index * 9, 80, 6, 8, 20);
    const small = fakeReader(tiny, () => reading(["TINY WORDS"]));
    await analyzeWithReader(small.reader, DEFAULT_CHAPTER_SETTINGS, { createId });
    expect(small.calls[0].options.scale).toBe(4);
    expect(small.calls[0].options.erase).toBeUndefined();
  });
});
