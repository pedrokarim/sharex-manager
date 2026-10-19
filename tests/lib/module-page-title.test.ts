import { describe, expect, it } from "vitest";
import { moduleDisplayName, modulePageTitle } from "@/lib/modules/page-title";

const studio = {
  name: "clip-studio",
  navItems: [{ title: "Clip Studio" }],
  pages: [
    { path: "", title: "Accueil", component: "pages/hub.tsx" },
    { path: "projects", title: "Projets", component: "pages/projects.tsx" },
  ],
};

describe("titres des pages de module", () => {
  it("nomme la page puis le module", () => {
    expect(modulePageTitle(studio, "projects")).toBe("Projets · Clip Studio");
  });

  it("garde le nom du module seul sur la page racine", () => {
    expect(modulePageTitle(studio, "")).toBe("Clip Studio");
  });

  it("retombe sur le nom du module pour une page inconnue", () => {
    expect(modulePageTitle(studio, "nowhere")).toBe("Clip Studio");
  });

  it("rend l'identifiant lisible quand le module n'a pas d'entrée de menu", () => {
    expect(moduleDisplayName({ name: "hello-world" })).toBe("Hello world");
  });
});
