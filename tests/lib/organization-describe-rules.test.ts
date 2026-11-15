import { describe, expect, it } from "vitest";
import { describeRules, formatRuleDate, joinWords } from "@/lib/organization/describe-rules";
import { draftFromRules, rulesFromDraft, EMPTY_DRAFT } from "@/app/(app)/organization/collections/rules-draft";
import { sortCollections } from "@/app/(app)/organization/collections/collection-api";

const NBSP = " ";
const names = { valorant: "Valorant", apex: "Apex Legends", recu: "Reçu", maquette: "Maquette" };

describe("describeRules", () => {
  it("résume l'exemple de la spécification", () => {
    expect(describeRules({ kinds: ["video"], tagsAll: ["valorant"], period: { lastDays: 30 } }, names)).toBe(
      "Vidéos · tag Valorant · 30 derniers jours",
    );
  });

  it("dit « Aucune règle » quand rien ne filtre", () => {
    expect(describeRules({})).toBe("Aucune règle");
    expect(describeRules({ tagsAll: [], kinds: [], search: "  " })).toBe("Aucune règle");
  });

  it("met la première lettre en capitale, quel que soit le premier morceau", () => {
    expect(describeRules({ tagsAll: ["valorant"] }, names)).toBe("Tag Valorant");
    expect(describeRules({ starred: true })).toBe("Favoris");
  });

  it("distingue tous les tags, au moins un, et aucun", () => {
    expect(describeRules({ tagsAll: ["valorant", "apex"] }, names)).toBe("Tags Valorant et Apex Legends");
    expect(describeRules({ tagsAny: ["valorant", "apex"] }, names)).toBe("Tag Valorant ou Apex Legends");
    expect(describeRules({ tagsNone: ["recu"] }, names)).toBe("Sans le tag Reçu");
    expect(describeRules({ tagsNone: ["recu", "maquette"] }, names)).toBe("Sans les tags Reçu ni Maquette");
  });

  it("affiche le slug d'un tag inconnu", () => {
    expect(describeRules({ tagsAll: ["tag-supprime"] }, names)).toBe("Tag tag-supprime");
  });

  it("range les types dans un ordre fixe", () => {
    expect(describeRules({ kinds: ["file", "image"] })).toBe("Images et autres fichiers");
    expect(describeRules({ kinds: ["video", "file", "image"] })).toBe("Images, vidéos et autres fichiers");
  });

  it("lit les favoris et les fichiers sécurisés dans les deux sens", () => {
    expect(describeRules({ starred: false, secure: true })).toBe("Hors favoris · sécurisés");
    expect(describeRules({ secure: false })).toBe("Hors fichiers sécurisés");
  });

  it("écrit les périodes relatives et fixes", () => {
    expect(describeRules({ period: { lastDays: 1 } })).toBe("Dernières 24 heures");
    expect(describeRules({ period: { from: "2026-11-01", to: "2026-11-15" } })).toBe(
      "Du 1er nov. 2026 au 15 nov. 2026",
    );
    expect(describeRules({ period: { from: "2026-03-04" } })).toBe("Depuis le 4 mars 2026");
    expect(describeRules({ period: { to: "2026-03-04" } })).toBe("Jusqu’au 4 mars 2026");
  });

  it("cite le texte cherché entre guillemets français", () => {
    expect(describeRules({ kinds: ["image"], search: " facture " })).toBe(
      `Images · nom contenant «${NBSP}facture${NBSP}»`,
    );
  });

  it("garde l'ordre types, tags, favoris, sécurisés, période, texte", () => {
    expect(
      describeRules(
        {
          search: "clip",
          period: { lastDays: 7 },
          secure: false,
          starred: true,
          tagsNone: ["recu"],
          tagsAny: ["apex"],
          tagsAll: ["valorant"],
          kinds: ["video"],
        },
        names,
      ),
    ).toBe(
      `Vidéos · tag Valorant · tag Apex Legends · sans le tag Reçu · favoris · hors fichiers sécurisés · 7 derniers jours · nom contenant «${NBSP}clip${NBSP}»`,
    );
  });
});

describe("outils de l'éditeur", () => {
  it("joint les mots à la française", () => {
    expect(joinWords([])).toBe("");
    expect(joinWords(["a"])).toBe("a");
    expect(joinWords(["a", "b", "c"], "ou")).toBe("a, b ou c");
  });

  it("laisse une date illisible telle quelle", () => {
    expect(formatRuleDate("demain")).toBe("demain");
  });

  it("n'envoie que les conditions remplies", () => {
    expect(rulesFromDraft(EMPTY_DRAFT)).toEqual({});
    expect(rulesFromDraft({ ...EMPTY_DRAFT, periodMode: "last", lastDays: "abc" })).toEqual({});
    expect(rulesFromDraft({ ...EMPTY_DRAFT, periodMode: "range", to: "2026-11-15" })).toEqual({
      period: { to: "2026-11-15" },
    });
    expect(rulesFromDraft({ ...EMPTY_DRAFT, starred: "exclude", search: "  x " })).toEqual({
      starred: false,
      search: "x",
    });
  });

  it("relit des règles enregistrées sans les altérer", () => {
    const rules = {
      tagsAll: ["valorant"],
      tagsNone: ["recu"],
      kinds: ["video" as const],
      starred: true,
      secure: false,
      period: { lastDays: 30 },
      search: "clip",
    };
    expect(rulesFromDraft(draftFromRules(rules))).toEqual(rules);
  });

  it("place les collections épinglées d'abord, sans changer l'ordre du reste", () => {
    const list = [
      { id: 1, pinned: false },
      { id: 2, pinned: true },
      { id: 3, pinned: false },
      { id: 4, pinned: true },
    ];
    expect(sortCollections(list).map((item) => item.id)).toEqual([2, 4, 1, 3]);
  });
});
