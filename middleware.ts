import { auth } from "@/auth";
import { NextResponse } from "next/server";

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

// Voir https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
