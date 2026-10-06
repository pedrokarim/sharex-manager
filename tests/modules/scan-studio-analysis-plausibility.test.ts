import { beforeEach, describe, expect, it, vi } from "vitest";
import { clusterGlyphs, isVerticalScript, splitBlocks, buildLines, type TextGroup } from "@/modules/scan-studio/lib/analysis/grouping";
import { isCommonWord, isCreditsText, isWordLike, plausibility } from "@/modules/scan-studio/lib/analysis/plausibility";
import { buildRegion, roomMargin } from "@/modules/scan-studio/lib/analysis/regions";
import { isTranslatableRegion, looksUntranslatable } from "@/modules/scan-studio/lib/analysis/untranslatable";
import { isNoiseText, type Box, type WordBox } from "@/modules/scan-studio/lib/analysis/words";
import { setReadingText, setTranslationText } from "@/modules/scan-studio/lib/region-edit";
import { sanitizeRegions } from "@/modules/scan-studio/lib/sanitize-page";
import { boundsOf, type ScanRegion } from "@/modules/scan-studio/lib/types";

const page = { width: 1200, height: 1700 };
const id = (index: number) => `plaus${String(index).padStart(7, "0")}`;

function group(overrides: Partial<TextGroup> = {}): TextGroup {
  return { x0: 200, y0: 180, x1: 450, y1: 240, lines: [], raw: "WHERE DID YOU\nFIND THIS MAP?", confidence: 0.95, lineHeight: 22, angle: 0, ...overrides };
}

const options = { page, medianLineHeight: 22, background: "#ffffff" };

function region(index: number, raw: string, confidence = 0.95, overrides: Partial<TextGroup> = {}): ScanRegion {
  return buildRegion(id(index), group({ raw, confidence, ...overrides }), options);
}

/** Une ligne de lettres : des boîtes de 12 × 18 px, séparées de 4 px. */
function glyphRow(x: number, y: number, count: number): WordBox[] {
  return Array.from({ length: count }, (_, index) => ({ text: "x", confidence: 1, x0: x + index * 16, y0: y, x1: x + index * 16 + 12, y1: y + 18 }));
}

// ─── Forme d'un texte lu ─────────────────────────────────────────

describe("vraisemblance d'un texte lu", () => {
  it("reconnaît les mots courants, avec leur apostrophe", () => {
    expect(isCommonWord("THE")).toBe(true);
    expect(isCommonWord("It's")).toBe(true);
    expect(isCommonWord("we’ll")).toBe(true);
    expect(isCommonWord("Ov")).toBe(false);
  });

  it("juge la forme d'un mot qu'il ne connaît pas", () => {
    expect(isWordLike("LIBRARY")).toBe(true);
    expect(isWordLike("half-baked")).toBe(true);
    expect(isWordLike("Marguerite")).toBe(true);
    expect(isWordLike("198th")).toBe(true);
    // Trop court, sans voyelle, casse en désordre, chiffre mêlé, lettre triplée.
    expect(isWordLike("vk")).toBe(false);
    expect(isWordLike("WNNM")).toBe(false);
    expect(isWordLike("tOoNt")).toBe(false);
    expect(isWordLike("r3ad")).toBe(false);
    expect(isWordLike("ooooh")).toBe(false);
    expect(isWordLike("strngthsz")).toBe(false);
  });

  it("mesure les mots, les voyelles et les signes d'un texte", () => {
    const fine = plausibility("Where did you find this map?");
    expect(fine).toMatchObject({ words: 6, wordLike: 1, symbols: 0, foreign: 0 });
    expect(fine.vowels).toBeGreaterThan(0.3);

    const junk = plausibility("= An 12 == pa tm > vk _ nn |");
    expect(junk.symbols).toBeGreaterThanOrEqual(5);
    expect(junk.wordLike).toBeLessThan(0.5);

    expect(plausibility("これは何ですか").foreign).toBe(1);
    expect(plausibility("").wordLike).toBe(0);
  });

  it("reconnaît une page de crédits à ses adresses et à ses rôles", () => {
    expect(isCreditsText("Translator: someone")).toBe(true);
    expect(isCreditsText("PROOFREADER : NOBODY")).toBe(true);
    expect(isCreditsText("Join us at https://example.org/team")).toBe(true);
    expect(isCreditsText("read more on example.com")).toBe(true);
    expect(isCreditsText("You can support us by donating")).toBe(true);
    expect(isCreditsText("Where did you find this map?")).toBe(false);
    expect(isCreditsText("He cleaned the whole house.")).toBe(false);
  });
});

describe("tri du bruit, à la lecture", () => {
  it("rejette une lecture qui doute et ne ressemble pas à des mots", () => {
    // Signes mêlés aux lettres : un contour ou une trame lus avec le texte.
    expect(isNoiseText("Bob = = a", 0.6)).toBe(true);
    expect(isNoiseText("= An 12 == pa tm a re vk > nn _ e", 0.55)).toBe(true);
    // Presque pas de voyelles sur un texte long.
    expect(isNoiseText("Wrnk tsh grtl", 0.8)).toBe(true);
    // Des lettres éparses, sans mot bien formé.
    expect(isNoiseText("xq vk zt pw", 0.8)).toBe(true);
    // Une autre écriture que le latin.
    expect(isNoiseText("これは 何ですか", 0.9)).toBe(true);
  });

  it("ne condamne jamais une lecture sûre sur sa seule forme", () => {
    expect(isNoiseText("TSK TSK", 0.95)).toBe(false);
    expect(isNoiseText("HMPH!", 0.93)).toBe(false);
    expect(isNoiseText("Zkrvn the Great", 0.92)).toBe(false);
    expect(isNoiseText("It costs 12 = a bargain", 0.9)).toBe(false);
  });

  it("garde une réplique ordinaire dont un mot est mal lu", () => {
    expect(isNoiseText("Will Ilya follow us? I really doubt it.", 0.62)).toBe(false);
    expect(isNoiseText("Ts this going +o be on the test?", 0.7)).toBe(false);
  });

  it("demande davantage à un texte posé sur le dessin", () => {
    // Un mot de deux lettres seul dans le dessin, même lu avec assurance.
    expect(isNoiseText("Ov", 0.86, { enclosed: false })).toBe(true);
    expect(isNoiseText("Ov", 0.86, { enclosed: true })).toBe(false);
    // Deux mots connus, mais une lecture qui doute.
    expect(isNoiseText("I her", 0.55, { enclosed: false })).toBe(true);
    // Ce qui reste : un mot connu et sûr, une onomatopée bien lue, une phrase.
    expect(isNoiseText("NO!", 0.93, { enclosed: false })).toBe(false);
    expect(isNoiseText("BOOM", 0.9, { enclosed: false })).toBe(false);
    expect(isNoiseText("Stay close to the wall.", 0.7, { enclosed: false })).toBe(false);
  });
});

// ─── Blocs de texte ──────────────────────────────────────────────

describe("deux textes côte à côte", () => {
  it("sépare deux blocs que seule une ligne décalée reliait", () => {
    const left = [0, 1, 2].flatMap((row) => glyphRow(60, 80 + row * 30, 8));
    // À 12 px du premier bloc : la distance d'une espace, les lignes se rejoignent.
    const right = [0, 1, 2].flatMap((row) => glyphRow(196, 87 + row * 30, 8));
    expect(buildLines([...left, ...right])).toHaveLength(3);
    const groups = clusterGlyphs([...left, ...right]);
    expect(groups.map((entry) => [entry.x0, entry.y0, entry.x1, entry.y1])).toEqual([
      [60, 80, 184, 158],
      [196, 87, 320, 165],
    ]);
    expect(groups.every((entry) => entry.lines.length === 3)).toBe(true);
  });

  it("garde d'un seul tenant un paragraphe dont les espaces s'alignent", () => {
    // Mêmes blocs, mais sur les mêmes lignes : c'est un seul texte, avec une espace large.
    const left = [0, 1, 2].flatMap((row) => glyphRow(60, 80 + row * 30, 8));
    const right = [0, 1, 2].flatMap((row) => glyphRow(196, 80 + row * 30, 8));
    expect(clusterGlyphs([...left, ...right])).toHaveLength(1);
  });

  it("garde un mot isolé en bout de ligne avec son paragraphe", () => {
    const lines = buildLines([...glyphRow(60, 80, 8), ...glyphRow(200, 84, 2), ...glyphRow(60, 110, 12), ...glyphRow(60, 140, 12)]);
    expect(splitBlocks(lines)).toHaveLength(1);
  });

  it("sépare deux blocs qu'un large couloir divise, même alignés", () => {
    const left = [0, 1].flatMap((row) => glyphRow(60, 80 + row * 30, 6));
    // 17 px de couloir : assez près pour tenir sur la même ligne, trop loin pour une espace.
    const right = [0, 1].flatMap((row) => glyphRow(169, 80 + row * 30, 6));
    const lines = buildLines([...left, ...right]);
    expect(lines).toHaveLength(2);
    expect(splitBlocks(lines)).toHaveLength(2);
  });

  it("rend les lignes telles quelles quand aucune n'a d'espace", () => {
    const lines = buildLines([...glyphRow(60, 80, 8), ...glyphRow(60, 110, 8)]);
    expect(splitBlocks(lines)).toEqual([lines]);
  });
});

describe("sens d'écriture", () => {
  const columns: Box[] = [0, 1, 2].flatMap((column) => Array.from({ length: 5 }, (_, row) => ({ x0: 300 - column * 34, y0: 100 + row * 21, x1: 318 - column * 34, y1: 118 + row * 21 })));

  it("reconnaît des signes rangés en colonnes", () => {
    expect(isVerticalScript(columns)).toBe(true);
  });

  it("ne s'y trompe pas sur des lignes, une colonne seule ou trois taches", () => {
    const rows = [0, 1, 2].flatMap((row) => glyphRow(100, 100 + row * 30, 6));
    expect(isVerticalScript(rows)).toBe(false);
    expect(isVerticalScript(columns.slice(0, 5))).toBe(false);
    expect(isVerticalScript(columns.slice(0, 3))).toBe(false);
  });
});

// ─── Zone rattachée à sa bulle ───────────────────────────────────

describe("zone d'une bulle", () => {
  const room = { x0: 150, y0: 100, x1: 520, y1: 330 };

  it("garde le contour du texte, donne au texte traduit la place de la bulle", () => {
    const built = buildRegion(id(1), group(), { ...options, room });
    // Contour : le texte et sa marge ordinaire, la bulle étant assez grande.
    expect(boundsOf(built.outline)).toEqual({ x: 193, y: 173, width: 264, height: 74 });
    expect(built.mask).toMatchObject({ kind: "fill", grow: 4 });
    // Boîte du texte traduit : la place libre, moins une marge de chaque côté.
    expect(roomMargin(22)).toBe(6);
    expect(built.text.box).toEqual({ x: 156, y: 106, width: 358, height: 218, rotation: 0 });
    expect(sanitizeRegions([built], page)).toEqual([built]);
  });

  it("arrête le contour et le masque au bord de la bulle", () => {
    const tight = { x0: 197, y0: 176, x1: 452, y1: 290 };
    const built = buildRegion(id(2), group(), { ...options, room: tight });
    expect(boundsOf(built.outline)).toEqual({ x: 197, y: 176, width: 255, height: 71 });
    // Plus de place pour une marge de masque : il ne dépasse pas le contour.
    expect(built.mask.grow).toBe(0);
    // La boîte du texte traduit ne passe jamais sous le contour.
    expect(built.text.box).toEqual({ x: 197, y: 176, width: 255, height: 108, rotation: 0 });
  });

  it("ne rétrécit jamais le contour sous le texte quand la place relevée est trop courte", () => {
    const short = { x0: 210, y0: 190, x1: 440, y1: 230 };
    const built = buildRegion(id(3), group(), { ...options, room: short });
    expect(boundsOf(built.outline)).toEqual({ x: 200, y: 180, width: 250, height: 60 });
    expect(built.mask.grow).toBe(0);
    expect(built.text.box).toEqual({ x: 200, y: 180, width: 250, height: 60, rotation: 0 });
  });

  it("laisse une zone sans bulle comme avant", () => {
    const built = buildRegion(id(4), group(), options);
    expect(built.mask.grow).toBe(4);
    expect(built.text.box).toEqual({ ...boundsOf(built.outline), rotation: 0 });
  });
});

// ─── Page sans rien à traduire ───────────────────────────────────

describe("page à laisser telle quelle", () => {
  it("tient pour vide une page où l'analyse n'a rien trouvé", () => {
    expect(looksUntranslatable([], page)).toBe(true);
  });

  it("garde une page qui porte une réplique lue avec assurance", () => {
    expect(looksUntranslatable([region(1, "WHERE DID YOU\nFIND THIS MAP?")], page)).toBe(false);
    // Une lecture à vérifier reste un texte à traduire.
    expect(looksUntranslatable([region(2, "I really doubt it.", 0.65)], page)).toBe(false);
    // Un mot seul, bien lu, dans une bulle.
    expect(looksUntranslatable([region(3, "WELCOME", 0.9)], page)).toBe(false);
  });

  it("propose de passer une couverture : un titre mal lu, des mots douteux", () => {
    const cover = [region(1, "Brnkl Qwfst Zxld Mq", 0.4), region(2, "Qellon vur Ostn", 0.55), region(3, "Volume", 0.5)];
    expect(looksUntranslatable(cover, page)).toBe(true);
    expect(cover.map((entry) => isTranslatableRegion(entry, page))).toEqual([false, false, false]);
  });

  it("propose de passer une bannière de crédits, même bien lue", () => {
    const banner = [
      region(1, "TRANSLATOR : SOMEONE", 0.9),
      region(2, "TYPESETTER : NOBODY", 0.9),
      region(3, "You can join our server at https://example.org/team", 0.85),
    ];
    expect(looksUntranslatable(banner, page)).toBe(true);
    // Une vraie réplique sur la même page suffit à la garder.
    expect(looksUntranslatable([...banner, region(4, "Where did you find this map?")], page)).toBe(false);
  });

  it("ne compte ni les onomatopées, ni une autre écriture, ni un texte minuscule", () => {
    const sfx = region(1, "KRAKOOM", 0.9, { lineHeight: 150 });
    expect(sfx.kind).toBe("sfx");
    expect(looksUntranslatable([sfx], page)).toBe(true);
    expect(looksUntranslatable([setReadingText(region(2, "x", 0.2), "")], page)).toBe(true);
    const foreign = region(3, "ROMAJI", 0.9);
    // Une écriture que le module ne lit pas (ici des lettres grecques) : rien à traduire.
    expect(looksUntranslatable([{ ...foreign, reading: { ...foreign.reading, clean: "αβγδ εζηθ ικλμ" } }], page)).toBe(true);
    // Depuis l'étape S4, le japonais, le chinois et le coréen se lisent : une phrase bien lue compte.
    expect(looksUntranslatable([{ ...foreign, reading: { ...foreign.reading, clean: "これは何ですか" } }], page)).toBe(false);
    expect(looksUntranslatable([region(4, "Where did you find this map?", 0.95, { x0: 200, y0: 180, x1: 230, y1: 182 })], { width: 6000, height: 9000 })).toBe(true);
  });

  it("garde toujours une page que quelqu'un a commencé à traiter", () => {
    const typed = setReadingText(region(1, "Qellon vur", 0.4), "Quentin, come here!");
    expect(looksUntranslatable([typed], page)).toBe(false);
    const translated = setTranslationText(region(2, "Volume", 0.5), "Tome");
    expect(looksUntranslatable([translated], page)).toBe(false);
  });
});

// ─── Analyse des pages enregistrées ──────────────────────────────

const getPage = vi.fn();
const savePage = vi.fn();

vi.mock("@/modules/scan-studio/lib/client", () => ({
  api: { getPage: (...args: unknown[]) => getPage(...args), savePage: (...args: unknown[]) => savePage(...args) },
  newId: () => "mocked000000",
}));

describe("analyse des pages enregistrées", () => {
  beforeEach(() => {
    getPage.mockReset();
    savePage.mockReset();
  });

  it("passe une page marquée « à laisser telle quelle » sans la lire ni l'enregistrer", async () => {
    const { analyzePages } = await import("@/modules/scan-studio/lib/analysis");
    getPage.mockResolvedValue({
      page: { id: "page00000001", skipped: true, regions: [], status: "imported", revision: 1, source: { file: "a.png", width: 600, height: 800 } },
      chapter: { settings: { sourceLanguage: "en", targetLanguage: "fr", format: "manga", maxLevel: 2, styles: {} } },
      imageUrl: "/never-loaded.png",
    });
    const steps: string[] = [];
    const result = await analyzePages(["page00000001"], { onProgress: (progress) => steps.push(`${progress.step}:${progress.progress}`) });
    expect(steps).toEqual(["preparing:0", "skipped:1"]);
    expect(result).toEqual({ analyzed: 0, regions: 0, failed: [], untranslatable: [] });
    expect(savePage).not.toHaveBeenCalled();
  });
});
