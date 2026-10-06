import { describe, expect, it } from "vitest";
import { cleanGlossary, matchesGlossarySearch, validateGlossary } from "@/modules/scan-studio/lib/glossary-helpers";
import {
  applyTranslations,
  collectChapterTexts,
  collectTexts,
  isFullyTranslated,
  statusAfterTranslation,
  translateChapter,
  translatePage,
  type TranslateDeps,
  type TranslateProgress,
} from "@/modules/scan-studio/lib/translate-pages";
import {
  DEFAULT_CHAPTER_SETTINGS,
  DEFAULT_MASK,
  type PageStatus,
  type PageView,
  type RegionKind,
  type ScanRegion,
  type TranslationBatch,
  type TranslationItem,
  type TranslationStatus,
} from "@/modules/scan-studio/lib/types";

function region(id: string, clean: string, change: { kind?: RegionKind; status?: TranslationStatus; text?: string; engine?: string } = {}): ScanRegion {
  return {
    id,
    kind: change.kind ?? "dialogue",
    outline: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ],
    direction: "horizontal",
    reading: { raw: clean.toUpperCase(), clean, confidence: 1, engine: "manual", edited: false },
    translation: { text: change.text ?? "", status: change.status ?? "todo", engine: change.engine, history: [] },
    mask: { ...DEFAULT_MASK },
    text: { box: { x: 0, y: 0, width: 10, height: 10, rotation: 0 }, style: null, autoFit: true },
  };
}

function pageView(id: string, regions: ScanRegion[], status: PageStatus = "analyzed", revision = 3): PageView {
  return {
    page: { id, chapterId: "chapter00001", name: `${id}.png`, source: { file: `${id}.png`, width: 800, height: 1200 }, regions, status, revision, createdAt: 1, updatedAt: 1 },
    imageUrl: "",
    chapter: { id: "chapter00001", number: "1", settings: DEFAULT_CHAPTER_SETTINGS, pageIds: [id] },
    folder: { id: "folder000001", name: "Série" },
  };
}

interface FakeServer extends TranslateDeps {
  calls: { chapterId: string; items: TranslationItem[]; options: unknown }[];
  saves: { pageId: string; regions: ScanRegion[]; status?: PageStatus; revision: number }[];
  reads: string[];
}

/** Faux serveur : compte ses appels, et répond ce que `answer` décide pour chaque lot. */
function fakeServer(pages: Record<string, PageView>, answer: (items: TranslationItem[], call: number) => TranslationBatch | Error): FakeServer {
  const server: FakeServer = {
    calls: [],
    saves: [],
    reads: [],
    getPage: async (pageId) => {
      server.reads.push(pageId);
      const view = pages[pageId];
      if (!view) throw new Error("Page introuvable.");
      return structuredClone(view);
    },
    translateTexts: async (chapterId, items, options) => {
      server.calls.push({ chapterId, items, options });
      const batch = answer(items, server.calls.length);
      if (batch instanceof Error) throw batch;
      return batch;
    },
    savePage: async (pageId, input) => {
      server.saves.push({ pageId, ...input });
      return { revision: input.revision + 1, updatedAt: 2 };
    },
  };
  return server;
}

const translateAll = (items: TranslationItem[]): TranslationBatch => ({
  results: items.map((item) => ({ id: item.id, text: `fr:${item.text}`, source: "engine", engine: "deepl" })),
  failed: [],
  sentCharacters: items.reduce((sum, item) => sum + item.text.length, 0),
});

describe("scan studio : zones à traduire", () => {
  it("ne garde que les zones lues, à traduire, dans l'ordre de la page", () => {
    const regions = [
      region("a", "Hello"),
      region("b", "   "),
      region("c", "Boom", { kind: "sfx" }),
      region("d", "Exit", { kind: "background" }),
      region("e", "Done", { status: "proposed", text: "Fait" }),
      region("f", "Mine", { status: "edited", text: "À moi" }),
      region("g", "Yes", { status: "approved", text: "Oui" }),
      region("h", "  Bye  ", { kind: "thought" }),
    ];
    expect(collectTexts({ regions })).toEqual([
      { id: "a", text: "Hello" },
      { id: "h", text: "Bye" },
    ]);
  });

  it("reprend les zones proposées à la demande, jamais les zones corrigées ou validées", () => {
    const regions = [
      region("a", "Hello"),
      region("e", "Done", { status: "proposed", text: "Fait" }),
      region("f", "Mine", { status: "edited", text: "À moi" }),
      region("g", "Yes", { status: "approved", text: "Oui" }),
    ];
    expect(collectTexts({ regions }, { retranslate: true }).map((item) => item.id)).toEqual(["a", "e"]);
  });

  it("traite les onomatopées quand on le demande", () => {
    const regions = [region("c", "Boom", { kind: "sfx" }), region("d", "Exit", { kind: "background" })];
    expect(collectTexts({ regions }, { skipKinds: ["background"] }).map((item) => item.id)).toEqual(["c"]);
  });
});

describe("scan studio : pose des traductions", () => {
  it("écrit le texte, le statut et le moteur, sans modifier les zones reçues", () => {
    const regions = [region("a", "Hello"), region("b", "Bye")];
    const { regions: next, applied } = applyTranslations(regions, [{ id: "a", text: " Bonjour ", source: "engine", engine: "libretranslate" }], 100);
    expect(applied).toBe(1);
    expect(next[0].translation).toEqual({ text: "Bonjour", status: "proposed", engine: "libretranslate", history: [] });
    expect(next[1]).toBe(regions[1]);
    expect(regions[0].translation.status).toBe("todo");
  });

  it("range l'ancien texte dans l'historique, avec son moteur", () => {
    const regions = [region("a", "Hello", { status: "proposed", text: "Salut", engine: "libretranslate" })];
    const { regions: next } = applyTranslations(regions, [{ id: "a", text: "Bonjour", source: "engine", engine: "deepl" }], 100);
    expect(next[0].translation.history).toEqual([{ text: "Salut", engine: "libretranslate", at: 100 }]);
    expect(next[0].translation.engine).toBe("deepl");
  });

  it("n'ajoute rien à l'historique quand la proposition est la même", () => {
    const regions = [region("a", "Hello", { status: "proposed", text: "Bonjour", engine: "deepl" })];
    const { regions: next } = applyTranslations(regions, [{ id: "a", text: "Bonjour", source: "cache", engine: "deepl" }], 100);
    expect(next[0].translation.history).toEqual([]);
  });

  it("note le glossaire ou la mémoire quand aucun moteur n'a travaillé", () => {
    const regions = [region("a", "Naruto"), region("b", "Hello")];
    const { regions: next } = applyTranslations(
      regions,
      [
        { id: "a", text: "Naruto", source: "glossary" },
        { id: "b", text: "Bonjour", source: "memory" },
      ],
      1
    );
    expect(next.map((entry) => entry.translation.engine)).toEqual(["glossary", "memory"]);
  });

  it("ne touche jamais une zone corrigée ou validée, ni ne pose un texte vide", () => {
    const regions = [region("f", "Mine", { status: "edited", text: "À moi" }), region("g", "Yes", { status: "approved", text: "Oui" }), region("a", "Hello")];
    const { regions: next, applied } = applyTranslations(
      regions,
      [
        { id: "f", text: "Le mien", source: "engine", engine: "deepl" },
        { id: "g", text: "Ouais", source: "engine", engine: "deepl" },
        { id: "a", text: "   ", source: "engine", engine: "deepl" },
        { id: "zz", text: "Perdu", source: "engine", engine: "deepl" },
      ],
      1
    );
    expect(applied).toBe(0);
    expect(next).toEqual(regions);
  });
});

describe("scan studio : état de la page après traduction", () => {
  it("dit « traduite » quand chaque zone à traduire porte un texte", () => {
    const done = [region("a", "Hello", { status: "proposed", text: "Bonjour" }), region("c", "Boom", { kind: "sfx" })];
    expect(isFullyTranslated(done)).toBe(true);
    expect(statusAfterTranslation("analyzed", done)).toBe("translated");
    expect(statusAfterTranslation("imported", done)).toBe("translated");
  });

  it("ne change rien tant qu'une zone attend, ou sans zone à traduire", () => {
    expect(statusAfterTranslation("analyzed", [region("a", "Hello", { status: "proposed", text: "Bonjour" }), region("b", "Bye")])).toBeUndefined();
    expect(statusAfterTranslation("analyzed", [region("c", "Boom", { kind: "sfx" })])).toBeUndefined();
    expect(statusAfterTranslation("analyzed", [])).toBeUndefined();
  });

  it("ne fait jamais reculer une page relue ou exportée", () => {
    const done = [region("a", "Hello", { status: "proposed", text: "Bonjour" })];
    expect(statusAfterTranslation("reviewed", done)).toBeUndefined();
    expect(statusAfterTranslation("exported", done)).toBeUndefined();
    expect(statusAfterTranslation("translated", done)).toBeUndefined();
  });
});

describe("scan studio : traduction d'une page", () => {
  it("envoie toute la page en un seul appel et l'enregistre avec la révision lue", async () => {
    const server = fakeServer({ p1: pageView("p1", [region("a", "Hello"), region("b", "Bye"), region("c", "Boom", { kind: "sfx" })]) }, translateAll);
    const steps: string[] = [];
    const outcome = await translatePage("p1", { deps: server, now: () => 50, onStep: (step) => steps.push(step) });

    expect(server.calls).toHaveLength(1);
    expect(server.calls[0].chapterId).toBe("chapter00001");
    expect(server.calls[0].items).toEqual([
      { id: "a", text: "Hello" },
      { id: "b", text: "Bye" },
    ]);
    expect(server.calls[0].options).toBeUndefined();
    expect(server.saves).toHaveLength(1);
    expect(server.saves[0].revision).toBe(3);
    expect(server.saves[0].status).toBe("translated");
    expect(server.saves[0].regions.map((entry) => entry.translation.text)).toEqual(["fr:Hello", "fr:Bye", ""]);
    expect(steps).toEqual(["reading", "translating", "saving"]);
    expect(outcome).toMatchObject({ state: "done", requested: 2, translated: 2, sentCharacters: 8, enginesDown: false });
  });

  it("n'appelle aucun moteur quand la page n'a rien à traduire", async () => {
    const server = fakeServer({ p1: pageView("p1", [region("f", "Mine", { status: "edited", text: "À moi" })]) }, translateAll);
    const outcome = await translatePage("p1", { deps: server });
    expect(outcome.state).toBe("skipped");
    expect(server.calls).toHaveLength(0);
    expect(server.saves).toHaveLength(0);
  });

  it("transmet le moteur imposé et la demande d'ignorer le cache", async () => {
    const server = fakeServer({ p1: pageView("p1", [region("a", "Hello", { status: "proposed", text: "Salut" })]) }, translateAll);
    await translatePage("p1", { deps: server, retranslate: true, engine: "deepl", force: true });
    expect(server.calls[0].options).toEqual({ engine: "deepl", force: true });
  });

  it("enregistre ce qui a été traduit et signale que les moteurs ne répondent plus", async () => {
    const server = fakeServer({ p1: pageView("p1", [region("a", "Hello"), region("b", "Bye")]) }, (items) => ({
      results: [{ id: items[0].id, text: "Bonjour", source: "memory" }],
      failed: [{ id: items[1].id, error: "Aucun moteur disponible." }],
      sentCharacters: 0,
    }));
    const outcome = await translatePage("p1", { deps: server });
    expect(outcome).toMatchObject({ state: "done", translated: 1, enginesDown: true });
    expect(server.saves).toHaveLength(1);
    expect(server.saves[0].status).toBeUndefined();
  });

  it("n'enregistre rien quand le routeur refuse, et le dit", async () => {
    const server = fakeServer({ p1: pageView("p1", [region("a", "Hello")]) }, () => new Error("Niveau du chapitre insuffisant."));
    const outcome = await translatePage("p1", { deps: server });
    expect(outcome).toMatchObject({ state: "error", enginesDown: true, error: "Niveau du chapitre insuffisant." });
    expect(server.saves).toHaveLength(0);
  });

  it("rend une erreur de page quand l'enregistrement est refusé", async () => {
    const server = fakeServer({ p1: pageView("p1", [region("a", "Hello")]) }, translateAll);
    server.savePage = async () => {
      throw new Error("La page a changé entre-temps.");
    };
    const outcome = await translatePage("p1", { deps: server });
    expect(outcome).toMatchObject({ state: "error", translated: 0, enginesDown: false, error: "La page a changé entre-temps." });
  });

  it("ne part pas si l'arrêt est déjà demandé", async () => {
    const server = fakeServer({ p1: pageView("p1", [region("a", "Hello")]) }, translateAll);
    const controller = new AbortController();
    controller.abort();
    const outcome = await translatePage("p1", { deps: server, signal: controller.signal });
    expect(outcome.aborted).toBe(true);
    expect(server.reads).toHaveLength(0);
    expect(server.calls).toHaveLength(0);
  });
});

describe("scan studio : traduction d'un chapitre", () => {
  const chapterPages = () => ({
    p1: pageView("p1", [region("a", "Hello")]),
    p2: pageView("p2", [region("b", "Done", { status: "approved", text: "Fait" })]),
    p3: pageView("p3", [region("c", "Bye"), region("d", "Wait")]),
    p4: pageView("p4", [region("e", "Again")]),
  });

  it("traite les pages une à une, dans l'ordre, un appel par page à traduire", async () => {
    let running = 0;
    let peak = 0;
    const server = fakeServer(chapterPages(), translateAll);
    const translate = server.translateTexts;
    server.translateTexts = async (...args) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      const batch = await translate(...args);
      running--;
      return batch;
    };
    const progress: TranslateProgress[] = [];
    const result = await translateChapter(["p1", "p2", "p3", "p4"], { deps: server, onProgress: (entry) => progress.push(entry) });

    expect(peak).toBe(1);
    expect(server.reads).toEqual(["p1", "p2", "p3", "p4"]);
    expect(server.calls.map((call) => call.items.length)).toEqual([1, 2, 1]);
    expect(result).toMatchObject({ translatedPages: 3, translatedRegions: 4, sentCharacters: 17, failed: [], remaining: [] });
    expect(result.stopped).toBeUndefined();
    expect(progress.filter((entry) => entry.outcome).map((entry) => `${entry.pageId}:${entry.step}`)).toEqual(["p1:done", "p2:skipped", "p3:done", "p4:done"]);
  });

  it("s'arrête dès qu'aucun moteur ne répond, sans envoyer les pages suivantes", async () => {
    const server = fakeServer(chapterPages(), (items, call) =>
      call === 1 ? translateAll(items) : { results: [], failed: items.map((item) => ({ id: item.id, error: "DeepL et LibreTranslate sont indisponibles." })), sentCharacters: 0 }
    );
    const result = await translateChapter(["p1", "p2", "p3", "p4"], { deps: server });

    expect(server.calls).toHaveLength(2);
    expect(server.reads).toEqual(["p1", "p2", "p3"]);
    expect(result.stopped).toBe("engines");
    expect(result.stopReason).toBe("DeepL et LibreTranslate sont indisponibles.");
    expect(result.remaining).toEqual(["p4"]);
    expect(result.translatedPages).toBe(1);
    expect(result.failed).toEqual([{ pageId: "p3", error: "DeepL et LibreTranslate sont indisponibles." }]);
    expect(server.saves.map((save) => save.pageId)).toEqual(["p1"]);
  });

  it("continue après une page illisible : aucun moteur n'est en cause", async () => {
    const pages = chapterPages();
    const server = fakeServer({ p1: pages.p1, p3: pages.p3 }, translateAll);
    const result = await translateChapter(["p1", "gone", "p3"], { deps: server });
    expect(result.failed).toEqual([{ pageId: "gone", error: "Page introuvable." }]);
    expect(result.translatedPages).toBe(2);
    expect(result.stopped).toBeUndefined();
  });

  it("s'arrête à la demande entre deux pages, en gardant ce qui est fait", async () => {
    const controller = new AbortController();
    const server = fakeServer(chapterPages(), translateAll);
    const result = await translateChapter(["p1", "p3", "p4"], {
      deps: server,
      signal: controller.signal,
      onProgress: (entry) => {
        if (entry.pageId === "p1" && entry.step === "done") controller.abort();
      },
    });
    expect(result.stopped).toBe("aborted");
    expect(result.remaining).toEqual(["p3", "p4"]);
    expect(server.calls).toHaveLength(1);
    expect(server.saves).toHaveLength(1);
  });

  it("retient la bascule sur le secours, une seule fois", async () => {
    const server = fakeServer(chapterPages(), (items) => ({
      ...translateAll(items),
      fallback: { from: "deepl", to: "libretranslate", reason: "Quota épuisé." },
    }));
    const result = await translateChapter(["p1", "p3"], { deps: server });
    expect(result.fallbacks).toEqual([{ from: "deepl", to: "libretranslate", reason: "Quota épuisé." }]);
  });
});

describe("scan studio : textes d'un lot avant estimation", () => {
  it("rassemble les phrases sans appeler de moteur", async () => {
    const server = fakeServer(
      {
        p1: pageView("p1", [region("a", "Hello")]),
        p2: pageView("p2", [region("b", "Done", { status: "approved", text: "Fait" })]),
        p3: pageView("p3", [region("c", "Bye"), region("d", "Wait")]),
      },
      translateAll
    );
    const texts = await collectChapterTexts(["p1", "p2", "p3", "gone"], { deps: server });
    expect(texts.texts).toEqual(["Hello", "Bye", "Wait"]);
    expect(texts.pages.map((entry) => entry.pageId)).toEqual(["p1", "p3"]);
    expect(texts.regionCount).toBe(3);
    expect(texts.unreadable).toEqual(["gone"]);
    expect(server.calls).toHaveLength(0);
  });
});

describe("scan studio : glossaire", () => {
  it("refuse les termes vides, les doublons et les traductions manquantes", () => {
    expect(
      validateGlossary([
        { source: "Hokage", target: "Hokage", keep: true },
        { source: "  ", target: "vide" },
        { source: "Sensei", target: "Maître" },
        { source: " sensei ", target: "Professeur" },
        { source: "Village", target: "" },
        { source: "Konoha", target: "", keep: true },
      ])
    ).toEqual([null, "empty-source", "duplicate", "duplicate", "empty-target", null]);
  });

  it("refuse les termes trop longs", () => {
    expect(validateGlossary([{ source: "a".repeat(201), target: "b" }])).toEqual(["too-long"]);
    expect(validateGlossary([{ source: "a", target: "b", note: "n".repeat(501) }])).toEqual(["too-long"]);
  });

  it("nettoie les lignes avant l'enregistrement", () => {
    expect(cleanGlossary([{ source: "  Grand   Sage ", target: " Grand Sage", keep: false, note: "  " }, { source: "Konoha", target: "", keep: true, note: " village " }])).toEqual([
      { source: "Grand Sage", target: "Grand Sage" },
      { source: "Konoha", target: "", keep: true, note: "village" },
    ]);
  });

  it("cherche dans le terme, la traduction et la note", () => {
    const entry = { source: "Sensei", target: "Maître", note: "titre honorifique" };
    expect(matchesGlossarySearch(entry, "")).toBe(true);
    expect(matchesGlossarySearch(entry, "SENS")).toBe(true);
    expect(matchesGlossarySearch(entry, "maît")).toBe(true);
    expect(matchesGlossarySearch(entry, "honor")).toBe(true);
    expect(matchesGlossarySearch(entry, "ninja")).toBe(false);
  });
});
