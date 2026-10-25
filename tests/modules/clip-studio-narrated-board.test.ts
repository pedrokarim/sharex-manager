import { describe, expect, it } from "vitest";
import { buildNarratedProject, coverTimeline, illustrationsOf, narrationWords } from "@/modules/clip-studio/engine/narrated-board";
import { beatPlanPrompt, FULL_ILLUSTRATION_MIN_MS, readBeatPlan, screenText } from "@/modules/clip-studio/engine/take-plan";
import { cameraRegion, takeGeometry } from "@/modules/clip-studio/engine/take-templates";
import { buildFromTemplate, type FreeData, type VoiceClip } from "@/modules/clip-studio/engine/templates";
import { projectDuration } from "@/modules/clip-studio/engine/timeline";
import type { ClipProject, MediaSource, TextItem, TimedWord } from "@/modules/clip-studio/engine/types";
import { narratedMontage, recentMontages } from "@/modules/clip-studio/lib/board-montage";

const FPS = 30;

/** Une voix d'essai : ses mots répartis régulièrement sur sa durée. */
function voice(name: string, sentence: string, seconds: number): VoiceClip {
  const tokens = sentence.split(" ");
  const span = (seconds * 1000) / tokens.length;
  const words: TimedWord[] = tokens.map((text, index) => ({ text, startMs: Math.round(index * span), endMs: Math.round((index + 1) * span - 30) }));
  return { durationMs: seconds * 1000, source: { url: `/${name}.wav`, ref: `module:clip-studio/assets/${name}.wav`, name: `${name}.wav`, kind: "audio", words } };
}

const image = (name: string): MediaSource => ({ url: `/${name}.jpg`, ref: `module:clip-studio/assets/${name}.jpg`, name, kind: "image", width: 1920, height: 1080 });

const DATA: FreeData = {
  title: "Huit régions à fouiller",
  outro: "Coche ta prochaine découverte.",
  scenes: [
    { heading: "Huit régions", text: "Cette carte couvre les huit régions du jeu.", image: image("carte"), voice: voice("v1", "Cette carte couvre les huit régions du jeu.", 3.2) },
    { heading: "Les filtres", text: "Les filtres isolent ce que tu as oublié, catégorie par catégorie.", image: image("filtres"), voice: voice("v2", "Les filtres isolent ce que tu as oublié, catégorie par catégorie.", 4.4) },
    // Un segment resté sans image : l'illustration d'avant le couvre.
    { heading: "Trouvé", text: "Ouvre une région, choisis un marqueur et coche-le.", voice: voice("v3", "Ouvre une région, choisis un marqueur et coche-le.", 3.6) },
  ],
  voice: { intro: voice("v0", "Huit régions à fouiller.", 1.6), outro: voice("v4", "Coche ta prochaine découverte.", 2) },
};

const base = buildFromTemplate("free", DATA.title!, "9:16", DATA, null);
const words = narrationWords(base);
const durationMs = Math.round((projectDuration(base) / FPS) * 1000);
const at = (prefix: string) => words.findIndex((word) => word.text.toLowerCase().startsWith(prefix));

const RAW_PLAN = {
  hook: "Huit régions à fouiller",
  mood: "energetic",
  emphasis: [at("huit")],
  beats: [
    { word: 0, layout: "split", arrangement: "stack", heading: { text: "Huit régions à fouiller" }, items: [{ kind: "counter", text: "8", unit: "régions", word: at("huit") }, { kind: "chip", text: "toute la carte", word: at("carte") }] },
    { word: at("les"), layout: "full" },
    { word: at("ouvre"), layout: "split", arrangement: "list", items: [{ kind: "card", text: "Ouvre une région", word: at("ouvre") }, { kind: "card", text: "Choisis un marqueur", word: at("choisis") }, { kind: "card", text: "Coche-le", word: at("coche-le") }] },
    { word: at("coche"), layout: "board", arrangement: "single", items: [{ kind: "text", text: "Coche ta prochaine découverte" }] },
  ],
};
const plan = readBeatPlan(RAW_PLAN, words, durationMs, DATA.title, { fullMinMs: FULL_ILLUSTRATION_MIN_MS });

describe("voix off montée en tableaux", () => {
  it("lit les mots de chaque voix à leur place sur la timeline", () => {
    const voices = base.tracks.filter((track) => track.name.startsWith("Voix")).flatMap((track) => track.items).sort((a, b) => a.start - b.start);
    expect(words.length).toBe(DATA.scenes.reduce((count, scene) => count + scene.text!.split(" ").length, 0) + 4 + 4);
    // Le premier mot tombe au début de la voix d'ouverture, le premier mot du segment 1 au début de sa voix.
    expect(words[0].startMs).toBe(Math.round((voices[0].start / FPS) * 1000));
    expect(words[at("cette")].startMs).toBe(Math.round((voices[1].start / FPS) * 1000));
    expect(words.every((word, index) => index === 0 || word.startMs >= words[index - 1].startMs)).toBe(true);
  });

  it("ne laisse aucun trou sous la planche, même pour un segment sans image", () => {
    const total = projectDuration(base);
    const covered = coverTimeline(illustrationsOf(base), total, FPS);
    let cursor = 0;
    for (const item of covered) {
      expect(item.start).toBe(cursor);
      cursor = item.start + item.duration;
    }
    expect(cursor).toBe(total);
  });

  it("remplace la construction d'avant par les tableaux", () => {
    const project = buildNarratedProject({ base, plan, words });
    const names = project.tracks.map((track) => track.name);
    for (const old of ["Textes", "Voile", "Icônes", "Surlignage", "Cadres"]) expect(names.some((name) => name.startsWith(old))).toBe(false);
    expect(names.some((name) => name.startsWith("Mascotte"))).toBe(false);
    expect(names).toContain("Planche – papier");
    expect(names).toContain("Voix");
    // Le compteur fait ses tics, et l'accroche son impact.
    expect(names).toContain("Bruitages – compteurs");
    expect(names).toContain("Bruitages");
    // Sous-titres mot à mot sur la voix, jamais le texte lu posé en bloc.
    const captions = project.tracks.find((track) => track.name === "Sous-titres")!.items as TextItem[];
    expect(captions.length).toBeGreaterThan(0);
    expect(captions.every((caption) => caption.karaoke && caption.karaoke.words.length > 0)).toBe(true);
  });

  it("cadre chaque illustration selon la mise en page du tableau", () => {
    const project = buildNarratedProject({ base, plan, words });
    const geometry = takeGeometry("9:16");
    const pieces = project.tracks.filter((track) => /^Principale/.test(track.name)).flatMap((track) => track.items);
    const full = cameraRegion(geometry, "full");
    const card = cameraRegion(geometry, "split");
    const fullStart = Math.floor((words[at("les")].startMs / 1000) * FPS);
    const inFull = pieces.filter((item) => item.start >= fullStart && item.start < Math.floor((words[at("ouvre")].startMs / 1000) * FPS));
    expect(inFull.length).toBeGreaterThan(0);
    for (const item of inFull) {
      if (item.type !== "image" && item.type !== "video") continue;
      // Le premier plan plein cadre glisse depuis la carte : il arrive au plein cadre par une image clé.
      const target = item.keys?.length ? item.keys[item.keys.length - 1] : item.transform;
      expect(target.width).toBeCloseTo(full.width);
      expect(target.height).toBeCloseTo(full.height);
    }
    const first = pieces[0];
    if (first.type === "image" || first.type === "video") {
      expect(first.transform.height).toBeCloseTo(card.height);
      expect(first.transform.y).toBeCloseTo(card.top + card.height / 2);
    }
  });

  it("donne à Codex la voix, ce que montre chaque image et les mots voulus à l'écran", () => {
    const prompt = beatPlanPrompt({
      words,
      durationMs,
      language: "fr",
      narration: { title: DATA.title!, segments: [{ text: "Cette carte couvre", shows: "la carte des régions" }], notes: ["8 régions"] },
    });
    expect(prompt).toContain("voix off");
    expect(prompt).toContain("illustration plein cadre");
    expect(prompt).toContain("la carte des régions");
    expect(prompt).toContain("« 8 régions »");
    expect(prompt).not.toContain("caméra en bas");
  });

  it("monte la voix off en tableaux avec le plan de Codex, et ne le fait ni pour un quiz ni sans voix", async () => {
    const signal = new AbortController().signal;
    const prompts: string[] = [];
    const deps = {
      ask: async (prompt: string) => {
        prompts.push(prompt);
        return JSON.stringify(RAW_PLAN);
      },
      logo: async () => null,
      projects: () => [],
    };
    const input = { template: "free" as const, title: DATA.title!, aspect: "9:16" as const, data: DATA, theme: null, segmentTexts: DATA.scenes.map((scene) => scene.text!), visualNotes: [{ line: 0, kind: "board" as const, text: "8 régions" }], illustrations: ["carte", "filtres", undefined] };
    const result = await narratedMontage(input, deps, signal);
    expect(result).not.toBeNull();
    expect(result!.montage).toBe("split:stack, full, split:list, board:single");
    expect(result!.project.tracks.some((track) => track.name === "Planche – papier")).toBe(true);
    expect(prompts[0]).toContain("« 8 régions »");
    expect(await narratedMontage({ ...input, template: "quiz" }, deps, signal)).toBeNull();
    const silent: FreeData = { ...DATA, voice: undefined, scenes: DATA.scenes.map(({ voice: _voice, ...scene }) => scene) };
    expect(await narratedMontage({ ...input, data: silent }, deps, signal)).toBeNull();
    await expect(narratedMontage(input, { ...deps, ask: async () => "pas de JSON" }, signal)).rejects.toThrow();
  });

  it("garde les enchaînements récents des prises comme des voix off", () => {
    const project = (origin: ClipProject["origin"], montage: string, createdAt: number) => ({ ...base, origin, createdAt, brandKitId: "kit-a", brief: { prompt: "", title: "", script: [], montage } }) as ClipProject;
    const recent = recentMontages("kit-a", [project("take", "split:row", 1), project("assistant", "board:hub", 3), project(undefined, "full", 4)]);
    expect(recent).toEqual(["board:hub", "split:row"]);
  });

  it("retire des textes de planche les symboles sans dessin et garde la ponctuation avec son mot", () => {
    expect(screenText("Trouvé ✓", 40)).toBe("Trouvé");
    expect(screenText("Bravo 🎉 !", 40)).toBe("Bravo !");
    expect(screenText("Qu’as-tu oublié ?", 40)).toBe("Qu’as-tu oublié ?");
  });
});
