import { describe, expect, it, vi } from "vitest";

// L'assistant appelle d'autres modules par le gestionnaire : aucun appel ici, Codex est simulé.
vi.mock("@/lib/modules/module-manager.api", () => ({ apiModuleManager: { callModuleFunction: vi.fn(), getLoadedModule: vi.fn() } }));

import {
  FACT_CHECK_TIMEOUT_MS,
  projectBrief,
  sanitize,
  scriptPrompt,
  scriptUsesWeb,
  segmentPlans,
  verifyScript,
  type AssistantJob,
  type AssistantRequest,
} from "@/modules/clip-studio/lib/assistant";
import { classifySubject, parseFactCheck, todayLabel } from "@/modules/clip-studio/lib/fact-check";
import type { CodexOptions } from "@/modules/clip-studio/lib/codex";

const NOW = new Date(2026, 9, 12, 10, 0, 0);
const NBSP = " ";

const TOP: AssistantRequest = {
  brief: "un top sur les prochains jeux gacha les plus attendus",
  template: "top",
  aspect: "9:16",
  count: 5,
  imageSource: "find-then-generate",
  webSearch: true,
};

const entry = (title: string, detail: string) => ({
  title,
  detail,
  image: { mode: "find", query: `${title} key art`, prompt: `Key art of ${title}`, official: true, icon: { query: `${title} app icon` } },
});

const RAW_TOP = {
  title: "Les gachas les plus attendus",
  entries: [
    entry("Neverness to Everness", "Monde ouvert urbain, Hotta Studio"),
    entry("Wuthering Waves", "Sortie annoncée pour bientôt"),
    entry("Arknights Endfeld", "Hypergryph, exploration en 3D"),
    entry("Jeu imaginaire", "Un jeu qui n'existe pas"),
    entry("Ananta", "NetEase, ville ouverte"),
  ],
  outro: "Lequel attends-tu ?",
};

/** Faux Codex : rend la réponse donnée et garde les appels. */
function fakeCodex(answer: unknown) {
  const calls: { prompt: string; options: CodexOptions }[] = [];
  const ask = async (prompt: string, options: CodexOptions) => {
    calls.push({ prompt, options });
    return typeof answer === "string" ? answer : JSON.stringify(answer);
  };
  return { ask, calls };
}

function job(request: AssistantRequest): Pick<AssistantJob, "request" | "facts"> {
  return { request };
}

function recorder() {
  const steps: { state: string; detail?: string; label?: string }[] = [];
  return { steps, onStep: (state: string, detail?: string, label?: string) => steps.push({ state, detail, label }) };
}

describe("vérification des faits : consigne du script", () => {
  it("donne la date du jour, lisible et ISO, avec la règle du temps", () => {
    expect(todayLabel(NOW)).toEqual({ human: "lundi 12 octobre 2026", iso: "2026-10-12" });
    const prompt = scriptPrompt(TOP, null, { now: NOW });
    expect(prompt).toContain("lundi 12 octobre 2026 (2026-10-12)");
    expect(prompt).toContain("« à venir »");
    expect(prompt).toContain("ne le tire jamais de ta mémoire");
  });

  it("ouvre le web pour écrire le script seulement sur des faits réels, et si la case est cochée", () => {
    expect(scriptUsesWeb(TOP)).toBe(true);
    expect(scriptUsesWeb({ ...TOP, webSearch: false })).toBe(false);
    expect(scriptUsesWeb({ ...TOP, template: "free", brief: "une histoire inventée sur un dragon timide" })).toBe(false);
    expect(scriptUsesWeb({ ...TOP, template: "free", brief: "une recette de crêpes facile" })).toBe(false);
    expect(scriptUsesWeb({ ...TOP, template: "free", brief: "les jeux de Nintendo à connaître" })).toBe(true);
    expect(scriptUsesWeb({ ...TOP, template: "quiz", brief: "quiz sur les capitales" })).toBe(true);

    expect(classifySubject("un conte pour enfants", "free")).toEqual({ fiction: true, factual: false, timeSensitive: false });
    expect(classifySubject("les films sortis en 2026", "free")).toMatchObject({ factual: true, timeSensitive: true });
    expect(classifySubject("qui a inventé le téléphone", "free")).toMatchObject({ fiction: false, factual: true });

    const withWeb = scriptPrompt(TOP, null, { now: NOW });
    expect(withWeb).toContain("Sers-toi de la recherche web");
    const withoutWeb = scriptPrompt({ ...TOP, webSearch: false }, null, { now: NOW });
    expect(withoutWeb).toContain("Tu n'as pas accès au web");
    expect(withoutWeb).not.toContain("Sers-toi de la recherche web");
  });
});

describe("vérification des faits : seconde passe", () => {
  it("remplace, corrige, retire et signale, puis relance la suite avec les noms exacts", async () => {
    const script = sanitize(TOP, RAW_TOP);
    const { ask, calls } = fakeCodex({
      title: { verdict: "fixed", text: "4 gachas très attendus" },
      segments: [
        { index: 0, subject: "Neverness to Everness", verdict: "ok", segment: null, note: "", sources: [{ url: "https://nte.perfectworld.com/en/", title: "Site officiel" }] },
        {
          index: 1,
          subject: "Wuthering Waves",
          verdict: "replaced",
          note: "déjà sorti en mai 2024",
          segment: entry("Azur Promilia", "Manjuu, sortie annoncée sur PC et PS5"),
          sources: [
            { url: "https://promilia.com/", title: "Azur Promilia" },
            { url: "http://insecure.example/page", title: "En clair" },
            { url: "javascript:alert(1)", title: "Piège" },
            { url: `https://example.com/${"a".repeat(600)}`, title: "Trop longue" },
          ],
        },
        {
          index: 2,
          subject: "Arknights: Endfield",
          verdict: "fixed",
          note: "nom exact",
          segment: { title: "Arknights: Endfield", detail: "Hypergryph, exploration en 3D", image: { mode: "find", query: "Arknights Endfield key art", prompt: "Key art", official: true, icon: { query: "Arknights Endfield app icon" } } },
          sources: [],
        },
        { index: 3, subject: "Jeu imaginaire", verdict: "removed", segment: null, note: "aucun jeu de ce nom", sources: [] },
        { index: 4, subject: "Ananta", verdict: "doubtful", segment: null, note: "date de sortie non confirmée", sources: [{ url: "https://www.ananta.com/", title: "Ananta" }] },
      ],
    });
    const { steps, onStep } = recorder();
    const tracked = job(TOP);
    const { script: checked, outcome } = await verifyScript(tracked, script, new AbortController().signal, onStep, { deps: { ask, now: () => NOW } });

    // La passe reçoit le script comme une donnée, la date du jour et le web.
    expect(calls).toHaveLength(1);
    expect(calls[0].options).toMatchObject({ search: true, timeoutMs: FACT_CHECK_TIMEOUT_MS });
    expect(calls[0].prompt).toContain("lundi 12 octobre 2026 (2026-10-12)");
    expect(calls[0].prompt).toContain("<script>{");
    expect(calls[0].prompt).toContain("Wuthering Waves");

    const entries = (checked as unknown as { entries: { title: string }[] }).entries.map((value) => value.title);
    expect(entries).toEqual(["Neverness to Everness", "Azur Promilia", "Arknights: Endfield", "Ananta"]);
    expect(checked.title).toBe("4 gachas très attendus");
    expect(checked.segmentTexts[1]).toContain("Azur Promilia");

    // Les requêtes d'images et d'icônes suivent les noms corrigés.
    const plans = segmentPlans(TOP, checked);
    expect(plans[1]).toMatchObject({ query: "Azur Promilia key art", iconQuery: "Azur Promilia app icon" });
    expect(plans[2]).toMatchObject({ query: "Arknights Endfield key art", iconQuery: "Arknights Endfield app icon" });

    // Le suivi dit tout : changements, compte plus petit, doute.
    const last = steps.at(-1)!;
    expect(last).toMatchObject({ state: "done", label: "Vérification des faits" });
    expect(last.detail).toContain("1 corrigé, 1 remplacé, 1 retiré");
    expect(last.detail).toContain("le clip compte 4 éléments au lieu de 5");
    expect(last.detail).toContain(`Ananta${NBSP}: date de sortie non confirmée`);
    expect(tracked.facts).toMatchObject({ web: true, checked: 5, ok: 1, fixed: 1, replaced: 1, removed: 1, doubtful: 1 });
    expect(tracked.facts?.doubts).toEqual([`Ananta${NBSP}: date de sortie non confirmée`]);

    // Adresses : https seulement, longueur bornée ; rattachées aux segments gardés.
    expect(outcome?.sources).toEqual([
      { segment: 0, url: "https://nte.perfectworld.com/en/", title: "Site officiel" },
      { segment: 1, url: "https://promilia.com/", title: "Azur Promilia" },
      { segment: 3, url: "https://www.ananta.com/", title: "Ananta" },
    ]);
  });

  it("corrige la bonne réponse d'un quiz", async () => {
    const quiz: AssistantRequest = { ...TOP, template: "quiz", brief: "quiz sur les planètes", count: 2 };
    const script = sanitize(quiz, {
      title: "Les planètes",
      questions: [
        { question: "Quelle est la plus grande planète ?", choices: ["Saturne", "Mars", "Jupiter"], answer: 0, explanation: "Saturne est la plus grande." },
        { question: "Quelle planète est rouge ?", choices: ["Vénus", "Mars", "Neptune"], answer: 1, explanation: "Mars est rouge." },
      ],
    });
    const { ask } = fakeCodex({
      title: { verdict: "ok" },
      segments: [
        {
          index: 0,
          subject: "Jupiter",
          verdict: "fixed",
          note: "la bonne réponse est Jupiter",
          segment: { question: "Quelle est la plus grande planète ?", choices: ["Saturne", "Mars", "Jupiter"], answer: 2, explanation: "Jupiter est la plus grande." },
          sources: [{ url: "https://science.nasa.gov/jupiter/", title: "Jupiter – NASA" }],
        },
        // Une correction illisible (bonne réponse hors des choix) ne passe pas : elle devient un doute.
        { index: 1, subject: "Mars", verdict: "fixed", segment: { question: "Quelle planète est rouge ?", choices: ["Vénus", "Mars"], answer: 5 }, note: "", sources: [] },
      ],
    });
    const { steps, onStep } = recorder();
    const { script: checked } = await verifyScript(job(quiz), script, new AbortController().signal, onStep, { deps: { ask, now: () => NOW } });
    const questions = (checked as unknown as { questions: { answer: number; choices: string[]; explanation?: string }[] }).questions;
    expect(questions[0].answer).toBe(2);
    expect(questions[0].choices[questions[0].answer]).toBe("Jupiter");
    expect(questions[0].explanation).toBe("Jupiter est la plus grande.");
    expect(questions[1].answer).toBe(1);
    expect(steps.at(-1)?.detail).toContain(`Mars${NBSP}: correction illisible`);
  });

  it("sans le web : aucune source gardée, et le bilan le dit", async () => {
    const request = { ...TOP, webSearch: false };
    const script = sanitize(request, RAW_TOP);
    const { ask, calls } = fakeCodex({
      segments: RAW_TOP.entries.map((_, index) => ({
        index,
        verdict: index === 4 ? "doubtful" : "ok",
        subject: index === 4 ? "Ananta" : "",
        note: index === 4 ? "date de sortie non confirmée" : "",
        sources: [{ url: "https://example.com/", title: "Source" }],
      })),
    });
    const { steps, onStep } = recorder();
    const { outcome } = await verifyScript(job(request), script, new AbortController().signal, onStep, { deps: { ask, now: () => NOW } });
    expect(calls[0].options.search).toBe(false);
    expect(calls[0].prompt).toContain("Tu n'as PAS accès au web");
    expect(outcome?.sources).toEqual([]);
    expect(steps.at(-1)?.detail).toContain(`Sans le web${NBSP}: 5 éléments relus de mémoire, non vérifiés`);
    expect(steps.at(-1)?.detail).toContain(`Ananta${NBSP}: date de sortie non confirmée`);
  });

  it("un segment oublié ou un verdict inconnu devient un doute", () => {
    const report = parseFactCheck(JSON.stringify({ segments: [{ index: 0, verdict: "probably" }, { index: 9, verdict: "ok" }] }), {
      template: "top",
      web: true,
      segments: [{}, {}],
    });
    expect(report.checks.map((check) => check.verdict)).toEqual(["doubtful", "doubtful"]);
    expect(report.checks[1].note).toBe("non contrôlé par la vérification");
  });

  it("si la vérification échoue, le clip continue avec une étape « Vérification impossible »", async () => {
    const script = sanitize(TOP, RAW_TOP);
    const ask = async () => {
      throw new Error("Codex n'a pas répondu à temps.");
    };
    const { steps, onStep } = recorder();
    const tracked = job(TOP);
    const result = await verifyScript(tracked, script, new AbortController().signal, onStep, { deps: { ask, now: () => NOW } });
    expect(result.outcome).toBeNull();
    expect(result.script).toBe(script);
    expect(tracked.facts).toBeUndefined();
    expect(steps.at(-1)).toMatchObject({ state: "error", label: "Vérification impossible" });
    expect(steps.at(-1)?.detail).toContain("Codex n'a pas répondu à temps.");

    // Une réponse illisible : même chose.
    const garbled = await verifyScript(job(TOP), script, new AbortController().signal, onStep, { deps: { ask: async () => "pas de JSON", now: () => NOW } });
    expect(garbled.outcome).toBeNull();
    expect(steps.at(-1)).toMatchObject({ state: "error", label: "Vérification impossible" });
  });

  it("l'annulation du travail, elle, arrête tout", async () => {
    const script = sanitize(TOP, RAW_TOP);
    const controller = new AbortController();
    const ask = async () => {
      controller.abort();
      throw new DOMException("Annulé", "AbortError");
    };
    await expect(verifyScript(job(TOP), script, controller.signal, () => undefined, { deps: { ask } })).rejects.toThrow();
  });

  it("ne fabrique rien quand tout tombe", async () => {
    const script = sanitize(TOP, RAW_TOP);
    const { ask } = fakeCodex({ segments: RAW_TOP.entries.map((_, index) => ({ index, verdict: "removed", sources: [] })) });
    await expect(verifyScript(job(TOP), script, new AbortController().signal, () => undefined, { deps: { ask, now: () => NOW } })).rejects.toThrow(
      /écarté tout le script/
    );
  });
});

describe("vérification des faits : sources rangées dans le projet", () => {
  it("projectBrief garde le script corrigé, ses sources et la date de vérification", async () => {
    const script = sanitize(TOP, RAW_TOP);
    const { ask } = fakeCodex({
      segments: [
        { index: 0, verdict: "removed", sources: [] },
        { index: 1, verdict: "ok", sources: [{ url: "https://wutheringwaves.kurogames.com/", title: "Wuthering Waves" }] },
        { index: 2, verdict: "ok", sources: [] },
        { index: 3, verdict: "ok", sources: [] },
        { index: 4, verdict: "ok", sources: [{ url: "https://www.ananta.com/", title: "Ananta" }] },
      ],
    });
    const { script: checked, outcome } = await verifyScript(job(TOP), script, new AbortController().signal, () => undefined, {
      deps: { ask, now: () => NOW },
    });
    const brief = projectBrief(TOP, checked, outcome);
    expect(brief.script).toHaveLength(4);
    expect(brief.sources).toEqual([
      { segment: 0, url: "https://wutheringwaves.kurogames.com/", title: "Wuthering Waves" },
      { segment: 3, url: "https://www.ananta.com/", title: "Ananta" },
    ]);
    expect(brief.script?.[brief.sources![1].segment]).toContain("Ananta");
    expect(brief.checkedAt).toBe(NOW.getTime());

    // Sans vérification, ni sources ni date.
    expect(projectBrief(TOP, script, null)).not.toHaveProperty("sources");
    expect(projectBrief(TOP, script, null)).not.toHaveProperty("checkedAt");
  });
});
