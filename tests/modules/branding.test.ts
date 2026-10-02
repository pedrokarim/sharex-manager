import { describe, expect, test } from "vitest";

import { moduleLogoUrl } from "@/lib/modules/branding";

describe("logo d'un module", () => {
  test("un module sans identité visuelle n'a pas d'adresse de logo", () => {
    expect(moduleLogoUrl({ name: "crop", version: "1.0.0" })).toBeUndefined();
    expect(moduleLogoUrl({ name: "crop", version: "1.0.0", branding: { accent: "#ffffff" } })).toBeUndefined();
  });

  test("l'adresse porte la version du module, et la taille demandée", () => {
    const module = { name: "clip-studio", version: "0.1.0", branding: { logo: "branding/logo.png" } };
    expect(moduleLogoUrl(module)).toBe("/api/modules/clip-studio/logo?v=0.1.0");
    expect(moduleLogoUrl(module, "small")).toBe("/api/modules/clip-studio/logo?v=0.1.0&size=small");
  });
});
