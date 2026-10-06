import { describe, expect, it } from "vitest";
import type { TextGroup } from "@/modules/scan-studio/lib/analysis/grouping";
import { MAX_PAGE_REGIONS, isProtectedRegion, mergeRegions, needsReview } from "@/modules/scan-studio/lib/analysis/merge";
import { READING_ENGINE, buildRegion, guessKind, isDarkBackground, outlinePadding, paddedOutline, referenceTextSize } from "@/modules/scan-studio/lib/analysis/regions";
import { REVIEW_CONFIDENCE } from "@/modules/scan-studio/lib/analysis/words";
import { createRegion, setReadingText } from "@/modules/scan-studio/lib/region-edit";
import { sanitizeRegions } from "@/modules/scan-studio/lib/sanitize-page";
import { boundsOf, type ScanRegion } from "@/modules/scan-studio/lib/types";

const page = { width: 1200, height: 1700 };

function group(overrides: Partial<TextGroup> = {}): TextGroup {
  return { x0: 200, y0: 180, x1: 450, y1: 240, lines: [], raw: "WHERE DID YOU\nFIND THIS MAP?", confidence: 0.957, lineHeight: 22, angle: 0, ...overrides };
}

const options = { page, medianLineHeight: 22, background: "#ffffff" };

/** Zone automatique posée sur un rectangle, pour les tests de fusion. */
function found(id: string, x: number, y: number, width = 200, height = 100, raw = "HELLO"): ScanRegion {
  return buildRegion(id, group({ x0: x, y0: y, x1: x + width, y1: y + height, raw }), options);
}

const id = (index: number) => `region${String(index).padStart(6, "0")}`;

describe("zones produites par l'analyse", () => {
  it("a la forme attendue par l'atelier et par le serveur", () => {
    const region = buildRegion(id(1), group(), options);
    expect(region.reading).toEqual({
      raw: "WHERE DID YOU\nFIND THIS MAP?",
      clean: "Where did you find this map?",
      confidence: 0.96,
      engine: "tesseract",
      edited: false,
    });
    expect(READING_ENGINE).toBe("tesseract");
    expect(region.translation).toEqual({ text: "", status: "todo", history: [] });
    expect(region.kind).toBe("dialogue");
    expect(region.direction).toBe("horizontal");
    expect(region.mask).toMatchObject({ kind: "fill", color: "#ffffff", strokes: [] });
    // La taille de référence vient du lettrage d'origine : le texte traduit ne la dépassera pas.
    expect(region.text).toEqual({ box: { ...boundsOf(region.outline), rotation: 0 }, style: null, autoFit: true, maxSize: referenceTextSize(group().lineHeight, options.medianLineHeight) });
    expect(region.text.maxSize).toBeGreaterThan(0);
    // Ce que le serveur accepte à l'enregistrement, sans rien y changer.
    expect(sanitizeRegions([region], page)).toEqual([region]);
  });

  it("donne au texte traduit une taille de référence proche d'une zone à l'autre", () => {
    // Lettrage de 20 px sur une page dont la médiane est 20 px : la police fait un peu plus que la hauteur des capitales.
    expect(referenceTextSize(20, 20)).toBeCloseTo(27.8, 1);
    // Un cri reste plus gros et une note plus petite, mais sans écart démesuré avec le reste de la page.
    expect(referenceTextSize(80, 20)).toBeCloseTo(referenceTextSize(30, 20)!, 5);
    expect(referenceTextSize(5, 20)).toBeCloseTo(referenceTextSize(16, 20)!, 5);
    // Sans médiane connue, la zone se réfère à elle-même ; sans rien de mesuré, pas de plafond.
    expect(referenceTextSize(18, 0)).toBeCloseTo(25, 1);
    expect(referenceTextSize(0, 0)).toBeUndefined();
  });

  it("a la même forme qu'une zone tracée à la main", () => {
    const automatic = buildRegion(id(1), group(), options);
    const manual = createRegion(id(2), automatic.outline, "#ffffff");
    expect(Object.keys(automatic).sort()).toEqual(Object.keys(manual).sort());
    expect(Object.keys(automatic.mask).sort()).toEqual(Object.keys(manual.mask).sort());
    expect(Object.keys(automatic.reading).sort()).toEqual(Object.keys(manual.reading).sort());
  });

  it("entoure le texte d'une marge proportionnée au lettrage", () => {
    expect(outlinePadding(22)).toBe(7);
    expect(outlinePadding(4)).toBe(4);
    expect(outlinePadding(300)).toBe(20);
    const region = buildRegion(id(1), group(), options);
    expect(boundsOf(region.outline)).toEqual({ x: 193, y: 173, width: 264, height: 74 });
  });

  it("garde le contour dans la page", () => {
    const outline = paddedOutline({ x0: 2, y0: 3, x1: 1198, y1: 1699 }, 10, page);
    expect(boundsOf(outline)).toEqual({ x: 0, y: 0, width: 1200, height: 1700 });
    expect(outline).toHaveLength(4);
  });

  it("borne la confiance entre 0 et 1", () => {
    expect(buildRegion(id(1), group({ confidence: 1.4 }), options).reading.confidence).toBe(1);
    expect(buildRegion(id(1), group({ confidence: -0.2 }), options).reading.confidence).toBe(0);
  });

  it("passe les termes protégés au nettoyage", () => {
    const region = buildRegion(id(1), group({ raw: "WHO IS OLIVIA?" }), { ...options, protectedTerms: ["Olivia"] });
    expect(region.reading.clean).toBe("Who is Olivia?");
  });
});

describe("type deviné", () => {
  const hints = { page, medianLineHeight: 22, background: "#ffffff" };

  it("dialogue par défaut", () => {
    expect(guessKind({ lineHeight: 22, angle: 0 }, hints)).toBe("dialogue");
  });

  it("récitatif pour un texte clair sur fond sombre", () => {
    expect(isDarkBackground("#111111")).toBe(true);
    expect(isDarkBackground("#14213d")).toBe(true);
    expect(isDarkBackground("#f2d95c")).toBe(false);
    expect(guessKind({ lineHeight: 22, angle: 0 }, { ...hints, background: "#111111" })).toBe("narration");
  });

  it("onomatopée pour un texte très grand", () => {
    expect(guessKind({ lineHeight: 150, angle: 0 }, hints)).toBe("sfx");
    // Trois fois le lettrage de la page, sans être immense.
    expect(guessKind({ lineHeight: 66, angle: 0 }, hints)).toBe("sfx");
    // Un titre un peu plus grand que le reste reste un dialogue.
    expect(guessKind({ lineHeight: 40, angle: 0 }, hints)).toBe("dialogue");
  });

  it("onomatopée pour un texte penché", () => {
    expect(guessKind({ lineHeight: 22, angle: -8 }, hints)).toBe("sfx");
    expect(guessKind({ lineHeight: 22, angle: 90 }, hints)).toBe("sfx");
    expect(guessKind({ lineHeight: 22, angle: 2 }, hints)).toBe("dialogue");
  });

  it("une onomatopée l'emporte sur le fond sombre", () => {
    expect(guessKind({ lineHeight: 150, angle: 0 }, { ...hints, background: "#000000" })).toBe("sfx");
  });

  it("ne masque pas une onomatopée, masque le reste", () => {
    expect(buildRegion(id(1), group({ lineHeight: 150 }), options).mask.kind).toBe("none");
    expect(buildRegion(id(1), group(), options).mask.kind).toBe("fill");
    expect(buildRegion(id(1), group(), { ...options, background: "#111111" }).mask).toMatchObject({ kind: "fill", color: "#111111" });
  });
});

describe("lecture à vérifier", () => {
  it("signale une lecture automatique sous le seuil", () => {
    expect(needsReview(buildRegion(id(1), group({ confidence: REVIEW_CONFIDENCE - 0.05 }), options))).toBe(true);
    expect(needsReview(buildRegion(id(1), group({ confidence: REVIEW_CONFIDENCE + 0.05 }), options))).toBe(false);
  });

  it("ne signale jamais une zone tracée ou corrigée à la main", () => {
    const manual = createRegion(id(1), [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], "#ffffff");
    expect(needsReview({ ...manual, reading: { ...manual.reading, confidence: 0 } })).toBe(false);
    const doubtful = buildRegion(id(2), group({ confidence: 0.5 }), options);
    expect(needsReview(setReadingText(doubtful, "Where did you find this map?"))).toBe(false);
  });

  it("garde le texte lu par le moteur quand on corrige le texte nettoyé", () => {
    const corrected = setReadingText(buildRegion(id(1), group({ raw: "NO! 60 BACK!" }), options), "No! Go back!");
    expect(corrected.reading).toEqual({ raw: "NO! 60 BACK!", clean: "No! Go back!", confidence: 1, engine: "tesseract", edited: true });
  });
});

describe("fusion avec les zones de la page", () => {
  it("protège une zone corrigée à la main ou déjà traduite", () => {
    const automatic = found(id(1), 100, 100);
    expect(isProtectedRegion(automatic)).toBe(false);
    expect(isProtectedRegion({ ...automatic, reading: { ...automatic.reading, edited: true } })).toBe(true);
    expect(isProtectedRegion({ ...automatic, translation: { ...automatic.translation, text: "Bonjour" } })).toBe(true);
    expect(isProtectedRegion({ ...automatic, translation: { ...automatic.translation, text: "   " } })).toBe(false);
    // Une proposition de moteur jamais retouchée ne protège pas la zone ; une traduction corrigée ou validée, si.
    expect(isProtectedRegion({ ...automatic, translation: { ...automatic.translation, text: "Bonjour", status: "proposed" } })).toBe(false);
    expect(isProtectedRegion({ ...automatic, translation: { ...automatic.translation, text: "Bonjour", status: "edited" } })).toBe(true);
    expect(isProtectedRegion({ ...automatic, translation: { ...automatic.translation, text: "Bonjour", status: "approved" } })).toBe(true);
  });

  it("sans remplacement : garde tout, ajoute ce qui est nouveau", () => {
    const existing = [found(id(1), 100, 100)];
    const again = found(id(2), 110, 105);
    const fresh = found(id(3), 600, 800);
    const merged = mergeRegions(existing, [again, fresh], { format: "manga" });
    expect(merged.added).toBe(1);
    expect(merged.regions.map((region) => region.id)).toEqual([id(1), id(3)]);
  });

  it("sans remplacement : rend la liste d'origine quand rien ne s'ajoute", () => {
    const existing = [found(id(1), 100, 100)];
    const merged = mergeRegions(existing, [found(id(2), 100, 100)], { format: "manga" });
    expect(merged).toEqual({ regions: existing, added: 0 });
    expect(merged.regions).toBe(existing);
  });

  it("sans remplacement : garde l'ordre existant, puis les nouvelles dans l'ordre de lecture reçu", () => {
    const existing = [found(id(2), 100, 900), found(id(1), 100, 100)];
    const merged = mergeRegions(existing, [found(id(3), 700, 100), found(id(4), 700, 900)], { format: "manga" });
    expect(merged.regions.map((region) => region.id)).toEqual([id(2), id(1), id(3), id(4)]);
  });

  it("garde une nouvelle zone qui recouvre une existante de moins de moitié", () => {
    const merged = mergeRegions([found(id(1), 100, 100)], [found(id(2), 220, 100)], { format: "manga" });
    expect(merged.added).toBe(1);
  });

  it("avec remplacement : remplace les zones jamais retouchées", () => {
    const stale = found(id(1), 100, 100, 200, 100, "OLD READING");
    const merged = mergeRegions([stale], [found(id(2), 104, 102, 200, 100, "NEW READING")], { replace: true, format: "manga" });
    expect(merged.regions.map((region) => region.id)).toEqual([id(2)]);
    expect(merged.added).toBe(1);
  });

  it("avec remplacement : ne retire ni n'écrase une zone corrigée ou traduite", () => {
    const edited = setReadingText(found(id(1), 100, 100), "Corrected by hand");
    const translated = { ...found(id(2), 700, 100), translation: { text: "Bonjour", status: "edited" as const, engine: "manual", history: [] } };
    const untouched = found(id(3), 100, 900);
    const merged = mergeRegions(
      [edited, translated, untouched],
      [found(id(4), 102, 101), found(id(5), 705, 98), found(id(6), 100, 900), found(id(7), 700, 900)],
      { replace: true, format: "manga" },
    );
    // Manga : de droite à gauche, puis de haut en bas.
    expect(merged.regions.map((region) => region.id)).toEqual([id(2), id(1), id(7), id(6)]);
    expect(merged.regions.find((region) => region.id === id(1))).toBe(edited);
    expect(merged.regions.find((region) => region.id === id(2))).toBe(translated);
    expect(merged.added).toBe(2);
  });

  it("avec remplacement : une page sans texte retrouvé perd ses zones jamais retouchées", () => {
    const edited = setReadingText(found(id(1), 100, 100), "Kept");
    const merged = mergeRegions([edited, found(id(2), 600, 600)], [], { replace: true, format: "webtoon" });
    expect(merged.regions).toEqual([edited]);
    expect(merged.added).toBe(0);
  });

  it("ne dépasse pas le plafond de zones d'une page", () => {
    const existing = Array.from({ length: MAX_PAGE_REGIONS - 1 }, (_, index) => found(id(index), (index % 40) * 30, Math.floor(index / 40) * 30, 20, 20));
    const merged = mergeRegions(existing, [found(id(900), 0, 1500), found(id(901), 400, 1500)], { format: "manga" });
    expect(merged.regions).toHaveLength(MAX_PAGE_REGIONS);
    expect(merged.added).toBe(1);
  });
});
