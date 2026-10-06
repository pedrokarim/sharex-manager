import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => ({ uploads: "" }));

vi.mock("@/lib/config", () => ({ getAbsoluteUploadPath: () => shared.uploads }));

import * as api from "@/modules/scan-studio/index.process";
import { recordChapterOrigin } from "@/modules/scan-studio/lib/server/library";
import { resetPublicCache } from "@/modules/scan-studio/lib/server/public";
import { PUBLIC_SLUG_PATTERN, pageToken } from "@/modules/scan-studio/lib/server/visibility";
import { setDataRoot } from "@/modules/scan-studio/lib/store";
import { DEFAULT_CHAPTER_SETTINGS, DEFAULT_MASK, type ScanRegion } from "@/modules/scan-studio/lib/types";

let root = "";
let counter = 0;

const assetsDir = () => path.join(root, "data", "assets");

/** Dépose une image fabriquée par le code, comme le ferait la route d'envoi, et rend son nom. */
async function upload(color = "#c83c3c"): Promise<string> {
  const buffer = await sharp({ create: { width: 60, height: 90, channels: 3, background: color } })
    .png()
    .toBuffer();
  const file = `${1_770_000_000_000 + counter}-${(counter++).toString(16).padStart(10, "0")}.png`;
  fs.mkdirSync(assetsDir(), { recursive: true });
  fs.writeFileSync(path.join(assetsDir(), file), buffer);
  return file;
}

function region(id: string): ScanRegion {
  return {
    id,
    kind: "dialogue",
    outline: [
      { x: 5, y: 5 },
      { x: 40, y: 5 },
      { x: 40, y: 30 },
    ],
    direction: "horizontal",
    reading: { raw: "TEXTE LU SECRET", clean: "Texte lu secret", confidence: 1, engine: "manual", edited: true },
    translation: { text: "Traduction de travail", status: "edited", engine: "manual", history: [] },
    mask: { ...DEFAULT_MASK },
    text: { box: { x: 5, y: 5, width: 35, height: 25, rotation: 0 }, style: null, autoFit: true },
  };
}

/** Un dossier, un chapitre et `count` pages ; les pages dont le rang est dans `exported` ont un rendu. */
async function chapterWith(count: number, exported: number[], folderId?: string, number = "1") {
  const folder = folderId ? (await api.getFolder(folderId)).folder : await api.createFolder({ name: "Série inventée" });
  const chapter = await api.createChapter(folder.id, { number });
  const sources: string[] = [];
  for (let index = 0; index < count; index++) sources.push(await upload());
  const pages = await api.importPages(
    chapter.id,
    sources.map((file, index) => ({ file, name: `${index + 1}.png` }))
  );
  const renders: Record<number, string> = {};
  for (const index of exported) {
    renders[index] = await upload("#3c64c8");
    await api.registerExport(pages[index].id, renders[index]);
  }
  return { folder, chapter, pages, sources, renders };
}

const slugsOf = async (chapterId: string) => {
  const view = await api.getChapter(chapterId);
  const [, , , seriesSlug, chapterSlug] = (view.publicPath ?? "").split("/");
  return { seriesSlug, chapterSlug, path: view.publicPath };
};

/** Le jeton et le chemin d'une adresse d'image publique. */
const partsOf = (url: string) => url.replace("/api/public/sections/scans/media/", "").split("/");

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-studio-public-"));
  shared.uploads = path.join(root, "uploads");
  fs.mkdirSync(shared.uploads, { recursive: true });
  setDataRoot(path.join(root, "data"));
  resetPublicCache();
});

afterEach(() => {
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

describe("lecture publique : privé par défaut", () => {
  it("ne publie rien tant que le propriétaire n'a rien demandé", async () => {
    const { folder, chapter } = await chapterWith(2, [0, 1]);
    expect(chapter.visibility).toBeUndefined();
    expect(chapter.publicSlug).toBeUndefined();
    expect((await api.getFolder(folder.id)).folder.publicSlug).toBeUndefined();

    const view = await api.getChapter(chapter.id);
    expect(view.publicPath).toBeUndefined();
    expect(view.publishablePages).toBe(2);
    expect((await api.getFolder(folder.id)).chapters[0]).toMatchObject({ visibility: "private", publishablePages: 2 });

    expect(await api.listPublicSeries()).toEqual({ collections: [] });
    // Les identifiants internes ne sont pas des adresses.
    expect(await api.getPublicSeries(folder.id)).toBeNull();
    expect(await api.getPublicChapter(folder.id, chapter.id)).toBeNull();
    expect(await api.openPublicMedia([chapter.id, "0".repeat(24)])).toBeNull();
  });

  it("refuse de publier un chapitre sans page exportée, et une visibilité inconnue", async () => {
    const { chapter, pages } = await chapterWith(2, []);
    await expect(api.setChapterVisibility(chapter.id, "link")).rejects.toThrow(/aucune page exportée/);
    await expect(api.setChapterVisibility(chapter.id, "catalog")).rejects.toThrow(/aucune page exportée/);
    await expect(api.setChapterVisibility(chapter.id, "public" as never)).rejects.toThrow("Visibilité inconnue.");
    await expect(api.setChapterVisibility("aaaaaaaaaaaa", "link")).rejects.toThrow("Chapitre introuvable.");
    expect((await api.getChapter(chapter.id)).chapter.visibility).toBeUndefined();

    // Une page « laissée telle quelle » ne compte pas, même avec un rendu.
    await api.registerExport(pages[0].id, await upload());
    await api.setPageSkipped(pages[0].id, true);
    await expect(api.setChapterVisibility(chapter.id, "link")).rejects.toThrow(/aucune page exportée/);

    // Rester privé est toujours permis.
    expect(await api.setChapterVisibility(chapter.id, "private")).toMatchObject({ visibility: "private", publishablePages: 0 });
  });
});

describe("lecture publique : chapitre partagé par son lien", () => {
  it("se lit par une adresse imprévisible, sans apparaître au catalogue", async () => {
    const { folder, chapter, renders } = await chapterWith(4, [0, 2]);
    const sharing = await api.setChapterVisibility(chapter.id, "link");
    expect(sharing).toMatchObject({ visibility: "link", publishablePages: 2 });

    const { seriesSlug, chapterSlug, path: publicPath } = await slugsOf(chapter.id);
    expect(publicPath).toBe(`/catalog/scans/${seriesSlug}/${chapterSlug}`);
    expect(sharing.publicPath).toBe(publicPath);
    expect(seriesSlug).toMatch(PUBLIC_SLUG_PATTERN);
    expect(chapterSlug).toMatch(PUBLIC_SLUG_PATTERN);
    expect(seriesSlug.startsWith(folder.id)).toBe(true);
    expect(chapterSlug.startsWith(chapter.id)).toBe(true);

    const item = await api.getPublicChapter(seriesSlug, chapterSlug);
    expect(item).toMatchObject({ slug: chapterSlug, title: "Chapitre 1", listed: false, reading: "paged-rtl", collection: { slug: seriesSlug, title: "Série inventée" } });
    // Deux pages exportées sur quatre : seules elles sont là, dans l'ordre.
    expect(item!.pages).toHaveLength(2);
    expect(item!.pages.map((page) => partsOf(page.url)[1])).toEqual([pageToken(chapterSlug, renders[0]), pageToken(chapterSlug, renders[2])]);
    expect(item!.pages[0]).toMatchObject({ width: 60, height: 90 });
    for (const page of item!.pages) expect(page.url).toMatch(/^\/api\/public\/sections\/scans\/media\/[a-z0-9]{28}\/[0-9a-f]{24}$/);

    // Non listé : ni dans la rubrique, ni de page de série.
    expect(await api.listPublicSeries()).toEqual({ collections: [] });
    expect(await api.getPublicSeries(seriesSlug)).toBeNull();
  });

  it("ne laisse sortir ni nom de fichier, ni donnée de travail", async () => {
    const { folder, chapter, pages, sources, renders } = await chapterWith(3, [0, 1]);
    await api.savePage(pages[0].id, { regions: [region("aaaaaaaaaaa1")], revision: 0 });
    await api.updateFolder(folder.id, { glossary: [{ source: "Terme de glossaire", target: "Terme cible" }] });
    await api.setChapterVisibility(chapter.id, "catalog");
    const { seriesSlug, chapterSlug } = await slugsOf(chapter.id);

    const everything = JSON.stringify([await api.listPublicSeries(), await api.getPublicSeries(seriesSlug), await api.getPublicChapter(seriesSlug, chapterSlug)]);
    for (const file of [...sources, ...Object.values(renders)]) {
      expect(everything).not.toContain(file);
      expect(everything).not.toContain(file.replace(".png", ""));
    }
    for (const secret of ["Texte lu secret", "TEXTE LU SECRET", "Traduction de travail", "Terme de glossaire", "regions", "glossary", "/data/assets/", "/api/modules/"]) {
      expect(everything).not.toContain(secret);
    }
    // Les identifiants des pages ne sortent pas non plus.
    for (const page of pages) expect(everything).not.toContain(page.id);
  });

  it("montre la source et le crédit notés à l'import", async () => {
    const { chapter } = await chapterWith(1, [0]);
    recordChapterOrigin(chapter.id, { source: " Site  inventé ", url: "https://example.org/chapitre/1", credit: "Équipe inventée" });
    await api.setChapterVisibility(chapter.id, "link");
    const { seriesSlug, chapterSlug } = await slugsOf(chapter.id);
    expect((await api.getPublicChapter(seriesSlug, chapterSlug))!.credits).toEqual([
      { label: "Source", value: "Site inventé", href: "https://example.org/chapitre/1" },
      { label: "Traduction d’origine", value: "Équipe inventée" },
    ]);

    // Une adresse qui n'en est pas une n'est pas gardée ; sans nom de site, rien n'est noté.
    recordChapterOrigin(chapter.id, { source: "Site inventé", url: "javascript:alert(1)" });
    expect((await api.getChapter(chapter.id)).chapter.origin).toEqual({ source: "Site inventé" });
    expect((await api.getPublicChapter(seriesSlug, chapterSlug))!.credits).toEqual([{ label: "Source", value: "Site inventé" }]);
    recordChapterOrigin(chapter.id, { source: "", credit: "Sans site" });
    expect((await api.getChapter(chapter.id)).chapter.origin).toEqual({ source: "Site inventé" });
  });

  it("choisit le mode de lecture d'après le format du chapitre", async () => {
    const { chapter } = await chapterWith(1, [0]);
    await api.setChapterVisibility(chapter.id, "link");
    const { seriesSlug, chapterSlug } = await slugsOf(chapter.id);
    const reading = async () => (await api.getPublicChapter(seriesSlug, chapterSlug))!.reading;

    expect(await reading()).toBe("paged-rtl");
    await api.updateChapter(chapter.id, { settings: { ...DEFAULT_CHAPTER_SETTINGS, format: "manhua" } });
    expect(await reading()).toBe("paged-ltr");
    await api.updateChapter(chapter.id, { settings: { ...DEFAULT_CHAPTER_SETTINGS, format: "webtoon" } });
    expect(await reading()).toBe("scroll");
  });
});

describe("lecture publique : images", () => {
  it("ne sert que le rendu d'une page lisible, par son jeton", async () => {
    const { chapter, pages, renders } = await chapterWith(3, [0, 1]);
    await api.setChapterVisibility(chapter.id, "link");
    const { chapterSlug } = await slugsOf(chapter.id);
    const token = pageToken(chapterSlug, renders[0]);

    expect(await api.openPublicMedia([chapterSlug, token])).toEqual({ file: `assets/${renders[0]}`, indexable: false });
    expect(await api.openPublicMedia([chapterSlug, token, "thumb"])).toEqual({ file: `thumbs/${renders[0].replace(".png", ".webp")}`, indexable: false });
    expect(fs.existsSync(path.join(root, "data", "thumbs", renders[0].replace(".png", ".webp")))).toBe(true);

    await api.setChapterVisibility(chapter.id, "catalog");
    expect(await api.openPublicMedia([chapterSlug, token])).toEqual({ file: `assets/${renders[0]}`, indexable: true });

    // Une page mise de côté cesse d'être servie, son rendu aussi.
    await api.setPageSkipped(pages[0].id, true);
    expect(await api.openPublicMedia([chapterSlug, token])).toBeNull();
    await api.setPageSkipped(pages[0].id, false);
    expect(await api.openPublicMedia([chapterSlug, token])).not.toBeNull();

    // Un nouvel export change l'adresse : l'ancienne ne désigne plus rien.
    const next = await upload("#3cc864");
    await api.registerExport(pages[0].id, next);
    expect(await api.openPublicMedia([chapterSlug, token])).toBeNull();
    expect(await api.openPublicMedia([chapterSlug, pageToken(chapterSlug, next)])).toEqual({ file: `assets/${next}`, indexable: true });
  });

  it("ne se laisse mener ni à une image d'origine, ni à une page non exportée, ni hors des données", async () => {
    const { chapter, pages, sources, renders } = await chapterWith(3, [0]);
    await api.setChapterVisibility(chapter.id, "link");
    const { chapterSlug } = await slugsOf(chapter.id);
    const good = pageToken(chapterSlug, renders[0]);
    expect(await api.openPublicMedia([chapterSlug, good])).not.toBeNull();

    const attempts: unknown[] = [
      // Le jeton qu'aurait une image d'origine, ou une page sans rendu.
      [chapterSlug, pageToken(chapterSlug, sources[0])],
      [chapterSlug, pageToken(chapterSlug, sources[1])],
      // Des noms de fichiers, des chemins, des identifiants à la place du jeton.
      [chapterSlug, sources[0]],
      [chapterSlug, renders[0]],
      [chapterSlug, `../assets/${sources[0]}`],
      [chapterSlug, "..", "..", "secret.png"],
      [chapterSlug, pages[0].id],
      [chapterSlug, good, "original"],
      [chapterSlug, good, "../../assets"],
      [chapterSlug, good.toUpperCase()],
      [chapterSlug, `${good}0`],
      // L'identifiant du chapitre, ou une adresse voisine, à la place de l'adresse.
      [chapter.id, good],
      [`${chapter.id}${"a".repeat(16)}`, good],
      [chapterSlug.slice(0, -1), good],
      [`${chapterSlug}/`, good],
      ["../chapters", good],
      // Des formes inattendues.
      [chapterSlug],
      [],
      [chapterSlug, good, "thumb", "extra"],
      [chapterSlug, 12],
      [null, good],
      `${chapterSlug}/${good}`,
      { 0: chapterSlug, 1: good, length: 2 },
      null,
      undefined,
    ];
    for (const attempt of attempts) expect(await api.openPublicMedia(attempt as never)).toBeNull();

    // Un rendu qui ne serait que l'image d'origine n'est jamais publié, même écrit à la main dans la fiche.
    const pageFile = path.join(root, "data", "pages", `${pages[1].id}.json`);
    const forged = JSON.parse(fs.readFileSync(pageFile, "utf8"));
    forged.exported = { file: sources[1], at: Date.now() };
    fs.writeFileSync(pageFile, JSON.stringify(forged));
    expect(await api.openPublicMedia([chapterSlug, pageToken(chapterSlug, sources[1])])).toBeNull();
    forged.exported = { file: "../../secret.png", at: Date.now() };
    fs.writeFileSync(pageFile, JSON.stringify(forged));
    expect(await api.openPublicMedia([chapterSlug, pageToken(chapterSlug, "../../secret.png")])).toBeNull();
  });

  it("ne sert pas, sous l'adresse d'un chapitre, les pages d'un autre", async () => {
    const first = await chapterWith(1, [0]);
    const second = await chapterWith(1, [0], first.folder.id, "2");
    await api.setChapterVisibility(first.chapter.id, "link");
    const { chapterSlug } = await slugsOf(first.chapter.id);

    // Le second chapitre est privé : son rendu n'a pas de jeton valable sous l'adresse du premier.
    expect(await api.openPublicMedia([chapterSlug, pageToken(chapterSlug, second.renders[0])])).toBeNull();

    // Une fiche de chapitre qui citerait la page d'un chapitre privé ne la sert pas davantage.
    const chapterFile = path.join(root, "data", "chapters", `${first.chapter.id}.json`);
    const forged = JSON.parse(fs.readFileSync(chapterFile, "utf8"));
    forged.pageIds.push(second.pages[0].id);
    fs.writeFileSync(chapterFile, JSON.stringify(forged));
    expect(await api.openPublicMedia([chapterSlug, pageToken(chapterSlug, second.renders[0])])).toBeNull();
    expect((await api.getPublicChapter((await slugsOf(first.chapter.id)).seriesSlug, chapterSlug))!.pages).toHaveLength(1);
  });
});

describe("lecture publique : retour en privé", () => {
  it("coupe l'accès tout de suite, y compris après une première lecture, et efface l'adresse", async () => {
    const { chapter, renders } = await chapterWith(2, [0, 1]);
    await api.setChapterVisibility(chapter.id, "catalog");
    const { seriesSlug, chapterSlug } = await slugsOf(chapter.id);
    const token = pageToken(chapterSlug, renders[0]);

    // Première lecture : les fiches sont maintenant en mémoire.
    expect((await api.listPublicSeries()).collections).toHaveLength(1);
    expect(await api.getPublicSeries(seriesSlug)).not.toBeNull();
    expect(await api.getPublicChapter(seriesSlug, chapterSlug)).not.toBeNull();
    expect(await api.openPublicMedia([chapterSlug, token])).not.toBeNull();

    expect(await api.setChapterVisibility(chapter.id, "private")).toEqual({ visibility: "private", publicPath: undefined, publishablePages: 2 });

    expect(await api.listPublicSeries()).toEqual({ collections: [] });
    expect(await api.getPublicSeries(seriesSlug)).toBeNull();
    expect(await api.getPublicChapter(seriesSlug, chapterSlug)).toBeNull();
    expect(await api.openPublicMedia([chapterSlug, token])).toBeNull();
    expect(await api.openPublicMedia([chapterSlug, token, "thumb"])).toBeNull();
    expect((await api.getChapter(chapter.id)).chapter.publicSlug).toBeUndefined();

    // Republier donne une autre adresse : l'ancien lien reste mort.
    await api.setChapterVisibility(chapter.id, "link");
    const again = await slugsOf(chapter.id);
    expect(again.chapterSlug).not.toBe(chapterSlug);
    expect(again.seriesSlug).toBe(seriesSlug);
    expect(await api.getPublicChapter(seriesSlug, chapterSlug)).toBeNull();
    expect(await api.openPublicMedia([chapterSlug, token])).toBeNull();
    expect(await api.getPublicChapter(seriesSlug, again.chapterSlug)).not.toBeNull();
  });

  it("ne sert plus un chapitre supprimé, ni un rendu effacé", async () => {
    const { folder, chapter, pages, renders } = await chapterWith(2, [0, 1]);
    const other = await chapterWith(1, [0], folder.id, "2");
    await api.setChapterVisibility(chapter.id, "catalog");
    await api.setChapterVisibility(other.chapter.id, "catalog");
    const { seriesSlug, chapterSlug } = await slugsOf(chapter.id);
    const otherSlug = (await slugsOf(other.chapter.id)).chapterSlug;
    expect((await api.getPublicChapter(seriesSlug, chapterSlug))!.pages).toHaveLength(2);

    // Une page supprimée disparaît de la lecture.
    await api.deletePage(pages[0].id);
    expect((await api.getPublicChapter(seriesSlug, chapterSlug))!.pages).toHaveLength(1);
    expect(await api.openPublicMedia([chapterSlug, pageToken(chapterSlug, renders[0])])).toBeNull();

    await api.deleteChapter(chapter.id);
    expect(await api.getPublicChapter(seriesSlug, chapterSlug)).toBeNull();
    expect(await api.openPublicMedia([chapterSlug, pageToken(chapterSlug, renders[1])])).toBeNull();
    expect((await api.getPublicSeries(seriesSlug))!.items.map((item) => item.slug)).toEqual([otherSlug]);

    await api.deleteFolder(folder.id);
    expect(await api.listPublicSeries()).toEqual({ collections: [] });
    expect(await api.getPublicSeries(seriesSlug)).toBeNull();
    expect(await api.getPublicChapter(seriesSlug, otherSlug)).toBeNull();
  });
});

describe("lecture publique : catalogue", () => {
  it("liste les séries qui ont un chapitre listé, puis leurs chapitres", async () => {
    const first = await chapterWith(2, [0, 1]);
    const second = await chapterWith(1, [0], first.folder.id, "2");
    const unlisted = await chapterWith(1, [0], first.folder.id, "3");
    const hidden = await chapterWith(1, [0], first.folder.id, "4");
    await api.updateChapter(second.chapter.id, { title: "Suite" });
    await api.setChapterVisibility(first.chapter.id, "catalog");
    await api.setChapterVisibility(second.chapter.id, "catalog");
    await api.setChapterVisibility(unlisted.chapter.id, "link");
    // Un autre dossier, entièrement privé.
    await chapterWith(1, [0]);

    const { seriesSlug, chapterSlug } = await slugsOf(first.chapter.id);
    const secondSlug = (await slugsOf(second.chapter.id)).chapterSlug;
    const unlistedSlug = (await slugsOf(unlisted.chapter.id)).chapterSlug;

    const listing = await api.listPublicSeries();
    expect(listing.collections).toHaveLength(1);
    expect(listing.collections[0]).toMatchObject({ slug: seriesSlug, title: "Série inventée", count: 2 });
    expect(listing.collections[0].cover).toBe(`/api/public/sections/scans/media/${chapterSlug}/${pageToken(chapterSlug, first.renders[0])}/thumb`);

    const series = await api.getPublicSeries(seriesSlug);
    expect(series).toMatchObject({ slug: seriesSlug, title: "Série inventée" });
    expect(series!.items.map((item) => [item.slug, item.title, item.subtitle, item.count])).toEqual([
      [chapterSlug, "Chapitre 1", undefined, 2],
      [secondSlug, "Chapitre 2", "Suite", 1],
    ]);

    // Voisins d'un chapitre listé : seulement des chapitres listés. L'adresse non listée n'y paraît pas.
    const listed = await api.getPublicChapter(seriesSlug, secondSlug);
    expect(listed).toMatchObject({ listed: true, title: "Chapitre 2 · Suite", previous: { slug: chapterSlug, title: "Chapitre 1" } });
    expect(listed!.next).toBeUndefined();
    expect(JSON.stringify([listing, series, listed])).not.toContain(unlistedSlug);

    // Voisins d'un chapitre partagé par son lien : tous les chapitres publics de la série, jamais un privé.
    const byLink = await api.getPublicChapter(seriesSlug, unlistedSlug);
    expect(byLink).toMatchObject({ listed: false, previous: { slug: secondSlug } });
    expect(byLink!.next).toBeUndefined();
    expect(JSON.stringify(byLink)).not.toContain(hidden.chapter.id);

    // L'adresse d'une série ne mène pas au chapitre d'une autre.
    const elsewhere = await chapterWith(1, [0]);
    await api.setChapterVisibility(elsewhere.chapter.id, "catalog");
    const foreign = await slugsOf(elsewhere.chapter.id);
    expect(await api.getPublicChapter(seriesSlug, foreign.chapterSlug)).toBeNull();
    expect(await api.getPublicChapter(foreign.seriesSlug, chapterSlug)).toBeNull();
    expect((await api.listPublicSeries()).collections).toHaveLength(2);
  });

  it("donne aux nouveaux chapitres la visibilité choisie pour le dossier, sans rien montrer avant un export", async () => {
    const folder = await api.createFolder({ name: "Série inventée" });
    await expect(api.updateFolder(folder.id, { defaultVisibility: "tout le monde" as never })).rejects.toThrow("Visibilité inconnue.");
    expect((await api.updateFolder(folder.id, { defaultVisibility: "catalog" })).defaultVisibility).toBe("catalog");

    const chapter = await api.createChapter(folder.id, { number: "1" });
    expect(chapter.visibility).toBe("catalog");
    expect(chapter.publicSlug).toMatch(PUBLIC_SLUG_PATTERN);
    const { seriesSlug, chapterSlug } = await slugsOf(chapter.id);

    // Public, mais sans page exportée : rien n'est servi, la série n'a pas de page.
    const [page] = await api.importPages(chapter.id, [{ file: await upload(), name: "1.png" }]);
    expect(await api.listPublicSeries()).toEqual({ collections: [] });
    expect(await api.getPublicSeries(seriesSlug)).toBeNull();
    expect(await api.getPublicChapter(seriesSlug, chapterSlug)).toBeNull();

    await api.registerExport(page.id, await upload());
    expect((await api.listPublicSeries()).collections).toHaveLength(1);
    expect((await api.getPublicChapter(seriesSlug, chapterSlug))!.pages).toHaveLength(1);

    // Revenir à « privé » pour les suivants ne touche pas aux chapitres existants.
    expect((await api.updateFolder(folder.id, { defaultVisibility: "private" })).defaultVisibility).toBeUndefined();
    expect((await api.createChapter(folder.id, { number: "2" })).visibility).toBeUndefined();
    expect((await api.getChapter(chapter.id)).chapter.visibility).toBe("catalog");
  });
});
