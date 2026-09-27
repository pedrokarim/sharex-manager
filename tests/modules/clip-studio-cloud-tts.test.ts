import { afterEach, describe, expect, it, vi } from "vitest";
import { isCloudVoiceUsable, parseCloudVoice, synthesizeCloud } from "@/modules/clip-studio/lib/cloud-tts";

describe("voix en ligne", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reconnaît les identifiants de voix et refuse le reste", () => {
    expect(parseCloudVoice("openai:nova")).toEqual({ provider: "openai", voice: "nova" });
    expect(parseCloudVoice("google:fr-FR-Neural2-A")).toEqual({ provider: "google", voice: "fr-FR-Neural2-A" });
    expect(parseCloudVoice("elevenlabs:21m00Tcm4TlvDq8ikWAM")?.provider).toBe("elevenlabs");
    expect(parseCloudVoice("siwis")).toBeNull();
    expect(parseCloudVoice("openai:../../etc")).toBeNull();
    expect(parseCloudVoice("elevenlabs:abc?x=1")).toBeNull();
    expect(parseCloudVoice("autre:voix")).toBeNull();
  });

  it("accepte une voix en ligne dès que sa clé est configurée", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(isCloudVoiceUsable("openai:nova")).toBe(true);
    expect(isCloudVoiceUsable("openai:../x")).toBe(false);
  });

  it("envoie le texte au fournisseur choisi et renvoie son MP3", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await synthesizeCloud("openai:nova", "Bonjour", 1.1);
    expect(result.extension).toBe("mp3");
    expect(result.audio.length).toBe(4);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(JSON.parse(String(init.body))).toMatchObject({ voice: "nova", input: "Bonjour", speed: 1.1 });
  });

  it("traduit une clé refusée en message lisible", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "bad");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await expect(synthesizeCloud("elevenlabs:abc123", "Salut", 1)).rejects.toThrow("Clé refusée");
  });

  it("refuse une voix OpenAI inconnue sans rien envoyer", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(synthesizeCloud("openai:inconnue", "Salut", 1)).rejects.toThrow("inconnue");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
