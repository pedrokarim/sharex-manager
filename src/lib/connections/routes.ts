/**
 * Aides des routes OAuth : adresse de retour, options du cookie de
 * transaction, page de retour en fenêtre surgissante, codes d'erreur.
 */

import { randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { CONNECTION_CHANNEL, type ConnectionResultMessage } from "./types";
import { OAuthError } from "./errors";
import { publicBaseUrl } from "./apps";
import { AppNotConfiguredError, safeReturnPath } from "./oauth";

/** Adresse de la page d'administration, tirée d'AUTH_URL (sinon de la requête). */
export function adminPageUrl(request: NextRequest, params: Record<string, string> = {}): URL {
  return returnUrl(request, undefined, params);
}

/**
 * Adresse où revenir après la connexion : le chemin interne `returnTo` validé
 * (sinon « Comptes connectés »), sur l'origine d'AUTH_URL (sinon de la requête).
 */
export function returnUrl(request: NextRequest, returnTo: string | undefined, params: Record<string, string> = {}): URL {
  const path = safeReturnPath(returnTo) ?? "/admin/connections";
  const url = new URL(path, `${publicBaseUrl() ?? request.nextUrl.origin}/`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value.slice(0, 300));
  return url;
}

/**
 * `HttpOnly`, `SameSite=Lax` (le retour du service est une navigation de
 * premier niveau) et `Secure`. Seule exception : une instance servie en HTTP
 * sur une autre machine que `localhost`, où le navigateur refuserait un
 * cookie `Secure` et où la connexion ne pourrait jamais aboutir.
 */
export function transactionCookieOptions() {
  const base = publicBaseUrl();
  let secure = true;
  if (base?.startsWith("http://")) {
    const host = new URL(base).hostname;
    secure = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  }
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/api/connections" };
}

/** Code lisible d'une erreur de connexion, que l'interface traduit en action à faire. */
export function connectionErrorCode(error: unknown): string {
  if (error instanceof AppNotConfiguredError) return "app_not_configured";
  if (error instanceof OAuthError) return error.code.replace(/[^A-Za-z0-9_]/g, "").slice(0, 60) || "connection_failed";
  return "connection_failed";
}

/** Code d'erreur rendu par le service dans l'adresse de retour (`error=access_denied`). */
export function serviceErrorCode(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 60) || "connection_failed";
}

const escapeScript = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/**
 * Page de retour en mode « popup » : prévient la fenêtre d'origine
 * (`postMessage` limité à l'origine de l'application, et `BroadcastChannel`
 * de secours quand le service a coupé le lien entre les fenêtres), puis se
 * ferme. Sans fenêtre d'origine, elle mène à `fallback` (le parcours, avec le
 * résultat dans l'adresse). Script en ligne autorisé par un nonce, rien
 * d'autre.
 */
export function popupResultResponse(request: NextRequest, message: ConnectionResultMessage, fallback: URL): Response {
  const origin = new URL(`${publicBaseUrl() ?? request.nextUrl.origin}/`).origin;
  const nonce = randomBytes(16).toString("base64");
  const text = message.ok ? "Connexion terminée : cette fenêtre va se fermer." : "La connexion n’a pas abouti : cette fenêtre va se fermer.";
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Connexion du compte</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#fff;color:#111}@media (prefers-color-scheme:dark){body{background:#111;color:#eee}}p{padding:16px;text-align:center}</style>
</head>
<body>
<p>${text}</p>
<script nonce="${nonce}">
(function () {
  var message = ${escapeScript(message)};
  var origin = ${escapeScript(origin)};
  var fallback = ${escapeScript(fallback.toString())};
  try { if (window.BroadcastChannel) { var channel = new BroadcastChannel(${escapeScript(CONNECTION_CHANNEL)}); channel.postMessage(message); channel.close(); } } catch (e) {}
  if (window.opener && !window.opener.closed) {
    try { window.opener.postMessage(message, origin); } catch (e) {}
    window.close();
    setTimeout(function () { window.location.replace(fallback); }, 1500);
  } else {
    window.location.replace(fallback);
  }
})();
</script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}
