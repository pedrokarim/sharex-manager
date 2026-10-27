import { describe, expect, it, vi } from "vitest";

// L'assistant appelle d'autres modules par le gestionnaire : aucun appel ici, les accès sont injectés.
vi.mock("@/lib/modules/module-manager.api", () => ({ apiModuleManager: { callModuleFunction: vi.fn(), getLoadedModule: vi.fn() } }));

import {
  MAX_FIT_ATTEMPTS,
  cleanRequest,
  recordNarration,
  resolveNarrationVoice,
  sanitize,
  scriptPrompt,
  speakLine,
  type AssistantJob,
  type AssistantRequest,
  type NarrationDeps,
} from "@/modules/clip-studio/lib/assistant";
import type { SpeakInput, SpeechResult } from "@/modules/clip-studio/lib/tts";
import type { MediaSource } from "@/modules/clip-studio/engine/types";
import type { SlideshowData } from "@/modules/clip-studio/engine/templates";
import { brandVoicePrefill, cleanTargetSeconds, defaultTargetSeconds } from "@/modules/clip-studio/lib/voice-settings";

const NBSP = " ";

const REQUEST: AssistantRequest = { brief: "Trois volcans célèbres", template: "slideshow", aspect: "9:16", count: 3, imageSource: "none" };

const RAW = {
  title: "Les volcans",
  slides: [
    { caption: "Le premier volcan dort depuis des siècles sous la neige et la glace" },
    { caption: "Le deuxième crache de la lave chaque été devant les visiteurs du parc" },
    { caption: "Le troisième a formé une île entière au milieu de l'océan" },
  ],
  outro: "Abonne-toi pour la suite",
};

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * Faux moteur de synthèse : la durée de chaque ligne est donnée par
 * `duration`, en millisecondes. Chaque appel range un fichier distinct, avec
 * ses mots horodatés.
 */
function fakeSynthesize(duration: (input: SpeakInput) => number, fail?: (input: SpeakInput) => boolean) {
  let count = 0;
  return vi.fn(async (input: SpeakInput): Promise<SpeechResult> => {
    if (fail?.(input)) throw new Error("Le service de voix ne répond pas");
    count++;
    const durationMs = Math.round(duration(input));
    const file = `voice-${count}.wav`;
    const timed = [{ text: input.text.split(/\s+/)[0], startMs: 0, endMs: Math.min(300, durationMs) }];
    return {
      asset: {
        file,
        kind: "audio",
        originalName: `Voix : ${input.text}`,
        size: 1,
        durationMs,
        credit: "Voix de test",
        words: timed,
        speech: { text: input.text, voice: String(input.voice), speed: input.speed, tone: input.tone },
        createdAt: 0,
      },
      durationMs,
      words: timed,
    };
  });
}

function setup(request: Partial<AssistantRequest> = {}, raw: typeof RAW = RAW) {
  const clean = cleanRequest({ ...REQUEST, ...request });
  const job: Pick<AssistantJob, "request" | "narration"> = { request: clean };
  const script = sanitize(clean, raw);
  const steps: { state: string; detail?: string }[] = [];
  const onStep = (state: string, detail?: string) => steps.push({ state, detail });
  return { job, script, steps, onStep, signal: new AbortController().signal };
}

const media = (name: string): MediaSource => ({ url: `/api/modules/x/${name}`, ref: `module:x/${name}`, name, kind: "image" });

describe("assistant : débit et intonation de la voix", () => {
  it("speakLine transmet la voix, le débit et l'intonation au moteur", async () => {
    const synth = fakeSynthesize(() => 1000);
    const clip = await speakLine("Bonjour à tous", { voice: "jessica", speed: 1.15, tone: "steady" }, synth);
    expect(synth).toHaveBeenCalledWith({ text: "Bonjour à tous", voice: "jessica", speed: 1.15, tone: "steady" });
    expect(clip?.source.ref).toBe("module:clip-studio/assets/voice-1.wav");
    expect(clip?.source.speech).toMatchObject({ speed: 1.15, tone: "steady" });
  });

  it("speakLine n'envoie pas d'intonation sans en avoir, et une ligne ratée reste muette", async () => {
    const synth = fakeSynthesize(() => 1000);
    await speakLine("Hello", { voice: "edge:en-US-AvaNeural", speed: 0.85 }, synth);
    expect(synth.mock.calls[0][0]).toEqual({ text: "Hello", voice: "edge:en-US-AvaNeural", speed: 0.85 });
    const failing = fakeSynthesize(() => 1000, () => true);
    await expect(speakLine("Texte", { voice: "siwis", speed: 1 }, failing)).resolves.toBeUndefined();
    await expect(speakLine("", { voice: "siwis", speed: 1 }, synth)).resolves.toBeUndefined();
  });

  it("cleanRequest borne le débit, l'intonation et la durée visée", () => {
    const clean = cleanRequest({ ...REQUEST, voice: "siwis", voiceSpeed: 3, voiceTone: "steady", targetSeconds: 400 });
    expect(clean).toMatchObject({ voice: "siwis", voiceSpeed: 1.6, voiceTone: "steady", targetSeconds: 60 });
    expect(cleanRequest({ ...REQUEST, voiceSpeed: 0.1 }).voiceSpeed).toBe(0.7);
    expect(cleanRequest({ ...REQUEST, voiceTone: "chuchotée" }).voiceTone).toBeUndefined();
    expect(cleanRequest({ ...REQUEST }).voiceSpeed).toBeUndefined();
    // Sans durée demandée : la valeur par défaut du modèle, bornée au format.
    expect(cleanRequest({ ...REQUEST }).targetSeconds).toBe(defaultTargetSeconds("slideshow", "9:16"));
    expect(cleanRequest({ ...REQUEST, aspect: "16:9", targetSeconds: 150 }).targetSeconds).toBe(150);
    expect(cleanTargetSeconds(5, "quiz", "9:16")).toBe(15);
    // Muet explicite : aucune voix, même demandée.
    expect(cleanRequest({ ...REQUEST, voice: "siwis", narration: false })).toMatchObject({ voice: undefined, narration: false });
    // Une voix en ligne bien formée est gardée sans clé : le travail se repliera sur la voix locale.
    expect(cleanRequest({ ...REQUEST, voice: "azure:fr-FR-DeniseNeural" }).voice).toBe("azure:fr-FR-DeniseNeural");
    expect(cleanRequest({ ...REQUEST, voice: "inconnue" }).voice).toBeUndefined();
  });

  it("la consigne du script donne la durée visée", () => {
    const prompt = scriptPrompt(cleanRequest({ ...REQUEST, targetSeconds: 45 }));
    // 45 s de clip, dont les pauses : la voix seule vise moins.
    expect(prompt).toContain("le clip monté vise 45 secondes");
    expect(prompt).toContain("C'est un repère, pas un plafond");
    expect(prompt).toContain("vise donc 41 secondes");
  });
});

describe("assistant : voix de la marque", () => {
  const BRAND = { voice: "jessica", speed: 1.15, tone: "expressive" as const };

  it("prend la voix, le débit et l'intonation de la marque quand la demande ne précise rien", () => {
    expect(resolveNarrationVoice({}, BRAND, () => true)).toEqual({ voice: "jessica", speed: 1.15, tone: "expressive", origin: "brand" });
    // Préremplie puis gardée par la fenêtre « Créer » : toujours la voix de la marque, au débit envoyé.
    expect(resolveNarrationVoice({ voice: "jessica", voiceSpeed: 1 }, BRAND, () => true)).toMatchObject({ speed: 1, origin: "brand" });
  });

  it("la demande garde la main, et un clip muet le reste", () => {
    expect(resolveNarrationVoice({ voice: "pierre", voiceSpeed: 0.85 }, BRAND, () => true)).toEqual({ voice: "pierre", speed: 0.85, origin: "request" });
    expect(resolveNarrationVoice({ narration: false }, BRAND, () => true)).toBeNull();
    expect(resolveNarrationVoice({}, undefined, () => true)).toBeNull();
  });

  it("se replie sur la voix locale par défaut quand la voix de la marque n'est pas disponible", () => {
    const voice = resolveNarrationVoice({}, { voice: "azure:fr-FR-DeniseNeural", speed: 1.15 }, () => false);
    expect(voice).toMatchObject({ voice: "siwis", speed: 1.15, origin: "brand" });
    expect(voice?.fallback).toContain("Voix de la marque indisponible");
    expect(voice?.fallback).toContain("Siwis");
  });

  it("préremplit la fenêtre « Créer », ou dit pourquoi la voix de la marque manque", () => {
    expect(brandVoicePrefill(BRAND, ["siwis", "jessica"])).toEqual(BRAND);
    expect(brandVoicePrefill({ voice: "azure:fr-FR-DeniseNeural", speed: 1 }, null)).toEqual({ voice: "azure:fr-FR-DeniseNeural", speed: 1 });
    const missing = brandVoicePrefill({ voice: "azure:fr-FR-DeniseNeural", speed: 0.85 }, ["siwis"]);
    expect(missing).toMatchObject({ voice: "siwis", speed: 0.85 });
    expect(missing.unavailable).toContain("Azure");
  });

  it("une voix en ligne qui ne répond pas laisse la place à la voix locale, sans faire échouer le clip", async () => {
    const { job, script, steps, onStep, signal } = setup({ targetSeconds: 60 });
    const synth = fakeSynthesize(() => 2000, (input) => String(input.voice).startsWith("edge:"));
    const { data } = await recordNarration(job, script, { images: [] }, { voice: "edge:fr-FR-DeniseNeural", speed: 1, origin: "brand" }, signal, onStep, {
      deps: { synthesize: synth },
    });
    expect(synth.mock.calls.every(([input]) => input.voice === "edge:fr-FR-DeniseNeural" || input.voice === "siwis")).toBe(true);
    // Un seul essai de la voix en ligne, puis les cinq lignes en voix locale.
    expect(synth.mock.calls.filter(([input]) => input.voice === "edge:fr-FR-DeniseNeural")).toHaveLength(1);
    expect(synth.mock.calls.filter(([input]) => input.voice === "siwis")).toHaveLength(5);
    expect(job.narration).toMatchObject({ voice: "siwis", origin: "brand" });
    expect(job.narration?.fallback).toContain(`Voix de la marque indisponible (Le service de voix ne répond pas)${NBSP}: voix locale Siwis`);
    expect((data as SlideshowData).voice?.intro?.source.speech?.voice).toBe("siwis");
    expect(steps.at(-1)).toMatchObject({ state: "done" });
    expect(steps.at(-1)?.detail).toContain("voix locale Siwis à la place");
  });
});

describe("assistant : calage sur la durée visée", () => {
  const fakeAsk = (answer: string | ((prompt: string) => string)) =>
    vi.fn<NonNullable<NarrationDeps["ask"]>>(async (prompt) => (typeof answer === "string" ? answer : answer(prompt)));

  it("ne fait rien quand la voix tient dans la durée", async () => {
    const { job, script, steps, onStep, signal } = setup({ targetSeconds: 50 });
    const synth = fakeSynthesize(() => 5000);
    const ask = fakeAsk("{}");
    const discard = vi.fn();
    await recordNarration(job, script, { images: [] }, { voice: "siwis", speed: 1, origin: "request" }, signal, onStep, { deps: { synthesize: synth, ask, discard, overheadSeconds: 0 } });
    expect(synth).toHaveBeenCalledTimes(5);
    expect(ask).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
    expect(job.narration).toMatchObject({ attempts: 0, fits: true, seconds: 25, targetSeconds: 50, notes: [] });
    expect(steps.at(-1)).toEqual({ state: "done", detail: `5 sur 5, 25${NBSP}s de voix` });
  });

  it("compte la part fixe du montage (pauses, carton de fin) dans la durée visée", async () => {
    const { job, script, onStep, signal } = setup({ targetSeconds: 50 });
    // 45 s de voix tiendraient seules, mais 8 s de montage en plus font 53 s : la voix est accélérée.
    const synth = fakeSynthesize((input) => 9_000 / (input.speed ?? 1));
    await recordNarration(job, script, { images: [] }, { voice: "siwis", speed: 1, origin: "request" }, signal, onStep, {
      deps: { synthesize: synth, ask: fakeAsk("{}"), discard: () => undefined, overheadSeconds: 8 },
    });
    expect(job.narration?.attempts).toBe(1);
    expect(job.narration?.speedUp).toBeGreaterThan(0);
    expect(job.narration?.fits).toBe(true);
  });

  it("accélère la voix jusqu'à 10 % de trop, et les mots suivent la voix finale", async () => {
    const { job, script, steps, onStep, signal } = setup({ targetSeconds: 50 });
    // 53 s au débit normal : 6 % de trop.
    const synth = fakeSynthesize((input) => 10_600 / (input.speed ?? 1));
    const discard = vi.fn();
    const { data } = await recordNarration(job, script, { images: [] }, { voice: "siwis", speed: 1, tone: "steady", origin: "request" }, signal, onStep, {
      deps: { synthesize: synth, discard, overheadSeconds: 0 },
    });
    expect(synth).toHaveBeenCalledTimes(10);
    const second = synth.mock.calls.slice(5).map(([input]) => input);
    expect(second.every((input) => input.speed! > 1.06 && input.speed! <= 1.1 && input.tone === "steady")).toBe(true);
    expect(job.narration).toMatchObject({ attempts: 1, fits: true, speedUp: 7 });
    expect(job.narration?.notes).toEqual([`Voix accélérée de 7${NBSP}% pour tenir en 50${NBSP}s`]);
    expect(steps.at(-1)?.detail).toContain(`Voix accélérée de 7${NBSP}% pour tenir en 50${NBSP}s`);
    // La première prise est effacée ; le clip porte la seconde, avec ses mots.
    expect(discard).toHaveBeenCalledTimes(1);
    expect(discard.mock.calls[0][0].map((clip: { source: { ref: string } }) => clip.source.ref)).toContain("module:clip-studio/assets/voice-1.wav");
    const slideshow = data as SlideshowData;
    expect(slideshow.voice?.intro?.source.ref).toBe("module:clip-studio/assets/voice-6.wav");
    expect(slideshow.voice?.intro?.source.words?.[0].text).toBe("Les");
    expect(slideshow.slides[0].voice?.source.ref).toBe("module:clip-studio/assets/voice-7.wav");
  });

  it("n'accélère jamais au-delà de ×1,10 du débit choisi, puis garde le clip entier sans le raccourcir", async () => {
    for (const chosen of [1, 1.15]) {
      const { job, script, onStep, signal } = setup({ targetSeconds: 50 });
      // La durée ne suit pas le débit : l'accélération ne suffit jamais.
      const synth = fakeSynthesize(() => 10_800);
      const ask = vi.fn<NonNullable<NarrationDeps["ask"]>>(async () => {
        throw new Error("Codex indisponible");
      });
      await recordNarration(job, script, { images: [] }, { voice: "siwis", speed: chosen, origin: "request" }, signal, onStep, {
        deps: { synthesize: synth, ask, discard: () => undefined, overheadSeconds: 0 },
      });
      const speeds = synth.mock.calls.map(([input]) => input.speed!);
      expect(Math.max(...speeds)).toBeLessThanOrEqual(chosen * 1.1 + 1e-9);
      expect(Math.max(...speeds)).toBeGreaterThan(chosen);
      // Débit au plus haut, 54 s pour 50 : sous une fois et demie la cible, rien n'est coupé.
      expect(ask).not.toHaveBeenCalled();
      expect(job.narration?.attempts).toBe(1);
      expect(job.narration?.fits).toBe(true);
      expect(job.narration?.notes.at(-1)).toContain("gardé entier, rien n’est coupé");
    }
  });

  it("au-delà d'une fois et demie la cible, demande à Codex un script plus court, mêmes éléments et même ordre, puis le relit", async () => {
    const raw = { ...RAW, slides: [...RAW.slides.slice(0, 2), { caption: "Le troisième <b>a formé</b> une île entière au milieu de l'océan" }] };
    const { job, script, onStep, signal } = setup({ targetSeconds: 20 }, raw);
    const synth = fakeSynthesize((input) => words(input.text) * 1000);
    const ask = fakeAsk(
      JSON.stringify({
        segments: [{ caption: "Il dort sous la glace" }, { caption: "Il crache de la lave" }, { caption: "Il a formé une île" }],
        outro: "Abonne-toi",
      })
    );
    const images = [media("a.jpg"), media("b.jpg"), media("c.jpg")];
    const result = await recordNarration(job, script, { images }, { voice: "siwis", speed: 1, origin: "request" }, signal, onStep, {
      deps: { synthesize: synth, ask, discard: () => undefined, overheadSeconds: 0 },
    });
    expect(ask).toHaveBeenCalledTimes(1);
    const prompt = ask.mock.calls[0][0];
    expect(prompt).toContain("<script>");
    expect(prompt).toContain("Garde exactement les mêmes éléments, dans le même ordre : 3 diapositives");
    // Il raccourcit jusqu'à une fois et demie la cible, pas jusqu'à la cible.
    expect(prompt).toContain("doit tenir en 30 secondes au plus");
    expect(prompt).toContain("Ne retire jamais l'état actuel du sujet");
    // Le script entre comme une donnée : un « < » ne peut pas refermer la balise.
    expect(prompt).not.toContain("<b>");
    expect(prompt).toContain("\\u003cb>");
    const slideshow = result.data as SlideshowData;
    expect(slideshow.slides.map((slide) => slide.caption)).toEqual(["Il dort sous la glace", "Il crache de la lave", "Il a formé une île"]);
    expect(slideshow.slides.map((slide) => slide.image?.name)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(result.script.title).toBe(script.title);
    expect(job.narration?.fits).toBe(true);
    expect(job.narration?.shortenedSeconds).toBeGreaterThan(10);
    expect(job.narration?.notes[0]).toMatch(new RegExp(`^Script raccourci de \\d+${NBSP}s$`));
  });

  it("s'arrête après deux tentatives, et le clip se fait quand même", async () => {
    const { job, script, steps, onStep, signal } = setup({ targetSeconds: 50 });
    // Toujours 100 s, quel que soit le texte : rien n'y fait.
    const synth = fakeSynthesize(() => 20_000);
    const ask = fakeAsk(JSON.stringify({ segments: [{ caption: "Court" }, { caption: "Court aussi" }, { caption: "Encore court" }], outro: "Fin" }));
    const { data } = await recordNarration(job, script, { images: [] }, { voice: "siwis", speed: 1, origin: "request" }, signal, onStep, {
      deps: { synthesize: synth, ask, discard: () => undefined, overheadSeconds: 0 },
    });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(synth).toHaveBeenCalledTimes(15);
    expect(job.narration).toMatchObject({ attempts: 2, fits: false, seconds: 100 });
    expect(job.narration?.notes.at(-1)).toBe(`Durée visée encore dépassée${NBSP}: 100${NBSP}s de clip pour 50${NBSP}s`);
    expect((data as SlideshowData).voice?.intro).toBeDefined();
    expect(steps.at(-1)?.state).toBe("done");
  });

  it("écarte une réponse qui change le nombre d'éléments", async () => {
    const { job, script, onStep, signal } = setup({ targetSeconds: 15 });
    const synth = fakeSynthesize((input) => words(input.text) * 1000);
    const ask = fakeAsk(JSON.stringify({ segments: [{ caption: "Un seul" }], outro: "" }));
    const { data } = await recordNarration(job, script, { images: [] }, { voice: "siwis", speed: 1, origin: "request" }, signal, onStep, {
      deps: { synthesize: synth, ask, discard: () => undefined, overheadSeconds: 0 },
    });
    expect((data as SlideshowData).slides).toHaveLength(3);
    expect(job.narration?.notes[0]).toBe(`Raccourcissement impossible${NBSP}: Codex a rendu 1 éléments au lieu de 3`);
  });
});
