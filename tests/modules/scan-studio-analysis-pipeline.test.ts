import { describe, expect, it } from "vitest";
import { backgroundThresholds, estimateAngle, findGlyphs, toBitmap, type Bitmap } from "@/modules/scan-studio/lib/analysis/ink";
import {
  absorbMarks,
  analyzeWithReader,
  blendConfidence,
  detectCandidates,
  dropEchoes,
  groupGlyphs,
  mergeTiles,
  sliceTiles,
  toPageWords,
  type Candidate,
  type PageReader,
  type ReadOptions,
} from "@/modules/scan-studio/lib/analysis/pipeline";
import type { Box, WordBox } from "@/modules/scan-studio/lib/analysis/words";
import type { Rect } from "@/modules/scan-studio/lib/geometry";
import type { PixelData } from "@/modules/scan-studio/lib/mask-color";
import { sanitizeRegions } from "@/modules/scan-studio/lib/sanitize-page";
import { DEFAULT_CHAPTER_SETTINGS, boundsOf } from "@/modules/scan-studio/lib/types";

// ─── Une page dessinée en mémoire ────────────────────────────────

/** Image RVBA unie, sur laquelle les tests posent des rectangles. */
function createPage(width: number, height: number, gray = 255): PixelData {
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
function letters(page: PixelData, x: number, y: number, count: number, gray = 20, size = { width: 12, height: 18 }): Box {
  let cursor = x;
  let end = x;
  for (let index = 0; index < count; index++) {
    fill(page, cursor, y, size.width, size.height, gray);
    end = cursor + size.width;
    cursor = end + (index % 4 === 3 ? 10 : 4);
  }
  return { x0: x, y0: y, x1: end, y1: y + size.height };
}

function bitmapOf(page: PixelData): Bitmap {
  return toBitmap(page, 1);
}

const limits = { minSize: 6, maxWidth: 150, maxHeight: 120 };

/** Lecteur de page factice : rend les pixels de la page et, à la lecture, ce que `answer` décide. */
function fakeReader(page: PixelData, answer: (rect: Rect, options: ReadOptions) => WordBox[]) {
  const calls: { rect: Rect; options: ReadOptions }[] = [];
  const reader: PageReader = {
    size: { width: page.width, height: page.height },
    async read(rect, options, onProgress) {
      calls.push({ rect, options });
      onProgress?.(1);
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

/** Mots d'une lecture factice : une ligne par entrée, dans l'espace de l'image lue. */
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

const inside = (rect: Rect, box: Box) => rect.x <= box.x0 && rect.y <= box.y0 && rect.x + rect.width >= box.x1 && rect.y + rect.height >= box.y1;

let counter = 0;
const createId = () => `auto${String(++counter).padStart(8, "0")}`;

// ─── Repérage par les pixels ─────────────────────────────────────

describe("niveaux de gris", () => {
  it("convertit en luminance et réduit par moyenne", () => {
    const page = createPage(4, 2, 255);
    fill(page, 0, 0, 2, 2, 0);
    expect(Array.from(toBitmap(page, 1).data)).toEqual([0, 0, 255, 255, 0, 0, 255, 255]);
    const reduced = toBitmap(page, 2);
    expect([reduced.width, reduced.height]).toEqual([2, 1]);
    expect(Array.from(reduced.data)).toEqual([0, 255]);
  });

  it("compte un pixel transparent comme du blanc", () => {
    const page = createPage(1, 1, 0);
    page.data[3] = 0;
    expect(toBitmap(page).data[0]).toBe(255);
  });

  it("suit le blanc de la page pour fixer les seuils de fond", () => {
    expect(backgroundThresholds(bitmapOf(createPage(40, 40, 255)))).toEqual({ light: 200, dark: 90 });
    // Un scan jauni : le papier est plus sombre, le seuil descend avec lui.
    expect(backgroundThresholds(bitmapOf(createPage(40, 40, 215))).light).toBe(175);
    expect(backgroundThresholds(bitmapOf(createPage(40, 40, 0)))).toEqual({ light: 140, dark: 40 });
  });
});

describe("taches d'encre", () => {
  it("trouve les lettres sombres sur fond clair", () => {
    const page = createPage(300, 100);
    letters(page, 40, 40, 5);
    const { glyphs } = findGlyphs(bitmapOf(page), "dark", 200, limits);
    expect(glyphs).toHaveLength(5);
    expect(glyphs[0]).toEqual({ x0: 40, y0: 40, x1: 52, y1: 58 });
  });

  it("trouve les lettres claires sur fond sombre", () => {
    const page = createPage(300, 100, 17);
    letters(page, 40, 40, 5, 255);
    expect(findGlyphs(bitmapOf(page), "light", 90, limits).glyphs).toHaveLength(5);
    expect(findGlyphs(bitmapOf(page), "dark", 200, limits).glyphs).toHaveLength(0);
  });

  it("rend à part les taches trop petites pour une lettre", () => {
    const page = createPage(300, 100);
    letters(page, 40, 40, 3);
    fill(page, 100, 54, 4, 4, 20);
    fill(page, 108, 54, 4, 4, 20);
    const ink = findGlyphs(bitmapOf(page), "dark", 200, limits);
    expect(ink.glyphs).toHaveLength(3);
    expect(ink.marks).toHaveLength(2);
  });

  it("écarte ce qui est trop grand, trop pâle ou collé au bord", () => {
    const page = createPage(400, 300);
    fill(page, 20, 20, 300, 4, 20); // un bord de case
    fill(page, 60, 80, 12, 18, 170); // un gris pâle
    fill(page, 0, 150, 12, 18, 20); // collé au bord de l'image
    fill(page, 200, 150, 12, 18, 20); // une lettre
    const { glyphs } = findGlyphs(bitmapOf(page), "dark", 200, limits);
    expect(glyphs).toEqual([{ x0: 200, y0: 150, x1: 212, y1: 168 }]);
  });

  it("écarte un trait fin en diagonale", () => {
    const page = createPage(200, 200);
    for (let step = 0; step < 60; step++) fill(page, 40 + step, 40 + step, 1, 1, 20);
    expect(findGlyphs(bitmapOf(page), "dark", 200, limits).glyphs).toHaveLength(0);
  });

  it("écarte une tache qui entoure des lettres : une petite bulle n'est pas une lettre", () => {
    const page = createPage(300, 200);
    // Un cadre de 100 × 60, trait de 3 px, avec quatre lettres dedans.
    fill(page, 50, 50, 100, 3, 20);
    fill(page, 50, 107, 100, 3, 20);
    fill(page, 50, 50, 3, 60, 20);
    fill(page, 147, 50, 3, 60, 20);
    letters(page, 64, 70, 4);
    const { glyphs } = findGlyphs(bitmapOf(page), "dark", 200, limits);
    expect(glyphs).toHaveLength(4);
  });
});

describe("inclinaison d'une ligne de lettres", () => {
  const row = (slope: number): Box[] => Array.from({ length: 6 }, (_, index) => ({ x0: index * 20, y0: index * 20 * slope, x1: index * 20 + 12, y1: index * 20 * slope + 18 }));

  it("vaut zéro pour une ligne droite ou trop courte", () => {
    expect(estimateAngle(row(0))).toBeCloseTo(0, 5);
    expect(estimateAngle(row(0.5).slice(0, 3))).toBe(0);
  });

  it("suit la pente des lettres", () => {
    expect(estimateAngle(row(Math.tan((8 * Math.PI) / 180)))).toBeCloseTo(8, 3);
    expect(estimateAngle(row(-Math.tan((25 * Math.PI) / 180)))).toBeCloseTo(-25, 3);
  });
});

describe("zones candidates", () => {
  const page = { width: 600, height: 800 };
  const glyphRow = (x: number, y: number, count: number, height = 18): Box[] =>
    Array.from({ length: count }, (_, index) => ({ x0: x + index * 16, y0: y, x1: x + index * 16 + 12, y1: y + height }));

  it("réunit les lettres d'une bulle en une candidate", () => {
    const candidates = groupGlyphs([...glyphRow(100, 100, 8), ...glyphRow(110, 130, 6), ...glyphRow(400, 100, 5)], "dark", page);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ x0: 100, y0: 100, y1: 148, glyphs: 14, lineHeight: 18, polarity: "dark", angle: 0 });
    expect(candidates[1].glyphs).toBe(5);
  });

  it("écarte une tache seule et un lettrage trop petit pour être lu", () => {
    expect(groupGlyphs(glyphRow(100, 100, 1), "dark", page)).toHaveLength(0);
    expect(groupGlyphs(glyphRow(100, 100, 6, 2), "dark", page)).toHaveLength(0);
  });

  it("reconnaît un texte couché : des lettres empilées une à une", () => {
    const stacked: Box[] = Array.from({ length: 5 }, (_, index) => ({ x0: 100, y0: 100 + index * 50, x1: 170, y1: 140 + index * 50 }));
    expect(groupGlyphs(stacked, "dark", page)[0].angle).toBe(90);
  });

  it("mesure l'inclinaison d'une ligne penchée", () => {
    const tilted = glyphRow(100, 100, 8).map((glyph, index) => ({ ...glyph, y0: glyph.y0 - index * 2, y1: glyph.y1 - index * 2 }));
    expect(groupGlyphs(tilted, "dark", page)[0].angle).toBeCloseTo(-7.1, 0);
  });

  const candidate = (overrides: Partial<Candidate>): Candidate => ({ x0: 100, y0: 100, x1: 300, y1: 122, lineHeight: 22, glyphs: 10, polarity: "dark", angle: 0, ...overrides });

  it("écarte l'écho d'une candidate dans l'autre lecture de l'image", () => {
    const text = candidate({});
    // Les creux des lettres, vus comme des taches claires, plus petites.
    const hollows = candidate({ x0: 110, y0: 104, x1: 290, y1: 116, lineHeight: 10, glyphs: 5, polarity: "light" });
    const elsewhere = candidate({ x0: 100, y0: 400, x1: 300, y1: 422, polarity: "light" });
    expect(dropEchoes([text, hollows, elsewhere])).toEqual([text, elsewhere]);
  });

  it("garde deux candidates superposées de même lecture", () => {
    const pair = [candidate({}), candidate({ x0: 120, lineHeight: 10 })];
    expect(dropEchoes(pair)).toEqual(pair);
  });

  it("étend une candidate à ses points de suspension", () => {
    const dots: Box[] = [0, 1, 2].map((index) => ({ x0: 304 + index * 8, y0: 116, x1: 308 + index * 8, y1: 120 }));
    expect(absorbMarks(candidate({}), dots)).toMatchObject({ x0: 100, x1: 324 });
  });

  it("n'annexe ni un grain éloigné, ni un grain hors de ses lignes, ni une trame", () => {
    const text = candidate({});
    expect(absorbMarks(text, [{ x0: 340, y0: 116, x1: 344, y1: 120 }])).toBe(text);
    expect(absorbMarks(text, [{ x0: 304, y0: 200, x1: 308, y1: 204 }])).toBe(text);
    const screen: Box[] = Array.from({ length: 30 }, (_, index) => ({ x0: 304 + index * 6, y0: 110, x1: 307 + index * 6, y1: 113 }));
    expect(absorbMarks(text, screen)).toBe(text);
  });
});

describe("tranches d'une bande", () => {
  it("garde une page ordinaire d'un seul tenant", () => {
    expect(sliceTiles({ width: 1200, height: 1700 })).toEqual([{ x: 0, y: 0, width: 1200, height: 1700 }]);
    expect(sliceTiles({ width: 800, height: 4000 })).toHaveLength(1);
  });

  it("découpe une bande en tranches qui se recouvrent et la couvrent toute", () => {
    const tiles = sliceTiles({ width: 800, height: 7000 });
    expect(tiles.map((tile) => [tile.y, tile.height])).toEqual([
      [0, 3200],
      [2720, 3200],
      [5440, 1560],
    ]);
    const huge = sliceTiles({ width: 800, height: 21000 });
    const last = huge[huge.length - 1];
    expect(last.y + last.height).toBe(21000);
    for (let index = 1; index < huge.length; index++) expect(huge[index].y).toBeLessThan(huge[index - 1].y + huge[index - 1].height);
  });

  it("écarte une boîte coupée par le bord d'une tranche et dédoublonne le recouvrement", () => {
    const page = { width: 800, height: 7000 };
    const [first, second] = sliceTiles(page);
    const whole = { x0: 100, y0: 2900, x1: 300, y1: 2930, text: "WHOLE", confidence: 0.9 };
    const cut = { x0: 100, y0: 3180, x1: 300, y1: 3200, text: "CU", confidence: 0.9 };
    const merged = mergeTiles(
      [
        { rect: first, boxes: [whole, cut] },
        { rect: second, boxes: [{ ...whole, confidence: 0.97 }, { ...cut, y1: 3210, text: "CUT" }] },
      ],
      page,
      (candidate, kept) => candidate.confidence > kept.confidence,
    );
    expect(merged.map((entry) => [entry.text, entry.confidence])).toEqual([
      ["WHOLE", 0.97],
      ["CUT", 0.9],
    ]);
  });

  it("garde les doublons quand on le lui demande", () => {
    const page = { width: 800, height: 7000 };
    const [first, second] = sliceTiles(page);
    const mark = { x0: 100, y0: 2900, x1: 104, y1: 2904 };
    expect(mergeTiles([{ rect: first, boxes: [mark] }, { rect: second, boxes: [mark] }], page, "keep-all")).toHaveLength(2);
  });

  it("ramène en pixels de la page les boîtes lues sur un rectangle agrandi", () => {
    const [word] = toPageWords([{ text: "HI", confidence: 0.9, x0: 20, y0: 40, x1: 60, y1: 80 }], { x: 100, y: 200, width: 300, height: 300 }, 2);
    expect(word).toMatchObject({ x0: 110, y0: 220, x1: 130, y1: 240, text: "HI" });
  });
});

describe("confiance d'une zone", () => {
  it("se place à mi-chemin entre la moyenne et le mot le moins sûr", () => {
    expect(blendConfidence(0.9, 0.5)).toBeCloseTo(0.7, 5);
    expect(blendConfidence(0.96, 0.96)).toBeCloseTo(0.96, 5);
    expect(blendConfidence(0.6, 0.9)).toBeCloseTo(0.6, 5);
  });
});

// ─── La chaîne entière, avec un lecteur factice ──────────────────

describe("analyse d'une page", () => {
  /**
   * Une page de 600 × 800 : deux bulles en haut, un cartouche noir en bas, et
   * deux taches du dessin côte à côte, trop peu pour faire une candidate.
   */
  function drawPage() {
    const page = createPage(600, 800);
    const left = letters(page, 60, 100, 8);
    letters(page, 70, 130, 6);
    const right = letters(page, 380, 110, 7);
    fill(page, 60, 600, 400, 90, 17);
    const caption = letters(page, 90, 630, 12, 255);
    const blobs = letters(page, 300, 380, 2);
    return { page, left, right, caption, blobs };
  }

  function answerFor(scene: ReturnType<typeof drawPage>) {
    return (rect: Rect): WordBox[] => {
      if (inside(rect, scene.left)) return reading(["WHERE DID YOU", "FIND THIS MAP?"]);
      if (inside(rect, scene.right)) return reading(["IN THE OLD LIBRARY."]);
      if (inside(rect, scene.caption)) return reading(["THREE HOURS LATER..."], 0.7);
      if (inside(rect, scene.blobs)) return reading(["Za"], 0.5);
      return [];
    };
  }

  it("repère les candidates par les pixels", () => {
    const scene = drawPage();
    const { reader } = fakeReader(scene.page, () => []);
    const candidates = detectCandidates(reader);
    expect(candidates.map((candidate) => [candidate.polarity, candidate.glyphs])).toEqual([
      ["dark", 14],
      ["light", 12],
      ["dark", 7],
    ]);
    // Le cartouche noir est une plage fermée : son texte y est rattaché. Le papier n'en est pas une.
    expect(candidates.map((candidate) => candidate.container !== undefined)).toEqual([false, true, false]);
  });

  it("rend les zones lues, dans l'ordre du format, prêtes pour l'atelier", async () => {
    const scene = drawPage();
    const { reader, calls } = fakeReader(scene.page, answerFor(scene));
    const regions = await analyzeWithReader(reader, { ...DEFAULT_CHAPTER_SETTINGS, format: "manga" }, { createId });

    expect(regions.map((region) => region.reading.clean)).toEqual(["In the old library.", "Where did you find this map?", "Three hours later..."]);
    expect(regions.map((region) => region.kind)).toEqual(["dialogue", "dialogue", "narration"]);
    expect(regions.map((region) => region.mask.color)).toEqual(["#ffffff", "#ffffff", "#111111"]);
    expect(regions.every((region) => region.reading.engine === "tesseract" && !region.reading.edited)).toBe(true);
    expect(regions[1].reading.raw).toBe("WHERE DID YOU\nFIND THIS MAP?");
    expect(regions[2].reading.confidence).toBeCloseTo(0.7, 5);

    // Le contour entoure les lettres repérées, avec une marge.
    const bounds = boundsOf(regions[1].outline);
    expect(bounds.x).toBeLessThan(scene.left.x0);
    expect(bounds.y).toBeLessThan(scene.left.y0);
    expect(bounds.x + bounds.width).toBeGreaterThan(scene.left.x1 - 12);
    expect(bounds.y + bounds.height).toBeGreaterThan(148);
    expect(regions[1].text.box).toEqual({ ...bounds, rotation: 0 });

    // Chaque candidate est lue seule, agrandie ; le texte clair est inversé.
    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.options.mode === "block" && call.options.scale > 1)).toBe(true);
    expect(calls.filter((call) => call.options.invert)).toHaveLength(1);
    expect(inside(calls.find((call) => call.options.invert)!.rect, scene.caption)).toBe(true);

    // Ce que le serveur accepte tel quel.
    expect(sanitizeRegions(regions, reader.size)).toEqual(regions);
  });

  it("range les mêmes zones autrement pour un manhua", async () => {
    const scene = drawPage();
    const { reader } = fakeReader(scene.page, answerFor(scene));
    const regions = await analyzeWithReader(reader, { ...DEFAULT_CHAPTER_SETTINGS, format: "manhua" }, { createId });
    expect(regions.map((region) => region.reading.clean)).toEqual(["Where did you find this map?", "In the old library.", "Three hours later..."]);
  });

  it("garde un mot peu sûr dans une bulle, et baisse la confiance de la zone", async () => {
    const scene = drawPage();
    const { reader } = fakeReader(scene.page, (rect) => {
      if (!inside(rect, scene.right)) return [];
      const words = reading(["WILL ILYA FOLLOW US?"]);
      words[1].confidence = 0.15;
      return words;
    });
    const [region] = await analyzeWithReader(reader, DEFAULT_CHAPTER_SETTINGS, { createId });
    expect(region.reading.raw).toBe("WILL ILYA FOLLOW US?");
    expect(region.reading.confidence).toBeLessThan(0.6);
  });

  it("annonce un avancement croissant, de 0 à 1", async () => {
    const scene = drawPage();
    const { reader } = fakeReader(scene.page, answerFor(scene));
    const seen: number[] = [];
    await analyzeWithReader(reader, DEFAULT_CHAPTER_SETTINGS, { createId, onProgress: (progress) => seen.push(progress) });
    expect(seen[0]).toBe(0);
    expect(seen[seen.length - 1]).toBe(1);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it("s'arrête quand le signal est interrompu", async () => {
    const scene = drawPage();
    const controller = new AbortController();
    const { reader, calls } = fakeReader(scene.page, (rect) => {
      controller.abort();
      return answerFor(scene)(rect);
    });
    await expect(analyzeWithReader(reader, DEFAULT_CHAPTER_SETTINGS, { createId, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toHaveLength(1);

    const aborted = new AbortController();
    aborted.abort();
    const untouched = fakeReader(scene.page, answerFor(scene));
    await expect(analyzeWithReader(untouched.reader, DEFAULT_CHAPTER_SETTINGS, { createId, signal: aborted.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(untouched.calls).toHaveLength(0);
  });

  it("redresse un texte penché avant de le lire", async () => {
    const page = createPage(600, 400);
    for (let index = 0; index < 8; index++) fill(page, 100 + index * 30, 250 - index * 6, 20, 30, 20);
    const { reader, calls } = fakeReader(page, () => reading(["CRASH"]));
    const [region] = await analyzeWithReader(reader, DEFAULT_CHAPTER_SETTINGS, { createId });
    expect(calls[0].options.rotate).toBeCloseTo(11.3, 0);
    expect(region.kind).toBe("sfx");
    expect(region.mask.kind).toBe("none");
  });

  it("essaie les deux sens pour un texte couché", async () => {
    const page = createPage(300, 600);
    for (let index = 0; index < 5; index++) fill(page, 100, 100 + index * 70, 60, 50, 20);
    const { reader, calls } = fakeReader(page, (_rect, options) => (options.rotate === 90 ? reading(["RUMBLE"]) : []));
    const [region] = await analyzeWithReader(reader, DEFAULT_CHAPTER_SETTINGS, { createId });
    expect(calls.map((call) => call.options.rotate)).toEqual([-90, 90]);
    expect(region.reading.raw).toBe("RUMBLE");
    expect(region.kind).toBe("sfx");
  });

  it("lit la page entière en dernier recours quand aucune lettre n'est repérée", async () => {
    const page = createPage(600, 800, 150);
    const { reader, calls } = fakeReader(page, (_rect, options) =>
      options.mode === "sparse"
        ? [
            { text: "ONLY", confidence: 0.9, x0: 200, y0: 300, x1: 280, y1: 330 },
            { text: "HERE", confidence: 0.9, x0: 290, y0: 300, x1: 370, y1: 330 },
            { text: "|", confidence: 0.9, x0: 700, y0: 300, x1: 704, y1: 330 },
          ]
        : [],
    );
    const regions = await analyzeWithReader(reader, DEFAULT_CHAPTER_SETTINGS, { createId });
    expect(calls).toHaveLength(1);
    expect(calls[0].options).toMatchObject({ mode: "sparse", invert: false, rotate: 0 });
    // Une petite page est agrandie pour la lecture : les boîtes reviennent en pixels de la page.
    expect(calls[0].options.scale).toBe(2);
    expect(regions).toHaveLength(1);
    expect(regions[0].reading.clean).toBe("Only here");
    // Le mot commence à 200 px de l'image lue, donc à 100 px de la page, moins la marge du contour.
    expect(boundsOf(regions[0].outline)).toMatchObject({ x: 95, y: 145 });
  });

  it("ne rend rien pour une page sans texte", async () => {
    const { reader } = fakeReader(createPage(600, 800), () => []);
    expect(await analyzeWithReader(reader, DEFAULT_CHAPTER_SETTINGS, { createId })).toEqual([]);
  });
});
