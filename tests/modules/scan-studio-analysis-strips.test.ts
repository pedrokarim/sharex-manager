import { describe, expect, it } from "vitest";
import {
  absorbColumnMarks,
  analyzeWithReader,
  candidateLimit,
  detectCandidates,
  detectCandidatesByTile,
  dropEchoes,
  frameRects,
  rubyRects,
  sliceTiles,
  type Candidate,
  type PageReader,
  type ReadOptions,
} from "@/modules/scan-studio/lib/analysis/pipeline";
import { rowDirection, sortByReadingOrder } from "@/modules/scan-studio/lib/analysis/reading-order";
import type { Box, WordBox } from "@/modules/scan-studio/lib/analysis/words";
import type { Rect } from "@/modules/scan-studio/lib/geometry";
import type { PixelData } from "@/modules/scan-studio/lib/mask-color";
import { DEFAULT_CHAPTER_SETTINGS, boundsOf, type ChapterSettings } from "@/modules/scan-studio/lib/types";

// Pages dessinées en mémoire et phrases inventées : aucun moteur, aucun navigateur.

const GREY = 120;
const SIGN = 28;

/** Image RVBA unie : un gris moyen, le fond d'une case tramée. */
function createPage(width: number, height: number, gray = GREY): PixelData {
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

/** Une bulle : un rectangle blanc sur le gris de la case. */
function bubble(page: PixelData, box: Box) {
  fill(page, box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0, 255);
}

/** Une colonne de signes pleins, de haut en bas : des carrés de 28 px séparés de 2 px. */
function column(page: PixelData, x: number, y: number, count: number): Box {
  for (let index = 0; index < count; index++) fill(page, x, y + index * (SIGN + 2), SIGN, SIGN, 20);
  return { x0: x, y0: y, x1: x + SIGN, y1: y + count * (SIGN + 2) - 2 };
}

/** Une ligne de signes pleins, de gauche à droite. */
function row(page: PixelData, x: number, y: number, count: number): Box {
  for (let index = 0; index < count; index++) fill(page, x + index * (SIGN + 2), y, SIGN, SIGN, 20);
  return { x0: x, y0: y, x1: x + count * (SIGN + 2) - 2, y1: y + SIGN };
}

/** Lecteur de page factice : rend les pixels de la page et, à la lecture, ce que `answer` décide. */
function fakeReader(page: PixelData, answer: (rect: Rect, options: ReadOptions, call: number) => WordBox[]) {
  const calls: { rect: Rect; options: ReadOptions }[] = [];
  const pixelCalls: Rect[] = [];
  const reader: PageReader = {
    size: { width: page.width, height: page.height },
    async read(rect, options) {
      calls.push({ rect, options });
      return answer(rect, options, calls.length);
    },
    pixels(rect) {
      pixelCalls.push(rect);
      const x = Math.max(0, Math.floor(rect.x));
      const y = Math.max(0, Math.floor(rect.y));
      const width = Math.min(page.width - x, Math.ceil(rect.x + rect.width) - x);
      const height = Math.min(page.height - y, Math.ceil(rect.y + rect.height) - y);
      const data = new Uint8ClampedArray(width * height * 4);
      for (let line = 0; line < height; line++) {
        const start = ((y + line) * page.width + x) * 4;
        data.set(page.data.subarray(start, start + width * 4), line * width * 4);
      }
      return { pixels: { data, width, height }, offset: { x, y } };
    },
  };
  return { reader, calls, pixelCalls };
}

/** Mots d'une lecture factice : une ligne (ou une colonne) par entrée, dans l'ordre du moteur. */
function reading(lines: string[][], confidence = 0.95): WordBox[] {
  return lines.flatMap((words, line) =>
    words.map((text, index) => ({ text, confidence, x0: 10, y0: 10 + index * 40, x1: 40, y1: 40 + index * 40, line, spaced: index > 0 && text.startsWith(" ") })),
  ).map((word) => ({ ...word, text: word.text.trim() }));
}

const settings = (sourceLanguage: ChapterSettings["sourceLanguage"], format: ChapterSettings["format"]): ChapterSettings => ({ ...DEFAULT_CHAPTER_SETTINGS, sourceLanguage, format });

const korean = { writing: { prefer: "horizontal" as const, ruby: false } };
const japanese = { writing: { prefer: "vertical" as const, ruby: true } };

const covers = (outer: Box, inner: Box) => outer.x0 <= inner.x0 && outer.y0 <= inner.y0 && outer.x1 >= inner.x1 && outer.y1 >= inner.y1;

let counter = 0;
const createId = () => `strip${String(++counter).padStart(7, "0")}`;

// ─── Ordre de lecture ────────────────────────────────────────────

describe("ordre de lecture par format", () => {
  const box = (x0: number, y0: number, x1: number, y1: number, name: string) => ({ x0, y0, x1, y1, name });
  const names = (items: { name: string }[]) => items.map((item) => item.name);

  it("lit une rangée de droite à gauche en manga, de gauche à droite ailleurs", () => {
    expect(rowDirection("manga")).toBe("rtl");
    expect(rowDirection("manhua")).toBe("ltr");
    expect(rowDirection("webtoon")).toBe("ltr");
  });

  it("range une page de manga : rangées de haut en bas, chacune de droite à gauche", () => {
    const zones = [box(100, 100, 300, 300, "haut gauche"), box(900, 120, 1100, 320, "haut droite"), box(500, 90, 700, 290, "haut milieu"), box(880, 700, 1100, 900, "bas droite"), box(100, 720, 300, 920, "bas gauche")];
    expect(names(sortByReadingOrder(zones, "manga"))).toEqual(["haut droite", "haut milieu", "haut gauche", "bas droite", "bas gauche"]);
    expect(names(sortByReadingOrder(zones, "manhua"))).toEqual(["haut gauche", "haut milieu", "haut droite", "bas gauche", "bas droite"]);
  });

  it("range une bande de webtoon de haut en bas, où que soient les bulles dans la largeur", () => {
    const zones = [box(500, 900, 700, 1000, "troisième"), box(100, 400, 300, 500, "deuxième"), box(450, 100, 650, 200, "première"), box(120, 5200, 320, 5300, "dernière")];
    expect(names(sortByReadingOrder(zones, "webtoon"))).toEqual(["première", "deuxième", "troisième", "dernière"]);
  });

  it("lit de gauche à droite deux bulles de webtoon vraiment côte à côte", () => {
    // Celle de droite commence dix pixels plus haut : sans rangée, elle passerait d'abord.
    const side = [box(500, 290, 700, 390, "droite"), box(100, 300, 300, 400, "gauche")];
    expect(names(sortByReadingOrder(side, "webtoon"))).toEqual(["gauche", "droite"]);
  });

  it("ne fait pas une rangée de deux bulles de webtoon décalées de moitié", () => {
    // Une page de manhua les lirait de gauche à droite ; une bande les lit en descendant.
    const shifted = [box(100, 350, 300, 450, "gauche, plus bas"), box(500, 300, 700, 400, "droite, plus haut")];
    expect(names(sortByReadingOrder(shifted, "webtoon"))).toEqual(["droite, plus haut", "gauche, plus bas"]);
    expect(names(sortByReadingOrder(shifted, "manhua"))).toEqual(["gauche, plus bas", "droite, plus haut"]);
  });
});

// ─── Bandes hautes ───────────────────────────────────────────────

describe("bande de webtoon découpée en tranches", () => {
  /**
   * Une bande de 600 × 7000 : trois tranches (0 à 3200, 2720 à 5920, 5440 à
   * 7000). Une bulle est posée sur le bas de la première, une ligne de signes
   * coupée par ce bord ; une autre tient dans le recouvrement, vue deux fois.
   */
  function drawStrip() {
    const page = createPage(600, 7000);
    const cut = { x0: 150, y0: 3110, x1: 450, y1: 3300 };
    bubble(page, cut);
    const cutText = [row(page, 180, 3130, 7), row(page, 180, 3186, 7), row(page, 180, 3242, 5)];
    const twice = { x0: 100, y0: 2800, x1: 400, y1: 2960 };
    bubble(page, twice);
    const twiceText = [row(page, 130, 2830, 6), row(page, 130, 2886, 4)];
    const alone = { x0: 200, y0: 6200, x1: 500, y1: 6360 };
    bubble(page, alone);
    const aloneText = [row(page, 230, 6230, 6), row(page, 230, 6286, 5)];
    return { page, cut, cutText, twice, twiceText, alone, aloneText };
  }

  const union = (boxes: Box[]): Box => ({ x0: Math.min(...boxes.map((b) => b.x0)), y0: Math.min(...boxes.map((b) => b.y0)), x1: Math.max(...boxes.map((b) => b.x1)), y1: Math.max(...boxes.map((b) => b.y1)) });

  it("découpe la bande en tranches de 3200 px qui se recouvrent de 480 px", () => {
    const tiles = sliceTiles({ width: 600, height: 7000 });
    expect(tiles.map((tile) => [tile.y, tile.height])).toEqual([[0, 3200], [2720, 3200], [5440, 1560]]);
    // La plus haute bande que le module accepte : vingt mille pixels.
    const tallest = sliceTiles({ width: 800, height: 20000 });
    expect(tallest).toHaveLength(8);
    expect(Math.max(...tallest.map((tile) => tile.height))).toBe(3200);
    expect(tallest[tallest.length - 1].y + tallest[tallest.length - 1].height).toBe(20000);
  });

  it("trouve une fois, et entière, une bulle coupée par le bord d'une tranche", () => {
    const scene = drawStrip();
    const { reader } = fakeReader(scene.page, () => []);
    const candidates = detectCandidates(reader, korean);
    expect(candidates).toHaveLength(3);
    const onEdge = candidates.filter((candidate) => candidate.y0 < 3200 && candidate.y1 > 3200);
    expect(onEdge).toHaveLength(1);
    // Les trois lignes y sont, y compris celle que le bord coupe.
    expect(covers(onEdge[0], union(scene.cutText))).toBe(true);
    expect(onEdge[0].glyphs).toBe(19);
    expect(onEdge[0].container).toBeDefined();
    expect(onEdge[0].direction).toBe("horizontal");
  });

  it("ne compte qu'une fois une bulle vue par deux tranches", () => {
    const scene = drawStrip();
    const { reader } = fakeReader(scene.page, () => []);
    const candidates = detectCandidates(reader, korean);
    const inOverlap = candidates.filter((candidate) => candidate.y0 >= 2720 && candidate.y1 <= 3200);
    expect(inOverlap).toHaveLength(1);
    expect(covers(inOverlap[0], union(scene.twiceText))).toBe(true);
    expect(inOverlap[0].glyphs).toBe(10);
  });

  it("ne demande jamais plus d'une tranche de pixels à la fois pour le repérage", () => {
    const scene = drawStrip();
    const { reader, pixelCalls } = fakeReader(scene.page, () => []);
    detectCandidates(reader, korean);
    expect(pixelCalls.slice(0, 3).map((rect) => [rect.y, rect.height])).toEqual([[0, 3200], [2720, 3200], [5440, 1560]]);
    expect(Math.max(...pixelCalls.map((rect) => rect.height))).toBe(3200);
  });

  it("annonce chaque tranche avant de la traiter, puis la fin", () => {
    const scene = drawStrip();
    const { reader } = fakeReader(scene.page, () => []);
    const seen: [number, number][] = [];
    detectCandidates(reader, { ...korean, onTile: (done, total) => seen.push([done, total]) });
    expect(seen).toEqual([[0, 3], [1, 3], [2, 3], [3, 3]]);
  });

  it("rend le même repérage en rendant la main entre deux tranches", async () => {
    const scene = drawStrip();
    const { reader } = fakeReader(scene.page, () => []);
    const direct = detectCandidates(reader, korean);
    const byTile = await detectCandidatesByTile(reader, korean);
    expect(byTile).toEqual(direct);
  });

  it("s'arrête entre deux tranches quand le signal est interrompu", async () => {
    const scene = drawStrip();
    const { reader, pixelCalls } = fakeReader(scene.page, () => []);
    const controller = new AbortController();
    const pending = detectCandidatesByTile(reader, { ...korean, onTile: (done) => done === 1 && controller.abort() }, controller.signal);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    // Seule la première tranche a été lue.
    expect(pixelCalls).toHaveLength(1);
  });

  it("laisse plus de zones à une bande qu'à une page, sans dépasser le plafond d'une page", () => {
    expect(candidateLimit(1)).toBe(80);
    expect(candidateLimit(3)).toBe(240);
    expect(candidateLimit(8)).toBe(400);
    expect(candidateLimit(0)).toBe(80);
  });

  it("lit la bande entière, dans l'ordre d'une bande, avec un avancement croissant", async () => {
    const scene = drawStrip();
    const inside = (rect: Rect, box: Box) => rect.x <= box.x0 && rect.y <= box.y0 && rect.x + rect.width >= box.x1 && rect.y + rect.height >= box.y1;
    const { reader, calls } = fakeReader(scene.page, (rect) => {
      if (inside(rect, union(scene.twiceText))) return reading([["오늘은", " 바람이"], ["정말", " 세네."]]);
      if (inside(rect, union(scene.cutText))) return reading([["역", " 앞", " 가게에서"], ["기다릴게."]]);
      if (inside(rect, union(scene.aloneText))) return reading([["문이", " 잠겨", " 있어."]]);
      return [];
    });
    const ticks: number[] = [];
    const regions = await analyzeWithReader(reader, settings("ko", "webtoon"), { createId, onProgress: (value) => ticks.push(value) });
    expect(regions.map((region) => region.reading.clean)).toEqual(["오늘은 바람이 정말 세네.", "역 앞 가게에서 기다릴게.", "문이 잠겨 있어."]);
    expect(regions.every((region) => region.direction === "horizontal")).toBe(true);
    expect(calls.every((call) => call.options.mode === "block")).toBe(true);
    // Une zone à cheval sur le bord garde sa place dans la page.
    const bounds = boundsOf(regions[1].outline);
    expect(bounds.y).toBeLessThan(3200);
    expect(bounds.y + bounds.height).toBeGreaterThan(3200);
    // L'avancement monte pendant le repérage, tranche par tranche, puis pendant la lecture.
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(1);
    expect(ticks.every((value, index) => index === 0 || value >= ticks[index - 1])).toBe(true);
    expect(ticks.filter((value) => value > 0 && value < 0.1).length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Texte en colonnes, de bout en bout ──────────────────────────

describe("analyse d'une page japonaise", () => {
  /**
   * Une bulle blanche de 600 × 800 : deux colonnes lues de droite à gauche, et
   * trois furigana de 12 px contre la première. Plus bas, une bulle en lignes.
   */
  function drawPage() {
    const page = createPage(600, 800);
    const vertical = { x0: 200, y0: 90, x1: 340, y1: 320 };
    bubble(page, vertical);
    const first = column(page, 280, 110, 6);
    const second = column(page, 236, 110, 5);
    const ruby = [112, 126, 140].map((y) => {
      fill(page, 311, y, 12, 12, 20);
      return { x0: 311, y0: y, x1: 323, y1: y + 12 };
    });
    const horizontal = { x0: 60, y0: 500, x1: 330, y1: 620 };
    bubble(page, horizontal);
    const lines = [row(page, 80, 520, 7), row(page, 80, 566, 5)];
    return { page, vertical, first, second, ruby, horizontal, lines };
  }

  it("repère une bulle en colonnes et une bulle en lignes, furigana mis de côté", () => {
    const scene = drawPage();
    const { reader } = fakeReader(scene.page, () => []);
    const candidates = detectCandidates(reader, japanese);
    expect(candidates.map((candidate) => [candidate.direction, candidate.glyphs])).toEqual([
      ["horizontal", 12],
      ["vertical", 11],
    ]);
    const columns = candidates[1];
    // Les deux colonnes font une seule zone ; sa taille de lettrage est la largeur d'une colonne.
    expect(covers(columns, scene.first) && covers(columns, scene.second)).toBe(true);
    expect(columns.lineHeight).toBe(SIGN);
    // Les furigana sont dans la boîte (pour le masque) et notés à part (pour la lecture).
    expect(columns.ruby).toHaveLength(3);
    expect(columns.x1).toBe(323);
    expect(candidates[0].ruby).toBeUndefined();
  });

  it("lit les colonnes avec le modèle des colonnes, dans l'ordre du moteur, sans les furigana", async () => {
    const scene = drawPage();
    const { reader, calls } = fakeReader(scene.page, (_rect, options) =>
      options.mode === "vertical" ? reading([["今日", "は", "雨", "だ", "。"], ["傘", "を", "忘れ", "た", "。"]]) : reading([["駅前", "の", "店", "で"], ["待っ", "て", "いる", "よ", "。"]]),
    );
    const regions = await analyzeWithReader(reader, settings("ja", "manga"), { createId });

    expect(regions.map((region) => [region.direction, region.reading.clean])).toEqual([
      ["vertical", "今日は雨だ。傘を忘れた。"],
      ["horizontal", "駅前の店で待っているよ。"],
    ]);
    expect(regions[0].reading.raw).toBe("今日は雨だ。\n傘を忘れた。");
    expect(regions.every((region) => region.kind === "dialogue" && region.reading.engine === "tesseract")).toBe(true);

    const vertical = calls.find((call) => call.options.mode === "vertical")!;
    expect(calls.filter((call) => call.options.mode === "vertical")).toHaveLength(1);
    expect(calls.filter((call) => call.options.mode === "block")).toHaveLength(1);
    // Jamais redressé ni couché : le modèle des colonnes lit la zone telle quelle.
    expect(vertical.options.rotate).toBe(0);
    expect(vertical.options.scale).toBeGreaterThan(1);
    // Chaque furigana est recouvert avant la lecture.
    for (const mark of scene.ruby) {
      expect(vertical.options.erase?.some((patch) => patch.x <= mark.x0 && patch.y <= mark.y0 && patch.x + patch.width >= mark.x1 && patch.y + patch.height >= mark.y1)).toBe(true);
    }
    // Le contour de la zone couvre les furigana : le masque les cachera avec le texte.
    const bounds = boundsOf(regions[0].outline);
    expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(323);
  });

  it("relit à une autre échelle une zone lue sans assurance, et garde la plus sûre", async () => {
    const scene = drawPage();
    const { reader, calls } = fakeReader(scene.page, (_rect, options, call) => {
      if (options.mode !== "vertical") return reading([["駅前", "の", "店", "で"]]);
      // Première lecture douteuse, seconde nette.
      return calls.filter((entry) => entry.options.mode === "vertical").length === 1 ? reading([["今目", "は", "雨", "だ"]], 0.5) : reading([["今日", "は", "雨", "だ", "。"]], 0.95 + call * 0);
    });
    const regions = await analyzeWithReader(reader, settings("ja", "manga"), { createId });
    const columns = calls.filter((call) => call.options.mode === "vertical");
    expect(columns).toHaveLength(2);
    expect(columns[0].options.scale).not.toBe(columns[1].options.scale);
    expect(regions[0].reading.clean).toBe("今日は雨だ。");
    expect(regions[0].reading.confidence).toBeCloseTo(0.95, 5);
    // La bulle en lignes, lue avec assurance, n'est lue qu'une fois.
    expect(calls.filter((call) => call.options.mode === "block")).toHaveLength(1);
  });

  it("garde un signe douteux, qui fait signaler la zone, et écarte des lettres latines lues au bord", async () => {
    const scene = drawPage();
    const { reader } = fakeReader(scene.page, (_rect, options) => {
      if (options.mode !== "vertical") return [];
      const words = reading([["今日", "は", "雨", "だ", "。"]]);
      return [{ ...words[0], text: "gs", confidence: 0.4, line: 0 }, ...words.slice(0, 2), { ...words[2], confidence: 0.2 }, ...words.slice(3)];
    });
    const regions = await analyzeWithReader(reader, settings("ja", "manga"), { createId });
    expect(regions).toHaveLength(1);
    expect(regions[0].reading.clean).toBe("今日は雨だ。");
    expect(regions[0].reading.confidence).toBeLessThan(0.8);
  });

  it("ne lit pas en colonnes une page réglée sur l'anglais", async () => {
    const scene = drawPage();
    const { reader, calls } = fakeReader(scene.page, () => reading([["WHERE", " DID", " YOU"]]));
    await analyzeWithReader(reader, settings("en", "manga"), { createId });
    expect(calls.every((call) => call.options.mode !== "vertical")).toBe(true);
  });
});

// ─── Pièces de la lecture ────────────────────────────────────────

describe("rectangles recouverts avant la lecture", () => {
  const candidate: Candidate = { x0: 100, y0: 100, x1: 200, y1: 300, lineHeight: 28, glyphs: 10, polarity: "dark", angle: 0, direction: "vertical" };
  const rect = { x: 80, y: 80, width: 140, height: 240 };

  it("recouvre tout ce qui dépasse le texte de plus d'un tiers de signe", () => {
    const frame = frameRects(candidate, rect);
    // Dix pixels gardés autour du texte, dix recouverts de chaque côté.
    expect(frame).toEqual([
      { x: 80, y: 80, width: 140, height: 10 },
      { x: 80, y: 310, width: 140, height: 10 },
      { x: 80, y: 80, width: 10, height: 240 },
      { x: 210, y: 80, width: 10, height: 240 },
    ]);
    // Un rectangle de lecture sans marge n'a rien à recouvrir.
    expect(frameRects(candidate, { x: 95, y: 95, width: 110, height: 210 })).toEqual([]);
  });

  it("ramène les furigana dans le rectangle lu", () => {
    const withRuby = { ...candidate, ruby: [{ x0: 190, y0: 110, x1: 200, y1: 122 }, { x0: 900, y0: 900, x1: 910, y1: 910 }] };
    expect(rubyRects(withRuby, rect)).toEqual([{ x: 189, y: 109, width: 12, height: 14 }]);
    expect(rubyRects(candidate, rect)).toEqual([]);
  });

  it("étend une zone en colonnes à la ponctuation posée au bout de ses colonnes", () => {
    const dot = { x0: 150, y0: 304, x1: 156, y1: 310 };
    const far = { x0: 150, y0: 420, x1: 156, y1: 426 };
    const beside = { x0: 230, y0: 200, x1: 236, y1: 206 };
    const grown = absorbColumnMarks(candidate, [dot, far, beside]);
    expect([grown.x0, grown.y0, grown.x1, grown.y1]).toEqual([100, 100, 200, 310]);
    expect(grown.direction).toBe("vertical");
  });

  it("ne laisse pas des formes du dessin effacer un texte tenu par sa bulle", () => {
    const container = { id: 1, polarity: "dark" as const, x0: 90, y0: 90, x1: 210, y1: 310, area: 20000, threshold: 200, factor: 1 };
    const text: Candidate = { ...candidate, container };
    const shapes: Candidate = { x0: 0, y0: 0, x1: 600, y1: 800, lineHeight: 250, glyphs: 12, polarity: "light", angle: 0 };
    // Règle ordinaire : le plus grand lettrage l'emporte.
    expect(dropEchoes([text, shapes])).toEqual([shapes]);
    // Signes pleins : le texte en bulle reste.
    expect(dropEchoes([text, shapes], true)).toEqual([text, shapes]);
  });
});
