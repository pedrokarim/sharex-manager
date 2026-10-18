import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { createAudioItem, createImageItem } from "@/modules/clip-studio/engine/edit";
import {
  DEFAULT_DUCK,
  DUCK_DB_MAX,
  DUCK_DB_MIN,
  audioSignature,
  canDuck,
  decibelsToDuck,
  duckToDecibels,
  gainPoints,
  setTrackDuck,
  voiceWindows,
} from "@/modules/clip-studio/engine/mix";
import { drawFrame } from "@/modules/clip-studio/engine/render";
import type { AudioItem, ClipProject, ImageItem, MediaSource } from "@/modules/clip-studio/engine/types";
import { MUSIC_UNDER_VOICE } from "@/modules/clip-studio/lib/assistant";

// Réglages de l'inspecteur (dossier 07 sexies, D3) : le miroir d'une image et
// le creux d'une musique sous la voix, appliqués par le moteur commun à
// l'aperçu et à l'export.

const W = 160;
const H = 90;
const FPS = 30;

function project(tracks: ClipProject["tracks"]): ClipProject {
  return { version: 1, id: "projet", name: "Réglages", aspect: "16:9", width: W, height: H, fps: FPS, background: "#000000", tracks, createdAt: 0, updatedAt: 0 };
}

// ─── Miroir ──────────────────────────────────────────────────────

/** Image moitié rouge à gauche, moitié bleue à droite. */
function halves() {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, W / 2, H);
  ctx.fillStyle = "#0000ff";
  ctx.fillRect(W / 2, 0, W / 2, H);
  return canvas;
}

function pixelAt(item: ImageItem, x: number, y: number): [number, number, number] {
  const source = halves();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  drawFrame(ctx as unknown as CanvasRenderingContext2D, project([{ id: "v", kind: "visual", name: "Principale", items: [item] }]), 10, () => source as unknown as CanvasImageSource);
  const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
  return [r, g, b];
}

const imageSource: MediaSource = { url: "/test/moities.png", ref: "test:moities", name: "moitiés", kind: "image", width: W, height: H };

describe("miroir d'une image", () => {
  const still = (): ImageItem => ({ ...createImageItem(imageSource, 0, FPS), motion: "none", animIn: { kind: "none", frames: 0 } });

  it("retourne l'image dans son cadre, au rendu commun de l'aperçu et de l'export", () => {
    const plain = still();
    expect(pixelAt(plain, 10, H / 2)).toEqual([255, 0, 0]);
    expect(pixelAt(plain, W - 10, H / 2)).toEqual([0, 0, 255]);
    const flipped = { ...plain, flipX: true };
    expect(pixelAt(flipped, 10, H / 2)).toEqual([0, 0, 255]);
    expect(pixelAt(flipped, W - 10, H / 2)).toEqual([255, 0, 0]);
  });
});

// ─── Creux sous la voix ──────────────────────────────────────────

const musicSource: MediaSource = { url: "/test/musique.mp3", ref: "test:musique", name: "Musique d’essai", kind: "audio", durationMs: 20000 };
const voiceSource: MediaSource = {
  url: "/test/voix.wav",
  ref: "test:voix",
  name: "Voix d’essai",
  kind: "audio",
  durationMs: 2000,
  words: [{ text: "Bonjour", startMs: 0, endMs: 600 }],
  speech: { text: "Bonjour", voice: "test" },
};

function mixed() {
  const first: AudioItem = { ...createAudioItem(musicSource, 0, FPS), id: "m1", duration: 5 * FPS, fadeIn: 0, fadeOut: 0, volume: 0.5 };
  const second: AudioItem = { ...first, id: "m2", start: 5 * FPS };
  const spoken: AudioItem = { ...createAudioItem(voiceSource, 0, FPS), id: "v1", start: 2 * FPS, duration: 2 * FPS, volume: 0.9 };
  return project([
    { id: "voix", kind: "audio", name: "Voix", items: [spoken] },
    { id: "musique", kind: "audio", name: "Musique", items: [first, second] },
  ]);
}

const music = (clip: ClipProject, id: string) => clip.tracks.flatMap((track) => track.items).find((item) => item.id === id) as AudioItem;

describe("creux sous la voix", () => {
  it("se règle en dB, borné, et part du creux de l'assistant", () => {
    expect(DEFAULT_DUCK).toBe(MUSIC_UNDER_VOICE.duck);
    expect(duckToDecibels(DEFAULT_DUCK)).toBeCloseTo(7.33, 1);
    expect(decibelsToDuck(12)).toBeCloseTo(0.251, 3);
    expect(duckToDecibels(decibelsToDuck(9))).toBeCloseTo(9, 6);
    expect(decibelsToDuck(1)).toBeCloseTo(10 ** (-DUCK_DB_MIN / 20), 6);
    expect(decibelsToDuck(80)).toBeCloseTo(10 ** (-DUCK_DB_MAX / 20), 6);
  });

  it("s'applique à tous les sons de la piste, jamais à une voix off", () => {
    const clip = mixed();
    const voiceTrack = clip.tracks[0];
    expect(canDuck(voiceTrack.items[0], voiceTrack.name)).toBe(false);
    // Un son ordinaire posé sur une piste « Voix » reste une voix.
    expect(canDuck(music(clip, "m1"), "Voix 2")).toBe(false);
    expect(canDuck(music(clip, "m1"), "Musique")).toBe(true);

    const ducked = setTrackDuck(clip, "musique", decibelsToDuck(12));
    expect(music(ducked, "m1").duck).toBeCloseTo(0.251, 3);
    expect(music(ducked, "m2").duck).toBeCloseTo(0.251, 3);
    expect(music(ducked, "v1").duck).toBeUndefined();
    // Une piste de voix n'est jamais touchée.
    expect(setTrackDuck(clip, "voix", 0.5).tracks[0].items[0]).toEqual(clip.tracks[0].items[0]);

    const cleared = setTrackDuck(ducked, "musique", undefined);
    expect("duck" in music(cleared, "m1")).toBe(false);
    expect("duck" in music(cleared, "m2")).toBe(false);
  });

  it("fait réellement baisser la musique pendant que la voix parle, à la profondeur réglée", () => {
    const ducked = setTrackDuck(mixed(), "musique", decibelsToDuck(12));
    const windows = voiceWindows(ducked);
    expect(windows).toEqual([[2, 4]]);
    const points = gainPoints(music(ducked, "m1"), FPS, windows);
    const at = (t: number) => points.find(([time]) => Math.abs(time - t) < 1e-9)?.[1];
    expect(at(0)).toBeCloseTo(0.5, 6);
    expect(at(2)).toBeCloseTo(0.5 * 0.251, 3);
    expect(at(4)).toBeCloseTo(0.5 * 0.251, 3);
    expect(at(5)).toBeCloseTo(0.5, 6);
    // Sans creux, l'enveloppe ne bouge pas.
    const plain = gainPoints(music(mixed(), "m1"), FPS, windows);
    expect(plain.every(([, gain]) => gain === 0.5)).toBe(true);
  });

  it("change l'empreinte du son, pour que l'aperçu en lecture le reprogramme ; pas un réglage visuel", () => {
    const clip = mixed();
    const ducked = setTrackDuck(clip, "musique", DEFAULT_DUCK);
    expect(audioSignature(ducked)).not.toBe(audioSignature(clip));
    expect(audioSignature(setTrackDuck(ducked, "musique", decibelsToDuck(15)))).not.toBe(audioSignature(ducked));
    // Une image ajoutée, puis retournée en miroir : rien ne change à ce qui s'entend.
    const picture = createImageItem(imageSource, 0, FPS);
    const withImage = { ...clip, tracks: [...clip.tracks, { id: "v", kind: "visual" as const, name: "Principale", items: [picture] }] };
    expect(audioSignature(withImage)).toBe(audioSignature(clip));
    const mirrored = { ...withImage, tracks: withImage.tracks.map((track) => (track.id === "v" ? { ...track, items: [{ ...picture, flipX: true }] } : track)) };
    expect(audioSignature(mirrored)).toBe(audioSignature(clip));
  });
});
