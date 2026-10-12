/**
 * Connexion Facebook (dossier 07a, § 3) : jeton utilisateur de courte durée →
 * longue durée (`fb_exchange_token`), portées accordées (`debug_token`),
 * puis un compte par Page avec son propre jeton de Page, qui n'expire pas.
 *
 * Le jeton utilisateur n'est pas utilisé pour publier : le cœur le garde
 * seulement comme jeton de l'autorisation. Tous les appels de publication et
 * de gestion se font avec le jeton de Page.
 */

import type { AccessToken, AccountProfile, AccountReadContext, ConnectionCapability, DiscoveredAccount, TokenHookContext, TokenSet } from "../../types";
import { OAuthError } from "../../errors";
import { readJsonKeepingIds } from "../../json";
import { FACEBOOK_WEB, GRAPH_API, cleanMessage, graphRequest, proofFor } from "./graph";

/** Durée supposée d'un jeton utilisateur de longue durée quand Meta ne la donne pas. */
const LONG_LIVED_FALLBACK_MS = 60 * 24 * 60 * 60 * 1000;
/** Pages lues au plus à la connexion (100 par page de résultats). */
const MAX_ACCOUNT_PAGES = 10;

interface PageEntry {
  id?: string;
  name?: string;
  access_token?: string;
  tasks?: string[];
  category?: string;
  link?: string;
  picture?: { data?: { url?: string } };
}

/** Échange le jeton de courte durée contre un jeton de longue durée (environ 60 jours). */
export async function exchangeLongLivedToken(tokens: TokenSet, context: TokenHookContext): Promise<TokenSet> {
  const url = new URL(`${GRAPH_API}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", context.app.clientId);
  url.searchParams.set("client_secret", context.app.clientSecret);
  url.searchParams.set("fb_exchange_token", tokens.accessToken);
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const body = (await readJsonKeepingIds(response)) as { access_token?: string; token_type?: string; expires_in?: number; error?: { message?: string; type?: string } } | null;
  if (!response.ok || !body?.access_token) {
    const detail = cleanMessage(body?.error?.message);
    throw new OAuthError("token_exchange_failed", `Facebook a refusé l’échange contre un jeton de longue durée${detail ? ` : ${detail}` : "."}`);
  }
  const now = Date.now();
  const seconds = Number(body.expires_in);
  return {
    accessToken: body.access_token,
    tokenType: body.token_type,
    expiresAt: seconds > 0 ? now + seconds * 1000 : now + LONG_LIVED_FALLBACK_MS,
    issuedAt: now,
  };
}

/** Portées réellement accordées, lues par `debug_token` avec le jeton d'application. */
export async function fetchGrantedFacebookScopes(token: AccessToken, context: TokenHookContext): Promise<string[] | null> {
  const url = new URL(`${GRAPH_API}/debug_token`);
  url.searchParams.set("input_token", token.value);
  url.searchParams.set("access_token", `${context.app.clientId}|${context.app.clientSecret}`);
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  const body = (await readJsonKeepingIds(response)) as { data?: { app_id?: string; is_valid?: boolean; scopes?: unknown } } | null;
  const data = body?.data;
  if (!data || data.is_valid === false) return null;
  // Un jeton émis pour une autre application ne doit pas être accepté.
  if (data.app_id !== undefined && String(data.app_id) !== context.app.clientId) {
    throw new OAuthError("invalid_token", "Le jeton rendu par Facebook n’appartient pas à cette application.");
  }
  return Array.isArray(data.scopes) ? data.scopes.filter((scope): scope is string => typeof scope === "string") : null;
}

/** Une Page sans la tâche `CREATE_CONTENT` ne peut que lister ses publications. */
function pageCapabilities(tasks: string[] | undefined): ConnectionCapability[] | undefined {
  if (!Array.isArray(tasks)) return undefined;
  return tasks.includes("CREATE_CONTENT") ? undefined : ["posts.list"];
}

const pageUrl = (page: { id: string; link?: string }) => (page.link?.startsWith("https://") ? page.link : `${FACEBOOK_WEB}/${encodeURIComponent(page.id)}`);

/** Pages partagées avec l'application au consentement, chacune avec son jeton de Page. */
export async function fetchFacebookPages(token: AccessToken, chargeQuota: (method: string) => void, context?: AccountReadContext): Promise<DiscoveredAccount[]> {
  const proof = proofFor(context, token.value);
  const accounts: DiscoveredAccount[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_ACCOUNT_PAGES; page += 1) {
    chargeQuota("accounts.list");
    const body = await graphRequest<{ data?: PageEntry[]; paging?: { cursors?: { after?: string }; next?: string } }>({ token: token.value, proof }, "me/accounts", {
      params: { fields: "id,name,access_token,tasks,category,link,picture{url}", limit: 100, after },
    });
    for (const entry of body.data ?? []) {
      if (!entry.id || !entry.access_token) continue;
      const id = String(entry.id);
      accounts.push({
        externalId: id,
        name: entry.name || id,
        avatarUrl: entry.picture?.data?.url?.startsWith("https://") ? entry.picture.data.url : undefined,
        url: pageUrl({ id, link: entry.link }),
        // Obtenu avec un jeton utilisateur de longue durée, le jeton de Page n'expire pas.
        token: { accessToken: entry.access_token },
        capabilities: pageCapabilities(entry.tasks),
        ...(entry.category ? { data: { category: entry.category.slice(0, 100) } } : {}),
      });
    }
    after = body.paging?.next ? body.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return accounts;
}

/** Identité d'une Page, relue avec son jeton (vérification d'un compte déjà connecté). */
export async function fetchFacebookPage(
  token: AccessToken,
  chargeQuota: (method: string) => void,
  account?: { externalId: string },
  context?: AccountReadContext
): Promise<AccountProfile> {
  chargeQuota("page.read");
  const proof = proofFor(context, token.value);
  const page = await graphRequest<PageEntry>({ token: token.value, proof }, encodeURIComponent(account?.externalId ?? "me"), {
    params: { fields: "id,name,link,picture{url}" },
  });
  if (!page.id) throw new Error("Facebook n’a pas rendu l’identité de la Page.");
  const id = String(page.id);
  return {
    externalId: id,
    name: page.name || id,
    avatarUrl: page.picture?.data?.url?.startsWith("https://") ? page.picture.data.url : undefined,
    url: pageUrl({ id, link: page.link }),
  };
}

