import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from 'next/server'

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith("/login");

  if (isAuthPage) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/", req.nextUrl));
    }
    return null;
  }

  if (!isLoggedIn && req.nextUrl.pathname !== "/") {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return null;
});

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Autoriser les requêtes depuis localhost:3000
  response.headers.set('Access-Control-Allow-Origin', '*')
  
  // Autoriser les méthodes HTTP
  response.headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  )
  
  // Autoriser les en-têtes
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  )

  return response
}

// Voir https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
