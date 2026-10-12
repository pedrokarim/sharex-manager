/**
 * Début de la connexion d'un compte : session administrateur exigée, `state`
 * et vérificateur PKCE rangés dans un cookie de transaction signé (dix
 * minutes), puis redirection vers le service (dossier 07, § 8.3 et § 8.9).
 *
 * Paramètres : `scopes` (jeu de portées), `mode=popup` (le retour rendra une
 * page qui prévient la fenêtre d'origine puis se ferme) et `returnTo` (chemin
 * interne où revenir ; toute adresse externe est ignorée).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "@/lib/api-guard";
import { AppNotConfiguredError, TRANSACTION_COOKIE, TRANSACTION_TTL_SECONDS, safeReturnPath, startAuthorization } from "@/lib/connections/oauth";
import { connectionErrorCode, returnUrl, transactionCookieOptions } from "@/lib/connections/routes";
import { errorMessage } from "@/lib/connections/errors";

export async function GET(request: NextRequest, { params }: { params: Promise<{ connector: string }> }) {
  const guard = await requireAccess("admin");
  if (!guard.ok) return guard.response;
  const { connector } = await params;
  const search = request.nextUrl.searchParams;
  const scopes = search.get("scopes");
  const mode = search.get("mode") === "popup" ? "popup" : "redirect";
  const returnTo = safeReturnPath(search.get("returnTo"));
  try {
    const { url, cookie } = startAuthorization(connector, scopes, Date.now(), { mode, returnTo });
    const response = NextResponse.redirect(url);
    response.cookies.set(TRANSACTION_COOKIE, cookie, { ...transactionCookieOptions(), maxAge: TRANSACTION_TTL_SECONDS });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const code = connectionErrorCode(error);
    if (error instanceof AppNotConfiguredError) return NextResponse.redirect(returnUrl(request, returnTo, { configure: connector, errorCode: code }));
    return NextResponse.redirect(returnUrl(request, returnTo, { error: errorMessage(error, "Connexion impossible."), errorCode: code, connector }));
  }
}
