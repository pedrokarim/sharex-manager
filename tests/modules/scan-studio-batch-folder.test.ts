import { describe, expect, it, vi } from "vitest";

import {
  ESTIMATE_MAX_CHARACTERS,
  ESTIMATE_MAX_ITEMS,
  analyzeRunner,
  chunkTexts,
  estimateFolderTranslation,
  runBatch,
  translateRunner,
  type BatchProgress,
} from "@/modules/scan-studio/lib/folder-batch";
import { MAX_ITEMS, MAX_TOTAL_LENGTH } from "@/modules/scan-studio/lib/server/translation";
import { translateChapter, type TranslateDeps } from "@/modules/scan-studio/lib/translate-pages";
import { DEFAULT_CHAPTER_SETTINGS, DEFAULT_MASK, type ChapterView, type PageView, type ScanRegion, type TranslationBatch } from "@/modules/scan-studio/lib/types";

function region(id: string, clean: string, status: ScanRegion["translation"]["status"] = "todo"): ScanRegion {
  return {
    id,
    kind: "dialogue",
    outline: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ],
    direction: "horizontal",
    reading: { raw: clean, clean, confidence: 1, engine: "manual", edited: false },
    translation: { text: status === "todo" ? "" : "déjà", status, history: [] },
    mask: { ...DEFAULT_MASK },
    text: { box: { x: 0, y: 0, width: 10, height: 10, rotation: 0 }, style: null, autoFit: true },
  };
}

interface FakeChapter {
  id: string;
  maxLevel?: 0 | 1 | 2 | 3;
  /** Par page : les textes de ses zones ; `null` pour une page « laissée telle quelle ». */
  pages: (string[] | null)[];
}

/** Une petite bibliothèque en mémoire : chapitres, pages, et les appels reçus. */
function library(chapters: FakeChapter[]) {
  const pageViews = new Map<string, PageView>();
  const chapterViews = new Map<string, ChapterView>();
  for (const chapter of chapters) {
    const settings = { ...DEFAULT_CHAPTER_SETTINGS, maxLevel: chapter.maxLevel ?? 2 };
    const pageIds = chapter.pages.map((_, index) => `${chapter.id}-p${index + 1}`);
    chapter.pages.forEach((texts, index) => {
      const id = pageIds[index];
      pageViews.set(id, {
        page: {
          id,
          chapterId: chapter.id,
          name: `${index + 1}.png`,
          source: { file: "x.png", width: 10, height: 10 },
          regions: (texts ?? []).map((text, rank) => region(`${id}-r${rank}`, text)),
          ...(texts === null ? { skipped: true } : {}),
          status: "analyzed",
          revision: 0,
          createdAt: 0,
          updatedAt: 0,
        },
        imageUrl: "",
        chapter: { id: chapter.id, number: "1", settings, pageIds },
        folder: { id: "folder", name: "Série inventée" },
      });
    });
    chapterViews.set(chapter.id, {
      chapter: { id: chapter.id, folderId: "folder", number: "1", settings, pageIds, createdAt: 0, updatedAt: 0 },
      folder: { id: "folder", name: "Série inventée" },
      pages: pageIds.map((id, index) => ({
        id,
        chapterId: chapter.id,
        name: `${index + 1}.png`,
        width: 10,
        height: 10,
        status: "analyzed",
        skipped: chapter.pages[index] === null,
        regionCount: chapter.pages[index]?.length ?? 0,
        imageUrl: "",
        thumbUrl: "",
        updatedAt: 0,
      })),
    });
  }
  const calls = { getChapter: [] as string[], getPage: [] as string[], translate: [] as { chapterId: string; texts: string[] }[], saved: [] as string[] };
  return {
    calls,
    getChapter: async (id: string) => {
      calls.getChapter.push(id);
      const view = chapterViews.get(id);
      if (!view) throw new Error("Chapitre introuvable.");
      return view;
    },
    getPage: async (id: string) => {
      calls.getPage.push(id);
      const view = pageViews.get(id);
      if (!view) throw new Error("Page introuvable.");
      return view;
    },
  };
}

const chaptersOf = (ids: string[]) => ids.map((id) => ({ id, label: `Chapitre ${id}` }));

describe("lot sur un dossier : file", () => {
  it("passe les chapitres un par un, dans l'ordre, et rapporte chaque étape", async () => {
    let running = 0;
    let peak = 0;
    const order: string[] = [];
    const events: BatchProgress[] = [];
    const result = await runBatch(
      chaptersOf(["a", "b", "c"]),
      async (chapter, { report }) => {
        running++;
        peak = Math.max(peak, running);
        order.push(chapter.id);
        report("Page 1 sur 2", 0.5);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running--;
        return chapter.id === "b" ? { state: "skipped", detail: "Rien à faire" } : { state: "done", detail: "Fait" };
      },
      { onProgress: (progress) => events.push(progress) }
    );

    expect(peak).toBe(1);
    expect(order).toEqual(["a", "b", "c"]);
    expect(result.stopped).toBeUndefined();
    expect(result.remaining).toEqual([]);
    expect(result.chapters.map((chapter) => [chapter.chapterId, chapter.state])).toEqual([
      ["a", "done"],
      ["b", "skipped"],
      ["c", "done"],
    ]);
    expect(events.filter((event) => event.chapterId === "a").map((event) => [event.state, event.detail, event.progress])).toEqual([
      ["running", undefined, undefined],
      ["running", "Page 1 sur 2", 0.5],
      ["done", "Fait", undefined],
    ]);
    expect(events.every((event) => event.total === 3)).toBe(true);
  });

  it("s'arrête à la demande après le chapitre en cours, sans lancer les suivants", async () => {
    const controller = new AbortController();
    const order: string[] = [];
    const result = await runBatch(
      chaptersOf(["a", "b", "c", "d"]),
      async (chapter) => {
        order.push(chapter.id);
        if (chapter.id === "b") controller.abort();
        return { state: "done", detail: "Fait" };
      },
      { signal: controller.signal }
    );
    expect(order).toEqual(["a", "b"]);
    expect(result.stopped).toBe("aborted");
    expect(result.remaining).toEqual(["c", "d"]);
    expect(result.chapters).toHaveLength(2);

    // Arrêt demandé avant le départ : rien ne part.
    const never = vi.fn();
    const stopped = new AbortController();
    stopped.abort();
    expect((await runBatch(chaptersOf(["a"]), never, { signal: stopped.signal })).remaining).toEqual(["a"]);
    expect(never).not.toHaveBeenCalled();
  });

  it("continue après un chapitre en échec, mais s'arrête net quand une action le demande", async () => {
    const order: string[] = [];
    const result = await runBatch(chaptersOf(["a", "b", "c", "d"]), async (chapter) => {
      order.push(chapter.id);
      if (chapter.id === "a") throw new Error("Chapitre illisible.");
      if (chapter.id === "c") return { state: "error", detail: "Plus de moteur", halt: "Plus de moteur" };
      return { state: "done", detail: "Fait" };
    });
    expect(order).toEqual(["a", "b", "c"]);
    expect(result.chapters[0]).toMatchObject({ state: "error", detail: "Chapitre illisible." });
    expect(result).toMatchObject({ stopped: "halted", stopReason: "Plus de moteur", remaining: ["d"] });
  });
});

describe("lot sur un dossier : traduction", () => {
  /** Le vrai `translateChapter`, branché sur un faux serveur qui compte ses appels. */
  function translation(chapters: FakeChapter[], respond: (call: number, texts: string[]) => TranslationBatch | Error) {
    const books = library(chapters);
    let call = 0;
    const deps: TranslateDeps = {
      getPage: books.getPage,
      translateTexts: async (chapterId, items) => {
        books.calls.translate.push({ chapterId, texts: items.map((item) => item.text) });
        const response = respond(call++, items.map((item) => item.text));
        if (response instanceof Error) throw response;
        return { ...response, results: response.results.length > 0 ? response.results : [] };
      },
      savePage: async (pageId) => {
        books.calls.saved.push(pageId);
        return { revision: 1, updatedAt: 0 };
      },
    };
    const runner = translateRunner({
      getChapter: books.getChapter,
      translateChapter: (pageIds, options) => translateChapter(pageIds, { ...options, deps }),
    });
    return { books, runner };
  }

  const answer = (texts: string[], pageId: string): TranslationBatch => ({
    results: texts.map((text, rank) => ({ id: `${pageId}-r${rank}`, text: `fr:${text}`, source: "engine", engine: "deepl" })),
    failed: [],
    sentCharacters: texts.join("").length,
  });

  it("envoie une seule requête par page, jamais plus, et saute les pages laissées telles quelles", async () => {
    const chapters: FakeChapter[] = [
      { id: "a", pages: [["Hello", "World"], null, ["Again"]] },
      { id: "b", pages: [["Third"], []] },
    ];
    const pageIds = ["a-p1", "a-p3", "b-p1"];
    const { books, runner } = translation(chapters, (call, texts) => answer(texts, pageIds[call]));
    const result = await runBatch(chaptersOf(["a", "b"]), runner);

    // Trois pages ont du texte : trois requêtes, une par page, dans l'ordre de lecture.
    expect(books.calls.translate).toEqual([
      { chapterId: "a", texts: ["Hello", "World"] },
      { chapterId: "a", texts: ["Again"] },
      { chapterId: "b", texts: ["Third"] },
    ]);
    expect(books.calls.saved).toEqual(pageIds);
    expect(result.stopped).toBeUndefined();
    expect(result.chapters.map((chapter) => [chapter.state, chapter.detail])).toEqual([
      ["done", "2 pages traduites, 3 zones"],
      ["done", "1 page traduite, 1 zone"],
    ]);
  });

  it("s'arrête au lieu d'insister quand plus aucun moteur ne répond", async () => {
    const chapters: FakeChapter[] = [
      { id: "a", pages: [["Un"], ["Deux"], ["Trois"]] },
      { id: "b", pages: [["Quatre"]] },
      { id: "c", pages: [["Cinq"]] },
    ];
    const { books, runner } = translation(chapters, (call, texts) =>
      call === 0
        ? answer(texts, "a-p1")
        : { results: [], failed: texts.map((_, rank) => ({ id: `a-p2-r${rank}`, error: "Aucun moteur disponible : plafond atteint." })), sentCharacters: 0 }
    );
    const result = await runBatch(chaptersOf(["a", "b", "c"]), runner);

    // La page 1 est traduite, la page 2 échoue : ni la page 3, ni les chapitres suivants ne partent.
    expect(books.calls.translate).toHaveLength(2);
    expect(books.calls.getChapter).toEqual(["a"]);
    expect(result).toMatchObject({ stopped: "halted", stopReason: "Aucun moteur disponible : plafond atteint.", remaining: ["b", "c"] });
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0]).toMatchObject({ state: "error", halt: "Aucun moteur disponible : plafond atteint." });
    expect(books.calls.saved).toEqual(["a-p1"]);
  });

  it("s'arrête aussi quand l'appel au routeur lui-même échoue", async () => {
    const { books, runner } = translation(
      [
        { id: "a", pages: [["Un"], ["Deux"]] },
        { id: "b", pages: [["Trois"]] },
      ],
      () => new Error("Routeur injoignable.")
    );
    const result = await runBatch(chaptersOf(["a", "b"]), runner);
    expect(books.calls.translate).toHaveLength(1);
    expect(result).toMatchObject({ stopped: "halted", stopReason: "Routeur injoignable.", remaining: ["b"] });
  });

  it("ne traduit pas un chapitre dont le niveau l'interdit, et le dit", async () => {
    const { books, runner } = translation(
      [
        { id: "manual", maxLevel: 1, pages: [["Un"]] },
        { id: "empty", pages: [null, []] },
        { id: "open", pages: [["Deux"]] },
      ],
      (_, texts) => answer(texts, "open-p1")
    );
    const result = await runBatch(chaptersOf(["manual", "empty", "open"]), runner);
    expect(books.calls.translate).toEqual([{ chapterId: "open", texts: ["Deux"] }]);
    expect(result.chapters.map((chapter) => chapter.state)).toEqual(["skipped", "skipped", "done"]);
    expect(result.chapters[0].detail).toMatch(/niveau/);
  });

  it("respecte l'arrêt demandé entre deux pages d'un chapitre", async () => {
    const controller = new AbortController();
    const { books, runner } = translation(
      [
        { id: "a", pages: [["Un"], ["Deux"], ["Trois"]] },
        { id: "b", pages: [["Quatre"]] },
      ],
      (call, texts) => {
        controller.abort();
        return answer(texts, `a-p${call + 1}`);
      }
    );
    const result = await runBatch(chaptersOf(["a", "b"]), runner, { signal: controller.signal });
    // La réponse payée est enregistrée, rien d'autre ne part.
    expect(books.calls.translate).toHaveLength(1);
    expect(books.calls.saved).toEqual(["a-p1"]);
    expect(result).toMatchObject({ stopped: "aborted", remaining: ["b"] });
  });
});

describe("lot sur un dossier : analyse", () => {
  it("analyse les pages de travail de chaque chapitre, et passe ceux qui ne s'y prêtent pas", async () => {
    const books = library([
      { id: "a", pages: [["x"], null, ["y"]] },
      { id: "blocked", maxLevel: 0, pages: [["z"]] },
      { id: "covers", pages: [null] },
    ]);
    const analyzed: string[][] = [];
    const runner = analyzeRunner(
      {
        getChapter: books.getChapter,
        blocker: (settings) => (settings.maxLevel < 1 ? "Analyse coupée pour ce chapitre." : null),
        analyze: async (pageIds, options) => {
          analyzed.push(pageIds);
          for (const pageId of pageIds) options?.onProgress?.({ pageId, step: "done", progress: 1 });
          return { analyzed: pageIds.length, regions: 5, failed: [], untranslatable: [] };
        },
      },
      { replace: true }
    );
    const events: BatchProgress[] = [];
    const result = await runBatch(chaptersOf(["a", "blocked", "covers"]), runner, { onProgress: (progress) => events.push(progress) });

    expect(analyzed).toEqual([["a-p1", "a-p3"]]);
    expect(result.chapters.map((chapter) => [chapter.state, chapter.detail])).toEqual([
      ["done", "2 pages analysées, 5 zones ajoutées"],
      ["skipped", "Analyse coupée pour ce chapitre."],
      ["skipped", "Aucune page à analyser"],
    ]);
    expect(events.some((event) => event.chapterId === "a" && event.progress === 1)).toBe(true);
  });
});

describe("lot sur un dossier : estimation", () => {
  it("additionne ce que chaque chapitre enverrait, sans appeler de moteur", async () => {
    const books = library([
      { id: "a", pages: [["Hello", "World"], null, ["Again"]] },
      { id: "manual", maxLevel: 1, pages: [["Jamais"]] },
      { id: "b", pages: [["Third"], []] },
      { id: "empty", pages: [[]] },
    ]);
    const estimated: { chapterId: string; texts: string[] }[] = [];
    const estimate = await estimateFolderTranslation(["a", "manual", "b", "empty"], {
      getChapter: books.getChapter,
      getPage: books.getPage,
      estimateTranslation: async (chapterId, texts) => {
        estimated.push({ chapterId, texts });
        const characters = texts.join("").length;
        return { characters, known: 1, toSend: characters - 1, engine: chapterId === "b" ? "libretranslate" : "deepl" };
      },
    });

    expect(estimated).toEqual([
      { chapterId: "a", texts: ["Hello", "World", "Again"] },
      { chapterId: "b", texts: ["Third"] },
    ]);
    expect(estimate).toEqual({ chapters: 2, blockedChapters: 1, pages: 3, regions: 4, characters: 20, known: 2, toSend: 18, engine: "deepl", unreadable: 0 });
    // Les pages laissées telles quelles et le chapitre interdit ne sont même pas lus.
    expect(books.calls.getPage).toEqual(["a-p1", "a-p3", "b-p1", "b-p2", "empty-p1"]);
  });

  it("découpe un gros chapitre en paquets que le serveur accepte", async () => {
    expect(ESTIMATE_MAX_ITEMS).toBe(MAX_ITEMS);
    expect(ESTIMATE_MAX_CHARACTERS).toBe(MAX_TOTAL_LENGTH);

    expect(chunkTexts([])).toEqual([]);
    expect(chunkTexts(["a", "b", "c", "d", "e"], 2).map((chunk) => chunk.length)).toEqual([2, 2, 1]);
    expect(chunkTexts(["aaaa", "bbbb", "cc", "dddddddd"], 10, 8)).toEqual([["aaaa", "bbbb"], ["cc"], ["dddddddd"]]);

    const texts = Array.from({ length: 950 }, (_, index) => `Phrase ${index}`);
    const books = library([{ id: "big", pages: [texts] }]);
    const sizes: number[] = [];
    const estimate = await estimateFolderTranslation(["big"], {
      getChapter: books.getChapter,
      getPage: books.getPage,
      estimateTranslation: async (_, chunk) => {
        sizes.push(chunk.length);
        return { characters: chunk.length, known: 0, toSend: chunk.length };
      },
    });
    expect(sizes).toEqual([400, 400, 150]);
    expect(estimate).toMatchObject({ regions: 950, characters: 950, toSend: 950, pages: 1 });
    expect(estimate.engine).toBeUndefined();
  });

  it("compte les pages illisibles sans faire échouer l'estimation", async () => {
    const books = library([{ id: "a", pages: [["Un"], ["Deux"]] }]);
    const estimate = await estimateFolderTranslation(["a"], {
      getChapter: books.getChapter,
      getPage: async (id) => {
        if (id === "a-p2") throw new Error("Page introuvable.");
        return books.getPage(id);
      },
      estimateTranslation: async (_, texts) => ({ characters: texts.join("").length, known: 0, toSend: texts.join("").length }),
    });
    expect(estimate).toMatchObject({ pages: 1, regions: 1, unreadable: 1 });
  });
});
