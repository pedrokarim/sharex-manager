/** Règles pures des collections et filtres de la galerie (sans base ni disque). */
import { describe, expect, it, vi } from "vitest";
import {
  isPlainFileName,
  matchesCollection,
  parseCollectionRules,
  replaceRuleSlug,
  rulesFromJson,
  uniqueSlug,
} from "@/lib/organization/rules";
import { cleanTagName, hasAnyRule, slugify } from "@/lib/organization/types";
import type { FileInfo } from "@/types/files";

const { findCollection } = vi.hoisted(() => ({ findCollection: vi.fn() }));

// La galerie lit la base des tags (`bun:sqlite`, absente sous Node) : simulée.
vi.mock("@/lib/organization/organization-db", () => ({
  organizationDb: { tagsByFile: () => new Map(), findCollection },
}));

const NOW = new Date("2026-11-15T12:00:00Z");

function file(name: string, createdAt: string, extra: Partial<FileInfo> = {}): FileInfo {
  return { name, url: `/api/files/${name}`, size: name.length, createdAt, ...extra };
}

describe("slugs et noms", () => {
  it("donne le même slug à « Jeu vidéo » et « jeu-video »", () => {
    expect(slugify("Jeu vidéo")).toBe("jeu-video");
    expect(slugify("  jeu-video ")).toBe("jeu-video");
    expect(cleanTagName("  Captures   de jeu ")).toBe("Captures de jeu");
    expect(cleanTagName("!!!")).toBeNull();
  });

  it("trouve le premier slug libre", () => {
    expect(uniqueSlug("videos", new Set())).toBe("videos");
    expect(uniqueSlug("videos", new Set(["videos", "videos-2"]))).toBe("videos-3");
    expect(uniqueSlug("", new Set())).toBe("collection");
  });

  it("refuse un chemin à la place d'un nom de fichier", () => {
    expect(isPlainFileName("a.png")).toBe(true);
    for (const bad of ["../a.png", "a/b.png", "a\\b.png", ".env", "", 3]) expect(isPlainFileName(bad)).toBe(false);
  });
});

describe("validation des règles", () => {
  it("normalise les slugs, retire les listes vides", () => {
    expect(parseCollectionRules({ tagsAll: ["Jeu vidéo", "jeu-video", ""], tagsAny: [], search: "  recu  " })).toEqual({
      tagsAll: ["jeu-video"],
      search: "recu",
    });
  });

  it("refuse une clé inconnue, une période fausse, un type inconnu", () => {
    expect(parseCollectionRules({ nope: true })).toBeNull();
    expect(parseCollectionRules({ period: { lastDays: 0 } })).toBeNull();
    expect(parseCollectionRules({ period: { from: "2026-13-45" } })).toBeNull();
    expect(parseCollectionRules({ kinds: ["audio"] })).toBeNull();
    expect(parseCollectionRules("x")).toBeNull();
  });

  it("une collection sans règle n'a aucune règle", () => {
    expect(hasAnyRule(parseCollectionRules({ tagsAll: [], period: {} })!)).toBe(false);
    expect(hasAnyRule(parseCollectionRules({ starred: false })!)).toBe(true);
  });

  it("lit une valeur abîmée en base comme des règles vides", () => {
    expect(rulesFromJson("{oops")).toEqual({});
    expect(rulesFromJson(JSON.stringify({ kinds: ["video"] }))).toEqual({ kinds: ["video"] });
  });

  it("remplace ou retire un slug dans toutes les listes", () => {
    const rules = { tagsAll: ["a", "b"], tagsAny: ["a"], tagsNone: ["c"] };
    expect(replaceRuleSlug(rules, "a", "b")).toEqual({ tagsAll: ["b"], tagsAny: ["b"], tagsNone: ["c"] });
    expect(replaceRuleSlug(rules, "a", null)).toEqual({ tagsAll: ["b"], tagsNone: ["c"] });
  });
});

describe("matchesCollection", () => {
  const video = file("clip.mp4", "2026-11-10T10:00:00Z", { isStarred: true });
  const image = file("recu-edf.png", "2026-09-01T10:00:00Z", { isSecure: true });

  it("combine tags, types, favoris, sécurisés et texte", () => {
    expect(matchesCollection(video, ["valorant"], { tagsAll: ["valorant"], kinds: ["video"] }, NOW)).toBe(true);
    expect(matchesCollection(video, ["valorant"], { tagsAll: ["valorant", "clip"] }, NOW)).toBe(false);
    expect(matchesCollection(video, ["clip"], { tagsAny: ["valorant", "clip"] }, NOW)).toBe(true);
    expect(matchesCollection(video, ["clip"], { tagsNone: ["clip"] }, NOW)).toBe(false);
    expect(matchesCollection(video, [], { kinds: ["image"] }, NOW)).toBe(false);
    expect(matchesCollection(video, [], { starred: true }, NOW)).toBe(true);
    expect(matchesCollection(image, [], { starred: false, secure: true }, NOW)).toBe(true);
    expect(matchesCollection(image, [], { secure: false }, NOW)).toBe(false);
    expect(matchesCollection(image, [], { search: "EDF" }, NOW)).toBe(true);
  });

  it("borne la période, `to` compris jusqu'à la fin du jour", () => {
    expect(matchesCollection(video, [], { period: { lastDays: 30 } }, NOW)).toBe(true);
    expect(matchesCollection(image, [], { period: { lastDays: 30 } }, NOW)).toBe(false);
    expect(matchesCollection(image, [], { period: { from: "2026-09-01", to: "2026-09-01" } }, NOW)).toBe(true);
    expect(matchesCollection(video, [], { period: { to: "2026-11-09" } }, NOW)).toBe(false);
  });

  it("ne retient rien sans règle", () => {
    expect(matchesCollection(video, ["a"], {}, NOW)).toBe(false);
  });
});

describe("galerie : filtres par tag et par collection", () => {
  const files = [
    file("a.png", "2026-11-01T00:00:00Z"),
    file("b.mp4", "2026-11-03T00:00:00Z"),
    file("c.mp4", "2026-11-02T00:00:00Z"),
  ];
  const tags = new Map([
    ["a.png", ["valorant", "clip"]],
    ["b.mp4", ["valorant"]],
  ]);

  it("lit `tag` répété et `collection` dans l'adresse", async () => {
    const { galleryQueryFrom } = await import("@/lib/gallery-listing");
    const query = galleryQueryFrom(new URLSearchParams("tag=Valorant&tag=clip&tag=valorant&collection=12"));
    expect(query.tags).toEqual(["valorant", "clip"]);
    expect(query.collectionId).toBe("12");
    expect(galleryQueryFrom(new URLSearchParams("")).tags).toBeUndefined();
  });

  it("exige tous les tags demandés", async () => {
    const { applyGalleryQuery } = await import("@/lib/gallery-listing");
    expect(applyGalleryQuery(files, { tags: ["valorant"] }, tags, NOW).map((f) => f.name)).toEqual(["b.mp4", "a.png"]);
    expect(applyGalleryQuery(files, { tags: ["valorant", "clip"] }, tags, NOW).map((f) => f.name)).toEqual(["a.png"]);
  });

  it("applique les règles d'une collection et ne montre rien sans règle", async () => {
    const { applyGalleryQuery, previewCollection } = await import("@/lib/gallery-listing");
    const rules = { tagsAll: ["valorant"], kinds: ["video" as const] };
    expect(applyGalleryQuery(files, { collection: rules }, tags, NOW).map((f) => f.name)).toEqual(["b.mp4"]);
    expect(applyGalleryQuery(files, { collection: {} }, tags, NOW)).toEqual([]);
    expect(previewCollection(files, tags, { rules: { kinds: ["video"] }, sort: "name", order: "asc" }, NOW)).toEqual({
      fileCount: 2,
      cover: ["b.mp4", "c.mp4"],
    });
  });

  it("résout une collection du compte, avec son tri si l'adresse n'en impose pas", async () => {
    const { resolveGalleryCollection, listGalleryFiles } = await import("@/lib/gallery-listing");
    findCollection.mockImplementation((id: string, userId: string) =>
      id === "7" && userId === "u1" ? { id: 7, rules: { kinds: ["video"] }, sort: "name", order: "asc" } : null,
    );
    const resolved = resolveGalleryCollection({ collectionId: "7", sort: "date", order: "desc" }, "u1");
    expect(resolved?.query).toMatchObject({ collection: { kinds: ["video"] }, sort: "name", order: "asc" });
    const explicit = resolveGalleryCollection({ collectionId: "7", sort: "size", order: "desc" }, "u1", {
      sort: true,
      order: false,
    });
    expect(explicit?.query).toMatchObject({ sort: "size", order: "asc" });
    expect(resolveGalleryCollection({ collectionId: "7" }, "u2")).toBeNull();
    // Une collection non résolue ne doit jamais donner la galerie entière.
    await expect(listGalleryFiles({ collectionId: "7" })).rejects.toThrow();
  });
});
