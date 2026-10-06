import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => ({ uploads: "" }));
vi.mock("@/lib/config", () => ({ getAbsoluteUploadPath: () => shared.uploads }));

import * as library from "@/modules/scan-studio/lib/server/library";
import { AbortedError, SourceError, type SourceAdapter } from "@/modules/scan-studio/lib/server/sources/adapter";
import type { Clock, TransportRequest, TransportResponse } from "@/modules/scan-studio/lib/server/sources/fetcher";
import { SourceHub } from "@/modules/scan-studio/lib/server/sources/index";
import { sourceStatus } from "@/modules/scan-studio/lib/server/sources/settings";
import { setDataRoot } from "@/modules/scan-studio/lib/store";

// Ces tests écrivent de vraies images et leurs vignettes : dans la suite
// complète, lancée en parallèle, dix secondes ne suffisent pas toujours.
vi.setConfig({ testTimeout: 30_000 });

let root = "";
const dataDir = () => path.join(root, "data");
const assets = () => (fs.existsSync(path.join(dataDir(), "assets")) ? fs.readdirSync(path.join(dataDir(), "assets")) : []);

const LINK = "https://reader.example.org/c/42";

/** Un second site, écrit comme on en écrirait un vrai : un fichier, sans `fetchPage`. */
function exampleAdapter(pageCount: number, overrides: Partial<SourceAdapter> = {}): SourceAdapter {
  return {
    id: "example",
    name: "Example Reader",
    homepage: "https://reader.example.org/",
    hosts: ["reader.example.org"],
    requestHosts: ["img.example.org"],
    example: LINK,
    match: (url) => /^\/c\/\d+$/.test(url.pathname),
    resolve: async (_url, context) => {
      const { response } = await context.fetcher.json("https://reader.example.org/api/c/42", { signal: context.signal });
      if (response.status === 404) throw new SourceError("not-found", "Ce chapitre n’existe pas.");
      return {
        info: { series: "Série d’essai", chapterNumber: "42", chapterTitle: "Titre du site", language: "en", credit: "Équipe", pageCount },
        pages: Array.from({ length: pageCount }, (_, index) => ({ index, url: `https://img.example.org/p/${index + 1}.png` })),
      };
    },
    ...overrides,
  };
}

/** Une petite image dont la largeur dit le rang : c'est elle qu'on retrouve dans le chapitre. */
async function pageImage(rank: number, format: "png" | "jpeg" | "webp" = "png"): Promise<TransportResponse> {
  const picture = sharp({ create: { width: 20 + rank, height: 30, channels: 3, background: { r: 30, g: 90, b: 160 } } });
  const body = await (format === "png" ? picture.png() : format === "jpeg" ? picture.jpeg() : picture.webp()).toBuffer();
  return { status: 200, headers: { "content-type": `image/${format}` }, body };
}

const json = (body: unknown, status = 200): TransportResponse => ({ status, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify(body)) });

function setup(pageCount: number, onPage?: (rank: number, request: TransportRequest) => TransportResponse | undefined | Promise<TransportResponse | undefined>, adapter = exampleAdapter(pageCount)) {
  let time = 1_800_000_000_000;
  const sleeps: number[] = [];
  const clock: Clock = {
    now: () => time,
    sleep: async (milliseconds, signal) => {
      if (signal?.aborted) throw new AbortedError();
      sleeps.push(milliseconds);
      time += milliseconds;
    },
  };
  const requests: string[] = [];
  let running = 0;
  let peak = 0;
  const hub = new SourceHub({
    adapters: [adapter],
    clock,
    transport: async (request) => {
      requests.push(request.url.toString());
      running++;
      peak = Math.max(peak, running);
      try {
        if (request.url.pathname.startsWith("/api/")) return json({ ok: true });
        const rank = Number(/\/p\/(\d+)\.png$/.exec(request.url.pathname)?.[1]);
        if (!rank) throw new Error(`Appel imprévu : ${request.url}`);
        return (await onPage?.(rank, request)) ?? (await pageImage(rank));
      } finally {
        running--;
      }
    },
  });
  return { hub, requests, sleeps, peak: () => peak };
}

async function chapter(number = "1", title?: string) {
  const folder = library.createFolder({ name: "Série test" });
  return library.createChapter(folder.id, title ? { number, title } : { number });
}

/** Dépose une page à la main dans un chapitre, comme le ferait la route d'envoi. */
async function addExistingPage(chapterId: string) {
  const file = "1760000000000-00000000aa.png";
  fs.mkdirSync(path.join(dataDir(), "assets"), { recursive: true });
  fs.writeFileSync(path.join(dataDir(), "assets", file), (await pageImage(500)).body);
  await library.importPages(chapterId, [{ file, name: "couverture.png" }]);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-studio-sources-"));
  shared.uploads = path.join(root, "uploads");
  setDataRoot(dataDir());
  vi.stubGlobal("fetch", () => Promise.reject(new Error("fetch réel appelé pendant un test")));
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

describe("import d'un chapitre par son lien", () => {
  it("rend le travail tout de suite, avance page par page, et range les pages à la suite, dans l'ordre du site", async () => {
    const target = await chapter();
    await addExistingPage(target.id);
    const seen: { state: string; done: number; total: number }[] = [];
    let jobId = "";
    const { hub, requests, peak, sleeps } = setup(12, () => {
      const { state, done, total } = hub.getLinkImport(jobId);
      seen.push({ state, done, total });
      return undefined;
    });

    const job = hub.importFromLink(target.id, `  ${LINK}?utm_source=discord  `);
    jobId = job.id;
    expect(job).toMatchObject({ state: "queued", done: 0, total: 0, chapterId: target.id, sourceId: "example", url: LINK });
    expect(requests).toEqual([]);

    await hub.imports.idle();
    const finished = hub.getLinkImport(job.id);
    expect(finished).toMatchObject({ state: "done", done: 12, total: 12, imported: 12 });
    expect(finished.error).toBeUndefined();
    // L'avancement se lit pendant l'import : une page de plus à chaque requête.
    expect(seen).toEqual(Array.from({ length: 12 }, (_, done) => ({ state: "downloading", done, total: 12 })));

    // À la suite de la page déjà là, dans l'ordre du site (10 après 9, pas après 1).
    const view = library.getChapter(target.id);
    expect(view.pages.map((page) => page.width)).toEqual([520, ...Array.from({ length: 12 }, (_, index) => 21 + index)]);
    expect(view.pages.slice(1).map((page) => page.name)).toEqual(Array.from({ length: 12 }, (_, index) => `${String(index + 1).padStart(3, "0")}.png`));
    expect(view.pages.every((page) => page.status === "imported")).toBe(true);
    expect(assets()).toHaveLength(13);
    for (const file of assets()) expect(file).toMatch(/^\d{10,16}-[0-9a-f]{10}\.png$/);

    // Une requête à la fois, et jamais deux pages sans le délai entre elles.
    expect(peak()).toBe(1);
    expect(requests).toHaveLength(13);
    expect(sleeps.filter((wait) => wait === 1000)).toHaveLength(11);
  });

  it("ne touche ni au titre ni au numéro du chapitre : ce que dit le site est rendu dans le travail", async () => {
    const target = await chapter("7");
    const { hub } = setup(2);
    const job = hub.importFromLink(target.id, LINK);
    await hub.imports.idle();

    expect(hub.getLinkImport(job.id).preview).toEqual({
      source: { id: "example", name: "Example Reader", iconUrl: undefined },
      series: "Série d’essai",
      chapterNumber: "42",
      chapterTitle: "Titre du site",
      language: "en",
      credit: "Équipe",
      pageCount: 2,
    });
    const stored = library.getChapter(target.id).chapter;
    expect(stored.number).toBe("7");
    expect(stored.title).toBeUndefined();
    expect(sourceStatus(exampleAdapter(2)).lastUsedAt).toBeGreaterThan(0);
  });

  it("garde le type réel de chaque image, quel que soit le nom que le site lui donne", async () => {
    const target = await chapter();
    const { hub } = setup(3, (rank) => pageImage(rank, rank === 1 ? "jpeg" : rank === 2 ? "webp" : "png"));
    hub.importFromLink(target.id, LINK);
    await hub.imports.idle();
    expect(library.getChapter(target.id).pages.map((page) => page.name)).toEqual(["001.jpg", "002.webp", "003.png"]);
    expect(assets().map((file) => path.extname(file)).sort()).toEqual([".jpg", ".png", ".webp"]);
  });

  it("annuler arrête entre deux pages et efface ce qui était téléchargé", async () => {
    const target = await chapter();
    let jobId = "";
    const { hub, requests } = setup(8, (rank) => {
      if (rank === 4) {
        expect(assets()).toHaveLength(3);
        expect(hub.cancelLinkImport(jobId).state).toBe("cancelled");
      }
      return undefined;
    });
    jobId = hub.importFromLink(target.id, LINK).id;
    await hub.imports.idle();

    const job = hub.getLinkImport(jobId);
    expect(job.state).toBe("cancelled");
    expect(job.error).toBeUndefined();
    expect(job.imported).toBeUndefined();
    // La page 5 n'a jamais été demandée, et rien ne reste sur le disque ni dans le chapitre.
    expect(requests.filter((url) => url.includes("/p/"))).toHaveLength(4);
    expect(assets()).toEqual([]);
    expect(library.getChapter(target.id).pages).toEqual([]);
    // Annuler de nouveau, ou annuler un import terminé, ne change rien.
    expect(hub.cancelLinkImport(jobId).state).toBe("cancelled");
  });

  it("annuler pendant la lecture du lien n'importe rien", async () => {
    const target = await chapter();
    let release: (() => void) | undefined;
    const adapter = exampleAdapter(2, {
      resolve: async (_url, context) => {
        await new Promise<void>((resolve) => (release = resolve));
        if (context.signal.aborted) throw new AbortedError();
        return { info: { pageCount: 1 }, pages: [{ index: 0, url: "https://img.example.org/p/1.png" }] };
      },
    });
    const { hub, requests } = setup(2, undefined, adapter);
    const job = hub.importFromLink(target.id, LINK);
    await vi.waitFor(() => expect(hub.getLinkImport(job.id).state).toBe("resolving"));
    expect(hub.cancelLinkImport(job.id).state).toBe("cancelled");
    release?.();
    await hub.imports.idle();
    expect(hub.getLinkImport(job.id).state).toBe("cancelled");
    expect(requests).toEqual([]);
    expect(assets()).toEqual([]);
  });

  it("un échec en cours de route efface les fichiers partiels et note le cas d'erreur", async () => {
    const target = await chapter();
    await addExistingPage(target.id);
    const { hub, requests } = setup(6, (rank) => (rank === 4 ? { status: 404, headers: { "content-type": "text/plain" }, body: Buffer.from("gone") } : undefined));
    const job = hub.importFromLink(target.id, LINK);
    await hub.imports.idle();

    const failed = hub.getLinkImport(job.id);
    expect(failed.state).toBe("failed");
    expect(failed.done).toBe(3);
    expect(failed.error?.kind).toBe("site-error");
    expect(failed.error?.message).toContain("page 4");
    // Pas de boucle : la page en échec n'est pas redemandée, les suivantes ne sont pas tentées.
    expect(requests.filter((url) => url.includes("/p/"))).toHaveLength(4);
    // Seule la page d'avant l'import reste.
    expect(assets()).toEqual(["1760000000000-00000000aa.png"]);
    expect(library.getChapter(target.id).pages).toHaveLength(1);
    expect(sourceStatus(exampleAdapter(6)).lastError).toMatchObject({ kind: "site-error" });
    expect(sourceStatus(exampleAdapter(6)).lastUsedAt).toBeUndefined();
  });

  it("refuse ce qui n'est pas une image, même annoncé comme telle", async () => {
    const target = await chapter();
    const { hub } = setup(3, (rank) => (rank === 2 ? { status: 200, headers: { "content-type": "image/png" }, body: Buffer.from("<html>pas une image</html>") } : undefined));
    const job = hub.importFromLink(target.id, LINK);
    await hub.imports.idle();
    const failed = hub.getLinkImport(job.id);
    expect(failed.state).toBe("failed");
    expect(failed.error?.message).toContain("page 2");
    expect(assets()).toEqual([]);
    expect(library.getChapter(target.id).pages).toEqual([]);
  });

  it("garde le cas d'erreur de l'adaptateur (chapitre introuvable chez le site)", async () => {
    const target = await chapter();
    const adapter = exampleAdapter(2, {
      resolve: async () => {
        throw new SourceError("not-found", "Ce chapitre n’existe pas.");
      },
    });
    const { hub } = setup(2, undefined, adapter);
    const job = hub.importFromLink(target.id, LINK);
    await hub.imports.idle();
    expect(hub.getLinkImport(job.id)).toMatchObject({ state: "failed", error: { kind: "not-found" } });
    // Un chapitre introuvable ne dit rien de l'état de l'adaptateur.
    expect(sourceStatus(adapter).lastError).toBeUndefined();
  });

  it("le chapitre supprimé pendant l'import : échec propre, rien ne reste", async () => {
    const target = await chapter();
    const { hub } = setup(3, (rank) => {
      if (rank === 3) library.deleteChapter(target.id);
      return undefined;
    });
    const job = hub.importFromLink(target.id, LINK);
    await hub.imports.idle();
    const failed = hub.getLinkImport(job.id);
    expect(failed.state).toBe("failed");
    expect(failed.error?.message).toContain("sur ce serveur");
    expect(assets()).toEqual([]);
  });

  it("refuse un chapitre trop long pour un import", async () => {
    const target = await chapter();
    const { hub, requests } = setup(library.MAX_IMPORT_FILES + 1);
    const job = hub.importFromLink(target.id, LINK);
    await hub.imports.idle();
    expect(hub.getLinkImport(job.id)).toMatchObject({ state: "failed", error: { kind: "unavailable" } });
    expect(requests.filter((url) => url.includes("/p/"))).toEqual([]);
  });
});

describe("ce qui est refusé avant de commencer", () => {
  it("un adaptateur désactivé, pour l'import comme pour l'aperçu", async () => {
    const target = await chapter();
    const { hub, requests } = setup(2);
    expect(hub.setSourceEnabled("example", false).enabled).toBe(false);

    expect(() => hub.importFromLink(target.id, LINK)).toThrowError(expect.objectContaining({ kind: "disabled" }));
    await expect(hub.previewLink(LINK)).rejects.toMatchObject({ kind: "disabled" });
    expect(requests).toEqual([]);

    hub.setSourceEnabled("example", true);
    expect(hub.importFromLink(target.id, LINK).state).toBe("queued");
    await hub.imports.idle();
    expect(() => hub.setSourceEnabled("inconnue", true)).toThrow("Source inconnue.");
    expect(() => hub.setSourceEnabled("example", "oui")).toThrow("Réglage invalide.");
  });

  it("un chapitre inconnu, un site non géré, un lien qui n'est pas un chapitre, un lien mal formé", async () => {
    const target = await chapter();
    const { hub, requests } = setup(2);
    expect(() => hub.importFromLink("aaaaaaaaaaaa", LINK)).toThrow("Chapitre introuvable.");
    expect(() => hub.importFromLink(target.id, "https://ailleurs.example.com/c/42")).toThrowError(expect.objectContaining({ kind: "unsupported" }));
    expect(() => hub.importFromLink(target.id, "https://reader.example.org/series/3")).toThrowError(expect.objectContaining({ kind: "not-a-chapter" }));
    expect(() => hub.importFromLink(target.id, "pas un lien")).toThrow(/Lien invalide/);
    expect(() => hub.getLinkImport("inconnu")).toThrow(/Import introuvable/);
    expect(requests).toEqual([]);
  });

  it("un second import pendant qu'un premier tourne ; le même lien rend le travail en cours", async () => {
    const first = await chapter("1");
    const second = await chapter("2");
    let release: (() => void) | undefined;
    let held = false;
    const { hub } = setup(2, async (rank) => {
      // Seule la première page du premier import est retenue.
      if (rank === 1 && !held) {
        held = true;
        await new Promise<void>((resolve) => (release = resolve));
      }
      return undefined;
    });

    const job = hub.importFromLink(first.id, LINK);
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(() => hub.importFromLink(second.id, LINK)).toThrow(/déjà en cours/);
    expect(() => hub.importFromLink(first.id, "https://reader.example.org/c/43")).toThrow(/déjà en cours/);
    // Redemander le même import ne lance rien de plus.
    expect(hub.importFromLink(first.id, `${LINK}?utm_campaign=x`).id).toBe(job.id);

    release?.();
    await hub.imports.idle();
    expect(hub.getLinkImport(job.id).state).toBe("done");
    // Le premier fini, le suivant passe.
    const next = hub.importFromLink(second.id, LINK);
    await hub.imports.idle();
    expect(hub.getLinkImport(next.id).state).toBe("done");
    expect(library.getChapter(first.id).pages).toHaveLength(2);
    expect(library.getChapter(second.id).pages).toHaveLength(2);
  });
});

describe("un lien suffit : le dossier et le chapitre se créent", () => {
  it("range le chapitre dans le dossier de sa série, créés tous les deux, avec le numéro, le titre et la langue du site", async () => {
    const { hub } = setup(3);
    const job = await hub.importLinkToLibrary(LINK);
    expect(job).toMatchObject({ state: "queued", created: { folder: true, chapter: true } });
    await hub.imports.idle();

    const folders = library.listFolders();
    expect(folders.map((folder) => folder.name)).toEqual(["Série d’essai"]);
    expect(job.folderId).toBe(folders[0].id);
    const view = library.getChapter(job.chapterId);
    expect(view.chapter).toMatchObject({ number: "42", title: "Titre du site" });
    expect(view.chapter.settings.sourceLanguage).toBe("en");
    expect(view.pages).toHaveLength(3);
  });

  it("retrouve le dossier par son nom, et refuse un chapitre déjà présent avec ses pages", async () => {
    const existing = library.createFolder({ name: "série d’essai" });
    const { hub } = setup(2);
    const job = await hub.importLinkToLibrary(LINK);
    expect(job).toMatchObject({ folderId: existing.id, created: { folder: false, chapter: true } });
    await hub.imports.idle();
    expect(library.listFolders()).toHaveLength(1);

    await expect(hub.importLinkToLibrary(LINK)).rejects.toThrow(/déjà dans la bibliothèque/);
    expect(library.getFolder(existing.id).chapters).toHaveLength(1);
  });

  it("illustre le dossier par la couverture de la série, sans la remplacer ensuite ni échouer si elle manque", async () => {
    const withCover = (coverUrl: string, number: string) =>
      exampleAdapter(2, {
        resolve: async () => ({
          info: { series: "Série d’essai", chapterNumber: number, pageCount: 2, seriesCoverUrl: coverUrl },
          pages: [1, 2].map((rank, index) => ({ index, url: `https://img.example.org/p/${rank}.png` })),
        }),
        describe: async () => ({ series: "Série d’essai", chapterNumber: number, pageCount: 2 }),
      });

    // Une couverture que le site ne sert pas : l'import réussit quand même, sans couverture.
    const missing = setup(2, (rank) => (rank === 404 ? { status: 404, headers: {}, body: Buffer.alloc(0) } : undefined), withCover("https://img.example.org/p/404.png", "1"));
    const first = await missing.hub.importLinkToLibrary(LINK);
    await missing.hub.imports.idle();
    expect(missing.hub.getLinkImport(first.id).state).toBe("done");
    expect(library.getFolder(first.folderId!).folder.cover).toBeUndefined();

    // La couverture arrive avec le chapitre suivant, et devient l'image du dossier.
    const found = setup(2, undefined, withCover("https://img.example.org/p/99.png", "2"));
    const second = await found.hub.importLinkToLibrary(LINK);
    await found.hub.imports.idle();
    const cover = library.getFolder(second.folderId!).folder.cover;
    expect(cover?.file).toMatch(/^\d{10,16}-[0-9a-f]{10}\.png$/);
    expect(library.listFolders()[0].cover).toBe(`/api/modules/scan-studio/data/assets/${cover!.file}`);

    // Un dossier qui a déjà sa couverture la garde.
    const again = setup(2, undefined, withCover("https://img.example.org/p/98.png", "3"));
    await again.hub.importLinkToLibrary(LINK);
    await again.hub.imports.idle();
    expect(library.getFolder(second.folderId!).folder.cover).toEqual(cover);
    expect(again.requests.some((url) => url.endsWith("/p/98.png"))).toBe(false);

    // Elle part avec le dossier.
    library.deleteFolder(second.folderId!);
    expect(assets()).toEqual([]);
  });

  it("ne laisse ni dossier ni chapitre vide quand le lien ne peut pas être lu", async () => {
    const adapter = exampleAdapter(2, {
      describe: async () => {
        throw new SourceError("not-found", "Ce chapitre n’existe pas.");
      },
    });
    const { hub } = setup(2, undefined, adapter);
    await expect(hub.importLinkToLibrary(LINK)).rejects.toThrow(/n’existe pas/);
    expect(library.listFolders()).toEqual([]);
  });
});

describe("aperçu d'un lien", () => {
  it("lit ce que le lien désigne sans rien télécharger", async () => {
    const { hub, requests } = setup(5);
    expect(await hub.previewLink(LINK)).toMatchObject({ source: { id: "example", name: "Example Reader" }, series: "Série d’essai", chapterNumber: "42", pageCount: 5 });
    expect(requests).toEqual(["https://reader.example.org/api/c/42"]);
    expect(assets()).toEqual([]);
  });

  it("se sert de `describe` quand l'adaptateur en a une", async () => {
    let resolved = 0;
    const adapter = exampleAdapter(5, {
      describe: async () => ({ pageCount: 9, series: "Par describe" }),
      resolve: async () => {
        resolved++;
        return { info: { pageCount: 0 }, pages: [] };
      },
    });
    const { hub } = setup(5, undefined, adapter);
    expect(await hub.previewLink(LINK)).toMatchObject({ series: "Par describe", pageCount: 9 });
    expect(resolved).toBe(0);
  });

  it("une erreur inattendue de l'adaptateur devient une erreur du site, notée sur l'adaptateur", async () => {
    const adapter = exampleAdapter(1, {
      resolve: async () => {
        throw new TypeError("Cannot read properties of undefined");
      },
    });
    const { hub } = setup(1, undefined, adapter);
    await expect(hub.previewLink(LINK)).rejects.toMatchObject({ kind: "site-error" });
    expect(sourceStatus(adapter).lastError?.kind).toBe("site-error");
  });
});

describe("mémoire des imports", () => {
  it("un import terminé se relit après un redémarrage", async () => {
    const target = await chapter();
    const before = setup(2);
    const job = before.hub.importFromLink(target.id, LINK);
    await before.hub.imports.idle();

    const after = setup(2);
    expect(after.hub.getLinkImport(job.id)).toMatchObject({ id: job.id, state: "done", imported: 2, total: 2 });
  });

  it("un import coupé par un redémarrage est marqué échoué, pas laissé « en cours »", async () => {
    const file = path.join(dataDir(), "sources", "jobs.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const base = { url: LINK, chapterId: "aaaaaaaaaaaa", sourceId: "example", done: 3, total: 9, createdAt: 1, updatedAt: 2 };
    fs.writeFileSync(
      file,
      JSON.stringify([
        { ...base, id: "job-downloading", state: "downloading" },
        { ...base, id: "job-queued", state: "queued", done: 0, total: 0 },
        { ...base, id: "job-done", state: "done", done: 9, imported: 9 },
        "n'importe quoi",
      ])
    );

    const { hub } = setup(2);
    for (const id of ["job-downloading", "job-queued"]) {
      const job = hub.getLinkImport(id);
      expect(job.state).toBe("failed");
      expect(job.error?.message).toContain("redémarrage");
    }
    expect(hub.getLinkImport("job-done").state).toBe("done");
    // L'état corrigé est écrit : une autre relecture le retrouve.
    const stored = JSON.parse(fs.readFileSync(file, "utf-8")) as { id: string; state: string }[];
    expect(stored.find((job) => job.id === "job-downloading")?.state).toBe("failed");
    expect(stored).toHaveLength(3);
  });
});
