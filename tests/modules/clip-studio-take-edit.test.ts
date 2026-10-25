import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// Les données du module vivent dans un répertoire temporaire, jamais dans `modules/clip-studio/data`.
const store = vi.hoisted(() => ({ assets: [] as any[], projects: [] as any[], root: "" }));
vi.mock("@/modules/clip-studio/lib/store", async () => {
  const nodeFs = await import("node:fs");
  const nodeOs = await import("node:os");
  const nodePath = await import("node:path");
  const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "sxm-take-edit-"));
  store.root = root;
  const DATA_DIR = nodePath.join(root, "data");
  const ASSETS_DIR = nodePath.join(DATA_DIR, "assets");
  return {
    DATA_DIR,
    ASSETS_DIR,
    ensureDirs: () => nodeFs.mkdirSync(ASSETS_DIR, { recursive: true }),
    readAssets: () => store.assets.map((asset) => ({ ...asset })),
    writeAssets: (assets: unknown[]) => {
      store.assets = assets as any[];
    },
    listProjectFiles: () => store.projects,
    writeProject: (project: any) => {
      store.projects = [project, ...store.projects.filter((entry) => entry.id !== project.id)];
    },
  };
});
vi.mock("@/modules/clip-studio/lib/codex", () => ({
  askCodex: async () => {
    throw new Error("Codex n'est pas appelé dans les tests.");
  },
  extractJson: (text: string) => JSON.parse(text),
}));
vi.mock("@/lib/modules/module-manager.api", () => ({ apiModuleManager: { callModuleFunction: async () => null } }));
vi.mock("@/lib/config", () => ({ getAbsoluteUploadPath: () => path.join(store.root, "uploads") }));

import {
  cutTake,
  droppedWords,
  editDecisionList,
  energyFrames,
  findRetakes,
  keptRanges,
  mapSourceTime,
  mergeRanges,
  quietRuns,
  quietThreshold,
  rebaseWords,
  restarts,
  silenceCuts,
  SILENCE_PRESETS,
  speechOnset,
  takeKey,
  cleanTakeSpeed,
  type Range,
} from "@/modules/clip-studio/engine/take-cut";
import { beatPlanPrompt, beatSpans, captionHideSpans, FULL_CAMERA_MIN_MS, numberedTranscript, planSignature, readBeatPlan, readSceneItem, screenText, SCENE_ARRANGEMENTS } from "@/modules/clip-studio/engine/take-plan";
import { logoKey, sceneBoard } from "@/modules/clip-studio/engine/take-scenes";
import { compileBoard } from "@/modules/clip-studio/engine/board";
import { keyedFrame } from "@/modules/clip-studio/engine/keys";
import { buildTakeProject, cameraPieces, cameraTransform, emphasisColor, fillCameraCadence, takeBeatSounds, takeGeometry } from "@/modules/clip-studio/engine/take-templates";
import { faceInFrame, isSkin, medianFocus } from "@/modules/clip-studio/lib/take-face";
import { cleanTakeRequest, getTakeEditJob, startTakeEdit, stretchedAsset, takeDeps, type TakeEditJob } from "@/modules/clip-studio/lib/take-edit";
import { voiceWindows } from "@/modules/clip-studio/engine/mix";
import { ASSETS_DIR } from "@/modules/clip-studio/lib/store";
import type { ClipAsset, MediaSource, TextItem, TimedWord, VideoItem, AudioItem } from "@/modules/clip-studio/engine/types";

// ─── Outils ──────────────────────────────────────────────────────

/** Mots d'une phrase, un toutes les `stepMs`, chacun de `lengthMs`. */
function phrase(text: string, startMs: number, stepMs = 300, lengthMs = 260): TimedWord[] {
  return text.split(" ").map((word, index) => ({ text: word, startMs: startMs + index * stepMs, endMs: startMs + index * stepMs + lengthMs }));
}

/** Énergie par tranches de 10 ms : −20 dB pendant les mots, −70 dB ailleurs. */
function framesFor(durationMs: number, words: TimedWord[]): Float32Array {
  const frames = new Float32Array(Math.ceil(durationMs / 10)).fill(-70);
  for (const word of words) for (let ms = word.startMs; ms < word.endMs; ms += 10) frames[Math.floor(ms / 10)] = -20;
  return frames;
}

/** Éléments des planches, toutes pistes réunies. */
const boardOf = (project: { tracks: { name: string; items: any[] }[] }) => project.tracks.filter((track) => /^Planche/.test(track.name)).flatMap((track) => track.items);

const total = (ranges: Range[]) => ranges.reduce((sum, range) => sum + range.endMs - range.startMs, 0);

// ─── Blancs ──────────────────────────────────────────────────────

describe("énergie et blancs", () => {
  it("mesure le niveau par tranches de 10 ms et trouve les passages calmes", () => {
    const rate = 16000;
    const samples = new Float32Array(rate); // une seconde : 0,5 s de silence puis un son
    for (let i = rate / 2; i < rate; i++) samples[i] = Math.sin(i / 5) * 0.5;
    const frames = energyFrames(samples, rate);
    expect(frames.length).toBe(100);
    expect(frames[10]).toBeLessThan(-100);
    expect(frames[80]).toBeGreaterThan(-12);
    const threshold = quietThreshold(frames);
    expect(quietRuns(frames, threshold, 300)).toEqual([{ startMs: 0, endMs: 500 }]);
  });

  it("réunit blancs du son et trous entre les mots, en gardant des marges autour de la parole", () => {
    const words = [...phrase("Bonjour à tous.", 500), ...phrase("On commence tout de suite.", 3000)];
    const frames = framesFor(5000, words);
    const preset = SILENCE_PRESETS.normal;
    const cuts = silenceCuts(words, frames, preset, 5000);
    // Début, blanc du milieu, fin.
    expect(cuts.length).toBe(3);
    const middle = cuts[1];
    const lastOfFirst = words[2];
    const firstOfSecond = words[3];
    // Après une fin de phrase, la marge est celle d'une phrase ; avant la reprise, celle du réglage.
    expect(middle.startMs).toBe(lastOfFirst.endMs + preset.sentencePadMs);
    expect(middle.endMs).toBe(firstOfSecond.startMs - preset.padAfterMs);
    // Aucune coupe ne touche un mot.
    for (const cut of cuts) for (const word of words) expect(cut.endMs <= word.startMs || cut.startMs >= word.endMs).toBe(true);
  });

  it("ne coupe pas un blanc plus court que le seuil, et le doux en garde plus que le serré", () => {
    const words = [...phrase("Un deux", 0), ...phrase("trois quatre", 900)];
    const frames = framesFor(1600, words);
    const inner = (mode: "soft" | "tight") => silenceCuts(words, frames, SILENCE_PRESETS[mode], 1600).filter((cut) => cut.startMs > 100 && cut.endMs < 1500);
    expect(inner("soft")).toEqual([]);
    expect(inner("tight").length).toBe(1);
  });

  it("ne rogne pas un mot que Whisper fait commencer trop tard", () => {
    const real = phrase("Alors voilà", 2000);
    const frames = framesFor(4000, [...phrase("Bon.", 200), ...real]);
    const late = [...phrase("Bon.", 200), ...real.map((word) => ({ ...word, startMs: word.startMs + 150, endMs: word.endMs + 150 }))];
    const cuts = silenceCuts(late, frames, SILENCE_PRESETS.normal, 4000);
    const middle = cuts.find((cut) => cut.startMs > 400 && cut.startMs < 2000)!;
    expect(middle.endMs).toBeLessThanOrEqual(2000 - SILENCE_PRESETS.normal.padAfterMs);
    expect(speechOnset(frames, quietThreshold(frames), 2150)).toBe(2000);
  });

  it("réunit des passages qui se chevauchent", () => {
    expect(mergeRanges([{ startMs: 500, endMs: 900 }, { startMs: 0, endMs: 100 }, { startMs: 800, endMs: 1200 }])).toEqual([
      { startMs: 0, endMs: 100 },
      { startMs: 500, endMs: 1200 },
    ]);
  });
});

// ─── Reprises ────────────────────────────────────────────────────

describe("reprises et faux départs", () => {
  it("garde la dernière tentative complète", () => {
    const words = [...phrase("Alors aujourd’hui on va…", 0), ...phrase("Alors aujourd’hui on va voir comment monter une prise.", 2500)];
    const retakes = findRetakes(words);
    expect(retakes).toEqual([{ first: 0, last: 3, reason: "restart", text: "Alors aujourd’hui on va…" }]);
  });

  it("suit une chaîne de faux départs, et un faux départ sans ponctuation suivi d'un blanc", () => {
    const words = [...phrase("Le résultat", 0), ...phrase("Le résultat c'est", 1500), ...phrase("Le résultat, c'est une vidéo plus courte.", 3500)];
    const retakes = findRetakes(words);
    expect(retakes.map((retake) => retake.text)).toEqual(["Le résultat", "Le résultat c'est"]);
  });

  it("retire une phrase faite d'hésitations, un mot bégayé et une reprise annoncée", () => {
    const words = [
      ...phrase("Euh…", 0),
      ...phrase("Je, je pense que c'est bien.", 1200),
      ...phrase("On a gagné trois", 4000),
      ...phrase("Je recommence. On a gagné deux heures.", 6000),
    ];
    const retakes = findRetakes(words);
    expect(retakes.map((retake) => retake.reason)).toEqual(["filler", "stutter", "marker", "marker"]);
    expect(retakes.find((retake) => retake.reason === "stutter")?.text).toBe("Je,");
  });

  it("laisse les répétitions voulues et les phrases complètes plus longues", () => {
    expect(findRetakes(phrase("Nous nous sommes trompés.", 0))).toEqual([]);
    const words = [...phrase("C'est simple et rapide à faire chez soi.", 0), ...phrase("C'est simple.", 4000)];
    expect(findRetakes(words)).toEqual([]);
    expect(restarts(["on", "va"], ["et", "on", "va"])).toBe(false);
    expect(takeKey("Aujourd’hui,")).toBe("aujourdhui");
  });
});

// ─── Montage et temps ────────────────────────────────────────────

describe("liste des décisions et temps du montage", () => {
  const words = [...phrase("Alors aujourd’hui on va…", 600), ...phrase("Alors aujourd’hui on va voir.", 3500), ...phrase("Voilà le résultat.", 6500)];
  const frames = framesFor(9000, words);
  const result = cutTake({ words, frames, durationMs: 9000, mode: "normal", removeRetakes: true });

  it("coupe blancs et reprise, et le compte", () => {
    expect(result.retakes.map((retake) => retake.text)).toEqual(["Alors aujourd’hui on va…"]);
    expect(result.retakeMs).toBeGreaterThan(1000);
    expect(result.silenceMs).toBeGreaterThan(1500);
    // Les passages gardés couvrent tous les mots gardés.
    const dropped = droppedWords(result.retakes);
    words.forEach((word, index) => {
      if (dropped.has(index)) return;
      expect(result.kept.some((range) => range.startMs <= word.startMs && range.endMs >= word.endMs)).toBe(true);
    });
  });

  it("place les passages bout à bout, sans dérive, vitesse comprise", () => {
    const segments = editDecisionList([result.kept, [{ startMs: 0, endMs: 1000 }]], 30, 1.1);
    for (let index = 1; index < segments.length; index++) expect(segments[index].start).toBe(segments[index - 1].start + segments[index - 1].duration);
    expect(segments[segments.length - 1].take).toBe(1);
    const first = segments[0];
    expect(mapSourceTime(segments, 0, (first.sourceStart / 30) * 1000, 30, 1.1)).toBe(0);
    expect(mapSourceTime(segments, 0, 10, 30, 1.1)).toBeNull();
  });

  it("recale les mots gardés, sans chevauchement, sans les mots coupés", () => {
    const segments = editDecisionList([result.kept], 30, 1);
    const rebased = rebaseWords(words, 0, segments, 30, 1, droppedWords(result.retakes));
    expect(rebased.map((word) => word.text).join(" ")).toBe("Alors aujourd’hui on va voir. Voilà le résultat.");
    for (let index = 1; index < rebased.length; index++) {
      expect(rebased[index].startMs).toBeGreaterThan(rebased[index - 1].startMs);
      expect(rebased[index - 1].endMs).toBeLessThanOrEqual(rebased[index].startMs);
    }
    const end = segments[segments.length - 1];
    expect(rebased[rebased.length - 1].endMs).toBeLessThanOrEqual(((end.start + end.duration) / 30) * 1000 + 1);
    // Le premier mot gardé arrive vite : le faux départ et les blancs du début sont partis.
    expect(rebased[0].startMs).toBeLessThan(200);
  });

  it("abandonne les restes trop courts entre deux coupes", () => {
    expect(keptRanges(1000, [{ startMs: 0, endMs: 400 }, { startMs: 450, endMs: 1000 }])).toEqual([]);
    expect(cleanTakeSpeed("9")).toBe(1.3);
    expect(cleanTakeSpeed(undefined)).toBe(1.1);
  });
});

// ─── Plan des temps forts ────────────────────────────────────────

const editWords = phrase(
  "J’ai réduit mon montage de trois heures à vingt minutes. Le secret, c’est Notion. Il y a trois étapes : couper, nettoyer, sous-titrer. Franchement la première fois que je l’ai vu j’ai cru à une erreur mais non tout était là.",
  0,
  400,
  350
);
const DURATION = editWords[editWords.length - 1].endMs + 300;

describe("plan des temps forts", () => {
  it("écrit la transcription numérotée comme une donnée", () => {
    const prompt = beatPlanPrompt({ words: editWords, durationMs: DURATION, language: "fr" });
    expect(prompt).toContain("<transcription>");
    expect(prompt).toContain("#0 J’ai");
    expect(numberedTranscript(editWords).split("\n")[0]).toMatch(/^\[0\.0 s\] #0 J’ai/);
  });

  it("lit les objets d'un tableau avec rigueur", () => {
    expect(readSceneItem({ kind: "counter", text: "vingt" }, 10)).toBeUndefined();
    expect(readSceneItem({ kind: "counter", text: "20 min", unit: "de montage", word: 3 }, 10)).toEqual({ kind: "counter", text: "20 min", unit: "de montage", word: 3 });
    // Un mot mis en valeur doit être un mot du texte ; un mot hors de la prise est ignoré.
    expect(readSceneItem({ kind: "text", text: "Deux fois plus court", pill: "trois fois", word: 99 }, 10)).toEqual({ kind: "text", text: "Deux fois plus court" });
    expect(readSceneItem({ kind: "card", text: "Couper", strike: 4, cross: 5 }, 10)).toEqual({ kind: "card", text: "Couper", strike: 4, cross: 5 });
    expect(readSceneItem({ kind: "magic", text: "x" }, 10)).toBeUndefined();
    expect(screenText("Avant — après", 40)).toBe("Avant, après");
    expect(screenText("un texte bien trop long pour une planche de short", 20)).toMatch(/…$/);
  });

  it("répare le plan : accroche au mot 0, indices bornés, plein cadre de 5 s au moins", () => {
    const plan = readBeatPlan(
      {
        hook: "3 h → 20 min",
        mood: "happy",
        emphasis: [9, 999, "x"],
        beats: [
          { word: 7, layout: "split", arrangement: "single", items: [{ kind: "counter", text: "20 min", word: 8 }], payoff: true },
          { word: 7, layout: "split", items: [{ kind: "text", text: "doublon" }] },
          // Ancienne forme : une planche par temps fort, encore lue.
          { word: 13, layout: "split", board: { kind: "logo", name: "Notion" } },
          { word: 14, layout: "full" },
          { word: 16, layout: "split", arrangement: "list", items: [{ kind: "card", text: "Couper", word: 20 }, { kind: "card", text: "Nettoyer", word: 21 }, { kind: "card", text: "Sous-titrer", word: 2 }], payoff: true },
          { word: 24, layout: "full" },
          { word: 25, layout: "full" },
          { word: 500, layout: "split", board: { kind: "title", text: "hors bornes" } },
          { word: 30, layout: "split" },
        ],
      },
      editWords,
      DURATION
    );
    expect(plan.beats[0]).toMatchObject({ word: 0, layout: "split", heading: { text: "3 h → 20 min" } });
    expect(plan.beats[2]).toMatchObject({ arrangement: "single", items: [{ kind: "logo", text: "Notion" }] });
    // Un objet n'entre jamais avant le début de son tableau.
    expect(plan.beats[3].items!.map((item) => item.word)).toEqual([20, 21, 16]);
    expect(plan.emphasis).toEqual([9]);
    expect(plan.beats.map((beat) => beat.word)).toEqual([0, 7, 13, 16, 24]);
    // Le plein cadre du mot 14 durait 0,8 s : écarté. Ceux des mots 24 et 25 n'en font qu'un, de plus de 5 s.
    const spans = beatSpans(plan, editWords, Math.round((DURATION / 1000) * 30), 30);
    for (const span of spans) if (span.beat.layout === "full") expect(((span.end - span.start) / 30) * 1000).toBeGreaterThanOrEqual(FULL_CAMERA_MIN_MS - 34);
    expect(plan.beats.filter((beat) => beat.payoff).length).toBeLessThanOrEqual(2);
  });

  it("sans réponse lisible, pose au moins l'accroche", () => {
    const plan = readBeatPlan(null, editWords, DURATION);
    expect(plan.beats).toHaveLength(1);
    expect(plan.beats[0].heading?.text).toBe(plan.hook);
    expect(plan.mood).toBe("inspiring");
  });

  it("tait les sous-titres sous une planche qui écrit ce qui est dit", () => {
    const plan = readBeatPlan(
      { hook: "Monter vite", beats: [{ word: 16, layout: "split", arrangement: "list", items: [{ kind: "card", text: "couper" }, { kind: "card", text: "nettoyer" }, { kind: "card", text: "sous-titrer" }] }, { word: 24, layout: "full" }] },
      editWords,
      DURATION
    );
    const spans = beatSpans(plan, editWords, Math.round((DURATION / 1000) * 30), 30);
    const hidden = captionHideSpans(spans, editWords, 30);
    // Seulement pendant que les mots écrits sont prononcés (« couper, nettoyer, sous-titrer »), pas toute la plage.
    const first = editWords.findIndex((word) => word.text.startsWith("couper"));
    const last = editWords.findIndex((word) => word.text.startsWith("sous-titrer"));
    expect(hidden).toEqual([{ start: Math.floor((editWords[first].startMs / 1000) * 30), end: Math.ceil(((editWords[last].endMs + 330) / 1000) * 30) }]);
    expect(hidden[0].start).toBeGreaterThan(spans[1].start);
  });
});

describe("tableaux posés sur la grille", () => {
  const fps = 30;
  const frame = { width: 1080, height: 1920 };
  const geometry = takeGeometry("9:16");
  const logo: MediaSource = { url: "/api/modules/clip-studio/data/assets/logo.png", ref: "module:clip-studio/assets/logo.png", name: "Notion", kind: "image", width: 512, height: 512 };
  const items: Record<string, object[]> = {
    single: [{ kind: "counter", text: "400 000", unit: "vues", word: 3 }],
    row: [{ kind: "logo", text: "Notion", word: 2, cross: 6 }, { kind: "logo", text: "Figma", word: 3, cross: 6 }, { kind: "logo", text: "Canva", word: 4, cross: 6 }],
    list: [{ kind: "card", text: "Couper les blancs", word: 2 }, { kind: "card", text: "Nettoyer le son", word: 3 }, { kind: "card", text: "Sous-titrer", word: 4, strike: 6 }, { kind: "note", text: "Et pourquoi ?", word: 5 }],
    hub: [{ kind: "card", text: "Apprendre à réfléchir", word: 1 }, ...["Promesse", "Concret", "Relance", "Tension", "Preuve"].map((text, index) => ({ kind: "chip", text, word: 2 + index }))],
    versus: [{ kind: "card", text: "Avant : 3 h", word: 2, cross: 5 }, { kind: "card", text: "Après : 20 min", word: 4 }],
    stack: [{ kind: "counter", text: "16 709", unit: "réels", word: 2 }, { kind: "chip", text: "56 créateurs", word: 4 }],
  };

  for (const arrangement of SCENE_ARRANGEMENTS) {
    for (const layout of ["split", "board"] as const) {
      it(`pose « ${arrangement} » en ${layout} sans chevauchement ni débordement`, () => {
        const span = { start: 30, end: 300, beat: { word: 1, layout, arrangement, heading: { text: "Un titre de tableau", pill: "titre" }, items: items[arrangement] } };
        const spec = sceneBoard(span as never, { fps, frame, geometry, logos: new Map([0, 1, 2].map((index) => [logoKey(0, index), logo])), index: 0, opening: false });
        const compiled = compileBoard(spec!, { fps, frame, words: editWords });
        expect(compiled.issues).toEqual([]);
        expect(compiled.items.length).toBeGreaterThan(1);
      });
    }
  }

  it("donne à Codex les enchaînements des derniers montages, pour ne pas les refaire", () => {
    const prompt = beatPlanPrompt({ words: editWords, durationMs: DURATION, recent: ["split:single, split:list, full"] });
    expect(prompt).toContain("split:single, split:list, full");
    expect(planSignature({ beats: [{ word: 0, layout: "split", arrangement: "row" }, { word: 4, layout: "full" }, { word: 9, layout: "board", arrangement: "hub" }] })).toBe("split:row, full, board:hub");
  });
});

describe("mascotte sur la planche", () => {
  const pose = (id: string, emotion: string): { id: string; source: MediaSource; tags: any } => ({
    id,
    source: { url: `/api/modules/clip-studio/data/assets/${id}.png`, ref: `module:clip-studio/assets/${id}.png`, name: id, kind: "image", width: 600, height: 800 },
    tags: { emotion, gesture: "idle", framing: "full", facing: "front" },
  });
  const library = [pose("joie-1", "joy"), pose("joie-2", "joy"), pose("surprise", "surprise"), pose("doute", "doubt")];

  it("réagit trois fois au plus, une fois par tableau, et seulement là où elle se pose", () => {
    const mascot = (word: number, text = "joy") => ({ kind: "mascot", text, word });
    const plan = readBeatPlan(
      {
        hook: "Accroche",
        beats: [
          { word: 1, layout: "split", arrangement: "stack", items: [{ kind: "counter", text: "20 min", word: 2 }, mascot(3), mascot(4)] },
          { word: 7, layout: "split", arrangement: "list", items: [{ kind: "card", text: "Un", word: 8 }, { kind: "card", text: "Deux", word: 9 }, mascot(10)] },
          { word: 13, layout: "split", arrangement: "row", items: [{ kind: "logo", text: "Notion", word: 13 }, mascot(14, "surprise")] },
          { word: 16, layout: "split", arrangement: "single", items: [mascot(16, "doubt")] },
          { word: 20, layout: "split", arrangement: "single", items: [mascot(20, "pride")] },
          { word: 24, layout: "split", arrangement: "single", items: [mascot(24, "colère inventée")] },
        ],
      },
      editWords,
      DURATION
    );
    const counts = plan.beats.map((beat) => (beat.items ?? []).filter((item) => item.kind === "mascot").length);
    expect(Math.max(...counts)).toBeLessThanOrEqual(1);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(3);
    // Pas dans une liste ; une émotion hors de la liste fermée est ignorée.
    expect(plan.beats.find((beat) => beat.arrangement === "list")!.items!.some((item) => item.kind === "mascot")).toBe(false);
    // Le tableau qui n'avait qu'une mascotte de trop disparaît, au lieu de laisser un papier vide.
    expect(plan.beats.every((beat) => beat.layout === "full" || beat.heading || (beat.items?.length ?? 0) > 0)).toBe(true);
    expect(beatPlanPrompt({ words: editWords, durationMs: DURATION, mascot: true })).toContain('"kind": "mascot"');
    expect(beatPlanPrompt({ words: editWords, durationMs: DURATION })).not.toContain('"kind": "mascot"');
  });

  it("choisit la pose de l'émotion, sans montrer deux fois de suite la même", () => {
    const usedPoses: string[] = [];
    const context = { fps: 30, frame: { width: 1080, height: 1920 }, geometry: takeGeometry("9:16"), index: 0, opening: false, mascot: { library, reactions: [] }, usedPoses };
    const picks = [0, 1, 2].map(() => {
      const spec = sceneBoard({ start: 0, end: 90, beat: { word: 0, layout: "split", arrangement: "single", items: [{ kind: "mascot", text: "joy" }] } }, context);
      const image = spec!.actors.find((actor) => actor.kind === "image") as { source: MediaSource } | undefined;
      return image?.source.ref;
    });
    expect(picks.every(Boolean)).toBe(true);
    expect(picks[0]).not.toBe(picks[1]);
    expect(picks[1]).not.toBe(picks[2]);
    for (const ref of picks) expect(ref).toMatch(/joie-/);
    // Sans mascotte dans la marque, rien n'est posé.
    const none = sceneBoard({ start: 0, end: 90, beat: { word: 0, layout: "split", arrangement: "single", items: [{ kind: "mascot", text: "joy" }] } }, { ...context, mascot: undefined });
    expect(none!.actors).toEqual([]);
  });
});

describe("interfaces recréées", () => {
  const fps = 30;
  const frame = { width: 1080, height: 1920 };
  const geometry = takeGeometry("9:16");
  const interfaces: Record<string, object> = {
    terminal: { kind: "terminal", title: "studio", lines: [{ text: "studio-script audit", kind: "command", word: 3 }, { text: "Lecture…", kind: "output", word: 5 }, { text: "Accroche 7/10", kind: "ok", word: 7 }] },
    prompt: { kind: "prompt", text: "Écris-moi trois accroches sur le montage", word: 3 },
    phone: { kind: "phone", title: "Statistiques", label: "Vues", text: "440 765", word: 4 },
    tree: { kind: "tree", title: "Scripts", lines: [{ text: "trois-videos.md", word: 3 }, { text: "effets.md", word: 5 }] },
  };

  it("lit les interfaces avec rigueur et ne les pose que seules ou en pile", () => {
    expect(readSceneItem({ kind: "terminal", lines: [] }, 10)).toBeUndefined();
    expect(readSceneItem({ kind: "phone", text: "beaucoup" }, 10)).toBeUndefined();
    expect(readSceneItem({ kind: "terminal", title: "studio", lines: [{ text: "ls", kind: "command", word: 2 }, { text: "x", kind: "inconnu", word: 99 }] }, 10)).toEqual({ kind: "terminal", text: "studio", lines: [{ text: "ls", kind: "command", word: 2 }, { text: "x" }] });
    const plan = readBeatPlan({ hook: "Accroche", beats: [{ word: 2, layout: "split", arrangement: "row", items: [interfaces.terminal, { kind: "chip", text: "audit", word: 4 }] }] }, editWords, DURATION);
    expect(plan.beats[1].arrangement).toBe("stack");
  });

  for (const [kind, item] of Object.entries(interfaces)) {
    for (const layout of ["split", "board"] as const) {
      it(`pose « ${kind} » en ${layout} sans chevauchement ni débordement`, () => {
        const spec = sceneBoard({ start: 30, end: 300, beat: { word: 1, layout, arrangement: "single", items: [item] } } as never, { fps, frame, geometry, index: 0, opening: false });
        const compiled = compileBoard(spec!, { fps, frame, words: editWords });
        expect(compiled.issues).toEqual([]);
        expect(compiled.items.length).toBeGreaterThan(1);
      });
    }
  }

  it("tape la commande sur son mot, au son des touches", () => {
    const spec = sceneBoard({ start: 0, end: 300, beat: { word: 1, layout: "split", arrangement: "single", items: [interfaces.terminal] } } as never, { fps, frame, geometry, index: 0, opening: false });
    const compiled = compileBoard(spec!, { fps, frame, words: editWords });
    const command = compiled.items.find((entry) => entry.type === "text" && entry.text === "> studio-script audit") as TextItem;
    expect(command.start).toBe(Math.round((editWords[3].startMs / 1000) * fps));
    expect(command.animIn.kind).toBe("typewriter");
    expect(compiled.cues).toContainEqual({ frame: command.start, sound: "type", frames: command.animIn.frames });
  });
});

// ─── Projet monté ────────────────────────────────────────────────

const TAKE: MediaSource = { url: "/api/modules/clip-studio/data/assets/take.mp4", ref: "module:clip-studio/assets/take.mp4", name: "prise.mp4", kind: "video", width: 1920, height: 1080, durationMs: 60_000, hasAudio: true };

describe("projet d'une prise montée", () => {
  const plan = readBeatPlan(
    {
      hook: "3 h → 20 min",
      emphasis: [3, 9],
      beats: [
        { word: 7, layout: "split", arrangement: "stack", items: [{ kind: "counter", text: "20 min", word: 8 }, { kind: "chip", text: "de montage", word: 9 }], payoff: true },
        { word: 13, layout: "split", arrangement: "single", items: [{ kind: "logo", text: "Notion", word: 13 }] },
        { word: 16, layout: "board", arrangement: "list", heading: { text: "Trois étapes", pill: "étapes" }, items: [{ kind: "card", text: "Couper", word: 20 }, { kind: "card", text: "Nettoyer", word: 21 }, { kind: "card", text: "Sous-titrer", word: 22, strike: 23 }], hideCaptions: true },
        { word: 27, layout: "full" },
      ],
    },
    editWords,
    DURATION
  );
  const totalMs = DURATION;
  const segments = editDecisionList([[{ startMs: 1000, endMs: 1000 + totalMs / 2 }, { startMs: 20_000, endMs: 20_000 + totalMs / 2 }]], 30, 1);
  const project = buildTakeProject({ name: "Test", aspect: "9:16", takes: [{ source: TAKE, focus: { x: 0.3, y: 0.4 } }], segments, words: editWords, plan, theme: null, script: ["Une phrase."] });
  const track = (name: string) => project.tracks.find((entry) => entry.name === name)!;
  const fps = project.fps;
  const end = segments[segments.length - 1].start + segments[segments.length - 1].duration;

  it("pose la caméra bout à bout, chaque plan lié à son son sur une piste « Voix »", () => {
    const videos = track("Principale").items as VideoItem[];
    const voices = track("Voix – prise").items as AudioItem[];
    expect(videos.length).toBe(voices.length);
    let cursor = 0;
    for (const video of videos) {
      expect(video.start).toBe(cursor);
      cursor += video.duration;
      const voice = voices.find((entry) => entry.id === video.audioLinkId)!;
      expect(voice).toMatchObject({ linkedVideoId: video.id, start: video.start, duration: video.duration, trimStart: video.trimStart });
    }
    expect(cursor).toBe(end);
    // La musique s'efface sous la prise : son son compte comme une voix.
    expect(voiceWindows(project).length).toBeGreaterThan(0);
    expect(project.origin).toBe("take");
  });

  it("met la caméra plein cadre pour la phrase directe, dans la carte du bas sinon", () => {
    const videos = track("Principale").items as VideoItem[];
    const full = videos.filter((video) => video.label === "Caméra – plein cadre");
    const card = videos.filter((video) => video.label === "Caméra");
    expect(full.length).toBeGreaterThan(0);
    expect(card.length).toBeGreaterThan(0);
    // Le plan plein cadre glisse depuis la carte du bas : on lit son cadre une fois le glissement fini.
    for (const video of full) {
      const settled = keyedFrame(video, video.start + video.duration - 1).transform;
      expect(settled.y - settled.height / 2).toBeLessThanOrEqual(0.0001);
      expect(settled.y + settled.height / 2).toBeGreaterThanOrEqual(0.9999);
    }
    const geometry = takeGeometry("9:16");
    for (const video of card) expect(video.transform.y + video.transform.height / 2).toBeGreaterThanOrEqual(1 - 0.0001);
    expect(geometry.camera.top).toBe(0.6);
  });

  it("ne pose jamais deux éléments au même instant sur une piste", () => {
    for (const entry of project.tracks) {
      const items = [...entry.items].sort((a, b) => a.start - b.start);
      for (let index = 1; index < items.length; index++) expect(items[index].start).toBeGreaterThanOrEqual(items[index - 1].start + items[index - 1].duration);
    }
  });

  it("change quelque chose toutes les 4 s au plus", () => {
    const starts = project.tracks
      .filter((entry) => entry.kind === "visual" && entry.name !== "Sous-titres")
      .flatMap((entry) => entry.items.map((item) => item.start));
    const points = [...new Set([0, ...starts, end])].sort((a, b) => a - b);
    for (let index = 1; index < points.length; index++) expect(points[index] - points[index - 1]).toBeLessThanOrEqual(4 * fps);
  });

  it("tait les sous-titres sous la planche qui les écrit, et colore les mots clés", () => {
    const captions = track("Sous-titres").items as TextItem[];
    const hidden = captionHideSpans(beatSpans(plan, editWords, end, fps), editWords, fps);
    expect(hidden.length).toBeGreaterThan(0);
    for (const window of hidden) for (const caption of captions) expect(caption.start >= window.end || caption.start + caption.duration <= window.start).toBe(true);
    // Hors de ces moments, la parole reste sous-titrée.
    expect(captions.length).toBeGreaterThan(2);
    const emphasized = captions.flatMap((caption) => caption.karaoke!.emphasis?.indices.map((index) => caption.karaoke!.words[index].text) ?? []);
    expect(emphasized).toContain(editWords[3].text);
    // Les mots d'un élément commencent à son début : rien ne s'affiche avant sa place.
    for (const caption of captions) for (const word of caption.karaoke!.words) expect(word.startMs).toBeGreaterThanOrEqual(0);
  });

  it("pose l'accroche lisible dès la première image, et un nom en grand faute de logo officiel", () => {
    const board = boardOf(project);
    const opening = board.filter((item) => item.start === 0 && item.type === "text");
    expect(opening.length).toBeGreaterThan(0);
    // À la première image, le titre de l'accroche est déjà là, entier.
    for (const item of opening) expect(keyedFrame(item, 0).transform.opacity).toBe(1);
    expect(board.some((item) => item.type === "text" && item.text === "Notion")).toBe(true);
    expect(board.some((item) => item.type === "image")).toBe(false);
    // Le compteur entre en comptant, jamais arrêté sur zéro.
    const counter = board.find((item) => item.type === "text" && item.text === "20 min") as TextItem;
    expect(counter.count).toMatchObject({ from: 0, at: 0 });
    expect(counter.start).toBe(Math.round((editWords[8].startMs / 1000) * fps));
  });

  it("glisse le papier vers la planche seule, et la barre tombe sur son mot", () => {
    const papers = boardOf(project).filter((item) => item.label === "Planche – papier");
    expect(papers.some((item) => item.keys?.some((key: { height?: number }) => key.height === 1))).toBe(true);
    const struck = boardOf(project).find((item) => item.type === "text" && item.text === "Sous-titrer") as TextItem;
    expect(struck.marks?.some((mark) => mark.kind === "strike" && mark.at === Math.round((editWords[23].startMs / 1000) * fps) - struck.start)).toBe(true);
    expect(project.brief?.montage).toBe(planSignature(plan));
  });

  it("place un vrai logo quand il est trouvé", () => {
    const logo: MediaSource = { url: "/api/modules/clip-studio/data/assets/logo.png", ref: "module:clip-studio/assets/logo.png", name: "Notion", kind: "image", width: 512, height: 512 };
    const sceneIndex = plan.beats.findIndex((beat) => beat.items?.some((item) => item.kind === "logo"));
    const withLogo = buildTakeProject({ name: "Test", aspect: "9:16", takes: [{ source: TAKE }], segments, words: editWords, plan, logos: new Map([[logoKey(sceneIndex, 0), logo]]), theme: null });
    expect(boardOf(withLogo).some((item) => item.type === "image" && item.source.ref === logo.ref)).toBe(true);
  });

  it("fait tiquer le compteur qui défile et pose un coup sourd quand son chiffre arrive, sans bruit d'entrée", () => {
    const ticks = project.tracks.find((entry) => entry.name === "Bruitages – compteurs");
    const thuds = project.tracks.find((entry) => entry.name === "Bruitages – planche");
    expect(ticks?.items.length).toBeGreaterThan(2);
    expect(ticks!.items.length).toBeLessThanOrEqual(7);
    expect(thuds?.items.length).toBeGreaterThan(0);
    // Les tics commencent quand le compteur entre, jamais avant.
    const counter = boardOf(project).find((item) => item.type === "text" && item.text === "20 min") as TextItem;
    for (const tick of ticks!.items) expect(tick.start).toBeGreaterThanOrEqual(counter.start);
  });

  it("ne met des bruitages que sur l'accroche et les vrais temps forts", () => {
    const sounds = takeBeatSounds(plan, editWords, end, fps);
    expect(sounds.length).toBeLessThanOrEqual(3);
    expect(sounds[0].start).toBe(0);
    for (let index = 1; index < sounds.length; index++) expect(sounds[index].start - sounds[index - 1].start).toBeGreaterThanOrEqual(fps);
  });

  it("choisit pour les mots clés une teinte lisible sur le contour", () => {
    const caption = (track("Sous-titres").items as TextItem[])[0];
    const color = emphasisColor({ ...caption, style: { ...caption.style, stroke: { color: "#000000", width: 0.1 } }, karaoke: { ...caption.karaoke!, highlight: "#facc15" } }, null);
    expect(color).not.toBe("#facc15");
  });
});

describe("cadrage de la caméra", () => {
  const frame = { width: 1080, height: 1920 };
  it("met le visage au centre sans découvrir de bord", () => {
    const region = { left: 0, top: 0, width: 1, height: 1 };
    const transform = cameraTransform({ width: 1920, height: 1080 }, { x: 0.3, y: 0.4 }, region, frame, 1);
    expect(transform.x - transform.width / 2).toBeLessThanOrEqual(0);
    expect(transform.x + transform.width / 2).toBeGreaterThanOrEqual(1);
    // Le visage (30 % de l'image) tombe au centre du cadre.
    const faceX = transform.x - transform.width / 2 + 0.3 * transform.width;
    expect(Math.abs(faceX - 0.5)).toBeLessThan(0.01);
    // Un visage collé au bord : la boîte reste calée sur le bord.
    const edge = cameraTransform({ width: 1920, height: 1080 }, { x: 0.02, y: 0.4 }, region, frame, 1);
    expect(edge.x - edge.width / 2).toBeCloseTo(0, 6);
  });

  it("coupe un trop long plan pour changer le cadrage", () => {
    const pieces = cameraPieces([{ take: 0, sourceStart: 0, sourceEnd: 600, start: 0, duration: 600 }], [{ beat: { word: 0, layout: "full" }, start: 0, end: 600 }]);
    const filled = fillCameraCadence(pieces, [], 600, 30);
    expect(filled.length).toBeGreaterThanOrEqual(5);
    for (const piece of filled) expect(piece.end - piece.start).toBeLessThanOrEqual(120);
    for (let index = 1; index < filled.length; index++) expect(filled[index].zoomStep).not.toBe(filled[index - 1].zoomStep);
  });
});

describe("visage", () => {
  it("reconnaît une teinte de peau et pas un gris", () => {
    expect(isSkin(224, 172, 140)).toBe(true);
    expect(isSkin(128, 128, 128)).toBe(false);
    expect(isSkin(40, 90, 200)).toBe(false);
  });

  it("trouve un visage dessiné à sa place, et la médiane de plusieurs images", () => {
    const width = 160;
    const height = 90;
    const rgb = new Uint8Array(width * height * 3).fill(120);
    // Une ellipse de peau centrée en (40, 30), sur un fond gris.
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        if (((x - 40) / 12) ** 2 + ((y - 30) / 16) ** 2 > 1) continue;
        rgb.set([224, 172, 140], (y * width + x) * 3);
      }
    const face = faceInFrame(rgb, width, height)!;
    expect(face.x).toBeCloseTo(40.5 / 160, 2);
    expect(face.y).toBeGreaterThan(0.15);
    expect(face.y).toBeLessThan(0.45);
    expect(faceInFrame(new Uint8Array(width * height * 3).fill(120), width, height)).toBeNull();
    expect(medianFocus([{ x: 0.3, y: 0.4 }, null, { x: 0.32, y: 0.42 }, { x: 0.9, y: 0.9 }])).toEqual({ x: 0.32, y: 0.42 });
    expect(medianFocus([{ x: 0.3, y: 0.4 }, null])).toBeNull();
  });
});

// ─── Travail complet (moteurs simulés) ───────────────────────────

describe("travail « Monter ma prise »", () => {
  it("refuse une demande sans prise et nettoie les réglages", () => {
    expect(() => cleanTakeRequest({ sources: [] })).toThrow(/au moins une prise/);
    expect(() => cleanTakeRequest({ sources: [{ assetFile: "../x" }] })).toThrow();
    const request = cleanTakeRequest({ sources: [{ assetFile: "take.mp4" }], speed: 9, silence: "bizarre", aspect: "21:9" });
    expect(request).toMatchObject({ speed: 1.3, silence: "normal", aspect: "9:16", removeRetakes: true, music: true });
  });

  it("recale les mots de la version accélérée", () => {
    const source: ClipAsset = { file: "take.mp4", kind: "video", originalName: "Ma prise.mp4", size: 10, durationMs: 11_000, createdAt: 0 };
    const asset = stretchedAsset(source, "take-x.mp4", 9, { durationSec: 10, width: 1920, height: 1080, video: { codec: "h264", attached: false }, audio: { codec: "aac" } }, 1.1, [{ text: "Bonjour", startMs: 1100, endMs: 2200 }]);
    expect(asset.originalName).toBe("Ma prise (×1,1).mp4");
    expect(asset.words).toEqual([{ text: "Bonjour", startMs: 1000, endMs: 2000 }]);
    expect(asset.durationMs).toBe(10_000);
  });

  it("monte une prise de bout en bout : transcription, coupe, plan, logo, projet enregistré", async () => {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
    fs.writeFileSync(path.join(ASSETS_DIR, "take.mp4"), "video");
    store.assets = [{ file: "take.mp4", kind: "video", originalName: "Ma prise.mp4", size: 5, width: 1920, height: 1080, durationMs: 9000, hasAudio: true, createdAt: 0 }];
    store.projects = [];
    const words = [...phrase("Alors aujourd’hui on va…", 600), ...phrase("Alors aujourd’hui on va voir Notion.", 3500), ...phrase("Voilà le résultat.", 6500)];
    const calls: string[] = [];
    Object.assign(takeDeps, {
      transcribe: async (_file: string, options: { verbatim?: boolean }) => {
        calls.push(`transcribe:${options.verbatim}`);
        return { words, text: "", durationSec: 9, provider: "local" as const, language: "fr" };
      },
      energy: async () => ({ frames: framesFor(9000, words), durationMs: 9000 }),
      face: async () => ({ x: 0.4, y: 0.4 }),
      stretch: async () => {
        throw new Error("pas d'accélération à ×1");
      },
      ask: async (prompt: string) => {
        calls.push(prompt.includes("<transcription>") ? "plan" : "autre");
        return JSON.stringify({ hook: "Monter sans effort", mood: "happy", emphasis: [4], beats: [{ word: 5, layout: "split", board: { kind: "logo", name: "Notion" } }] });
      },
      logo: async (name: string) => {
        calls.push(`logo:${name}`);
        return { url: "/api/modules/clip-studio/data/assets/logo.png", ref: "module:clip-studio/assets/logo.png", name, kind: "image", width: 256, height: 256 } as MediaSource;
      },
      music: () => null,
      loadTheme: async () => null,
    });
    const job = startTakeEdit({ sources: [{ assetFile: "take.mp4" }], speed: 1, silence: "normal" });
    let current: TakeEditJob | null = job;
    for (let attempt = 0; attempt < 100 && current?.status === "running"; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      current = getTakeEditJob(job.id);
    }
    expect(current?.status, current?.error).toBe("done");
    expect(calls).toEqual(["transcribe:true", "plan", "logo:Notion"]);
    expect(current!.report!.retakes.map((retake) => retake.text)).toEqual(["Alors aujourd’hui on va…"]);
    expect(current!.report!.editMs).toBeLessThan(9000);
    const project = store.projects.find((entry) => entry.id === current!.projectId);
    expect(project.origin).toBe("take");
    expect(boardOf(project).some((item) => item.type === "image")).toBe(true);
    // La transcription est rangée avec le média : elle resservira.
    expect(store.assets.find((asset) => asset.file === "take.mp4").transcript.provider).toBe("local");
  });
});
