import { describe, expect, it } from "vitest";
import { appendScope, appendSort } from "@/app/(app)/gallery/gallery-request";

const sort = { sortBy: "name", sortOrder: "asc" };

describe("requêtes de la galerie", () => {
  it("envoie le tri de l’utilisateur hors collection", () => {
    const params = new URLSearchParams();
    appendSort(params, sort, { collectionId: undefined, sortChosen: false });
    expect(params.get("sort")).toBe("name");
    expect(params.get("order")).toBe("asc");
  });

  it("laisse une collection appliquer son tri tant qu’aucun tri n’a été choisi à la main", () => {
    const params = new URLSearchParams();
    appendSort(params, sort, { collectionId: 4, sortChosen: false });
    expect(params.has("sort")).toBe(false);
    expect(params.has("order")).toBe(false);
  });

  it("envoie le tri choisi dans la barre d’outils, même sur une collection", () => {
    const params = new URLSearchParams();
    appendSort(params, sort, { collectionId: 4, sortChosen: true });
    expect(params.toString()).toBe("sort=name&order=asc");
  });

  it("répète `tag=` et ajoute `collection=`", () => {
    const params = new URLSearchParams();
    appendScope(params, ["valorant", "recu"], 4);
    expect(params.getAll("tag")).toEqual(["valorant", "recu"]);
    expect(params.get("collection")).toBe("4");
    const empty = new URLSearchParams();
    appendScope(empty, [], undefined);
    expect(empty.toString()).toBe("");
  });
});
