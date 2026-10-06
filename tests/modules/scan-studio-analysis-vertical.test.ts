import { describe, expect, it } from "vitest";
import { isCjkLanguage, readingLanguage, readingModel, allReadingModels, suggestedFormat } from "@/modules/scan-studio/lib/analysis/languages";
import {
  characterSize,
  clusterWriting,
  mergeStrokes,
  proximityClusters,
  splitRuby,
  transpose,
  writingDirection,
} from "@/modules/scan-studio/lib/analysis/vertical";
import type { Box } from "@/modules/scan-studio/lib/analysis/words";

// ─── Des signes posés à la main ──────────────────────────────────

const SIZE = 28;

/** Un signe plein : un carré de 28 px. */
const sign = (x: number, y: number, size = SIZE): Box => ({ x0: x, y0: y, x1: x + size, y1: y + size });

/** Une colonne de signes, lue de haut en bas : 2 px entre deux signes. */
function column(x: number, y: number, count: number): Box[] {
  return Array.from({ length: count }, (_, index) => sign(x, y + index * (SIZE + 2)));
}

/** Une ligne de signes, lue de gauche à droite : 2 px entre deux signes. */
function row(x: number, y: number, count: number): Box[] {
  return Array.from({ length: count }, (_, index) => sign(x + index * (SIZE + 2), y));
}

const boxOf = ({ x0, y0, x1, y1 }: Box) => ({ x0, y0, x1, y1 });

describe("langues lues", () => {
  it("donne à chaque langue son modèle des lignes et celui de ses colonnes", () => {
    expect(readingModel("en", "horizontal")).toBe("eng");
    // L'anglais n'a pas de modèle des colonnes : il garde celui des lignes.
    expect(readingModel("en", "vertical")).toBe("eng");
    expect(readingModel("ja", "horizontal")).toBe("jpn");
    expect(readingModel("ja", "vertical")).toBe("jpn_vert");
    expect(readingModel("zh-Hans", "vertical")).toBe("chi_sim_vert");
    expect(readingModel("zh-Hant", "horizontal")).toBe("chi_tra");
    expect(readingModel("ko", "vertical")).toBe("kor_vert");
    expect(readingModel("auto", "horizontal")).toBe("eng");
    expect(readingModel(undefined, "vertical")).toBe("eng");
  });

  it("liste les neuf modèles à copier, sans doublon", () => {
    expect(allReadingModels().sort()).toEqual(["chi_sim", "chi_sim_vert", "chi_tra", "chi_tra_vert", "eng", "jpn", "jpn_vert", "kor", "kor_vert"]);
  });

  it("sait quelles langues s'écrivent en signes pleins, et laquelle porte des furigana", () => {
    expect(["en", "auto", "ja", "zh-Hans", "zh-Hant", "ko"].map((code) => isCjkLanguage(code as never))).toEqual([false, false, true, true, true, true]);
    expect(readingLanguage("ja")).toMatchObject({ prefer: "vertical", ruby: true });
    expect(readingLanguage("ko")).toMatchObject({ prefer: "horizontal", ruby: false });
    expect(readingLanguage("zh-Hans").ruby).toBe(false);
  });

  it("propose un format par langue : manga, manhua, webtoon", () => {
    expect(suggestedFormat("ja")).toBe("manga");
    expect(suggestedFormat("zh-Hans")).toBe("manhua");
    expect(suggestedFormat("zh-Hant")).toBe("manhua");
    expect(suggestedFormat("ko")).toBe("webtoon");
    // L'anglais traduit tous les formats : il ne change rien au réglage.
    expect(suggestedFormat("en")).toBeNull();
    expect(suggestedFormat("auto")).toBeNull();
  });
});

describe("axes échangés", () => {
  it("fait d'une colonne une ligne, et revient au point de départ", () => {
    const box = { x0: 10, y0: 200, x1: 38, y1: 420, name: "colonne" };
    expect(transpose(box)).toEqual({ x0: 200, y0: 10, x1: 420, y1: 38, name: "colonne" });
    expect(transpose(transpose(box))).toEqual(box);
  });
});

describe("signes recomposés", () => {
  it("prend pour taille d'un signe celle des plus grandes taches", () => {
    expect(characterSize([])).toBe(0);
    expect(characterSize([sign(0, 0), sign(40, 0), { x0: 80, y0: 0, x1: 86, y1: 6 }])).toBe(SIZE);
  });

  it("réunit les deux moitiés d'un signe, côte à côte", () => {
    const left = { x0: 0, y0: 0, x1: 13, y1: 28 };
    const right = { x0: 15, y0: 0, x1: 28, y1: 28 };
    const signs = mergeStrokes([left, right, ...column(0, 30, 3)]);
    expect(signs).toHaveLength(4);
    expect(boxOf(signs[0])).toEqual({ x0: 0, y0: 0, x1: 28, y1: 28 });
    expect(signs[0].strokes).toEqual([left, right]);
  });

  it("réunit trois traits empilés en un signe", () => {
    const strokes = [0, 11, 22].map((y) => ({ x0: 0, y0: y, x1: 28, y1: y + 6 }));
    const signs = mergeStrokes([...strokes, ...column(0, 32, 3)]);
    expect(signs).toHaveLength(4);
    expect(signs[0].strokes).toHaveLength(3);
  });

  it("ne soude jamais deux signes entiers, même serrés", () => {
    expect(mergeStrokes(column(0, 0, 5))).toHaveLength(5);
    expect(mergeStrokes(row(0, 0, 5))).toHaveLength(5);
  });
});

describe("sens d'écriture", () => {
  it("reconnaît des colonnes : les signes se serrent de haut en bas", () => {
    // Trois colonnes de cinq signes, 2 px entre les signes, 16 px entre les colonnes.
    const signs = [...column(100, 0, 5), ...column(56, 0, 5), ...column(12, 0, 5)];
    expect(writingDirection(signs, "horizontal")).toBe("vertical");
  });

  it("reconnaît des lignes : les signes se serrent de gauche à droite", () => {
    const signs = [...row(0, 0, 5), ...row(0, 44, 5), ...row(0, 88, 4)];
    expect(writingDirection(signs, "vertical")).toBe("horizontal");
  });

  it("tient une colonne seule pour une colonne, une ligne seule pour une ligne", () => {
    expect(writingDirection(column(0, 0, 3), "horizontal")).toBe("vertical");
    expect(writingDirection(row(0, 0, 3), "vertical")).toBe("horizontal");
  });

  it("s'en remet à la langue quand la disposition ne dit rien", () => {
    expect(writingDirection([sign(0, 0)], "vertical")).toBe("vertical");
    expect(writingDirection([sign(0, 0)], "horizontal")).toBe("horizontal");
    expect(writingDirection([], "vertical")).toBe("vertical");
    // Grille parfaite, mêmes écarts dans les deux sens.
    const grid = [sign(0, 0), sign(40, 0), sign(0, 40), sign(40, 40)];
    expect(writingDirection(grid, "vertical")).toBe("vertical");
    expect(writingDirection(grid, "horizontal")).toBe("horizontal");
  });
});

describe("paquets de taches voisines", () => {
  it("sépare deux textes éloignés", () => {
    const clusters = proximityClusters([...column(0, 0, 4), ...column(400, 0, 3)]);
    expect(clusters.map((cluster) => cluster.length).sort()).toEqual([3, 4]);
  });

  it("réunit les colonnes voisines d'un même texte", () => {
    expect(proximityClusters([...column(44, 0, 4), ...column(0, 0, 4)])).toHaveLength(1);
  });

  it("n'accroche pas une lettre à une grande forme du dessin", () => {
    const shape = { x0: 40, y0: 0, x1: 290, y1: 250 };
    const clusters = proximityClusters([...column(0, 0, 4), shape]);
    expect(clusters).toHaveLength(2);
    expect(clusters.find((cluster) => cluster.includes(shape))).toHaveLength(1);
  });
});

describe("furigana", () => {
  /** Petits signes de 12 px, posés l'un après l'autre le long d'une ligne. */
  const small = (x: number, y: number, count: number): Box[] => Array.from({ length: count }, (_, index) => sign(x + index * 14, y, 12));

  it("écarte les petits signes posés au-dessus d'une ligne", () => {
    const base = row(0, 100, 6);
    const ruby = small(0, 85, 4);
    const split = splitRuby([...base, ...ruby], "before");
    expect(split.ruby).toEqual(ruby);
    expect(split.base).toEqual(base);
  });

  it("ne les cherche que du côté où ils se mettent", () => {
    const base = row(0, 100, 6);
    const below = small(0, 131, 4);
    // Sous une ligne horizontale, ce ne sont pas des furigana.
    expect(splitRuby([...base, ...below], "before").ruby).toEqual([]);
    // À droite d'une colonne (après elle, axes échangés), si.
    expect(splitRuby([...base, ...below], "after").ruby).toEqual(below);
  });

  it("garde la ponctuation et les petits kana, qui sont dans la ligne", () => {
    const base = row(0, 100, 5);
    // Un point en bas de ligne, un petit signe à mi-hauteur.
    const marks = [{ x0: 152, y0: 118, x1: 160, y1: 126 }, sign(164, 108, 14)];
    expect(splitRuby([...base, ...marks], "before").ruby).toEqual([]);
  });

  it("garde les traits d'une ligne dont les grandes taches sont étroites", () => {
    // Des signes faits d'un trait haut et fin, et d'un petit trait sur le côté.
    const tall = [0, 30, 60, 90].map((x) => ({ x0: x, y0: 106, x1: x + 26, y1: 124 }));
    const big = [0, 30, 60, 90].map((x) => ({ x0: x + 10, y0: 100, x1: x + 16, y1: 128 }));
    const side = { x0: 2, y0: 100, x1: 10, y1: 105 };
    expect(splitRuby([...big, ...tall, side], "before").ruby).toEqual([]);
  });

  it("laisse tranquille un texte trop court pour en juger", () => {
    const strokes = [sign(0, 100), sign(0, 85, 12)];
    expect(splitRuby(strokes, "before")).toEqual({ base: strokes, ruby: [] });
  });

  it("ne prend pas pour des furigana de petits signes trop loin de la ligne", () => {
    expect(splitRuby([...row(0, 100, 6), ...small(0, 60, 4)], "before").ruby).toEqual([]);
  });
});

describe("blocs de texte en signes pleins", () => {
  const japanese = { prefer: "vertical" as const, ruby: true };
  const korean = { prefer: "horizontal" as const, ruby: false };

  it("réunit les colonnes d'une bulle en une seule zone, en colonnes", () => {
    // Trois colonnes, lues de droite à gauche : 16 px de couloir.
    const glyphs = [...column(100, 20, 6), ...column(56, 20, 6), ...column(12, 20, 4)];
    const groups = clusterWriting(glyphs, japanese);
    expect(groups).toHaveLength(1);
    expect(groups[0].direction).toBe("vertical");
    expect(groups[0].lines).toHaveLength(3);
    expect(groups[0].signs).toHaveLength(16);
    // La taille du lettrage est la largeur d'une colonne.
    expect(groups[0].lineHeight).toBe(SIZE);
    expect(boxOf(groups[0])).toEqual({ x0: 12, y0: 20, x1: 128, y1: 198 });
    // Chaque « ligne » du bloc est une colonne : plus haute que large.
    for (const line of groups[0].lines) expect(line.y1 - line.y0).toBeGreaterThan(line.x1 - line.x0);
  });

  it("garde en lignes un texte écrit en lignes, même si la langue préfère les colonnes", () => {
    const groups = clusterWriting([...row(0, 0, 6), ...row(0, 44, 5)], japanese);
    expect(groups).toHaveLength(1);
    expect(groups[0].direction).toBe("horizontal");
    expect(groups[0].lines).toHaveLength(2);
  });

  it("met les furigana de côté : dans la boîte, hors du texte", () => {
    const text = [...column(60, 20, 6), ...column(16, 20, 6)];
    // Trois petits signes de 12 px à droite de la première colonne, contre elle.
    const ruby = [22, 36, 50].map((y) => sign(90, y, 12));
    const [group, ...others] = clusterWriting([...text, ...ruby], japanese);
    expect(others).toEqual([]);
    expect(group.direction).toBe("vertical");
    expect(group.signs).toHaveLength(12);
    expect(group.lines).toHaveLength(2);
    expect(group.ruby).toHaveLength(3);
    expect(group.ruby.map(boxOf)).toEqual(expect.arrayContaining(ruby));
    // La boîte du bloc couvre les furigana : ils seront masqués avec le texte.
    expect(group.x1).toBe(102);
    // Aucun signe du texte n'est fait d'un furigana.
    const strokes = group.signs.flatMap((entry) => entry.strokes);
    for (const mark of ruby) expect(strokes).not.toContain(mark);
  });

  it("ne cherche pas de furigana quand la langue n'en porte pas", () => {
    const text = [...row(0, 100, 6), ...row(0, 144, 6)];
    const above = [0, 14, 28].map((x) => sign(x, 85, 12));
    const groups = clusterWriting([...text, ...above], korean);
    expect(groups.flatMap((group) => group.ruby)).toEqual([]);
  });

  it("rend à chaque signe ses taches d'origine", () => {
    const left = { x0: 0, y0: 0, x1: 13, y1: 28, anchor: "gauche" };
    const right = { x0: 15, y0: 0, x1: 28, y1: 28, anchor: "droite" };
    const rest = column(0, 30, 3).map((box) => ({ ...box, anchor: "reste" }));
    const [group] = clusterWriting([left, right, ...rest], japanese);
    expect(group.signs).toHaveLength(4);
    expect(group.signs[0].strokes).toEqual([left, right]);
  });

  it("fait deux zones de deux textes éloignés dans la même bulle", () => {
    const groups = clusterWriting([...column(0, 0, 5), ...column(300, 0, 5)], japanese);
    expect(groups).toHaveLength(2);
  });

  it("ne rend rien sans tache", () => {
    expect(clusterWriting([], japanese)).toEqual([]);
  });
});
