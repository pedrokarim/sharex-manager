import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseVerboseTranscription,
  planChunks,
  punctuateWords,
  requestTranscription,
  shiftWords,
  textTokens,
  transcribeChunks,
} from "@/modules/clip-studio/lib/transcribe";
import {
  addItem,
  captionAllVoices,
  captionForVoice,
  createProject,
  createVideoItem,
  detachVideoAudio,
  findItem,
  setSourceTranscript,
} from "@/modules/clip-studio/engine/edit";
import { isVoiceItem } from "@/modules/clip-studio/engine/revoice";
import type { ClipItem, ClipProject, MediaSource, TimedWord, VideoItem } from "@/modules/clip-studio/engine/types";

const NBSP = " ";

/** Réponse `verbose_json` de Whisper, telle que l’API la rend : mots sans ponctuation. */
const SAMPLE = {
  task: "transcribe",
  language: "french",
  duration: 6.2,
  text: "Bonjour à tous ! C'est peut-être l'heure du test, « vraiment ». Aujourd'hui, on y va ?",
  segments: [
    { id: 0, start: 0, end: 2.6, text: " Bonjour à tous ! C'est peut-être l'heure du test," },
    { id: 1, start: 2.6, end: 6.2, text: " « vraiment ». Aujourd'hui, on y va ?" },
  ],
  words: [
    { word: "Bonjour", start: 0, end: 0.4 },
    { word: "à", start: 0.4, end: 0.5 },
    { word: "tous", start: 0.5, end: 0.9 },
    { word: "C'est", start: 1.0, end: 1.2 },
    { word: "peut", start: 1.2, end: 1.4 },
    { word: "être", start: 1.4, end: 1.6 },
    { word: "l'heure", start: 1.6, end: 1.9 },
    { word: "du", start: 1.9, end: 2.0 },
    { word: "test", start: 2.0, end: 2.5 },
    { word: "vraiment", start: 2.7, end: 3.2 },
    { word: "Aujourd'hui", start: 3.4, end: 4.0 },
    { word: "on", start: 4.2, end: 4.3 },
    { word: "y", start: 4.3, end: 4.4 },
    { word: "va", start: 4.4, end: 4.8 },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("transcription : mots et ponctuation", () => {
  it("rend aux mots de Whisper la ponctuation et les majuscules des segments", () => {
    const result = parseVerboseTranscription(SAMPLE);
    expect(result.language).toBe("fr");
    expect(result.durationSec).toBe(6.2);
    expect(result.words.map((word) => word.text)).toEqual([
      "Bonjour",
      "à",
      `tous${NBSP}!`,
      "C'est",
      "peut-être",
      "l'heure",
      "du",
      "test,",
      `«${NBSP}vraiment${NBSP}».`,
      "Aujourd'hui,",
      "on",
      "y",
      `va${NBSP}?`,
    ]);
    // « peut » + « être » : un seul mot, du début du premier à la fin du second.
    const merged = result.words[4];
    expect(merged).toEqual({ text: "peut-être", startMs: 1200, endMs: 1600 });
    expect(result.words[0]).toEqual({ text: "Bonjour", startMs: 0, endMs: 400 });
  });

  it("garde un mot introuvable dans le texte sans décaler la suite", () => {
    const words: TimedWord[] = [
      { text: "salut", startMs: 0, endMs: 100 },
      { text: "inconnu", startMs: 100, endMs: 200 },
      { text: "monde", startMs: 200, endMs: 300 },
    ];
    expect(punctuateWords(words, "Salut, le monde.").map((word) => word.text)).toEqual(["Salut,", "inconnu", "monde."]);
  });

  it("colle la ponctuation isolée à son mot", () => {
    expect(textTokens("Quoi ? « Oui » : non !")).toEqual([`Quoi${NBSP}?`, `«${NBSP}Oui${NBSP}»${NBSP}:`, `non${NBSP}!`]);
  });

  it("répartit les mots d’un segment quand l’API n’en donne pas", () => {
    const result = parseVerboseTranscription({ text: "Un deux", segments: [{ start: 1, end: 2, text: "Un deux" }] });
    expect(result.words).toHaveLength(2);
    expect(result.words[0].startMs).toBe(1000);
    expect(result.words[1].endMs).toBe(2000);
  });
});

describe("transcription : morceaux", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ne découpe qu’au-delà de la limite de l’API", () => {
    expect(planChunks(600, 5_000_000, 24_000_000)).toEqual([{ startSec: 0, durationSec: 600 }]);
    const chunks = planChunks(7200, 72_000_000, 24_000_000);
    expect(chunks.length).toBe(4);
    expect(chunks[1].startSec).toBe(1800);
    expect(chunks.reduce((sum, chunk) => sum + chunk.durationSec, 0)).toBe(7200);
  });

  it("recale les mots de chaque morceau sur son début dans la source", async () => {
    const responses = [
      { language: "french", duration: 600, segments: [{ start: 0, end: 1, text: "Premier." }], words: [{ word: "Premier", start: 0.5, end: 0.9 }] },
      { language: "french", duration: 300, segments: [{ start: 0, end: 1, text: "Second !" }], words: [{ word: "Second", start: 0.25, end: 0.75 }] },
    ];
    const fetchMock = vi.fn(async () => jsonResponse(responses.shift()));
    vi.stubGlobal("fetch", fetchMock);
    const audio = Buffer.from([1, 2, 3]);
    const progress = vi.fn();
    const result = await transcribeChunks(
      [
        { audio, fileName: "part-0.ogg", mime: "audio/ogg", chunk: { startSec: 0, durationSec: 600 } },
        { audio, fileName: "part-1.ogg", mime: "audio/ogg", chunk: { startSec: 600, durationSec: 300 } },
      ],
      "sk-test",
      { onProgress: progress }
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.words).toEqual([
      { text: "Premier.", startMs: 500, endMs: 900 },
      { text: `Second${NBSP}!`, startMs: 600_250, endMs: 600_750 },
    ]);
    expect(result.durationSec).toBe(900);
    expect(result.language).toBe("fr");
    expect(progress).toHaveBeenLastCalledWith({ stage: "transcribing", done: 2, total: 2 });
    expect(shiftWords(result.words, 0)).toBe(result.words);
  });

  it("envoie le son à Whisper avec les mots horodatés demandés", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(SAMPLE));
    vi.stubGlobal("fetch", fetchMock);
    await requestTranscription(Buffer.from([1, 2]), "audio.ogg", "audio/ogg", "sk-test", { language: "fr", durationSec: 6 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const form = init.body as FormData;
    expect(form.get("model")).toBe("whisper-1");
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.getAll("timestamp_granularities[]")).toEqual(["word", "segment"]);
    expect(form.get("language")).toBe("fr");
  });

  it("traduit une clé refusée en message lisible, sans la clé", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: { message: "Incorrect API key provided: sk-secret-123456789" } }, 401)));
    const attempt = requestTranscription(Buffer.from([1]), "audio.ogg", "audio/ogg", "sk-secret-123456789");
    await expect(attempt).rejects.toThrow("Clé OpenAI refusée");
    await expect(attempt).rejects.not.toThrow("sk-secret");
  });

  it("distingue un crédit épuisé d’un excès de demandes", async () => {
    const quota = { error: { code: "credit_balance_exhausted", type: "insufficient_quota", message: "You have no credits remaining." } };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(quota, 429)));
    await expect(requestTranscription(Buffer.from([1]), "audio.ogg", "audio/ogg", "sk-test")).rejects.toThrow("Crédit OpenAI épuisé");
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: { code: "rate_limit_exceeded" } }, 429)));
    await expect(requestTranscription(Buffer.from([1]), "audio.ogg", "audio/ogg", "sk-test")).rejects.toThrow("trop de demandes");
  });
});

// ─── Sous-titres d’une vidéo ─────────────────────────────────────

const WORDS: TimedWord[] = [
  { text: "Avant.", startMs: 0, endMs: 500 },
  { text: "Voici", startMs: 2100, endMs: 2400 },
  { text: "le", startMs: 2400, endMs: 2500 },
  { text: "passage.", startMs: 3000, endMs: 3400 },
  { text: "Bien", startMs: 10_000, endMs: 10_300 },
  { text: "après.", startMs: 10_300, endMs: 10_800 },
];

const SOURCE: MediaSource = {
  url: "/api/modules/clip-studio/data/assets/talk.mp4",
  ref: "module:clip-studio/assets/talk.mp4",
  name: "talk.mp4",
  kind: "video",
  durationMs: 12_000,
};

function projectWithVideo(patch: Partial<VideoItem> = {}, source: MediaSource = { ...SOURCE, words: WORDS, transcript: { provider: "openai", language: "fr", at: 1 } }) {
  let project: ClipProject = createProject("Test", "9:16");
  const video = { ...createVideoItem(source, 30, project.fps), trimStart: 60, duration: 90, ...patch } as VideoItem;
  project = addItem(project, video);
  return { project, video };
}

const captions = (project: ClipProject) =>
  project.tracks.flatMap((track) => track.items).filter((item): item is Extract<ClipItem, { type: "text" }> => item.type === "text" && Boolean(item.karaoke));

describe("sous-titres d’une vidéo transcrite", () => {
  it("suit le placement et le rognage de la vidéo, avec les seuls mots du passage", () => {
    const { project, video } = projectWithVideo();
    const caption = captionForVoice(project, video)!;
    expect(caption.start).toBe(30);
    expect(caption.duration).toBe(90);
    expect(caption.karaoke).toMatchObject({ offset: 60, voiceId: video.id });
    // Passage lu : de 2 s à 5 s de la source (une seconde de marge de part et d’autre).
    expect(caption.karaoke!.words.map((word) => word.text)).toEqual(["Voici", "le", "passage."]);
  });

  it("ramène les mots au temps du projet quand la vidéo est accélérée", () => {
    const { project, video } = projectWithVideo({ speed: 2, duration: 45 });
    const caption = captionForVoice(project, video)!;
    expect(caption.karaoke!.offset).toBe(30);
    expect(caption.karaoke!.words[0]).toEqual({ text: "Voici", startMs: 1050, endMs: 1200 });
  });

  it("ne sous-titre pas une vidéo muette", () => {
    const { project, video } = projectWithVideo({ muted: true });
    expect(captionForVoice(project, video)).toBeNull();
    expect(captionAllVoices(project).count).toBe(0);
  });

  it("sous-titre le son détaché à la place de sa vidéo", () => {
    const { project: base, video } = projectWithVideo();
    const { project, audioId } = detachVideoAudio(base, video.id);
    expect(audioId).toBeTruthy();
    const detached = findItem(project, video.id)!.item as VideoItem;
    expect(captionForVoice(project, detached)!.karaoke!.voiceId).toBe(audioId);

    const result = captionAllVoices(project);
    expect(result.count).toBe(1);
    expect(captions(result.project).map((item) => item.karaoke!.voiceId)).toEqual([audioId]);
    // Déjà sous-titré : rien de plus.
    expect(captionAllVoices(result.project).count).toBe(0);
  });

  it("sous-titre une vidéo transcrite avec les voix du projet", () => {
    const { project, video } = projectWithVideo();
    const result = captionAllVoices(project);
    expect(result.count).toBe(1);
    expect(captions(result.project)[0].karaoke!.voiceId).toBe(video.id);
  });

  it("range la transcription dans tous les éléments qui lisent le média", () => {
    const { project: base, video } = projectWithVideo({}, SOURCE);
    const { project: detachedProject, audioId } = detachVideoAudio(base, video.id);
    const transcript = { provider: "openai" as const, language: "fr", at: 2 };
    const project = setSourceTranscript(detachedProject, SOURCE.ref, WORDS, transcript);
    const audio = findItem(project, audioId!)!.item;
    const updatedVideo = findItem(project, video.id)!.item;
    expect(audio.type === "audio" && audio.source.words).toEqual(WORDS);
    expect(updatedVideo.type === "video" && updatedVideo.source.transcript).toEqual(transcript);
    // Un son transcrit n’est pas une voix de synthèse à relire.
    expect(isVoiceItem(audio)).toBe(false);
    expect(setSourceTranscript(project, "module:clip-studio/assets/autre.mp4", WORDS, transcript)).toBe(project);
  });

  it("garde le comportement des voix de synthèse", () => {
    let project: ClipProject = createProject("Voix", "9:16");
    const voiceSource: MediaSource = { url: "/v.wav", ref: "module:clip-studio/assets/v.wav", name: "Voix off", kind: "audio", durationMs: 12_000, words: WORDS };
    project = addItem(project, { id: "a-voice", type: "audio", start: 0, duration: 120, source: voiceSource, trimStart: 15, volume: 1, fadeIn: 0, fadeOut: 0 });
    const voice = findItem(project, "a-voice")!.item;
    const caption = captionForVoice(project, voice as Extract<ClipItem, { type: "audio" }>)!;
    // Tous les mots, sans filtre ni mise à l’échelle.
    expect(caption.karaoke!.words).toEqual(WORDS);
    expect(caption.karaoke!.offset).toBe(15);
    expect(isVoiceItem(voice)).toBe(true);
  });
});
