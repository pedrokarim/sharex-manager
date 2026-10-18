import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Les médias du module vivent dans un répertoire temporaire, jamais dans `modules/clip-studio/data`.
const store = vi.hoisted(() => ({ assets: [] as any[] }));
const usage = vi.hoisted(() => ({ calls: [] as any[] }));

vi.mock("@/modules/clip-studio/lib/store", async (importOriginal) => {
  const nodeFs = await import("node:fs");
  const nodeOs = await import("node:os");
  const nodePath = await import("node:path");
  const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "sxm-clip-stock-"));
  const DATA_DIR = nodePath.join(root, "data");
  const ASSETS_DIR = nodePath.join(DATA_DIR, "assets");
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

// Le registre des IA n'écrit rien pendant les tests : on lit seulement ce qu'il reçoit.
vi.mock("@/lib/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  recordAiUsage: (event: unknown) => usage.calls.push(event),
}));

import {
  VIDEO_SEARCH_LIMITS,
  findSegmentVideo,
  importPexelsVideo,
  isAllowedVideoUrl,
  pexelsCredit,
  pexelsOrientation,
  pickVideoFile,
  rankVideos,
  searchFoundVideos,
  videoTitle,
  type PexelsVideo,
  type VideoSearchDeps,
} from "@/modules/clip-studio/lib/video-search";
import { ASSETS_DIR } from "@/modules/clip-studio/lib/store";
import { buildFromTemplate, type FreeData, type QuizData, type VoiceClip } from "@/modules/clip-studio/engine/templates";
import { cutShots, fillStills, jumpStarts, loopSpans, middleStart, STILL_EFFECT } from "@/modules/clip-studio/engine/rhythm";
import type { ClipProject, MediaSource, VideoItem } from "@/modules/clip-studio/engine/types";

const FILES = [
  { id: 1, quality: "uhd", file_type: "video/mp4", width: 2160, height: 3840, link: "https://videos.pexels.com/video-files/1/1-uhd_2160_3840_25fps.mp4" },
  { id: 2, quality: "hd", file_type: "video/mp4", width: 1080, height: 1920, link: "https://videos.pexels.com/video-files/1/1-hd_1080_1920_25fps.mp4" },
  { id: 3, quality: "hd", file_type: "video/mp4", width: 720, height: 1280, link: "https://videos.pexels.com/video-files/1/1-hd_720_1280_25fps.mp4" },
  { id: 4, quality: "sd", file_type: "video/mp4", width: 360, height: 640, link: "https://videos.pexels.com/video-files/1/1-sd_360_640_25fps.mp4" },
  { id: 5, quality: "hls", file_type: "video/mp4", width: 1080, height: 1920, link: "https://videos.pexels.com/video-files/1/1.m3u8" },
];

const video = (id: number, duration: number, extra: Partial<PexelsVideo> = {}): PexelsVideo => ({
  id,
  width: 1080,
  height: 1920,
  duration,
  url: `https://www.pexels.com/video/waves-crashing-on-a-beach-${id}/`,
  image: `https://images.pexels.com/videos/${id}/free-video-${id}.jpg`,
  user: { id: 9, name: "Ana Lopes", url: "https://www.pexels.com/@ana" },
  video_files: FILES,
  ...extra,
});

const json = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });

beforeEach(() => {
  store.assets = [];
  usage.calls = [];
  // Compteur de l'heure remis à zéro : chaque test part d'une heure neuve.
  (globalThis as any).__sxmPexels.calls = [];
  (globalThis as any).__sxmPexels.seen = new Map();
});

describe("Pexels : choix du fichier et des résultats", () => {
  it("prend le MP4 dont la hauteur est la plus proche du projet, sans dépasser 1920 px", () => {
    expect(pickVideoFile(FILES, { height: 1920 })?.id).toBe(2);
    expect(pickVideoFile(FILES, { height: 1350 })?.id).toBe(3);
    expect(pickVideoFile(FILES, { height: 1080 })?.id).toBe(3);
    // Rien d'utilisable : flux HLS, fichiers trop hauts, tailles inconnues, adresse non https.
    expect(
      pickVideoFile(
        [
          FILES[0],
          FILES[4],
          { id: 6, file_type: "video/mp4", width: null, height: null, link: "https://videos.pexels.com/x.mp4" },
          { id: 7, file_type: "video/mp4", width: 640, height: 360, link: "http://videos.pexels.com/x.mp4" },
        ],
        { height: 1920 }
      )
    ).toBeNull();
  });

  it("préfère un plan de 4 à 30 s, assez long pour le segment", () => {
    const ranked = rankVideos([video(1, 60), video(2, 3), video(3, 6), video(4, 12)], 8);
    expect(ranked.map((entry) => entry.id)).toEqual([4, 3, 1, 2]);
  });

  it("titre, mention et orientation", () => {
    expect(videoTitle(video(3571264, 10))).toBe("Waves crashing on a beach");
    expect(videoTitle({ id: 5, url: "https://www.pexels.com/video/5/" })).toBe("Vidéo Pexels 5");
    expect(pexelsCredit(video(1, 10))).toBe("Vidéo : Ana Lopes sur Pexels");
    expect(pexelsOrientation("9:16")).toBe("portrait");
    expect(pexelsOrientation("16:9")).toBe("landscape");
    expect(pexelsOrientation("1:1")).toBe("square");
  });

  it("ne télécharge que depuis Pexels (et Vimeo), en https", () => {
    expect(isAllowedVideoUrl("https://videos.pexels.com/video-files/1/a.mp4")).toBe(true);
    expect(isAllowedVideoUrl("https://player.vimeo.com/external/291648067.sd.mp4?s=x")).toBe(true);
    expect(isAllowedVideoUrl("http://videos.pexels.com/a.mp4")).toBe(false);
    expect(isAllowedVideoUrl("https://videos.pexels.com.evil.example/a.mp4")).toBe(false);
    expect(isAllowedVideoUrl("https://videos.pexels.com:8443/a.mp4")).toBe(false);
    expect(isAllowedVideoUrl("https://user:pw@videos.pexels.com/a.mp4")).toBe(false);
  });
});

describe("Pexels : recherche et import", () => {
  it("cherche avec la clé, dans l'orientation demandée, et note l'appel au registre", async () => {
    const fetch = vi.fn(async (_url: string, _init: { headers: Record<string, string> }) =>
      json({ videos: [video(11, 14), { id: "bad" }] }, { "x-ratelimit-limit": "20000", "x-ratelimit-remaining": "19990" })
    );
    const found = await searchFoundVideos({ query: "  ocean   waves ", orientation: "portrait", page: 2 }, { fetch, apiKey: () => "pexels-key" });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain("https://api.pexels.com/videos/search?");
    expect(new URL(url).searchParams.get("query")).toBe("ocean waves");
    expect(new URL(url).searchParams.get("orientation")).toBe("portrait");
    expect(new URL(url).searchParams.get("page")).toBe("2");
    expect(init.headers.Authorization).toBe("pexels-key");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: "pexels:11", provider: "pexels", rights: "free", durationSec: 14, creator: "Ana Lopes", title: "Waves crashing on a beach" });
    expect(found[0].preview).toContain("sd_360_640");
    expect(usage.calls).toEqual([expect.objectContaining({ provider: "pexels", unit: "calls", amount: 1, ok: true })]);
  });

  it("sans clé, ne fait aucun appel et le dit", async () => {
    const fetch = vi.fn();
    await expect(searchFoundVideos({ query: "ocean" }, { fetch, apiKey: () => "" })).rejects.toThrow(/clé Pexels/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("respecte la limite horaire de Pexels", async () => {
    const fetch = vi.fn(async () => json({ videos: [] }));
    (globalThis as any).__sxmPexels.calls = Array.from({ length: VIDEO_SEARCH_LIMITS.perHour }, () => Date.now());
    await expect(searchFoundVideos({ query: "ocean" }, { fetch, apiKey: () => "k" })).rejects.toThrow(/Limite horaire/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("importe une vidéo comme média du module, avec sa mention, sans la télécharger deux fois", async () => {
    const download = vi.fn(async (_url: string, target: string) => fs.writeFileSync(target, "fake"));
    const prepare = vi.fn(async (input: string, output: string) => {
      fs.renameSync(input, output);
      return { durationSec: 12.4, width: 1080, height: 1920, video: { codec: "h264", attached: false }, audio: { codec: "aac" } };
    });
    const deps: VideoSearchDeps = { download, prepare };
    const imported = await importPexelsVideo(video(21, 12), { height: 1920 }, deps);
    expect(download).toHaveBeenCalledWith(FILES[1].link, expect.any(String), undefined);
    expect(imported).toMatchObject({ rights: "free", hasAudio: true, durationMs: 12_400, width: 1080, height: 1920, credit: "Vidéo : Ana Lopes sur Pexels" });
    expect(fs.existsSync(path.join(ASSETS_DIR, imported.file))).toBe(true);
    expect(store.assets[0]).toMatchObject({ kind: "video", foundId: "pexels:21", origin: { site: "web", url: "https://www.pexels.com/video/waves-crashing-on-a-beach-21/" } });

    const again = await importPexelsVideo(video(21, 12), { height: 1920 }, deps);
    expect(again.file).toBe(imported.file);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("pour un segment : le plan le mieux rangé, et un second quand le premier est trop court", async () => {
    const fetch = vi.fn(async (_url: string, _init: { headers: Record<string, string> }) => json({ videos: [video(31, 3), video(32, 5), video(33, 2)] }));
    const download = vi.fn(async (_url: string, target: string) => fs.writeFileSync(target, "fake"));
    const prepare = vi.fn(async (input: string, output: string) => {
      fs.renameSync(input, output);
      return { durationSec: 5, width: 1080, height: 1920, video: { codec: "h264", attached: false } };
    });
    const found = await findSegmentVideo({ query: "chef cooking", aspect: "9:16", minSeconds: 8 }, { fetch, apiKey: () => "k", download, prepare });
    expect(found?.video.hasAudio).toBe(false);
    expect(found?.alternates).toHaveLength(1);
    expect(download).toHaveBeenCalledTimes(2);
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get("orientation")).toBe("portrait");
  });
});

// ─── Placement au montage ────────────────────────────────────────

const stock = (name: string, seconds: number): MediaSource => ({
  url: `/api/modules/clip-studio/data/assets/${name}.mp4`,
  ref: `module:clip-studio/assets/${name}.mp4`,
  name,
  kind: "video",
  durationMs: seconds * 1000,
  rights: "free",
  hasAudio: true,
});

const voice = (seconds: number, words?: { text: string; startMs: number; endMs: number }[]): VoiceClip => ({
  durationMs: seconds * 1000,
  source: { url: "/v.wav", ref: `module:clip-studio/assets/v-${seconds}.wav`, name: "voix", kind: "audio", durationMs: seconds * 1000, ...(words ? { words } : {}) },
});

const mainVideos = (project: ClipProject) =>
  project.tracks
    .filter((track) => /^Principale/.test(track.name))
    .flatMap((track) => track.items)
    .filter((item): item is VideoItem => item.type === "video")
    .sort((a, b) => a.start - b.start);

describe("Placement d'une vidéo trouvée", () => {
  it("pose la vidéo muette, coupée en plans qui reprennent à d'autres moments", () => {
    const data: FreeData = { scenes: [{ heading: "La mer", text: "Les vagues.", image: stock("sea", 20), voice: voice(7) }] };
    const project = buildFromTemplate("free", "Mer", "9:16", data, null, { pace: "normal" });
    const shots = mainVideos(project);
    expect(shots.length).toBeGreaterThanOrEqual(3);
    expect(shots.every((shot) => shot.muted === true && shot.duck === undefined && shot.volume === 1)).toBe(true);
    expect(shots.every((shot) => shot.duration <= Math.round(2.2 * project.fps))).toBe(true);
    for (let index = 1; index < shots.length; index++) {
      expect(shots[index].start).toBe(shots[index - 1].start + shots[index - 1].duration);
      expect(shots[index].trimStart).not.toBe(shots[index - 1].trimStart);
    }
    // Les premiers 10 % de la vidéo sont sautés.
    expect(Math.min(...shots.map((shot) => shot.trimStart))).toBeGreaterThanOrEqual(Math.round(20 * project.fps * 0.1));
    expect(shots.map((shot) => shot.label)).toEqual(shots.map((_, index) => `Plan ${index + 1}/${shots.length}`));
  });

  it("boucle une vidéo trop courte sans jamais figer sa dernière image", () => {
    const data: FreeData = { scenes: [{ text: "Une goutte.", image: stock("drop", 1.5), voice: voice(6) }] };
    const project = buildFromTemplate("free", "Goutte", "9:16", data, null, { pace: "normal" });
    const length = 1.5 * project.fps;
    const shots = mainVideos(project);
    expect(shots.length).toBeGreaterThanOrEqual(4);
    expect(shots.every((shot) => shot.trimStart + shot.duration <= length)).toBe(true);
  });

  it("au rythme calme, la vidéo n'est pas découpée mais boucle aussi", () => {
    const data: FreeData = { scenes: [{ text: "Une goutte.", image: stock("drop", 2), voice: voice(5) }] };
    const project = buildFromTemplate("free", "Goutte", "9:16", data, null, { pace: "calm" });
    const pieces = mainVideos(project);
    expect(pieces.length).toBeGreaterThanOrEqual(3);
    expect(pieces.every((piece) => piece.trimStart + piece.duration <= 2 * project.fps)).toBe(true);
    expect(pieces.every((piece) => !/^Plan/.test(piece.label ?? ""))).toBe(true);
  });

  it("alterne avec un autre plan du même sujet quand il y en a un", () => {
    const data: FreeData = { scenes: [{ text: "La ville.", image: stock("city-a", 4), alternates: [stock("city-b", 4)], voice: voice(8) }] };
    const project = buildFromTemplate("free", "Ville", "16:9", data, null, { pace: "lively" });
    const shots = mainVideos(project);
    expect(new Set(shots.map((shot) => shot.source.ref)).size).toBe(2);
    for (let index = 1; index < shots.length; index++) expect(shots[index].source.ref).not.toBe(shots[index - 1].source.ref);
    expect(shots.every((shot) => shot.duration <= Math.round(1.4 * project.fps))).toBe(true);
  });

  it("aucun zoom de plan fixe sur une vidéo qui joue", () => {
    const data: FreeData = { scenes: [{ text: "La mer.", image: stock("sea", 30), voice: voice(9) }] };
    const built = buildFromTemplate("free", "Mer", "9:16", data, null, { pace: "normal" });
    const video = mainVideos(built);
    const zooms = built.tracks.flatMap((track) => (track.effects ?? []).filter((effect) => effect.kind === STILL_EFFECT));
    for (const zoom of zooms) expect(video.some((shot) => zoom.at >= shot.start && zoom.at < shot.start + shot.duration)).toBe(false);
    // Une vidéo longue posée d'un seul tenant ne reçoit, elle non plus, aucun zoom.
    const long: VideoItem = { ...video[0], start: 0, duration: 300, trimStart: 0, cue: undefined };
    const single: ClipProject = { ...built, tracks: [{ id: "t", kind: "visual", name: "Principale", items: [long] }] };
    const filled = fillStills(cutShots(single, "normal"), "normal");
    expect(filled.tracks.flatMap((track) => track.effects ?? [])).toEqual([]);
  });

  it("répartit les débuts sur toute la vidéo et ne reprend jamais deux fois de suite au même endroit", () => {
    const starts = jumpStarts(600, 60, 6, 30);
    expect(Math.min(...starts)).toBe(60);
    // Des moments éloignés du début à la fin, et jamais au-delà de la vidéo.
    expect(Math.max(...starts)).toBeGreaterThanOrEqual(400);
    expect(starts.every((start) => start + 60 <= 600)).toBe(true);
    for (let index = 1; index < starts.length; index++) expect(starts[index]).not.toBe(starts[index - 1]);
    expect(loopSpans(45, 120, 10, 0)).toEqual([
      { trimStart: 10, duration: 35 },
      { trimStart: 0, duration: 45 },
      { trimStart: 0, duration: 40 },
    ]);
    expect(middleStart(600, 100, 30)).toBe(250);
    expect(middleStart(120, 100, 30)).toBe(12);
  });
});

describe("Extraits de la vidéo source", () => {
  const source: MediaSource = {
    ...stock("talk", 60),
    words: [
      { text: "Bonjour", startMs: 10_000, endMs: 10_400 },
      { text: "à", startMs: 10_450, endMs: 10_500 },
      { text: "tous.", startMs: 10_550, endMs: 11_000 },
    ],
    transcript: { provider: "openai", at: 1 },
  };

  it("une citation garde son son, sous-titré, et la voix off parle après elle", () => {
    const data: FreeData = { scenes: [{ heading: "Il salue", text: "Il commence fort.", voice: voice(3), excerpt: { source, start: 9.9, end: 11.2, keepAudio: true } }] };
    const project = buildFromTemplate("free", "Commentaire", "9:16", data, null, { pace: "normal" });
    const fps = project.fps;
    const quoted = mainVideos(project).find((item) => item.label?.startsWith("Extrait") && !item.muted)!;
    expect(quoted).toBeDefined();
    expect(quoted.muted).toBeUndefined();
    expect(quoted.duck).toBeUndefined();
    expect(quoted.trimStart).toBe(Math.round(9.9 * fps));
    expect(quoted.duration).toBe(Math.round(1.3 * fps));
    const narration = project.tracks.filter((track) => /^Voix/.test(track.name)).flatMap((track) => track.items)[0];
    expect(narration.start).toBe(quoted.start + quoted.duration + 4);
    const caption = project.tracks.flatMap((track) => track.items).find((item) => item.type === "text" && item.karaoke?.voiceId === quoted.id);
    expect(caption && caption.type === "text" && caption.karaoke!.words.map((word) => word.text)).toEqual(["Bonjour", "à", "tous."]);
    // Après la citation, la suite de la source passe, muette, d'un seul tenant (pas découpée en plans qui sautent).
    const after = mainVideos(project).filter((item) => item.start >= quoted.start + quoted.duration);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((item) => item.muted === true && /^Extrait/.test(item.label ?? ""))).toBe(true);
    expect(after[0].trimStart).toBe(Math.round(11.2 * fps));
  });

  it("un extrait qui illustre reste muet sous la voix off, au passage choisi", () => {
    const data: FreeData = { scenes: [{ text: "Le contexte.", voice: voice(4), excerpt: { source, start: 20, end: 26, keepAudio: false } }] };
    const project = buildFromTemplate("free", "Commentaire", "9:16", data, null, { pace: "normal" });
    const items = mainVideos(project);
    expect(items[0]).toMatchObject({ muted: true, trimStart: 20 * project.fps });
    const narration = project.tracks.filter((track) => /^Voix/.test(track.name)).flatMap((track) => track.items)[0];
    expect(narration.start).toBe(items[0].start + 4);
  });

  it("au quiz, un extrait n'est jamais cité", () => {
    const data: QuizData = {
      title: "Quiz",
      questions: [{ question: "Qui parle ?", choices: ["A", "B"], answer: 0, excerpt: { source, start: 9.9, end: 11.2, keepAudio: true } }],
    };
    const project = buildFromTemplate("quiz", "Quiz", "9:16", data, null, { pace: "normal" });
    const items = mainVideos(project);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.muted === true)).toBe(true);
  });
});
