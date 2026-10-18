import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Les données du module vivent dans un répertoire temporaire, jamais dans `modules/clip-studio/data`.
const state = vi.hoisted(() => ({
  assets: [] as any[],
  root: "",
  /** Sortie d'erreur que le faux ffmpeg écrit, et les arguments de chaque appel. */
  stderr: "",
  calls: [] as string[][],
}));

vi.mock("@/modules/clip-studio/lib/store", async () => {
  const nodeFs = await import("node:fs");
  const nodeOs = await import("node:os");
  const nodePath = await import("node:path");
  const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "sxm-clip-transcribe-"));
  state.root = root;
  const DATA_DIR = nodePath.join(root, "data");
  const ASSETS_DIR = nodePath.join(DATA_DIR, "assets");
  return {
    DATA_DIR,
    ASSETS_DIR,
    ensureDirs: () => nodeFs.mkdirSync(ASSETS_DIR, { recursive: true }),
    readAssets: () => state.assets.map((asset) => ({ ...asset })),
    writeAssets: (assets: unknown[]) => {
      state.assets = assets as any[];
    },
    listProjectFiles: () => [],
  };
});
vi.mock("@/lib/config", () => ({ getAbsoluteUploadPath: () => path.join(state.root, "uploads") }));
vi.mock("@/modules/clip-studio/lib/cloud-tts", () => ({ openAiApiKey: () => "sk-test-cle" }));
vi.mock("@/lib/media/ffmpeg", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media/ffmpeg")>()),
  ensureFfmpeg: async () => "ffmpeg",
}));
// Faux ffmpeg : décrit l'entrée (durée) puis s'arrête en erreur, comme `ffmpeg -i` sans sortie.
vi.mock("child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("child_process")>();
  const spawn = (_binary: string, args: string[]) => {
    state.calls.push(args);
    const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter; kill: () => boolean };
    child.stderr = new EventEmitter();
    child.kill = () => true;
    setTimeout(() => {
      child.stderr.emit("data", Buffer.from(state.stderr));
      child.emit("close", 1);
    }, 0);
    return child;
  };
  return { ...original, default: { ...original, spawn }, spawn };
});

import { MAX_TRANSCRIPTION_SECONDS, assertTranscribableDuration, transcribeMediaFile } from "@/modules/clip-studio/lib/transcribe";
import { RETRANSCRIBE_MIN_AGE_MS, startTranscriptionJob } from "@/modules/clip-studio/lib/transcription-jobs";
import { ASSETS_DIR } from "@/modules/clip-studio/lib/store";

const description = (duration: string) => `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/app/modules/clip-studio/data/assets/long.mp4':
  Duration: ${duration}, start: 0.000000, bitrate: 386 kb/s
  Stream #0:0[0x1](und): Video: h264 (Main) (avc1 / 0x31637661), yuv420p, 1280x720, 192 kb/s, 30 fps
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 127 kb/s (default)
At least one output file must be specified`;

describe("durée transcrite au plus", () => {
  beforeEach(() => {
    state.calls = [];
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
    fs.writeFileSync(path.join(ASSETS_DIR, "long.mp4"), "vidéo");
  });

  it("refuse au-delà de trois heures", () => {
    expect(MAX_TRANSCRIPTION_SECONDS).toBe(3 * 60 * 60);
    expect(() => assertTranscribableDuration(3 * 60 * 60)).not.toThrow();
    expect(() => assertTranscribableDuration(undefined)).not.toThrow();
    expect(() => assertTranscribableDuration(3 * 60 * 60 + 1)).toThrow(/dure plus de 3 h/);
  });

  it("lit la durée avant d'extraire le son, et n'extrait rien d'un média trop long", async () => {
    state.stderr = description("04:00:00.00");
    await expect(transcribeMediaFile(path.join(ASSETS_DIR, "long.mp4"))).rejects.toThrow(/dure plus de 3 h/);
    // Un seul appel : la lecture de la durée (`-i` sans sortie), aucune extraction.
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]).not.toContain("-vn");
    expect(fs.readdirSync(path.join(state.root, "data")).filter((name) => name.startsWith(".transcribe-tmp") || name === "tmp")).toEqual([]);
  });

  it("borne l'extraction quand la durée n'est pas annoncée, et ne montre pas le chemin du fichier", async () => {
    state.stderr = "/app/modules/clip-studio/data/assets/long.mp4: Invalid data found when processing input";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = await transcribeMediaFile(path.join(ASSETS_DIR, "long.mp4")).catch((caught: Error) => caught);
    log.mockRestore();
    expect(state.calls).toHaveLength(2);
    const extraction = state.calls[1];
    expect(extraction[extraction.indexOf("-t") + 1]).toBe(String(MAX_TRANSCRIPTION_SECONDS + 1));
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/^Extraction du son impossible/);
    expect((error as Error).message).not.toContain("/app/");
    // Dossier de travail caché, effacé après coup.
    expect(fs.readdirSync(path.join(state.root, "data", ".transcribe-tmp"))).toEqual([]);
  });

  it("refuse tout de suite un média de la bibliothèque plus long que trois heures", () => {
    state.assets = [{ file: "long.mp4", kind: "video", originalName: "long.mp4", size: 5, durationMs: 4 * 60 * 60 * 1000, createdAt: 1 }];
    expect(() => startTranscriptionJob({ assetId: "long.mp4" })).toThrow(/dure plus de 3 h/);
    expect(state.calls).toEqual([]);
  });
});

describe("transcription refaite", () => {
  beforeEach(() => {
    state.calls = [];
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
    fs.writeFileSync(path.join(ASSETS_DIR, "clip.mp4"), "vidéo");
  });

  const asset = (at: number) => ({
    file: "clip.mp4",
    kind: "video",
    originalName: "clip.mp4",
    size: 5,
    durationMs: 60_000,
    words: [{ text: "Bonjour", startMs: 0, endMs: 400 }],
    transcript: { provider: "openai", language: "fr", at },
    createdAt: 1,
  });

  it("refuse de refaire une transcription de moins de 24 h", () => {
    state.assets = [asset(Date.now() - 60 * 60 * 1000)];
    expect(() => startTranscriptionJob({ assetId: "clip.mp4", force: true })).toThrow(/moins de 24 h/);
    expect(state.calls).toEqual([]);
  });

  it("rend la transcription rangée sans `force`, quel que soit son âge", () => {
    state.assets = [asset(Date.now() - 60 * 1000)];
    const job = startTranscriptionJob({ assetId: "clip.mp4" });
    expect(job.status).toBe("done");
    expect(job.words).toHaveLength(1);
  });

  it("accepte de refaire une transcription plus ancienne", async () => {
    state.assets = [asset(Date.now() - RETRANSCRIBE_MIN_AGE_MS - 60_000)];
    state.stderr = description("00:01:00.00");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const job = startTranscriptionJob({ assetId: "clip.mp4", force: true });
    expect(job.status).toBe("running");
    // Le faux ffmpeg n'extrait rien : le travail finit en erreur, après avoir lu la durée.
    await new Promise((resolve) => setTimeout(resolve, 50));
    log.mockRestore();
    expect(state.calls.length).toBeGreaterThanOrEqual(1);
  });
});
