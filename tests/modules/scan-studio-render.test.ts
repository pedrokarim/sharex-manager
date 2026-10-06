import { describe, expect, it } from "vitest";
import { handlePosition, normalizeAngle, rectToPolygon, rotationToward } from "@/modules/scan-studio/lib/geometry";
import {
  acceptAiReading,
  acceptAiTranslation,
  addAiTrace,
  createRegion,
  createSfxRegion,
  duplicateRegion,
  neighbourId,
  patchStyle,
  removeRegion,
  setReadingText,
  setTranslationText,
  shiftRegion,
  updateRegion,
} from "@/modules/scan-studio/lib/region-edit";
import { createMeasure, drawMask, fontOf, layoutRegion, paintMask, renderPage } from "@/modules/scan-studio/lib/render";
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
    "fill", "stroke", "translate", "rotate", "scale", "fillText", "strokeText",
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

describe("onomatopées : lettres espacées et étirées", () => {
  const sfx = (style: Record<string, unknown>, text: string) => ({
    ...setTranslationText(region("a", { kind: "sfx" }), text),
    text: { box: { x: 100, y: 100, width: 120, height: 80, rotation: 0 }, style: { size: 20, stroke: { color: "#111111", width: 0 }, ...style }, autoFit: false },
  });

  it("pose chaque lettre à sa place quand elles sont espacées", () => {
    const fake = createFakeContext();
    // Lettres de 10 px (la moitié de la taille), espacées de 10 % de la taille : 2 px.
    renderPage(fake.ctx, page, image, [sfx({ letterSpacing: 0.1 }, "abc")], DEFAULT_CHAPTER_SETTINGS, { view: "translated" });
    const letters = fake.calls.filter((call) => call.name === "fillText");
    expect(letters.map((call) => call.args[0])).toEqual(["A", "B", "C"]);
    // Largeur 34 px, centrée : la première lettre part de -17.
    expect(letters.map((call) => call.args[1])).toEqual([-17, -5, 7]);
    expect(letters.every((call) => call.state.textAlign === "left")).toBe(true);
  });

  it("étire les lettres sans déplacer le bloc", () => {
    const fake = createFakeContext();
    renderPage(fake.ctx, page, image, [sfx({ stretch: 2 }, "ab")], DEFAULT_CHAPTER_SETTINGS, { view: "translated" });
    expect(fake.calls.find((call) => call.name === "scale")?.args).toEqual([2, 1]);
    // Dans le repère élargi deux fois, 20 px de lettres centrées partent de -10.
    expect(fake.calls.filter((call) => call.name === "fillText").map((call) => call.args[1])).toEqual([-10, 0]);
  });

  it("mesure une ligne comme elle sera dessinée, espacement et étirement compris", () => {
    const fake = createFakeContext();
    const measure = createMeasure(fake.ctx);
    const style = { ...DEFAULT_CHAPTER_SETTINGS.styles.sfx, stroke: undefined };
    expect(measure("ABC", style, 20)).toBe(30);
    expect(measure("ABC", { ...style, letterSpacing: 0.1 }, 20)).toBe(34);
    expect(measure("ABC", { ...style, stretch: 1.5 }, 20)).toBe(45);
    expect(measure("ABC", { ...style, letterSpacing: 0.1, stretch: 2 }, 20)).toBe(68);
    // Un espacement négatif resserre les lettres.
    expect(measure("AB", { ...style, letterSpacing: -0.1 }, 20)).toBe(18);
  });

  it("passe le contour de toutes les lettres sous leur remplissage", () => {
    const fake = createFakeContext();
    renderPage(fake.ctx, page, image, [sfx({ letterSpacing: 0.1, stroke: { color: "#000000", width: 3 } }, "ab")], DEFAULT_CHAPTER_SETTINGS, { view: "translated" });
    const order = fake.names().filter((name) => name === "strokeText" || name === "fillText");
    expect(order).toEqual(["strokeText", "strokeText", "fillText", "fillText"]);
    expect(fake.calls.find((call) => call.name === "strokeText")?.state.lineWidth).toBe(6);
  });

  it("garde les réglages des lettres à l'enregistrement, bornés", () => {
    const [clean] = sanitizeRegions([{ ...sfx({ letterSpacing: 9, stretch: 0.01 }, "boum"), id: "abcdefghijkl" }], page);
    expect(clean.text.style).toMatchObject({ letterSpacing: 2, stretch: 0.25 });
    expect(sanitizeRegions([{ ...sfx({}, "boum"), id: "abcdefghijkl" }], page)[0].text.style).not.toHaveProperty("letterSpacing");
  });

  it("crée une onomatopée posée sur le dessin : rien n'est masqué au départ", () => {
    const created = createSfxRegion("abcdefghijkl", outline, "#ffffff");
    expect(created.kind).toBe("sfx");
    expect(created.mask.kind).toBe("none");
    expect(() => sanitizeRegions([created], page)).not.toThrow();
  });
});

describe("masque : fond reconstruit", () => {
  const patch = { image: { marker: "fond" } as unknown as CanvasImageSource, x: 90, y: 88 };
  const inpainted = (id: string) => setTranslationText(region(id, { mask: { ...DEFAULT_MASK, kind: "inpaint", color: "#abcdef", strokes: [] } }), "Salut");

  it("pose le fond reconstruit à sa place quand il est prêt, sans aplat", () => {
    const fake = createFakeContext();
    renderPage(fake.ctx, page, image, [inpainted("a")], DEFAULT_CHAPTER_SETTINGS, { view: "translated", showTexts: false, resolveInpaint: () => patch });
    expect(fake.names()).toEqual(["drawImage", "drawImage"]);
    expect(fake.calls[1].args).toEqual([patch.image, 90, 88]);
  });

  it("garde l'aplat de couleur tant que le fond n'est pas prêt, ou s'il n'a pas pu être calculé", () => {
    for (const options of [{}, { resolveInpaint: () => null }]) {
      const fake = createFakeContext();
      renderPage(fake.ctx, page, image, [inpainted("a")], DEFAULT_CHAPTER_SETTINGS, { view: "translated", showTexts: false, ...options });
      expect(fake.names().filter((name) => name === "drawImage")).toHaveLength(1);
      expect(fake.calls.find((call) => call.name === "fill")?.state.fillStyle).toBe("#abcdef");
    }
  });

  it("ne pose jamais de fond reconstruit sur une zone en aplat", () => {
    const flat = createFakeContext();
    drawMask(flat.ctx, setTranslationText(region("b"), "Toi"), patch);
    expect(flat.names()).not.toContain("drawImage");
    expect(flat.names()).toContain("fill");
    const none = createFakeContext();
    drawMask(none.ctx, region("c", { mask: { ...DEFAULT_MASK, kind: "none", strokes: [] } }), patch);
    expect(none.names()).toEqual([]);
  });

  it("dessine la silhouette du masque d'une seule couleur, retouches comprises", () => {
    const stroke = { points: [{ x: 10, y: 10 }, { x: 30, y: 12 }], width: 12, color: "#ff0000" };
    const fake = createFakeContext();
    paintMask(fake.ctx, region("a", { mask: { ...DEFAULT_MASK, color: "#00ff00", strokes: [stroke] } }), "#000000");
    expect(fake.calls.find((call) => call.name === "fill")?.state.fillStyle).toBe("#000000");
    expect(fake.calls.find((call) => call.name === "stroke")?.state.strokeStyle).toBe("#000000");
    // Sans couleur imposée, chaque partie garde la sienne.
    const plain = createFakeContext();
    paintMask(plain.ctx, region("a", { mask: { ...DEFAULT_MASK, color: "#00ff00", strokes: [stroke] } }));
    expect(plain.calls.find((call) => call.name === "fill")?.state.fillStyle).toBe("#00ff00");
    expect(plain.calls.find((call) => call.name === "stroke")?.state.strokeStyle).toBe("#ff0000");
  });

  it("accepte le mode « fond reconstruit » à l'enregistrement", () => {
    expect(sanitizeRegions([inpainted("abcdefghijkl")], page)[0].mask.kind).toBe("inpaint");
  });
});

describe("poignée de rotation", () => {
  const box = { x: 100, y: 100, width: 80, height: 40, rotation: 30 };

  it("ne fait pas sauter la boîte quand la poignée est saisie à côté de son centre", () => {
    // La poignée est prise à 7 px de son centre : sans l'écart retenu à la prise, la boîte tournerait d'un coup.
    const handle = handlePosition(box, "rotate", 26);
    const grab = { x: handle.x + 7, y: handle.y + 2 };
    const naive = rotationToward(box, grab);
    expect(Math.abs(normalizeAngle(naive - box.rotation))).toBeGreaterThan(5);

    const offset = normalizeAngle(box.rotation - rotationToward(box, grab));
    expect(normalizeAngle(rotationToward(box, grab) + offset)).toBeCloseTo(box.rotation, 6);
    // Puis la boîte suit le pointeur, de l'angle dont il tourne autour du centre.
    const moved = { x: grab.x + 20, y: grab.y + 20 };
    const turned = normalizeAngle(rotationToward(box, moved) + offset);
    expect(normalizeAngle(turned - box.rotation)).toBeCloseTo(normalizeAngle(rotationToward(box, moved) - rotationToward(box, grab)), 6);
  });

  it("place la poignée au-dessus du bord haut, dans le sens de la rotation", () => {
    expect(rotationToward(box, handlePosition(box, "rotate", 26))).toBeCloseTo(30, 6);
    expect(rotationToward({ ...box, rotation: -135 }, handlePosition({ ...box, rotation: -135 }, "rotate", 10))).toBeCloseTo(-135, 6);
    expect(rotationToward({ ...box, rotation: 0 }, { x: 140, y: 0 })).toBeCloseTo(0, 6);
    expect(rotationToward({ ...box, rotation: 0 }, { x: 300, y: 120 })).toBeCloseTo(90, 6);
  });
});

describe("propositions d'une IA", () => {
  const trace = { action: "reading" as const, provider: "fake", model: "vision-1", at: 42, sent: "crop" as const };

  it("accepte une lecture : elle vaut une lecture relue, et dit d'où elle vient", () => {
    const accepted = acceptAiReading(region("a"), "Bonjour", trace);
    expect(accepted.reading).toEqual({ raw: "Bonjour", clean: "Bonjour", confidence: 1, engine: "ia:fake/vision-1", edited: true });
  });

  it("accepte une traduction : l'ancienne part dans l'historique", () => {
    const before = setTranslationText(region("a"), "Salut");
    const accepted = acceptAiTranslation(before, "Bonjour", { ...trace, action: "translation", sent: "text" }, 99);
    expect(accepted.translation).toEqual({ text: "Bonjour", status: "proposed", engine: "ia:fake/vision-1", history: [{ text: "Salut", engine: "manual", at: 99 }] });
    expect(acceptAiTranslation(accepted, "Bonjour", trace, 100).translation.history).toHaveLength(1);
  });

  it("garde la trace des appels sur la zone, les vingt derniers", () => {
    let traced = region("a");
    for (let index = 0; index < 25; index++) traced = addAiTrace(traced, { ...trace, at: index });
    expect(traced.ai).toHaveLength(20);
    expect(traced.ai![0].at).toBe(5);
    expect(region("a").ai).toBeUndefined();
  });
});
