/**
 * Adresses de rappel que Meta (Facebook, Instagram, Threads) appelle sans
 * session : retrait de l'autorisation (« deauthorize ») et demande de
 * suppression des données (« data deletion »). Chaque appel porte une
 * demande signée (`signed_request`) : `<signature>.<données>`, en base64url,
 * la signature étant le HMAC-SHA256 des données avec le secret de
 * l'application du service. Sans signature valide, rien ne se passe.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { disconnectAccount, listAccounts, markNeedsReconnect } from "./accounts";
import { SIGNED_CALLBACK_CONNECTORS, getAppCredentials, publicBaseUrl } from "./apps";
import { getConnector } from "./registry";
import { readStore, updateStore } from "./store";

/** Services de Meta dont les rappels sont signés par le secret de leur application. */
export const META_CONNECTORS = SIGNED_CALLBACK_CONNECTORS;

/** Une demande signée ne dépasse jamais cette taille. */
export const SIGNED_REQUEST_MAX_BYTES = 8 * 1024;

const CODE_PATTERN = /^[a-f0-9]{20}$/;
/** Demandes de suppression gardées pour que Meta et la personne puissent en vérifier l'état. */
const DELETIONS_KEPT = 500;

export interface DeletionRecord {
  code: string;
  connector: string;
  /** Comptes retirés de ShareX Manager pour cette demande. */
  accounts: number;
  processedAt: number;
}

export type SignedRequestResult = { ok: true; userId: string } | { ok: false; status: number; error: string };

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** Vérifie une demande signée avec un secret ; rend l'identifiant de la personne chez le service. */
export function verifySignedRequest(signedRequest: string, secret: string): string | null {
  const parts = signedRequest.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [signaturePart, payloadPart] = parts;
  const expected = createHmac("sha256", secret).update(payloadPart).digest();
  const received = fromBase64Url(signaturePart);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(fromBase64Url(payloadPart).toString("utf-8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const { algorithm, user_id: userId } = payload as { algorithm?: unknown; user_id?: unknown };
  if (typeof algorithm !== "string" || algorithm.toUpperCase() !== "HMAC-SHA256") return null;
  const id = typeof userId === "number" ? String(userId) : userId;
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

/** Lit et vérifie la demande signée d'un rappel Meta pour un service. */
export function readSignedRequest(connectorId: string, signedRequest: unknown): SignedRequestResult {
  if (!(META_CONNECTORS as readonly string[]).includes(connectorId)) return { ok: false, status: 404, error: "Service inconnu" };
  const connector = getConnector(connectorId);
  const credentials = connector ? getAppCredentials(connector) : null;
  if (!credentials) return { ok: false, status: 503, error: "Application du service non configurée" };
  if (typeof signedRequest !== "string" || signedRequest.length === 0 || signedRequest.length > SIGNED_REQUEST_MAX_BYTES) {
    return { ok: false, status: 400, error: "Demande signée manquante" };
  }
  const userId = verifySignedRequest(signedRequest, credentials.clientSecret);
  return userId ? { ok: true, userId } : { ok: false, status: 400, error: "Demande signée invalide" };
}

/** Comptes de ce service rattachés à la personne qui a retiré l'autorisation ou demandé la suppression. */
function accountsOf(connectorId: string, userId: string) {
  return listAccounts({ connector: connectorId }).filter((account) => account.externalId === userId);
}

/** Retrait de l'autorisation chez le service : les comptes passent « à reconnecter ». */
export function handleDeauthorize(connectorId: string, userId: string): number {
  const label = getConnector(connectorId)?.label ?? connectorId;
  const accounts = accountsOf(connectorId, userId);
  for (const account of accounts) markNeedsReconnect(account.id, `Autorisation retirée depuis ${label}.`);
  return accounts.length;
}

/** Demande de suppression : les comptes et leurs jetons sont retirés, un code de suivi est gardé. */
export async function handleDataDeletion(connectorId: string, userId: string, now = Date.now()): Promise<{ url: string; confirmation_code: string }> {
  let removed = 0;
  for (const account of accountsOf(connectorId, userId)) {
    try {
      await disconnectAccount(account.id);
      removed++;
    } catch {
      // Un compte déjà retiré entre-temps : rien à effacer.
    }
  }
  const code = randomBytes(10).toString("hex");
  updateStore<{ requests: DeletionRecord[] }>("deletions", { requests: [] }, (file) => {
    const requests = Array.isArray(file.requests) ? file.requests : [];
    return { requests: [{ code, connector: connectorId, accounts: removed, processedAt: now }, ...requests].slice(0, DELETIONS_KEPT) };
  });
  const base = publicBaseUrl() ?? "";
  return { url: `${base}/api/connections/${connectorId}/data-deletion?code=${code}`, confirmation_code: code };
}

/** État d'une demande de suppression, par son code de suivi. */
export function findDeletion(connectorId: string, code: unknown): DeletionRecord | null {
  if (typeof code !== "string" || !CODE_PATTERN.test(code)) return null;
  const file = readStore<{ requests: DeletionRecord[] }>("deletions", { requests: [] });
  return (Array.isArray(file.requests) ? file.requests : []).find((entry) => entry.code === code && entry.connector === connectorId) ?? null;
}

/** Lit `signed_request` dans un corps de formulaire (ou JSON) borné. */
export async function signedRequestFromBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > SIGNED_REQUEST_MAX_BYTES * 2) return undefined;
  const text = await request.text();
  if (text.length > SIGNED_REQUEST_MAX_BYTES * 2) return undefined;
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    try {
      return (JSON.parse(text) as { signed_request?: unknown }).signed_request;
    } catch {
      return undefined;
    }
  }
  return new URLSearchParams(text).get("signed_request") ?? undefined;
}
