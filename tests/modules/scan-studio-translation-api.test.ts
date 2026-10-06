import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Le point d'entrée du module charge aussi la galerie : rien n'en est utilisé ici.
vi.mock("@/lib/config", () => ({ getAbsoluteUploadPath: () => path.join(os.tmpdir(), "scan-studio-no-uploads") }));
vi.mock("@/lib/secure-files", () => ({ setFileSecure: async () => undefined }));
vi.mock("@/lib/gallery-events", () => ({ announceNewUpload: async () => undefined }));

import * as api from "@/modules/scan-studio/index.process";
import { MAX_ITEMS, MAX_TEXT_LENGTH, setRouter } from "@/modules/scan-studio/lib/server/translation";
import type { TranslationEngine } from "@/modules/scan-studio/lib/server/translation/engines";
import { TranslationRouter } from "@/modules/scan-studio/lib/server/translation/router";
import { newPageId, setDataRoot, writePage } from "@/modules/scan-studio/lib/store";
import { DEFAULT_MASK, type ScanRegion, type TranslationStatus } from "@/modules/scan-studio/lib/types";

// Les fonctions du module, de bout en bout, avec de faux moteurs : aucun
// service réel, et le compteur d'appels du faux moteur fait foi.

let root = "";
let calls: { engine: string; texts: string[]; source: string; target: string }[] = [];

function fakeEngine(id: "deepl" | "libretranslate"): TranslationEngine {
  return {
    id,
    async translate(texts, source, target) {
      calls.push({ engine: id, texts: [...texts], source, target });
      return texts.map((text) => `${id}:${text}`);
    },
  };
}

function region(id: string, clean: string, text: string, status: TranslationStatus): ScanRegion {
  return {
    id,
    kind: "dialogue",
    outline: [
      { x: 5, y: 5 },
      { x: 40, y: 5 },
      { x: 40, y: 30 },
    ],
    direction: "horizontal",
    reading: { raw: clean.toUpperCase(), clean, confidence: 1, engine: "manual", edited: true },
    translation: { text, status, engine: "manual", history: [] },
    mask: { ...DEFAULT_MASK },
    text: { box: { x: 5, y: 5, width: 35, height: 25, rotation: 0 }, style: null, autoFit: true },
  };
}

async function library() {
  const folder = await api.createFolder({ name: "Série" });
  const chapter = await api.createChapter(folder.id, { number: "1" });
  return { folder, chapter };
}

/** Une page sans image : l'enregistrement de ses zones n'en a pas besoin. */
function blankPage(chapterId: string): string {
  const id = newPageId();
  const now = Date.now();
  writePage({
    id,
    chapterId,
    name: "001.png",
    source: { file: "1760000000000-0000000000.png", width: 100, height: 100 },
    regions: [],
    status: "imported",
    revision: 0,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-studio-api-"));
  setDataRoot(path.join(root, "data"));
  calls = [];
  setRouter(
    new TranslationRouter({
      clock: { now: () => Date.UTC(2026, 9, 6, 12), sleep: async () => undefined },
      resolve: (id) => ({ engine: fakeEngine(id), fingerprint: id }),
    })
  );
});

afterEach(() => {
  setRouter(null);
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

describe("translateTexts", () => {
  it("traduit avec les langues du chapitre et le glossaire du dossier", async () => {
    const { folder, chapter } = await library();
    await api.updateFolder(folder.id, { glossary: [{ source: "Luffy", target: "Rufy" }] });
    await api.updateChapter(chapter.id, { settings: { ...chapter.settings, sourceLanguage: "ja", targetLanguage: "es" } });

    const batch = await api.translateTexts(chapter.id, [
      { id: "a", text: "Luffy is here" },
      { id: "b", text: "Luffy" },
    ]);
    expect(calls).toEqual([{ engine: "deepl", texts: ["⟦0⟧ is here"], source: "ja", target: "es" }]);
    expect(batch.results).toEqual([
      { id: "a", text: "deepl:Rufy is here", source: "engine", engine: "deepl" },
      { id: "b", text: "Rufy", source: "glossary" },
    ]);
  });

  it("refuse ce qui est mal formé avant tout appel", async () => {
    const { chapter } = await library();
    const many = Array.from({ length: MAX_ITEMS + 1 }, (_, index) => ({ id: `z${index}`, text: "Hi" }));
    const refused: unknown[] = [
      "Hi",
      many,
      [{ id: "a" }],
      [{ id: "", text: "Hi" }],
      [{ id: "x".repeat(65), text: "Hi" }],
      [{ id: "a\u0000b", text: "Hi" }],
      [{ id: 7, text: "Hi" }],
      [{ id: "a", text: "x".repeat(MAX_TEXT_LENGTH + 1) }],
      [{ id: "a", text: "bell\u0007" }],
      [{ id: "a", text: "escape\u001b[2J" }],
      [{ id: "a", text: "tab\there" }],
      [null],
    ];
    for (const items of refused) {
      await expect(api.translateTexts(chapter.id, items as never)).rejects.toThrow();
    }
    await expect(api.translateTexts(chapter.id, [{ id: "a", text: "Hi" }], { engine: "google" } as never)).rejects.toThrow("Moteur de traduction inconnu.");
    await expect(api.translateTexts(chapter.id, [{ id: "a", text: "Hi" }], { force: "oui" } as never)).rejects.toThrow();
    await expect(api.translateTexts("zzzzzzzzzzzz", [{ id: "a", text: "Hi" }])).rejects.toThrow("Chapitre introuvable.");
    expect(calls).toEqual([]);
  });

  it("accepte un retour à la ligne, et un lot vide ne fait rien", async () => {
    const { chapter } = await library();
    const batch = await api.translateTexts(chapter.id, [{ id: "a", text: "Two\r\nlines" }]);
    expect(calls[0].texts).toEqual(["Two\nlines"]);
    expect(batch.results).toHaveLength(1);
    expect(await api.translateTexts(chapter.id, [])).toEqual({ results: [], failed: [], sentCharacters: 0 });
    expect(calls).toHaveLength(1);
  });

  it("passe le moteur imposé et la demande de retraduction", async () => {
    const { chapter } = await library();
    await api.translateTexts(chapter.id, [{ id: "a", text: "Hi" }]);
    await api.translateTexts(chapter.id, [{ id: "a", text: "Hi" }]);
    expect(calls).toHaveLength(1);
    await api.translateTexts(chapter.id, [{ id: "a", text: "Hi" }], { force: true });
    await api.translateTexts(chapter.id, [{ id: "a", text: "Hi" }], { engine: "libretranslate" });
    expect(calls.map((call) => call.engine)).toEqual(["deepl", "deepl", "libretranslate"]);
  });

  it("n'appelle aucun moteur sous le niveau 2 du chapitre", async () => {
    const { chapter } = await library();
    await api.updateChapter(chapter.id, { settings: { ...chapter.settings, maxLevel: 1 } });
    const batch = await api.translateTexts(chapter.id, [{ id: "a", text: "Hi" }]);
    expect(calls).toEqual([]);
    expect(batch.results).toEqual([]);
    expect(batch.failed[0].error).toContain("niveau d'automatisation");
    expect((await api.estimateTranslation(chapter.id, ["Hi"])).engine).toBeUndefined();
  });
});

describe("mémoire de traduction alimentée par les pages", () => {
  it("reprend une phrase validée à l'enregistrement d'une page, sans appel", async () => {
    const { folder, chapter } = await library();
    const pageId = blankPage(chapter.id);
    await api.savePage(pageId, {
      revision: 0,
      regions: [
        region("region000001", "I'm home.", "Je suis rentré.", "approved"),
        region("region000002", "Not yet.", "Pas encore.", "edited"),
        region("region000003", "", "Sans lecture.", "approved"),
        region("region000004", "Empty.", "   ", "approved"),
      ],
    });

    const batch = await api.translateTexts(chapter.id, [
      { id: "a", text: "I'm home." },
      { id: "b", text: "Not yet." },
    ]);
    expect(batch.results[0]).toEqual({ id: "a", text: "Je suis rentré.", source: "memory" });
    expect(calls).toEqual([{ engine: "deepl", texts: ["Not yet."], source: "en", target: "fr" }]);

    // Un autre chapitre du même dossier en profite ; un autre dossier, non.
    const sibling = await api.createChapter(folder.id, { number: "2" });
    expect((await api.translateTexts(sibling.id, [{ id: "a", text: "I'm home." }])).results[0].source).toBe("memory");
    const other = await library();
    expect((await api.translateTexts(other.chapter.id, [{ id: "a", text: "I'm home." }])).results[0].source).toBe("engine");
  });

  it("garde la dernière validation, et s'efface avec le dossier", async () => {
    const { folder, chapter } = await library();
    const pageId = blankPage(chapter.id);
    await api.savePage(pageId, { revision: 0, regions: [region("region000001", "Go!", "Allez !", "approved")] });
    await api.savePage(pageId, { revision: 1, regions: [region("region000001", "Go!", "Vas-y !", "approved")] });
    expect((await api.translateTexts(chapter.id, [{ id: "a", text: "Go!" }])).results[0].text).toBe("Vas-y !");

    const file = path.join(root, "data", "translation", "memory", `${folder.id}.json`);
    expect(fs.existsSync(file)).toBe(true);
    await api.deleteFolder(folder.id);
    expect(fs.existsSync(file)).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("estimateTranslation, getEngines, réglages", () => {
  it("estime un lot sans rien envoyer", async () => {
    const { chapter } = await library();
    await api.translateTexts(chapter.id, [{ id: "a", text: "Known." }]);
    const estimate = await api.estimateTranslation(chapter.id, ["Known.", "Fresh."]);
    expect(estimate).toEqual({ characters: 12, known: 6, toSend: 6, engine: "deepl" });
    expect(calls).toHaveLength(1);
    await expect(api.estimateTranslation(chapter.id, ["bad\u0001"])).rejects.toThrow();
    await expect(api.estimateTranslation(chapter.id, "Known." as never)).rejects.toThrow();
  });

  it("rend l'état des moteurs et applique les réglages", async () => {
    const before = await api.getEngines();
    expect(before.order).toEqual(["deepl", "libretranslate"]);
    expect(before.engines.map((engine) => engine.available)).toEqual([true, true]);

    const after = await api.saveEngineSettings({ order: ["libretranslate", "deepl"], monthlyLimits: { deepl: 1000 } });
    expect(after.order).toEqual(["libretranslate", "deepl"]);
    expect(after.engines[0]).toMatchObject({ id: "deepl", monthlyLimit: 1000 });
    await expect(api.saveEngineSettings({ order: ["nope"] } as never)).rejects.toThrow("Ordre des moteurs invalide.");
  });

  it("essaie un moteur en une requête", async () => {
    expect(await api.testEngine("libretranslate")).toMatchObject({ ok: true });
    expect(calls).toEqual([{ engine: "libretranslate", texts: ["Hello"], source: "en", target: "fr" }]);
    await expect(api.testEngine("google" as never)).rejects.toThrow("Moteur de traduction inconnu.");
  });
});
