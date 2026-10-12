/**
 * Début de la connexion d'un compte : session administrateur exigée, `state`
 * et vérificateur PKCE rangés dans un cookie de transaction signé (dix
 * minutes), puis redirection vers le service (dossier 07, § 8.3 et § 8.9).
 *
 * Paramètres : `scopes` (jeu de portées), `mode=popup` (le retour rendra une
 * page qui prévient la fenêtre d'origine puis se ferme) et `returnTo` (chemin
 * interne où revenir ; toute adresse externe est ignorée).
 *
 * Connexion incrémentale : `account=<id>&add=<capacité>,<capacité>` relance
 * la connexion d'un compte déjà connecté en demandant ses portées actuelles
 * plus celles des capacités ajoutées (« Autoriser les commentaires »). Rien
 * de plus n'est jamais demandé sans ce geste.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "@/lib/api-guard";
import { AppNotConfiguredError, TRANSACTION_COOKIE, TRANSACTION_TTL_SECONDS, safeReturnPath, startAuthorization } from "@/lib/connections/oauth";
import { connectionErrorCode, returnUrl, transactionCookieOptions } from "@/lib/connections/routes";
import { errorMessage } from "@/lib/connections/errors";
import { getAccountSummary } from "@/lib/connections/accounts";
import { incrementalScopes, requireReadyConnector } from "@/lib/connections/registry";
import { isCapability } from "@/lib/connections/types";

/** Portées d'une connexion incrémentale, ou `undefined` sans `add`. */
function requestedScopes(connectorId: string, accountId: string | null, add: string | null): string[] | undefined {
  if (!add) return undefined;
  const capabilities = add.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 10);
  if (capabilities.length === 0 || !capabilities.every(isCapability)) throw new Error("Autorisation demandée inconnue.");
  const account = accountId ? getAccountSummary(accountId) : null;
  if (!account || account.connector !== connectorId) throw new Error("Compte introuvable.");
  const scopes = incrementalScopes(requireReadyConnector(connectorId), account.scopes, capabilities);
  // Rien ne manque : on reconnecte avec les portées actuelles du compte.
  return scopes ?? account.scopes;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ connector: string }> }) {
  const guard = await requireAccess("admin");
  if (!guard.ok) return guard.response;
  const { connector } = await params;
  const search = request.nextUrl.searchParams;
  const scopes = search.get("scopes");
  const mode = search.get("mode") === "popup" ? "popup" : "redirect";
  const returnTo = safeReturnPath(search.get("returnTo"));
  try {
    const extra = requestedScopes(connector, search.get("account"), search.get("add"));
    const { url, cookie } = startAuthorization(connector, scopes, Date.now(), { mode, returnTo, ...(extra ? { scopes: extra } : {}) });
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
