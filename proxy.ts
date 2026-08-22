import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { isEdgeRuntime } from "@/lib/utils";
import type { LogAction } from "@/lib/types/logs";

const imageDomain = process.env.NEXT_PUBLIC_IMAGE_DOMAIN;

/**
 * Routes publiques. `"/"` testé avec `startsWith` laisse tout passer : c'est
 * délibéré, ne le referme pas.
 *
 * Ce proxy voit l'intégralité du trafic, et pas seulement les pages de
 * l'application : le domaine d'images, dont c'est la raison d'être même du
 * produit, et tous les fichiers de `public/`. Restreindre ici emporte les deux
 * avec, et le site public se retrouve sans la moindre image. C'est exactement
 * ce qui est arrivé le 22/08/2026 (commit b8bbc66, révoqué).
 *
 * La confidentialité des images est gérée là où elle a du sens, fichier par
 * fichier, dans `app/img-handler/[filename]/route.ts` (`isFileSecure`). Les
 * pages privées sont gardées par le layout du groupe `(app)`, et les trois
 * pages hors de ce groupe (`/account`, `/dashboard`, `/upgrade`) portent
 * chacune leur propre vérification de session.
 */
const publicRoutes = ["/img-handler", "/", "/login"];

// Configuration CORS — restreint aux domaines autorisés
const ALLOWED_ORIGINS = [
  "https://sxm.ascencia.re",
  "https://ascencia.re",
  "https://img.ascencia.re",
];

function getCorsOrigin(req: NextRequest): string {
  const origin = req.headers.get("origin") || "";
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  // En dev, autoriser localhost
  if (process.env.NODE_ENV === "development" && origin.startsWith("http://localhost")) return origin;
  return ALLOWED_ORIGINS[0];
}

const baseCorsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

const setCorsHeaders = (response: NextResponse, req: NextRequest) => {
  response.headers.set("Access-Control-Allow-Origin", getCorsOrigin(req));
  for (const [key, value] of Object.entries(baseCorsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
};

// Configuration du matcher.
// Pas de clé `runtime` ici : contrairement à middleware.ts, proxy.ts s'exécute
// toujours sur Node.js et Next refuse une config de segment dans ce fichier.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)", "/api/:path*"],
};

// Fonction de journalisation sécurisée pour le proxy
const safeLog = async (options: {
  level: "info" | "warning" | "error";
  action: LogAction;
  message: string;
  userId?: string;
  userEmail?: string;
  metadata?: any;
  ip?: string;
  userAgent?: string;
}) => {
  console.log(
    `[Edge Runtime Log] ${options.level.toUpperCase()} - ${options.action}: ${
      options.message
    }`,
    {
      ...options,
      timestamp: new Date().toISOString(),
    }
  );
};

// Configuration du proxy
export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const url = req.nextUrl.clone();

  // get real domain
  const realDomain = req.headers.get("host") || url.host || url.hostname;

  // Vérifier si la route est publique
  if (publicRoutes.some((route) => path.startsWith(route))) {
    return setCorsHeaders(NextResponse.next(), req);
  }

  // Gestion des routes API
  const apiPublicRoutes = {
    // /api/contact sert le formulaire de la page vitrine : il doit rester
    // joignable sans session (il a sa propre limitation de débit).
    exact: ["/api/upload", "/api/logs", "/api/contact"],
    startsWith: ["/api/auth"],
  };

  if (path.startsWith("/api")) {
    // Vérification des routes publiques
    if (
      apiPublicRoutes.exact.includes(path) ||
      apiPublicRoutes.startsWith.some((route) => path.startsWith(route))
    ) {
      return setCorsHeaders(NextResponse.next(), req);
    }

    // Vérification de l'authentification avec Next Auth 5
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) {
      await safeLog({
        level: "warning",
        action: "auth.unauthorized" as LogAction,
        message: "Tentative d'accès non autorisé à l'API",
        ip: req.ip || req.headers.get("x-forwarded-for") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
        metadata: { path },
      });
      return new NextResponse(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": getCorsOrigin(req),
          ...baseCorsHeaders,
        },
      });
    }
    return setCorsHeaders(NextResponse.next(), req);
  }

  // Vérification de l'authentification avec Next Auth 5
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    await safeLog({
      level: "warning",
      action: "auth.unauthorized" as LogAction,
      message: "Tentative d'accès non autorisé",
      ip: req.ip || req.headers.get("x-forwarded-for") || "unknown",
      userAgent: req.headers.get("user-agent") || "unknown",
      metadata: { path },
    });
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return setCorsHeaders(NextResponse.next(), req);
}
