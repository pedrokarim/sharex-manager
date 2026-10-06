import { describe, expect, it } from "vitest";
import {
  exactGlossaryMatch,
  isOnlyTerms,
  prepareGlossary,
  protectTerms,
  restoreTerms,
} from "@/modules/scan-studio/lib/server/translation/glossary";
import type { GlossaryEntry } from "@/modules/scan-studio/lib/types";

const entries: GlossaryEntry[] = [
  { source: "Luffy", target: "Rufy" },
  { source: "Monkey D. Luffy", target: "Monkey D. Rufy" },
  { source: "Ace", target: "", keep: true },
  { source: "Devil Fruit", target: "Fruit du Démon" },
  { source: "ルフィ", target: "Rufy" },
  { source: "ignored", target: "" },
];
const glossary = prepareGlossary(entries);

/** Ce que fait un moteur : il traduit autour des repères et les recopie. */
const roundTrip = (text: string, translate: (sent: string) => string) => {
  const guarded = protectTerms(text, glossary);
  return restoreTerms(translate(guarded.text), guarded.terms);
};

describe("glossaire : protection des termes", () => {
  it("remplace un terme par un repère, puis le rétablit avec la traduction imposée", () => {
    const guarded = protectTerms("Luffy ate a Devil Fruit.", glossary);
    expect(guarded.text).toBe("⟦0⟧ ate a ⟦1⟧.");
    expect(guarded.terms).toEqual(["Rufy", "Fruit du Démon"]);

    const restored = restoreTerms("⟦0⟧ a mangé un ⟦1⟧.", guarded.terms);
    expect(restored).toEqual({ text: "Rufy a mangé un Fruit du Démon.", intact: true });
  });

  it("ne tient pas compte de la casse, ni du nombre d'espaces dans un terme", () => {
    expect(protectTerms("LUFFY! luffy! devil   fruit", glossary).text).toBe("⟦0⟧! ⟦1⟧! ⟦2⟧");
  });

  it("ne mord pas sur un mot plus long", () => {
    const guarded = protectTerms("Peace, Aces and Ace.", glossary);
    expect(guarded.text).toBe("Peace, Aces and ⟦0⟧.");
    expect(guarded.terms).toEqual(["Ace"]);
  });

  it("préfère le terme le plus long", () => {
    const guarded = protectTerms("I am Monkey D. Luffy, call me Luffy.", glossary);
    expect(guarded.text).toBe("I am ⟦0⟧, call me ⟦1⟧.");
    expect(guarded.terms).toEqual(["Monkey D. Rufy", "Rufy"]);
  });

  it("recopie tel quel un nom propre sans transcription, et ignore un terme sans traduction", () => {
    expect(roundTrip("Ace was ignored", (sent) => sent).text).toBe("Ace was ignored");
    expect(protectTerms("ACE", glossary).terms).toEqual(["Ace"]);
    expect(protectTerms("ignored", glossary).terms).toEqual([]);
  });

  it("trouve un terme dans une écriture sans espaces", () => {
    const guarded = protectTerms("俺はルフィだ", glossary);
    expect(guarded.text).toBe("俺は⟦0⟧だ");
    expect(restoreTerms("Je suis ⟦0⟧", guarded.terms).text).toBe("Je suis Rufy");
  });

  it("retrouve un repère qu'un moteur a espacé ou réécrit en pleine chasse", () => {
    expect(restoreTerms("⟦ 0 ⟧ et 〚1〛", ["A", "B"])).toEqual({ text: "A et B", intact: true });
  });

  it("signale un repère perdu ou dupliqué, et laisse un repère inconnu en place", () => {
    expect(restoreTerms("Il a mangé.", ["Rufy"])).toEqual({ text: "Il a mangé.", intact: false });
    expect(restoreTerms("⟦0⟧ et ⟦0⟧", ["Rufy"]).intact).toBe(false);
    expect(restoreTerms("⟦7⟧", ["Rufy"])).toEqual({ text: "⟦7⟧", intact: false });
  });

  it("ne protège pas une phrase qui porte déjà un crochet de repère", () => {
    expect(protectTerms("Luffy ⟦0⟧", glossary)).toEqual({ text: "Luffy ⟦0⟧", terms: [] });
  });

  it("laisse intacte une phrase sans terme, et un glossaire vide ne fait rien", () => {
    expect(protectTerms("Nothing here.", glossary)).toEqual({ text: "Nothing here.", terms: [] });
    expect(protectTerms("Luffy", prepareGlossary([]))).toEqual({ text: "Luffy", terms: [] });
  });

  it("traite un terme plein de caractères spéciaux comme du texte", () => {
    const special = prepareGlossary([{ source: "C++ (v2.0)", target: "C plus plus" }, { source: "$100?", target: "100 $" }]);
    const guarded = protectTerms("I like C++ (v2.0) for $100?", special);
    expect(guarded.text).toBe("I like ⟦0⟧ for ⟦1⟧");
  });
});

describe("glossaire : phrases résolues sans moteur", () => {
  it("répond à une phrase qui est exactement un terme", () => {
    expect(exactGlossaryMatch("  devil  FRUIT ", glossary)).toBe("Fruit du Démon");
    expect(exactGlossaryMatch("Ace", glossary)).toBe("Ace");
    expect(exactGlossaryMatch("Devil Fruit!", glossary)).toBeNull();
    expect(exactGlossaryMatch("ignored", glossary)).toBeNull();
  });

  it("reconnaît une phrase faite seulement de termes et de ponctuation", () => {
    expect(isOnlyTerms(protectTerms("Luffy!!", glossary))).toBe(true);
    expect(isOnlyTerms(protectTerms("Luffy… Ace?!", glossary))).toBe(true);
    expect(isOnlyTerms(protectTerms("Luffy runs", glossary))).toBe(false);
    expect(isOnlyTerms(protectTerms("!!", glossary))).toBe(false);
  });

  it("garde le premier terme déclaré quand il est en double", () => {
    const doubled = prepareGlossary([
      { source: "Zoro", target: "Zoro" },
      { source: "zoro", target: "Zorro" },
    ]);
    expect(exactGlossaryMatch("ZORO", doubled)).toBe("Zoro");
  });
});
