import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { brotliCompressSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { customFontFamily, customFontId, fontLabel, isMissingFont, STYLE_ROWS, styleRowFont, usedFontFamilies, withStyleRowFont } from "@/modules/scan-studio/lib/custom-fonts";
import {
  FONT_LIMITS,
  addFont,
  getFontUsage,
  inspectFont,
  listFonts,
  readFamilyName,
  readFontFile,
  removeFont,
  renameFont,
} from "@/modules/scan-studio/lib/server/fonts";
import { newChapterId, newFolderId, newPageId, readChapter, readFolder, readPage, setDataRoot, writeChapter, writeFolder, writePage } from "@/modules/scan-studio/lib/store";
import { DEFAULT_CHAPTER_SETTINGS, DEFAULT_MASK, DEFAULT_STYLES, type ScanRegion } from "@/modules/scan-studio/lib/types";

// Aucun fichier de police dans le dépôt : chaque test fabrique un en-tête de
// police synthétique, avec juste ce que le contrôle lit (signature, répertoire
// des tables, table des noms). Ces fichiers ne dessinent rien.

const TTF_MAGIC = Buffer.from([0x00, 0x01, 0x00, 0x00]);
const OTF_MAGIC = Buffer.from("OTTO", "latin1");

/** Table `name` à un seul nom : la famille, en Unicode pour Windows. */
function nameTable(family: string, options: { platform?: number; nameId?: number } = {}): Buffer {
  const platform = options.platform ?? 3;
  const text = platform === 1 ? Buffer.from(family, "latin1") : Buffer.from(family, "utf16le").swap16();
  const header = Buffer.alloc(6 + 12);
  header.writeUInt16BE(0, 0);
  header.writeUInt16BE(1, 2);
  header.writeUInt16BE(header.length, 4);
  header.writeUInt16BE(platform, 6);
  header.writeUInt16BE(1, 8);
  header.writeUInt16BE(platform === 3 ? 0x0409 : 0, 10);
  header.writeUInt16BE(options.nameId ?? 1, 12);
  header.writeUInt16BE(text.length, 14);
  header.writeUInt16BE(0, 16);
  return Buffer.concat([header, text]);
}

const filler = (size = 8) => Buffer.alloc(size, 0x2a);

/** Tables minimales d'une police « dessinable » aux yeux du contrôle. */
function tablesOf(family: string, glyphs: "glyf" | "CFF " = "glyf"): Record<string, Buffer> {
  return { cmap: filler(), head: filler(), [glyphs]: filler(16), name: nameTable(family) };
}

/** Fichier TrueType ou OpenType : signature, répertoire, puis les tables bout à bout. */
function sfnt(magic: Buffer, tables: Record<string, Buffer>): Buffer {
  const tags = Object.keys(tables);
  const directory = Buffer.alloc(12 + tags.length * 16);
  magic.copy(directory, 0);
  directory.writeUInt16BE(tags.length, 4);
  let offset = directory.length;
  tags.forEach((tag, index) => {
    const record = 12 + index * 16;
    directory.write(tag, record, 4, "latin1");
    directory.writeUInt32BE(offset, record + 8);
    directory.writeUInt32BE(tables[tag].length, record + 12);
    offset += tables[tag].length;
  });
  return Buffer.concat([directory, ...tags.map((tag) => tables[tag])]);
}

const WOFF2_KNOWN: Record<string, number> = { cmap: 0, head: 1, name: 5, glyf: 10, "CFF ": 13 };

/** Fichier WOFF2 : en-tête, répertoire compact, puis les tables compressées d'un bloc. */
function woff2(flavor: Buffer, tables: Record<string, Buffer>, options: { corrupt?: boolean } = {}): Buffer {
  const tags = Object.keys(tables);
  const entries = tags.map((tag) => {
    const length = tables[tag].length;
    if (length > 127) throw new Error("table de test trop longue pour un octet");
    // `glyf` en version 3 : pas de transformation, donc pas de seconde longueur.
    const flags = WOFF2_KNOWN[tag] | (tag === "glyf" ? 3 << 6 : 0);
    return Buffer.from([flags, length]);
  });
  const directory = Buffer.concat(entries);
  const data = Buffer.concat(tags.map((tag) => tables[tag]));
  const compressed = options.corrupt ? Buffer.from([0xff, 0xfe, 0xfd, 0xfc, 0xfb]) : brotliCompressSync(data);

  const header = Buffer.alloc(48);
  header.write("wOF2", 0, 4, "latin1");
  flavor.copy(header, 4);
  header.writeUInt32BE(48 + directory.length + compressed.length, 8);
  header.writeUInt16BE(tags.length, 12);
  header.writeUInt32BE(12 + tags.length * 16 + data.length, 16);
  header.writeUInt32BE(compressed.length, 20);
  return Buffer.concat([header, directory, compressed]);
}

const sampleTtf = (family = "Lettrage Essai") => sfnt(TTF_MAGIC, tablesOf(family));

let root = "";

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-studio-fonts-"));
  setDataRoot(path.join(root, "data"));
});

afterEach(() => {
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

describe("scan studio, polices : contrôle du fichier", () => {
  it("reconnaît une police TTF, OTF ou WOFF2 à ses premiers octets et lit son nom", () => {
    expect(inspectFont(sampleTtf("Bulle Ronde"))).toEqual({ format: "ttf", family: "Bulle Ronde" });
    expect(inspectFont(sfnt(OTF_MAGIC, tablesOf("Cri Fort", "CFF ")))).toEqual({ format: "otf", family: "Cri Fort" });
    expect(inspectFont(sfnt(Buffer.from("true", "latin1"), tablesOf("Vieux Mac")))).toEqual({ format: "ttf", family: "Vieux Mac" });
    expect(inspectFont(woff2(TTF_MAGIC, tablesOf("Compacte")))).toEqual({ format: "woff2", family: "Compacte" });
    expect(inspectFont(woff2(OTF_MAGIC, tablesOf("Compacte Bis", "CFF ")))).toEqual({ format: "woff2", family: "Compacte Bis" });
  });

  it("refuse ce qui n'est pas une police, quelle que soit son extension", () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), filler(64)]);
    expect(() => inspectFont(png)).toThrow(/n'est pas une police TTF, OTF ni WOFF2/);
    expect(() => inspectFont(Buffer.from("<html><body>police</body></html>"))).toThrow(/n'est pas une police/);
    expect(() => inspectFont(Buffer.alloc(0))).toThrow(/vide/);
    expect(() => inspectFont(Buffer.from([0x00, 0x01]))).toThrow(/n'est pas une police/);
  });

  it("refuse les collections et le WOFF de première version, en disant quoi déposer", () => {
    expect(() => inspectFont(Buffer.concat([Buffer.from("ttcf", "latin1"), filler(64)]))).toThrow(/collection/);
    expect(() => inspectFont(Buffer.concat([Buffer.from("wOFF", "latin1"), filler(64)]))).toThrow(/WOFF2, TTF ou OTF/);
    expect(() => inspectFont(woff2(Buffer.from("ttcf", "latin1"), tablesOf("Collection")))).toThrow(/collection/);
  });

  it("refuse un fichier trop lourd avant de l'ouvrir", () => {
    const heavy = Buffer.alloc(FONT_LIMITS.bytes + 1);
    TTF_MAGIC.copy(heavy, 0);
    expect(() => inspectFont(heavy)).toThrow(/trop lourde\s: 5 Mo au plus/);
  });

  it("refuse un répertoire de tables incohérent", () => {
    const font = sampleTtf();
    // Tronqué au milieu du répertoire.
    expect(() => inspectFont(font.subarray(0, 20))).toThrow(/tronqué/);
    // Une table annoncée au-delà de la fin du fichier.
    const lying = Buffer.from(font);
    lying.writeUInt32BE(0x00ffffff, 12 + 12);
    expect(() => inspectFont(lying)).toThrow(/dépasse la fin du fichier/);
    // Aucune table.
    const empty = Buffer.from(font);
    empty.writeUInt16BE(0, 4);
    expect(() => inspectFont(empty)).toThrow(/répertoire de tables est incohérent/);
  });

  it("refuse une police sans table des noms lisible, ou sans dessin de lettres", () => {
    const { name: _name, ...withoutName } = tablesOf("Sans nom");
    expect(() => inspectFont(sfnt(TTF_MAGIC, withoutName))).toThrow(/table «\sname\s»/);
    expect(() => inspectFont(sfnt(TTF_MAGIC, { ...tablesOf("x"), name: filler(4) }))).toThrow(/table des noms est illisible/);
    expect(() => inspectFont(sfnt(TTF_MAGIC, { ...tablesOf("x"), name: nameTable("\u0001\u0002") }))).toThrow(/table des noms est illisible/);
    const { glyf: _glyf, ...withoutGlyphs } = tablesOf("Sans lettres");
    expect(() => inspectFont(sfnt(TTF_MAGIC, withoutGlyphs))).toThrow(/aucun dessin de lettres/);
  });

  it("refuse un WOFF2 dont la taille ou les données compressées mentent", () => {
    const font = woff2(TTF_MAGIC, tablesOf("Compacte"));
    expect(() => inspectFont(Buffer.concat([font, filler(3)]))).toThrow(/taille annoncée/);
    expect(() => inspectFont(woff2(TTF_MAGIC, tablesOf("Compacte"), { corrupt: true }))).toThrow(/compressées sont illisibles/);
  });

  it("lit le nom de famille : la famille typographique d'abord, sans caractère de contrôle", () => {
    expect(readFamilyName(nameTable("  Bulle\u0007  Ronde  "))).toBe("Bulle Ronde");
    expect(readFamilyName(nameTable("Ancien Mac", { platform: 1 }))).toBe("Ancien Mac");
    expect(readFamilyName(nameTable("Ignoré", { nameId: 7 }))).toBeNull();
    expect(readFamilyName(Buffer.alloc(2))).toBeNull();
  });
});

describe("scan studio, polices : liste", () => {
  it("garde le fichier dans les données du module, sous un nom que la demande ne choisit pas", () => {
    const data = sampleTtf("Bulle Ronde");
    const font = addFont({ data, name: "../../Évasion.ttf" });

    expect(font.name).toBe("../../Évasion.ttf");
    expect(font.family).toBe(customFontFamily(font.id));
    expect(customFontId(font.family)).toBe(font.id);
    expect(font).toMatchObject({ originalName: "Bulle Ronde", format: "ttf", size: data.length });
    // L'identifiant est tiré au hasard : l'ordre des deux noms n'est pas fixe.
    expect(fs.readdirSync(path.join(root, "data", "fonts")).sort()).toEqual([`${font.id}.ttf`, "index.json"].sort());
    expect(readFontFile(font.id).equals(data)).toBe(true);
    expect(listFonts()).toEqual([font]);
  });

  it("nomme la police d'après son fichier, sans doublon, et refuse un nom déjà pris", () => {
    const first = addFont({ data: sampleTtf("Bulle Ronde") });
    const second = addFont({ data: sampleTtf("Bulle Ronde") });
    expect(first.name).toBe("Bulle Ronde");
    expect(second.name).toBe("Bulle Ronde 2");
    expect(() => addFont({ data: sampleTtf(), name: "bulle ronde" })).toThrow(/s'appelle déjà/);
    expect(() => addFont({ data: sampleTtf(), name: "Bangers" })).toThrow(/police fournie/);
    expect(() => addFont({ data: "pas des octets" })).toThrow(/Fichier de police manquant/);
    expect(() => addFont(null)).toThrow(/Police invalide/);
  });

  it("ne garde rien d'un fichier refusé", () => {
    expect(() => addFont({ data: Buffer.from("texte quelconque") })).toThrow(/n'est pas une police/);
    expect(listFonts()).toEqual([]);
    expect(fs.existsSync(path.join(root, "data", "fonts"))).toBe(false);
  });

  it("renomme sans changer la famille que portent les styles", () => {
    const font = addFont({ data: sampleTtf("Bulle Ronde") });
    const renamed = renameFont(font.id, "  Dialogue   maison ");
    expect(renamed.name).toBe("Dialogue maison");
    expect(renamed.family).toBe(font.family);
    expect(() => renameFont(font.id, "   ")).toThrow(/Donnez un nom/);
    expect(() => renameFont("../index", "x")).toThrow(/introuvable/);
    expect(() => readFontFile("../../secrets")).toThrow(/introuvable/);
  });

  it("plafonne le nombre de polices gardées", () => {
    for (let index = 0; index < FONT_LIMITS.count; index++) addFont({ data: sampleTtf(`Police ${index}`) });
    expect(() => addFont({ data: sampleTtf("Une de trop") })).toThrow(/60 polices au plus/);
  });
});

describe("scan studio, polices : retrait d'une police utilisée", () => {
  function region(id: string, font: string | null): ScanRegion {
    return {
      id,
      kind: "dialogue",
      outline: [
        { x: 5, y: 5 },
        { x: 40, y: 5 },
        { x: 40, y: 30 },
      ],
      direction: "horizontal",
      reading: { raw: "", clean: "", confidence: 1, engine: "manual", edited: true },
      translation: { text: "Bonjour", status: "edited", engine: "manual", history: [] },
      mask: { ...DEFAULT_MASK },
      text: { box: { x: 5, y: 5, width: 35, height: 25, rotation: 0 }, style: font ? { font } : null, autoFit: true },
    };
  }

  /** Un dossier, un chapitre et une page qui portent tous la police. */
  function libraryUsing(family: string) {
    const folderId = newFolderId();
    const chapterId = newChapterId();
    const pageId = newPageId();
    const styles = { ...DEFAULT_STYLES, sfx: { ...DEFAULT_STYLES.sfx, font: family } };
    const now = 1_760_000_000_000;
    writeFolder({ id: folderId, name: "Série", defaults: { ...DEFAULT_CHAPTER_SETTINGS, styles }, glossary: [], chapterIds: [chapterId], createdAt: now, updatedAt: now });
    writeChapter({ id: chapterId, folderId, number: "1", settings: { ...DEFAULT_CHAPTER_SETTINGS, styles }, pageIds: [pageId], createdAt: now, updatedAt: now });
    writePage({
      id: pageId,
      chapterId,
      name: "page.png",
      source: { file: "1760000000000-0000000000.png", width: 100, height: 100 },
      regions: [region("aaaaaaaaaaaa", family), region("bbbbbbbbbbbb", null)],
      status: "imported",
      revision: 4,
      createdAt: now,
      updatedAt: now,
    });
    return { folderId, chapterId, pageId };
  }

  it("retire sans rien demander une police que rien ne porte", () => {
    const font = addFont({ data: sampleTtf() });
    expect(getFontUsage(font.id)).toEqual({ pages: 0, chapters: 0, folders: 0 });
    expect(removeFont(font.id)).toEqual({ removed: true, replaced: { pages: 0, chapters: 0, folders: 0 } });
    expect(listFonts()).toEqual([]);
    expect(fs.existsSync(path.join(root, "data", "fonts", `${font.id}.ttf`))).toBe(false);
  });

  it("refuse de retirer une police utilisée tant qu'aucun remplacement n'est choisi, et dit ce qui la porte", () => {
    const font = addFont({ data: sampleTtf("Onomatopée maison") });
    libraryUsing(font.family);
    expect(getFontUsage(font.id)).toEqual({ pages: 1, chapters: 1, folders: 1 });
    expect(() => removeFont(font.id)).toThrow(/encore utilisée \(1 page, 1 chapitre, 1 dossier\)/);
    expect(() => removeFont(font.id, { replaceWith: "Police inventée" })).toThrow(/remplacement inconnue/);
    expect(() => removeFont(font.id, { replaceWith: font.family })).toThrow(/remplacement inconnue/);
    // Rien n'a bougé : la police est toujours là.
    expect(listFonts()).toHaveLength(1);
    expect(readFontFile(font.id).length).toBeGreaterThan(0);
  });

  it("passe pages, chapitres et dossiers à la police de remplacement avant d'effacer le fichier", () => {
    const font = addFont({ data: sampleTtf("Onomatopée maison") });
    const { folderId, chapterId, pageId } = libraryUsing(font.family);

    expect(removeFont(font.id, { replaceWith: "Bangers" })).toEqual({ removed: true, replaced: { pages: 1, chapters: 1, folders: 1 } });

    const page = readPage(pageId)!;
    expect(page.regions[0].text.style).toEqual({ font: "Bangers" });
    expect(page.regions[1].text.style).toBeNull();
    // La révision change : un atelier resté ouvert sur la page est invité à la recharger.
    expect(page.revision).toBe(5);
    expect(readChapter(chapterId)!.settings.styles.sfx.font).toBe("Bangers");
    expect(readFolder(folderId)!.defaults.styles.sfx.font).toBe("Bangers");
    expect(listFonts()).toEqual([]);
  });

  it("accepte une autre police ajoutée comme remplacement", () => {
    const leaving = addFont({ data: sampleTtf("Sortante") });
    const staying = addFont({ data: sampleTtf("Restante") });
    const { pageId } = libraryUsing(leaving.family);
    removeFont(leaving.id, { replaceWith: staying.family });
    expect(readPage(pageId)!.regions[0].text.style).toEqual({ font: staying.family });
    expect(listFonts().map((font) => font.name)).toEqual(["Restante"]);
  });
});

describe("scan studio, polices : catalogue et table des styles", () => {
  it("nomme une police ajoutée, et dit qu'une police retirée l'a été", () => {
    const custom = [{ family: customFontFamily("abcdefghijkl"), name: "Dialogue maison" }];
    expect(fontLabel(custom[0].family, custom)).toBe("Dialogue maison");
    expect(fontLabel("Comic Neue", custom)).toBe("Comic Neue");
    expect(fontLabel(customFontFamily("zzzzzzzzzzzz"), custom)).toBe("Police retirée");
    expect(isMissingFont(customFontFamily("zzzzzzzzzzzz"), custom)).toBe(true);
    expect(isMissingFont("Comic Neue", custom)).toBe(false);
    expect(customFontId("sxf-trop-court")).toBeNull();
  });

  it("relève les familles réellement dessinées sur une page", () => {
    const base: ScanRegion = {
      id: "aaaaaaaaaaaa",
      kind: "sfx",
      outline: [],
      direction: "horizontal",
      reading: { raw: "", clean: "", confidence: 1, engine: "manual", edited: true },
      translation: { text: "", status: "todo", history: [] },
      mask: { ...DEFAULT_MASK },
      text: { box: { x: 0, y: 0, width: 10, height: 10, rotation: 0 }, style: null, autoFit: true },
    };
    const custom = customFontFamily("abcdefghijkl");
    const families = usedFontFamilies(
      [base, { ...base, id: "bbbbbbbbbbbb", kind: "dialogue", text: { ...base.text, style: { font: custom } } }],
      DEFAULT_CHAPTER_SETTINGS,
    );
    expect([...families].sort()).toEqual(["Bangers", custom].sort());
  });

  it("change la police d'un registre pour tous les types de zone qu'il couvre", () => {
    const thought = STYLE_ROWS.find((row) => row.id === "thought")!;
    const custom = customFontFamily("abcdefghijkl");
    const next = withStyleRowFont(DEFAULT_STYLES, thought, custom);
    expect(next.thought.font).toBe(custom);
    expect(next.narration.font).toBe(custom);
    expect(next.dialogue).toBe(DEFAULT_STYLES.dialogue);
    expect(styleRowFont(next, thought)).toBe(custom);
    // Un dossier d'avant le type « cri » n'a pas ce style : il reçoit celui par défaut.
    const { shout: _shout, ...older } = DEFAULT_STYLES;
    expect(withStyleRowFont(older, thought, custom).shout).toEqual(DEFAULT_STYLES.shout);
    // La graisse suit la police choisie.
    const dialogue = STYLE_ROWS.find((row) => row.id === "dialogue")!;
    expect(withStyleRowFont(DEFAULT_STYLES, dialogue, "Bangers", () => 400).dialogue.weight).toBe(400);
  });
});

describe("scan studio, polices : contrat du module", () => {
  it("réserve aux administrateurs ce qui change les polices de l'instance", () => {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "modules/scan-studio/module.json"), "utf8"));
    for (const name of ["addFont", "renameFont", "removeFont"]) expect(config.functions[name]).toBeUndefined();
    for (const name of ["listFonts", "getFontFile", "getFontUsage"]) expect(config.functions[name]).toBe("user");
    expect(config.pages.some((page: { path: string }) => page.path === "fonts")).toBe(true);
  });
});
