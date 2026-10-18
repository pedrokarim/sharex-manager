import { describe, expect, it } from "vitest";
import {
  REFERENCE_ROLES,
  REFERENCE_ROLE_INFO,
  normalizeReferenceRole,
  referenceBrief,
  resolveReferenceRoles,
  rolesFromPrompt,
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
    expect(brief).toContain("Images jointes, numérotées dans l’ordre où tu les reçois (la demande les désigne par ce numéro) :");
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


describe("image dont le message dit le rôle", () => {
  it("laisse le message décider, sans retoucher par défaut", () => {
    const brief = referenceBrief(["auto", "auto"]);
    expect(brief).toContain(`Image 1 : ${REFERENCE_ROLE_INFO.auto.instruction}.`);
    expect(brief).toContain("Si la demande ne désigne aucune image à modifier, crée une image nouvelle");
  });

  it("lit la phrase de l'utilisateur : une référence, puis l'image numéro 2 à modifier", () => {
    expect(rolesFromPrompt("Tu vas te servir de cette image comme référence pour pouvoir modifier une image numéro 2.", 2)).toEqual([
      "reference",
      "edit-target",
    ]);
  });

  it("reconnaît les tournures courantes", () => {
    expect(rolesFromPrompt("Sers-toi de l’image 1 comme référence pour modifier l’image 2", 2)).toEqual(["reference", "edit-target"]);
    expect(rolesFromPrompt("Prends le style de l'image 1 et applique-le à l'image 2", 2)).toEqual(["style", "edit-target"]);
    expect(rolesFromPrompt("Retouche la deuxième image avec les couleurs de la première image", 2)).toEqual(["palette", "edit-target"]);
    expect(rolesFromPrompt("Garde le personnage de l'image 3 dans un décor de forêt", 3)).toEqual([undefined, undefined, "subject"]);
    expect(rolesFromPrompt("Modifie le style de l'image 2 en t'inspirant de l'image 1", 2)).toEqual(["reference", "edit-target"]);
    expect(rolesFromPrompt("Cette image va servir de référence : un chat roux sur un toit", 1)).toEqual(["reference"]);
    expect(rolesFromPrompt("Modifie cette image : ajoute un chapeau", 1)).toEqual(["edit-target"]);
  });

  it("ne devine rien quand la phrase ne dit rien de net", () => {
    expect(rolesFromPrompt("Un phare au crépuscule", 2)).toEqual([undefined, undefined]);
    expect(rolesFromPrompt("Mélange l'image 1 et l'image 2", 2)).toEqual([undefined, undefined]);
    expect(rolesFromPrompt("Modifie l'image 5", 2)).toEqual([undefined, undefined]);
  });

  it("ne remplace que les rôles « Auto »", () => {
    expect(resolveReferenceRoles(["auto", "style"], "Modifie l'image 1 et l'image 2")).toEqual(["edit-target", "style"]);
    expect(resolveReferenceRoles(["auto"], "Un phare")).toEqual(["auto"]);
  });
});

describe("demande transmise à Codex", () => {
  it("numérote les fichiers, donne leur rôle et laisse la demande parler des images", async () => {
    const { findCliEngineSpec } = await import("@/modules/ai-image-gen/lib/engines/cli-engines");
    const plan = findCliEngineSpec("codex")!.plan({
      request: {
        prompt: "Sers-toi de l'image 1 comme référence pour modifier l'image 2",
        model: "codex/gpt-image-2",
        size: "1024x1024",
        n: 1,
        references: [
          { b64: "", mimeType: "image/png", role: "reference" },
          { b64: "", mimeType: "image/png", role: "edit-target" },
        ],
      },
      workspace: "/tmp/w",
      outputDir: "/tmp/w/out",
      referenceFiles: ["/tmp/w/ref-1.png", "/tmp/w/ref-2.png"],
      options: {},
    });
    const text = [plan.stdin ?? "", ...plan.args].join("\n");
    expect(text).toContain("Image 1 : ref-1.png");
    expect(text).toContain("Image 2 : ref-2.png");
    expect(text).toContain(`Image 2 : ${REFERENCE_ROLE_INFO["edit-target"].instruction}.`);
    expect(text).toContain("Les autres images ne servent que de références pour la retouche.");
    expect(text).toContain("désignée par son numéro : suis-le sur ce point");
  });
});
