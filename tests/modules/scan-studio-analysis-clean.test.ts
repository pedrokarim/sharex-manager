import { describe, expect, it } from "vitest";
import { cleanReading, isAllCaps, joinLines, toSentenceCase } from "@/modules/scan-studio/lib/analysis/clean-text";

describe("nettoyage du texte lu : caractères", () => {
  it("normalise l'Unicode (NFKC) : pleine chasse, ligatures, points de suspension", () => {
    expect(cleanReading("Ｗｈａｔ？！")).toBe("What?!");
    expect(cleanReading("ﬁnally…")).toBe("finally...");
  });

  it("retire les caractères de contrôle et invisibles", () => {
    expect(cleanReading("He​llo\u0007 the﻿re‮")).toBe("Hello there");
    expect(cleanReading("soft­ware")).toBe("software");
  });

  it("ramène guillemets, apostrophes et tirets à des formes régulières", () => {
    expect(cleanReading("“Don’t,” she said")).toBe('"Don\'t," she said');
    expect(cleanReading("wait -- what")).toBe("wait — what");
    expect(cleanReading("well‐known")).toBe("well-known");
  });

  it("ramène la ponctuation CJK à sa forme latine", () => {
    expect(cleanReading("「Yes」。")).toBe('"Yes".');
  });

  it("rend une chaîne vide pour un texte vide ou fait de blancs", () => {
    expect(cleanReading("")).toBe("");
    expect(cleanReading(" \n\t ")).toBe("");
  });
});

describe("nettoyage du texte lu : lignes", () => {
  it("recolle les lignes d'une bulle par des espaces", () => {
    expect(cleanReading("We have to leave\nbefore sunrise!")).toBe("We have to leave before sunrise!");
  });

  it("réunit une césure de fin de ligne", () => {
    expect(cleanReading("It is simply impos-\nsible to cross.")).toBe("It is simply impossible to cross.");
    expect(joinLines(["IM-", "POSSIBLE"])).toBe("IMPOSSIBLE");
  });

  it("garde le trait d'un bégaiement", () => {
    expect(joinLines(["W-", "WHAT"])).toBe("W-WHAT");
  });

  it("traite un trait d'union conditionnel en fin de ligne comme une césure", () => {
    expect(cleanReading("impos­\nsible")).toBe("impossible");
  });

  it("écarte les traits lus au bord d'une bulle", () => {
    expect(joinLines(["| Are you sure", "about this? |"])).toBe("Are you sure about this?");
  });
});

describe("nettoyage du texte lu : ponctuation", () => {
  it("régularise les points de suspension", () => {
    expect(cleanReading("Three hours later. . .")).toBe("Three hours later...");
    expect(cleanReading("Wait.....what")).toBe("Wait... what");
  });

  it("retire l'espace avant un signe de ponctuation", () => {
    expect(cleanReading("What was that ?!")).toBe("What was that?!");
    expect(cleanReading("Yes , sir .")).toBe("Yes, sir.");
  });

  it("resserre les espaces", () => {
    expect(cleanReading("too    many   spaces")).toBe("too many spaces");
  });
});

describe("nettoyage du texte lu : casse", () => {
  it("reconnaît un lettrage en capitales", () => {
    expect(isAllCaps("WE HAVE TO LEAVE")).toBe(true);
    expect(isAllCaps("We have to leave")).toBe(false);
    expect(isAllCaps("?!")).toBe(false);
  });

  it("remet un lettrage en capitales en casse de phrase", () => {
    expect(cleanReading("WE HAVE TO LEAVE\nBEFORE SUNRISE!")).toBe("We have to leave before sunrise!");
    expect(cleanReading("NO! GO BACK! WE CAN'T.")).toBe("No! Go back! We can't.");
  });

  it("rend sa majuscule au pronom I", () => {
    expect(cleanReading("I THINK I'LL WAIT UNTIL I AM SURE.")).toBe("I think I'll wait until I am sure.");
  });

  it("ne met pas de majuscule après des points de suspension", () => {
    expect(toSentenceCase("WAIT... WHAT? NO.")).toBe("Wait... what? No.");
  });

  it("ne touche pas à un texte en casse mixte", () => {
    expect(cleanReading("Good morning, Professor.")).toBe("Good morning, Professor.");
  });
});

describe("nettoyage du texte lu : confusions de lecture", () => {
  it("corrige 0 lu pour O et 1 lu pour I dans des capitales", () => {
    expect(cleanReading("N0 WAY, 1T 1S T00 LATE")).toBe("No way, it is too late");
    expect(cleanReading("G0 BACK")).toBe("Go back");
  });

  it("corrige l et | lus pour I", () => {
    expect(cleanReading("l THlNK | CAN")).toBe("I think I can");
    expect(cleanReading("l'm sure l'll be fine")).toBe("I'm sure I'll be fine");
  });

  it("corrige un I majuscule au milieu d'un mot en minuscules", () => {
    expect(cleanReading("HeIlo there, wiIl you come?")).toBe("Hello there, will you come?");
  });

  it("corrige un chiffre au milieu d'un mot en minuscules", () => {
    expect(cleanReading("he11o w0rld")).toBe("hello world");
  });

  it("laisse les vrais nombres et les ordinaux", () => {
    expect(cleanReading("THE 12 RIDERS OF THE 1ST LEGION, 100 MEN")).toBe("The 12 riders of the 1st legion, 100 men");
    expect(cleanReading("ERROR 404: ROOM B52")).toBe("Error 404: room b52");
    expect(cleanReading("on the 3rd floor at 10")).toBe("on the 3rd floor at 10");
  });

  it("ne remplace pas un chiffre isolé à côté d'une seule lettre, hors mot courant", () => {
    expect(cleanReading("SECTOR A1 IS CLOSED")).toBe("Sector a1 is closed");
  });
});

describe("nettoyage du texte lu : termes protégés", () => {
  it("rend aux termes du glossaire leur casse", () => {
    expect(cleanReading("WHO IS OLIVIA? ASK THE IRON GUARD.", { protectedTerms: ["Olivia", "Iron Guard"] })).toBe(
      "Who is Olivia? Ask the Iron Guard.",
    );
  });

  it("ne corrige jamais un mot du glossaire", () => {
    expect(cleanReading("UNIT R0B1 IS DOWN", { protectedTerms: ["R0B1"] })).toBe("Unit R0B1 is down");
    expect(cleanReading("UNIT R0B1 IS DOWN")).toBe("Unit robi is down");
  });
});
