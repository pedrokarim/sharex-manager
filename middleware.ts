import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const imageDomain = process.env.NEXT_PUBLIC_IMAGE_DOMAIN;

// Configuration combinée
export default auth(async function middleware(req) {
	const path = req.nextUrl.pathname;
	const isLoggedIn = !!req.auth;

	const url = req.nextUrl.clone();

	// get real domain
	const realDomain = req.headers.get("host") || url.host || url.hostname;

	console.log("[LOG] realDomain: ", realDomain, " - imageDomain: ", imageDomain);

	// Gestion du domaine d'images
	if (realDomain === imageDomain) {
		return NextResponse.rewrite(
			new URL(`/img-handler${url.pathname}`, req.url),
		);
	}

	// Gestion des routes API
	const apiPublicRoutes = ["/api/auth", "/api/upload"];

	if (path.startsWith("/api")) {
		if (apiPublicRoutes.some((route) => path.startsWith(route))) {
			return setCorsHeaders(NextResponse.next());
		}

		if (!isLoggedIn) {
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

	// Gestion des routes pages
	const isAuthPage = path.startsWith("/login");

	if (isAuthPage) {
		if (isLoggedIn) {
			return NextResponse.redirect(new URL("/", req.nextUrl));
		}
		return setCorsHeaders(NextResponse.next());
	}

	// Autoriser l'accès à la page d'accueil sans authentification
	if (!isLoggedIn && path !== "/") {
		return NextResponse.redirect(new URL("/login", req.nextUrl));
	}

	return setCorsHeaders(NextResponse.next());
});

// Configuration CORS
const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const setCorsHeaders = (response: NextResponse) => {
	Object.entries(corsHeaders).forEach(([key, value]) => {
		response.headers.set(key, value);
	});
	return response;
};

// Configuration du matcher
export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)", "/api/:path*"],
};
