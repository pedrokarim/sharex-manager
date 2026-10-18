import { describe, expect, it } from "vitest";
import {
  VIDEO_SOUND_TRACK,
  addItem,
  createAudioItem,
  createProject,
  createVideoItem,
  detachVideoAudio,
  duplicateItem,
  findItem,
  linkedItem,
  moveItem,
  reattachVideoAudio,
  removeItem,
  setVideoSpeed,
  splitItem,
  trimItem,
  updateItem,
} from "@/modules/clip-studio/engine/edit";
import { audioSignature, canDuck, gainPoints, isAudible, voiceWindows } from "@/modules/clip-studio/engine/mix";
import { applyGainEnvelope } from "@/modules/clip-studio/engine/preview";
import { sourceTimeAt } from "@/modules/clip-studio/engine/timeline";
import type { AudioItem, ClipItem, ClipProject, MediaSource, VideoItem } from "@/modules/clip-studio/engine/types";

// Dossier 01 bis, V1 : le son des vidéos se coupe, s'efface sous la voix, a
// ses fondus, et se détache sur une piste audio sans jamais se décaler.

const FPS = 30;
const videoSource: MediaSource = { url: "/test/plan.mp4", ref: "test:plan", name: "Plan d’essai", kind: "video", durationMs: 20_000 };
const voiceSource: MediaSource = {
  url: "/test/voix.wav",
  ref: "test:voix",
  name: "Voix d’essai",
  kind: "audio",
  durationMs: 2000,
  words: [{ text: "Bonjour", startMs: 0, endMs: 600 }],
  speech: { text: "Bonjour", voice: "test" },
};

/** Faux paramètre de gain : garde les appels, dans l'ordre. */
function fakeParam() {
  const calls: [string, number, number][] = [];
  const param = {
    setValueAtTime: (value: number, time: number) => calls.push(["set", value, time]),
    linearRampToValueAtTime: (value: number, time: number) => calls.push(["ramp", value, time]),
  } as unknown as AudioParam;
  return { param, calls };
}

function video(patch: Partial<VideoItem> = {}): VideoItem {
  return { ...createVideoItem(videoSource, 0, FPS), id: "v1", duration: 4 * FPS, volume: 0.8, ...patch };
}

/** Projet avec une vidéo sur la piste principale et une voix off de 2 à 4 s. */
function withVoice(item: VideoItem): ClipProject {
  const project = createProject("Son", "16:9");
  const spoken: AudioItem = { ...createAudioItem(voiceSource, 0, FPS), id: "voix", start: 2 * FPS, duration: 2 * FPS, volume: 0.9 };
  return {
    ...project,
    tracks: [
      { id: "principale", kind: "visual", name: "Principale", items: [item] },
      { id: "piste-voix", kind: "audio", name: "Voix", items: [spoken] },
    ],
  };
}

const itemById = (project: ClipProject, id: string) => findItem(project, id)?.item as ClipItem;
const allItems = (project: ClipProject) => project.tracks.flatMap((track) => track.items);

describe("son d'une vidéo au mixage", () => {
  it("se coupe sans perdre le volume, et se tait sans piste son ou une fois détaché", () => {
    expect(isAudible(video())).toBe(true);
    expect(isAudible(video({ muted: true }))).toBe(false);
    expect(isAudible(video({ audioLinkId: "a1" }))).toBe(false);
    expect(isAudible(video({ source: { ...videoSource, hasAudio: false } }))).toBe(false);
    expect(isAudible(video({ volume: 0 }))).toBe(false);

    const { param, calls } = fakeParam();
    applyGainEnvelope(param, video({ muted: true }), 1, FPS, []);
    expect(calls).toEqual([["set", 0, 1]]);
  });

  it("applique ses fondus d'entrée et de sortie, comme un son", () => {
    const { param, calls } = fakeParam();
    applyGainEnvelope(param, video({ fadeIn: FPS, fadeOut: FPS / 2 }), 10, FPS, []);
    expect(calls).toEqual([
      ["set", 0, 10],
      ["ramp", 0.8, 11],
      ["set", 0.8, 13.5],
      ["ramp", 0, 14],
    ]);
  });

  it("garde l'enveloppe d'avant sans fondu ni creux", () => {
    const { param, calls } = fakeParam();
    applyGainEnvelope(param, video(), 0, FPS, [[1, 2]]);
    expect(calls).toEqual([["set", 0.8, 0]]);
  });

  it("s'efface sous la voix off, à la profondeur réglée, fondus compris", () => {
    const ducked = video({ duck: 0.25, fadeIn: FPS });
    const project = withVoice(ducked);
    const windows = voiceWindows(project);
    expect(windows).toEqual([[2, 4]]);
    const points = gainPoints(ducked, FPS, windows);
    const at = (t: number) => points.find(([time]) => Math.abs(time - t) < 1e-9)?.[1];
    expect(at(0)).toBe(0);
    expect(at(1)).toBeCloseTo(0.8, 6);
    expect(at(2)).toBeCloseTo(0.2, 6);
    expect(at(4)).toBeCloseTo(0.2, 6);

    // L'aperçu et l'export programment ces mêmes points.
    const { param, calls } = fakeParam();
    applyGainEnvelope(param, ducked, 0, FPS, windows);
    expect(calls[0]).toEqual(["set", 0, 0]);
    expect(calls.some(([kind, value, time]) => kind === "ramp" && Math.abs(value - 0.2) < 1e-6 && Math.abs(time - 2) < 1e-9)).toBe(true);
  });

  it("peut s'effacer, mais une voix ne s'efface jamais, et une vidéo ne compte pas comme voix", () => {
    const project = withVoice(video());
    expect(canDuck(video(), "Principale")).toBe(true);
    expect(canDuck(itemById(project, "voix"), "Voix")).toBe(false);
    expect(voiceWindows(withVoice(video({ volume: 1 })))).toEqual([[2, 4]]);
  });

  it("change l'empreinte du son quand on le coupe, le fond ou l'efface", () => {
    const base = withVoice(video());
    const signature = audioSignature(base);
    expect(audioSignature(updateItem(base, "v1", { muted: true } as Partial<ClipItem>))).not.toBe(signature);
    expect(audioSignature(updateItem(base, "v1", { fadeIn: 10 } as Partial<ClipItem>))).not.toBe(signature);
    expect(audioSignature(updateItem(base, "v1", { duck: 0.4 } as Partial<ClipItem>))).not.toBe(signature);
  });
});

// ─── Son détaché ─────────────────────────────────────────────────

/** Projet avec une vidéo (2 s à ×1,5, rognée) sur la piste principale, son détaché. */
function detached(patch: Partial<VideoItem> = {}) {
  const base = withVoice(video({ start: 30, trimStart: 15, speed: 1.5, fadeIn: 6, fadeOut: 9, duck: 0.3, ...patch }));
  const result = detachVideoAudio(base, "v1");
  return { base, project: result.project, audioId: result.audioId! };
}

describe("détacher le son d'une vidéo", () => {
  it("crée un son lié sur la piste « Son des vidéos », calé sur la vidéo, et rend la vidéo muette", () => {
    const { project, audioId } = detached({ muted: true });
    expect(audioId).toBeTruthy();
    const track = project.tracks.find((entry) => entry.items.some((item) => item.id === audioId))!;
    expect(track.kind).toBe("audio");
    expect(track.name).toBe(VIDEO_SOUND_TRACK);
    const audio = itemById(project, audioId) as AudioItem;
    const clip = itemById(project, "v1") as VideoItem;
    expect(audio).toMatchObject({ start: 30, duration: 4 * FPS, trimStart: 15, speed: 1.5, volume: 0.8, fadeIn: 6, fadeOut: 9, duck: 0.3, linkedVideoId: "v1" });
    expect(audio.source).toBe(clip.source);
    expect(clip.audioLinkId).toBe(audioId);
    expect(isAudible(clip)).toBe(false);
    expect(isAudible(audio)).toBe(true);
    expect(linkedItem(project, clip)?.item.id).toBe(audioId);
  });

  it("réutilise la piste « Son des vidéos » et ne détache pas deux fois", () => {
    const { project } = detached();
    expect(detachVideoAudio(project, "v1").audioId).toBeNull();
    const second: VideoItem = { ...video(), id: "v2", start: 10 * FPS };
    const next = detachVideoAudio(addItem(project, second, "principale"), "v2").project;
    expect(next.tracks.filter((track) => track.name === VIDEO_SOUND_TRACK)).toHaveLength(1);
  });

  it("refuse une vidéo sans son", () => {
    const base = withVoice(video({ source: { ...videoSource, hasAudio: false } }));
    expect(detachVideoAudio(base, "v1")).toEqual({ project: base, audioId: null });
  });

  it("se rattache depuis la vidéo ou depuis le son, avec les réglages du son, et la piste vide s'en va", () => {
    const { project, audioId } = detached();
    const tuned = updateItem(project, audioId, { volume: 0.5, fadeIn: 3, duck: 0.6 } as Partial<ClipItem>);
    for (const from of ["v1", audioId]) {
      const back = reattachVideoAudio(tuned, from);
      const clip = itemById(back, "v1") as VideoItem;
      expect(itemById(back, audioId)).toBeUndefined();
      expect(clip.audioLinkId).toBeUndefined();
      expect(clip).toMatchObject({ volume: 0.5, fadeIn: 3, fadeOut: 9, duck: 0.6 });
      expect(isAudible(clip)).toBe(true);
      expect(back.tracks.some((track) => track.name === VIDEO_SOUND_TRACK)).toBe(false);
    }
  });

  it("efface un lien orphelin", () => {
    const orphan = withVoice(video({ audioLinkId: "a-disparu" }));
    expect((itemById(reattachVideoAudio(orphan, "v1"), "v1") as VideoItem).audioLinkId).toBeUndefined();
  });
});

describe("vidéo et son liés", () => {
  const pair = (project: ClipProject, audioId: string) => ({
    clip: itemById(project, "v1") as VideoItem,
    audio: itemById(project, audioId) as AudioItem,
  });

  it("se déplacent ensemble, depuis l'un comme depuis l'autre", () => {
    const { project, audioId } = detached();
    let moved = moveItem(project, "v1", 90);
    expect(pair(moved, audioId).audio.start).toBe(90);
    moved = moveItem(moved, audioId, 120);
    expect(pair(moved, audioId).clip.start).toBe(120);
  });

  it("refusent un déplacement où le son chevaucherait un autre son", () => {
    const { project, audioId } = detached();
    const soundTrack = project.tracks.find((track) => track.name === VIDEO_SOUND_TRACK)!;
    const blocker: AudioItem = { ...createAudioItem(voiceSource, 400, FPS), id: "gene", duration: 60 };
    const blocked = { ...project, tracks: project.tracks.map((track) => (track.id === soundTrack.id ? { ...track, items: [...track.items, blocker] } : track)) };
    expect(moveItem(blocked, "v1", 380)).toBe(blocked);
    expect(pair(moveItem(blocked, "v1", 200), audioId).audio.start).toBe(200);
  });

  it("se rognent ensemble, sans décalage dans la source", () => {
    const { project, audioId } = detached();
    const trimmed = trimItem(trimItem(project, "v1", "start", 60), audioId, "end", 120);
    const { clip, audio } = pair(trimmed, audioId);
    expect(clip.start).toBe(60);
    expect(clip.trimStart).toBe(15 + 45);
    expect(clip.start + clip.duration).toBe(120);
    expect(audio).toMatchObject({ start: clip.start, duration: clip.duration, trimStart: clip.trimStart });
  });

  it("se scindent ensemble ; les moitiés de droite sont liées entre elles", () => {
    const { project, audioId } = detached();
    const cut = splitItem(project, "v1", 60);
    const videos = allItems(cut).filter((item): item is VideoItem => item.type === "video");
    const sounds = allItems(cut).filter((item): item is AudioItem => item.type === "audio" && item.source.url === videoSource.url);
    expect(videos).toHaveLength(2);
    expect(sounds).toHaveLength(2);
    for (const half of videos) {
      const partner = linkedItem(cut, half)!.item as AudioItem;
      expect(partner).toMatchObject({ start: half.start, duration: half.duration, trimStart: half.trimStart, linkedVideoId: half.id });
    }
    const right = videos.find((item) => item.start === 60)!;
    expect(right.trimStart).toBe(15 + 45);
    expect(sourceTimeAt(right, 70, FPS)).toBeCloseTo(sourceTimeAt(itemById(project, "v1") as VideoItem, 70, FPS));
    // Coupe franche : pas de fondu au milieu.
    const rightSound = linkedItem(cut, right)!.item as AudioItem;
    expect(rightSound.fadeIn).toBe(0);
    expect((itemById(cut, audioId) as AudioItem).fadeOut).toBe(0);
    expect(rightSound.fadeOut).toBe(9);
  });

  it("se suppriment ensemble", () => {
    const { project, audioId } = detached();
    for (const from of ["v1", audioId]) {
      const removed = removeItem(project, from);
      expect(itemById(removed, "v1")).toBeUndefined();
      expect(itemById(removed, audioId)).toBeUndefined();
      expect(itemById(removed, "voix")).toBeDefined();
    }
  });

  it("changent de vitesse ensemble", () => {
    const { project, audioId } = detached();
    const faster = setVideoSpeed(project, "v1", 3);
    const { clip, audio } = pair(faster, audioId);
    expect(clip.speed).toBe(3);
    expect(clip.duration).toBe(2 * FPS);
    expect(audio.speed).toBe(3);
    expect(audio.duration).toBe(clip.duration);
    const normal = pair(setVideoSpeed(faster, "v1", 1), audioId).audio;
    expect(normal.speed).toBeUndefined();
  });

  it("se dupliquent en une nouvelle paire liée", () => {
    const { project, audioId } = detached();
    const { project: copied, id } = duplicateItem(project, "v1");
    const copy = itemById(copied, id) as VideoItem;
    const copySound = linkedItem(copied, copy)!.item as AudioItem;
    expect(copySound.id).not.toBe(audioId);
    expect(copySound.linkedVideoId).toBe(id);
    expect(copySound.start).toBe(copy.start);
    // La paire d'origine garde son lien.
    expect(linkedItem(copied, itemById(copied, "v1"))?.item.id).toBe(audioId);
  });
});
