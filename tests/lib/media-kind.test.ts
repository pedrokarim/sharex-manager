import { describe, expect, it } from "vitest";
import { fileKind, formatDuration, maxVideoMb, mediaCountLabel, sniffVideo } from "@/lib/media-kind";
import { parseVideoInfo } from "@/lib/media/ffmpeg";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((part) => (typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : part)));

describe("fileKind", () => {
  it("distingue images, vidéos et autres fichiers", () => {
    expect(fileKind("a.PNG")).toBe("image");
    expect(fileKind("clip.mp4")).toBe("video");
    expect(fileKind("clip.webm")).toBe("video");
    expect(fileKind("notes.txt")).toBe("file");
  });
});

describe("sniffVideo", () => {
  it("reconnaît MP4, MOV et WebM par leur signature", () => {
    expect(sniffVideo(bytes([0, 0, 0, 0x20], "ftypisom", [0, 0]))).toBe("mp4");
    expect(sniffVideo(bytes([0, 0, 0, 0x14], "ftypqt  ", [0, 0]))).toBe("mov");
    expect(sniffVideo(bytes([0x1a, 0x45, 0xdf, 0xa3, 0, 0]))).toBe("webm");
  });

  it("refuse un fichier quelconque renommé en vidéo", () => {
    expect(sniffVideo(bytes("<html><body>"))).toBeNull();
    expect(sniffVideo(bytes([0x89], "PNG\r\n"))).toBeNull();
    expect(sniffVideo(new Uint8Array())).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formate minutes et heures", () => {
    expect(formatDuration(65_000)).toBe("1:05");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
    expect(formatDuration(undefined)).toBeNull();
  });
});

describe("maxVideoMb", () => {
  it("retombe sur 95 Mo pour une ancienne configuration", () => {
    expect(maxVideoMb({})).toBe(95);
    expect(maxVideoMb({ maxVideoSize: 250 })).toBe(250);
  });
});

describe("parseVideoInfo", () => {
  it("lit durée et dimensions dans la sortie de ffmpeg", () => {
    const stderr = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'clip.mp4':
  Duration: 00:00:12.48, start: 0.000000, bitrate: 2489 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1080x1920 [SAR 1:1 DAR 9:16], 2350 kb/s, 30 fps`;
    expect(parseVideoInfo(stderr)).toEqual({ durationMs: 12_480, width: 1080, height: 1920 });
  });

  it("ne renvoie rien d'inventé quand la sortie est vide", () => {
    expect(parseVideoInfo("")).toEqual({});
  });
});

describe("mediaCountLabel", () => {
  it("compte images et vidéos, au pluriel près", () => {
    expect(mediaCountLabel(["a.png"])).toBe("1 image");
    expect(mediaCountLabel(["a.png", "b.jpg"])).toBe("2 images");
    expect(mediaCountLabel(["c.mp4"])).toBe("1 vidéo");
    expect(mediaCountLabel(["a.png", "b.jpg", "c.mp4"])).toBe("2 images et 1 vidéo");
    expect(mediaCountLabel([])).toBe("0 image");
  });
});
