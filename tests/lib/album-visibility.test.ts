import { describe, expect, test } from "vitest";

import { ALBUM_VISIBILITIES, albumVisibility, isInCatalog, visibilityFlags } from "@/lib/album-visibility";

describe("visibilité d'un album", () => {
  test("un album sans drapeau est privé : c'est l'état par défaut", () => {
    expect(albumVisibility({})).toBe("private");
    expect(albumVisibility({ isPublic: false, inCatalog: false })).toBe("private");
  });

  test("public sans être listé : accessible par son lien seulement", () => {
    expect(albumVisibility({ isPublic: true, inCatalog: false })).toBe("link");
    expect(isInCatalog({ isPublic: true, inCatalog: false })).toBe(false);
  });

  test("public et listé : au catalogue", () => {
    expect(albumVisibility({ isPublic: true, inCatalog: true })).toBe("catalog");
    expect(isInCatalog({ isPublic: true, inCatalog: true })).toBe(true);
  });

  test("un album privé n'est jamais au catalogue, même si le drapeau traîne", () => {
    expect(albumVisibility({ isPublic: false, inCatalog: true })).toBe("private");
    expect(isInCatalog({ isPublic: false, inCatalog: true })).toBe(false);
  });

  test("chaque visibilité redonne ses drapeaux, et inversement", () => {
    for (const visibility of ALBUM_VISIBILITIES) {
      expect(albumVisibility(visibilityFlags(visibility))).toBe(visibility);
    }
    expect(visibilityFlags("private")).toEqual({ isPublic: false, inCatalog: false });
    expect(visibilityFlags("link")).toEqual({ isPublic: true, inCatalog: false });
    expect(visibilityFlags("catalog")).toEqual({ isPublic: true, inCatalog: true });
  });
});
