import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

// Les données du module vivent dans un répertoire temporaire, jamais dans `modules/clip-studio/data`.
const store = vi.hoisted(() => ({
  assets: [] as any[],
  projects: [] as any[],
  root: "",
}));

vi.mock("@/modules/clip-studio/lib/store", async () => {
  const nodeFs = await import("node:fs");
  const nodeOs = await import("node:os");
  const nodePath = await import("node:path");
  const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "sxm-clip-modes-"));
  store.root = root;
  const DATA_DIR = nodePath.join(root, "data");
  const ASSETS_DIR = nodePath.join(DATA_DIR, "assets");
  return {
    DATA_DIR,
    ASSETS_DIR,
    ensureDirs: () => nodeFs.mkdirSync(ASSETS_DIR, { recursive: true }),
    readAssets: () => store.assets.map((asset) => ({ ...asset })),
    writeAssets: (assets: unknown[]) => {
      store.assets = assets as any[];
    },
    listProjectFiles: () => store.projects,
    writeProject: (project: any) => {
      store.projects = [project, ...store.projects.filter((entry) => entry.id !== project.id)];
    },
  };
});
vi.mock("@/modules/clip-studio/lib/codex", () => ({
  askCodex: async () => {
    throw new Error("Codex n'est pas appelé dans les tests.");
  },
  extractJson: () => ({}),
}));
vi.mock("@/lib/modules/module-manager.api", () => ({ apiModuleManager: { callModuleFunction: async () => null } }));
vi.mock("@/lib/config", () => ({ getAbsoluteUploadPath: () => path.join(store.root, "uploads") }));

import { applyBrandTheme, defaultRoleStyles, type BrandTheme } from "@/modules/clip-studio/engine/brand";
import { BACKDROP_MOTION, buildSubtitledClip, needsBackdrop, splitCaption } from "@/modules/clip-studio/engine/video-templates";
import { cameraAt } from "@/modules/clip-studio/engine/timeline";
import type { ClipAsset, ClipProject, MediaSource, TextItem, TimedWord, VideoItem } from "@/modules/clip-studio/engine/types";
import {
  MOMENT_LIMITS,
  analyzeMoments,
  chunkTranscript,
  cleanMomentEdits,
  compactTranscript,
  momentWords,
  readRawMoments,
  repairMoments,
  sentencesOf,
  type ClipMoment,
} from "@/modules/clip-studio/lib/clip-moments";
import {
  clipDeps,
  createClipsFromMoments,
  excerptArgs,
  excerptAsset,
  excerptsBytes,
  getClipJob,
  noteUploadedAsset,
  startClipping,
  startSubtitleClip,
  type ClipJob,
} from "@/modules/clip-studio/lib/clip-jobs";
import { ASSETS_DIR } from "@/modules/clip-studio/lib/store";
import { diskDeps } from "@/modules/clip-studio/lib/job-safety";
import { TranscriptionError } from "@/modules/clip-studio/lib/transcribe";

/**
 * Parole de `sentences` phrases de `perSentence` mots, un mot toutes les
 * 400 ms, 300 ms de silence entre deux phrases.
 */
function speech(sentences: number, perSentence = 5): TimedWord[] {
  const words: TimedWord[] = [];
  let at = 0;
  for (let s = 0; s < sentences; s++) {
    for (let w = 0; w < perSentence; w++) {
      const last = w === perSentence - 1;
      words.push({ text: `${w === 0 ? "Phrase" : "mot"}${s}-${w}${last ? "." : ""}`, startMs: at, endMs: at + 350 });
      at += 400;
    }
    at += 300;
  }
  return words;
}

const items = (project: ClipProject) => project.tracks.flatMap((track) => track.items);
const trackNamed = (project: ClipProject, name: string) => project.tracks.find((track) => track.name === name);

function video(patch: Partial<MediaSource> = {}): MediaSource {
  return {
    url: "/api/modules/clip-studio/data/assets/clip.mp4",
    ref: "module:clip-studio/assets/clip.mp4",
    name: "clip.mp4",
    kind: "video",
    width: 1920,
    height: 1080,
    durationMs: 30_000,
    hasAudio: true,
    words: speech(10),
    transcript: { provider: "openai", language: "fr", at: 1 },
    ...patch,
  };
}

const THEME: BrandTheme = {
  kitId: "kit-test01",
  name: "Riso",
  palette: { background: "#fdf2e9", ink: "#1d1d6b", surface: "#ffffff", onSurface: "#1d1d6b", accent: "#ff4f9a", accentSecondary: "#2f6bff", onAccent: "#ffffff", extras: [] },
  textStyles: defaultRoleStyles(),
  fonts: [],
  watermark: {
    source: { url: "/api/modules/brand-kit/data/kits/kit-test01/assets/logo.png", ref: "module:brand-kit/kits/kit-test01/assets/logo.png", name: "logo.png", kind: "image", width: 400, height: 200 },
    anchor: "bottom-right",
    size: 0.2,
    opacity: 0.8,
    margin: 0.04,
    startSeconds: 1,
  },
  endCard: { seconds: 3, name: "Riso", tagline: "Les jeux, en couleurs", callToAction: "Abonne-toi" },
  mascot: { reactions: [{ url: "/api/modules/brand-kit/data/pose.png", ref: "module:brand-kit/pose.png", name: "pose.png", kind: "image", width: 300, height: 600 }] },
};

// ─── Transcription compacte ──────────────────────────────────────

describe("transcription compacte", () => {
  it("coupe en phrases sur la ponctuation, les silences et la longueur", () => {
    const words = speech(3);
    const sentences = sentencesOf(words);
    expect(sentences).toHaveLength(3);
    expect(sentences[1]).toMatchObject({ index: 1, startMs: words[5].startMs, endMs: words[9].endMs });
    // Sans ponctuation : un long silence ou 40 mots ferment la phrase.
    const flat: TimedWord[] = Array.from({ length: 90 }, (_, index) => ({ text: `mot${index}`, startMs: index * 300 + (index >= 50 ? 5000 : 0), endMs: index * 300 + 250 + (index >= 50 ? 5000 : 0) }));
    expect(sentencesOf(flat).map((sentence) => sentence.text.split(" ").length)).toEqual([40, 10, 40]);
  });

  it("numérote les lignes avec leur instant et les répartit en parties bornées", () => {
    const lines = compactTranscript(sentencesOf(speech(200)));
    expect(lines[0]).toBe("#0 [00:00] Phrase0-0 mot0-1 mot0-2 mot0-3 mot0-4.");
    expect(lines[150]).toMatch(/^#150 \[\d\d:\d\d\] Phrase150-0/);
    const chunks = chunkTranscript(lines, 2000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toEqual(lines);
    for (const chunk of chunks) expect(chunk.join("\n").length).toBeLessThanOrEqual(2000);
  });
});

// ─── Réponse de Codex ────────────────────────────────────────────

describe("lecture et réparation des passages", () => {
  const words = speech(60); // 60 phrases d'environ 2,3 s : 138 s de parole.
  const sentences = sentencesOf(words);
  const durationMs = 140_000;
  const context = { durationMs, words, sentences };

  it("lit un objet, une liste ou un bloc de code, refuse le reste", () => {
    expect(readRawMoments('Voici : {"moments":[{"from":1,"to":3}]} fin')).toEqual([{ from: 1, to: 3 }]);
    expect(readRawMoments('```json\n[{"start":"0:10","end":"0:40"}]\n```')).toHaveLength(1);
    expect(() => readRawMoments("aucun passage")).toThrow(/liste des passages/);
  });

  it("cale les passages sur des phrases entières, avec une marge qui n'entame aucun mot voisin", () => {
    const [moment] = repairMoments([{ from: 10, to: 17, title: "  « Le grand moment »  #short", reason: "Une chute.", score: 8 }], context);
    expect(moment.title).toBe("Le grand moment");
    const first = sentences[10];
    const last = sentences[17];
    expect(moment.startMs).toBeLessThanOrEqual(first.startMs);
    expect(moment.startMs).toBeGreaterThanOrEqual(sentences[9].endMs);
    expect(moment.endMs).toBeGreaterThanOrEqual(last.endMs);
    expect(moment.endMs).toBeLessThanOrEqual(sentences[18].startMs);
    expect(moment.endMs - moment.startMs).toBeGreaterThanOrEqual(MOMENT_LIMITS.minMs);
  });

  it("allonge un passage trop court, raccourcit un passage trop long, borne à la vidéo", () => {
    const [short] = repairMoments([{ from: 5, to: 5, title: "Court" }], context);
    expect(short.endMs - short.startMs).toBeGreaterThanOrEqual(MOMENT_LIMITS.minMs);
    const [long] = repairMoments([{ from: 0, to: 59, title: "Long" }], context);
    expect(long.endMs - long.startMs).toBeLessThanOrEqual(MOMENT_LIMITS.maxMs + MOMENT_LIMITS.leadMs + MOMENT_LIMITS.tailMs);
    expect(long.startMs).toBe(0);
    // Instants en « m:ss », au-delà de la fin : ramenés dans la vidéo.
    const [late] = repairMoments([{ start: "2:00", end: "3:30", title: "Fin" }], context);
    expect(late.endMs).toBeLessThanOrEqual(durationMs);
    expect(late.endMs - late.startMs).toBeGreaterThanOrEqual(MOMENT_LIMITS.minMs);
    // Hors de la vidéo, ou à l'envers : écarté.
    expect(repairMoments([{ start: 500, end: 520 }, { from: 30, to: 2000 }, { title: "sans bornes" }], context)).toEqual([]);
  });

  it("écarte les chevauchements (le mieux noté gagne), garde huit passages au plus, dans l'ordre", () => {
    const moments = repairMoments(
      [
        { from: 20, to: 27, title: "B", score: 6 },
        { from: 22, to: 30, title: "A", score: 9 },
        { from: 2, to: 9, title: "C", score: 5 },
      ],
      context
    );
    expect(moments.map((moment) => moment.title)).toEqual(["C", "A"]);
    expect(moments.map((moment) => moment.id)).toEqual(["m1", "m2"]);
    const many = repairMoments(Array.from({ length: 12 }, (_, index) => ({ from: index * 5, to: index * 5 + 4, title: `P${index}`, score: index })), context);
    expect(many.length).toBeLessThanOrEqual(MOMENT_LIMITS.maxCount);
    for (let index = 1; index < many.length; index++) expect(many[index].startMs).toBeGreaterThanOrEqual(many[index - 1].endMs);
  });

  it("demande par partie une longue transcription et réunit les réponses", async () => {
    const prompts: string[] = [];
    const moments = await analyzeMoments({ title: "Long live", durationMs, words }, async (prompt, part) => {
      prompts.push(prompt);
      if (part.index === 1) return "pas de JSON";
      const from = part.index === 0 ? 3 : 45;
      return JSON.stringify({ moments: [{ from, to: from + 7, title: `Partie ${part.index}`, reason: "Fort.", score: 7 }] });
    }, { maxChars: 1500 });
    expect(prompts.length).toBeGreaterThan(2);
    expect(prompts[0]).toContain("Partie 1 sur");
    expect(prompts[0]).toContain("#0 [00:00]");
    expect(moments.map((moment) => moment.title)).toEqual(["Partie 0", `Partie ${prompts.length - 1}`].sort());
  });

  it("dit clairement quand aucune réponse n'est lisible, ou sans parole", async () => {
    await expect(analyzeMoments({ title: "V", durationMs, words }, async () => "rien")).rejects.toThrow(/liste des passages/);
    await expect(analyzeMoments({ title: "V", durationMs, words: [] }, async () => "{}")).rejects.toThrow(/Aucune parole/);
  });

  it("contrôle les passages retouchés à la main", () => {
    const proposed: ClipMoment[] = [{ id: "m1", startMs: 10_000, endMs: 40_000, title: "Titre", reason: "", score: 7 }];
    const [edited] = cleanMomentEdits([{ id: "m1", startMs: 9_000, endMs: 41_000, title: "  Nouveau titre " }], proposed, durationMs);
    expect(edited).toMatchObject({ startMs: 9_000, endMs: 41_000, title: "Nouveau titre", reason: "" });
    expect(() => cleanMomentEdits([], proposed, durationMs)).toThrow(/au moins un passage/);
    expect(() => cleanMomentEdits([{ id: "m9", startMs: 0, endMs: 20_000 }], proposed, durationMs)).toThrow(/inconnu/);
    expect(() => cleanMomentEdits([{ id: "m1", startMs: 10_000, endMs: 12_000 }], proposed, durationMs)).toThrow(/au moins/);
  });

  it("remet à zéro les mots d'un extrait", () => {
    const rebased = momentWords(words, 10_000, 20_000);
    expect(rebased[0].startMs).toBeGreaterThanOrEqual(0);
    expect(rebased.every((word) => word.endMs <= 10_000 && word.startMs <= word.endMs)).toBe(true);
    const original = words.find((word) => word.text === rebased[1].text)!;
    expect(rebased[1].startMs).toBe(original.startMs - 10_000);
  });
});

// ─── Montage ─────────────────────────────────────────────────────

describe("clip sous-titré", () => {
  it("recadre la vidéo, garde son son et pose les sous-titres mot à mot", () => {
    const project = buildSubtitledClip({ name: "Clip", aspect: "9:16", source: video(), framing: "crop", hook: "Une accroche" });
    expect(project.tracks.map((track) => track.name)).toEqual(["Accroche", "Sous-titres", "Principale", "Audio"]);
    const main = trackNamed(project, "Principale")!.items[0] as VideoItem;
    expect(main).toMatchObject({ type: "video", fit: "cover", trimStart: 0, volume: 1 });
    expect(main.muted).toBeUndefined();
    const caption = trackNamed(project, "Sous-titres")!.items[0] as TextItem;
    expect(caption.karaoke?.voiceId).toBe(main.id);
    expect(caption.karaoke?.words.length).toBe(50);
    const hook = trackNamed(project, "Accroche")!.items[0] as TextItem;
    expect(hook).toMatchObject({ text: "Une accroche", start: 0, duration: 90, theme: { role: "title" } });
    expect(project.brief?.title).toBe("Une accroche");
  });

  it("pose l'image entière sur son propre fond flou, muet", () => {
    expect(needsBackdrop(video(), "9:16")).toBe(true);
    expect(needsBackdrop(video({ width: 1080, height: 1920 }), "9:16")).toBe(false);
    const project = buildSubtitledClip({ name: "Clip", aspect: "9:16", source: video(), framing: "blur" });
    const main = trackNamed(project, "Principale")!.items[0] as VideoItem;
    const back = trackNamed(project, "Fond")!.items[0] as VideoItem;
    expect(main.fit).toBe("contain");
    expect(back).toMatchObject({ fit: "cover", muted: true, motion: BACKDROP_MOTION, start: main.start, duration: main.duration, trimStart: main.trimStart });
    expect(cameraAt(BACKDROP_MOTION, 0.5)).toMatchObject({ blur: expect.any(Number), brightness: expect.any(Number) });
    // Le fond est sous la vidéo : plus bas dans la liste des pistes.
    expect(project.tracks.indexOf(trackNamed(project, "Fond")!)).toBeGreaterThan(project.tracks.indexOf(trackNamed(project, "Principale")!));
    // Même format : rien à flouter.
    const same = buildSubtitledClip({ name: "Clip", aspect: "16:9", source: video(), framing: "blur" });
    expect(trackNamed(same, "Fond")).toBeUndefined();
  });

  it("décale les sous-titres sur le passage lu dans la source", () => {
    const project = buildSubtitledClip({ name: "Clip", aspect: "16:9", source: video(), framing: "crop", range: { startMs: 6_000, endMs: 18_000 } });
    const main = trackNamed(project, "Principale")!.items[0] as VideoItem;
    expect(main.trimStart).toBe(180);
    expect(main.duration).toBe(360);
    const caption = trackNamed(project, "Sous-titres")!.items[0] as TextItem;
    expect(caption.karaoke?.offset).toBe(180);
    expect(caption.karaoke!.words.every((word) => word.endMs >= 5_000 && word.startMs <= 19_000)).toBe(true);
  });

  it("habille à la marque : filigrane et carton de fin, sans mascotte", () => {
    const project = buildSubtitledClip({ name: "Clip", aspect: "9:16", source: video(), framing: "blur", theme: THEME, hook: "Accroche" });
    expect(project.brandKitId).toBe("kit-test01");
    expect(trackNamed(project, "Filigrane")?.items[0]).toMatchObject({ origin: "brand", type: "image" });
    expect(project.tracks.some((track) => track.name.startsWith("Fin –"))).toBe(true);
    expect(project.tracks.some((track) => track.name.startsWith("Mascotte"))).toBe(false);
    const caption = items(project).find((item): item is TextItem => item.type === "text" && Boolean(item.karaoke))!;
    expect(caption.karaoke?.highlight).toBeTruthy();
    // Réappliquer la marque ne double rien.
    expect(applyBrandTheme(project, THEME).tracks.filter((track) => track.name === "Filigrane")).toHaveLength(1);
  });

  it("coupe des sous-titres trop longs en morceaux qui se suivent sans trou", () => {
    const project = buildSubtitledClip({ name: "Long", aspect: "9:16", source: video({ durationMs: 120_000, words: speech(50) }), framing: "crop" });
    const parts = trackNamed(project, "Sous-titres")!.items as TextItem[];
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.flatMap((part) => part.karaoke!.words)).toHaveLength(250);
    for (let index = 1; index < parts.length; index++) {
      expect(parts[index].start).toBe(parts[index - 1].start + parts[index - 1].duration);
      expect(parts[index].karaoke!.offset - parts[0].karaoke!.offset).toBe(parts[index].start - parts[0].start);
    }
    expect(parts.every((part) => part.text.length <= 5000)).toBe(true);
    expect(splitCaption(parts[0], 30)).toEqual([parts[0]]);
  });
});

// ─── Extraits ────────────────────────────────────────────────────

describe("extraits", () => {
  it("réencode le passage, à l'image près, en gardant la cadence", () => {
    const args = excerptArgs("source.mp4", "out.mp4", 12_345, 42_000);
    expect(args.slice(args.indexOf("-ss"), args.indexOf("-ss") + 2)).toEqual(["-ss", "12.345"]);
    expect(args[args.indexOf("-t") + 1]).toBe("29.655");
    expect(args).toContain("libx264");
    expect(args).toContain("aac");
    expect(args).not.toContain("-r");
    expect(args.at(-1)).toBe("out.mp4");
  });

  it("hérite de la provenance, de la mention et des droits ; ses mots partent de zéro", () => {
    const source: ClipAsset = {
      file: "remote-x.mp4",
      kind: "video",
      originalName: "VOD.mp4",
      size: 1,
      credit: "VOD – ZeratoR, Twitch",
      rights: "unverified",
      origin: { site: "twitch", url: "https://www.twitch.tv/videos/123456", title: "VOD", section: { start: 600, end: 7800 } },
      words: speech(20),
      transcript: { provider: "openai", at: 1 },
      createdAt: 1,
    };
    const moment: ClipMoment = { id: "m1", startMs: 5_000, endMs: 25_000, title: "Le moment : fou", reason: "", score: 8 };
    const asset = excerptAsset(source, moment, "excerpt-1.mp4", 1234, { durationSec: 20, width: 1280, height: 720, video: { codec: "h264", attached: false }, audio: { codec: "aac" } }, 99);
    expect(asset).toMatchObject({ file: "excerpt-1.mp4", originalName: "Le moment fou.mp4", credit: source.credit, rights: "unverified", durationMs: 20_000, hasAudio: true, lastUsedAt: 99 });
    expect(asset.origin?.section).toEqual({ start: 605, end: 625 });
    expect(asset.words![0].startMs).toBeGreaterThanOrEqual(0);
    expect(asset.words!.every((word) => word.endMs <= 20_000)).toBe(true);
  });
});

// ─── Travaux ─────────────────────────────────────────────────────

async function settle(id: string, until: ClipJob["status"][] = ["done", "error", "canceled", "review"]): Promise<ClipJob> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const job = getClipJob(id);
    if (job && until.includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Le travail ne s'est pas terminé.");
}

describe("travaux de création", () => {
  const defaults = { ...clipDeps };
  const statfs = diskDeps.statfs;

  beforeEach(() => {
    Object.assign(clipDeps, defaults);
    // Disque large par défaut : le contrôle de place ne dépend pas de la machine qui lance les tests.
    diskDeps.statfs = () => ({ bavail: 1024 ** 4, bsize: 1 });
    store.projects = [];
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
    fs.writeFileSync(path.join(ASSETS_DIR, "clip.mp4"), "vidéo");
    store.assets = [{ file: "clip.mp4", kind: "video", originalName: "Mon clip.mp4", size: 5, width: 1920, height: 1080, durationMs: 140_000, hasAudio: true, createdAt: 1 }];
  });

  it("montre l'erreur de crédit OpenAI à l'étape de transcription, sans rien écrire", async () => {
    clipDeps.transcribe = async () => {
      throw new TranscriptionError("Crédit OpenAI épuisé : rechargez le compte OpenAI de la clé, puis relancez la transcription.");
    };
    const started = startSubtitleClip({ source: { assetFile: "clip.mp4" }, aspect: "9:16", framing: "blur" });
    expect(started.steps.map((step) => step.state)).toEqual(["skipped", "pending", "pending"]);
    const job = await settle(started.id);
    expect(job.status).toBe("error");
    expect(job.error).toMatch(/^Crédit OpenAI épuisé/);
    expect(job.steps.find((step) => step.id === "transcribe")).toMatchObject({ state: "error" });
    expect(job.steps.find((step) => step.id === "montage")).toMatchObject({ state: "pending" });
    expect(store.projects).toEqual([]);
    expect(store.assets[0].words).toBeUndefined();
  });

  it("sous-titre un média du module et range sa transcription", async () => {
    clipDeps.transcribe = async () => ({ words: speech(10), text: "", language: "fr", durationSec: 30 });
    const job = await settle(startSubtitleClip({ source: { assetFile: "clip.mp4" }, aspect: "9:16", framing: "crop", hook: "Accroche" }).id);
    expect(job.status).toBe("done");
    expect(store.projects).toHaveLength(1);
    expect(job.projectId).toBe(store.projects[0].id);
    expect(store.assets[0].words).toHaveLength(50);
    expect(items(store.projects[0]).some((item: any) => item.type === "text" && item.karaoke)).toBe(true);
  });

  it("propose des passages, puis coupe et monte ceux choisis, et efface la source envoyée", async () => {
    store.assets[0] = { ...store.assets[0], words: speech(60), transcript: { provider: "openai", at: 1 } };
    clipDeps.transcribe = async () => {
      throw new Error("La transcription rangée doit servir.");
    };
    clipDeps.ask = async () => JSON.stringify({ moments: [{ from: 2, to: 9, title: "Premier", reason: "Drôle.", score: 8 }, { from: 30, to: 37, title: "Second", reason: "Fort.", score: 7 }] });
    const cuts: number[][] = [];
    clipDeps.cutExcerpt = async (_input, output, startMs, endMs) => {
      cuts.push([startMs, endMs]);
      fs.writeFileSync(output, "extrait");
      return { durationSec: (endMs - startMs) / 1000, width: 1280, height: 720, video: { codec: "h264", attached: false }, audio: { codec: "aac" } };
    };
    // Le serveur a reçu ce fichier à l'instant (`registerAsset`) : la découpe peut le réclamer.
    noteUploadedAsset("clip.mp4");
    const started = startClipping({ source: { assetFile: "clip.mp4", uploaded: true }, aspect: "9:16", framing: "blur" });
    const review = await settle(started.id);
    expect(review.status).toBe("review");
    expect(review.moments?.map((moment) => moment.title)).toEqual(["Premier", "Second"]);
    expect(review.steps.find((step) => step.id === "transcribe")?.detail).toMatch(/Déjà transcrite/);

    const second = review.moments![1];
    createClipsFromMoments({ jobId: review.id, moments: [{ id: second.id, startMs: second.startMs - 1000, endMs: second.endMs, title: "Le second" }], keepSource: false });
    const done = await settle(review.id, ["done", "error"]);
    expect(done.status).toBe("done");
    expect(cuts).toEqual([[second.startMs - 1000, second.endMs]]);
    expect(done.clips).toHaveLength(1);
    expect(done.clips![0].name).toBe("Le second");
    expect(store.projects).toHaveLength(1);
    const excerpt = store.assets.find((asset) => asset.file.startsWith("excerpt-"));
    expect(excerpt?.words?.[0].startMs).toBeGreaterThanOrEqual(0);
    expect(fs.existsSync(path.join(ASSETS_DIR, excerpt!.file))).toBe(true);
    // La vidéo envoyée pour l'occasion n'est plus utile : effacée.
    expect(done.sourceRemoved).toBe(true);
    expect(store.assets.some((asset) => asset.file === "clip.mp4")).toBe(false);
    expect(() => createClipsFromMoments({ jobId: review.id, moments: [{ id: second.id, startMs: 0, endMs: 20_000 }] })).toThrow(/déjà été traités/);
  });

  /** Découpe jusqu'aux passages proposés, puis coupe le premier sans garder la source. */
  /** Retouche la fiche de `clip.mp4` (les extraits se rangent devant elle). */
  function patchClip(patch: Partial<ClipAsset>) {
    store.assets = store.assets.map((asset) => (asset.file === "clip.mp4" ? { ...asset, ...patch } : asset));
  }

  async function clipFirstMoment(source: Record<string, unknown>): Promise<ClipJob> {
    patchClip({ words: speech(60), transcript: { provider: "openai", at: 1 } });
    clipDeps.ask = async () => JSON.stringify({ moments: [{ from: 2, to: 9, title: "Premier", reason: "Drôle.", score: 8 }] });
    clipDeps.cutExcerpt = async (_input, output, startMs, endMs) => {
      fs.writeFileSync(output, "extrait");
      return { durationSec: (endMs - startMs) / 1000, width: 1280, height: 720, video: { codec: "h264", attached: false }, audio: { codec: "aac" } };
    };
    const review = await settle(startClipping({ source, aspect: "9:16", framing: "blur" }).id);
    expect(review.status).toBe("review");
    const moment = review.moments![0];
    createClipsFromMoments({ jobId: review.id, moments: [{ id: moment.id, startMs: moment.startMs, endMs: moment.endMs }], keepSource: false });
    return settle(review.id, ["done", "error"]);
  }

  it("garde un média désigné comme «  envoyé  » par le navigateur sans que le serveur l'ait reçu", async () => {
    const done = await clipFirstMoment({ assetFile: "clip.mp4", uploaded: true });
    expect(done.status).toBe("done");
    expect(done.source?.owned).toBe(false);
    expect(done.sourceRemoved).toBe(false);
    expect(store.assets.some((asset) => asset.file === "clip.mp4")).toBe(true);
    expect(fs.existsSync(path.join(ASSETS_DIR, "clip.mp4"))).toBe(true);
  });

  it("ne laisse réclamer un envoi qu'une fois, et jamais un média venu d'ailleurs", async () => {
    noteUploadedAsset("clip.mp4");
    // Une première création s'en sert comme média ordinaire : la réclamation est usée.
    await settle(startSubtitleClip({ source: { assetFile: "clip.mp4" }, aspect: "9:16", framing: "blur" }).id);
    store.projects = [];
    const done = await clipFirstMoment({ assetFile: "clip.mp4", uploaded: true });
    expect(done.source?.owned).toBe(false);
    expect(fs.existsSync(path.join(ASSETS_DIR, "clip.mp4"))).toBe(true);

    patchClip({ origin: { site: "youtube", url: "https://www.youtube.com/watch?v=jNQXAC9IVRw", title: "Vidéo" } });
    noteUploadedAsset("clip.mp4");
    const remote = await clipFirstMoment({ assetFile: "clip.mp4", uploaded: true });
    expect(remote.source?.owned).toBe(false);
  });

  it("refuse de couper les extraits quand le disque est presque plein", async () => {
    diskDeps.statfs = () => ({ bavail: 100 * 1024 * 1024, bsize: 1 });
    const done = await clipFirstMoment({ assetFile: "clip.mp4" });
    expect(done.status).toBe("error");
    expect(done.error).toMatch(/^Disque presque plein sur le serveur/);
    expect(done.error).not.toMatch(/[\/]tmp|sxm-clip-modes/);
    expect(store.assets.some((asset) => asset.file.startsWith("excerpt-"))).toBe(false);
  });

  it("range une erreur système sans chemin du serveur", async () => {
    store.assets[0] = { ...store.assets[0], words: speech(60), transcript: { provider: "openai", at: 1 } };
    clipDeps.ask = async () => JSON.stringify({ moments: [{ from: 2, to: 9, title: "Premier", reason: "Drôle.", score: 8 }] });
    clipDeps.cutExcerpt = async () => {
      throw Object.assign(new Error("ENOSPC: no space left on device, write '/app/modules/clip-studio/data/.clip-tmp/cjob-1/excerpt-0.mp4'"), { code: "ENOSPC", syscall: "write" });
    };
    const review = await settle(startClipping({ source: { assetFile: "clip.mp4" }, aspect: "9:16", framing: "blur" }).id);
    const moment = review.moments![0];
    createClipsFromMoments({ jobId: review.id, moments: [{ id: moment.id, startMs: moment.startMs, endMs: moment.endMs }] });
    const failed = await settle(review.id, ["done", "error"]);
    expect(failed.error).toBe("Disque plein sur le serveur : supprimez des médias ou des exports, puis réessayez.");
    expect(JSON.stringify(failed)).not.toContain("/app/");
  });

  it("estime la place des extraits d'après la part de la source qu'ils couvrent", () => {
    const source = { size: 1000 * 1024 * 1024, durationMs: 100_000 };
    expect(excerptsBytes(source, [{ startMs: 0, endMs: 50_000 }])).toBe(1000 * 1024 * 1024);
    expect(excerptsBytes(source, [{ startMs: 0, endMs: 1000 }])).toBe(200 * 1024 * 1024);
  });

  it("rend la main au disque réel après les tests", () => {
    diskDeps.statfs = statfs;
    expect(typeof diskDeps.statfs).toBe("function");
  });
});
