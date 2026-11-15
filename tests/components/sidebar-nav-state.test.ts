import { describe, expect, test } from "vitest";
import {
  activeSectionIds,
  collectHrefs,
  findActiveHref,
  isLinkActive,
  linkSectionId,
  openSections,
  type NavLink,
  type NavSection,
} from "@/components/sidebar/nav-state";

/** Extrait de la vraie barre : espace personnel, un module, l'administration. */
const gallery: NavLink = {
  url: "/gallery",
  items: [{ url: "/gallery?sort=recent" }, { url: "/gallery/starred" }, { url: "/gallery/secure" }],
};
const clipStudio: NavLink = {
  url: "/m/clip-studio",
  items: [{ url: "/m/clip-studio/projects" }, { url: "/m/clip-studio/exports" }],
};
const admin: NavLink[] = [{ url: "/admin" }, { url: "/admin/users" }, { url: "/admin/connections" }];
const tools: NavLink = { url: "/tools" };

const sections: NavSection[] = [
  { id: linkSectionId(gallery.url), links: [gallery] },
  { id: linkSectionId(clipStudio.url), links: [clipStudio] },
  { id: "group:admin", links: admin },
];
const hrefs = collectHrefs([gallery, clipStudio, tools, ...admin]);

describe("lien actif de la barre latérale", () => {
  test("la sous-page d'un module est active, son module aussi, et sa section s'ouvre", () => {
    const active = findActiveHref(hrefs, "/m/clip-studio/exports");
    expect(active).toBe("/m/clip-studio/exports");
    expect(isLinkActive(clipStudio, active)).toBe(true);
    expect(isLinkActive(gallery, active)).toBe(false);
    expect(activeSectionIds(sections, active)).toEqual([linkSectionId("/m/clip-studio")]);
  });

  test("une page du module absente du menu marque le module par le préfixe le plus long", () => {
    const active = findActiveHref(hrefs, "/m/clip-studio/exports/42");
    expect(active).toBe("/m/clip-studio/exports");
    expect(findActiveHref(hrefs, "/m/clip-studio/editor")).toBe("/m/clip-studio");
  });

  test("un préfixe ne compte qu'à une frontière de segment", () => {
    expect(findActiveHref(hrefs, "/m/clip-studio-2")).toBeNull();
    expect(findActiveHref(hrefs, "/galleryx")).toBeNull();
  });

  test("les paramètres d'un lien doivent être présents, et départagent à chemin égal", () => {
    expect(findActiveHref(hrefs, "/gallery")).toBe("/gallery");
    expect(findActiveHref(hrefs, "/gallery", "sort=recent&order=desc")).toBe("/gallery?sort=recent");
    expect(findActiveHref(hrefs, "/gallery", "sort=size")).toBe("/gallery");
  });

  test("une page d'administration ouvre le groupe Administration", () => {
    const active = findActiveHref(hrefs, "/admin/connections/acc-123");
    expect(active).toBe("/admin/connections");
    expect(activeSectionIds(sections, active)).toEqual(["group:admin"]);
    // La vue d'ensemble `/admin` ne l'emporte pas sur la page plus précise.
    expect(isLinkActive(admin[0], active)).toBe(false);
  });

  test("une page hors de la barre n'active rien et n'ouvre rien", () => {
    const active = findActiveHref(hrefs, "/account");
    expect(active).toBeNull();
    expect(activeSectionIds(sections, active)).toEqual([]);
  });
});

describe("ouverture des sections", () => {
  test("ouvre la section de la page sans toucher à celles que l'utilisateur a réglées", () => {
    const userState = { [linkSectionId("/gallery")]: true, "group:admin": false };
    expect(openSections(userState, [linkSectionId("/m/clip-studio")])).toEqual({
      [linkSectionId("/gallery")]: true,
      "group:admin": false,
      [linkSectionId("/m/clip-studio")]: true,
    });
  });

  test("rouvre une section refermée quand on arrive sur une de ses pages", () => {
    expect(openSections({ "group:admin": false }, ["group:admin"])).toEqual({ "group:admin": true });
  });

  test("renvoie le même objet quand tout est déjà ouvert", () => {
    const state = { "group:admin": true };
    expect(openSections(state, ["group:admin"])).toBe(state);
    expect(openSections(state, [])).toBe(state);
  });
});
