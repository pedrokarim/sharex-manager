/**
 * Jetons et identité d'un compte Instagram (dossier 07b, § 3).
 *
 * - L'échange du code (`api.instagram.com/oauth/access_token`) rend un jeton
 *   court d'une heure, parfois dans un tableau `data`, avec les portées dans
 *   `permissions` ;
 * - il est aussitôt échangé contre un jeton longue durée de 60 jours
 *   (`ig_exchange_token`), sans jeton d'actualisation ;
 * - ce jeton se prolonge lui-même (`ig_refresh_token`) s'il a plus de
 *   24 heures et n'a pas expiré ; le cœur s'en charge par sa tâche de fond
 *   (`tokenLifetime`).
 */

import type { AccessToken, AccountProfile, TokenAccount, TokenHookContext, TokenResponseFields, TokenSet } from "../../types";
import { OAuthError } from "../../errors";
import { readJsonKeepingIds } from "../../json";
import { INSTAGRAM_GRAPH, graphUrl, idOf, readGraphError } from "./api";

/** Durée d'un jeton longue durée quand la réponse ne la donne pas. */
export const LONG_LIVED_MS = 60 * 24 * 60 * 60 * 1000;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): string | undefined => (typeof value === "string" && value ? value : typeof value === "number" ? String(value) : undefined);

/**
 * Réponse de l'échange du code : forme à plat ou `{ data: [ { access_token,
 * user_id, permissions } ] }`, `permissions` en chaîne ou en tableau. Une
 * erreur (`{ error_type, error_message }`) est laissée à la lecture par défaut
 * du cœur.
 */
export function parseInstagramTokenResponse(raw: unknown): TokenResponseFields {
  const body = isRecord(raw) && Array.isArray(raw.data) && isRecord(raw.data[0]) && !raw.access_token ? raw.data[0] : raw;
  if (!isRecord(body)) return {};
  const permissions = Array.isArray(body.permissions)
    ? body.permissions.filter((entry): entry is string => typeof entry === "string").join(",")
    : text(body.permissions) ?? text(body.scope);
  return {
    access_token: text(body.access_token),
    expires_in: Number(body.expires_in) || undefined,
    token_type: text(body.token_type),
    ...(permissions ? { scope: permissions } : {}),
  };
}

/** Erreur d'un appel de jeton : un jeton refusé (code 190) devient « invalid_grant », qui fait reconnecter. */
function tokenError(status: number, body: unknown, action: string): OAuthError {
  const graph = readGraphError(body);
  if (graph?.code === 190) return new OAuthError("invalid_grant", `Instagram a refusé le jeton (${action}) : reconnectez le compte.`);
  const legacy = isRecord(body) ? text(body.error_message) : undefined;
  const message = graph?.message || legacy || `HTTP ${status}`;
  return new OAuthError(graph?.code !== undefined ? `graph_${graph.code}` : `http_${status}`, `Instagram a refusé ${action} : ${message.slice(0, 200)}`);
}

/** Lit une réponse de jeton longue durée : `access_token`, `expires_in` en secondes. */
async function readLongLived(response: Response, action: string, now: number): Promise<TokenSet> {
  const body = await readJsonKeepingIds(response);
  if (!response.ok || !isRecord(body) || typeof body.access_token !== "string" || !body.access_token) throw tokenError(response.status, body, action);
  const seconds = Number(body.expires_in);
  return {
    accessToken: body.access_token,
    expiresAt: now + (seconds > 0 ? seconds * 1000 : LONG_LIVED_MS),
    tokenType: text(body.token_type) ?? "bearer",
    issuedAt: now,
  };
}

/** Jeton court contre jeton longue durée, côté serveur seulement (le secret y figure). */
export async function exchangeForLongLived(tokens: TokenSet, context: TokenHookContext): Promise<TokenSet> {
  const url = new URL(`${INSTAGRAM_GRAPH}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", context.app.clientSecret);
  url.searchParams.set("access_token", tokens.accessToken);
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  return readLongLived(response, "l’échange contre un jeton longue durée", Date.now());
}

/**
 * Prolonge un jeton longue durée de 60 jours. Le cœur ne l'appelle pas avant
 * 24 heures (`minAgeMs`) ; un jeton refusé ou expiré fait reconnecter.
 */
export async function refreshLongLived(_account: TokenAccount, tokens: TokenSet): Promise<TokenSet> {
  const url = new URL(`${INSTAGRAM_GRAPH}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", tokens.accessToken);
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  return readLongLived(response, "la prolongation du jeton", Date.now());
}

/**
 * Identité du compte professionnel (`/me`). `user_id` désigne le compte
 * (`<IG_ID>`, celui de `/<IG_ID>/media`) ; `id` n'est que l'identifiant propre
 * à l'application. La réponse peut arriver à plat ou dans un tableau `data`.
 */
export async function fetchInstagramProfile(token: AccessToken, chargeQuota: (method: string) => void): Promise<AccountProfile> {
  chargeQuota("me");
  const response = await fetch(graphUrl("me", { fields: "user_id,username,name,account_type,profile_picture_url" }), {
    headers: { Authorization: `Bearer ${token.value}`, Accept: "application/json" },
  });
  const raw = await readJsonKeepingIds(response);
  if (!response.ok || readGraphError(raw)) {
    const graph = readGraphError(raw);
    throw new Error(`Instagram n’a pas rendu l’identité du compte : ${graph?.message || `HTTP ${response.status}`}`);
  }
  const body = isRecord(raw) && Array.isArray(raw.data) && isRecord(raw.data[0]) ? raw.data[0] : raw;
  if (!isRecord(body)) throw new Error("Instagram a rendu une identité illisible.");
  const externalId = idOf(body.user_id) ?? idOf(body.id);
  if (!externalId) throw new Error("Instagram n’a pas rendu l’identifiant du compte professionnel.");
  const username = text(body.username);
  return {
    externalId,
    name: text(body.name) || username || externalId,
    ...(username ? { handle: `@${username}`, url: `https://www.instagram.com/${encodeURIComponent(username)}/` } : {}),
    ...(text(body.profile_picture_url) ? { avatarUrl: text(body.profile_picture_url) } : {}),
  };
}
