import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDefaultKit, upgradePublishing } from "@/modules/brand-kit/lib/defaults";
import { cleanLinkUrl, sanitizeHashtags, sanitizeKit, sanitizeLinks, sanitizeServiceTemplates } from "@/modules/brand-kit/lib/validate";
import { createKit, saveKit, requireKit } from "@/modules/brand-kit/lib/server/kits";
import { kitDir, setDataRoot } from "@/modules/brand-kit/lib/server/store";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "brand-kit-publishing-"));
  setDataRoot(root);
});
afterEach(() => {
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

describe("textes de publication de la marque : migration douce", () => {
  it("une marque d'avant les hashtags recopie ses tags à la lecture", () => {
    const kit = createKit({ name: "Ancienne" });
    // Fiche telle qu'une version précédente l'écrivait : ni hashtags, ni légende, ni liens.
    const legacy = structuredClone(kit) as unknown as Record<string, any>;
    legacy.publishing = { accountIds: [], titleTemplate: "{title}", descriptionTemplate: "{hook}\n\n{tags}", tags: ["anime", "jeu vidéo"], categoryId: "24", defaultPrivacy: "private", containsSyntheticMedia: true, madeForKids: false };
    fs.writeFileSync(path.join(kitDir(kit.id), "brand.json"), JSON.stringify(legacy));

    const read = requireKit(kit.id);
    expect(read.publishing).toMatchObject({
      descriptionTemplate: "{hook}\n\n{tags}",
      tags: ["anime", "jeu vidéo"],
      hashtags: ["anime", "jeu vidéo"],
      captionTemplate: "{title}\n\n{cta}",
      firstCommentTemplate: "",
      serviceTemplates: {},
      links: [],
    });
    // Enregistrée, la fiche garde des hashtags propres, distincts des tags ensuite.
    const saved = saveKit({ ...read, publishing: { ...read.publishing, tags: ["anime"] } }, read.updatedAt);
    expect(saved.publishing.hashtags).toEqual(["anime", "jeuvidéo"]);
    expect(saved.publishing.tags).toEqual(["anime"]);
  });

  it("une marque qui a ses hashtags (même vides) les garde", () => {
    expect(upgradePublishing({ tags: ["a"], hashtags: [] }).hashtags).toEqual([]);
    expect(upgradePublishing(null)).toMatchObject({ hashtags: [], tags: [], serviceTemplates: {}, titleTemplate: "{title}" });
  });

  it("une marque neuve a des modèles pour chaque sorte de texte", () => {
    expect(createDefaultKit("Neuve").publishing).toMatchObject({
      titleTemplate: "{title}",
      descriptionTemplate: "{summary}\n\n{links}\n\n{credits}",
      captionTemplate: "{title}\n\n{cta}",
      firstCommentTemplate: "",
      hashtags: [],
      links: [],
      defaultPrivacy: "private",
    });
  });
});

describe("textes de publication de la marque : validation", () => {
  it("liens : http(s) seulement, sans identifiants, bornés", () => {
    expect(cleanLinkUrl("https://exemple.fr/page?x=1")).toBe("https://exemple.fr/page?x=1");
    for (const bad of ["javascript:alert(1)", "ftp://exemple.fr", "https://user:pass@exemple.fr", "exemple.fr", "https://localhost", "https://a b.fr", `https://exemple.fr/${"x".repeat(600)}`]) {
      expect(cleanLinkUrl(bad)).toBeNull();
    }
    const links = sanitizeLinks([{ label: "  Site\n officiel ", url: "https://exemple.fr" }, { label: "Mauvais", url: "javascript:alert(1)" }, "texte", ...Array.from({ length: 15 }, (_, index) => ({ label: `L${index}`, url: `https://exemple.fr/${index}` }))]);
    expect(links[0]).toEqual({ label: "Site officiel", url: "https://exemple.fr" });
    expect(links).toHaveLength(10);
  });

  it("hashtags : sans « # » ni espace ni doublon, 30 au plus", () => {
    expect(sanitizeHashtags(["#Anime", "anime", "jeu vidéo", "c'est-ça", "", 4])).toEqual(["Anime", "jeuvidéo", "cestça"]);
    expect(sanitizeHashtags(Array.from({ length: 40 }, (_, index) => `t${index}`))).toHaveLength(30);
  });

  it("modèles par service : identifiants plausibles, champs connus, règle des hashtags valide", () => {
    expect(
      sanitizeServiceTemplates({
        threads: { captionTemplate: "{title}", hashtagRule: "topic", evil: "x" },
        youtube: { firstCommentTemplate: "", hashtagRule: "partout" },
        "../x": { titleTemplate: "y" },
        instagram: {},
        facebook: "pas un objet",
      })
    ).toEqual({ threads: { captionTemplate: "{title}", hashtagRule: "topic" }, youtube: { firstCommentTemplate: "" } });
    const many = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`s${index}x`, { titleTemplate: "t" }]));
    expect(Object.keys(sanitizeServiceTemplates(many))).toHaveLength(12);
  });

  it("une fiche reçue du navigateur est bornée champ par champ", () => {
    const stored = createDefaultKit("Marque");
    const kit = sanitizeKit(
      {
        ...stored,
        publishing: {
          ...stored.publishing,
          captionTemplate: "x".repeat(3000),
          firstCommentTemplate: 42,
          serviceTemplates: { threads: { captionTemplate: "{title}" } },
          hashtags: ["#un"],
          links: [{ label: "Site", url: "https://exemple.fr" }],
        },
      },
      stored
    );
    expect(kit.publishing.captionTemplate).toHaveLength(2200);
    expect(kit.publishing.firstCommentTemplate).toBe("");
    expect(kit.publishing.serviceTemplates).toEqual({ threads: { captionTemplate: "{title}" } });
    expect(kit.publishing.hashtags).toEqual(["un"]);
    expect(kit.publishing.links).toEqual([{ label: "Site", url: "https://exemple.fr" }]);
  });
});
