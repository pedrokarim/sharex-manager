import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { isEdgeRuntime } from "@/lib/utils";
import type { LogAction } from "@/lib/types/logs";

const imageDomain = process.env.NEXT_PUBLIC_IMAGE_DOMAIN;

/**
 * Surface publique, accessible sans session.
 *
 * L'ancienne liste contenait `"/"` et était testée avec `startsWith` : tout
 * chemin commençant par une barre oblique, donc *tous*, était considéré public.
 * Le proxy retournait immédiatement à chaque requête et ses deux contrôles —
 * 401 sur l'API, redirection vers la connexion sur les pages — n'étaient jamais
 * atteints.
 */
const PUBLIC_EXACT = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/about",
  "/contact",
  "/branding",
  "/support",
  "/feedback",
  "/about-app",
  "/og",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
  "/manifest.webmanifest",
]);

/** Préfixes publics : le chemin exact et tout ce qu'il contient. */
const PUBLIC_PREFIXES = [
  "/img-handler",
  "/catalog",
  "/tools",
  "/legal",
  "/api/public",
  "/_next",
];

function isPublicPath(path: string) {
  if (PUBLIC_EXACT.has(path)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

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

  // Les requêtes de pré-vérification CORS ne portent jamais de session : les
  // bloquer casserait toute requête inter-domaines avant même son envoi.
  if (req.method === "OPTIONS") {
    return setCorsHeaders(NextResponse.next(), req);
  }

  if (isPublicPath(path)) {
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
