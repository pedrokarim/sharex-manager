import { describe, expect, it, vi } from "vitest";

// Moteur local et clé OpenAI simulés : aucun programme lancé, aucun appel réseau.
const local = vi.hoisted(() => ({ calls: [] as { input: string; verbatim?: boolean }[], key: "" as string, engine: "auto" as string }));
vi.mock("@/modules/clip-studio/lib/transcribe-local", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/clip-studio/lib/transcribe-local")>();
  return {
    ...original,
    transcribeLocalFile: async (input: string, options: { verbatim?: boolean }) => {
      local.calls.push({ input, verbatim: options.verbatim });
      return { words: [{ text: "Bonjour", startMs: 0, endMs: 400 }], text: "Bonjour", durationSec: 1, provider: "local" };
    },
  };
});
vi.mock("@/modules/clip-studio/lib/cloud-tts", () => ({ openAiApiKey: () => local.key }));
vi.mock("@/modules/clip-studio/lib/transcription-settings", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/clip-studio/lib/transcription-settings")>();
  return { ...original, transcriptionEngine: () => local.engine };
});

import { parseWhisperCppJson, detectedLanguage, whisperArgs, localThreads, estimatedWordMs, VERBATIM_HINTS, DTW_LEAD_MS, localTimeoutMs } from "@/modules/clip-studio/lib/transcribe-local";
import { enginePlan, isTranscriptionEngine } from "@/modules/clip-studio/lib/transcription-settings";
import { canFallBack, transcribeMediaFile, TranscriptionError } from "@/modules/clip-studio/lib/transcribe";
import { archiveFiles, keptArchiveEntry, readTar, WHISPER_MODEL } from "@/lib/media/whisper-cpp";
import { transcriptionDetail } from "@/modules/clip-studio/lib/clip-jobs";
import { aiProvider, isAiProviderId } from "@/lib/ai-usage/catalog";
import { gzipSync } from "fflate";

/** Jeton de whisper-cli : texte, instants du segment (ms) et instant DTW (centièmes de seconde). */
const token = (text: string, from: number, to: number, dtw: number) => ({ text, offsets: { from, to }, t_dtw: dtw });

describe("lecture du JSON de whisper-cli", () => {
  const sample = {
    result: { language: "fr" },
    transcription: [
      {
        offsets: { from: 0, to: 3000 },
        text: " Alors aujourd'hui, on va !",
        tokens: [
          { text: "[_BEG_]", offsets: { from: 0, to: 0 }, t_dtw: -1 },
          token(" Alors", 0, 300, 50),
          token(" aujourd", 300, 600, 80),
          token("'", 600, 610, 95),
          token("hui", 610, 900, 100),
          token(",", 900, 910, 120),
          token(" on", 910, 1000, 130),
          token(" va", 1000, 1200, 150),
          token(" !", 1200, 1210, 170),
          { text: "[_TT_150]", offsets: { from: 3000, to: 3000 }, t_dtw: -1 },
        ],
      },
      {
        offsets: { from: 3000, to: 5000 },
        text: " [Musique] Voir",
        tokens: [token(" [Musique]", 3000, 3300, 320), token(" Voir", 3400, 3800, 360)],
      },
    ],
  };

  it("réunit les jetons en mots, ponctuation collée, jetons spéciaux et annotations écartés", () => {
    const parsed = parseWhisperCppJson(sample);
    expect(parsed.words.map((word) => word.text)).toEqual(["Alors", "aujourd’hui,", "on", "va !", "Voir"]);
    expect(parsed.language).toBe("fr");
    expect(parsed.text).toContain("Alors aujourd'hui");
  });

  it("avance les débuts alignés par DTW et garde des instants qui ne reculent jamais", () => {
    const { words } = parseWhisperCppJson(sample);
    expect(words[0].startMs).toBe(500 - DTW_LEAD_MS);
    expect(words[1].startMs).toBe(800 - DTW_LEAD_MS);
    for (let index = 1; index < words.length; index++) {
      expect(words[index].startMs).toBeGreaterThan(words[index - 1].startMs);
      expect(words[index - 1].endMs).toBeLessThanOrEqual(words[index].startMs);
      expect(words[index].endMs).toBeGreaterThan(words[index].startMs);
    }
    // Dernier mot d'un segment : durée estimée, bornée au segment.
    expect(words[3].endMs).toBeLessThanOrEqual(3000);
  });

  it("prend le début du jeton sans DTW", () => {
    const { words } = parseWhisperCppJson({ transcription: [{ offsets: { from: 0, to: 2000 }, tokens: [{ text: " Salut", offsets: { from: 120, to: 500 }, t_dtw: -1 }] }] });
    expect(words).toEqual([{ text: "Salut", startMs: 120, endMs: 120 + estimatedWordMs("Salut") }]);
  });

  it("lit une réponse vide ou cassée sans planter", () => {
    expect(parseWhisperCppJson(null).words).toEqual([]);
    expect(parseWhisperCppJson({ transcription: "x" }).words).toEqual([]);
  });

  it("retrouve la langue reconnue dans la sortie d'erreur", () => {
    expect(detectedLanguage("whisper_full_with_state: auto-detected language: fr (p = 0.999)")).toBe("fr");
    expect(detectedLanguage("rien")).toBeUndefined();
  });
});

describe("arguments de whisper-cli", () => {
  it("donne chaque valeur dans sa case, avec l'alignement DTW et sans attention « flash »", () => {
    const args = whisperArgs({ model: "/m/model.bin", wav: "/w/a b.wav", outBase: "/w/out", language: "fr", threads: 3 });
    expect(args).toEqual(["-m", "/m/model.bin", "-f", "/w/a b.wav", "-l", "fr", "-t", "3", "-ojf", "-of", "/w/out", "-pp", "-dtw", WHISPER_MODEL.dtw, "-nfa"]);
  });

  it("ajoute la consigne mot pour mot de la langue, et rien pour une langue inconnue", () => {
    expect(whisperArgs({ model: "m", wav: "w", outBase: "o", language: "fr", threads: 2, verbatim: true }).slice(-2)).toEqual(["--prompt", VERBATIM_HINTS.fr]);
    expect(whisperArgs({ model: "m", wav: "w", outBase: "o", language: "xx; rm -rf", threads: 2, verbatim: true })).not.toContain("--prompt");
    expect(whisperArgs({ model: "m", wav: "w", outBase: "o", language: "xx; rm -rf", threads: 2 })).toContain("auto");
  });

  it("garde un cœur au serveur, quatre fils au plus, et un délai proportionné", () => {
    expect(localThreads(1)).toBe(1);
    expect(localThreads(4)).toBe(3);
    expect(localThreads(32)).toBe(4);
    expect(localTimeoutMs(60)).toBe(5 * 60 * 1000 + 180_000);
  });
});

describe("archives de whisper.cpp", () => {
  /** Archive tar minimale : en-têtes ustar écrits à la main. */
  function tar(entries: { name: string; data?: string; link?: string }[]): Uint8Array {
    const blocks: Uint8Array[] = [];
    for (const entry of entries) {
      const header = new Uint8Array(512);
      const write = (text: string, offset: number) => header.set(new TextEncoder().encode(text), offset);
      const data = new TextEncoder().encode(entry.data ?? "");
      write(entry.name, 0);
      write("0000755\0", 100);
      write(`${data.length.toString(8).padStart(11, "0")}\0`, 124);
      header[156] = (entry.link ? "2" : "0").charCodeAt(0);
      if (entry.link) write(entry.link, 157);
      write("ustar\0", 257);
      blocks.push(header);
      if (data.length) {
        const body = new Uint8Array(Math.ceil(data.length / 512) * 512);
        body.set(data);
        blocks.push(body);
      }
    }
    blocks.push(new Uint8Array(1024));
    const out = new Uint8Array(blocks.reduce((sum, block) => sum + block.length, 0));
    let offset = 0;
    for (const block of blocks) {
      out.set(block, offset);
      offset += block.length;
    }
    return out;
  }

  it("ne garde que le programme et ses bibliothèques", () => {
    expect(keptArchiveEntry("Release/whisper-cli.exe", "whisper-cli.exe")).toBe(true);
    expect(keptArchiveEntry("Release/ggml-cpu-haswell.dll", "whisper-cli.exe")).toBe(true);
    expect(keptArchiveEntry("Release/test-vad.exe", "whisper-cli.exe")).toBe(false);
    expect(keptArchiveEntry("Release/SDL2.dll", "whisper-cli.exe")).toBe(false);
    expect(keptArchiveEntry("dir/libwhisper.so.1.9.5", "whisper-cli")).toBe(true);
    expect(keptArchiveEntry("dir/libparakeet.so.1", "whisper-cli")).toBe(false);
  });

  it("copie la cible d'un lien symbolique au lieu de suivre un chemin", () => {
    const archive = gzipSync(
      tar([
        { name: "bin/whisper-cli", data: "ELF" },
        { name: "bin/libwhisper.so.1.9.5", data: "LIB" },
        { name: "bin/libwhisper.so.1", link: "libwhisper.so.1.9.5" },
        { name: "bin/libggml.so", link: "../../etc/passwd" },
        { name: "bin/test-vad", data: "TEST" },
      ])
    );
    expect(readTar(tar([{ name: "a", data: "x" }]))).toHaveLength(1);
    const files = archiveFiles(archive, "tgz", "whisper-cli");
    expect([...files.keys()].sort()).toEqual(["libwhisper.so.1", "libwhisper.so.1.9.5", "whisper-cli"]);
    expect(new TextDecoder().decode(files.get("libwhisper.so.1"))).toBe("LIB");
  });
});

describe("choix du moteur", () => {
  it("suit le réglage, la clé décide en automatique", () => {
    expect(enginePlan("auto", true)).toEqual(["openai", "local"]);
    expect(enginePlan("auto", false)).toEqual(["local"]);
    expect(enginePlan("openai", false)).toEqual(["openai"]);
    expect(enginePlan("local", true)).toEqual(["local"]);
    expect(isTranscriptionEngine("auto")).toBe(true);
    expect(isTranscriptionEngine("whisper")).toBe(false);
  });

  it("ne passe au moteur local qu'après un échec d'accès à OpenAI", () => {
    expect(canFallBack(new TranscriptionError("Crédit épuisé", "quota"))).toBe(true);
    expect(canFallBack(new TranscriptionError("Clé refusée", "auth"))).toBe(true);
    expect(canFallBack(new TranscriptionError("Injoignable", "network"))).toBe(true);
    expect(canFallBack(new TranscriptionError("Pas de son"))).toBe(false);
    expect(canFallBack(new Error("autre"))).toBe(false);
  });

  it("transcrit sur le serveur en automatique sans clé OpenAI, mot pour mot si demandé", async () => {
    local.key = "";
    local.engine = "auto";
    local.calls = [];
    const result = await transcribeMediaFile("/prise.mp4", { verbatim: true });
    expect(result.provider).toBe("local");
    expect(local.calls).toEqual([{ input: "/prise.mp4", verbatim: true }]);
  });

  it("dit l'avancement selon le moteur", () => {
    expect(transcriptionDetail({ stage: "extracting" })).toBeNull();
    expect(transcriptionDetail({ stage: "fallback", reason: "Crédit épuisé" })).toMatch(/OpenAI indisponible/);
    expect(transcriptionDetail({ stage: "transcribing", done: 42, total: 100, engine: "local" })).toMatch(/42/);
    expect(transcriptionDetail({ stage: "downloading", engine: "local", received: 50 * 1024 * 1024, total: 200 * 1024 * 1024 })).toMatch(/50\sMo\ssur\s200/);
    expect(transcriptionDetail({ stage: "transcribing", done: 0, total: 3 })).toMatch(/partie 1 sur 3/);
  });
});

describe("registre des services", () => {
  it("connaît whisper.cpp comme service auto-hébergé, avec son logo", () => {
    expect(isAiProviderId("whisper-local")).toBe(true);
    expect(aiProvider("whisper-local")).toMatchObject({ kind: "self-hosted", brand: "ggml" });
  });
});
