import { describe, expect, it, vi } from "vitest";

// L'assistant appelle d'autres modules par le gestionnaire : aucun appel ici, tout est pur ou injecté.
vi.mock("@/lib/modules/module-manager.api", () => ({ apiModuleManager: { callModuleFunction: vi.fn(), getLoadedModule: vi.fn() } }));

import {
  applyShortening,
  reviseForSpeech,
  revisePrompt,
  sanitize,
  scriptPrompt,
  shortenPrompt,
  type AssistantRequest,
} from "@/modules/clip-studio/lib/assistant";
import { factCheckPrompt } from "@/modules/clip-studio/lib/fact-check";
import { isChoppy, speechSeconds, spokenLabels, spokenProblems } from "@/modules/clip-studio/lib/script-rules";
import { fixedSeconds, plannedSegments, voiceBudgetSeconds } from "@/modules/clip-studio/lib/segment-count";

// Textes dits par les deux vidéos de l'assistant du 26/10/2026, tels qu'ils sont sortis.
const ABRAXAS = [
  "Abraxas. Affiche TRANSCENDO, dates gardées.",
  "Pause douze. Symboles. Pause. Cycle. Calendrier.",
  "Chiffre fantôme. Version guettée, virgule comprise.",
];
const TRANSCENDO = [
  "Plan (3 min 24) : cycles. Lecture : un renouveau possible.",
  "Plan : symboles rouges. Lecture : alerte ou rupture possible.",
  "Plan : Abraxas. Lecture : il peut unir des contraires.",
];

const SLIDESHOW: AssistantRequest = { brief: "Décrypte trois indices de TRANSCENDO", template: "slideshow", aspect: "9:16", count: 3, imageSource: "none", targetSeconds: 40 };
const FREE: AssistantRequest = { brief: "Réaction au trailer TRANSCENDO", template: "free", aspect: "9:16", count: 3, imageSource: "none", targetSeconds: 22 };

const labeled = () =>
  sanitize(SLIDESHOW, {
    hooks: [{ text: "Ces symboles rouges ne confirment aucun personnage.", family: "not-that", score: 9 }],
    title: "Trois indices de TRANSCENDO",
    slides: TRANSCENDO.map((caption) => ({ caption })),
    outro: "Quel indice mérite une analyse complète ?",
  });

const NATURAL = [
  "On voit d'abord des cycles, qui peuvent annoncer un renouveau.",
  "Les symboles rouges, eux, font plutôt penser à une rupture.",
  "Abraxas est un nom qui unit des contraires.",
];

describe("texte fait pour l'oreille : détection", () => {
  it("reconnaît le style télégraphique des textes raccourcis", () => {
    expect(isChoppy(ABRAXAS[0])).toBe(true);
    expect(isChoppy(ABRAXAS[1])).toBe(true);
    expect(isChoppy(ABRAXAS[2])).toBe(true);
    expect(isChoppy("Abraxas. Ce nom revient trois fois dans le trailer.")).toBe(false);
    expect(isChoppy("Ces symboles rouges ne confirment aucun personnage.")).toBe(false);
    for (const text of NATURAL) expect(isChoppy(text)).toBe(false);
  });

  it("compte les silences d'un texte haché", () => {
    // Six mots, cinq silences : plus long à dire qu'une phrase de neuf mots.
    expect(speechSeconds(ABRAXAS[1])).toBeGreaterThan(speechSeconds("À la pause douze, on scrute les symboles et le cycle."));
  });

  it("lit les étiquettes en tête de phrase, parenthèse comprise, jamais une heure", () => {
    expect(spokenLabels(TRANSCENDO[0])).toEqual(["plan", "lecture"]);
    expect(spokenLabels("Rendez-vous à 10:30 pour la suite.")).toEqual([]);
  });

  it("signale un plan lu dans chaque diapositive, pas une tournure isolée", () => {
    expect(spokenProblems(TRANSCENDO).map((entry) => entry.index)).toEqual([0, 1, 2]);
    expect(spokenProblems(["Résultat : trois victoires d'affilée.", "La suite se joue samedi soir."])).toEqual([]);
    expect(spokenProblems(NATURAL)).toEqual([]);
  });
});

describe("durée : la voix seule, pas le clip", () => {
  it("retire pauses et carton de fin, comme mesuré en production", () => {
    // 3 séquences et un carton de 2,5 s : 6,2 s mesurées sur les deux clips du 26/10/2026.
    expect(fixedSeconds("free", 3, 2.5)).toBeCloseTo(6.27, 1);
    expect(voiceBudgetSeconds("free", 22, 3, 2.5)).toBe(16);
    // Jamais moins de la moitié de la cible.
    expect(voiceBudgetSeconds("free", 10, 3, 8)).toBe(5);
    expect(plannedSegments("free", 45)).toBe(4);
  });

  it("donne au script la durée de la voix seule, et les règles de l'oral", () => {
    const prompt = scriptPrompt(FREE);
    expect(prompt).toContain("le clip monté dure 22 secondes au plus");
    expect(prompt).toContain("doit donc tenir en 18 secondes au plus");
    expect(prompt).toContain("jamais des phrases hachées");
    expect(prompt).toContain("Aucune étiquette lue");
    expect(prompt).toContain("jamais une date, une durée ou un chiffre seuls");
  });
});

describe("raccourcissement : des idées en moins, jamais des phrases hachées", () => {
  it("demande de retirer une idée entière et garde les règles de l'oral", () => {
    const script = sanitize(FREE, { hooks: [{ text: "TRANSCENDO affiche Abraxas, puis garde ses dates.", score: 9 }], title: "Abraxas sans date", scenes: NATURAL.map((text) => ({ text })), outro: "Tu as trouvé une date ?" });
    const prompt = shortenPrompt(FREE, script, { targetSeconds: 16, currentSeconds: 24 });
    expect(prompt).toContain("jamais les verbes ni les mots de liaison");
    expect(prompt).toContain("Écris pour l'oreille");
    expect(prompt).toContain("un clip un peu plus long vaut mieux");
  });

  it("écarte un raccourci haché, garde un raccourci naturel", () => {
    const script = sanitize(FREE, { hooks: [{ text: "TRANSCENDO affiche Abraxas, puis garde ses dates.", score: 9 }], title: "Abraxas sans date", scenes: NATURAL.map((text) => ({ text })), outro: "Tu as trouvé une date ?" });
    const choppy = JSON.stringify({ segments: ABRAXAS.map((text) => ({ heading: "", text })), outro: "Date ?" });
    expect(() => applyShortening(FREE, script, choppy)).toThrow(/haché/);
    const natural = JSON.stringify({
      segments: [{ heading: "", text: "On voit des cycles, signe de renouveau." }, { heading: "", text: "Le rouge fait penser à une rupture." }, { heading: "", text: "Abraxas unit des contraires." }],
      outro: "Tu as trouvé une date ?",
    });
    expect(applyShortening(FREE, script, natural).segmentTexts[0]).toBe("On voit des cycles, signe de renouveau.");
  });
});

describe("relecture pour l'oral", () => {
  const signal = new AbortController().signal;

  it("ne demande rien quand le script passe à l'oral", async () => {
    const script = sanitize(SLIDESHOW, { title: "Trois indices de TRANSCENDO", slides: NATURAL.map((caption) => ({ caption })), outro: "Lequel t'intrigue le plus ?" });
    const ask = vi.fn();
    const result = await reviseForSpeech(SLIDESHOW, script, ask, signal);
    expect(ask).not.toHaveBeenCalled();
    expect(result).toEqual({ script });
  });

  it("réécrit un plan lu à voix haute, une fois, et le dit", async () => {
    const script = labeled();
    const prompt = revisePrompt(SLIDESHOW, script);
    expect(prompt).toContain("étiquettes lues à voix haute");
    expect(prompt).toContain('"element":"segments[0]"');
    // L'accroche est dite juste avant : la relecture ne la répète pas.
    expect(prompt).toContain("aucun texte ne la répète");
    const ask = vi.fn(async () => JSON.stringify({ segments: NATURAL.map((caption) => ({ caption })), outro: "Quel indice mérite une analyse complète ?" }));
    const result = await reviseForSpeech(SLIDESHOW, script, ask, signal);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(result.script.segmentTexts).toEqual(NATURAL);
    expect(result.script.hook).toEqual(script.hook);
    expect(result.note).toBe("3 textes réécrits pour l’oral");
  });

  it("garde le script quand la relecture ne corrige rien, allonge trop ou échoue", async () => {
    const script = labeled();
    const same = await reviseForSpeech(SLIDESHOW, script, async () => JSON.stringify({ segments: TRANSCENDO.map((caption) => ({ caption })), outro: "Quel indice ?" }), signal);
    expect(same.script).toBe(script);
    expect(same.note).toContain("relecture sans effet");
    // Trois textes hachés très courts, réécrits en longues phrases : la voix triplerait.
    const short = sanitize(FREE, { title: "Abraxas sans date", scenes: ["Abraxas. Pause.", "Cycle. Date.", "Version. Fin."].map((text) => ({ text })), outro: "Une date ?" });
    const long = "On voit d'abord des cycles, qui peuvent annoncer un renouveau, puis une longue attente sans aucune date.";
    const longer = await reviseForSpeech(FREE, short, async () => JSON.stringify({ segments: [long, long, long].map((text) => ({ heading: "", text })), outro: "Une date ?" }), signal);
    expect(longer.script).toBe(short);
    expect(longer.note).toContain("voix trop allongée");
    const failed = await reviseForSpeech(SLIDESHOW, script, async () => {
      throw new Error("Codex absent");
    }, signal);
    expect(failed.script).toBe(script);
    expect(failed.note).toContain("relecture impossible");
  });
});

describe("vérification des faits : l'écran suit la voix", () => {
  it("demande de corriger aussi les notes visuelles d'un segment corrigé", () => {
    const prompt = factCheckPrompt({ brief: "TRANSCENDO", template: "slideshow", title: "Trois indices", segments: [{ caption: "La vidéo dure 3 min 23.", visualNotes: [{ kind: "board", text: "3 min 23" }] }], segmentSchema: "{}", segmentLimits: "", web: true });
    expect(prompt).toContain("dans le texte lu ET dans ses visualNotes");
  });
});
