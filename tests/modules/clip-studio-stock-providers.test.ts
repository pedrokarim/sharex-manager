import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Les médias et réglages du module vivent dans un répertoire temporaire, jamais dans `modules/clip-studio/data`.
const store = vi.hoisted(() => ({ assets: [] as any[], root: "" }));
const usage = vi.hoisted(() => ({ calls: [] as any[] }));

vi.mock("@/modules/clip-studio/lib/store", async (importOriginal) => {
  const nodeFs = await import("node:fs");
  const nodeOs = await import("node:os");
  const nodePath = await import("node:path");
  const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "sxm-clip-providers-"));
  store.root = root;
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
  PIXABAY_LIMITS,
  importPixabayHit,
  pickPixabayRendition,
  pixabayCredit,
  pixabayTitle,
  searchPixabay,
  searchPixabayFound,
  type PixabayHit,
} from "@/modules/clip-studio/lib/video-pixabay";
import {
  WIKIMEDIA_USER_AGENT,
  freeWikimediaLicense,
  importWikimediaVideo,
  pickWikimediaRendition,
  plainText,
  readWikimediaVideos,
  searchWikimedia,
  searchWikimediaFound,
  wikimediaCredit,
  type WikimediaPage,
} from "@/modules/clip-studio/lib/video-wikimedia";
import { findStockSegmentVideo, searchStockVideos, usableVideoProviders } from "@/modules/clip-studio/lib/video-providers";
import { isAllowedVideoUrl, type ImportedVideo, type VideoSearchDeps } from "@/modules/clip-studio/lib/video-search";
import { pixabayApiKey, savePixabayKey, videoSourcesStatus } from "@/modules/clip-studio/lib/video-sources";
import { AI_PROVIDERS } from "@/lib/ai-usage/catalog";
import { SITE_LINKS } from "@/config/links";

const json = (body: unknown, headers: Record<string, string> = {}, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const rendition = (width: number, height: number, size: number, name: string) => ({
  url: `https://cdn.pixabay.com/video/2024/01/01/1-${name}.mp4`,
  width,
  height,
  size,
  thumbnail: `https://cdn.pixabay.com/video/2024/01/01/1-${name}.jpg`,
});

const hit = (id: number, duration = 12, portrait = false): PixabayHit => ({
  id,
  pageURL: `https://pixabay.com/videos/id-${id}/`,
  type: "film",
  tags: "ocean, waves, beach, sea, water",
  duration,
  user: "Coverr-Free-Footage",
  user_id: 1281706,
  videos: portrait
    ? {
        large: rendition(2160, 3840, 60_000_000, "large"),
        medium: rendition(1080, 1920, 20_000_000, "medium"),
        small: rendition(720, 1280, 8_000_000, "small"),
        tiny: rendition(540, 960, 3_000_000, "tiny"),
      }
    : {
        large: rendition(3840, 2160, 60_000_000, "large"),
        medium: rendition(1920, 1080, 20_000_000, "medium"),
        small: rendition(1280, 720, 8_000_000, "small"),
        tiny: rendition(960, 540, 3_000_000, "tiny"),
      },
});

const fakeImport = () => {
  const download = vi.fn(async (_url: string, target: string) => fs.writeFileSync(target, "fake"));
  const prepare = vi.fn(async (input: string, output: string) => {
    fs.renameSync(input, output);
    return { durationSec: 10, width: 1920, height: 1080, video: { codec: "h264", attached: false }, audio: { codec: "aac" } };
  });
  return { download, prepare };
};

const savedEnv = { ...process.env };

beforeEach(() => {
  store.assets = [];
  usage.calls = [];
  const pixabay = (globalThis as any).__sxmPixabay;
  if (pixabay) {
    pixabay.calls = [];
    pixabay.cache = new Map();
    pixabay.seen = new Map();
    delete pixabay.window;
  }
  const wikimedia = (globalThis as any).__sxmWikimedia;
  if (wikimedia) {
    wikimedia.calls = [];
    wikimedia.cache = new Map();
    wikimedia.seen = new Map();
  }
  delete process.env.PIXABAY_API_KEY;
  delete process.env.PEXELS_API_KEY;
});

afterAll(() => {
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
  fs.rmSync(store.root, { recursive: true, force: true });
});

// ─── Pixabay ─────────────────────────────────────────────────────

describe("Pixabay : choix du fichier et mention", () => {
  it("prend la version dont la hauteur est la plus proche du projet, sans dépasser 1920 px", () => {
    // Paysage : la 4K (2160 de haut) est écartée ; pour un short vertical, la plus haute restante.
    expect(pickPixabayRendition(hit(1), { height: 1920 })?.width).toBe(1920);
    expect(pickPixabayRendition(hit(1), { height: 1080 })?.height).toBe(1080);
    // Portrait : la version 1080 × 1920 pour un short ; pour un 16:9 (1080 de haut), la plus proche, 540 × 960.
    expect(pickPixabayRendition(hit(2, 10, true), { height: 1920 })).toMatchObject({ width: 1080, height: 1920 });
    expect(pickPixabayRendition(hit(2, 10, true), { height: 1080 })).toMatchObject({ width: 540, height: 960 });
    // Version absente (adresse vide, taille nulle) ou non https : ignorée.
    const partial: PixabayHit = { id: 3, videos: { large: { url: "", width: 0, height: 0, size: 0 }, medium: { url: "http://cdn.pixabay.com/x.mp4", width: 1920, height: 1080 }, tiny: rendition(640, 360, 1, "tiny") } };
    expect(pickPixabayRendition(partial, { height: 1920 })?.height).toBe(360);
    expect(pickPixabayRendition({ videos: {} }, { height: 1920 })).toBeNull();
  });

  it("titre tiré des mots-clés, mention « Vidéo : auteur sur Pixabay »", () => {
    expect(pixabayTitle(hit(5))).toBe("Ocean, waves, beach, sea");
    expect(pixabayTitle({ id: 6, tags: "" })).toBe("Vidéo Pixabay 6");
    expect(pixabayCredit(hit(5))).toBe("Vidéo : Coverr-Free-Footage sur Pixabay");
    expect(pixabayCredit({ user: "" })).toBe("Vidéo : Pixabay");
  });

  it("ne télécharge que depuis le CDN de Pixabay, en https", async () => {
    const { PIXABAY_DOWNLOAD } = await import("@/modules/clip-studio/lib/video-pixabay");
    expect(isAllowedVideoUrl("https://cdn.pixabay.com/video/2024/01/01/1-medium.mp4", PIXABAY_DOWNLOAD.hosts)).toBe(true);
    expect(isAllowedVideoUrl("https://cdn.pixabay.com.evil.example/a.mp4", PIXABAY_DOWNLOAD.hosts)).toBe(false);
    expect(isAllowedVideoUrl("http://cdn.pixabay.com/a.mp4", PIXABAY_DOWNLOAD.hosts)).toBe(false);
    expect(isAllowedVideoUrl("https://videos.pexels.com/a.mp4", PIXABAY_DOWNLOAD.hosts)).toBe(false);
  });
});

describe("Pixabay : recherche, cache de 24 heures et limite", () => {
  it("cherche avec la clé et les filtres, note l'appel, et garde la réponse 24 heures", async () => {
    let now = 1_000_000;
    const fetch = vi.fn(async (_url: string, _init: { headers: Record<string, string> }) =>
      json({ total: 2, totalHits: 2, hits: [hit(11, 14), hit(12, 8, true), { id: "bad" }] }, { "x-ratelimit-limit": "100", "x-ratelimit-remaining": "99", "x-ratelimit-reset": "60" })
    );
    const deps: VideoSearchDeps = { fetch, apiKey: () => "pixabay-key", now: () => now };
    const found = await searchPixabayFound({ query: "  ocean   waves ", orientation: "portrait", page: 2 }, deps);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://pixabay.com/api/videos/");
    expect(url.searchParams.get("q")).toBe("ocean waves");
    expect(url.searchParams.get("key")).toBe("pixabay-key");
    expect(url.searchParams.get("safesearch")).toBe("true");
    expect(url.searchParams.get("video_type")).toBe("film");
    expect(url.searchParams.get("page")).toBe("2");
    // L'orientation du projet passe devant ; le reste garde l'ordre de Pixabay.
    expect(found.map((video) => video.id)).toEqual(["pixabay:12", "pixabay:11"]);
    expect(found[0]).toMatchObject({ provider: "pixabay", license: "Licence Pixabay", rights: "free", width: 2160, height: 3840, durationSec: 8, sourcePage: "https://pixabay.com/videos/id-12/" });
    expect(found[0].preview).toContain("-tiny.mp4");
    expect(usage.calls).toEqual([expect.objectContaining({ provider: "pixabay", unit: "calls", amount: 1, ok: true, durationMs: expect.any(Number) })]);

    // Même recherche dans les 24 heures : aucun nouvel appel.
    now += PIXABAY_LIMITS.cacheMs - 1000;
    await searchPixabayFound({ query: "ocean waves", orientation: "portrait", page: 2 }, deps);
    expect(fetch).toHaveBeenCalledTimes(1);
    // Passé 24 heures, la recherche repart chez Pixabay.
    now += 2000;
    await searchPixabayFound({ query: "ocean waves", orientation: "portrait", page: 2 }, deps);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("sans clé, ne fait aucun appel et le dit", async () => {
    const fetch = vi.fn();
    await expect(searchPixabay({ query: "ocean", origin: { module: "clip-studio", feature: "t" } }, { fetch, apiKey: () => "" })).rejects.toThrow(/clé Pixabay/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("respecte la fenêtre relevée dans les en-têtes et le compte local de la minute", async () => {
    const now = 5_000_000;
    const fetch = vi.fn(async () => json({ hits: [hit(21)] }, { "x-ratelimit-limit": "100", "x-ratelimit-remaining": "0", "x-ratelimit-reset": "42" }));
    const deps: VideoSearchDeps = { fetch, apiKey: () => "k", now: () => now };
    await searchPixabay({ query: "forest", origin: { module: "clip-studio", feature: "t" } }, deps);
    // Pixabay a dit : plus rien avant 42 secondes.
    await expect(searchPixabay({ query: "river", origin: { module: "clip-studio", feature: "t" } }, deps)).rejects.toThrow(/Limite de Pixabay/);
    expect(fetch).toHaveBeenCalledTimes(1);

    // Compte local : 100 appels dans la minute, rien de plus.
    const state = (globalThis as any).__sxmPixabay;
    delete state.window;
    state.calls = Array.from({ length: PIXABAY_LIMITS.perWindow }, () => now);
    await expect(searchPixabay({ query: "lake", origin: { module: "clip-studio", feature: "t" } }, deps)).rejects.toThrow(/100 requêtes par minute/);
    // L'assistant s'arrête dix appels plus tôt.
    state.calls = Array.from({ length: PIXABAY_LIMITS.perWindow - PIXABAY_LIMITS.margin }, () => now);
    await expect(searchPixabay({ query: "lake", origin: { module: "clip-studio", feature: "t" }, reserve: true }, deps)).rejects.toThrow(/Limite de Pixabay/);
    await searchPixabay({ query: "lake", origin: { module: "clip-studio", feature: "t" } }, deps);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("un refus 429 est noté au registre comme une limite de débit, sans la clé", async () => {
    const fetch = vi.fn(async () => new Response("API rate limit exceeded", { status: 429 }));
    await expect(searchPixabay({ query: "city", origin: { module: "clip-studio", feature: "t" } }, { fetch, apiKey: () => "secret-key-123" })).rejects.toThrow(/réessayez dans une minute/);
    expect(usage.calls).toEqual([expect.objectContaining({ provider: "pixabay", ok: false, errorKind: "rate-limit", durationMs: expect.any(Number) })]);
    expect(JSON.stringify(usage.calls)).not.toContain("secret-key-123");
  });

  it("une clé refusée (400 « Invalid or missing API key ») est dite comme telle", async () => {
    const fetch = vi.fn(async () => new Response("[ERROR 400] Invalid or missing API key", { status: 400 }));
    await expect(searchPixabay({ query: "city", origin: { module: "clip-studio", feature: "t" } }, { fetch, apiKey: () => "bad" })).rejects.toThrow(/refuse la clé/);
    expect(usage.calls[0]).toMatchObject({ ok: false, errorKind: "auth" });
  });

  it("importe la version choisie comme média du module, avec la mention de Pixabay", async () => {
    const { download, prepare } = fakeImport();
    const imported = await importPixabayHit(hit(31), { height: 1080 }, { download, prepare });
    expect(download.mock.calls[0][0]).toBe("https://cdn.pixabay.com/video/2024/01/01/1-medium.mp4");
    expect(imported).toMatchObject({ rights: "free", credit: "Vidéo : Coverr-Free-Footage sur Pixabay", hasAudio: true });
    expect(store.assets[0]).toMatchObject({ foundId: "pixabay:31", origin: { site: "web", url: "https://pixabay.com/videos/id-31/" } });
    await importPixabayHit(hit(31), { height: 1080 }, { download, prepare });
    expect(download).toHaveBeenCalledTimes(1);
  });
});

// ─── Wikimedia Commons ───────────────────────────────────────────

const meta = (fields: Record<string, string>) => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { value }]));

const page = (pageid: number, fields: Record<string, string>, extra: Partial<WikimediaPage["videoinfo"] extends (infer T)[] | undefined ? T : never> = {}, index = 1): WikimediaPage => ({
  pageid,
  title: `File:Ocean surface waves ${pageid}.webm`,
  index,
  videoinfo: [
    {
      size: 12_085_009,
      width: 1920,
      height: 1080,
      duration: 16.8,
      url: `https://upload.wikimedia.org/wikipedia/commons/0/08/Ocean_${pageid}.webm`,
      thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Ocean_${pageid}.webm/640px--Ocean_${pageid}.webm.jpg`,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:Ocean_${pageid}.webm`,
      mime: "video/webm",
      mediatype: "VIDEO",
      extmetadata: meta(fields),
      derivatives: [
        { src: `https://upload.wikimedia.org/wikipedia/commons/0/08/Ocean_${pageid}.webm`, type: 'video/webm; codecs="vp9, opus"', width: 1920, height: 1080, bandwidth: 4_560_201 },
        { src: `https://upload.wikimedia.org/wikipedia/commons/transcoded/0/08/Ocean_${pageid}.webm/Ocean_${pageid}.webm.240p.vp9.webm`, type: 'video/webm; codecs="vp9, opus"', transcodekey: "240p.vp9.webm", width: 426, height: 240, bandwidth: 311_456 },
        { src: `https://upload.wikimedia.org/wikipedia/commons/transcoded/0/08/Ocean_${pageid}.webm/Ocean_${pageid}.webm.360p.mpeg4.mov`, type: 'video/quicktime; codecs="mp4v"', transcodekey: "360p.mpeg4.mov", width: 640, height: 360, bandwidth: 1_149_120 },
        { src: `https://upload.wikimedia.org/wikipedia/commons/transcoded/0/08/Ocean_${pageid}.webm/Ocean_${pageid}.webm.720p.vp9.webm`, type: 'video/webm; codecs="vp9, opus"', transcodekey: "720p.vp9.webm", width: 1280, height: 720, bandwidth: 2_000_000 },
      ],
      ...extra,
    },
  ],
});

const CC0 = { LicenseShortName: "CC0", License: "cc0", Artist: '<a href="//commons.wikimedia.org/wiki/User:Mostafameraji">Mostafameraji</a>', LicenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en" };

describe("Wikimedia Commons : licences libres seulement", () => {
  it("garde CC0, domaine public, CC BY et CC BY-SA ; écarte NC, ND, GFDL seule et non libre", () => {
    expect(freeWikimediaLicense(meta({ LicenseShortName: "CC0", License: "cc0" }))?.name).toBe("CC0");
    expect(freeWikimediaLicense(meta({ LicenseShortName: "Public domain", License: "pd" }))?.name).toBe("Public domain");
    expect(freeWikimediaLicense(meta({ LicenseShortName: "CC BY 4.0", License: "cc-by-4.0" }))?.name).toBe("CC BY 4.0");
    expect(freeWikimediaLicense(meta({ LicenseShortName: "CC BY-SA 3.0", License: "cc-by-sa-3.0", LicenseUrl: "http://creativecommons.org/licenses/by-sa/3.0" }))).toEqual({
      name: "CC BY-SA 3.0",
      url: "https://creativecommons.org/licenses/by-sa/3.0",
    });
    // Sans code machine, le nom court suffit.
    expect(freeWikimediaLicense(meta({ LicenseShortName: "CC BY-SA 4.0" }))?.name).toBe("CC BY-SA 4.0");
    expect(freeWikimediaLicense(meta({ LicenseShortName: "CC BY-NC-SA 4.0", License: "cc-by-nc-sa-4.0" }))).toBeNull();
    expect(freeWikimediaLicense(meta({ LicenseShortName: "CC BY-ND 4.0", License: "cc-by-nd-4.0" }))).toBeNull();
    expect(freeWikimediaLicense(meta({ LicenseShortName: "GFDL", License: "gfdl" }))).toBeNull();
    expect(freeWikimediaLicense(meta({ LicenseShortName: "Fair use", License: "" }))).toBeNull();
    expect(freeWikimediaLicense(meta({ LicenseShortName: "CC0", License: "cc0", NonFree: "true" }))).toBeNull();
    expect(freeWikimediaLicense(undefined)).toBeNull();
  });

  it("lit les résultats dans l'ordre de pertinence, sans les licences non libres, trop longs ou pas des vidéos", () => {
    const videos = readWikimediaVideos({
      query: {
        pages: [
          page(3, CC0, {}, 3),
          page(1, { ...CC0, LicenseShortName: "CC BY 4.0", License: "cc-by-4.0", Artist: "NASA &amp; ESA" }, {}, 1),
          page(2, { LicenseShortName: "CC BY-NC 4.0", License: "cc-by-nc-4.0" }, {}, 2),
          page(4, CC0, { duration: 600 }, 4),
          page(5, CC0, { mediatype: "AUDIO" }, 5),
        ],
      },
    });
    expect(videos.map((video) => video.pageId)).toEqual([1, 3]);
    expect(videos[0]).toMatchObject({ author: "NASA & ESA", license: "CC BY 4.0", title: "Ocean surface waves 1" });
    expect(wikimediaCredit(videos[0])).toBe("Vidéo : NASA & ESA sur Wikimedia Commons (CC BY 4.0)");
    expect(plainText('<a href="x">Jane</a> <b>Doe</b>&#39;s<br/>Studio')).toBe("Jane Doe's Studio");
  });

  it("préfère une version réencodée en WebM de la bonne hauteur, jamais la version QuickTime", () => {
    const [video] = readWikimediaVideos({ query: { pages: [page(7, CC0)] } });
    // Pour un 16:9 (1080) : l'original 1080p en WebM ; pour un carré bridé à 1080 aussi.
    expect(pickWikimediaRendition(video, { height: 1080 })).toMatchObject({ height: 1080, extension: "webm", original: true });
    // Une version réencodée à hauteur égale passe devant l'original.
    const withTranscode = readWikimediaVideos({
      query: { pages: [page(8, CC0, { derivatives: [...(page(8, CC0).videoinfo![0].derivatives ?? []), { src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/x.1080p.vp9.webm", type: "video/webm", transcodekey: "1080p.vp9.webm", width: 1920, height: 1080, bandwidth: 3_000_000 }] })] },
    })[0];
    expect(pickWikimediaRendition(withTranscode, { height: 1920 })).toMatchObject({ height: 1080, original: false });
    // Un original trop lourd est écarté : la version de 720p prend le relais.
    const heavy = readWikimediaVideos({ query: { pages: [page(9, CC0, { size: 2_000_000_000 })] } })[0];
    expect(pickWikimediaRendition(heavy, { height: 1920 })).toMatchObject({ height: 720, original: false });
  });

  it("ne télécharge que depuis upload.wikimedia.org", async () => {
    const { WIKIMEDIA_DOWNLOAD } = await import("@/modules/clip-studio/lib/video-wikimedia");
    expect(isAllowedVideoUrl("https://upload.wikimedia.org/wikipedia/commons/0/08/a.webm", WIKIMEDIA_DOWNLOAD.hosts)).toBe(true);
    expect(isAllowedVideoUrl("https://commons.wikimedia.org/wiki/File:a.webm", WIKIMEDIA_DOWNLOAD.hosts)).toBe(false);
    expect(WIKIMEDIA_DOWNLOAD.extraTypes).toContain("application/ogg");
  });
});

describe("Wikimedia Commons : recherche et import", () => {
  it("se présente selon la politique de Wikimedia, cherche des vidéos et garde la réponse une heure", async () => {
    let now = 9_000_000;
    const fetch = vi.fn(async (_url: string, _init: { headers: Record<string, string> }) => json({ query: { pages: [page(41, CC0), page(42, { LicenseShortName: "CC BY-ND 4.0", License: "cc-by-nd-4.0" }, {}, 2)] } }));
    const deps: VideoSearchDeps = { fetch, now: () => now };
    const found = await searchWikimediaFound({ query: "ocean: waves", orientation: "landscape" }, deps);
    const [url, init] = fetch.mock.calls[0];
    const params = new URL(url).searchParams;
    expect(new URL(url).origin).toBe("https://commons.wikimedia.org");
    expect(params.get("generator")).toBe("search");
    expect(params.get("gsrnamespace")).toBe("6");
    expect(params.get("gsrsearch")).toBe("ocean waves filetype:video");
    expect(params.get("prop")).toBe("videoinfo");
    expect(params.get("viprop")).toContain("derivatives");
    expect(init.headers["User-Agent"]).toBe(WIKIMEDIA_USER_AGENT);
    expect(WIKIMEDIA_USER_AGENT).toContain(SITE_LINKS.repository);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: "wikimedia:41", provider: "wikimedia", license: "CC0", rights: "free", creator: "Mostafameraji" });
    expect(found[0].preview).toContain("240p.vp9.webm");
    expect(usage.calls).toEqual([expect.objectContaining({ provider: "wikimedia", ok: true, durationMs: expect.any(Number) })]);
    now += 30 * 60 * 1000;
    await searchWikimedia({ query: "ocean waves", origin: { module: "clip-studio", feature: "t" } }, deps);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("s'impose un rythme : 30 requêtes par minute au plus", async () => {
    const fetch = vi.fn(async () => json({ query: { pages: [] } }));
    (globalThis as any).__sxmWikimedia.calls = Array.from({ length: 30 }, () => 1_000);
    await expect(searchWikimedia({ query: "forest", origin: { module: "clip-studio", feature: "t" } }, { fetch, now: () => 2_000 })).rejects.toThrow(/Trop de recherches/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("importe en réencodant, avec l'auteur et la licence dans la mention", async () => {
    const { download, prepare } = fakeImport();
    const [video] = readWikimediaVideos({ query: { pages: [page(51, { ...CC0, LicenseShortName: "CC BY-SA 4.0", License: "cc-by-sa-4.0" })] } });
    const imported = await importWikimediaVideo(video, { height: 1920 }, { download, prepare });
    expect(download.mock.calls[0][0]).toMatch(/^https:\/\/upload\.wikimedia\.org\//);
    // Le fichier reçu garde son conteneur (WebM) : ffmpeg le réencode en MP4.
    expect(download.mock.calls[0][1]).toMatch(/source\.webm$/);
    expect(imported).toMatchObject({ rights: "free", credit: "Vidéo : Mostafameraji sur Wikimedia Commons (CC BY-SA 4.0)" });
    expect(imported.file).toMatch(/\.mp4$/);
    expect(store.assets[0]).toMatchObject({ foundId: "wikimedia:51", origin: { site: "web", url: "https://commons.wikimedia.org/wiki/File:Ocean_51.webm" } });
  });
});

// ─── Banques réunies ─────────────────────────────────────────────

const imported = (name: string): ImportedVideo => ({ file: `${name}.mp4`, url: `/v/${name}.mp4`, ref: `module:clip-studio/assets/${name}.mp4`, name, credit: name, rights: "free", hasAudio: false, durationMs: 10_000 });
const segment = { query: "chef cooking", aspect: "9:16" as const, minSeconds: 6 };

describe("Banques réunies : ordre et repli", () => {
  it("Wikimedia Commons est toujours utilisable ; Pixabay et Pexels avec leur clé, dans cet ordre", () => {
    expect(usableVideoProviders({ pixabay: () => "", pexels: () => "" })).toEqual(["wikimedia"]);
    expect(usableVideoProviders({ pixabay: () => "a", pexels: () => "b" })).toEqual(["pixabay", "pexels", "wikimedia"]);
    expect(usableVideoProviders({ pixabay: () => "", pexels: () => "b" })).toEqual(["pexels", "wikimedia"]);
  });

  it("l'assistant cherche dans Pixabay, puis Pexels, puis Wikimedia Commons", async () => {
    const keys = { pixabay: () => "a", pexels: () => "b" };
    const pixabay = vi.fn(async () => ({ video: imported("pix"), alternates: [] }));
    const pexels = vi.fn(async () => ({ video: imported("pex"), alternates: [] }));
    const wikimedia = vi.fn(async () => ({ video: imported("wik"), alternates: [] }));
    expect(await findStockSegmentVideo(segment, { keys, finders: { pixabay, pexels, wikimedia } })).toMatchObject({ provider: "pixabay", video: { name: "pix" } });
    expect(pexels).not.toHaveBeenCalled();

    // Rien sur Pixabay : Pexels ; Pexels en panne : Wikimedia Commons.
    pixabay.mockResolvedValueOnce(null as any);
    expect(await findStockSegmentVideo(segment, { keys, finders: { pixabay, pexels, wikimedia } })).toMatchObject({ provider: "pexels" });
    pixabay.mockResolvedValueOnce(null as any);
    pexels.mockRejectedValueOnce(new Error("Pexels ne répond pas"));
    expect(await findStockSegmentVideo(segment, { keys, finders: { pixabay, pexels, wikimedia } })).toMatchObject({ provider: "wikimedia" });
  });

  it("sans clé, seul Wikimedia Commons est essayé ; toutes en échec, la première erreur remonte ; rien trouvé, null", async () => {
    const pixabay = vi.fn(async () => ({ video: imported("pix"), alternates: [] }));
    const wikimedia = vi.fn(async () => null);
    expect(await findStockSegmentVideo(segment, { keys: { pixabay: () => "", pexels: () => "" }, finders: { pixabay, wikimedia } })).toBeNull();
    expect(pixabay).not.toHaveBeenCalled();
    expect(wikimedia).toHaveBeenCalledTimes(1);

    const failing = { pixabay: vi.fn(async () => Promise.reject(new Error("Limite de Pixabay atteinte"))), wikimedia: vi.fn(async () => Promise.reject(new Error("Commons ne répond pas"))) };
    await expect(findStockSegmentVideo(segment, { keys: { pixabay: () => "a", pexels: () => "" }, finders: failing })).rejects.toThrow(/Limite de Pixabay/);
  });

  it("l'onglet « Trouver » refuse une banque sans clé, et prend Wikimedia Commons par défaut", async () => {
    await expect(searchStockVideos({ provider: "pixabay", query: "ocean" }, { keys: { pixabay: () => "", pexels: () => "" } })).rejects.toThrow(/clé Pixabay/);
    const fetch = vi.fn(async () => json({ query: { pages: [page(61, CC0)] } }));
    const found = await searchStockVideos({ query: "ocean" }, { keys: { pixabay: () => "", pexels: () => "" }, wikimedia: { fetch } });
    expect(found.map((video) => video.provider)).toEqual(["wikimedia"]);
  });

  it("le registre connaît Pixabay et Wikimedia Commons, avec leurs logos", () => {
    expect(AI_PROVIDERS.find((entry) => entry.id === "pixabay")).toMatchObject({ brand: "pixabay", kind: "api" });
    expect(AI_PROVIDERS.find((entry) => entry.id === "wikimedia")).toMatchObject({ brand: "wikimediacommons", kind: "free" });
  });
});

// ─── Réglages ────────────────────────────────────────────────────

describe("Réglages : clé Pixabay", () => {
  it("s'enregistre chiffrée, ne ressort que par ses quatre derniers caractères, et cède la place à la variable d'environnement", async () => {
    process.env.AUTH_SECRET = "secret-de-test-assez-long-pour-hkdf";
    const { DATA_DIR } = await import("@/modules/clip-studio/lib/store");
    savePixabayKey("  12345678-abcdef0123456789abcdef01  ");
    expect(pixabayApiKey()).toBe("12345678-abcdef0123456789abcdef01");
    const raw = fs.readFileSync(path.join(DATA_DIR, "video-sources.json"), "utf-8");
    expect(raw).not.toContain("abcdef0123456789");
    const status = videoSourcesStatus();
    expect(status.pixabay).toMatchObject({ configured: true, fromEnv: false, hint: "••••••••ef01", envVariable: "PIXABAY_API_KEY", site: "https://pixabay.com/api/docs/" });
    expect(JSON.stringify(status)).not.toContain("abcdef0123456789");
    expect(status.pexels.configured).toBe(false);

    process.env.PIXABAY_API_KEY = "env-key-0000000000";
    expect(pixabayApiKey()).toBe("env-key-0000000000");
    expect(videoSourcesStatus().pixabay.fromEnv).toBe(true);
    delete process.env.PIXABAY_API_KEY;

    expect(() => savePixabayKey("short")).toThrow(/clé Pixabay/);
    savePixabayKey("");
    expect(pixabayApiKey()).toBe("");
    expect(videoSourcesStatus().pixabay.configured).toBe(false);
  });
});
