import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";

/**
 * Le proxy laisse tout passer (voir proxy.ts) : chaque route se protège
 * elle-même. Ce test échoue dès qu'une route n'a aucun contrôle d'accès et
 * ne figure pas dans la liste des routes publiques, relue en revue. C'est
 * l'oubli qui avait laissé les flux temps réel ouverts à tout visiteur.
 */

/** Routes publiques par conception, et pourquoi. */
const PUBLIC_ROUTES: Record<string, string> = {
  "src/app/api/auth/[...all]/route.ts": "connexion et session (better-auth)",
  "src/app/api/contact/route.ts": "formulaire de la page vitrine, limité en débit",
  "src/app/api/public/albums/[slug]/route.ts": "albums publiés",
  "src/app/api/public/catalog/route.ts": "catalogue public",
};

/** Marques d'un contrôle d'accès dans le code d'une route. */
const GUARDS = [
  /requireAccess\(/, // garde commun
  /auth\.api\.getSession\(/, // contrôle de session écrit à la main
  /x-api-key/, // envoi ShareX par clé API
  /isFileSecure\(/, // fichier public sauf s'il est sécurisé
];

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

describe("contrôle d'accès des routes", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const files = routeFiles(join(root, "src", "app")).map((file) => relative(root, file).split("\\").join("/"));

  test("chaque route a un contrôle d'accès ou est déclarée publique", () => {
    const unguarded = files.filter((file) => {
      if (PUBLIC_ROUTES[file]) return false;
      const source = readFileSync(join(root, file), "utf-8");
      return !GUARDS.some((guard) => guard.test(source));
    });
    expect(unguarded).toEqual([]);
  });

  test("la liste des routes publiques ne mentionne que des routes existantes", () => {
    expect(Object.keys(PUBLIC_ROUTES).filter((file) => !files.includes(file))).toEqual([]);
  });
});
