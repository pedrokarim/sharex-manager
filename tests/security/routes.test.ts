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
  "src/app/api/connections/[connector]/deauthorize/route.ts": "rappel de Meta, demande signée par le secret de l'application vérifiée (HMAC-SHA256), ne fait que passer des comptes « à reconnecter »",
  "src/app/api/connections/[connector]/data-deletion/route.ts": "rappel de Meta, demande signée vérifiée ; suivi par un code de 80 bits",
  "src/app/api/connections/media/[token]/route.ts": "fichier prêté à un service qui publie, jeton de 256 bits lié à un seul fichier, temporaire, lectures bornées, limité en débit",
  "src/app/api/contact/route.ts": "formulaire de la page vitrine, limité en débit",
  "src/app/api/public/albums/[slug]/route.ts": "albums publiés",
  "src/app/api/public/catalog/route.ts": "catalogue public",
  "src/app/api/public/sections/[section]/media/[...path]/route.ts":
    "images des sections de catalogue des modules : seul ce que le module déclare public, revérifié à chaque demande, limité en débit",
  "src/app/api/public/share/[token]/route.ts": "image prêtée à un service tiers par un jeton imprévisible et temporaire",
  "src/app/api/tools/provenance/route.ts": "outil public « Origine d'une image », borné en taille et en débit, rien n'est enregistré",
  "src/app/og/route.tsx": "image Open Graph par défaut du site, sans donnée",
};

/** Marques d'un contrôle d'accès dans le code d'une route. */
const GUARDS = [
  /withAuth\(/, // enveloppe commune (session, rôle, origine)
  /requireAccess\(/, // garde commun
  /auth\.api\.getSession\(/, // contrôle de session écrit à la main
  /x-api-key/, // envoi ShareX par clé API
  /isFileSecure\(/, // fichier public sauf s'il est sécurisé
  /visitorAccess\(/, // même règle, pour ce qui dérive d'un fichier (origine, version propre)
];

/**
 * Routes qui modifient sans vérifier l'origine, et pourquoi : aucune ne
 * s'appuie sur le cookie de session pour agir, une page d'un autre site n'y
 * gagne donc rien (pas de CSRF possible).
 */
const ORIGIN_EXEMPT: Record<string, string> = {
  "src/app/api/upload/route.ts": "envoi ShareX par clé API (en-tête x-api-key), sans cookie",
  "src/app/api/colors/route.ts": "calcul des couleurs d'une image envoyée, sans rien enregistrer",
  "src/app/api/files/provenance/route.ts": "lecture seule (POST pour porter la liste des noms)",
  "src/app/api/tools/provenance/route.ts": "outil public, lecture seule, rien n'est enregistré",
  "src/app/api/contact/route.ts": "formulaire public, sans session",
  "src/app/api/connections/[connector]/deauthorize/route.ts": "rappel de Meta, signé (HMAC)",
  "src/app/api/connections/[connector]/data-deletion/route.ts": "rappel de Meta, signé (HMAC)",
};

/** Marques d'un contrôle d'origine dans un gestionnaire. */
const ORIGIN_GUARDS = [/withAuth\(/, /requireAccess\(/, /isTrustedOrigin\(/];

/** Marques d'un contrôle du rôle admin dans un gestionnaire. */
const ADMIN_GUARDS = [/requireAccess\("admin"\)/, /role: "admin"/, /isAdmin\(/];

/**
 * Gestionnaires réservés aux admins (`*` : toutes les méthodes du fichier).
 * Un préfixe de dossier vaut pour toutes les routes qu'il contient.
 */
const ADMIN_ONLY: Record<string, string[]> = {
  "src/app/api/admin/": ["*"],
  "src/app/api/settings/config/route.ts": ["PUT"],
  "src/app/api/settings/domains/route.ts": ["POST", "PUT", "DELETE"],
  "src/app/api/settings/domains/config/route.ts": ["PUT"],
  "src/app/api/uploads/config/route.ts": ["POST"],
  "src/app/api/stats/geo/route.ts": ["GET"],
  "src/app/api/modules/install/route.ts": ["*"],
  "src/app/api/modules/install-dependencies/route.ts": ["*"],
  "src/app/api/modules/install-all-dependencies/route.ts": ["*"],
  "src/app/api/modules/enable/route.ts": ["*"],
  "src/app/api/modules/disable/route.ts": ["*"],
  "src/app/api/modules/[moduleName]/delete/route.ts": ["*"],
  "src/app/api/modules/[moduleName]/toggle/route.ts": ["*"],
  "src/app/api/modules/[moduleName]/auto-process/route.ts": ["*"],
  "src/app/api/modules/[moduleName]/settings/route.ts": ["PUT"],
};

const MUTATING = ["POST", "PUT", "PATCH", "DELETE"];
const METHODS = ["GET", "HEAD", "OPTIONS", ...MUTATING];

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" || name === "route.tsx" ? [full] : [];
  });
}

/** Code de chaque gestionnaire exporté, de son `export` au suivant. */
function routeHandlers(source: string): Map<string, string> {
  const pattern = new RegExp(`^export (?:async function|const) (${METHODS.join("|")})\\b`, "gm");
  const starts = [...source.matchAll(pattern)].map((match) => ({ method: match[1], index: match.index ?? 0 }));
  const handlers = new Map<string, string>();
  starts.forEach((start, position) => {
    const rest = source.slice(start.index + 1);
    const next = rest.search(/^export /m);
    const end = position + 1 < starts.length ? starts[position + 1].index : next === -1 ? source.length : start.index + 1 + next;
    handlers.set(start.method, source.slice(start.index, end));
  });
  return handlers;
}

function adminMethods(file: string): string[] {
  return Object.entries(ADMIN_ONLY).flatMap(([path, methods]) =>
    path.endsWith("/") ? (file.startsWith(path) ? methods : []) : file === path ? methods : []
  );
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
    expect(Object.keys(ORIGIN_EXEMPT).filter((file) => !files.includes(file))).toEqual([]);
    expect(
      Object.keys(ADMIN_ONLY).filter((path) => (path.endsWith("/") ? !files.some((file) => file.startsWith(path)) : !files.includes(path)))
    ).toEqual([]);
  });

  test("chaque gestionnaire qui modifie vérifie l'origine (CSRF)", () => {
    const missing = files.flatMap((file) => {
      if (ORIGIN_EXEMPT[file]) return [];
      const handlers = routeHandlers(readFileSync(join(root, file), "utf-8"));
      return MUTATING.filter((method) => {
        const code = handlers.get(method);
        // `withAuth(…, { origin: false })` coupe le contrôle : à déclarer ci-dessus.
        return code !== undefined && (!ORIGIN_GUARDS.some((guard) => guard.test(code)) || /origin: false/.test(code));
      }).map((method) => `${method} ${file}`);
    });
    expect(missing).toEqual([]);
  });

  test("chaque gestionnaire réservé aux admins vérifie le rôle", () => {
    const missing = files.flatMap((file) => {
      const wanted = adminMethods(file);
      if (wanted.length === 0) return [];
      const handlers = routeHandlers(readFileSync(join(root, file), "utf-8"));
      return [...handlers.entries()]
        .filter(([method]) => method !== "OPTIONS" && (wanted.includes("*") || wanted.includes(method)))
        .filter(([, code]) => !ADMIN_GUARDS.some((guard) => guard.test(code)))
        .map(([method]) => `${method} ${file}`);
    });
    expect(missing).toEqual([]);
  });
});
