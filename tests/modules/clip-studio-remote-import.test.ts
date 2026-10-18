import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Les données du module vivent dans un répertoire temporaire, jamais dans `modules/clip-studio/data`.
const store = vi.hoisted(() => ({
  assets: [] as any[],
  projects: [] as any[],
}));

vi.mock("@/modules/clip-studio/lib/store", async () => {
  const nodeFs = await import("node:fs");
  const nodeOs = await import("node:os");
  const nodePath = await import("node:path");
  const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "sxm-clip-remote-"));
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
  };
});

import {
  REMOTE_LIMITS,
  UNTRUSTED_INPUT_ARGS,
  assertPublicHttpUrl,
  conversionPlan,
  finalizeArgs,
  parseMediaStreams,
  parseRemoteUrl,
  parseTimestamp,
  remoteCredit,
  resolveSection,
  sweepRemoteAssets,
} from "@/modules/clip-studio/lib/remote-import";
import {
  buildDownloadArgs,
  classifyYtDlpError,
  downloadSection,
  formatSelector,
  parseFileLine,
  parseFormatLine,
  parseInfoJson,
  parseProgressLine,
  pickThumbnail,
  ytDlpErrorMessage,
  ytDlpPath,
} from "@/lib/media/ytdlp";
import { ffmpegPath } from "@/lib/media/ffmpeg";
import { normalizeCookies } from "@/modules/clip-studio/lib/video-sources";
import { formatClock, parseClock } from "@/modules/clip-studio/lib/clock";

describe("adresses acceptées", () => {
  it("réécrit une vidéo YouTube sous sa forme canonique, sans liste de lecture", () => {
    expect(parseRemoteUrl("https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PL123&index=4")).toEqual({
      site: "youtube",
      kind: "video",
      url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    });
    expect(parseRemoteUrl("https://youtu.be/jNQXAC9IVRw?t=1m30s")).toMatchObject({ url: "https://www.youtube.com/watch?v=jNQXAC9IVRw", startHint: 90 });
    expect(parseRemoteUrl("https://m.youtube.com/watch?v=jNQXAC9IVRw&t=42")).toMatchObject({ startHint: 42 });
  });

  it("reconnaît un short", () => {
    expect(parseRemoteUrl("https://www.youtube.com/shorts/abcdefghijk")).toEqual({
      site: "youtube",
      kind: "short",
      url: "https://www.youtube.com/watch?v=abcdefghijk",
    });
  });

  it("reconnaît les clips et les VOD Twitch", () => {
    const clip = { site: "twitch", kind: "clip", url: "https://clips.twitch.tv/CrypticConfidentWoodcockDatSheffy-7bIqt_3zwrUM0MP9" };
    expect(parseRemoteUrl("https://www.twitch.tv/zerator/clip/CrypticConfidentWoodcockDatSheffy-7bIqt_3zwrUM0MP9?filter=clips")).toEqual(clip);
    expect(parseRemoteUrl("https://clips.twitch.tv/CrypticConfidentWoodcockDatSheffy-7bIqt_3zwrUM0MP9")).toEqual(clip);
    expect(parseRemoteUrl("https://clips.twitch.tv/embed?clip=CrypticConfidentWoodcockDatSheffy-7bIqt_3zwrUM0MP9")).toEqual(clip);
    expect(parseRemoteUrl("https://www.twitch.tv/videos/2245678901?t=1h2m3s")).toEqual({
      site: "twitch",
      kind: "vod",
      url: "https://www.twitch.tv/videos/2245678901",
      startHint: 3723,
    });
  });

  it("accepte un lien direct vers un fichier vidéo", () => {
    expect(parseRemoteUrl("https://cdn.example.com/media/Mon%20clip.mp4#t=3")).toEqual({
      site: "web",
      kind: "file",
      url: "https://cdn.example.com/media/Mon%20clip.mp4",
    });
    expect(parseRemoteUrl("http://videos.example.org/a.webm?token=1").site).toBe("web");
  });
});

describe("adresses refusées", () => {
  it.each([
    ["", "Collez"],
    ["pas une adresse", "invalide"],
    ["ftp://example.com/video.mp4", "http"],
    ["javascript:alert(1)", "http"],
    ["file:///etc/passwd", "http"],
    ["https://user:secret@example.com/video.mp4", "identifiants"],
    ["https://example.com:8080/video.mp4", "port"],
    ["https://www.youtube.com/channel/UC123", "YouTube"],
    ["https://www.youtube.com/watch?v=court", "YouTube"],
    ["https://www.twitch.tv/zerator", "Twitch"],
    ["https://example.com/page.html", "non reconnue"],
    ["https://example.com/", "non reconnue"],
  ])("%s", (raw, message) => {
    expect(() => parseRemoteUrl(raw)).toThrow(message);
  });

  it.each([
    "http://localhost/video.mp4",
    "http://app.localhost/video.mp4",
    "http://127.0.0.1/video.mp4",
    "http://0x7f000001/video.mp4",
    "http://2130706433/video.mp4",
    "http://10.0.0.5/video.mp4",
    "http://192.168.1.10/video.mp4",
    "http://169.254.169.254/latest/meta-data/video.mp4",
    "http://[::1]/video.mp4",
    "http://[::ffff:127.0.0.1]/video.mp4",
    "http://[fd00::1]/video.mp4",
    "http://intranet/video.mp4",
    "http://nas.local/video.mp4",
    "http://db.internal/video.mp4",
    "http://localhost./video.mp4",
  ])("adresse interne : %s", (raw) => {
    expect(() => parseRemoteUrl(raw)).toThrow(/interne/);
  });

  it("une adresse publique passe le contrôle de forme", () => {
    expect(assertPublicHttpUrl("https://93.184.216.34/v.mp4").hostname).toBe("93.184.216.34");
  });

  it("lit les instants des adresses", () => {
    expect(parseTimestamp("90")).toBe(90);
    expect(parseTimestamp("90s")).toBe(90);
    expect(parseTimestamp("1h2m3s")).toBe(3723);
    expect(parseTimestamp("abc")).toBeUndefined();
    expect(parseTimestamp(null)).toBeUndefined();
  });
});

describe("bornes du passage", () => {
  it("prend toute une vidéo courte par défaut", () => {
    expect(resolveSection({}, 26)).toEqual({ start: 0, end: 26, whole: true });
  });

  it("limite le passage par défaut à 20 minutes", () => {
    expect(resolveSection({ start: 60 }, 3 * 3600)).toEqual({ start: 60, end: 60 + REMOTE_LIMITS.maxSectionSeconds, whole: false });
  });

  it("refuse un passage de plus de 20 minutes", () => {
    expect(() => resolveSection({ start: 0, end: 20 * 60 + 1 }, 3600)).toThrow("20 minutes");
    expect(resolveSection({ start: 0, end: 20 * 60 }, 3600).end).toBe(1200);
  });

  it("refuse un passage à l'envers, vide ou hors de la vidéo", () => {
    expect(() => resolveSection({ start: 30, end: 10 }, 60)).toThrow("après le début");
    expect(() => resolveSection({ start: 10, end: 10.5 }, 60)).toThrow("une seconde");
    expect(() => resolveSection({ start: 70 }, 60)).toThrow("après la fin");
    expect(() => resolveSection({ start: -1 }, 60)).toThrow("Début invalide");
    expect(() => resolveSection({ start: "abc" }, 60)).toThrow("Début invalide");
  });

  it("ramène la fin à la durée de la vidéo", () => {
    expect(resolveSection({ start: 5, end: 500 }, 60)).toEqual({ start: 5, end: 60, whole: false });
  });

  it("garde une fin absente quand la durée est inconnue (lien direct)", () => {
    expect(resolveSection({ start: 10 })).toEqual({ start: 10, whole: false });
    expect(resolveSection({})).toEqual({ start: 0, whole: true });
  });
});

describe("yt-dlp", () => {
  it("demande du H.264 et de l'AAC, 1080p au plus", () => {
    const selector = formatSelector();
    expect(selector.startsWith("bv*[vcodec^=avc1][height<=1080]+ba[acodec^=mp4a]/b[vcodec^=avc1][height<=1080]")).toBe(true);
    expect(selector).toContain("b[height<=1080][format_id!^=portrait]");
    expect(selector.endsWith("/b")).toBe(true);
  });

  it("construit les arguments d'un passage, l'adresse après --", () => {
    const args = buildDownloadArgs("https://www.youtube.com/watch?v=jNQXAC9IVRw", "/tmp/job", { start: 12.5, end: 30 });
    expect(args.slice(-2)).toEqual(["--", "https://www.youtube.com/watch?v=jNQXAC9IVRw"]);
    expect(args[args.indexOf("--download-sections") + 1]).toBe("*12.5-30");
    expect(args[args.indexOf("-f") + 1]).toBe(formatSelector());
    expect(args[args.indexOf("--merge-output-format") + 1]).toBe("mp4");
    expect(args).not.toContain("--exec");
    const whole = buildDownloadArgs("https://clips.twitch.tv/abc", "/tmp/job", null);
    expect(whole).not.toContain("--download-sections");
  });

  it("borne la taille dans ffmpeg (`-fs`) en plus de `--max-filesize`", () => {
    const args = buildDownloadArgs("https://www.twitch.tv/videos/2245678901", "/tmp/job", { start: 0, end: 60 }, { maxBytes: 786_432_000, maxFilesizeMb: 1500 });
    expect(args[args.indexOf("--downloader-args") + 1]).toBe("ffmpeg_o:-fs 786432000");
    expect(args[args.indexOf("--max-filesize") + 1]).toBe("1500M");
    // Toujours avant l'adresse.
    expect(args.indexOf("--downloader-args")).toBeLessThan(args.indexOf("--"));
    expect(buildDownloadArgs("https://clips.twitch.tv/abc", "/tmp/job", null)).not.toContain("--downloader-args");
  });

  it("lit les lignes de progression, de format et de fichier", () => {
    expect(parseProgressLine("[sxm-progress] downloading 1048576 4194304 NA")).toEqual({ status: "downloading", downloaded: 1048576, total: 4194304 });
    expect(parseProgressLine("[sxm-progress] downloading 2048 NA 8192.5")).toEqual({ status: "downloading", downloaded: 2048, total: 8192.5 });
    expect(parseProgressLine("[sxm-progress] finished 441518 441518 NA")).toMatchObject({ status: "finished", downloaded: 441518 });
    expect(parseProgressLine("[download] 10% of 1MiB")).toBeNull();
    expect(parseFormatLine("[sxm-format] 133+140 avc1.4D400C mp4a.40.2 312.791 742369 19")).toEqual({
      formatId: "133+140",
      vcodec: "avc1.4D400C",
      acodec: "mp4a.40.2",
      tbr: 312.791,
      filesizeApprox: 742369,
      duration: 19,
    });
    expect(parseFormatLine("[sxm-format] 1080 NA NA NA NA 26")).toMatchObject({ formatId: "1080", vcodec: undefined, duration: 26 });
    expect(parseFileLine("[sxm-file] C:\\tmp\\job\\source.mp4")).toBe("C:\\tmp\\job\\source.mp4");
    expect(parseFileLine("autre chose")).toBeNull();
  });

  it("reconnaît les refus de YouTube et les dit en français", () => {
    const bot = "ERROR: [youtube] abc: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication.";
    expect(classifyYtDlpError(bot)).toBe("bot-check");
    expect(ytDlpErrorMessage("bot-check", { hasCookies: false })).toContain("cookies YouTube");
    expect(ytDlpErrorMessage("bot-check", { hasCookies: false })).toContain("envoyez le fichier");
    expect(ytDlpErrorMessage("bot-check", { hasCookies: true })).toContain("renouveler");
    expect(classifyYtDlpError("ERROR: [youtube] abc: The provided YouTube account cookies are no longer valid.")).toBe("cookies-invalid");
    expect(classifyYtDlpError("ERROR: [youtube] abc: Sign in to confirm your age.")).toBe("age");
    expect(classifyYtDlpError("ERROR: [youtube] abc: Private video. Sign in if you've been granted access")).toBe("private");
    expect(classifyYtDlpError("ERROR: [youtube] abc: Video unavailable")).toBe("unavailable");
    expect(classifyYtDlpError("ERROR: [generic] Unsupported URL: https://x")).toBe("unsupported");
    expect(classifyYtDlpError("ERROR: oups")).toBe("unknown");
  });

  it("lit les métadonnées et choisit une vignette de 640 px au plus", () => {
    const info = parseInfoJson(
      JSON.stringify({
        id: "abc",
        title: "  Mon   titre ",
        uploader: "Chaîne",
        duration: 125.4,
        extractor_key: "Youtube",
        webpage_url: "https://www.youtube.com/watch?v=abc",
        thumbnails: [
          { url: "https://i.ytimg.com/a.jpg", width: 120 },
          { url: "https://i.ytimg.com/b.jpg", width: 480 },
          { url: "https://i.ytimg.com/c.jpg", width: 1280 },
          { url: "http://insecure/d.jpg", width: 640 },
        ],
      })
    );
    expect(info).toMatchObject({ title: "Mon titre", uploader: "Chaîne", duration: 125.4, thumbnail: "https://i.ytimg.com/b.jpg", isLive: false });
    expect(parseInfoJson(JSON.stringify({ title: "Direct", live_status: "is_live" })).isLive).toBe(true);
    expect(pickThumbnail([], "https://static-cdn.jtvnw.net/x.jpg")).toBe("https://static-cdn.jtvnw.net/x.jpg");
  });
});

describe("mise au format", () => {
  const hevc = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'source.mp4':
  Duration: 00:00:10.05, start: 0.000000, bitrate: 3316 kb/s
  Stream #0:0[0x1](und): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 2920 kb/s, 60 fps, 60 tbr, 15360 tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 130 kb/s (default)`;
  const h264 = `  Duration: 00:00:09.13, start: 0.000000, bitrate: 386 kb/s
  Stream #0:0[0x1](und): Video: h264 (Main) (avc1 / 0x31637661), yuv420p(tv, smpte170m/bt470bg/bt709, progressive), 320x240 [SAR 1:1 DAR 4:3], 192 kb/s, 15 fps
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 127 kb/s (default)`;

  it("lit les flux d'un fichier", () => {
    expect(parseMediaStreams(hevc)).toEqual({
      durationSec: 10.05,
      width: 1920,
      height: 1080,
      video: { codec: "hevc", pixFmt: "yuv420p", attached: false },
      audio: { codec: "aac" },
    });
    expect(parseMediaStreams(h264.replace(/\n.*Audio.*$/m, "")).audio).toBeUndefined();
  });

  it("réencode le HEVC en H.264, garde le H.264 et l'AAC tels quels", () => {
    expect(conversionPlan(parseMediaStreams(hevc))).toEqual({ video: true, audio: false });
    expect(conversionPlan(parseMediaStreams(h264))).toEqual({ video: false, audio: false });
    expect(conversionPlan(parseMediaStreams(h264.replace("Audio: aac", "Audio: opus")))).toEqual({ video: false, audio: true });
    expect(conversionPlan(parseMediaStreams(h264.replace("yuv420p(", "yuv420p10le(")))).toMatchObject({ video: true });
    // Portrait 1080 × 1920 : le petit côté reste à 1080, rien à réduire.
    expect(conversionPlan(parseMediaStreams(h264.replace("320x240", "1080x1920")))).toMatchObject({ video: false });
    expect(conversionPlan(parseMediaStreams(h264.replace("320x240", "2560x1440")))).toMatchObject({ video: true });

    const args = finalizeArgs("in.mp4", "out.mp4", parseMediaStreams(hevc));
    expect(args).toContain("libx264");
    expect(args[args.indexOf("-c:a") + 1]).toBe("copy");
    expect(args.at(-1)).toBe("out.mp4");
    const copy = finalizeArgs("in.mkv", "out.mp4", parseMediaStreams(h264), { start: 5, end: 65 });
    expect(copy[copy.indexOf("-c:v") + 1]).toBe("copy");
    expect(copy.slice(copy.indexOf("-ss"), copy.indexOf("-ss") + 2)).toEqual(["-ss", "5"]);
    expect(copy[copy.indexOf("-t") + 1]).toBe("60");
  });

  it("borne la taille écrite et ne lit un lien direct que comme fichier local, dans un conteneur attendu", () => {
    const streams = parseMediaStreams(hevc);
    const args = finalizeArgs("in.mp4", "out.mp4", streams, undefined, { maxBytes: 524_288_000, untrustedInput: true });
    expect(args[args.indexOf("-fs") + 1]).toBe("524288000");
    expect(args.indexOf("-fs")).toBeGreaterThan(args.indexOf("-i"));
    expect(args.slice(0, args.indexOf("-i"))).toEqual(expect.arrayContaining(UNTRUSTED_INPUT_ARGS));
    expect(args[args.indexOf("-protocol_whitelist") + 1]).toBe("file");
    expect(args[args.indexOf("-format_whitelist") + 1]).toBe("mov,mp4,m4a,3gp,3g2,mj2,matroska,webm");
    const plain = finalizeArgs("in.mp4", "out.mp4", streams);
    expect(plain).not.toContain("-fs");
    expect(plain).not.toContain("-protocol_whitelist");
  });

  it("écrit la mention « titre – auteur, site »", () => {
    expect(remoteCredit("Mon clip", "ZeratoR", "Twitch")).toBe("Mon clip – ZeratoR, Twitch");
    expect(remoteCredit("Fichier", undefined, "cdn.example.com")).toBe("Fichier, cdn.example.com");
  });
});

describe("cookies YouTube", () => {
  const line = (domain: string) => [domain, "TRUE", "/", "TRUE", "1999999999", "SID", "valeur"].join("\t");

  it("accepte un export Netscape et n'en garde que les cookies de youtube.com", () => {
    const text = [
      "# Netscape HTTP Cookie File",
      "# commentaire",
      line(".youtube.com"),
      `#HttpOnly_${line(".google.com")}`,
      `#HttpOnly_${line("www.youtube.com")}`,
      line(".accounts.google.com"),
      line("youtube.com.example.org"),
      line(".notyoutube.com"),
      line("music.youtube.com"),
    ].join("\r\n");
    expect(normalizeCookies(text)).toBe(
      `# Netscape HTTP Cookie File\n${line(".youtube.com")}\n#HttpOnly_${line("www.youtube.com")}\n${line("music.youtube.com")}\n`
    );
  });

  it("refuse un export sans aucun cookie de youtube.com, même s'il en a d'autres", () => {
    expect(() => normalizeCookies([line(".google.com"), `#HttpOnly_${line(".bank.example")}`].join("\n"))).toThrow("Aucun cookie de youtube.com");
  });

  it("refuse un fichier vide, d'un autre format ou sans YouTube", () => {
    expect(() => normalizeCookies("")).toThrow("vide");
    expect(() => normalizeCookies('{"cookies": []}')).toThrow("Netscape");
    expect(() => normalizeCookies(line(".example.com"))).toThrow("youtube.com");
    expect(() => normalizeCookies(42)).toThrow("invalide");
  });
});

describe("instants", () => {
  it("écrit et relit les instants", () => {
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(3723)).toBe("1:02:03");
    expect(parseClock("1:05")).toBe(65);
    expect(parseClock("1:02:03")).toBe(3723);
    expect(parseClock("75")).toBe(75);
    expect(parseClock("1m15s")).toBe(75);
    expect(parseClock("1:75")).toBeNull();
    expect(parseClock("abc")).toBeNull();
  });
});

describe("ménage des médias récupérés", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 9, 18);
  const remote = (file: string, lastUsedAt: number) => ({
    file,
    kind: "video",
    originalName: file,
    size: 1,
    origin: { site: "youtube", url: "https://www.youtube.com/watch?v=abcdefghijk" },
    lastUsedAt,
    createdAt: lastUsedAt,
  });

  beforeEach(() => {
    store.assets = [
      remote("remote-old.mp4", now - 40 * day),
      remote("remote-used.mp4", now - 40 * day),
      remote("remote-recent.mp4", now - 5 * day),
      { file: "upload-old.mp4", kind: "video", originalName: "x", size: 1, createdAt: now - 400 * day },
    ];
    store.projects = [
      { tracks: [{ items: [{ type: "video", source: { url: "/api/modules/clip-studio/data/assets/remote-used.mp4" } }] }] },
    ];
  });

  it("efface ce qu'aucun projet n'utilise depuis 30 jours, et seulement les médias récupérés", () => {
    expect(sweepRemoteAssets(now, { force: true })).toEqual(["remote-old.mp4"]);
    expect(store.assets.map((asset) => asset.file)).toEqual(["remote-used.mp4", "remote-recent.mp4", "upload-old.mp4"]);
    // Un média utilisé repart pour 30 jours.
    expect(store.assets[0].lastUsedAt).toBe(now);
  });
});

describe("téléchargement réel (yt-dlp présent seulement)", () => {
  const ready = Boolean(ytDlpPath() && ffmpegPath()) && process.env.SXM_SKIP_NETWORK !== "1";

  it.skipIf(!ready)(
    "récupère cinq secondes d'un clip Twitch public",
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sxm-ytdlp-"));
      try {
        const result = await downloadSection("https://clips.twitch.tv/CrypticConfidentWoodcockDatSheffy-7bIqt_3zwrUM0MP9", { start: 2, end: 7 }, dir, {
          maxBytes: 200 * 1024 * 1024,
          timeoutMs: 120_000,
        });
        expect(fs.statSync(result.file).size).toBeGreaterThan(10_000);
        expect(path.dirname(result.file)).toBe(path.resolve(dir));
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
    180_000
  );
});
