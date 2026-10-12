import { describe, expect, it } from "vitest";
import { applyVoiceReplacements, isVoiceTrack, voiceItemsOf } from "@/modules/clip-studio/engine/revoice";
import type { AudioItem, ClipProject, MediaSource, TextItem, TimedWord } from "@/modules/clip-studio/engine/types";
import { CAPTION_STYLE } from "@/modules/clip-studio/engine/edit";

const FPS = 30;

function source(name: string, durationMs: number, words: TimedWord[], text = name): MediaSource {
  return {
    url: `/api/modules/clip-studio/data/assets/${name}.wav`,
    ref: `module:clip-studio/assets/${name}.wav`,
    name: `Voix Siwis : ${text}`,
    kind: "audio",
    durationMs,
    words,
    speech: { text, voice: "siwis" },
  };
}

function voice(id: string, start: number, src: MediaSource, trimStart = 0): AudioItem {
  return { id, type: "audio", start, duration: Math.round(((src.durationMs ?? 0) / 1000) * FPS), source: src, trimStart, volume: 0.9, fadeIn: 0, fadeOut: 0 };
}

function caption(id: string, voiceItem: AudioItem, start = voiceItem.start, offset = voiceItem.trimStart): TextItem {
  const words = voiceItem.source.words ?? [];
  return {
    id,
    type: "text",
    start,
    duration: voiceItem.duration,
    text: words.map((word) => word.text).join(" "),
    style: structuredClone(CAPTION_STYLE),
    karaoke: { words, offset, highlight: "#facc15", groupSize: 3, voiceId: voiceItem.id },
    transform: { x: 0.5, y: 0.8, width: 0.8, height: 0.16, rotation: 0, opacity: 1 },
    animIn: { kind: "none", frames: 6 },
    animOut: { kind: "none", frames: 6 },
  };
}

function project(): ClipProject {
  const first = voice("a-1", 30, source("one", 2000, [{ text: "Un,", startMs: 0, endMs: 400 }]));
  const second = voice("a-2", 150, source("two", 1000, [{ text: "Deux.", startMs: 0, endMs: 500 }]), 6);
  const third = voice("a-3", 240, source("three", 1000, [{ text: "Trois", startMs: 0, endMs: 500 }]));
  const splitA = caption("x-2a", second, 150, 6);
  const splitB = caption("x-2b", second, 165, 21);
  return {
    id: "clip-test",
    name: "Test",
    aspect: "9:16",
    width: 1080,
    height: 1920,
    fps: FPS,
    background: "#000000",
    tracks: [
      { id: "t-captions", kind: "visual", name: "Sous-titres", items: [caption("x-1", first), splitB, splitA] },
      // Ordre du tableau volontairement différent de l'ordre de la timeline.
      { id: "t-voice", kind: "audio", name: "Voix", items: [third, first, second] },
      { id: "t-music", kind: "audio", name: "Musique", items: [] },
    ],
    createdAt: 0,
    updatedAt: 0,
  } as unknown as ClipProject;
}

describe("changer la voix d'une piste", () => {
  it("liste les extraits de voix dans l'ordre de la timeline", () => {
    const value = project();
    expect(voiceItemsOf(value, "t-voice").map((item) => item.id)).toEqual(["a-1", "a-2", "a-3"]);
    expect(isVoiceTrack(value.tracks[1])).toBe(true);
    expect(isVoiceTrack(value.tracks[2])).toBe(false);
  });

  it("garde l'ordre et les départs, suit les nouvelles durées et recale les sous-titres liés", () => {
    const before = project();
    const longer = source("one-b", 3000, [
      { text: "Un,", startMs: 100, endMs: 500 },
      { text: "encore", startMs: 600, endMs: 1100 },
    ]);
    const shorter = source("two-b", 800, [{ text: "Deux.", startMs: 50, endMs: 450 }]);
    const { project: after, overlaps } = applyVoiceReplacements(before, "t-voice", [
      { itemId: "a-1", source: longer },
      { itemId: "a-2", source: shorter },
    ]);

    const voices = voiceItemsOf(after, "t-voice");
    expect(voices.map((item) => [item.id, item.start])).toEqual([
      ["a-1", 30],
      ["a-2", 150],
      ["a-3", 240],
    ]);
    expect(voices[0]).toMatchObject({ duration: 90, trimStart: 0, source: { ref: "module:clip-studio/assets/one-b.wav" } });
    expect(voices[1]).toMatchObject({ duration: 24, trimStart: 0 });
    // L'extrait non remplacé ne bouge pas.
    expect(voices[2]).toBe(before.tracks[1].items[0]);
    // 30 + 90 = 120 < 150 : pas d'empiètement.
    expect(overlaps).toBe(0);

    const captions = after.tracks[0].items as TextItem[];
    const first = captions.find((item) => item.id === "x-1")!;
    expect(first).toMatchObject({ start: 30, duration: 90, text: "Un, encore" });
    expect(first.karaoke).toMatchObject({ offset: 0, voiceId: "a-1", words: longer.words });
    // Sous-titre scindé : le morceau le plus tôt est gardé sur toute la voix, l'autre part.
    expect(captions.map((item) => item.id).sort()).toEqual(["x-1", "x-2a"]);
    expect(captions.find((item) => item.id === "x-2a")).toMatchObject({ start: 150, duration: 24, karaoke: { offset: 0, words: shorter.words } });
    // Le projet d'origine n'est pas modifié : l'annulation le retrouve tel quel.
    expect(before.tracks[0].items).toHaveLength(3);
    expect((before.tracks[1].items[1] as AudioItem).source.ref).toBe("module:clip-studio/assets/one.wav");
  });

  it("signale un extrait devenu plus long que l'écart avant le suivant", () => {
    const { overlaps } = applyVoiceReplacements(project(), "t-voice", [{ itemId: "a-2", source: source("two-c", 5000, [{ text: "Deux", startMs: 0, endMs: 300 }]) }]);
    expect(overlaps).toBe(1);
  });

  it("retire les sous-titres d'une voix relue sans mots horodatés", () => {
    const { project: after } = applyVoiceReplacements(project(), "t-voice", [{ itemId: "a-1", source: source("one-c", 1500, []) }]);
    expect(after.tracks[0].items.some((item) => item.id === "x-1")).toBe(false);
  });

  it("ne change rien sans remplacement", () => {
    const value = project();
    expect(applyVoiceReplacements(value, "t-voice", []).project).toBe(value);
  });
});
