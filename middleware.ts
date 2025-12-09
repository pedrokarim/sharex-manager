import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { isEdgeRuntime } from "@/lib/utils";
import type { LogAction } from "@/lib/types/logs";

const imageDomain = process.env.NEXT_PUBLIC_IMAGE_DOMAIN;

// Liste des routes publiques
const publicRoutes = ["/img-handler", "/", "/login"];

// Configuration CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

const setCorsHeaders = (response: NextResponse) => {
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
};

// Configuration du matcher
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
    "/api/:path*",
    "/api/auth/callback/credentials",
    "/api/auth/signout",
  ],
  runtime: "nodejs",
};

// Fonction de journalisation sécurisée pour le middleware
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

// Configuration du middleware
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const url = req.nextUrl.clone();

  // get real domain
  const realDomain = req.headers.get("host") || url.host || url.hostname;

  // Vérifier si la route est publique
  if (publicRoutes.some((route) => path.startsWith(route))) {
    return setCorsHeaders(NextResponse.next());
  }

  // Gestion des routes API
  const apiPublicRoutes = {
    exact: ["/api/upload", "/api/logs"],
    startsWith: ["/api/auth"],
  };

  if (path.startsWith("/api")) {
    // Vérification des routes publiques
    if (
      apiPublicRoutes.exact.includes(path) ||
      apiPublicRoutes.startsWith.some((route) => path.startsWith(route))
    ) {
      return setCorsHeaders(NextResponse.next());
    }

    // Vérification de l'authentification avec Next Auth 5
    const session = await auth();
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
          ...corsHeaders,
        },
      });
    }
    return setCorsHeaders(NextResponse.next());
  }

  // Vérification de l'authentification avec Next Auth 5
  const session = await auth();
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

  // Gérer les tentatives de connexion
  if (path === "/api/auth/callback/credentials") {
    const email = req.nextUrl.searchParams.get("email");
    await safeLog({
      level: "info",
      action: "auth.login" as LogAction,
      message: "Tentative de connexion",
      userEmail: email || "inconnu",
      ip: req.ip || req.headers.get("x-forwarded-for") || "unknown",
      userAgent: req.headers.get("user-agent") || "unknown",
      metadata: { email },
    });
  }

  return setCorsHeaders(NextResponse.next());
}
