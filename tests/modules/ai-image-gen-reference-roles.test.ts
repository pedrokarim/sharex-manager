import { describe, expect, it } from "vitest";
import {
  REFERENCE_ROLES,
  REFERENCE_ROLE_INFO,
  normalizeReferenceRole,
  referenceBrief,
} from "@/modules/ai-image-gen/lib/reference-roles";

describe("rôles des images de référence", () => {
  it("décrit chaque rôle pour l'écran et pour le modèle", () => {
    for (const role of REFERENCE_ROLES) {
      expect(REFERENCE_ROLE_INFO[role].label).toBeTruthy();
      expect(REFERENCE_ROLE_INFO[role].hint).toBeTruthy();
      expect(REFERENCE_ROLE_INFO[role].instruction).toBeTruthy();
    }
  });

  it("ramène une valeur inconnue à une simple inspiration", () => {
    expect(normalizeReferenceRole("style")).toBe("style");
    expect(normalizeReferenceRole("pirate")).toBe("reference");
    expect(normalizeReferenceRole(undefined)).toBe("reference");
  });
});

describe("consigne envoyée au moteur", () => {
  it("n'écrit rien sans image", () => {
    expect(referenceBrief([])).toBe("");
  });

  it("numérote les images et demande une image neuve sans retouche", () => {
    const brief = referenceBrief(["style", "subject"]);
    expect(brief).toContain("Images jointes :");
    expect(brief).toContain(`Image 1 : ${REFERENCE_ROLE_INFO.style.instruction}.`);
    expect(brief).toContain(`Image 2 : ${REFERENCE_ROLE_INFO.subject.instruction}.`);
    expect(brief).toContain("Crée une image nouvelle");
  });

  it("annonce les autres images comme références d'une retouche", () => {
    const brief = referenceBrief(["edit-target", "palette"]);
    expect(brief).toContain(REFERENCE_ROLE_INFO["edit-target"].instruction);
    expect(brief).toContain("Les autres images ne servent que de références pour la retouche.");
    expect(brief).not.toContain("Crée une image nouvelle");
  });

  it("se tait sur les autres images quand seule l'image à retoucher est jointe", () => {
    const brief = referenceBrief(["edit-target"]);
    expect(brief).toContain("Image jointe :");
    expect(brief).not.toContain("Les autres images");
    expect(brief).not.toContain("Crée une image nouvelle");
  });
});
