import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// L'assistant appelle d'autres modules par le gestionnaire : aucun appel ici, les accès sont injectés.
vi.mock("@/lib/modules/module-manager.api", () => ({ apiModuleManager: { callModuleFunction: vi.fn(), getLoadedModule: vi.fn() } }));

const store = vi.hoisted(() => ({ assets: [] as any[] }));

vi.mock("@/modules/clip-studio/lib/store", async (importOriginal) => {
  const nodeFs = await import("node:fs");
  const nodeOs = await import("node:os");
  const nodePath = await import("node:path");
  const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "sxm-clip-source-"));
  const DATA_DIR = nodePath.join(root, "data");
  const ASSETS_DIR = nodePath.join(DATA_DIR, "assets");
  nodeFs.mkdirSync(ASSETS_DIR, { recursive: true });
  return {
    ...(await importOriginal<object>()),
    DATA_DIR,
    ASSETS_DIR,
    ensureDirs: () => nodeFs.mkdirSync(ASSETS_DIR, { recursive: true }),
    readAssets: () => store.assets.map((asset) => ({ ...asset })),
    writeAssets: (assets: unknown[]) => {
      store.assets = assets as any[];
    },
    listProjectFiles: () => [],
  };
});

import {
  EXCERPT_LIMITS,
  cleanRequest,
  fitExcerpt,
  illustrateSegments,
  imagesSummary,
  loadSourceVideo,
  readExcerpt,
  sanitize,
  scriptPrompt,
  segmentPlans,
  transcriptLines,
  type AssistantJob,
  type AssistantRequest,
  type SegmentPlan,
} from "@/modules/clip-studio/lib/assistant";
import { ASSETS_DIR } from "@/modules/clip-studio/lib/store";
import type { TimedWord } from "@/modules/clip-studio/engine/types";

const REQUEST: AssistantRequest = { brief: "La cuisine du monde", template: "free", aspect: "9:16", count: 3, imageSource: "find-then-generate", videos: true };

const RAW = {
  title: "Cuisine",
  scenes: [
    { heading: "Le geste", text: "On émince.", image: { kind: "video", mode: "generate", query: "chef chopping vegetables", prompt: "A chef chopping" } },
    { heading: "Le plat", text: "Un ramen.", image: { kind: "image", mode: "find", query: "Ichiran ramen bowl", prompt: "A ramen bowl" }, excerpt: { start: 12, end: 18, keepAudio: true } },
    { heading: "La mascotte", image: { kind: "video", mode: "find", query: "mascot cooking", prompt: "The mascot cooks" }, mascot: true },
    { heading: "Le marché", text: "Des étals.", image: { kind: "video", query: "", prompt: "A market" }, excerpt: { start: "30", end: 34.04, keepAudio: "yes" } },
  ],
};

const words = (entries: [string, number, number][]): TimedWord[] => entries.map(([text, startMs, endMs]) => ({ text, startMs, endMs }));

beforeEach(() => {
  store.assets = [];
});

describe("Script : image ou vidéo, et extraits", () => {
  it("lit le choix d'une vidéo, jamais pour la mascotte ni sans requête", () => {
    const script = sanitize({ ...REQUEST, count: 4 }, RAW);
    expect(script.imagePlans.map((plan) => plan.kind)).toEqual(["video", undefined, undefined, undefined]);
    // Une vidéo se cherche toujours : son mode devient « find ».
    expect(script.imagePlans[0]).toMatchObject({ mode: "find", query: "chef chopping vegetables", prompt: "A chef chopping" });
    expect(script.sourceExcerpts).toEqual([undefined, { start: 12, end: 18, keepAudio: true }, undefined, { start: 30, end: 34, keepAudio: false }]);
  });

  it("une vidéo est d'abord cherchée sur Pexels, puis une image, selon le mode", () => {
    const script = sanitize({ ...REQUEST, count: 4 }, RAW);
    const plans = segmentPlans({ ...REQUEST, count: 4 }, script);
    expect(plans[0]).toMatchObject({ action: "find", video: true, fallback: true });
    expect(plans[1].video).toBeUndefined();
    expect(plans[2]).toMatchObject({ action: "generate", mascot: true });
    expect(plans[2].video).toBeUndefined();
    // Sans vidéos proposées (pas de clé Pexels), le choix du script ne compte pas.
    expect(segmentPlans({ ...REQUEST, videos: false, count: 4 }, script)[0].video).toBeUndefined();
    // En mode « trouver seulement », pas de génération en secours.
    expect(segmentPlans({ ...REQUEST, imageSource: "find", count: 4 }, script)[0]).toMatchObject({ video: true, fallback: false });
  });

  it("un extrait muet couvre son segment : rien à illustrer ; un extrait cité laisse l'image après lui", () => {
    const script = sanitize({ ...REQUEST, count: 4 }, RAW);
    const plans = segmentPlans({ ...REQUEST, count: 4, sourceVideo: { ref: "module:clip-studio/assets/talk.mp4" } }, script);
    expect(plans[3]).toMatchObject({ action: "none", covered: true });
    expect(plans[1]).toMatchObject({ action: "find" });
    expect(plans[1].covered).toBeUndefined();
  });

  it("la consigne propose la vidéo seulement quand c'est permis", () => {
    const withVideos = scriptPrompt(REQUEST, null, { web: false });
    expect(withVideos).toContain('"kind": "image" | "video"');
    expect(withVideos).toContain("Pexels");
    const without = scriptPrompt({ ...REQUEST, videos: false }, null, { web: false });
    expect(without).not.toContain('"kind"');
    const generating = scriptPrompt({ ...REQUEST, imageSource: "generate" }, null, { web: false });
    expect(generating).not.toContain('"kind"');
  });

  it("donne la transcription comme une donnée, avec le schéma des extraits", () => {
    const transcript = transcriptLines(words([["Bonjour", 0, 400], ["à", 450, 500], ["tous.", 550, 900], ["Aujourd'hui", 65_000, 65_600], ["<on", 65_700, 66_000], ["cuisine.", 66_100, 66_800]]));
    expect(transcript).toBe("[00:00] Bonjour à tous.\n[01:05] Aujourd'hui <on cuisine.");
    const prompt = scriptPrompt(REQUEST, null, { web: false, source: { durationSec: 90, transcript } });
    expect(prompt).toContain('"excerpt": {"start": number, "end": number, "keepAudio": boolean} | null');
    expect(prompt).toContain("<transcription>");
    // La transcription ne peut pas refermer sa balise.
    expect(prompt).not.toContain("<on cuisine");
    expect(prompt).toContain("de 0 à 90");
    expect(prompt).toContain("keepAudio : true quand le passage est CITÉ");
    // Sans transcription, ou au quiz, rien n'est cité.
    expect(scriptPrompt(REQUEST, null, { web: false, source: { durationSec: 90 } })).toContain("keepAudio vaut toujours false");
    expect(scriptPrompt({ ...REQUEST, template: "quiz" }, null, { web: false, source: { durationSec: 90, transcript } })).toContain("keepAudio vaut toujours false");
  });

  it("borne la transcription", () => {
    const many = Array.from({ length: 2000 }, (_, index) => ({ text: index % 10 === 9 ? "fin." : "mot", startMs: index * 300, endMs: index * 300 + 250 }));
    const text = transcriptLines(many, 1000);
    expect(text.length).toBeLessThanOrEqual(1100);
    expect(text).toMatch(/\[transcription coupée à \d\d:\d\d\]$/);
  });
});

describe("Illustrations : vidéos et segments couverts", () => {
  it("compte une vidéo de Pexels comme trouvée, et ne compte pas un segment couvert par un extrait", async () => {
    const plan = (overrides: Partial<SegmentPlan>): SegmentPlan => ({ action: "find", fallback: true, query: "q", prompt: "p", mascot: false, text: "t", ...overrides });
    const job: Pick<AssistantJob, "images" | "imageSources"> = { images: { total: 0, done: 0, failed: 0, found: 0, generated: 0, missing: 0 } };
    const find = vi.fn(async () => ({ provider: "pexels" as const, source: { url: "/v.mp4", ref: "module:x/v.mp4", name: "v", kind: "video" as const } }));
    const generate = vi.fn(async () => undefined);
    const images = await illustrateSegments(job, [plan({ video: true }), plan({ action: "none", covered: true })], new AbortController().signal, () => undefined, { find, generate });
    expect(find).toHaveBeenCalledTimes(1);
    expect(images[0]?.kind).toBe("video");
    expect(images[1]).toBeUndefined();
    expect(job.images).toMatchObject({ total: 1, found: 1, missing: 0 });
    expect(job.imageSources).toEqual(["pexels", "none"]);
    expect(imagesSummary(job)).toBe("1 trouvée en vidéo, sur Pexels");
  });
});

describe("Extraits : contrôle sur la source", () => {
  const talk = words([["Bonjour", 10_000, 10_400], ["à", 10_450, 10_500], ["tous", 10_550, 11_000], ["merci.", 11_100, 11_700]]);
  const source = { durationSec: 60, words: talk, media: { hasAudio: true } };

  it("lit avec rigueur ce que le script écrit", () => {
    expect(readExcerpt(null)).toBeUndefined();
    expect(readExcerpt({ start: 5 })).toBeUndefined();
    expect(readExcerpt({ start: 8, end: 4 })).toBeUndefined();
    expect(readExcerpt({ start: -1, end: 4 })).toBeUndefined();
    expect(readExcerpt({ start: null, end: 4 })).toBeUndefined();
    expect(readExcerpt({ start: 1.234, end: "3.06", keepAudio: true })).toEqual({ start: 1.2, end: 3.1, keepAudio: true });
  });

  it("refuse un extrait hors de la source, borne sa durée de 1,5 à 12 s", () => {
    expect(fitExcerpt({ start: 61, end: 70, keepAudio: false }, source)).toBeNull();
    expect(fitExcerpt({ start: 60, end: 70, keepAudio: false }, source)).toBeNull();
    expect(fitExcerpt({ start: 1, end: 2, keepAudio: false }, { durationSec: 1 })).toBeNull();
    expect(fitExcerpt({ start: 20, end: 50, keepAudio: false }, source)).toEqual({ start: 20, end: 20 + EXCERPT_LIMITS.max, keepAudio: false });
    expect(fitExcerpt({ start: 20, end: 20.5, keepAudio: false }, source)).toEqual({ start: 20, end: 21.5, keepAudio: false });
    expect(fitExcerpt({ start: 58.9, end: 59.5, keepAudio: false }, source)).toEqual({ start: 58.5, end: 60, keepAudio: false });
  });

  it("une citation ne coupe pas un mot, et n'est citée que si l'on sait ce qui s'y dit", () => {
    expect(fitExcerpt({ start: 10.2, end: 11.5, keepAudio: true }, source)).toEqual({ start: 9.9, end: 11.9, keepAudio: true });
    expect(fitExcerpt({ start: 10.2, end: 11.5, keepAudio: true }, { durationSec: 60 })?.keepAudio).toBe(false);
    expect(fitExcerpt({ start: 10.2, end: 11.5, keepAudio: true }, { ...source, media: { hasAudio: false } })?.keepAudio).toBe(false);
  });
});

describe("Demande et vidéo source", () => {
  it("ne garde les vidéos qu'en recherche, et une vidéo source des médias du module", () => {
    expect(cleanRequest({ ...REQUEST }).videos).toBe(true);
    expect(cleanRequest({ ...REQUEST, imageSource: "generate" }).videos).toBeUndefined();
    expect(cleanRequest({ ...REQUEST, videos: undefined }).videos).toBeUndefined();
    expect(cleanRequest({ ...REQUEST, sourceVideo: { assetId: "remote-abc.mp4" } }).sourceVideo).toEqual({ ref: "module:clip-studio/assets/remote-abc.mp4" });
    expect(cleanRequest({ ...REQUEST, sourceVideo: { ref: "module:clip-studio/assets/remote-abc.mp4" } }).sourceVideo).toEqual({ ref: "module:clip-studio/assets/remote-abc.mp4" });
    expect(cleanRequest({ ...REQUEST, sourceVideo: { ref: "module:clip-studio/assets/../secrets.json" } }).sourceVideo).toBeUndefined();
    expect(cleanRequest({ ...REQUEST, sourceVideo: { ref: "upload:film.mp4" } }).sourceVideo).toBeUndefined();
  });

  const addAsset = (asset: Record<string, unknown>) => {
    fs.writeFileSync(path.join(ASSETS_DIR, String(asset.file)), "fake");
    store.assets.push({ kind: "video", originalName: "Interview.mp4", size: 4, createdAt: 1, ...asset });
  };

  it("transcrit la vidéo source et lui attache les mots", async () => {
    addAsset({ file: "talk.mp4", durationMs: 90_000, hasAudio: true });
    const transcribe = vi.fn(async () => ({ words: words([["Salut.", 1000, 1500]]), language: "fr" }));
    const loaded = await loadSourceVideo("module:clip-studio/assets/talk.mp4", new AbortController().signal, () => undefined, { transcribe });
    expect(transcribe).toHaveBeenCalledWith("module:clip-studio/assets/talk.mp4", expect.anything(), expect.any(Function));
    expect(loaded).toMatchObject({ durationSec: 90, language: "fr", media: { kind: "video", hasAudio: true, transcript: { provider: "openai", language: "fr" } } });
    expect(loaded.media.words).toHaveLength(1);
    expect(loaded.note).toBeUndefined();
  });

  it("réutilise une transcription rangée avec le média", async () => {
    addAsset({ file: "done.mp4", durationMs: 30_000, words: words([["Déjà.", 0, 400]]), transcript: { provider: "openai", language: "fr", at: 1 } });
    const transcribe = vi.fn();
    const loaded = await loadSourceVideo("module:clip-studio/assets/done.mp4", new AbortController().signal, () => undefined, { transcribe });
    expect(transcribe).not.toHaveBeenCalled();
    expect(loaded.words).toHaveLength(1);
  });

  it("sans crédit OpenAI, le clip continue : la raison est dite, rien n'est cité", async () => {
    addAsset({ file: "talk2.mp4", durationMs: 90_000, hasAudio: true });
    const transcribe = vi.fn(async () => {
      throw new Error("Le compte OpenAI n’a plus de crédit\u00a0: ajoutez-en sur platform.openai.com pour transcrire.");
    });
    const loaded = await loadSourceVideo("module:clip-studio/assets/talk2.mp4", new AbortController().signal, () => undefined, { transcribe });
    expect(loaded.words).toBeUndefined();
    expect(loaded.note).toMatch(/^Le compte OpenAI n’a plus de crédit.*transcrire\. Le script s’écrit sans la transcription/);
    expect(loaded.media.words).toBeUndefined();
  });

  it("une vidéo muette n'est pas transcrite ; une vidéo introuvable arrête le travail", async () => {
    addAsset({ file: "mute.mp4", durationMs: 20_000, hasAudio: false });
    const transcribe = vi.fn();
    const loaded = await loadSourceVideo("module:clip-studio/assets/mute.mp4", new AbortController().signal, () => undefined, { transcribe });
    expect(transcribe).not.toHaveBeenCalled();
    expect(loaded.note).toMatch(/sans son/);
    await expect(loadSourceVideo("module:clip-studio/assets/missing.mp4", new AbortController().signal, () => undefined, { transcribe })).rejects.toThrow(/introuvable/);
  });
});
