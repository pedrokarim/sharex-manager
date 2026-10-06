import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync, zipSync } from "fflate";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => ({ uploads: "" }));

vi.mock("@/lib/config", () => ({ getAbsoluteUploadPath: () => shared.uploads }));

import * as api from "@/modules/scan-studio/index.process";
import { createBlobSink, extractArchiveImages, planChapterArchive, writeArchive, type ArchiveEntry } from "@/modules/scan-studio/lib/library-archive";
import { IMPORT_BATCH_SIZE, archiveFileName, archivePageName, chunkList } from "@/modules/scan-studio/lib/library-helpers";
import { MAX_IMPORT_FILES } from "@/modules/scan-studio/lib/server/library";
import { setDataRoot } from "@/modules/scan-studio/lib/store";

let root = "";
let counter = 0;

const assetsDir = () => path.join(root, "data", "assets");

/** Une image fabriquée par le code, d'une couleur donnée. */
async function picture(color: string, format: "png" | "jpeg" | "webp" = "png", width = 40, height = 60): Promise<Uint8Array> {
  const image = sharp({ create: { width, height, channels: 3, background: color } });
  return new Uint8Array(await (format === "png" ? image.png() : format === "jpeg" ? image.jpeg() : image.webp()).toBuffer());
}

/** Dépose des octets comme le ferait la route d'envoi : le nom suit le type réel, pas le nom d'origine. */
function deposit(bytes: Uint8Array): string {
  const extension = bytes[0] === 0x89 ? "png" : bytes[0] === 0xff ? "jpg" : "webp";
  const file = `${1_780_000_000_000 + counter}-${(counter++).toString(16).padStart(10, "0")}.${extension}`;
  fs.mkdirSync(assetsDir(), { recursive: true });
  fs.writeFileSync(path.join(assetsDir(), file), bytes);
  return file;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-studio-cbz-"));
  shared.uploads = path.join(root, "uploads");
  fs.mkdirSync(shared.uploads, { recursive: true });
  setDataRoot(path.join(root, "data"));
});

afterEach(() => {
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

describe("archive .cbz : noms", () => {
  it("numérote les pages avec assez de zéros pour garder l'ordre", () => {
    expect(archivePageName(0, 9, "png")).toBe("001.png");
    expect(archivePageName(9, 120, "jpg")).toBe("010.jpg");
    expect(archivePageName(119, 120, "JPEG")).toBe("120.jpg");
    expect(archivePageName(0, 1500, "webp")).toBe("0001.webp");
    expect(archivePageName(0, 0, "../x")).toBe("001.x");
    expect(archivePageName(2, 5, "")).toBe("003.png");

    // L'ordre alphabétique des noms est l'ordre de lecture, même au-delà de mille pages.
    const names = Array.from({ length: 1200 }, (_, index) => archivePageName(index, 1200, "png"));
    expect([...names].sort()).toEqual(names);
  });

  it("nomme l'archive d'après la série et le chapitre, sans caractère interdit", () => {
    expect(archiveFileName("Série inventée", { number: "7" })).toBe("Série inventée - Chapitre 007.cbz");
    expect(archiveFileName("Série inventée", { number: "12.5" })).toBe("Série inventée - Chapitre 012.5.cbz");
    expect(archiveFileName("Série inventée", { number: "Extra" })).toBe("Série inventée - Extra.cbz");
    expect(archiveFileName('A/B\\C: "D" <E>|F?*', { number: "1" })).toBe("A B C D E F - Chapitre 001.cbz");
    expect(archiveFileName("...", { number: "  " })).toBe("Chapitre.cbz");
    expect(archiveFileName("x".repeat(300), { number: "1" }).length).toBeLessThanOrEqual(80 + " - Chapitre 001.cbz".length);
    expect(archiveFileName("Nom\u0000avec\u001fcontrôle.", { number: "2" })).toBe("Nom avec contrôle - Chapitre 002.cbz");
  });
});

describe("archive .cbz : contenu", () => {
  it("range les pages exportées dans l'ordre, et telles quelles les pages laissées telles quelles", () => {
    const plan = planChapterArchive([
      { id: "p1", skipped: true, imageUrl: "/data/assets/cover.jpg", exportUrl: undefined },
      { id: "p2", skipped: false, imageUrl: "/data/assets/a.png", exportUrl: "/data/assets/a-export.png" },
      { id: "p3", skipped: false, imageUrl: "/data/assets/b.png", exportUrl: undefined },
      // Mise de côté après un export : c'est l'image d'origine qui part, sans retouche.
      { id: "p4", skipped: true, imageUrl: "/data/assets/c.webp", exportUrl: "/data/assets/c-export.png" },
      { id: "p5", skipped: false, imageUrl: "/data/assets/d.png", exportUrl: "/data/assets/d-export.webp?v=2" },
    ]);
    expect(plan.missing).toBe(1);
    expect(plan.pages).toEqual([
      { pageId: "p1", url: "/data/assets/cover.jpg", name: "001.jpg" },
      { pageId: "p2", url: "/data/assets/a-export.png", name: "002.png" },
      { pageId: "p4", url: "/data/assets/c.webp", name: "003.webp" },
      { pageId: "p5", url: "/data/assets/d-export.webp?v=2", name: "004.webp" },
    ]);
    expect(planChapterArchive([])).toEqual({ pages: [], missing: 0 });
  });

  it("écrit un zip lisible, page après page, sans jamais en tenir deux en mémoire", async () => {
    const colors = ["#aa0000", "#00aa00", "#0000aa", "#aaaa00"];
    const pages = await Promise.all(colors.map((color) => picture(color)));
    let held = 0;
    let peak = 0;
    const order: string[] = [];
    const written: Uint8Array[] = [];
    const entries: ArchiveEntry[] = pages.map((bytes, index) => ({
      name: archivePageName(index, pages.length, "png"),
      read: async () => {
        held++;
        peak = Math.max(peak, held);
        order.push(`lue ${index}`);
        return bytes;
      },
    }));

    const total = await writeArchive(
      entries,
      {
        // Le puits est lent : la page suivante ne doit être lue qu'une fois celle-ci partie.
        write: async (chunk) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          written.push(new Uint8Array(chunk));
        },
      },
      {
        onEntry: (index) => {
          held--;
          order.push(`rangée ${index}`);
        },
      }
    );

    expect(peak).toBe(1);
    expect(order).toEqual(["lue 0", "rangée 0", "lue 1", "rangée 1", "lue 2", "rangée 2", "lue 3", "rangée 3"]);
    const archive = new Uint8Array(Buffer.concat(written));
    expect(archive.length).toBe(total);

    const files = unzipSync(archive);
    expect(Object.keys(files)).toEqual(["001.png", "002.png", "003.png", "004.png"]);
    pages.forEach((bytes, index) => expect(Buffer.from(files[`00${index + 1}.png`]).equals(Buffer.from(bytes))).toBe(true));
    // Rangées sans compression : l'archive pèse les pages, plus les en-têtes.
    expect(total).toBeGreaterThan(pages.reduce((sum, bytes) => sum + bytes.length, 0));
  });

  it("s'arrête à la demande, et remonte une page illisible", async () => {
    const bytes = await picture("#123456");
    const controller = new AbortController();
    const read = vi.fn(async () => bytes);
    await expect(
      writeArchive(
        [
          { name: "001.png", read },
          { name: "002.png", read },
          { name: "003.png", read },
        ],
        { write: () => undefined },
        { signal: controller.signal, onEntry: () => controller.abort() }
      )
    ).rejects.toThrow("Export arrêté.");
    expect(read).toHaveBeenCalledTimes(1);

    await expect(
      writeArchive(
        [
          {
            name: "001.png",
            read: async () => {
              throw new Error("Une page n’a pas pu être lue (HTTP 404).");
            },
          },
        ],
        { write: () => undefined }
      )
    ).rejects.toThrow(/HTTP 404/);
  });

  it("fond l'archive dans un Blob au fil de l'eau", async () => {
    const pages = await Promise.all(["#111111", "#222222", "#333333"].map((color) => picture(color)));
    // Un seuil minuscule : chaque morceau est fondu dans le Blob dès son arrivée.
    const sink = createBlobSink(1);
    await writeArchive(
      pages.map((bytes, index) => ({ name: archivePageName(index, pages.length, "png"), read: async () => bytes })),
      sink
    );
    const blob = sink.finish();
    expect(blob.type).toBe("application/vnd.comicbook+zip");
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(files)).toEqual(["001.png", "002.png", "003.png"]);
    expect(Buffer.from(files["002.png"]).equals(Buffer.from(pages[1]))).toBe(true);
  });
});

describe("archive de pages : import dans un chapitre", () => {
  /** Ce que fait la page d'un chapitre : ouvrir l'archive, déposer chaque image, rattacher par paquets. */
  async function importArchive(chapterId: string, archive: Uint8Array) {
    const { images, ignored } = await extractArchiveImages(new Blob([new Uint8Array(archive)]));
    const files = [];
    for (const image of images) files.push({ file: deposit(new Uint8Array(await image.blob.arrayBuffer())), name: image.name });
    const pages = [];
    for (const batch of chunkList(files, IMPORT_BATCH_SIZE)) pages.push(...(await api.importPages(chapterId, batch)));
    return { images, ignored, pages };
  }

  async function chapter() {
    const folder = await api.createFolder({ name: "Série inventée" });
    return api.createChapter(folder.id, { number: "1" });
  }

  it("importe les images d'une archive dans l'ordre naturel de leurs chemins, et rien d'autre", async () => {
    const [red, green, blue, wide] = await Promise.all([picture("#aa0000"), picture("#00aa00", "jpeg"), picture("#0000aa", "webp"), picture("#aaaa00", "png", 80, 50)]);
    const archive = zipSync({
      "chapitre/10.png": red,
      "chapitre/2.JPG": green,
      "chapitre/bonus/1.webp": blue,
      "1.png": wide,
      // Ce qui n'est pas une page : compté, jamais importé.
      "lisezmoi.txt": new TextEncoder().encode("notes"),
      "chapitre/vignette.gif": new Uint8Array([0x47, 0x49, 0x46, 0x38]),
      // Fichiers cachés et métadonnées : écartés sans bruit.
      "__MACOSX/chapitre/._2.JPG": new Uint8Array([1, 2, 3]),
      ".DS_Store": new Uint8Array([1]),
      "chapitre/.cache/9.png": red,
      // Un chemin qui voudrait remonter : écarté comme un fichier caché.
      "../../hors/0.png": red,
    });

    const target = await chapter();
    const { images, ignored, pages } = await importArchive(target.id, archive);

    expect(ignored).toBe(2);
    expect(images.map((image) => image.name)).toEqual(["1.png", "chapitre_2.JPG", "chapitre_10.png", "chapitre_bonus_1.webp"]);
    expect(images.map((image) => image.blob.type)).toEqual(["image/png", "image/jpeg", "image/png", "image/webp"]);

    expect(pages.map((page) => page.name)).toEqual(["1.png", "chapitre_2.JPG", "chapitre_10.png", "chapitre_bonus_1.webp"]);
    expect(pages.map((page) => [page.width, page.height])).toEqual([
      [80, 50],
      [40, 60],
      [40, 60],
      [40, 60],
    ]);
    // Le fichier rangé porte l'extension de son type réel.
    expect(pages.map((page) => path.extname(page.imageUrl))).toEqual([".png", ".jpg", ".png", ".webp"]);
    const view = await api.getChapter(target.id);
    expect(view.pages.map((page) => page.id)).toEqual(pages.map((page) => page.id));
    // Rien n'a été écrit hors des données du module.
    expect(fs.readdirSync(root).sort()).toEqual(["data", "uploads"]);
    expect(fs.readdirSync(assetsDir())).toHaveLength(4);
  });

  it("refuse l'archive entière si une « image » n'en est pas une, sans rien laisser dans le chapitre", async () => {
    const good = await picture("#aa0000");
    const archive = zipSync({ "1.png": good, "2.png": new TextEncoder().encode("ceci n'est pas une image") });
    const target = await chapter();
    const { images } = await extractArchiveImages(new Blob([new Uint8Array(archive)]));
    const files = [];
    for (const image of images) {
      const bytes = new Uint8Array(await image.blob.arrayBuffer());
      // La route d'envoi aurait refusé le faux PNG ; déposé quand même, le serveur le refuse à son tour.
      const file = `${1_780_000_000_000 + counter}-${(counter++).toString(16).padStart(10, "0")}.png`;
      fs.mkdirSync(assetsDir(), { recursive: true });
      fs.writeFileSync(path.join(assetsDir(), file), bytes);
      files.push({ file, name: image.name });
    }
    await expect(api.importPages(target.id, files)).rejects.toThrow(/n'est pas une image/);
    expect((await api.getChapter(target.id)).pages).toEqual([]);
  });

  it("relit une archive .cbz produite par l'export", async () => {
    const pages = await Promise.all(["#aa0000", "#00aa00", "#0000aa"].map((color) => picture(color)));
    const sink = createBlobSink();
    await writeArchive(
      pages.map((bytes, index) => ({ name: archivePageName(index, pages.length, "png"), read: async () => bytes })),
      sink
    );
    const { images, ignored } = await extractArchiveImages(sink.finish());
    expect(ignored).toBe(0);
    expect(images.map((image) => image.name)).toEqual(["001.png", "002.png", "003.png"]);
    for (const [index, image] of images.entries()) {
      expect(Buffer.from(await image.blob.arrayBuffer()).equals(Buffer.from(pages[index]))).toBe(true);
    }
  });

  it("rattache une grosse archive par paquets que le serveur accepte, dans l'ordre", async () => {
    expect(IMPORT_BATCH_SIZE).toBe(MAX_IMPORT_FILES);
    expect(chunkList([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkList([], 3)).toEqual([]);

    // Plus d'images que le serveur n'en rattache en un appel : un seul appel serait refusé d'un bloc.
    const bytes = await picture("#444444", "png", 8, 12);
    const count = MAX_IMPORT_FILES + 5;
    const files = Array.from({ length: count }, (_, index) => ({ file: deposit(bytes), name: `${index + 1}.png` }));
    const target = await chapter();
    await expect(api.importPages(target.id, files)).rejects.toThrow(/300 images au plus/);

    const names: string[] = [];
    for (const batch of chunkList(files, IMPORT_BATCH_SIZE)) names.push(...(await api.importPages(target.id, batch)).map((page) => page.name));
    expect(names).toHaveLength(count);
    expect(names).toEqual(files.map((file) => file.name));
    expect((await api.getChapter(target.id)).pages.map((page) => page.name)).toEqual(names);
  }, 120_000);
});
