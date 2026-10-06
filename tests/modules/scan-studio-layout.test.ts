import { describe, expect, it } from "vitest";
import {
  MIN_READABLE_SIZE,
  autoFit,
  layoutText,
  minReadableSize,
  prepareText,
  wrapText,
  type Measure,
} from "@/modules/scan-studio/lib/text-layout";
import { DEFAULT_STYLES, type TextStyle } from "@/modules/scan-studio/lib/types";

/** Police de test à chasse fixe : chaque caractère fait la moitié de la taille. */
const measure: Measure = (text, _style, size) => Array.from(text).length * size * 0.5;

const style: TextStyle = { ...DEFAULT_STYLES.dialogue, uppercase: false, lineHeight: 1 };
const NBSP = " ";

describe("prepareText", () => {
  it("unifie les fins de ligne et retire les lignes vides des extrémités", () => {
    expect(prepareText("\r\n  Bonjour\r\ntoi \n\n", false)).toBe("Bonjour\ntoi");
  });

  it("passe en capitales, accents compris", () => {
    expect(prepareText("déjà là", true)).toBe("DÉJÀ LÀ");
  });

  it("garde les espaces insécables", () => {
    expect(prepareText(`Quoi${NBSP}?`, false)).toBe(`Quoi${NBSP}?`);
  });
});

describe("wrapText", () => {
  it("remplit chaque ligne sans dépasser la largeur", () => {
    // À la taille 10, un caractère fait 5 px : 50 px laissent 10 caractères.
    const result = wrapText("un deux trois quatre", style, 10, 50, measure);
    expect(result.lines).toEqual(["un deux", "trois", "quatre"]);
    expect(result.width).toBe(35);
    expect(result.brokenWord).toBe(false);
  });

  it("respecte les retours à la ligne saisis, lignes vides comprises", () => {
    const result = wrapText("un\n\ndeux trois", style, 10, 200, measure);
    expect(result.lines).toEqual(["un", "", "deux trois"]);
  });

  it("ne coupe jamais à une espace insécable", () => {
    const result = wrapText(`Vraiment${NBSP}? Oui`, style, 10, 50, measure);
    expect(result.lines).toEqual([`Vraiment${NBSP}?`, "Oui"]);
  });

  it("coupe un mot composé après son trait d'union avant de le hacher", () => {
    const result = wrapText("porte-monnaie", style, 10, 40, measure);
    expect(result.lines).toEqual(["porte-", "monnaie"]);
    expect(result.brokenWord).toBe(false);
  });

  it("hache un mot insécable trop long et le signale", () => {
    const result = wrapText("anticonstitutionnellement", style, 10, 50, measure);
    expect(result.brokenWord).toBe(true);
    expect(result.lines.join("")).toBe("anticonstitutionnellement");
    expect(result.lines.every((line) => measure(line, style, 10) <= 50)).toBe(true);
  });

  it("termine même quand un seul caractère dépasse la largeur", () => {
    const result = wrapText("abc", style, 10, 2, measure);
    expect(result.lines).toEqual(["a", "b", "c"]);
  });

  it("applique les capitales du style", () => {
    expect(wrapText("oui", { ...style, uppercase: true }, 10, 100, measure).lines).toEqual(["OUI"]);
  });

  it("rend un bloc vide pour un texte vide", () => {
    expect(wrapText("  \n ", style, 10, 100, measure)).toEqual({ lines: [], width: 0, brokenWord: false });
  });
});

describe("autoFit", () => {
  it("trouve la plus grande taille qui tient en largeur et en hauteur", () => {
    // « bonjour » : 7 caractères, soit 3,5 × la taille. Boîte de 70 × 100 : taille 20.
    const layout = autoFit("bonjour", style, { width: 70, height: 100 }, measure, { minSize: 8 });
    expect(layout.fits).toBe(true);
    expect(layout.size).toBe(20);
    expect(layout.lines).toEqual(["bonjour"]);
  });

  it("est borné par la hauteur quand la largeur ne manque pas", () => {
    const layout = autoFit("oui\nnon", { ...style, lineHeight: 1.5 }, { width: 1000, height: 60 }, measure, { minSize: 8 });
    // Deux lignes de 1,5 × la taille dans 60 px : taille 20.
    expect(layout.size).toBe(20);
    expect(layout.height).toBe(60);
  });

  it("préfère revenir à la ligne plutôt que rétrécir", () => {
    const layout = autoFit("un deux trois quatre", style, { width: 60, height: 60 }, measure, { minSize: 8 });
    expect(layout.fits).toBe(true);
    expect(layout.lines.length).toBeGreaterThan(1);
    expect(layout.width).toBeLessThanOrEqual(60);
    expect(layout.height).toBeLessThanOrEqual(60);
    // La taille supérieure ne tient plus.
    const larger = layoutText("un deux trois quatre", { ...style, size: layout.size + 0.5 }, { width: 60, height: 60 }, measure, { autoFit: false });
    expect(larger.fits).toBe(false);
  });

  it("ne coupe pas un mot pour gagner en taille", () => {
    const layout = autoFit("extraordinaire", style, { width: 70, height: 400 }, measure, { minSize: 8 });
    expect(layout.lines).toEqual(["extraordinaire"]);
    expect(layout.size).toBe(10);
  });

  it("signale le texte qui ne tient pas, sans descendre sous la taille lisible", () => {
    const layout = autoFit("un texte beaucoup trop long pour cette toute petite bulle", style, { width: 40, height: 20 }, measure, { minSize: 12 });
    expect(layout.fits).toBe(false);
    expect(layout.size).toBe(12);
    expect(layout.lines.length).toBeGreaterThan(0);
  });

  it("garde la marge demandée de chaque côté", () => {
    const layout = autoFit("bonjour", style, { width: 90, height: 100 }, measure, { minSize: 8, padding: 10 });
    expect(layout.size).toBe(20);
  });

  it("respecte le plafond de taille", () => {
    const layout = autoFit("a", style, { width: 500, height: 500 }, measure, { minSize: 8, maxSize: 40 });
    expect(layout.size).toBe(40);
  });

  it("rend un bloc vide qui tient pour un texte vide", () => {
    const layout = autoFit("", style, { width: 50, height: 50 }, measure);
    expect(layout.lines).toEqual([]);
    expect(layout.fits).toBe(true);
  });
});

describe("layoutText sans ajustement", () => {
  it("utilise la taille du style et dit si le texte déborde", () => {
    const fixed = { ...style, size: 20 };
    expect(layoutText("bonjour", fixed, { width: 80, height: 30 }, measure, { autoFit: false })).toMatchObject({ size: 20, fits: true });
    expect(layoutText("bonjour à tous", fixed, { width: 80, height: 30 }, measure, { autoFit: false }).fits).toBe(false);
  });
});

describe("minReadableSize", () => {
  it("suit la largeur de la page sans descendre sous le plancher", () => {
    expect(minReadableSize(400)).toBe(MIN_READABLE_SIZE);
    expect(minReadableSize(1600)).toBe(16);
  });
});
