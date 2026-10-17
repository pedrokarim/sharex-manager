import { describe, expect, it } from "vitest";
import {
  AI_TELLS_FR,
  HOOK_FAMILIES,
  HOOK_MAX_WORDS,
  cleanScriptText,
  countWords,
  frenchTypography,
  pickBestHook,
  rankHooks,
  scriptRuleLines,
  spokenSeconds,
  stripInvisible,
} from "@/modules/clip-studio/lib/script-rules";

describe("règles d'écriture : consignes", () => {
  it("demande trois accroches notées, avec les familles et la grille", () => {
    const text = scriptRuleLines({ french: true }).join("\n");
    expect(text).toContain('"hooks"');
    expect(text).toContain('"score"');
    for (const family of HOOK_FAMILIES) expect(text).toContain(family.id);
    expect(text).toContain("3 secondes");
    expect(text).toMatch(/de 4 à 15 mots/);
    expect(text).toMatch(/Entre 40 et 60 %/);
    expect(text).toContain("160 mots par minute");
  });

  it("liste les tics d'IA à éviter, en français et en anglais", () => {
    const french = scriptRuleLines({ french: true }).join("\n");
    expect(french).toContain("plonger dans");
    expect(french).toContain("n'hésitez pas à");
    expect(french).toContain("faux contraste");
    expect(french).toContain("triades");
    // Notre typographie : jamais de tiret cadratin en français.
    expect(french).toContain("Jamais de tiret cadratin");
    const english = scriptRuleLines({ french: false }).join("\n");
    expect(english).toContain("delve");
    expect(english).not.toContain("Jamais de tiret cadratin");
    expect(AI_TELLS_FR.length).toBeGreaterThan(10);
  });
});

describe("règles d'écriture : nettoyage", () => {
  it("retire les caractères invisibles et garde les espaces insécables", () => {
    const dirty = "Le\u200b vol\u00adcan\ufeff\u2060 «\u00a0rouge\u00a0» à 10\u202f%";
    expect(stripInvisible(dirty)).toBe("Le volcan «\u00a0rouge\u00a0» à 10\u202f%");
  });

  it("garde le liant d'un émoji composé et retire les caractères d'étiquette", () => {
    expect(stripInvisible("Code 👩\u200d💻")).toBe("Code 👩\u200d💻");
    expect(stripInvisible("a\u200db")).toBe("ab");
    expect(stripInvisible("texte\u{E0041}\u{E0042}caché")).toBe("textecaché");
  });

  it("met un texte sur une ligne sans toucher aux insécables", () => {
    expect(cleanScriptText("  Une\n\tligne\u00a0: ok  ", 100)).toBe("Une ligne\u00a0: ok");
    expect(cleanScriptText(undefined, 10)).toBe("");
    expect(cleanScriptText("abcdef", 3)).toBe("abc");
  });

  it("applique la typographie française", () => {
    expect(frenchTypography("Pourquoi ? Parce que : « oui » à 50 %")).toBe("Pourquoi\u00a0? Parce que\u00a0: «\u00a0oui\u00a0» à 50\u00a0%");
    expect(frenchTypography("Le magma — très chaud — remonte")).toBe("Le magma – très chaud – remonte");
    expect(frenchTypography("Le café de 16 h, 72 km/h, 3 ans, 2 heures")).toBe("Le café de 16 h, 72 km/h, 3 ans, 2 heures");
    // Pas d'espace ajoutée là où il n'y en avait pas.
    expect(frenchTypography("Départ à 10:30")).toBe("Départ à 10:30");
  });
});

describe("règles d'écriture : durée", () => {
  it("compte les mots lus et estime la durée à 160 mots par minute", () => {
    expect(countWords("Le volcan – très actif – gronde !")).toBe(5);
    expect(spokenSeconds(Array.from({ length: 160 }, () => "mot").join(" "))).toBe(60);
    expect(spokenSeconds("un deux trois quatre", 120)).toBe(2);
    expect(HOOK_MAX_WORDS).toBe(8);
  });
});

describe("règles d'écriture : meilleure accroche", () => {
  it("garde la mieux notée", () => {
    const best = pickBestHook([
      { text: "Le volcan qui a rasé une ville", family: "mid-scene", score: 7 },
      { text: "Ce volcan dort depuis 600 ans", family: "not-that", score: 9 },
      { text: "Arrête de croire les films catastrophe", family: "stop-start", score: 8 },
    ]);
    expect(best).toEqual({ text: "Ce volcan dort depuis 600 ans", family: "not-that", score: 9 });
  });

  it("préfère une accroche qui se dit en 3 secondes à une mieux notée trop longue", () => {
    const ranked = rankHooks([
      { text: "Voici une accroche bien trop longue pour être dite en trois secondes", score: 10 },
      { text: "Ce volcan dort depuis 600 ans", score: 6 },
    ], 100);
    expect(ranked[0].text).toBe("Ce volcan dort depuis 600 ans");
  });

  it("borne les notes, ignore une famille inconnue et écarte les entrées illisibles", () => {
    const ranked = rankHooks([
      null,
      "texte seul",
      { text: "" },
      { text: "x".repeat(80), score: 9 },
      { text: "Note trop haute", family: "inconnue", score: 42 },
      { text: "Note illisible", score: "beaucoup" },
    ]);
    expect(ranked).toEqual([
      { text: "Note trop haute", family: undefined, score: 10 },
      { text: "Note illisible", family: undefined, score: 0 },
    ]);
  });

  it("rend null sans accroche", () => {
    expect(pickBestHook(undefined)).toBeNull();
    expect(pickBestHook([])).toBeNull();
  });
});
