import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BANNER_SAFE_AREA, FORMATS, buildFormat } from "@/modules/brand-kit/lib/formats";
import { toBrandTheme } from "@/modules/brand-kit/lib/theme";
import { contrastRatio, sanitizeKit } from "@/modules/brand-kit/lib/validate";
import {
  addImageToKit,
  assertSafeSvg,
  createKit,
  deleteKit,
  duplicateKit,
  exportKit,
  getWatermarkImage,
  importFont,
  importKit,
  importSvgAsset,
  listKits,
  readFontFile,
  registerKitAsset,
  removeFont,
  removeKitAsset,
  requireKit,
  saveKit,
  setDefaultKit,
} from "@/modules/brand-kit/lib/server/kits";
import { setDataRoot, uploadsDir } from "@/modules/brand-kit/lib/server/store";
import type { ImageItem, TextItem } from "@/modules/clip-studio/engine/types";

// Données dans un dossier temporaire : les tests n'écrivent jamais dans le vrai `data/`.
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "brand-kit-"));
  setDataRoot(root);
});
afterEach(() => {
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

const png = (width: number, height: number, color = "#ff4f9a") =>
  sharp({ create: { width, height, channels: 4, background: color } }).png().toBuffer();

/** En-tête de police synthétique : signature, répertoire, table des noms. Ne dessine rien. */
function sampleTtf(family: string): Buffer {
  const text = Buffer.from(family, "utf16le").swap16();
  const name = Buffer.alloc(18);
  name.writeUInt16BE(1, 2);
  name.writeUInt16BE(18, 4);
  name.writeUInt16BE(3, 6);
  name.writeUInt16BE(1, 8);
  name.writeUInt16BE(0x0409, 10);
  name.writeUInt16BE(1, 12);
  name.writeUInt16BE(text.length, 14);
  const tables: Record<string, Buffer> = { cmap: Buffer.alloc(8, 42), head: Buffer.alloc(8, 42), glyf: Buffer.alloc(16, 42), name: Buffer.concat([name, text]) };
  const tags = Object.keys(tables);
  const directory = Buffer.alloc(12 + tags.length * 16);
  Buffer.from([0, 1, 0, 0]).copy(directory, 0);
  directory.writeUInt16BE(tags.length, 4);
  let offset = directory.length;
  tags.forEach((tag, index) => {
    directory.write(tag, 12 + index * 16, 4, "latin1");
    directory.writeUInt32BE(offset, 12 + index * 16 + 8);
    directory.writeUInt32BE(tables[tag].length, 12 + index * 16 + 12);
    offset += tables[tag].length;
  });
  return Buffer.concat([directory, ...tags.map((tag) => tables[tag])]);
}

describe("fiches", () => {
  it("crée une maquette complète, la première étant celle par défaut", () => {
    const first = createKit({ name: "  Riso  " });
    expect(first.name).toBe("Riso");
    expect(first.isDefault).toBe(true);
    expect(first.publishing.defaultPrivacy).toBe("private");
    expect(first.publishing.madeForKids).toBe(false);
    const second = createKit({ name: "Autre" });
    expect(second.isDefault).toBe(false);
    expect(listKits().map((kit) => kit.id)).toEqual([first.id, second.id]);

    setDefaultKit(second.id);
    expect(requireKit(second.id).isDefault).toBe(true);
    expect(requireKit(first.id).isDefault).toBe(false);
  });

  it("borne ce que le navigateur envoie et garde l'identité de la fiche", () => {
    const kit = createKit({ name: "Riso" });
    const saved = saveKit(
      {
        ...kit,
        id: kit.id,
        name: "Riso Pop",
        createdAt: 1,
        isDefault: false,
        palette: { ...kit.palette, accent: "#FF4F9A", ink: "pas une couleur", extras: ["#000000", "nope", "#111111"] },
        textStyles: { ...kit.textStyles, title: { ...kit.textStyles.title, font: "Comic Sans Inexistante", size: 9 } },
        publishing: { ...kit.publishing, madeForKids: "oui", accountIds: ["acc-abcd1234", "../x"] },
      },
      kit.updatedAt
    );
    expect(saved.name).toBe("Riso Pop");
    expect(saved.createdAt).toBe(kit.createdAt);
    expect(saved.isDefault).toBe(true);
    expect(saved.palette.accent).toBe("#ff4f9a");
    expect(saved.palette.ink).toBe(kit.palette.ink);
    expect(saved.palette.extras).toEqual(["#000000", "#111111"]);
    // Une police inconnue reprend celle de la fiche ; la taille est bornée.
    expect(saved.textStyles.title.font).toBe(kit.textStyles.title.font);
    expect(saved.textStyles.title.size).toBe(0.3);
    expect(saved.publishing.madeForKids).toBe(false);
    expect(saved.publishing.accountIds).toEqual(["acc-abcd1234"]);
    expect(saved.updatedAt).toBeGreaterThan(kit.updatedAt);
  });

  it("refuse d'écraser une fiche modifiée ailleurs", () => {
    const kit = createKit({ name: "Riso" });
    saveKit({ ...kit, tone: "Premier" }, kit.updatedAt);
    expect(() => saveKit({ ...kit, tone: "Second" }, kit.updatedAt)).toThrow(/changé ailleurs/);
  });

  it("supprime une fiche et passe le défaut à une autre", () => {
    const first = createKit({ name: "Une" });
    const second = createKit({ name: "Deux" });
    deleteKit(first.id);
    expect(() => requireKit(first.id)).toThrow();
    expect(requireKit(second.id).isDefault).toBe(true);
  });
});

describe("images", () => {
  it("range un fichier déposé, adopte le premier logo et prépare le filigrane", async () => {
    const kit = createKit({ name: "Riso" });
    fs.mkdirSync(uploadsDir(), { recursive: true });
    fs.writeFileSync(path.join(uploadsDir(), "123-abc.png"), await png(400, 200));
    const { kit: next, asset } = await registerKitAsset(kit.id, { file: "123-abc.png", kind: "logo", label: "Logo principal" });
    expect(asset).toMatchObject({ kind: "logo", width: 400, height: 200, label: "Logo principal" });
    expect(next.logoAssetId).toBe(asset.id);
    expect(next.watermark?.assetId).toBe(asset.id);
    // Le dépôt est vidé.
    expect(fs.existsSync(path.join(uploadsDir(), "123-abc.png"))).toBe(false);

    const mark = getWatermarkImage(kit.id);
    expect(mark.anchor).toBe("bottom-right");
    expect((await sharp(mark.image).metadata()).width).toBe(400);

    const cleared = removeKitAsset(kit.id, asset.id);
    expect(cleared.logoAssetId).toBeUndefined();
    expect(cleared.watermark).toBeUndefined();
    expect(() => getWatermarkImage(kit.id)).toThrow(/pas de logo/);
  });

  it("refuse ce qui n'est pas une image et un nom de fichier qui sort du dépôt", async () => {
    const kit = createKit({ name: "Riso" });
    await expect(addImageToKit(kit.id, Buffer.from("pas une image"), "logo", "x")).rejects.toThrow(/pas une image/);
    await expect(registerKitAsset(kit.id, { file: "../brand.json", kind: "logo" })).rejects.toThrow(/invalide/);
  });

  it("refuse un SVG piégé et rastérise un SVG sain", async () => {
    expect(() => assertSafeSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')).toThrow(/refusé/);
    expect(() => assertSafeSvg('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://exemple.com/a.png"/></svg>')).toThrow(/refusé/);
    expect(() => assertSafeSvg('<!DOCTYPE svg [<!ENTITY x "y">]><svg></svg>')).toThrow(/refusé/);
    expect(() => assertSafeSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"></svg>')).toThrow(/refusé/);

    const kit = createKit({ name: "Riso" });
    const { asset } = await importSvgAsset(kit.id, {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="20" height="10" fill="#ff4f9a"/></svg>',
      kind: "logo",
      label: "logo.svg",
    });
    expect(asset.file.endsWith(".png")).toBe(true);
    expect(asset.width / asset.height).toBeCloseTo(2, 1);
    expect(asset.label).toBe("logo");
  });
});

describe("polices", () => {
  it("contrôle, range et rend une police, puis la retire des styles", () => {
    const kit = createKit({ name: "Riso" });
    const withFont = importFont(kit.id, { name: "Titre Riso.ttf", data: sampleTtf("Riso Display").toString("base64") });
    const font = withFont.fonts[0];
    expect(font.name).toBe("Titre Riso");
    expect(font.family).toBe(`bk-${kit.id}-${font.id}`);
    expect(Buffer.from(readFontFile(kit.id, font.id), "base64").equals(sampleTtf("Riso Display"))).toBe(true);

    const styled = saveKit({ ...withFont, textStyles: { ...withFont.textStyles, title: { ...withFont.textStyles.title, font: font.family } } }, withFont.updatedAt);
    expect(styled.textStyles.title.font).toBe(font.family);
    const removed = removeFont(kit.id, font.id);
    expect(removed.fonts).toEqual([]);
    expect(removed.textStyles.title.font).toBe("Anton");
  });

  it("refuse ce qui n'est pas une police", () => {
    const kit = createKit({ name: "Riso" });
    expect(() => importFont(kit.id, { name: "x.ttf", data: Buffer.from("bonjour").toString("base64") })).toThrow(/police/);
  });
});

describe("archives et copies", () => {
  it("exporte puis réimporte une marque, fichiers et polices compris", async () => {
    const kit = createKit({ name: "Riso" });
    const { asset } = await addImageToKit(kit.id, await png(300, 300), "logo", "Logo");
    const withFont = importFont(kit.id, { name: "Riso", data: sampleTtf("Riso").toString("base64") });
    saveKit(
      { ...withFont, tagline: "Les jeux, en couleurs", textStyles: { ...withFont.textStyles, caption: { ...withFont.textStyles.caption, font: withFont.fonts[0].family } } },
      withFont.updatedAt
    );

    const { fileName, data } = exportKit(kit.id);
    expect(fileName).toBe("riso.zip");
    const copy = await importKit(data);
    expect(copy.id).not.toBe(kit.id);
    expect(copy.tagline).toBe("Les jeux, en couleurs");
    expect(copy.assets).toHaveLength(1);
    expect(copy.assets[0].id).not.toBe(asset.id);
    expect(copy.logoAssetId).toBe(copy.assets[0].id);
    // La police suit, sous la famille de la nouvelle marque.
    expect(copy.textStyles.caption.font).toBe(copy.fonts[0].family);
    expect(copy.textStyles.caption.font.startsWith(`bk-${copy.id}-`)).toBe(true);
    expect(copy.isDefault).toBe(false);
  });

  it("refuse une archive sans fiche", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    await expect(importKit(Buffer.from(zipSync({ "autre.txt": strToU8("x") })))).rejects.toThrow(/brand\.json/);
  });

  it("duplique une marque avec ses fichiers et ses polices", async () => {
    const kit = createKit({ name: "Riso" });
    await addImageToKit(kit.id, await png(64, 64), "logo", "Logo");
    const withFont = importFont(kit.id, { name: "Riso", data: sampleTtf("Riso").toString("base64") });
    saveKit({ ...withFont, textStyles: { ...withFont.textStyles, title: { ...withFont.textStyles.title, font: withFont.fonts[0].family } } }, withFont.updatedAt);
    const copy = duplicateKit(kit.id);
    expect(copy.name).toBe("Riso (copie)");
    expect(copy.textStyles.title.font).toBe(`bk-${copy.id}-${copy.fonts[0].id}`);
    expect(readFontFile(copy.id, copy.fonts[0].id)).toBe(readFontFile(kit.id, withFont.fonts[0].id));
  });
});

describe("thème et formats", () => {
  it("traduit la fiche en thème pour Clip Studio", async () => {
    const kit = createKit({ name: "Riso" });
    const { kit: withLogo, asset } = await addImageToKit(kit.id, await png(400, 200), "logo", "Logo");
    const theme = toBrandTheme(withLogo);
    expect(theme.watermark?.source.url).toBe(`/api/modules/brand-kit/data/kits/${kit.id}/assets/${asset.file}`);
    expect(theme.watermark?.source.width).toBe(400);
    expect(theme.endCard?.logo?.url).toBe(theme.watermark?.source.url);
    expect(theme.endCard?.callToAction).toBe("Abonne-toi");
    const noCard = toBrandTheme({ ...withLogo, endCard: { ...withLogo.endCard, enabled: false } });
    expect(noCard.endCard).toBeUndefined();
  });

  it("place le logo et l'accroche de la bannière dans la zone sûre", async () => {
    const kit = createKit({ name: "Riso" });
    const { kit: withLogo } = await addImageToKit(kit.id, await png(400, 200), "logo", "Logo");
    const tagged = sanitizeKit({ ...withLogo, tagline: "Les jeux, en couleurs" }, withLogo);
    const { project } = buildFormat(tagged, "banner");
    const inside = (item: ImageItem | TextItem) => {
      const { x, y, width, height } = item.transform;
      const safe = BANNER_SAFE_AREA;
      return x - width / 2 >= safe.x - 1e-9 && x + width / 2 <= safe.x + safe.width + 1e-9 && y - height / 2 >= safe.y - 1e-9 && y + height / 2 <= safe.y + safe.height + 1e-9;
    };
    const logo = project.tracks.flatMap((track) => track.items).find((item): item is ImageItem => item.type === "image")!;
    const tagline = project.tracks.flatMap((track) => track.items).find((item): item is TextItem => item.type === "text")!;
    expect(project.width).toBe(2560);
    expect(inside(logo)).toBe(true);
    expect(inside(tagline)).toBe(true);
    expect(tagline.text).toBe("Les jeux, en couleurs");
  });

  it("construit chaque format, et écrit le nom quand il n'y a pas de logo", () => {
    const kit = createKit({ name: "Riso" });
    for (const spec of FORMATS) {
      const { project } = buildFormat(kit, spec.id);
      expect([project.width, project.height]).toEqual([spec.width, spec.height]);
    }
    const avatar = buildFormat(kit, "avatar").project;
    expect(avatar.tracks.flatMap((track) => track.items).some((item) => item.type === "text" && item.text === "R")).toBe(true);
    expect(buildFormat(kit, "watermark").project.background).toBe("rgba(0,0,0,0)");
  });

  it("mesure le contraste comme le WCAG", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
});
