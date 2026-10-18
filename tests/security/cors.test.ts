import { describe, expect, it } from "vitest";
import {
  allowedCorsOrigins,
  appOrigins,
  imageHost,
  primaryAppOrigin,
  resolveCorsOrigin,
  toOrigin,
} from "@/lib/security/cors";

const production = {
  NODE_ENV: "production",
  NEXT_PUBLIC_APP_DOMAIN: "sxm.example.org",
  NEXT_PUBLIC_IMAGE_DOMAIN: "img.example.org",
  AUTH_URL: "https://sxm.example.org",
  NEXT_PUBLIC_API_URL: "https://sxm.example.org",
};

describe("origines admises", () => {
  it("lit les domaines nus ou les adresses complètes", () => {
    expect(toOrigin("sxm.example.org")).toBe("https://sxm.example.org");
    expect(toOrigin("http://localhost:3000/chemin")).toBe("http://localhost:3000");
    expect(toOrigin("")).toBeNull();
    expect(toOrigin("javascript:alert(1)")).toBeNull();
  });

  it("n'écrit aucun domaine en dur", () => {
    expect(primaryAppOrigin({})).toBeNull();
    expect(allowedCorsOrigins({})).toEqual([]);
    expect(imageHost({})).toBeNull();
    expect(resolveCorsOrigin("https://ascencia.re", {})).toBeNull();
  });

  it("admet l'application, le domaine d'images et les origines supplémentaires", () => {
    const env = { ...production, CORS_EXTRA_ORIGINS: "https://vitrine.example.org, pas une url, " };
    expect(primaryAppOrigin(env)).toBe("https://sxm.example.org");
    expect(imageHost(env)).toBe("img.example.org");
    expect(allowedCorsOrigins(env)).toEqual([
      "https://sxm.example.org",
      "https://img.example.org",
      "https://vitrine.example.org",
    ]);
    // Seule l'application compte pour le contrôle CSRF et better-auth.
    expect(appOrigins(env)).toEqual(["https://sxm.example.org"]);
  });

  it("renvoie l'origine admise, sinon l'origine principale", () => {
    expect(resolveCorsOrigin("https://img.example.org", production)).toBe("https://img.example.org");
    expect(resolveCorsOrigin("https://attaquant.example", production)).toBe("https://sxm.example.org");
    expect(resolveCorsOrigin(null, production)).toBe("https://sxm.example.org");
  });

  it("admet localhost en développement seulement", () => {
    expect(resolveCorsOrigin("http://localhost:3200", { ...production, NODE_ENV: "development" })).toBe("http://localhost:3200");
    expect(resolveCorsOrigin("http://localhost:3200", production)).toBe("https://sxm.example.org");
    expect(appOrigins({ NODE_ENV: "development", PORT: "3100" })).toEqual(["http://localhost:3100"]);
  });
});
