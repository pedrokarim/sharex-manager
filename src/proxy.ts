import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CORS_BASE_HEADERS, resolveCorsOrigin } from "@/lib/security/cors";

/**
 * Le proxy ne fait qu'ajouter les en-têtes CORS : il laisse passer toutes les
 * requêtes, sans contrôle de session.
 *
 * Ce proxy voit l'intégralité du trafic, et pas seulement les pages de
 * l'application : le domaine d'images, dont c'est la raison d'être même du
 * produit, et tous les fichiers de `public/`. Restreindre ici emporte les deux
 * avec, et le site public se retrouve sans la moindre image. C'est exactement
 * ce qui est arrivé le 22/08/2026 (commit b8bbc66, révoqué).
 *
 * Chaque route se garde donc elle-même : les routes d'API par
 * `lib/api-guard.ts`, la confidentialité des images fichier par fichier dans
 * `app/img-handler/[filename]/route.ts` (`isFileSecure`), les pages privées
 * par le layout du groupe `(app)`, et les deux pages hors de ce groupe
 * (`/dashboard`, `/upgrade`) par leur propre vérification de session.
 *
 * L'ancien contrôle de session de ce fichier ne s'exécutait jamais (la liste
 * des routes publiques contenait `"/"`, testé avec `startsWith`) : il a été
 * retiré le 18/10/2026, sans changer le comportement.
 */

// Configuration du matcher.
// Pas de clé `runtime` ici : contrairement à middleware.ts, proxy.ts s'exécute
// toujours sur Node.js et Next refuse une config de segment dans ce fichier.
//
// Les routes d'envoi de fichiers sont exclues : Next copie en mémoire le corps
// de toute requête qui traverse le proxy et le tronque à 10 Mo
// (`proxyClientMaxBodySize`), si bien qu'un export de Clip Studio ou une
// capture ShareX un peu lourde arrivait coupé (« Envoi illisible »). Ces
// routes vérifient elles-mêmes la session ou le jeton, et sont de même
// origine : le proxy ne leur apportait rien.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/upload$|api/modules/[^/]+/upload$).*)",
  ],
};

export function proxy(req: NextRequest) {
  const response = NextResponse.next();
  // Origines admises : `lib/security/cors-origins.mjs` (variables d'environnement).
  const origin = resolveCorsOrigin(req.headers.get("origin"));
  // Pas de `Vary: Origin` : les images publiques passent par le cache de
  // Cloudflare, et le comportement doit rester celui d'avant.
  if (origin) response.headers.set("Access-Control-Allow-Origin", origin);
  for (const [key, value] of Object.entries(CORS_BASE_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}
