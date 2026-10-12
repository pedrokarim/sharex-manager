import fs from "fs";
import path from "path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Données du module dans un dossier temporaire : le compteur et les clés n'écrivent pas dans le dépôt.
const dataDir = vi.hoisted(() => {
  const nodeFs = require("fs") as typeof import("fs");
  const nodeOs = require("os") as typeof import("os");
  const nodePath = require("path") as typeof import("path");
  return nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "clip-voices-"));
});

vi.mock("@/modules/clip-studio/lib/store", () => ({
  DATA_DIR: dataDir,
  ensureDirs: () => fs.mkdirSync(dataDir, { recursive: true }),
}));

import {
  AZURE_FREE_CHARACTERS,
  azureSsml,
  billableCharacters,
  isCloudVoiceUsable,
  parseCloudVoice,
  recordUsage,
  sourceAvailability,
  synthesizeCloud,
  usageMonth,
  usageThisMonth,
} from "@/modules/clip-studio/lib/cloud-tts";

const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);

describe("voix Microsoft Azure", () => {
  beforeEach(() => {
    fs.rmSync(path.join(dataDir, "tts-usage.json"), { force: true });
    vi.stubEnv("AZURE_SPEECH_KEY", "azure-test-key");
    vi.stubEnv("AZURE_SPEECH_REGION", "westeurope");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  afterAll(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("reconnaît les voix Microsoft et demande clé et région pour Azure", () => {
    expect(parseCloudVoice("azure:fr-FR-DeniseNeural")).toEqual({ provider: "azure", voice: "fr-FR-DeniseNeural" });
    expect(parseCloudVoice("edge:fr-FR-VivienneMultilingualNeural")?.provider).toBe("edge");
    expect(parseCloudVoice("azure:fr-FR-Denise'/><x")).toBeNull();
    expect(isCloudVoiceUsable("azure:fr-FR-DeniseNeural")).toBe(true);
    vi.stubEnv("AZURE_SPEECH_REGION", "");
    expect(isCloudVoiceUsable("azure:fr-FR-DeniseNeural")).toBe(false);
    expect(sourceAvailability().find((source) => source.id === "azure")?.reason).toContain("région");
  });

  it("compte les caractères facturés comme Microsoft : ni <speak> ni <voice>, idéogrammes doublés", () => {
    const ssml = azureSsml("fr-FR-DeniseNeural", "Salut", 1);
    expect(billableCharacters(ssml)).toBe(5);
    expect(billableCharacters(azureSsml("zh-CN-XiaoxiaoNeural", "你好", 1))).toBe(4);
    // Le débit ajoute une balise <prosody>, comptée elle aussi.
    expect(billableCharacters(azureSsml("fr-FR-DeniseNeural", "Salut", 1.15))).toBe("<prosody rate='+15%'>Salut</prosody>".length);
  });

  it("envoie du SSML avec les en-têtes de l'API REST et compte les caractères du mois", async () => {
    const fetchMock = vi.fn(async () => new Response(WAV, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await synthesizeCloud("azure:fr-FR-DeniseNeural", "Bonjour & bienvenue", 1);
    expect(result.extension).toBe("wav");
    expect(result.audio.length).toBe(WAV.length);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Ocp-Apim-Subscription-Key"]).toBe("azure-test-key");
    expect(headers["Content-Type"]).toBe("application/ssml+xml");
    expect(headers["X-Microsoft-OutputFormat"]).toBe("riff-24khz-16bit-mono-pcm");
    expect(headers["User-Agent"]).toBeTruthy();
    expect(String(init.body)).toBe(
      "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='fr-FR'><voice name='fr-FR-DeniseNeural'>Bonjour &amp; bienvenue</voice></speak>"
    );
    expect(usageThisMonth("azure")).toBe("Bonjour &amp; bienvenue".length);
    expect(sourceAvailability().find((source) => source.id === "azure")?.usage).toMatchObject({ characters: 23, limit: 500_000 });
  });

  it("traduit un 429 en message clair, sans nouvel essai ni caractère compté", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(synthesizeCloud("azure:fr-FR-DeniseNeural", "Salut", 1)).rejects.toThrow(/quota gratuit du mois épuisé/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(usageThisMonth("azure")).toBe(0);
  });

  it("refuse d'envoyer au-delà de l'offre gratuite du mois", async () => {
    recordUsage("azure", AZURE_FREE_CHARACTERS - 3);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(synthesizeCloud("azure:fr-FR-DeniseNeural", "Bonjour", 1)).rejects.toThrow(/Quota gratuit d'Azure atteint/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("range le compteur par mois et garde les trois derniers", () => {
    recordUsage("azure", 10, new Date("2026-07-15T00:00:00Z"));
    recordUsage("azure", 20, new Date("2026-08-15T00:00:00Z"));
    recordUsage("azure", 30, new Date("2026-09-15T00:00:00Z"));
    recordUsage("azure", 40, new Date("2026-10-01T00:00:00Z"));
    recordUsage("azure", 2, new Date("2026-10-31T23:59:59Z"));
    expect(usageMonth(new Date("2026-10-31T23:59:59Z"))).toBe("2026-10");
    expect(usageThisMonth("azure", new Date("2026-10-20T00:00:00Z"))).toBe(42);
    expect(usageThisMonth("azure", new Date("2026-07-20T00:00:00Z"))).toBe(0);
    const stored = JSON.parse(fs.readFileSync(path.join(dataDir, "tts-usage.json"), "utf-8"));
    expect(Object.keys(stored.azure)).toEqual(["2026-10", "2026-09", "2026-08"]);
  });

  it("ne garde aucune clé dans le fichier du compteur", () => {
    recordUsage("azure", 5);
    expect(fs.readFileSync(path.join(dataDir, "tts-usage.json"), "utf-8")).not.toContain("azure-test-key");
  });
});
