/**
 * Rendu en lot des pages : quelles pages sont rendues, dans quel ordre, ce qui
 * arrête le lot et ce qui ne l'arrête pas. Le dessin lui-même a lieu dans le
 * navigateur ; ici, il est remplacé par un faux.
 */

import { describe, expect, it } from "vitest";
import { estimateTexts, renderRunner, runBatch } from "@/modules/scan-studio/lib/folder-batch";
import { describeChapterExport, exportChapterPages, exportNameOf, exportSkipReason, type ChapterExportDeps } from "@/modules/scan-studio/lib/page-export";
import type { ChapterView, PageSummary, PageView, ScanRegion } from "@/modules/scan-studio/lib/types";

const region = (translation: string): ScanRegion => ({ translation: { text: translation } }) as unknown as ScanRegion;

function pageView(id: string, regions: ScanRegion[], skipped = false): PageView {
  return {
    page: { id, name: `${id}.png`, regions, skipped, source: { file: `${id}.png`, width: 10, height: 10 } },
    imageUrl: `/img/${id}`,
    chapter: { id: "chapter00001", number: "1", settings: { targetLanguage: "fr" }, pageIds: [] },
    folder: { id: "folder000001", name: "Série d’essai" },
  } as unknown as PageView;
}

function fakeDeps(pages: Record<string, PageView>, failing: string[] = []) {
  const calls: string[] = [];
  const deps: ChapterExportDeps = {
    getPage: async (id) => {
      calls.push(`get:${id}`);
      return pages[id];
    },
    render: async (view) => {
      calls.push(`render:${view.page.id}`);
      if (failing.includes(view.page.id)) throw new Error("police introuvable");
      return new Blob(["x"]);
    },
    upload: async (_blob, name) => {
      calls.push(`upload:${name}`);
      return { file: `stored-${name}`, name };
    },
    register: async (pageId, file) => {
      calls.push(`register:${pageId}:${file}`);
      return {} as PageSummary;
    },
  };
  return { deps, calls };
}

describe("rendu en lot : quelles pages", () => {
  it("laisse de côté les pages mises à l'écart, sans zone ou sans traduction", () => {
    expect(exportSkipReason({ regions: [region("Bonjour")], skipped: true })).toBe("set-aside");
    expect(exportSkipReason({ regions: [], skipped: false })).toBe("no-region");
    expect(exportSkipReason({ regions: [region(""), region("  ")], skipped: false })).toBe("untranslated");
    expect(exportSkipReason({ regions: [region(""), region("Bonjour")], skipped: false })).toBeNull();
  });

  it("nomme le fichier d'après la page et la langue cible", () => {
    expect(exportNameOf("page 01.webp", "fr")).toBe("page 01-fr.png");
    expect(exportNameOf("../../x<y>.png", "pt-BR")).toBe(".._.._x_y_-pt-br.png");
    expect(exportNameOf(".png", "n'importe quoi")).toBe("page-traduit.png");
  });
});

describe("rendu en lot : un chapitre", () => {
  const pages = {
    a: pageView("a", [region("Bonjour")]),
    b: pageView("b", [region("Salut")], true),
    c: pageView("c", []),
    d: pageView("d", [region("")]),
    e: pageView("e", [region("Au revoir")]),
  };

  it("rend les pages traduites dans l'ordre, les dépose et les déclare", async () => {
    const { deps, calls } = fakeDeps(pages);
    const progress: number[] = [];
    const result = await exportChapterPages(["a", "b", "c", "d", "e"], deps, { onProgress: (done) => progress.push(done) });
    expect(result).toEqual({ exported: 2, setAside: 1, withoutRegion: 1, untranslated: 1, failed: 0, aborted: false });
    expect(calls.filter((call) => !call.startsWith("get:"))).toEqual([
      "render:a",
      "upload:a-fr.png",
      "register:a:stored-a-fr.png",
      "render:e",
      "upload:e-fr.png",
      "register:e:stored-e-fr.png",
    ]);
    expect(progress).toEqual([0, 1, 2, 3, 4, 5]);
    expect(describeChapterExport(result)).toBe("2 pages rendues, 1 sans traduction, 1 sans zone, 1 laissée telle quelle");
  });

  it("une page en échec n'arrête pas les suivantes, et rien n'est déclaré pour elle", async () => {
    const { deps, calls } = fakeDeps(pages, ["a"]);
    const result = await exportChapterPages(["a", "e"], deps);
    expect(result).toMatchObject({ exported: 1, failed: 1, firstError: "police introuvable", aborted: false });
    expect(calls.some((call) => call.startsWith("register:a"))).toBe(false);
    expect(describeChapterExport(result)).toBe("1 page rendue, 1 en échec (police introuvable)");
  });

  it("s'arrête à la demande, avant la page suivante", async () => {
    const controller = new AbortController();
    const { deps, calls } = fakeDeps(pages);
    const upload = deps.upload;
    deps.upload = async (blob, name) => {
      controller.abort();
      return upload(blob, name);
    };
    const result = await exportChapterPages(["a", "e"], deps, { signal: controller.signal });
    expect(result).toMatchObject({ exported: 1, aborted: true });
    expect(calls).not.toContain("render:e");
  });
});

describe("rendu en lot : un dossier", () => {
  const chapterView = (ids: string[]) => ({ pages: ids.map((id) => ({ id })) }) as unknown as ChapterView;

  it("passe les chapitres l'un après l'autre et dit ce que chacun a donné", async () => {
    const seen: string[][] = [];
    const runner = renderRunner({
      getChapter: async (id) => chapterView(id === "empty" ? [] : id === "bad" ? ["x"] : ["a", "b"]),
      exportPages: async (pageIds) => {
        seen.push(pageIds);
        const failed = pageIds.includes("x");
        return { exported: failed ? 0 : 2, setAside: 0, withoutRegion: 0, untranslated: 0, failed: failed ? 1 : 0, firstError: failed ? "trop grande" : undefined, aborted: false };
      },
      describe: describeChapterExport,
    });
    const result = await runBatch(
      [
        { id: "good", label: "Chapitre 1" },
        { id: "empty", label: "Chapitre 2" },
        { id: "bad", label: "Chapitre 3" },
      ],
      runner
    );
    expect(result.chapters.map((chapter) => [chapter.chapterId, chapter.state, chapter.detail])).toEqual([
      ["good", "done", "2 pages rendues"],
      ["empty", "skipped", "Aucune page"],
      ["bad", "error", "0 page rendue, 1 en échec (trop grande)"],
    ]);
    expect(seen).toEqual([["a", "b"], ["x"]]);
    expect(result.stopped).toBeUndefined();
  });
});

describe("estimation d'un long chapitre", () => {
  it("part en paquets que le serveur accepte, et additionne", async () => {
    const sizes: number[] = [];
    const total = await estimateTexts(
      "chapter00001",
      Array.from({ length: 950 }, (_, index) => `phrase ${index}`),
      async (_chapterId, texts) => {
        sizes.push(texts.length);
        return { characters: texts.length * 10, known: texts.length, toSend: texts.length * 9, engine: "deepl" };
      }
    );
    expect(sizes).toEqual([400, 400, 150]);
    expect(total).toEqual({ characters: 9500, known: 950, toSend: 8550, engine: "deepl" });
  });

  it("sans phrase, n'appelle rien", async () => {
    let called = 0;
    const total = await estimateTexts("chapter00001", [], async () => {
      called++;
      return { characters: 1, known: 0, toSend: 1 };
    });
    expect(called).toBe(0);
    expect(total).toEqual({ characters: 0, known: 0, toSend: 0 });
  });
});
