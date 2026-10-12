/**
 * Retour du service après le consentement : session administrateur exigée,
 * `state` vérifié contre le cookie de transaction, échange du code sans
 * délai, lecture du ou des comptes (dossier 07, § 8.3 et § 8.9).
 *
 * - Un seul compte : chiffré et enregistré tout de suite (un compte déjà
 *   connu est mis à jour).
 * - Plusieurs comptes : mis de côté dix minutes (`pending.ts`), l'interface
 *   fait choisir ceux à garder.
 *
 * En mode « popup », la réponse est une petite page qui prévient la fenêtre
 * d'origine puis se ferme ; sinon, une redirection vers `returnTo` (ou
 * « Comptes connectés ») avec le résultat dans l'adresse : `connected`,
 * `pending`, ou `error` et `errorCode`.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "@/lib/api-guard";
import { TRANSACTION_COOKIE, oauthMessage, readTransaction, type Transaction } from "@/lib/connections/oauth";
import { receiveAuthorization } from "@/lib/connections/pending";
import { wakePublishQueue } from "@/lib/connections/publish-queue";
import { connectionErrorCode, popupResultResponse, returnUrl, serviceErrorCode, transactionCookieOptions } from "@/lib/connections/routes";
import { errorMessage } from "@/lib/connections/errors";
import { auditConnection } from "@/lib/connections/audit";
import { CONNECTION_MESSAGE_TYPE, type ConnectionResultMessage } from "@/lib/connections/types";

function finish(response: Response) {
  // Le cookie de transaction ne sert qu'une fois.
  const next = response instanceof NextResponse ? response : new NextResponse(response.body, response);
  next.cookies.set(TRANSACTION_COOKIE, "", { ...transactionCookieOptions(), maxAge: 0 });
  next.headers.set("Cache-Control", "no-store");
  return next;
}

/** Réponse selon le mode : page de retour en fenêtre surgissante, sinon redirection. */
function respond(request: NextRequest, transaction: Pick<Transaction, "mode" | "returnTo"> | null, message: ConnectionResultMessage) {
  const params: Record<string, string> = { connector: message.connector };
  if (message.ok && message.state === "connected") params.connected = message.accountIds.length === 1 ? message.accountIds[0] : message.grantId;
  else if (message.ok && message.state === "pending") params.pending = message.pendingId;
  else if (!message.ok) Object.assign(params, { error: message.error.message, errorCode: message.error.code });
  const fallback = returnUrl(request, transaction?.returnTo, params);
  if (transaction?.mode === "popup") return finish(popupResultResponse(request, message, fallback));
  return finish(NextResponse.redirect(fallback));
}

/** Transaction lue sans vérifier `state`, seulement pour savoir comment répondre à une erreur. */
function peekTransaction(request: NextRequest, connector: string): Pick<Transaction, "mode" | "returnTo"> | null {
  try {
    return readTransaction(request.cookies.get(TRANSACTION_COOKIE)?.value, connector, request.nextUrl.searchParams.get("state"));
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ connector: string }> }) {
  const guard = await requireAccess("admin");
  if (!guard.ok) return finish(guard.response);
  const { connector } = await params;
  const search = request.nextUrl.searchParams;
  const failure = (code: string, message: string): ConnectionResultMessage => ({ type: CONNECTION_MESSAGE_TYPE, ok: false, connector, error: { code, message } });

  const refused = search.get("error");
  if (refused) {
    const code = serviceErrorCode(refused);
    return respond(request, peekTransaction(request, connector), failure(code, oauthMessage(code)));
  }

  let transaction: Transaction | null = null;
  try {
    transaction = readTransaction(request.cookies.get(TRANSACTION_COOKIE)?.value, connector, search.get("state"));
    const code = search.get("code");
    if (!code || code.length > 2048) throw new Error("Code d’autorisation manquant.");
    const outcome = await receiveAuthorization(connector, code, transaction, String(guard.session.user?.id ?? ""));
    if (outcome.kind === "pending") {
      auditConnection(guard.session, `Connexion ${connector} : ${outcome.count} comptes trouvés, en attente du choix`, { connector, count: outcome.count });
      return respond(request, transaction, { type: CONNECTION_MESSAGE_TYPE, ok: true, connector, state: "pending", pendingId: outcome.pendingId, count: outcome.count });
    }
    for (const account of outcome.accounts) {
      auditConnection(guard.session, `Compte connecté : ${account.connectorLabel} « ${account.name} »`, {
        connector: account.connector,
        accountId: account.id,
        externalId: account.externalId,
        scopes: account.scopes,
      });
    }
    // Des travaux attendaient peut-être la reconnexion de ce compte.
    wakePublishQueue();
    return respond(request, transaction, {
      type: CONNECTION_MESSAGE_TYPE,
      ok: true,
      connector,
      state: "connected",
      grantId: outcome.grantId,
      accountIds: outcome.accounts.map((account) => account.id),
    });
  } catch (error) {
    const message = errorMessage(error, "Connexion impossible.");
    auditConnection(guard.session, `Échec de la connexion d’un compte ${connector} : ${message}`, { connector }, "warning");
    return respond(request, transaction ?? peekTransaction(request, connector), failure(connectionErrorCode(error), message));
  }
}
