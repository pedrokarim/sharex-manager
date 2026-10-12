import fs from "fs";
import path from "path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipAsset } from "@/modules/clip-studio/engine/types";

const dataDir = vi.hoisted(() => {
  const nodeFs = require("fs") as typeof import("fs");
  const nodeOs = require("os") as typeof import("os");
  const nodePath = require("path") as typeof import("path");
  return nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "clip-samples-"));
});

const assets = vi.hoisted(() => ({ list: [] as ClipAsset[] }));

vi.mock("@/modules/clip-studio/lib/store", () => {
  const assetsDir = path.join(dataDir, "assets");
  return {
    DATA_DIR: dataDir,
    ASSETS_DIR: assetsDir,
    ensureDirs: () => fs.mkdirSync(assetsDir, { recursive: true }),
    readAssets: () => assets.list,
    writeAssets: (next: ClipAsset[]) => {
      assets.list = next;
    },
  };
});

// Voix d'Edge simulée : pas de réseau dans les tests.
const edgeSynth = vi.hoisted(() => vi.fn());
vi.mock("@/modules/clip-studio/lib/edge-tts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/clip-studio/lib/edge-tts")>()),
  synthesizeEdge: edgeSynth,
}));

/** WAV PCM 16 bits mono de `ms` millisecondes à 24 kHz. */
function wav(ms: number): Buffer {
  const samples = Math.round((24_000 * ms) / 1000);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0, "latin1");
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVEfmt ", 8, "latin1");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(24_000, 24);
  buffer.writeUInt32LE(48_000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "latin1");
  buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
}

// La conversion par ffmpeg écrit directement un WAV d'une seconde.
vi.mock("@/lib/media/ffmpeg", () => ({
  toPcmWav: async (_input: string, output: string) => fs.writeFileSync(output, wav(1000)),
}));

import { respeak, sampleSentence, speechTextOf, voiceSample } from "@/modules/clip-studio/lib/tts";
import { usageThisMonth } from "@/modules/clip-studio/lib/cloud-tts";

describe("extraits d'écoute et relecture d'une voix", () => {
  beforeEach(() => {
    edgeSynth.mockReset();
    edgeSynth.mockImplementation(async (_voice: string, text: string) => ({
      audio: Buffer.from([0xff, 0xf3, 0x44, 0x00]),
      words: text.split(" ").map((word, index) => ({ text: word, startMs: index * 300, endMs: index * 300 + 250 })),
    }));
    fs.rmSync(path.join(dataDir, "voice-samples"), { recursive: true, force: true });
    fs.rmSync(path.join(dataDir, "tts-usage.json"), { force: true });
    assets.list = [];
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  afterAll(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("choisit la phrase d'exemple dans la langue de la voix", () => {
    expect(sampleSentence("fr-FR")).toMatch(/^Bonjour/);
    expect(sampleSentence("en-US")).toMatch(/^Hello/);
    expect(sampleSentence("xx-YY")).toMatch(/^Hello/);
  });

  it("ne synthétise un extrait qu'une fois, puis le sert depuis le cache", async () => {
    const first = await voiceSample({ voice: "edge:fr-FR-DeniseNeural" });
    expect(first.cached).toBe(false);
    expect(first.url).toMatch(/^\/api\/modules\/clip-studio\/data\/voice-samples\/sample-[0-9a-f]{32}\.mp3$/);
    expect(fs.existsSync(path.join(dataDir, "voice-samples", first.url.split("/").pop()!))).toBe(true);
    expect(edgeSynth).toHaveBeenCalledTimes(1);
    expect(edgeSynth.mock.calls[0][1]).toMatch(/^Bonjour/);

    const second = await voiceSample({ voice: "edge:fr-FR-DeniseNeural" });
    expect(second).toEqual({ url: first.url, cached: true });
    expect(edgeSynth).toHaveBeenCalledTimes(1);
  });

  it("partage une synthèse en cours et sépare les réglages différents", async () => {
    const [a, b] = await Promise.all([
      voiceSample({ voice: "edge:en-US-AvaNeural", speed: 1.15 }),
      voiceSample({ voice: "edge:en-US-AvaNeural", speed: 1.15 }),
    ]);
    expect(a.url).toBe(b.url);
    expect(edgeSynth).toHaveBeenCalledTimes(1);
    expect(edgeSynth.mock.calls[0][1]).toMatch(/^Hello/);

    const slower = await voiceSample({ voice: "edge:en-US-AvaNeural", speed: 0.85 });
    expect(slower.url).not.toBe(a.url);
    expect(edgeSynth).toHaveBeenCalledTimes(2);
  });

  it("compte les extraits d'Azure dans le quota du mois, une seule fois", async () => {
    vi.stubEnv("AZURE_SPEECH_KEY", "k");
    vi.stubEnv("AZURE_SPEECH_REGION", "francecentral");
    const fetchMock = vi.fn(async () => new Response(new Uint8Array(wav(100)), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const sample = await voiceSample({ voice: "azure:fr-FR-HenriNeural" });
    expect(sample.url).toMatch(/\.wav$/);
    const counted = usageThisMonth("azure");
    expect(counted).toBe(sampleSentence("fr").length);
    await voiceSample({ voice: "azure:fr-FR-HenriNeural" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(usageThisMonth("azure")).toBe(counted);
  });

  it("refuse une voix inconnue ou une source non configurée", async () => {
    await expect(voiceSample({ voice: "inconnue" })).rejects.toThrow("Voix inconnue");
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(voiceSample({ voice: "openai:nova" })).rejects.toThrow("pas configurée");
  });

  it("retrouve le texte d'origine d'une voix : gardé, sinon ses mots, sinon son nom", () => {
    expect(speechTextOf({ originalName: "Voix X : court", speech: { text: "Texte complet.", voice: "siwis" } })).toBe("Texte complet.");
    expect(
      speechTextOf({ originalName: "Voix X : tronqu", words: [{ text: "Texte", startMs: 0, endMs: 1 }, { text: "entier,", startMs: 1, endMs: 2 }] })
    ).toBe("Texte entier,");
    expect(speechTextOf({ originalName: "Voix Siwis : Bonjour" })).toBe("Bonjour");
  });

  it("relit une voix rangée avec une autre voix, à partir de son texte complet", async () => {
    assets.list = [
      {
        file: "voice-1-abcde.wav",
        kind: "audio",
        originalName: "Voix Siwis : Un texte tronqué dans le nom",
        size: 10,
        createdAt: 1,
        speech: { text: "Un texte tronqué dans le nom, mais complet ici.", voice: "siwis", speed: 1.15 },
      },
    ];
    const result = await respeak({ ref: "module:clip-studio/assets/voice-1-abcde.wav", voice: "edge:fr-FR-HenriNeural" });
    expect(edgeSynth).toHaveBeenCalledWith("fr-FR-HenriNeural", "Un texte tronqué dans le nom, mais complet ici.", 1.15);
    expect(result.text).toBe("Un texte tronqué dans le nom, mais complet ici.");
    expect(result.durationMs).toBe(1000);
    expect(result.asset.speech).toEqual({ text: "Un texte tronqué dans le nom, mais complet ici.", voice: "edge:fr-FR-HenriNeural", speed: 1.15 });
    // Mots d'Edge repris tels quels, sans alignement.
    expect(result.words[0]).toEqual({ text: "Un", startMs: 0, endMs: 250 });
    expect(assets.list[0].file).toBe(result.asset.file);
  });
});
