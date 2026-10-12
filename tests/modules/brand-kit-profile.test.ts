/**
 * Ce que l'image de marque apporte au profil des comptes connectés :
 * description de la chaîne (modèle), bio, pays ; migration douce des
 * marques d'avant ; préremplissage (`profileBrandInput`).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CHANNEL_DESCRIPTION, createDefaultKit, upgradePublishing } from "@/modules/brand-kit/lib/defaults";
import { profileBrandInput } from "@/modules/brand-kit/lib/profile";
import { sanitizeKit } from "@/modules/brand-kit/lib/validate";
import { createKit, requireKit } from "@/modules/brand-kit/lib/server/kits";
import { kitDir, setDataRoot } from "@/modules/brand-kit/lib/server/store";
import { brandProfileValue } from "@/lib/connections/profile";
import { getConnector } from "@/lib/connections/registry";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "brand-kit-profile-"));
  setDataRoot(root);
});
afterEach(() => {
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

describe("profil des comptes dans la marque", () => {
  it("une marque neuve a un modèle de description de chaîne, sans bio ni pays", () => {
    expect(createDefaultKit("Neuve").publishing).toMatchObject({ channelDescriptionTemplate: DEFAULT_CHANNEL_DESCRIPTION, bio: "", country: "" });
  });

  it("une marque d'avant le profil est complétée à la lecture, sans perdre ses réglages", () => {
    expect(upgradePublishing({ tags: ["a"], descriptionTemplate: "{hook}" })).toMatchObject({
      descriptionTemplate: "{hook}",
      channelDescriptionTemplate: DEFAULT_CHANNEL_DESCRIPTION,
      bio: "",
      country: "",
    });
    // Valeurs de mauvais type : reprises par défaut plutôt que gardées.
    expect(upgradePublishing({ bio: 42, country: null, channelDescriptionTemplate: ["x"] })).toMatchObject({ bio: "", country: "", channelDescriptionTemplate: DEFAULT_CHANNEL_DESCRIPTION });

    const kit = createKit({ name: "Ancienne" });
    const legacy = structuredClone(kit) as unknown as Record<string, any>;
    legacy.publishing = { accountIds: [], titleTemplate: "{title}", descriptionTemplate: "{hook}", tags: ["anime"], categoryId: "24", defaultPrivacy: "private", containsSyntheticMedia: true, madeForKids: false };
    fs.writeFileSync(path.join(kitDir(kit.id), "brand.json"), JSON.stringify(legacy));
    expect(requireKit(kit.id).publishing).toMatchObject({ channelDescriptionTemplate: DEFAULT_CHANNEL_DESCRIPTION, bio: "", country: "", tags: ["anime"] });
  });

  it("contrôle : pays ISO en majuscules, bio bornée, modèle gardé", () => {
    const stored = createDefaultKit("Marque");
    const input = (patch: Record<string, unknown>) => ({ ...stored, publishing: { ...stored.publishing, ...patch } });
    expect(sanitizeKit(input({ country: "FR" }), stored).publishing.country).toBe("FR");
    expect(sanitizeKit(input({ country: "fr" }), stored).publishing.country).toBe("");
    expect(sanitizeKit(input({ country: "FRA" }), stored).publishing.country).toBe("");
    expect(sanitizeKit(input({ bio: "x".repeat(400) }), stored).publishing.bio).toHaveLength(150);
    expect(sanitizeKit(input({ channelDescriptionTemplate: "{brand}\n\n{links}" }), stored).publishing.channelDescriptionTemplate).toBe("{brand}\n\n{links}");
  });

  it("préremplissage : modèle rendu avec la marque, mots-clés repris des tags, langue et pays", () => {
    const kit = createDefaultKit("Ma Marque");
    kit.tagline = "Les sorties de la semaine";
    kit.language = "fr";
    kit.publishing = {
      ...kit.publishing,
      channelDescriptionTemplate: "{hook}\n\n{title}\n\n{links}\n\nPar {brand}",
      tags: ["anime", "jeu vidéo"],
      bio: "Une bio courte",
      country: "BE",
      links: [
        { label: "Site", url: "https://exemple.fr" },
        { label: "Cassé", url: "pas une adresse" },
      ],
    };
    const input = profileBrandInput(kit, new Date("2026-10-12T12:00:00Z"));
    // {title} est vide hors d'un clip : sa ligne disparaît ; un lien invalide n'est pas repris.
    expect(input.description).toMatch(/^Les sorties de la semaine\n\nSite\s:\shttps:\/\/exemple\.fr\n\nPar Ma Marque$/);
    expect(input).toMatchObject({ name: "Ma Marque", bio: "Une bio courte", keywords: ["anime", "jeu vidéo"], language: "fr", country: "BE" });
    expect(input.links).toEqual([{ label: "Site", url: "https://exemple.fr" }]);

    // Les éléments déclarés par YouTube se préremplissent depuis cette entrée.
    const fields = getConnector("youtube")!.profileFields!;
    const value = (key: string) => brandProfileValue(fields.find((field) => field.key === key)!, input);
    expect(value("description")).toBe(input.description);
    expect(value("keywords")).toEqual(["anime", "jeu vidéo"]);
    expect(value("defaultLanguage")).toBe("fr");
    expect(value("country")).toBe("BE");
    expect(value("unsubscribedTrailer")).toBeUndefined();
  });
});
