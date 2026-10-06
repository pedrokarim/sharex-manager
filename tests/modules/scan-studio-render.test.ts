import { describe, expect, it } from "vitest";
import { rectToPolygon } from "@/modules/scan-studio/lib/geometry";
import {
  createRegion,
  duplicateRegion,
  neighbourId,
  patchStyle,
  removeRegion,
  setReadingText,
  setTranslationText,
  shiftRegion,
  updateRegion,
} from "@/modules/scan-studio/lib/region-edit";
import { fontOf, layoutRegion, renderPage } from "@/modules/scan-studio/lib/render";
import { sanitizeRegions } from "@/modules/scan-studio/lib/sanitize-page";
import type { TextLayout } from "@/modules/scan-studio/lib/text-layout";
import { DEFAULT_CHAPTER_SETTINGS, DEFAULT_MASK, type ScanRegion } from "@/modules/scan-studio/lib/types";

type Call = { name: string; args: unknown[]; state: Record<string, unknown> };

/**
 * Faux contexte 2D : il note chaque appel, avec les réglages en cours au
 * moment de l'appel. Les caractères font la moitié de la taille de la police.
 */
function createFakeContext() {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { font: "10px sans-serif", fillStyle: "#000000", strokeStyle: "#000000", lineWidth: 1, textAlign: "start" };
  const stack: Record<string, unknown>[] = [];
  const methods = [
    "drawImage", "fillRect", "beginPath", "closePath", "moveTo", "lineTo", "rect", "arcTo", "arc", "ellipse",
    "fill", "stroke", "translate", "rotate", "fillText", "strokeText",
  ];
  const target: Record<string, unknown> = {
    save: () => stack.push({ ...state }),
    restore: () => Object.assign(state, stack.pop()),
    measureText: (text: string) => {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? 10);
      return { width: Array.from(text).length * size * 0.5 };
    },
  };
  for (const name of methods) {
    target[name] = (...args: unknown[]) => calls.push({ name, args, state: { ...state } });
  }
  const ctx = new Proxy(target, {
    get: (object, key: string) => (key in object ? object[key] : state[key]),
    set: (_object, key: string, value) => {
      state[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, names: () => calls.map((call) => call.name) };
}

const page = { width: 400, height: 600 };
const image = {} as CanvasImageSource;
const outline = rectToPolygon({ x: 100, y: 100, width: 120, height: 80 });

function region(id: string, patch: Partial<ScanRegion> = {}): ScanRegion {
  return { ...createRegion(id, outline, "#fefefe"), ...patch };
}

describe("renderPage", () => {
  it("ne dessine que l'image dans la vue d'origine", () => {
    const fake = createFakeContext();
    renderPage(fake.ctx, page, image, [setTranslationText(region("a"), "Salut")], DEFAULT_CHAPTER_SETTINGS, { view: "original" });
    expect(fake.names()).toEqual(["drawImage"]);
    expect(fake.calls[0].args).toEqual([image, 0, 0, 400, 600]);
  });

  it("dessine l'image, puis tous les masques, puis tous les textes", () => {
    const fake = createFakeContext();
    const regions = [setTranslationText(region("a"), "Salut"), setTranslationText(region("b"), "Toi")];
    renderPage(fake.ctx, page, image, regions, DEFAULT_CHAPTER_SETTINGS, { view: "translated" });
    const order = fake.names().filter((name) => ["drawImage", "fill", "fillText"].includes(name));
    expect(order).toEqual(["drawImage", "fill", "fill", "fillText", "fillText"]);
    expect(fake.calls.find((call) => call.name === "fill")?.state.fillStyle).toBe("#fefefe");
  });

  it("écrit en capitales, dans la police du type de zone, au centre de la boîte", () => {
    const fake = createFakeContext();
    renderPage(fake.ctx, page, image, [setTranslationText(region("a"), "Salut")], DEFAULT_CHAPTER_SETTINGS, { view: "translated" });
    const text = fake.calls.find((call) => call.name === "fillText")!;
    expect(text.args[0]).toBe("SALUT");
    expect(text.args[1]).toBe(0);
    expect(String(text.state.font)).toMatch(/^700 [\d.]+px "Comic Neue", sans-serif$/);
    expect(text.state.textAlign).toBe("center");
    expect(text.state.fillStyle).toBe("#111111");
    expect(fake.calls.find((call) => call.name === "translate")?.args).toEqual([160, 140]);
  });

  it("trace chaque forme de masque avec sa marge", () => {
    const shapes = { rect: "rect", rounded: "arcTo", ellipse: "ellipse", outline: "lineTo" } as const;
    for (const [shape, method] of Object.entries(shapes)) {
      const fake = createFakeContext();
      const masked = region("a", { mask: { ...DEFAULT_MASK, shape: shape as keyof typeof shapes, grow: 10, strokes: [] } });
      renderPage(fake.ctx, page, image, [masked], DEFAULT_CHAPTER_SETTINGS, { view: "translated" });
      expect(fake.names()).toContain(method);
    }
    const fake = createFakeContext();
    renderPage(fake.ctx, page, image, [region("a", { mask: { ...DEFAULT_MASK, shape: "rect", grow: 10, strokes: [] } })], DEFAULT_CHAPTER_SETTINGS, { view: "translated" });
    expect(fake.calls.find((call) => call.name === "rect")?.args).toEqual([90, 90, 140, 100]);
  });

  it("ne cache rien avec un masque « aucun », et dessine les retouches au pinceau sinon", () => {
    const strokes = [{ points: [{ x: 1, y: 1 }, { x: 5, y: 5 }], width: 12, color: "#abcdef" }];
    const none = createFakeContext();
    renderPage(none.ctx, page, image, [region("a", { mask: { ...DEFAULT_MASK, kind: "none", strokes } })], DEFAULT_CHAPTER_SETTINGS, { view: "translated" });
    expect(none.names()).toEqual(["drawImage"]);

    const filled = createFakeContext();
    renderPage(filled.ctx, page, image, [region("a", { mask: { ...DEFAULT_MASK, strokes } })], DEFAULT_CHAPTER_SETTINGS, { view: "translated" });
    const stroke = filled.calls.find((call) => call.name === "stroke")!;
    expect(stroke.state.strokeStyle).toBe("#abcdef");
    expect(stroke.state.lineWidth).toBe(12);
  });

  it("passe le contour du texte sous son remplissage et applique la rotation", () => {
    const fake = createFakeContext();
    const styled = patchStyle(setTranslationText(region("a"), "Bam"), { stroke: { color: "#ff0000", width: 3 }, italic: true });
    const turned = { ...styled, text: { ...styled.text, box: { ...styled.text.box, rotation: 90 } } };
    renderPage(fake.ctx, page, image, [turned], DEFAULT_CHAPTER_SETTINGS, { view: "translated" });
    const names = fake.names();
    expect(names.indexOf("strokeText")).toBeGreaterThan(-1);
    expect(names.indexOf("strokeText")).toBeLessThan(names.indexOf("fillText"));
    const stroke = fake.calls.find((call) => call.name === "strokeText")!;
    expect(stroke.state.strokeStyle).toBe("#ff0000");
    expect(stroke.state.lineWidth).toBe(6);
    expect(String(stroke.state.font)).toMatch(/^italic 700 /);
    expect(fake.calls.find((call) => call.name === "rotate")?.args[0]).toBeCloseTo(Math.PI / 2);
  });

  it("coupe masques et textes séparément", () => {
    const regions = [setTranslationText(region("a"), "Salut")];
    const noMask = createFakeContext();
    renderPage(noMask.ctx, page, image, regions, DEFAULT_CHAPTER_SETTINGS, { view: "translated", showMasks: false });
    expect(noMask.names()).not.toContain("fill");
    expect(noMask.names()).toContain("fillText");

    const noText = createFakeContext();
    renderPage(noText.ctx, page, image, regions, DEFAULT_CHAPTER_SETTINGS, { view: "translated", showTexts: false });
    expect(noText.names()).toContain("fill");
    expect(noText.names()).not.toContain("fillText");
  });

  it("aligne à gauche sur le bord de la boîte, marge comprise", () => {
    const fake = createFakeContext();
    const left = patchStyle(setTranslationText(region("a"), "Salut"), { align: "left" });
    const fixed = { ...left, text: { ...left.text, autoFit: false } };
    renderPage(fake.ctx, page, image, [fixed], DEFAULT_CHAPTER_SETTINGS, { view: "translated" });
    const text = fake.calls.find((call) => call.name === "fillText")!;
    expect(text.args[1]).toBe(-60);
    expect(String(text.state.font)).toContain(" 28px ");
  });

  it("remplit la page de blanc quand l'image manque", () => {
    const fake = createFakeContext();
    renderPage(fake.ctx, page, null, [], DEFAULT_CHAPTER_SETTINGS, { view: "translated" });
    expect(fake.calls[0]).toMatchObject({ name: "fillRect", args: [0, 0, 400, 600] });
  });
});

describe("layoutRegion et fontOf", () => {
  it("garde en cache la mise en lignes d'une zone", () => {
    let measured = 0;
    const measure = (text: string, _style: unknown, size: number) => {
      measured++;
      return text.length * size * 0.5;
    };
    const cache = new WeakMap<ScanRegion, TextLayout>();
    const target = setTranslationText(region("a"), "Bonjour à tous");
    const first = layoutRegion(target, DEFAULT_CHAPTER_SETTINGS, measure, { minSize: 10, cache });
    const count = measured;
    expect(layoutRegion(target, DEFAULT_CHAPTER_SETTINGS, measure, { minSize: 10, cache })).toBe(first);
    expect(measured).toBe(count);
    expect(first.fits).toBe(true);
  });

  it("choisit la graisse disponible et assainit le nom de police", () => {
    const style = { ...DEFAULT_CHAPTER_SETTINGS.styles.dialogue, font: 'Evil"; x', weight: 500 };
    expect(fontOf(style, 20, () => 400)).toBe('400 20px "Evil x", sans-serif');
  });
});

describe("opérations sur les zones", () => {
  const regions = [region("aaaaaaaaaaa1"), region("aaaaaaaaaaa2"), region("aaaaaaaaaaa3")];

  it("crée une zone à la main, acceptée telle quelle par l'enregistrement", () => {
    const created = createRegion("abcdefghij12", outline, "#f0f0f0");
    expect(created.mask).toEqual({ ...DEFAULT_MASK, color: "#f0f0f0" });
    expect(created.text.box).toEqual({ x: 100, y: 100, width: 120, height: 80, rotation: 0 });
    expect(created.reading).toEqual({ raw: "", clean: "", confidence: 1, engine: "manual", edited: true });
    expect(created.translation).toEqual({ text: "", status: "todo", history: [] });
    expect(sanitizeRegions([created], page)).toEqual([created]);
  });

  it("marque la traduction saisie comme corrigée à la main", () => {
    expect(setTranslationText(regions[0], "Oui").translation).toMatchObject({ text: "Oui", status: "edited", engine: "manual" });
    expect(setTranslationText(regions[0], "  ").translation.status).toBe("todo");
    expect(setReadingText(regions[0], "Yes").reading).toMatchObject({ raw: "Yes", clean: "Yes", edited: true, engine: "manual" });
  });

  it("surcharge le style, puis revient au style du type quand il ne reste rien", () => {
    const styled = patchStyle(regions[0], { size: 40 });
    expect(styled.text.style).toEqual({ size: 40 });
    expect(patchStyle(styled, { size: undefined }).text.style).toBeNull();
  });

  it("copie une zone juste après l'originale, décalée et dans la page", () => {
    const next = duplicateRegion(regions, "aaaaaaaaaaa1", "bbbbbbbbbbbb", 20, page);
    expect(next.map((entry) => entry.id)).toEqual(["aaaaaaaaaaa1", "bbbbbbbbbbbb", "aaaaaaaaaaa2", "aaaaaaaaaaa3"]);
    expect(next[1].outline[0]).toEqual({ x: 120, y: 120 });
    expect(next[1].text.box).toMatchObject({ x: 120, y: 120 });
    // Collée au bord droit, la copie part de l'autre côté.
    const tight = duplicateRegion(regions, "aaaaaaaaaaa1", "bbbbbbbbbbbb", 20, { width: 230, height: 600 });
    expect(tight[1].outline[0]).toEqual({ x: 80, y: 120 });
  });

  it("déplace une zone dans l'ordre de lecture sans sortir de la liste", () => {
    expect(shiftRegion(regions, "aaaaaaaaaaa2", -1).map((entry) => entry.id)).toEqual(["aaaaaaaaaaa2", "aaaaaaaaaaa1", "aaaaaaaaaaa3"]);
    expect(shiftRegion(regions, "aaaaaaaaaaa3", 1)).toBe(regions);
  });

  it("passe à la zone voisine en bouclant", () => {
    expect(neighbourId(regions, "aaaaaaaaaaa3", 1)).toBe("aaaaaaaaaaa1");
    expect(neighbourId(regions, null, 1)).toBe("aaaaaaaaaaa1");
    expect(neighbourId(regions, null, -1)).toBe("aaaaaaaaaaa3");
    expect(neighbourId([], null, 1)).toBeNull();
  });

  it("rend la même liste quand rien ne change", () => {
    expect(updateRegion(regions, "aaaaaaaaaaa1", (entry) => entry)).toBe(regions);
    expect(removeRegion(regions, "inconnue")).toBe(regions);
    expect(removeRegion(regions, "aaaaaaaaaaa1")).toHaveLength(2);
  });
});
