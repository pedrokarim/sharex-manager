import { describe, expect, it } from "vitest";
import { compareNatural, sortNatural } from "@/modules/scan-studio/lib/natural-sort";
import { PAGE_LIMITS, isColor, sanitizeRegions, sanitizeTextStyle } from "@/modules/scan-studio/lib/sanitize-page";
import { DEFAULT_MASK, DEFAULT_STYLES, type ScanRegion } from "@/modules/scan-studio/lib/types";

const size = { width: 800, height: 1200 };

function region(id: string): ScanRegion {
  return {
    id,
    kind: "dialogue",
    outline: [
      { x: 10, y: 10 },
      { x: 200, y: 10 },
      { x: 200, y: 120 },
      { x: 10, y: 120 },
    ],
    direction: "horizontal",
    reading: { raw: "WHAT?!", clean: "What?!", confidence: 1, engine: "manual", edited: true },
    translation: { text: "Quoi ?!", status: "edited", engine: "manual", history: [] },
    mask: { ...DEFAULT_MASK },
    text: { box: { x: 10, y: 10, width: 190, height: 110, rotation: 0 }, style: null, autoFit: true },
  };
}

/** Copie d'une zone valide, retouchée librement : les tests y glissent des valeurs interdites. */
function broken(change: (draft: any) => void): unknown[] {
  const draft = structuredClone(region("aaaaaaaaaaa1"));
  change(draft);
  return [draft];
}

describe("scan studio : ordre naturel", () => {
  it("range 2 avant 10, sans tenir compte de la casse", () => {
    const names = ["10.png", "2.png", "1.png", "Page 12.jpg", "page 3.jpg", "b.png", "A.png"];
    expect(sortNatural(names, (name) => name)).toEqual(["1.png", "2.png", "10.png", "A.png", "b.png", "page 3.jpg", "Page 12.jpg"]);
  });

  it("compare les nombres entiers, zéros de tête et grands nombres compris", () => {
    expect(compareNatural("007.png", "7.png")).toBe(0);
    expect(compareNatural("ch1-p09.png", "ch1-p10.png")).toBeLessThan(0);
    expect(compareNatural("ch2-p1.png", "ch10-p1.png")).toBeLessThan(0);
    expect(compareNatural("123456789012345678901.png", "123456789012345678902.png")).toBeLessThan(0);
    expect(compareNatural("1.png", "1a.png")).toBeLessThan(0);
    expect(compareNatural("a", "a1")).toBeLessThan(0);
    expect(compareNatural("", "")).toBe(0);
  });

  it("est stable et ne modifie pas la liste reçue", () => {
    const items = [
      { name: "01.png", tag: "premier" },
      { name: "1.PNG", tag: "second" },
      { name: "0.png", tag: "zéro" },
    ];
    const copy = [...items];
    expect(sortNatural(items, (item) => item.name).map((item) => item.tag)).toEqual(["zéro", "premier", "second"]);
    expect(items).toEqual(copy);
  });
});

describe("scan studio : contrôle des zones", () => {
  it("rend une zone valide telle quelle", () => {
    const input = [region("aaaaaaaaaaa1"), region("aaaaaaaaaaa2")];
    expect(sanitizeRegions(input, size)).toEqual(input);
  });

  it("accepte les trois écritures de couleur et rien d'autre", () => {
    for (const color of ["#fff", "#A1b2C3", "#11223344"]) expect(isColor(color)).toBe(true);
    for (const color of ["fff", "#ffff", "#12345", "red", "rgb(0,0,0)", "#gggggg", "", null, 0]) expect(isColor(color)).toBe(false);
    const [saved] = sanitizeRegions(broken((draft) => (draft.mask.color = "#ABCDEF")), size);
    expect(saved.mask.color).toBe("#abcdef");
  });

  it("refuse les identifiants invalides ou en double, en nommant la zone", () => {
    expect(() => sanitizeRegions(broken((draft) => (draft.id = "trop-court")), size)).toThrow(/^Zone 1\s: identifiant de zone invalide\.$/);
    expect(() => sanitizeRegions([region("aaaaaaaaaaa1"), region("aaaaaaaaaaa1")], size)).toThrow(/^Zone 2\s: identifiant déjà porté/);
    expect(() => sanitizeRegions({}, size)).toThrow("Zones de la page mal formées.");
  });

  it("vérifie les énumérations", () => {
    const cases: ((draft: any) => void)[] = [
      (draft) => (draft.kind = "bulle"),
      (draft) => (draft.direction = "diagonal"),
      (draft) => (draft.translation.status = "done"),
      (draft) => (draft.mask.kind = "flou"),
      (draft) => (draft.mask.shape = "star"),
      (draft) => (draft.text.style = { align: "justify" }),
    ];
    for (const change of cases) expect(() => sanitizeRegions(broken(change), size)).toThrow(/inconnu/);
  });

  it("refuse les types inattendus plutôt que de les deviner", () => {
    const cases: ((draft: any) => void)[] = [
      (draft) => (draft.outline = [{ x: 1, y: 1 }, { x: 2, y: 2 }]),
      (draft) => (draft.outline[0].x = "12"),
      (draft) => (draft.outline[0].y = Number.NaN),
      (draft) => (draft.reading = null),
      (draft) => (draft.reading.raw = 12),
      (draft) => (draft.reading.edited = "oui"),
      (draft) => (draft.reading.engine = "   "),
      (draft) => (draft.translation.history = "aucun"),
      (draft) => (draft.mask.strokes = [{ points: [], width: 4, color: "#000" }]),
      (draft) => (draft.mask.strokes = [{ points: [{ x: 1, y: 1 }], width: 4, color: "black" }]),
      (draft) => (draft.text.box = undefined),
      (draft) => (draft.text.autoFit = 1),
      (draft) => (draft.text.style = { color: "url(x)" }),
      (draft) => (draft.text.style = { stroke: { color: "#000" } }),
    ];
    for (const change of cases) expect(() => sanitizeRegions(broken(change), size)).toThrow(/^Zone 1\s: /);
  });

  it("plafonne le nombre de zones, de points, de traits et la longueur des textes", () => {
    const point = { x: 1, y: 1 };
    const tooMany = Array.from({ length: PAGE_LIMITS.regions + 1 }, () => region("aaaaaaaaaaa1"));
    expect(() => sanitizeRegions(tooMany, size)).toThrow(/Trop de zones/);

    const cases: ((draft: any) => void)[] = [
      (draft) => (draft.outline = Array(PAGE_LIMITS.outlinePoints + 1).fill(point)),
      (draft) => (draft.mask.strokes = Array(PAGE_LIMITS.strokes + 1).fill({ points: [point], width: 2, color: "#000" })),
      (draft) => (draft.mask.strokes = [{ points: Array(PAGE_LIMITS.strokePoints + 1).fill(point), width: 2, color: "#000" }]),
      (draft) => (draft.translation.text = "a".repeat(PAGE_LIMITS.text + 1)),
      (draft) => (draft.reading.engine = "m".repeat(PAGE_LIMITS.label + 1)),
    ];
    for (const change of cases) expect(() => sanitizeRegions(broken(change), size)).toThrow(/trop long/);

    // Pile à la limite, tout passe.
    const full = broken((draft) => {
      draft.outline = Array(PAGE_LIMITS.outlinePoints).fill(point);
      draft.translation.text = "a".repeat(PAGE_LIMITS.text);
    });
    expect(sanitizeRegions(full, size)[0].outline).toHaveLength(PAGE_LIMITS.outlinePoints);
  });

  it("ne garde que les dernières propositions de l'historique", () => {
    const history = Array.from({ length: PAGE_LIMITS.history + 5 }, (_, index) => ({ text: `v${index}`, engine: "manual", at: index, extra: true }));
    const [saved] = sanitizeRegions(broken((draft) => (draft.translation.history = history)), size);
    expect(saved.translation.history).toHaveLength(PAGE_LIMITS.history);
    expect(saved.translation.history[0]).toEqual({ text: "v5", engine: "manual", at: 5 });
  });

  it("ramène les nombres dans leurs bornes", () => {
    const [saved] = sanitizeRegions(
      broken((draft) => {
        draft.outline = [
          { x: -5, y: -5 },
          { x: 5000, y: 3.14159 },
          { x: 400, y: 5000 },
        ];
        draft.reading.confidence = 7;
        draft.mask.grow = -9999;
        draft.mask.strokes = [{ points: [{ x: 900, y: -1 }], width: 0, color: "#000" }];
        draft.text.box = { x: -5000, y: 50, width: 0, height: 99999, rotation: 450 };
        draft.text.style = { size: 0, weight: 5000, lineHeight: 99 };
      }),
      size
    );
    expect(saved.outline).toEqual([
      { x: 0, y: 0 },
      { x: 800, y: 3.14 },
      { x: 400, y: 1200 },
    ]);
    expect(saved.reading.confidence).toBe(1);
    expect(saved.mask.grow).toBe(-200);
    expect(saved.mask.strokes[0]).toEqual({ points: [{ x: 800, y: 0 }], width: 1, color: "#000" });
    // La boîte du texte peut dépasser de la page, pas s'en éloigner.
    expect(saved.text.box).toEqual({ x: -800, y: 50, width: 1, height: 2400, rotation: 90 });
    expect(saved.text.style).toEqual({ size: 1, weight: 900, lineHeight: 4 });
  });

  it("ne recopie pas les champs inconnus et retire les caractères de contrôle", () => {
    const [saved] = sanitizeRegions(
      broken((draft) => {
        draft.__proto__polluted = true;
        draft.reading.secret = "x";
        draft.mask.script = "<script>";
        draft.text.box.z = 4;
        draft.text.style = { font: "  Comic   Neue ", onclick: "x" };
        draft.translation.text = "Ligne 1\nLigne\u0000 2\u0007";
      }),
      size
    );
    expect(Object.keys(saved).sort()).toEqual(["direction", "id", "kind", "mask", "outline", "reading", "text", "translation"]);
    expect(saved.reading).not.toHaveProperty("secret");
    expect(saved.mask).not.toHaveProperty("script");
    expect(saved.text.box).not.toHaveProperty("z");
    expect(saved.text.style).toEqual({ font: "Comic Neue" });
    expect(saved.translation.text).toBe("Ligne 1\nLigne 2");
  });
});

describe("scan studio : style du texte", () => {
  it("exige un style complet pour un chapitre, accepte un style partiel pour une zone", () => {
    expect(sanitizeTextStyle(DEFAULT_STYLES.sfx, "Style", "full")).toEqual(DEFAULT_STYLES.sfx);
    expect(() => sanitizeTextStyle({ font: "Bangers" }, "Style", "full")).toThrow(/^Style\s: /);
    expect(sanitizeTextStyle({ italic: true }, "Style", "partial")).toEqual({ italic: true });
    expect(sanitizeTextStyle({}, "Style", "partial")).toEqual({});
  });
});
