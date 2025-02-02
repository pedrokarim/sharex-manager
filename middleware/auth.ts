import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Liste des routes qui n'ont pas besoin d'authentification
const publicRoutes = [
  "/api/auth",
  "/api/upload", // Cette route utilise l'authentification par clé API
];

// Vérifie si une route est publique
const isPublicRoute = (path: string) => {
  return publicRoutes.some((route) => path.startsWith(route));
};

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Si c'est une route publique, on continue
  if (isPublicRoute(path)) {
    return NextResponse.next();
  }

  // Vérifie la session
  const session = await auth();

  // Si pas de session, renvoie une erreur 401
  if (!session) {
    return new NextResponse(JSON.stringify({ error: "Non autorisé" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Si tout est ok, on continue
  return NextResponse.next();
}

// Configuration des routes à protéger
export const config = {
  matcher: "/api/:path*",
};
