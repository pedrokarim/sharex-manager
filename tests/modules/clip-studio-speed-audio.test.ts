import { describe, expect, it } from "vitest";
import { createProject, createVideoItem, addItem, setVideoSpeed, splitItem } from "@/modules/clip-studio/engine/edit";
import { sourceTimeAt, speedOf } from "@/modules/clip-studio/engine/timeline";
import { normalizeLoudness } from "@/modules/clip-studio/engine/export";
import type { ClipProject, VideoItem } from "@/modules/clip-studio/engine/types";

const source = { url: "/api/files/clip.mp4", ref: "upload:clip.mp4", name: "clip.mp4", kind: "video" as const, durationMs: 20_000 };

function projectWith(...starts: number[]): { project: ClipProject; ids: string[] } {
  let project = createProject("Vitesse", "16:9");
  const ids: string[] = [];
  for (const start of starts) {
    const item = createVideoItem(source, start, project.fps);
    item.duration = 60;
    project = addItem(project, item);
    ids.push(item.id);
  }
  return { project, ids };
}

const videoById = (project: ClipProject, id: string) =>
  project.tracks.flatMap((track) => track.items).find((item) => item.id === id) as VideoItem;

describe("vitesse d'une vidéo", () => {
  it("lit la source plus vite ou plus lentement", () => {
    const item = { start: 30, trimStart: 60, speed: 2 };
    expect(sourceTimeAt(item, 30, 30)).toBe(2);
    expect(sourceTimeAt(item, 60, 30)).toBe(4);
    expect(sourceTimeAt({ ...item, speed: 0.5 }, 60, 30)).toBe(2.5);
  });

  it("borne les vitesses aberrantes", () => {
    expect(speedOf({})).toBe(1);
    expect(speedOf({ speed: 0 })).toBe(1);
    expect(speedOf({ speed: 100 })).toBe(4);
    expect(speedOf({ speed: 0.01 })).toBe(0.25);
  });

  it("garde le même passage de la source : ×2 divise la durée par deux", () => {
    const { project, ids } = projectWith(0);
    const faster = videoById(setVideoSpeed(project, ids[0], 2), ids[0]);
    expect(faster.speed).toBe(2);
    expect(faster.duration).toBe(30);
  });

  it("ne déborde pas sur le plan suivant en ralentissant", () => {
    const { project, ids } = projectWith(0, 60);
    const slower = videoById(setVideoSpeed(project, ids[0], 0.5), ids[0]);
    expect(slower.duration).toBe(60);
  });

  it("scinde au bon endroit de la source", () => {
    const { project, ids } = projectWith(0);
    const fast = setVideoSpeed(project, ids[0], 2);
    const halves = splitItem(fast, ids[0], 10).tracks.flatMap((track) => track.items) as VideoItem[];
    const right = halves.find((item) => item.start === 10)!;
    expect(right.trimStart).toBe(20);
    expect(sourceTimeAt(right, 10, 30)).toBeCloseTo(sourceTimeAt(videoById(fast, ids[0]), 10, 30));
  });
});

/** Faux AudioBuffer, suffisant pour la normalisation. */
function fakeBuffer(samples: number[][], sampleRate = 1000) {
  const data = samples.map((channel) => Float32Array.from(channel));
  return {
    numberOfChannels: data.length,
    length: data[0].length,
    sampleRate,
    getChannelData: (index: number) => data[index],
  } as unknown as AudioBuffer;
}

describe("normalisation du volume", () => {
  it("remonte un mixage trop faible vers −16 dB", () => {
    const quiet = Array.from({ length: 2000 }, (_, index) => 0.02 * Math.sin(index / 3));
    const buffer = fakeBuffer([quiet]);
    const gain = normalizeLoudness(buffer);
    expect(gain).toBeGreaterThan(5);
    const data = buffer.getChannelData(0);
    const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
    expect(20 * Math.log10(rms)).toBeGreaterThan(-20);
  });

  it("ne fait jamais saturer : la crête reste sous −1 dB", () => {
    const spiky = Array.from({ length: 2000 }, (_, index) => (index === 500 ? 0.5 : 0.01));
    const buffer = fakeBuffer([spiky]);
    normalizeLoudness(buffer);
    const peak = Math.max(...buffer.getChannelData(0).map(Math.abs));
    expect(peak).toBeLessThanOrEqual(Math.pow(10, -1 / 20) + 1e-6);
  });

  it("laisse le silence tel quel", () => {
    const buffer = fakeBuffer([new Array(1000).fill(0)]);
    expect(normalizeLoudness(buffer)).toBe(1);
  });
});
