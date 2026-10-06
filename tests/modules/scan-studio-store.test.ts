import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => ({ uploads: "", announced: [] as string[], secured: [] as string[] }));

// La galerie de test vit dans un répertoire temporaire, et rien n'est diffusé.
vi.mock("@/lib/config", () => ({ getAbsoluteUploadPath: () => shared.uploads }));
vi.mock("@/lib/secure-files", () => ({
  setFileSecure: async (fileName: string, secure: boolean) => {
    if (secure) shared.secured.push(fileName);
  },
}));
vi.mock("@/lib/gallery-events", () => ({
  announceNewUpload: async (fileName: string) => {
    shared.announced.push(fileName);
  },
}));

import * as api from "@/modules/scan-studio/index.process";
import { setDataRoot } from "@/modules/scan-studio/lib/store";
import { DEFAULT_CHAPTER_SETTINGS, DEFAULT_MASK, isId, type ScanRegion } from "@/modules/scan-studio/lib/types";

let root = "";
let counter = 0;

const assetsDir = () => path.join(root, "data", "assets");
const thumbsDir = () => path.join(root, "data", "thumbs");
const exists = (...parts: string[]) => fs.existsSync(path.join(root, "data", ...parts));

/** Dépose une image comme le ferait la route d'envoi, et rend son nom. */
async function upload(width = 60, height = 90, extension: "png" | "jpg" | "webp" = "png"): Promise<string> {
  const image = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 60, b: 60 } } });
  const buffer = await (extension === "png" ? image.png() : extension === "jpg" ? image.jpeg() : image.webp()).toBuffer();
  const file = `${1_760_000_000_000 + counter}-${(counter++).toString(16).padStart(10, "0")}.${extension}`;
  fs.mkdirSync(assetsDir(), { recursive: true });
  fs.writeFileSync(path.join(assetsDir(), file), buffer);
  return file;
}

async function library() {
  const folder = await api.createFolder({ name: "  Série   test " });
  const chapter = await api.createChapter(folder.id, { number: "1", title: "Début" });
  return { folder, chapter };
}

function region(id: string, overrides: Partial<ScanRegion> = {}): ScanRegion {
  return {
    id,
    kind: "dialogue",
    outline: [
      { x: 5, y: 5 },
      { x: 40, y: 5 },
      { x: 40, y: 30 },
    ],
    direction: "horizontal",
    reading: { raw: "HELLO", clean: "Hello", confidence: 1, engine: "manual", edited: true },
    translation: { text: "Bonjour", status: "edited", engine: "manual", history: [] },
    mask: { ...DEFAULT_MASK },
    text: { box: { x: 5, y: 5, width: 35, height: 25, rotation: 0 }, style: null, autoFit: true },
    ...overrides,
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-studio-"));
  shared.uploads = path.join(root, "uploads");
  shared.announced.length = 0;
  shared.secured.length = 0;
  fs.mkdirSync(shared.uploads, { recursive: true });
  setDataRoot(path.join(root, "data"));
});

afterEach(() => {
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

describe("scan studio : contrat du module", () => {
  it("exporte chaque fonction déclarée, ouverte aux comptes ordinaires", () => {
    const moduleDir = path.join(process.cwd(), "modules/scan-studio");
    const config = JSON.parse(fs.readFileSync(path.join(moduleDir, "module.json"), "utf8"));
    const entry = fs.readFileSync(path.join(moduleDir, "index.process.ts"), "utf8");
    const client = fs.readFileSync(path.join(moduleDir, "lib/client.ts"), "utf8");

    for (const name of Object.keys(config.functions)) {
      expect(config.functions[name]).toBe("user");
      expect(entry).toMatch(new RegExp(`export async function ${name}\\b`));
      expect(typeof (api as Record<string, unknown>)[name]).toBe("function");
    }
    // Tout ce que l'interface appelle existe côté serveur. Les réglages des
    // moteurs sont réservés aux administrateurs : absents de la table des
    // fonctions, exprès.
    const adminOnly = new Set(["saveEngineSettings", "testEngine", "setSourceEnabled", "refreshSourceIcon"]);
    for (const [, name] of client.matchAll(/callModule<[^>]*>\("(\w+)"/g)) {
      expect(entry).toMatch(new RegExp(`export async function ${name}\\b`));
      if (adminOnly.has(name)) expect(config.functions[name]).toBeUndefined();
      else expect(config.functions[name]).toBe("user");
    }
  });
});

describe("scan studio : dossiers et chapitres", () => {
  it("crée un dossier avec les réglages par défaut, et un chapitre qui les reprend", async () => {
    const { folder, chapter } = await library();
    expect(isId(folder.id)).toBe(true);
    expect(folder.name).toBe("Série test");
    expect(folder.defaults).toEqual(DEFAULT_CHAPTER_SETTINGS);

    const defaults = { ...DEFAULT_CHAPTER_SETTINGS, targetLanguage: "es", format: "webtoon" as const };
    await api.updateFolder(folder.id, { defaults, glossary: [{ source: " Luffy ", target: "Luffy", keep: true }] });
    const second = await api.createChapter(folder.id, { number: "2" });

    expect(chapter.settings.targetLanguage).toBe("fr");
    expect(second.settings.targetLanguage).toBe("es");
    expect(second.settings.format).toBe("webtoon");
    expect(second.title).toBeUndefined();

    const view = await api.getFolder(folder.id);
    expect(view.folder.glossary).toEqual([{ source: "Luffy", target: "Luffy", keep: true }]);
    expect(view.chapters.map((entry) => entry.number)).toEqual(["1", "2"]);
    expect((await api.listFolders())[0]).toMatchObject({ id: folder.id, chapterCount: 2, pageCount: 0 });
  });

  it("lève une erreur en français sur un identifiant inconnu ou mal formé", async () => {
    await expect(api.getFolder("aaaaaaaaaaaa")).rejects.toThrow("Dossier introuvable.");
    await expect(api.getFolder("../../etc")).rejects.toThrow("Dossier introuvable.");
    await expect(api.getChapter("bbbbbbbbbbbb")).rejects.toThrow("Chapitre introuvable.");
    await expect(api.getPage("cccccccccccc")).rejects.toThrow("Page introuvable.");
    await expect(api.deleteFolder("aaaaaaaaaaaa")).rejects.toThrow("Dossier introuvable.");
    await expect(api.createChapter("aaaaaaaaaaaa", { number: "1" })).rejects.toThrow("Dossier introuvable.");
    await expect(api.createFolder({ name: "   " })).rejects.toThrow(/nom/);
  });

  it("refuse des réglages mal formés sans rien écrire", async () => {
    const { folder, chapter } = await library();
    const broken = { ...DEFAULT_CHAPTER_SETTINGS, format: "comics" } as never;
    await expect(api.updateFolder(folder.id, { name: "Autre", defaults: broken })).rejects.toThrow("Format de lecture inconnu.");
    expect((await api.getFolder(folder.id)).folder.name).toBe("Série test");

    const badStyle = structuredClone(DEFAULT_CHAPTER_SETTINGS);
    badStyle.styles.dialogue.color = "red";
    await expect(api.updateChapter(chapter.id, { settings: badStyle })).rejects.toThrow(/couleur du texte invalide/);

    const renamed = await api.updateChapter(chapter.id, { number: "1.5", title: "" });
    expect(renamed.number).toBe("1.5");
    expect(renamed.title).toBeUndefined();
  });

  it("réordonne les chapitres et refuse un ordre qui n'est pas une permutation", async () => {
    const { folder, chapter } = await library();
    const second = await api.createChapter(folder.id, { number: "2" });
    const reordered = await api.reorderChapters(folder.id, [second.id, chapter.id]);
    expect(reordered.chapterIds).toEqual([second.id, chapter.id]);
    await expect(api.reorderChapters(folder.id, [second.id, second.id])).rejects.toThrow(/ne correspond pas/);
    await expect(api.reorderChapters(folder.id, [second.id])).rejects.toThrow(/ne correspond pas/);
  });
});

describe("scan studio : import de pages", () => {
  it("range les pages dans l'ordre naturel, lit les vraies dimensions et crée les vignettes", async () => {
    const { folder, chapter } = await library();
    const files = [
      { file: await upload(60, 90), name: "10.png" },
      { file: await upload(1000, 1500, "jpg"), name: "2.jpg" },
      { file: await upload(60, 90, "webp"), name: "Page 1.webp" },
    ];
    const pages = await api.importPages(chapter.id, files);

    expect(pages.map((page) => page.name)).toEqual(["2.jpg", "10.png", "Page 1.webp"]);
    expect(pages[0]).toMatchObject({ width: 1000, height: 1500, status: "imported", regionCount: 0 });
    expect(pages[0].imageUrl).toBe(`/api/modules/scan-studio/data/assets/${files[1].file}`);
    expect(pages[0].thumbUrl).toBe(`/api/modules/scan-studio/data/thumbs/${pages[0].id}.webp`);

    const thumb = await sharp(fs.readFileSync(path.join(thumbsDir(), `${pages[0].id}.webp`))).metadata();
    expect([thumb.format, thumb.width, thumb.height]).toEqual(["webp", 480, 720]);
    // Une petite image n'est pas agrandie.
    expect((await sharp(fs.readFileSync(path.join(thumbsDir(), `${pages[1].id}.webp`))).metadata()).width).toBe(60);

    // Un second import s'ajoute à la suite, sans retrier l'existant.
    const more = await api.importPages(chapter.id, [{ file: await upload(), name: "1.png" }]);
    const view = await api.getChapter(chapter.id);
    expect(view.pages.map((page) => page.name)).toEqual(["2.jpg", "10.png", "Page 1.webp", "1.png"]);
    expect(view.chapter.pageIds).toEqual([...pages, ...more].map((page) => page.id));
    expect(view.folder).toEqual({ id: folder.id, name: "Série test" });

    const summary = (await api.getFolder(folder.id)).chapters[0];
    expect(summary).toMatchObject({ pageCount: 4, cover: pages[0].thumbUrl });
    expect(summary.progress.imported).toBe(4);
    expect((await api.listFolders())[0]).toMatchObject({ pageCount: 4, cover: pages[0].thumbUrl });
  });

  it("refuse les noms hors gabarit, les fichiers absents et ce qui n'est pas une image", async () => {
    const { chapter } = await library();
    const good = await upload();

    for (const file of ["../secret.png", "page.png", "1760000000000-zzzzzzzzzz.png", "1760000000000-0000000000.svg"]) {
      await expect(api.importPages(chapter.id, [{ file, name: "a.png" }])).rejects.toThrow("Fichier déposé invalide.");
    }
    await expect(api.importPages(chapter.id, [{ file: "1760000000000-ffffffffff.png", name: "a.png" }])).rejects.toThrow(/introuvable/);
    await expect(api.importPages(chapter.id, [])).rejects.toThrow("Aucune image à ajouter.");
    await expect(
      api.importPages(chapter.id, [
        { file: good, name: "a.png" },
        { file: good, name: "b.png" },
      ])
    ).rejects.toThrow(/deux fois/);
    await expect(api.importPages("aaaaaaaaaaaa", [{ file: good, name: "a.png" }])).rejects.toThrow("Chapitre introuvable.");

    // Un faux PNG : refusé, effacé, et l'import entier est annulé.
    const fake = "1760000000000-abcdefabcd.png";
    fs.writeFileSync(path.join(assetsDir(), fake), "ceci n'est pas une image");
    await expect(
      api.importPages(chapter.id, [
        { file: good, name: "1.png" },
        { file: fake, name: "2.png" },
      ])
    ).rejects.toThrow(/n'est pas une image/);
    expect(exists("assets", fake)).toBe(false);
    expect(exists("assets", good)).toBe(true);
    expect((await api.getChapter(chapter.id)).pages).toEqual([]);
    expect(fs.readdirSync(thumbsDir())).toEqual([]);
    expect(fs.readdirSync(path.join(root, "data", "pages"))).toEqual([]);
  });

  it("refuse une image démesurée et un lot trop gros", async () => {
    const { chapter } = await library();
    const tall = await upload(10, 20_001);
    await expect(api.importPages(chapter.id, [{ file: tall, name: "bande.png" }])).rejects.toThrow(/trop grande/);
    expect(exists("assets", tall)).toBe(false);

    const many = Array.from({ length: 301 }, (_, index) => ({ file: `1760000000000-${index.toString(16).padStart(10, "0")}.png`, name: `${index}.png` }));
    await expect(api.importPages(chapter.id, many)).rejects.toThrow(/300 images au plus/);
  });

  it("copie des images de la galerie sous un nom neuf, sans toucher à l'original", async () => {
    const { chapter } = await library();
    const picture = await sharp({ create: { width: 80, height: 120, channels: 3, background: "#336699" } }).jpeg().toBuffer();
    // L'extension ment : le fichier copié prend celle de son type réel.
    fs.writeFileSync(path.join(shared.uploads, "scan 2.png"), picture);
    fs.writeFileSync(path.join(shared.uploads, "scan 1.jpg"), picture);

    const pages = await api.importGalleryFiles(chapter.id, ["scan 2.png", "scan 1.jpg"]);
    expect(pages.map((page) => page.name)).toEqual(["scan 1.jpg", "scan 2.png"]);
    for (const page of pages) {
      expect(page.imageUrl).toMatch(/\/data\/assets\/\d{13}-[0-9a-f]{10}\.jpg$/);
      expect(exists("assets", path.basename(page.imageUrl))).toBe(true);
      expect([page.width, page.height]).toEqual([80, 120]);
    }
    expect(fs.readdirSync(shared.uploads).sort()).toEqual(["scan 1.jpg", "scan 2.png"]);
  });

  it("refuse les chemins, les fichiers cachés et ce qui n'est pas une image dans la galerie", async () => {
    const { chapter } = await library();
    fs.writeFileSync(path.join(root, "secret.png"), "x");
    fs.writeFileSync(path.join(shared.uploads, "notes.png"), "pas une image");

    for (const name of ["../secret.png", "..\\secret.png", "a/b.png", ".env.png", "video.mp4", "sans-extension", ""]) {
      await expect(api.importGalleryFiles(chapter.id, [name])).rejects.toThrow(/Fichier de la galerie invalide/);
    }
    await expect(api.importGalleryFiles(chapter.id, ["absent.png"])).rejects.toThrow(/introuvable dans la galerie/);
    await expect(api.importGalleryFiles(chapter.id, ["notes.png"])).rejects.toThrow(/n'est pas une image/);
    expect(fs.readdirSync(assetsDir())).toEqual([]);
  });
});

describe("scan studio : enregistrement d'une page", () => {
  async function onePage() {
    const { folder, chapter } = await library();
    const [page] = await api.importPages(chapter.id, [{ file: await upload(60, 90), name: "1.png" }]);
    return { folder, chapter, page };
  }

  it("marque une page « à laisser telle quelle » sans toucher à ses zones ni à sa révision", async () => {
    const { chapter, page } = await onePage();
    await api.savePage(page.id, { regions: [region("aaaaaaaaaaa1")], revision: 0 });

    const skipped = await api.setPageSkipped(page.id, true);
    expect(skipped.skipped).toBe(true);
    const view = await api.getPage(page.id);
    expect(view.page.skipped).toBe(true);
    expect(view.page.regions).toHaveLength(1);
    // L'atelier peut continuer d'enregistrer avec la révision qu'il connaît.
    expect(view.page.revision).toBe(1);
    expect((await api.getChapter(chapter.id)).pages[0].skipped).toBe(true);

    const restored = await api.setPageSkipped(page.id, false);
    expect(restored.skipped).toBe(false);
    expect((await api.getPage(page.id)).page.skipped).toBeUndefined();

    await expect(api.setPageSkipped(page.id, "oui" as unknown as boolean)).rejects.toThrow(/invalide/);
  });

  it("enregistre les zones, incrémente la révision et refuse une révision dépassée", async () => {
    const { chapter, page } = await onePage();
    const first = await api.savePage(page.id, { regions: [region("aaaaaaaaaaa1")], status: "translated", revision: 0 });
    expect(first.revision).toBe(1);

    await expect(api.savePage(page.id, { regions: [], revision: 0 })).rejects.toThrow(/modifiée ailleurs/);

    const view = await api.getPage(page.id);
    expect(view.page.revision).toBe(1);
    expect(view.page.status).toBe("translated");
    expect(view.page.regions).toHaveLength(1);
    expect(view.imageUrl).toBe(page.imageUrl);
    expect(view.chapter).toMatchObject({ id: chapter.id, number: "1", title: "Début", pageIds: [page.id] });

    // Sans `status`, l'état est gardé.
    const second = await api.savePage(page.id, { regions: [], revision: 1 });
    expect(second.revision).toBe(2);
    expect((await api.getPage(page.id)).page.status).toBe("translated");
    expect((await api.getChapter(chapter.id)).pages[0]).toMatchObject({ regionCount: 0, status: "translated" });
  });

  it("refuse une entrée mal formée et laisse la page intacte", async () => {
    const { page } = await onePage();
    await api.savePage(page.id, { regions: [region("aaaaaaaaaaa1")], revision: 0 });

    const attempts: unknown[] = [
      { regions: "tout", revision: 1 },
      { regions: [], revision: "1" },
      { regions: [], revision: 1, status: "fini" },
      { regions: [region("aaaaaaaaaaa1"), region("aaaaaaaaaaa1")], revision: 1 },
      { regions: [region("Pas-Un-Id!!!")], revision: 1 },
      { regions: [region("aaaaaaaaaaa2", { kind: "titre" as never })], revision: 1 },
      { regions: [region("aaaaaaaaaaa2", { mask: { ...DEFAULT_MASK, color: "javascript:alert(1)" } })], revision: 1 },
      null,
    ];
    for (const attempt of attempts) {
      await expect(api.savePage(page.id, attempt as never)).rejects.toThrow();
    }
    const view = await api.getPage(page.id);
    expect(view.page.revision).toBe(1);
    expect(view.page.regions.map((entry) => entry.id)).toEqual(["aaaaaaaaaaa1"]);
  });

  it("ramène les coordonnées dans la page et ne recopie pas les champs inconnus", async () => {
    const { page } = await onePage();
    const wild = {
      ...region("aaaaaaaaaaa1"),
      outline: [
        { x: -50, y: 10, z: 3 },
        { x: 9999, y: 10 },
        { x: 30, y: 9999 },
      ],
      onload: "alert(1)",
    };
    await api.savePage(page.id, { regions: [wild as never], revision: 0 });
    const [saved] = (await api.getPage(page.id)).page.regions;
    expect(saved.outline).toEqual([
      { x: 0, y: 10 },
      { x: 60, y: 10 },
      { x: 30, y: 90 },
    ]);
    expect(saved).not.toHaveProperty("onload");
  });
});

describe("scan studio : export et galerie", () => {
  async function chapterWithPages(count: number) {
    const { folder, chapter } = await library();
    const files = [];
    for (let index = 1; index <= count; index++) files.push({ file: await upload(), name: `${index}.png` });
    return { folder, chapter, pages: await api.importPages(chapter.id, files), files };
  }

  it("déclare un rendu, remplace le précédent et efface l'ancien fichier", async () => {
    const { pages } = await chapterWithPages(2);
    await api.savePage(pages[0].id, { regions: [region("aaaaaaaaaaa1")], revision: 0 });

    const first = await upload(600, 900);
    const summary = await api.registerExport(pages[0].id, first);
    expect(summary.status).toBe("exported");
    expect(summary.exportUrl).toBe(`/api/modules/scan-studio/data/assets/${first}`);
    expect(exists("thumbs", first.replace(".png", ".webp"))).toBe(true);
    // L'export ne change pas la révision : l'atelier peut enregistrer à la suite.
    expect((await api.getPage(pages[0].id)).page.revision).toBe(1);

    const second = await upload(600, 900);
    expect((await api.registerExport(pages[0].id, second)).exportUrl).toContain(second);
    expect(exists("assets", first)).toBe(false);
    expect(exists("thumbs", first.replace(".png", ".webp"))).toBe(false);
    expect(exists("assets", second)).toBe(true);

    await expect(api.registerExport(pages[1].id, second)).rejects.toThrow(/appartient déjà à une autre page/);
    await expect(api.registerExport(pages[0].id, "rendu.png")).rejects.toThrow("Rendu invalide.");
    await expect(api.registerExport(pages[0].id, "1760000000000-ffffffffff.png")).rejects.toThrow(/Rendu introuvable/);
    await expect(api.registerExport("cccccccccccc", second)).rejects.toThrow("Page introuvable.");
  });

  it("envoie les pages exportées dans la galerie, une seule fois chacune", async () => {
    const { chapter, pages } = await chapterWithPages(3);
    await expect(api.sendChapterToGallery(chapter.id)).rejects.toThrow("Aucune page exportée dans ce chapitre.");

    await api.registerExport(pages[0].id, await upload());
    await api.registerExport(pages[2].id, await upload());

    expect(await api.sendChapterToGallery(chapter.id)).toEqual({ saved: 2 });
    const copies = fs.readdirSync(shared.uploads);
    expect(copies).toHaveLength(2);
    for (const copy of copies) expect(copy).toMatch(/^[A-Za-z0-9_-]{12}\.png$/);
    expect([...shared.announced].sort()).toEqual([...copies].sort());
    // Une page de scan entre dans la galerie en privé.
    expect([...shared.secured].sort()).toEqual([...copies].sort());

    // Rien n'est recopié tant que les copies existent ; une copie effacée est refaite.
    expect(await api.sendChapterToGallery(chapter.id)).toEqual({ saved: 0 });
    fs.rmSync(path.join(shared.uploads, copies[0]));
    expect(await api.sendChapterToGallery(chapter.id)).toEqual({ saved: 1 });
    expect(fs.readdirSync(shared.uploads)).toHaveLength(2);
  });

  it("propose les pages exportées à la galerie, de la plus récente à la plus ancienne", async () => {
    const { chapter, pages } = await chapterWithPages(2);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(1_770_000_000_000);
      await api.registerExport(pages[0].id, await upload());
      vi.setSystemTime(1_770_000_060_000);
      await api.registerExport(pages[1].id, await upload());
    } finally {
      vi.useRealTimers();
    }

    const listing = await api.listGalleryItems({});
    expect(listing).toMatchObject({ total: 2, hasMore: false });
    expect(listing.items.map((item) => item.id)).toEqual([pages[1].id, pages[0].id]);
    expect(listing.items[0]).toMatchObject({ kind: "image", name: "Série test – chapitre 1, page 2", caption: "2.png" });
    expect(listing.items[0].thumbnail).toMatch(/^\/api\/modules\/scan-studio\/data\/thumbs\/[\w-]+\.webp$/);
    expect(exists("thumbs", path.basename(listing.items[0].thumbnail))).toBe(true);
    expect(listing.items[0].galleryFile).toBeUndefined();

    expect((await api.listGalleryItems({ limit: 1 })).hasMore).toBe(true);
    expect((await api.listGalleryItems({ search: "page 1" })).items.map((item) => item.id)).toEqual([pages[0].id]);

    const result = await api.importGalleryItems([pages[0].id, pages[0].id, "cccccccccccc", "../x"]);
    expect(result.saved).toHaveLength(2);
    expect(result.saved[0].fileName).toBe(result.saved[1].fileName);
    expect(result.failed.map((entry) => entry.id)).toEqual(["cccccccccccc", "../x"]);
    expect(fs.readdirSync(shared.uploads)).toEqual([result.saved[0].fileName]);
    expect(shared.announced).toEqual([result.saved[0].fileName]);

    const after = await api.listGalleryItems({});
    expect(after.items.find((item) => item.id === pages[0].id)?.galleryFile).toBe(result.saved[0].fileName);
    expect((await api.sendChapterToGallery(chapter.id)).saved).toBe(1);
  });
});

describe("scan studio : suppressions", () => {
  it("efface une page avec sa fiche, sa vignette, son image et son rendu", async () => {
    const { chapter } = await library();
    const source = await upload();
    const [page, other] = await api.importPages(chapter.id, [
      { file: source, name: "1.png" },
      { file: await upload(), name: "2.png" },
    ]);
    const rendered = await upload();
    await api.registerExport(page.id, rendered);

    expect(await api.deletePage(page.id)).toEqual({ deleted: true });
    expect(exists("pages", `${page.id}.json`)).toBe(false);
    expect(exists("thumbs", `${page.id}.webp`)).toBe(false);
    expect(exists("thumbs", rendered.replace(".png", ".webp"))).toBe(false);
    expect(exists("assets", source)).toBe(false);
    expect(exists("assets", rendered)).toBe(false);
    expect((await api.getChapter(chapter.id)).chapter.pageIds).toEqual([other.id]);
    expect((await api.listGalleryItems({})).total).toBe(0);
    await expect(api.deletePage(page.id)).rejects.toThrow("Page introuvable.");
  });

  it("garde une image tant qu'une autre page s'en sert", async () => {
    const { folder, chapter } = await library();
    const second = await api.createChapter(folder.id, { number: "2" });
    const sharedFile = await upload();
    const [first] = await api.importPages(chapter.id, [{ file: sharedFile, name: "1.png" }]);
    const [twin] = await api.importPages(second.id, [{ file: sharedFile, name: "1.png" }]);

    await api.deletePage(first.id);
    expect(exists("assets", sharedFile)).toBe(true);
    await api.deletePage(twin.id);
    expect(exists("assets", sharedFile)).toBe(false);
  });

  it("efface un chapitre puis un dossier sans rien laisser sur le disque", async () => {
    const { folder, chapter } = await library();
    const second = await api.createChapter(folder.id, { number: "2" });
    const [page] = await api.importPages(chapter.id, [{ file: await upload(), name: "1.png" }]);
    await api.importPages(second.id, [
      { file: await upload(), name: "1.png" },
      { file: await upload(), name: "2.png" },
    ]);
    await api.registerExport(page.id, await upload());

    // Un autre dossier, qui doit survivre.
    const keeper = await api.createFolder({ name: "À garder" });
    const kept = await api.createChapter(keeper.id, { number: "1" });
    const [keptPage] = await api.importPages(kept.id, [{ file: await upload(), name: "1.png" }]);

    expect(await api.deleteChapter(chapter.id)).toEqual({ deleted: true });
    expect((await api.getFolder(folder.id)).folder.chapterIds).toEqual([second.id]);
    await expect(api.getPage(page.id)).rejects.toThrow("Page introuvable.");
    expect(fs.readdirSync(assetsDir())).toHaveLength(3);

    expect(await api.deleteFolder(folder.id)).toEqual({ deleted: true });
    await expect(api.getChapter(second.id)).rejects.toThrow("Chapitre introuvable.");
    expect(fs.readdirSync(assetsDir())).toEqual([path.basename(keptPage.imageUrl)]);
    expect(fs.readdirSync(thumbsDir())).toEqual([`${keptPage.id}.webp`]);
    expect(fs.readdirSync(path.join(root, "data", "pages"))).toEqual([`${keptPage.id}.json`]);
    expect(fs.readdirSync(path.join(root, "data", "chapters"))).toEqual([`${kept.id}.json`]);
    expect((await api.listFolders()).map((entry) => entry.id)).toEqual([keeper.id]);
  });

  it("réordonne les pages et refuse un ordre incomplet", async () => {
    const { chapter } = await library();
    const pages = await api.importPages(chapter.id, [
      { file: await upload(), name: "1.png" },
      { file: await upload(), name: "2.png" },
    ]);
    const reordered = await api.reorderPages(chapter.id, [pages[1].id, pages[0].id]);
    expect(reordered.pageIds).toEqual([pages[1].id, pages[0].id]);
    expect((await api.getChapter(chapter.id)).pages.map((page) => page.name)).toEqual(["2.png", "1.png"]);
    await expect(api.reorderPages(chapter.id, [pages[0].id])).rejects.toThrow(/ne correspond pas/);
    await expect(api.reorderPages(chapter.id, [pages[0].id, "cccccccccccc"])).rejects.toThrow(/ne correspond pas/);
  });
});
