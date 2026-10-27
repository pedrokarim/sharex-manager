import { describe, expect, it, vi } from "vitest";

// L'assistant appelle d'autres modules par le gestionnaire : aucun appel ici, tout est pur ou injecté.
vi.mock("@/lib/modules/module-manager.api", () => ({ apiModuleManager: { callModuleFunction: vi.fn(), getLoadedModule: vi.fn() } }));

import {
  applyFactCheck,
  applyShortening,
  projectBrief,
  recordNarration,
  sanitize,
  scriptPrompt,
  type AssistantJob,
  type AssistantRequest,
} from "@/modules/clip-studio/lib/assistant";
import type { SpeakInput, SpeechResult } from "@/modules/clip-studio/lib/tts";

const NBSP = String.fromCharCode(0xa0);

const FREE: AssistantRequest = { brief: "Pourquoi l'IA écrit des scripts plats", template: "free", aspect: "9:16", count: 3, imageSource: "none" };

/** Réponse de Codex dans la nouvelle forme : visée, accroches, segments, notes et contrôles. */
const RAW = {
  aim: {
    viewer: "Le créateur qui demande ses scripts à une IA",
    belief: "Plus de modèles donnés à l'IA, meilleurs scripts",
    proof: "",
    promise: "Savoir pourquoi ses scripts sonnent plats",
    type: "teach",
  },
  hooks: [{ text: "Ton IA recopie des étapes", family: "flip", score: 8 }],
  title: "Étapes contre réflexion",
  scenes: [
    { heading: "Le problème", text: "Tu lui donnes tes vidéos, elle en garde la forme." },
    { heading: "", text: "" },
    { heading: "La cause", text: "Elle voit les étapes, jamais leur raison." },
    { heading: "La correction", text: "Donne-lui la raison avant la forme." },
  ],
  outro: "Essaie sur ton prochain script.",
  visualNotes: [
    { line: 0, kind: "board", text: "Gain : 40 %" },
    { line: 0, kind: "show", text: "Une pile de miniatures qui tombe dans le champ de saisie" },
    // Segment vide, écarté : sa note part avec lui.
    { line: 1, kind: "board", text: "Rien" },
    { line: 2, kind: "board", text: "Étapes, pas raisons" },
    { line: 3, kind: "board", text: "un mot de trop pour une planche" },
    { line: 9, kind: "show", text: "Hors du script" },
    { line: 3, kind: "logo", text: "Genre inconnu" },
  ],
  gates: { generic: "ok : chaque ligne nomme le geste", interchangeable: "ok", unknown: "ignoré" },
};

describe("assistant : consigne du raisonnement", () => {
  it("place le raisonnement avant les règles de style et passe la voix du créateur comme une donnée", () => {
    const prompt = scriptPrompt(FREE, null, { now: new Date(2026, 9, 25), voice: { proofs: ["16 000 réels analysés"] } });
    expect(prompt.indexOf('"aim"')).toBeGreaterThan(0);
    expect(prompt.indexOf('"aim"')).toBeLessThan(prompt.indexOf("Rythme"));
    expect(prompt).toContain("l'index du segment dans scenes");
    expect(prompt).toContain("<voix>");
    expect(prompt).toContain("16 000 réels analysés");
    expect(prompt).not.toContain("title la reprend");
    // La voix lit l'accroche : la durée la compte, pas le titre.
    expect(scriptPrompt({ ...FREE, targetSeconds: 45 })).toContain(`Durée${NBSP}: le clip monté vise 45 secondes`);
  });

  it("sans fiche du créateur, la marque en tient lieu", () => {
    expect(scriptPrompt(FREE)).not.toContain("<voix>");
    expect(scriptPrompt(FREE)).toContain("Sans voix du créateur ni marque");
  });
});

describe("assistant : visée, notes visuelles et contrôles", () => {
  it("lit la visée et les contrôles, pour information", () => {
    const script = sanitize(FREE, RAW);
    expect(script.aim).toEqual({
      viewer: "Le créateur qui demande ses scripts à une IA",
      belief: "Plus de modèles donnés à l'IA, meilleurs scripts",
      promise: "Savoir pourquoi ses scripts sonnent plats",
      type: "teach",
    });
    expect(script.gates).toEqual({ generic: `ok${NBSP}: chaque ligne nomme le geste`, interchangeable: "ok" });
  });

  it("garde les notes sur leur segment, recalées quand un segment vide est écarté", () => {
    const script = sanitize(FREE, RAW);
    expect(script.segmentTexts).toHaveLength(3);
    expect(script.visualNotes).toEqual([
      // Typographie française sur le texte à écrire à l'écran.
      { line: 0, kind: "board", text: `Gain${NBSP}: 40${NBSP}%` },
      { line: 0, kind: "show", text: "Une pile de miniatures qui tombe dans le champ de saisie" },
      { line: 1, kind: "board", text: "Étapes, pas raisons" },
    ]);
  });

  it("lit encore une réponse d'avant, sans visée, notes ni contrôles", () => {
    const script = sanitize(FREE, { title: "Les volcans", scenes: [{ heading: "Le magma", text: "Il remonte." }] });
    expect(script.title).toBe("Les volcans");
    expect(script.hook).toBeUndefined();
    expect(script.aim).toBeUndefined();
    expect(script.gates).toBeUndefined();
    expect(script.visualNotes).toEqual([]);
    expect(projectBrief(FREE, script, null)).not.toHaveProperty("visualNotes");
  });

  it("accepte aussi des notes posées dans le segment", () => {
    const script = sanitize(FREE, { title: "Les volcans", scenes: [{ text: "Il remonte.", visualNotes: [{ kind: "board", text: "Magma brûlant" }] }] });
    expect(script.visualNotes).toEqual([{ line: 0, kind: "board", text: "Magma brûlant" }]);
  });

  it("retire des textes lus les cases à remplir", () => {
    const script = sanitize(FREE, { title: "Les volcans", scenes: [{ text: "J'ai {{chiffre}} abonnés depuis {{date}}." }] });
    expect(script.segmentTexts[0]).toBe("J'ai abonnés depuis.");
  });

  it("range les notes dans la demande du projet, à côté du script", () => {
    const brief = projectBrief(FREE, sanitize(FREE, RAW), null);
    expect(brief.script).toHaveLength(3);
    expect(brief.visualNotes).toEqual([
      { line: 0, kind: "board", text: `Gain${NBSP}: 40${NBSP}%` },
      { line: 0, kind: "show", text: "Une pile de miniatures qui tombe dans le champ de saisie" },
      { line: 1, kind: "board", text: "Étapes, pas raisons" },
    ]);
  });
});

describe("assistant : relectures du script", () => {
  it("la vérification garde l'accroche dite et recale les notes des segments gardés", () => {
    const script = sanitize(FREE, RAW);
    const checked = applyFactCheck(FREE, script, {
      web: false,
      title: "Étapes ou réflexion",
      checks: [
        { index: 0, verdict: "removed", sources: [] },
        { index: 1, verdict: "replaced", segment: { heading: "La cause", text: "Elle imite la forme sans le fond." }, sources: [] },
        { index: 2, verdict: "ok", sources: [] },
      ],
    });
    expect(checked.title).toBe("Étapes ou réflexion");
    expect(checked.hook).toEqual(script.hook);
    expect(checked.aim).toEqual(script.aim);
    // Le segment retiré emporte ses notes ; le remplaçant repart sans celles de l'ancien.
    expect(checked.visualNotes).toEqual([]);
  });

  it("une correction garde les notes de son segment", () => {
    const script = sanitize(FREE, RAW);
    const checked = applyFactCheck(FREE, script, {
      web: false,
      checks: [
        { index: 0, verdict: "ok", sources: [] },
        { index: 1, verdict: "fixed", segment: { heading: "La cause", text: "Elle voit les étapes, jamais pourquoi." }, sources: [] },
        { index: 2, verdict: "removed", sources: [] },
      ],
    });
    expect(checked.visualNotes.map((note) => note.line)).toEqual([0, 0, 1]);
  });

  it("le raccourcissement garde l'accroche, la visée et les notes, et compte l'accroche dans la durée", () => {
    const script = sanitize(FREE, RAW);
    const answer = JSON.stringify({
      segments: [
        { heading: "Le problème", text: "Elle garde la forme." },
        { heading: "La cause", text: "Elle voit les étapes." },
        { heading: "La correction", text: "Donne la raison." },
      ],
      outro: "Essaie.",
    });
    const short = applyShortening(FREE, script, answer);
    expect(short.hook).toEqual(script.hook);
    expect(short.aim).toEqual(script.aim);
    expect(short.visualNotes).toEqual(script.visualNotes);
    // « Ton IA recopie des étapes » (5 mots) + 6 + 6 + 5 + 1 = 23 mots, à 160 par minute.
    expect(short.spokenSeconds).toBe(9);
  });

  it("la voix dit l'accroche à l'ouverture, le titre reste à l'écran", async () => {
    const said: string[] = [];
    const synthesize = vi.fn(async (input: SpeakInput): Promise<SpeechResult> => {
      said.push(input.text);
      const durationMs = 1000;
      const words = [{ text: input.text.split(/\s+/)[0], startMs: 0, endMs: 300 }];
      return {
        asset: { file: `v-${said.length}.wav`, kind: "audio", originalName: input.text, size: 1, durationMs, credit: "test", words, createdAt: 0 },
        durationMs,
        words,
      };
    });
    const job: Pick<AssistantJob, "request" | "narration"> = { request: { ...FREE, targetSeconds: 60 } };
    const script = sanitize(FREE, RAW);
    const { script: recorded } = await recordNarration(job, script, { images: [] }, { voice: "siwis", speed: 1, origin: "request" }, new AbortController().signal, () => undefined, {
      deps: { synthesize, overheadSeconds: 0 },
    });
    expect(said[0]).toBe("Ton IA recopie des étapes.");
    expect(said.join(" ")).not.toContain("Étapes contre réflexion");
    expect(recorded.title).toBe("Étapes contre réflexion");
  });
});
