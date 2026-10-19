import { beforeEach, describe, expect, it, vi } from "vitest";

// Aucun appel extérieur : yt-dlp, Codex, la transcription et ffmpeg sont remplacés par des doubles.
vi.mock("@/lib/modules/module-manager.api", () => ({ apiModuleManager: { callModuleFunction: vi.fn(), getLoadedModule: vi.fn() } }));

const store = vi.hoisted(() => ({ assets: [] as any[], cookies: false }));

vi.mock("@/modules/clip-studio/lib/store", async (importOriginal) => {
  const nodeFs = await import("node:fs");
  const nodeOs = await import("node:os");
  const nodePath = await import("node:path");
  const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "sxm-web-clips-"));
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

vi.mock("@/modules/clip-studio/lib/video-sources", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hasYoutubeCookies: () => store.cookies,
  copyYoutubeCookies: () => null,
  markCookiesRejected: vi.fn(),
}));

vi.mock("@/modules/clip-studio/lib/job-safety", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  assertDiskSpace: () => undefined,
}));

import { YtDlpError, parseSearchJson } from "@/lib/media/ytdlp";
import {
  CLIP_LIMITS,
  applyClipBudget,
  locateQuote,
  pickDynamicWindow,
  quoteBudgetSeconds,
  rankCandidates,
  readClipRequest,
  rebaseWords,
  sourceClip,
  webCandidates,
  type ClipCandidate,
  type ClipDeps,
  type ClipJobState,
  type ClipRequest,
  type MotionStats,
  type SourcedClip,
} from "@/modules/clip-studio/lib/clip-sourcing";
import {
  clipExcerpt,
  clipsSummary,
  noteClipFallbacks,
  sanitize,
  scriptPrompt,
  segmentPlans,
  sourceSegmentClips,
  withoutRank,
  type AssistantRequest,
  type SegmentPlan,
} from "@/modules/clip-studio/lib/assistant";
import { buildFromTemplate, type FreeData } from "@/modules/clip-studio/engine/templates";
import { voiceWindows } from "@/modules/clip-studio/engine/mix";
import type { ClipAsset, MediaSource, TimedWord, VideoItem } from "@/modules/clip-studio/engine/types";

const REQUEST: AssistantRequest = {
  brief: "Top 3 des jeux vidéo les plus attendus de 2027",
  template: "top",
  aspect: "9:16",
  count: 3,
  imageSource: "find-then-generate",
  videos: true,
  webClips: true,
  clipAudio: true,
  targetSeconds: 30,
};

const words = (entries: [string, number, number][]): TimedWord[] => entries.map(([text, startMs, endMs]) => ({ text, startMs, endMs }));

beforeEach(() => {
  store.assets = [];
  store.cookies = false;
});

// ─── Script ──────────────────────────────────────────────────────

describe("Script : l'extrait d'une vraie vidéo", () => {
  it("lit un clip à plat ou dans un objet, borne sa durée, et ne garde une citation qu'avec le son", () => {
    expect(readClipRequest({ kind: "clip", search: "Elden Ring Nightreign official trailer", site: "youtube", moment: "Le boss final", keepAudio: false, seconds: 30 })).toEqual({
      search: "Elden Ring Nightreign official trailer",
      site: "youtube",
      moment: "Le boss final",
      keepAudio: false,
      seconds: CLIP_LIMITS.maxSeconds,
    });
    expect(readClipRequest({ kind: "clip", clip: { search: "Zidane interview", site: "bidon", quote: "  « Je suis fier »  ", keepAudio: true, seconds: 0.2 } })).toMatchObject({
      site: "any",
      quote: "Je suis fier",
      keepAudio: true,
      seconds: CLIP_LIMITS.minSeconds,
    });
    // Une citation sans le son n'en est pas une ; sans recherche, rien à chercher ; un autre kind n'est pas un clip.
    expect(readClipRequest({ kind: "clip", clip: { search: "x trailer", quote: "Bonjour", keepAudio: false } })?.quote).toBeUndefined();
    expect(readClipRequest({ kind: "clip", clip: { search: "" } })).toBeUndefined();
    expect(readClipRequest({ kind: "image", clip: { search: "GTA 6 trailer" } })).toBeUndefined();
  });

  it("garde le clip dans le plan du segment, jamais pour la mascotte", () => {
    const script = sanitize(REQUEST, {
      title: "Les jeux de 2027",
      entries: [
        { title: "GTA VI", image: { kind: "clip", mode: "find", query: "Grand Theft Auto VI key art", prompt: "A city", clip: { search: "GTA 6 trailer 2", site: "youtube", moment: "La plage", keepAudio: false, seconds: 5 } } },
        { title: "Mascotte", mascot: true, image: { kind: "clip", query: "x", prompt: "The mascot", clip: { search: "mascot dance", keepAudio: false } } },
        { title: "Forêt", image: { kind: "stock", query: "forest drone", prompt: "A forest" } },
      ],
    });
    expect(script.imagePlans[0].clip).toMatchObject({ search: "GTA 6 trailer 2", seconds: 5 });
    expect(script.imagePlans[1].clip).toBeUndefined();
    expect(script.imagePlans[2]).toMatchObject({ kind: "video", mode: "find" });
  });

  it("le rang n'est pas répété en tête du titre d'un classement (« Numéro 3. 3. Metro » entendu au vrai)", () => {
    expect(withoutRank("3. METRO 2039", 3)).toBe("METRO 2039");
    expect(withoutRank("#2 Exodus", 2)).toBe("Exodus");
    expect(withoutRank("1 FINAL FANTASY VII REVELATION", 1)).toBe("FINAL FANTASY VII REVELATION");
    // Un nombre qui n'est pas le rang fait partie du titre.
    expect(withoutRank("7 Days to Die", 2)).toBe("7 Days to Die");
    expect(withoutRank("30 Seconds", 3)).toBe("30 Seconds");
    const script = sanitize(REQUEST, { title: "Jeux", entries: [{ title: "3. Metro 2039" }, { title: "2 Exodus" }, { title: "1. Fable" }] });
    expect(script.segmentTexts).toEqual(["Metro 2039", "Exodus", "Fable"]);
  });

  it("la consigne demande des extraits pour les sujets nommés, avec le budget et les règles du son", () => {
    const prompt = scriptPrompt(REQUEST, null, { web: false });
    expect(prompt).toContain('"kind": "image" | "stock" | "clip"');
    expect(prompt).toContain('"clip": {"search": string, "site": "youtube" | "twitch" | "any", "moment": string, "quote": string | null, "keepAudio": boolean, "seconds": number} | null');
    expect(prompt).toContain("EXTRAIT D'UNE VRAIE VIDÉO");
    expect(prompt).toContain("bande-annonce officielle");
    expect(prompt).toContain("true seulement quand ENTENDRE le son d'origine compte");
    expect(prompt).toContain(`ne dépasse pas ${quoteBudgetSeconds(30)} secondes au total`);
    expect(prompt).toContain(`${CLIP_LIMITS.maxClips} extraits au plus`);
    // Au quiz, ou sans le son, keepAudio vaut toujours false.
    expect(scriptPrompt({ ...REQUEST, template: "quiz" }, null, { web: false })).toContain("clip.keepAudio vaut toujours false");
    expect(scriptPrompt({ ...REQUEST, clipAudio: false }, null, { web: false })).toContain("clip.keepAudio vaut toujours false");
    // Pas d'extrait sans la case, ni quand tout est généré.
    expect(scriptPrompt({ ...REQUEST, webClips: false }, null, { web: false })).not.toContain('"clip"');
    expect(scriptPrompt({ ...REQUEST, imageSource: "generate" }, null, { web: false })).not.toContain('"clip"');
  });
});

// ─── Budget et plans ─────────────────────────────────────────────

describe("Budget des extraits", () => {
  const clip = (overrides: Partial<ClipRequest> = {}): ClipRequest => ({ search: "x trailer", site: "any", moment: "", keepAudio: false, seconds: 4, ...overrides });

  it("six extraits au plus, son gardé dans 35 % de la durée visée, aucun son au quiz", () => {
    const many = Array.from({ length: 8 }, () => clip());
    expect(applyClipBudget(many, 30).filter(Boolean)).toHaveLength(6);
    expect(quoteBudgetSeconds(30)).toBe(10.5);
    const loud = [clip({ keepAudio: true, quote: "a b c", seconds: 6 }), clip({ keepAudio: true, quote: "d e f", seconds: 6 }), clip({ keepAudio: true, seconds: 3 })];
    const kept = applyClipBudget(loud, 30);
    expect(kept.map((entry) => entry?.keepAudio)).toEqual([true, false, true]);
    expect(kept[1]?.quote).toBeUndefined();
    expect(applyClipBudget(loud, 30, { quiz: true }).every((entry) => entry?.keepAudio === false)).toBe(true);
    expect(applyClipBudget(loud, 30, { allowAudio: false }).every((entry) => entry?.keepAudio === false)).toBe(true);
  });

  it("un segment qui demande un clip le cherche d'abord, puis se replie sur une vidéo libre et une image", () => {
    const script = sanitize(REQUEST, {
      title: "Jeux",
      entries: [
        { title: "GTA VI", image: { kind: "clip", mode: "find", query: "Grand Theft Auto VI key art", prompt: "A city", clip: { search: "GTA 6 trailer", keepAudio: false, seconds: 5 } } },
        { title: "Idée", image: { kind: "clip", mode: "generate", query: "", prompt: "An idea", clip: { search: "idea", keepAudio: false } } },
        { title: "Image", image: { kind: "image", mode: "find", query: "Hollow Knight Silksong key art", prompt: "A knight" } },
      ],
    });
    const plans = segmentPlans(REQUEST, script);
    expect(plans[0]).toMatchObject({ action: "find", fallback: true, video: true, clip: { search: "GTA 6 trailer" } });
    expect(plans[1]).toMatchObject({ action: "generate", clip: { search: "idea" } });
    expect(plans[2].clip).toBeUndefined();
    expect(segmentPlans({ ...REQUEST, webClips: false }, script)[0].clip).toBeUndefined();
  });
});

// ─── Candidates ──────────────────────────────────────────────────

describe("Choix de la vidéo", () => {
  it("préfère la bande-annonce officielle aux réactions, écarte le hors-sujet et les directs", () => {
    const candidates: ClipCandidate[] = [
      { url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", site: "youtube", title: "REACTION to Elden Ring Nightreign trailer", channel: "Some Guy", duration: 900, from: "search" },
      { url: "https://www.youtube.com/watch?v=bbbbbbbbbbb", site: "youtube", title: "ELDEN RING NIGHTREIGN | Official Launch Trailer", channel: "Bandai Namco Entertainment America", verified: true, duration: 116, views: 1_000_000, from: "search" },
      { url: "https://www.youtube.com/watch?v=ccccccccccc", site: "youtube", title: "Cooking pasta at home", channel: "Chef", duration: 300, from: "search" },
      { url: "https://www.youtube.com/watch?v=ddddddddddd", site: "youtube", title: "Elden Ring Nightreign official trailer live", duration: 60, unavailable: true, from: "search" },
    ];
    const ranked = rankCandidates(candidates, { search: "Elden Ring Nightreign official trailer", keepAudio: false });
    expect(ranked.map((entry) => entry.url)).toEqual(["https://www.youtube.com/watch?v=bbbbbbbbbbb", "https://www.youtube.com/watch?v=aaaaaaaaaaa"]);
  });

  it("le sujet compte plus que les mots-clés empilés d'une chaîne d'agrégation (cas réel, recherche « Fable official trailer 2027 »)", () => {
    const entry = (id: string, title: string, channel: string, duration: number, views: number): ClipCandidate => ({ url: `https://www.youtube.com/watch?v=${id}`, site: "youtube", title, channel, verified: true, duration, views, from: "search" });
    const ranked = rankCandidates(
      [
        entry("aaaaaaaaaaa", "FABLE Gameplay Trailer 4K (New OPEN WORLD Action-RPG 2027)", "Punish", 966, 15_441),
        entry("bbbbbbbbbbb", "Fable Official Trailer | Xbox Games Showcase 2024", "GameSpot", 164, 1_699_768),
        entry("ccccccccccc", "Fable - Release Date Reveal Trailer", "GameSpot", 184, 525_696),
      ],
      { search: "Fable official trailer 2027", keepAudio: false }
    );
    expect(ranked[0].url).toBe("https://www.youtube.com/watch?v=bbbbbbbbbbb");
  });

  it("contrôle les adresses rendues par Codex comme une adresse collée", () => {
    const answer = {
      videos: [
        { url: "https://clips.twitch.tv/BraveFunnyClip-abc", title: "Clip", channel: "ZeratoR" },
        { url: "https://www.youtube.com/watch?v=AWrXpJQBJF0", title: "Trailer" },
        { url: "http://127.0.0.1/admin.mp4", title: "Interne" },
        { url: "file:///etc/passwd", title: "Fichier" },
        { url: "https://example.com/video.mp4", title: "Lien direct" },
      ],
    };
    expect(webCandidates(answer, { site: "any", youtube: true }).map((entry) => entry.site)).toEqual(["twitch", "youtube"]);
    // YouTube refuse le serveur : ses adresses ne servent plus ; Twitch demandé : seulement Twitch.
    expect(webCandidates(answer, { site: "any", youtube: false }).map((entry) => entry.site)).toEqual(["twitch"]);
    expect(webCandidates(answer, { site: "twitch", youtube: true })).toHaveLength(1);
    expect(webCandidates({ nope: true }, { site: "any", youtube: true })).toEqual([]);
  });

  it("lit les résultats d'une recherche YouTube sans rien télécharger", () => {
    const raw = JSON.stringify({
      entries: [
        { id: "AWrXpJQBJF0", title: "Official Launch Trailer", channel: "Bandai Namco", channel_is_verified: true, duration: 116, view_count: 1000 },
        { id: "short", title: "Mauvais identifiant" },
        { id: "Ot6j_qqYQaM", title: "En direct", live_status: "is_live" },
        { id: "X6xQKNM1xA8", title: "Membres", availability: "subscriber_only" },
      ],
    });
    const entries = parseSearchJson(raw);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ id: "AWrXpJQBJF0", url: "https://www.youtube.com/watch?v=AWrXpJQBJF0", title: "Official Launch Trailer", channel: "Bandai Namco", verified: true, duration: 116, views: 1000, unavailable: false });
    expect(entries[1].unavailable).toBe(true);
    expect(entries[2].unavailable).toBe(true);
  });
});

// ─── Citation et moment vivant ───────────────────────────────────

describe("Retrouver une citation", () => {
  const transcript = words([
    ["Bienvenue", 0, 500],
    ["à", 520, 600],
    ["tous.", 620, 900],
    ["Nous", 10_000, 10_300],
    ["sommes", 10_320, 10_700],
    ["tellement", 10_720, 11_200],
    ["fiers", 11_220, 11_600],
    ["de", 11_620, 11_700],
    ["ce", 11_720, 11_800],
    ["jeu.", 11_820, 12_300],
    ["Merci.", 20_000, 20_600],
  ]);

  it("retrouve la phrase malgré la casse, la ponctuation, une faute et un mot en moins", () => {
    expect(locateQuote(transcript, "Nous sommes tellement fiers de ce jeu !")).toMatchObject({ first: 3, last: 9, startMs: 10_000, endMs: 12_300, score: 1 });
    // « tèllement » mal transcrit, « de » oublié.
    expect(locateQuote(transcript, "nous sommes tèlement fiers ce jeu")).toMatchObject({ first: 3, last: 9 });
  });

  it("ne rend rien pour une phrase absente, ou trop courte pour être sûre", () => {
    expect(locateQuote(transcript, "Le meilleur jeu de l'année arrive bientôt")).toBeNull();
    expect(locateQuote(transcript, "Bonjour")).toBeNull();
    expect(locateQuote(transcript, "")).toBeNull();
  });

  it("ramène les mots d'un passage à son début", () => {
    expect(rebaseWords(transcript, 9_700, 12_600).map((word) => [word.text, word.startMs])).toEqual([
      ["Nous", 300],
      ["sommes", 620],
      ["tellement", 1020],
      ["fiers", 1520],
      ["de", 1920],
      ["ce", 2020],
      ["jeu.", 2120],
    ]);
  });
});

describe("Moment vivant, sans IA", () => {
  /** Vidéo de 60 s à 4 images par seconde : logo animé au début, plan fixe, scène d'action vers 30 s, carton de fin. */
  const stats = (): MotionStats => {
    const fps = 4;
    const motion: number[] = [];
    const flat: boolean[] = [];
    for (let index = 0; index < 60 * fps; index++) {
      const t = index / fps;
      motion.push(t < 2 ? 0.3 : t >= 28 && t < 36 ? 0.12 + (index % 3) * 0.02 : 0.01);
      flat.push(t >= 56);
    }
    // Deux coupes franches dans la scène d'action.
    motion[30 * fps] = 0.9;
    motion[33 * fps] = 0.9;
    return { fps, motion, flat };
  };

  it("prend la scène la plus vivante, jamais le logo du début ni le carton de fin", () => {
    const picked = pickDynamicWindow(stats(), 60, 6);
    expect(picked.start).toBeGreaterThanOrEqual(27);
    expect(picked.start + 6).toBeLessThanOrEqual(37);
    // Le début animé est hors jeu (5 % de la vidéo) ; une vidéo trop courte part de 0.
    expect(pickDynamicWindow(stats(), 60, 2).start).toBeGreaterThanOrEqual(3);
    expect(pickDynamicWindow({ fps: 4, motion: [0, 0.1, 0.1], flat: [false, false, false] }, 0.75, 5).start).toBe(0);
  });
});

// ─── Recherche, coupe et replis ──────────────────────────────────

describe("Trouver et couper un extrait", () => {
  const trailer: ClipCandidate = { url: "https://www.youtube.com/watch?v=AWrXpJQBJF0", site: "youtube", title: "ELDEN RING NIGHTREIGN Official Trailer", channel: "Bandai Namco", verified: true, duration: 60, from: "search" };
  const twitchClip: ClipCandidate = { url: "https://clips.twitch.tv/BraveFunnyClip-abc", site: "twitch", title: "Elden Ring Nightreign first run", channel: "ZeratoR", from: "web" };
  const motion: MotionStats = { fps: 4, motion: Array.from({ length: 240 }, (_, index) => (index > 100 && index < 140 ? 0.15 : 0.01)), flat: Array.from({ length: 240 }, () => false) };

  function fakeDeps(overrides: Partial<ClipDeps> = {}) {
    const calls: string[] = [];
    const deps: Partial<ClipDeps> = {
      searchYoutube: vi.fn(async () => {
        calls.push("youtube");
        return [trailer];
      }),
      searchWeb: vi.fn(async () => {
        calls.push("web");
        return [twitchClip];
      }),
      probe: vi.fn(async (url: string) => ({ url, site: url.includes("twitch") ? ("twitch" as const) : ("youtube" as const), title: url.includes("twitch") ? twitchClip.title : trailer.title, author: "Bandai Namco", duration: 60 })),
      download: vi.fn(async (_url, _site, section, dir) => {
        calls.push(section ? `cut ${section.start}-${section.end}` : "analysis");
        return `${dir}/file.mp4`;
      }),
      transcribe: vi.fn(async () => ({ words: words([["Welcome", 1000, 1400], ["to", 1420, 1500], ["the", 1520, 1600], ["Nightreign", 1620, 2400]]), transcript: { provider: "openai" as const, at: 1 } })),
      motion: vi.fn(async () => motion),
      store: vi.fn(async (_file, info) => {
        const asset: ClipAsset = {
          file: `webclip-${store.assets.length}.mp4`,
          kind: "video",
          originalName: `${info.probe.title}.mp4`,
          size: 10,
          durationMs: Math.round((info.end - info.start) * 1000),
          hasAudio: true,
          rights: "unverified",
          origin: { site: info.probe.site, url: info.probe.url, title: info.probe.title, section: { start: info.start, end: info.end } },
          ...(info.words ? { words: info.words } : {}),
          createdAt: 1,
        };
        store.assets.push(asset);
        return asset;
      }),
      cached: () => null,
      readAnalysis: () => null,
      writeAnalysis: () => undefined,
      ...overrides,
    };
    return { deps, calls };
  }

  const context = (deps: Partial<ClipDeps>, state: ClipJobState = { audioLeft: 10.5 }) => ({ segment: 0, segmentSeconds: 4, state, signal: new AbortController().signal, deps });
  const muted: ClipRequest = { search: "Elden Ring Nightreign official trailer", site: "any", moment: "Combat de boss", keepAudio: false, seconds: 5 };

  it("cherche sur YouTube, analyse, puis coupe la scène vivante en bonne définition, muette", async () => {
    const { deps, calls } = fakeDeps();
    const result = (await sourceClip(muted, context(deps))) as SourcedClip;
    expect(calls).toEqual(["youtube", "analysis", expect.stringMatching(/^cut /)]);
    expect(result.keepAudio).toBe(false);
    expect(result.outcome).toMatchObject({ status: "found", keepAudio: false, video: { site: "youtube", url: trailer.url } });
    // La scène vivante (25 à 35 s) est retenue, pas le début.
    expect(result.outcome.video!.start).toBeGreaterThanOrEqual(24);
    expect(result.media).toMatchObject({ kind: "video", rights: "unverified", origin: { site: "youtube" } });
    expect(deps.download).toHaveBeenLastCalledWith(trailer.url, "youtube", expect.anything(), expect.any(String), { height: 1080, maxBytes: expect.any(Number), exact: true }, expect.anything());
  });

  it("YouTube refuse le serveur sans cookies : Twitch par le web, et YouTube n'est plus demandé", async () => {
    const { deps, calls } = fakeDeps({
      searchYoutube: vi.fn(async () => {
        throw new YtDlpError("bot-check", "refusé");
      }),
    });
    const state: ClipJobState = { audioLeft: 10.5 };
    const result = (await sourceClip(muted, context(deps, state))) as SourcedClip;
    expect(state.youtubeRefused).toMatch(/cookies non configurés/);
    expect(deps.searchWeb).toHaveBeenCalledWith(muted, { youtube: false }, expect.anything());
    expect(result.outcome.video?.site).toBe("twitch");
    expect(calls[0]).toBe("web");
    // Segment suivant : la recherche YouTube n'est plus tentée.
    await sourceClip(muted, context(deps, state));
    expect(deps.searchYoutube).toHaveBeenCalledTimes(1);
  });

  it("rien de convaincant : le segment garde son repli, avec la raison", async () => {
    const { deps } = fakeDeps({ searchYoutube: vi.fn(async () => []), searchWeb: vi.fn(async () => []) });
    const result = await sourceClip(muted, context(deps));
    expect("media" in result).toBe(false);
    expect(result.outcome).toMatchObject({ status: "fallback", note: expect.stringMatching(/rien de convaincant sur YouTube.*rien de convaincant sur le web/i) });
  });

  it("une citation retrouvée garde son son, ses mots ramenés au début, et sa suite muette", async () => {
    const { deps } = fakeDeps();
    const state: ClipJobState = { audioLeft: 10.5 };
    const quoted: ClipRequest = { ...muted, keepAudio: true, quote: "Welcome to the Nightreign", seconds: 2 };
    const result = (await sourceClip(quoted, context(deps, state))) as SourcedClip;
    expect(result.keepAudio).toBe(true);
    // 1 s − 0,3 s de marge, jusqu'à 2,4 s + 0,3 s, puis 4 s de suite pour la voix off.
    expect(result.outcome.video).toMatchObject({ start: 0.7, end: 6.7 });
    expect(result.quoteSeconds).toBeCloseTo(2, 5);
    expect(result.media.words?.[0]).toMatchObject({ text: "Welcome", startMs: 300 });
    expect(state.audioLeft).toBeCloseTo(8.5, 5);
  });

  it("sans crédit OpenAI : plus de citation, l'extrait devient muet et la raison est gardée pour la suite", async () => {
    const { deps } = fakeDeps({
      transcribe: vi.fn(async () => {
        throw new Error("Le compte OpenAI n’a plus de crédit.");
      }),
    });
    const state: ClipJobState = { audioLeft: 10.5 };
    const quoted: ClipRequest = { ...muted, keepAudio: true, quote: "Welcome to the Nightreign" };
    const result = (await sourceClip(quoted, context(deps, state))) as SourcedClip;
    expect(result.keepAudio).toBe(false);
    expect(state.quotesUnavailable).toMatch(/crédit/);
    expect(result.outcome.note).toMatch(/citation impossible/i);
    // L'extrait suivant ne retente pas la transcription.
    await sourceClip(quoted, context(deps, state));
    expect(deps.transcribe).toHaveBeenCalledTimes(1);
  });

  it("une citation introuvable devient un extrait muet", async () => {
    const { deps } = fakeDeps();
    const result = (await sourceClip({ ...muted, keepAudio: true, quote: "Une phrase qui n'existe nulle part ici" }, context(deps))) as SourcedClip;
    expect(result.keepAudio).toBe(false);
    expect(result.outcome.note).toMatch(/citation introuvable/i);
  });
});

// ─── Étape « Vidéos » ────────────────────────────────────────────

describe("Étape « Vidéos » de l'assistant", () => {
  const media = (name: string, durationMs = 8000): MediaSource => ({ url: `/api/modules/clip-studio/data/assets/${name}`, ref: `module:clip-studio/assets/${name}`, name, kind: "video", durationMs, hasAudio: true });
  const plan = (overrides: Partial<SegmentPlan>): SegmentPlan => ({ action: "find", fallback: true, query: "q", prompt: "p", mascot: false, text: "Un texte lu.", ...overrides });
  const found = (segment: number, keepAudio: boolean, quoteSeconds?: number): SourcedClip => ({
    media: media(`clip-${segment}.mp4`),
    keepAudio,
    ...(quoteSeconds ? { quoteSeconds } : {}),
    outcome: { segment, search: "s", site: "any", moment: "", wantedAudio: keepAudio, status: "found", keepAudio, video: { site: "youtube", url: "https://www.youtube.com/watch?v=AWrXpJQBJF0", title: `Vidéo ${segment}`, start: 1, end: 9 } },
  });

  it("couvre les segments trouvés, garde le repli des autres, et borne le son gardé", async () => {
    const plans = [
      plan({ clip: { search: "a", site: "any", moment: "", keepAudio: true, quote: "x y z", seconds: 6 } }),
      plan({ clip: { search: "b", site: "any", moment: "", keepAudio: true, quote: "x y z", seconds: 6 } }),
      plan({ clip: { search: "c", site: "any", moment: "", keepAudio: false, seconds: 4 } }),
      plan({}),
    ];
    const source = vi.fn(async (_request: ClipRequest, ctx: { segment: number }) =>
      ctx.segment === 2 ? { outcome: { segment: 2, search: "c", site: "any" as const, moment: "", wantedAudio: false, status: "fallback" as const, note: "Rien" } } : found(ctx.segment, true, 7)
    );
    const job = { request: { ...REQUEST, targetSeconds: 30 }, clips: undefined as any };
    const steps: [string, string | undefined][] = [];
    const results = await sourceSegmentClips(job, plans, new AbortController().signal, (state, detail) => steps.push([state, detail]), { source: source as any });
    expect(source).toHaveBeenCalledTimes(3);
    expect(plans[0]).toMatchObject({ action: "none", covered: true });
    expect(plans[2]).toMatchObject({ action: "find", fallback: true });
    expect(plans[2].covered).toBeUndefined();
    // 7 s + 7 s dépassent les 10,5 s permises : le second devient muet.
    expect(results.map((entry) => entry?.keepAudio)).toEqual([true, false, undefined, undefined]);
    expect(job.clips.map((outcome: any) => outcome.segment)).toEqual([0, 1, 2]);
    expect(steps.at(-1)).toEqual(["done", "2 extraits trouvés sur 3 (1 avec son, 1 muet). 1 remplacé par une illustration"]);
    expect(noteClipFallbacks(job.clips, ["none", "none", "pixabay", "web"])[2].fallback).toBe("vidéo libre de Pixabay");
  });

  it("sans extrait demandé, l'étape est sautée ; le bilan dit pourquoi les citations manquent", async () => {
    const steps: string[] = [];
    await sourceSegmentClips({ request: REQUEST }, [plan({})], new AbortController().signal, (state) => steps.push(state));
    expect(steps).toEqual(["skipped"]);
    expect(clipsSummary([], { quotesUnavailable: "Le compte OpenAI n’a plus de crédit" })).toMatch(/Citations impossibles \(Le compte OpenAI n’a plus de crédit\) : extraits muets à la place/);
  });
});

// ─── Placement ───────────────────────────────────────────────────

describe("Placement des extraits", () => {
  const voice = (seconds: number, name: string) => ({
    durationMs: seconds * 1000,
    source: { url: `/v/${name}.mp3`, ref: `module:clip-studio/assets/${name}.mp3`, name, kind: "audio" as const, durationMs: seconds * 1000, words: words([["Texte", 0, seconds * 1000]]) },
  });

  it("cité : le son gardé passe d'abord, la voix off après lui, la musique s'efface dessous ; muet : coupé en plans", () => {
    const quotedMedia: MediaSource = {
      url: "/api/modules/clip-studio/data/assets/webclip-a.mp4",
      ref: "module:clip-studio/assets/webclip-a.mp4",
      name: "Trailer.mp4",
      kind: "video",
      durationMs: 8000,
      hasAudio: true,
      words: words([["Welcome", 300, 700], ["home.", 720, 1500]]),
    };
    const quote: SourcedClip = {
      media: quotedMedia,
      keepAudio: true,
      quoteSeconds: 2,
      outcome: { segment: 0, search: "s", site: "any", moment: "", wantedAudio: true, status: "found", keepAudio: true, video: { site: "youtube", url: "https://www.youtube.com/watch?v=AWrXpJQBJF0", title: "Official Trailer", start: 0, end: 8 } },
    };
    const mutedMedia: MediaSource = { url: "/api/modules/clip-studio/data/assets/webclip-b.mp4", ref: "module:clip-studio/assets/webclip-b.mp4", name: "Gameplay.mp4", kind: "video", durationMs: 9000, hasAudio: true };
    const data: FreeData = {
      title: "Jeux",
      scenes: [
        { heading: "Le premier", text: "Il arrive.", excerpt: clipExcerpt(quote), voice: voice(2, "a") },
        { heading: "Le second", text: "Il bouge beaucoup.", image: mutedMedia, voice: voice(6, "b") },
      ],
      voice: { intro: voice(1, "intro") },
    };
    const project = buildFromTemplate("free", "Jeux", "9:16", data, null, { pace: "normal" });
    const videos = project.tracks.flatMap((track) => track.items).filter((item): item is VideoItem => item.type === "video");
    const quoted = videos.find((item) => item.label === "Extrait – Official Trailer")!;
    expect(quoted.muted).toBeUndefined();
    expect(quoted.duration).toBe(Math.round(2 * project.fps));
    // L'ouverture montre la vidéo du premier extrait, muette, plutôt qu'un aplat.
    expect(videos.find((item) => item.start === 0)).toMatchObject({ source: { ref: quotedMedia.ref }, muted: true });
    // La voix du segment parle après la citation.
    const voices = project.tracks.filter((track) => track.name.startsWith("Voix")).flatMap((track) => track.items);
    const segmentVoice = voices.find((item) => item.type === "audio" && item.source.name === "a")!;
    expect(segmentVoice.start).toBeGreaterThanOrEqual(quoted.start + quoted.duration);
    // Suite muette sous la voix, puis le second segment coupé en plans muets.
    expect(videos.some((item) => item.label === "Extrait – Official Trailer (suite)" && item.muted)).toBe(true);
    const shots = videos.filter((item) => item.source.ref === mutedMedia.ref);
    expect(shots.length).toBeGreaterThan(1);
    expect(shots.every((item) => item.muted && /^Plan \d+\/\d+$/.test(item.label ?? ""))).toBe(true);
    // La musique s'efface pendant la citation comme sous une voix.
    const windows = voiceWindows(project);
    const at = quoted.start / project.fps;
    expect(windows.some(([from, to]) => from <= at + 0.01 && to >= at + 1.9)).toBe(true);
  });
});
