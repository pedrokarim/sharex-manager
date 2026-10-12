/**
 * Appels à l'API Threads de Meta (dossier 07c) : requêtes authentifiées,
 * lecture des erreurs, jetons longue durée, profil, publications.
 *
 * Le jeton voyage comme la documentation le montre : en paramètre
 * `access_token` de l'adresse pour une lecture ou une suppression, dans le
 * corps du formulaire pour une écriture. Il n'est jamais journalisé ni
 * recopié dans un message d'erreur.
 */

import type { AccessToken, AccountProfile, ConnectorContext, PostSummary, TokenHookContext, TokenSet } from "../../types";
import { OAuthError, QuotaExceededError, ReconnectRequiredError, ServiceError } from "../../errors";
import { readJsonKeepingIds } from "../../json";
import { truncateChars } from "../../templates";

/** Hôte de l'API ; `graph.threads.com` est équivalent depuis le 06/06/2025. */
export const THREADS_GRAPH = "https://graph.threads.net";
export const THREADS_API = `${THREADS_GRAPH}/v1.0`;
/** Adresses de l'autorisation, telles que la page « Get Access Tokens » les donne. */
export const THREADS_AUTHORIZE_URL = "https://threads.com/oauth/authorize";
export const THREADS_TOKEN_URL = "https://graph.threads.com/oauth/access_token";
export const THREADS_WEB = "https://www.threads.com";

/** Durée de vie d'un jeton longue durée quand la réponse ne la donne pas : 60 jours. */
export const LONG_LIVED_MS = 60 * 24 * 60 * 60 * 1000;

/** Erreur Graph : `{ error: { message, type, code, error_subcode } }`. */
interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number | string; error_subcode?: number | string; error_user_msg?: string };
  error_type?: string;
  error_message?: string;
  code?: number | string;
}

/**
 * Codes Graph de limitation d'appels (convention de la Graph API de Meta ;
 * l'API Threads ne documente pas les siens) : traités comme une limite du
 * compte, nouvel essai une heure plus tard.
 */
const RATE_LIMIT_CODES = new Set(["4", "17", "32", "613"]);
/** Jeton invalide, expiré ou révoqué. */
const INVALID_TOKEN_CODE = "190";
/** Autorisation manquante. */
const PERMISSION_CODES = new Set(["10", "200"]);

/** Nettoie un message du service avant de l'afficher. */
function cleanMessage(message: unknown): string {
  return truncateChars(String(message ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim(), 200);
}

/** Convertit une réponse d'erreur de Threads en erreur affichable. */
export function threadsError(status: number, body: unknown): Error {
  const parsed = (body && typeof body === "object" ? body : {}) as GraphErrorBody;
  const error = parsed.error;
  const code = String(error?.code ?? parsed.code ?? "");
  const message = cleanMessage(error?.error_user_msg ?? error?.message ?? parsed.error_message);
  if (/THREADS_API__LINK_LIMIT_EXCEEDED/.test(message)) {
    return new ServiceError(status, "Threads refuse plus de cinq liens différents dans une publication.", "THREADS_API__LINK_LIMIT_EXCEEDED");
  }
  if (code === INVALID_TOKEN_CODE || status === 401) {
    return new ReconnectRequiredError("Threads a refusé le jeton d’accès : reconnectez le compte.");
  }
  if (RATE_LIMIT_CODES.has(code)) {
    return new QuotaExceededError(
      "Threads limite les appels de ce compte pour le moment : la publication reprendra d’elle-même.",
      Date.now() + 60 * 60 * 1000,
      undefined,
      "account"
    );
  }
  if (PERMISSION_CODES.has(code)) {
    return new ServiceError(status, "Droits insuffisants chez Threads : reconnectez le compte avec le jeu de portées « Tout ».", code);
  }
  return new ServiceError(
    status,
    `Threads a refusé la demande (HTTP ${status}${code ? `, code ${code}` : ""})${message ? ` : ${message}` : "."}`,
    code || undefined
  );
}

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  /** Corps de formulaire d'un `POST`. */
  form?: Record<string, string | number | boolean | undefined>;
}

function buildUrl(path: string, query: RequestOptions["query"] = {}): URL {
  const url = new URL(path.startsWith("https://") ? path : `${THREADS_API}/${path}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
  return url;
}

/** Appel brut avec un jeton donné ; lève une erreur lisible si Threads refuse. */
export async function threadsFetch<T>(token: string, path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const init: RequestInit = { method, headers: { Accept: "application/json" } };
  const url = buildUrl(path, options.query);
  if (method === "POST") {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(options.form ?? {})) if (value !== undefined) form.set(key, String(value));
    form.set("access_token", token);
    init.headers = { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" };
    init.body = form.toString();
  } else {
    url.searchParams.set("access_token", token);
  }
  const response = await fetch(url, init);
  const body = await readJsonKeepingIds(response);
  if (!response.ok || (body && typeof body === "object" && "error" in body)) throw threadsError(response.status, body);
  return body as T;
}

/**
 * Appel au nom d'un compte. `quotaMethod` est compté avant l'appel
 * (« threads_publish », « threads.delete » ; les lectures ne coûtent rien).
 */
export async function threadsRequest<T>(context: ConnectorContext, quotaMethod: string, path: string, options: RequestOptions = {}): Promise<T> {
  context.chargeQuota(quotaMethod);
  const token = await context.getAccessToken();
  return threadsFetch<T>(token.value, path, options);
}

// ─── Jetons ───────────────────────────────────────────────────────

interface TokenBody {
  access_token?: string;
  token_type?: string;
  expires_in?: number | string;
}

/** Lit une réponse de jeton longue durée ; une erreur devient une `OAuthError`. */
async function readTokenResponse(response: Response, refusalCode: "invalid_grant"): Promise<TokenSet> {
  const body = (await readJsonKeepingIds(response)) as (TokenBody & GraphErrorBody) | null;
  if (!response.ok || !body?.access_token) {
    const code = String(body?.error?.code ?? body?.code ?? "");
    const message = cleanMessage(body?.error?.message ?? body?.error_message);
    // Jeton refusé (expiré, révoqué, accord retiré) : seule une reconnexion le remplace. Une autre
    // erreur (`OAuthException` sert aussi aux pannes passagères) est seulement signalée par le cœur,
    // qui garde le jeton actuel tant qu'il vaut.
    if (code === INVALID_TOKEN_CODE || response.status === 401) {
      throw new OAuthError(refusalCode, `Threads a refusé le jeton${message ? ` : ${message}` : "."}`);
    }
    throw new Error(`Threads n’a pas rendu de jeton (HTTP ${response.status})${message ? ` : ${message}` : "."}`);
  }
  const seconds = Number(body.expires_in);
  const now = Date.now();
  return {
    accessToken: body.access_token,
    expiresAt: now + (Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : LONG_LIVED_MS),
    tokenType: body.token_type ?? "bearer",
    issuedAt: now,
  };
}

/** Échange le jeton court (une heure) contre un jeton de 60 jours (`th_exchange_token`). */
export async function exchangeForLongLived(tokens: TokenSet, context: TokenHookContext): Promise<TokenSet> {
  const url = buildUrl(`${THREADS_GRAPH}/access_token`, {
    grant_type: "th_exchange_token",
    client_secret: context.app.clientSecret,
    access_token: tokens.accessToken,
  });
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  // Un jeton court refusé ici ne peut venir que d'un code déjà consommé : on recommence la connexion.
  return readTokenResponse(response, "invalid_grant");
}

/**
 * Prolonge un jeton longue durée de 60 jours (`th_refresh_token`). Threads ne
 * l'accepte que s'il a au moins 24 heures et n'a pas expiré : le cœur s'en
 * charge (`tokenLifetime.minAgeMs`).
 */
export async function refreshLongLived(tokens: TokenSet): Promise<TokenSet> {
  const url = buildUrl(`${THREADS_GRAPH}/refresh_access_token`, {
    grant_type: "th_refresh_token",
    access_token: tokens.accessToken,
  });
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  return readTokenResponse(response, "invalid_grant");
}

/**
 * Portées accordées, lues par `debug_token`. L'appel exige le jeton d'un
 * Threads Tester de la même application : c'est le cas du profil connecté.
 */
export async function fetchThreadsScopes(token: AccessToken): Promise<string[] | null> {
  const body = await threadsFetch<{ data?: { is_valid?: boolean; scopes?: unknown } }>(token.value, "debug_token", {
    query: { input_token: token.value },
  });
  const scopes = body?.data?.scopes;
  if (body?.data?.is_valid === false || !Array.isArray(scopes)) return null;
  return scopes.filter((scope): scope is string => typeof scope === "string");
}

// ─── Profil ───────────────────────────────────────────────────────

interface ProfileBody {
  id?: string;
  username?: string;
  name?: string;
  threads_profile_picture_url?: string;
}

export const profileUrl = (username?: string) => (username ? `${THREADS_WEB}/@${encodeURIComponent(username)}` : THREADS_WEB);

/** Identité du profil lié au jeton (`GET /me`). */
export async function fetchThreadsProfile(token: AccessToken): Promise<AccountProfile> {
  const body = await threadsFetch<ProfileBody>(token.value, "me", { query: { fields: "id,username,name,threads_profile_picture_url" } });
  if (!body?.id) throw new Error("Threads n’a pas rendu l’identité du profil.");
  const id = String(body.id);
  return {
    externalId: id,
    name: body.name || body.username || id,
    handle: body.username ? `@${body.username}` : undefined,
    avatarUrl: body.threads_profile_picture_url,
    url: profileUrl(body.username),
  };
}

// ─── Publications ─────────────────────────────────────────────────

export interface ThreadsMedia {
  id: string;
  media_type?: string;
  media_url?: string;
  permalink?: string;
  shortcode?: string;
  text?: string;
  timestamp?: string;
  thumbnail_url?: string;
  topic_tag?: string;
  username?: string;
}

/** Champs lus pour une publication du profil. */
export const MEDIA_FIELDS = "id,media_type,media_url,permalink,shortcode,text,timestamp,thumbnail_url,topic_tag,username";

/** Date ISO lisible par `Date` : Threads rend « +0000 » au lieu de « +00:00 ». */
export function isoTimestamp(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Adresse d'une publication : `permalink`, sinon reconstituée, sinon le profil. */
export function mediaUrl(media: ThreadsMedia): string {
  if (media.permalink?.startsWith("https://")) return media.permalink;
  if (media.username && media.shortcode) return `${profileUrl(media.username)}/post/${encodeURIComponent(media.shortcode)}`;
  return profileUrl(media.username);
}

const TYPE_LABELS: Record<string, string> = {
  TEXT_POST: "Message",
  IMAGE: "Image",
  VIDEO: "Vidéo",
  CAROUSEL_ALBUM: "Carrousel",
  AUDIO: "Audio",
};

export function toPost(media: ThreadsMedia): PostSummary {
  const text = media.text ?? "";
  const firstLine = text.split("\n").find((line) => line.trim())?.trim() ?? "";
  return {
    id: String(media.id),
    title: firstLine ? truncateChars(firstLine, 80) : (TYPE_LABELS[media.media_type ?? ""] ?? "Publication"),
    description: text,
    tags: media.topic_tag ? [media.topic_tag] : [],
    thumbnailUrl: media.media_type === "VIDEO" ? media.thumbnail_url : media.media_type === "IMAGE" ? media.media_url : undefined,
    url: mediaUrl(media),
    // Threads n'a pas de visibilité par publication : elle suit celle du profil.
    privacy: "public",
    publishedAt: isoTimestamp(media.timestamp),
  };
}

interface MediaPage {
  data?: ThreadsMedia[];
  paging?: { cursors?: { after?: string } };
}

/** Publications du profil, des plus récentes aux plus anciennes, sans les republications. */
export async function listThreadsPosts(context: ConnectorContext, limit = 100): Promise<PostSummary[]> {
  const posts: PostSummary[] = [];
  let after: string | undefined;
  do {
    const page = await threadsRequest<MediaPage>(context, "threads.list", "me/threads", {
      query: { fields: MEDIA_FIELDS, limit: Math.min(100, limit - posts.length), after },
    });
    const data = page?.data ?? [];
    // Une republication (`REPOST_FACADE`) appartient à un autre profil.
    for (const media of data) if (media?.id && media.media_type !== "REPOST_FACADE") posts.push(toPost(media));
    after = data.length > 0 ? page?.paging?.cursors?.after : undefined;
  } while (after && posts.length < limit);
  return posts.slice(0, limit);
}

/** Publications du profil depuis un instant (secondes Unix), pour retrouver une publication. */
export async function recentThreadsMedia(context: ConnectorContext, sinceSeconds: number): Promise<ThreadsMedia[]> {
  // `since` doit valoir au moins 1688540400 (lancement de l'API).
  const since = Math.max(1688540400, Math.floor(sinceSeconds));
  const page = await threadsRequest<MediaPage>(context, "threads.list", "me/threads", {
    query: { fields: MEDIA_FIELDS, limit: 25, since },
  });
  return page?.data ?? [];
}

export async function getThreadsMedia(context: ConnectorContext, id: string): Promise<ThreadsMedia> {
  return threadsRequest<ThreadsMedia>(context, "threads.get", encodeURIComponent(id), { query: { fields: "id,permalink,shortcode,username,media_type" } });
}

/** Supprime une publication (100 suppressions par profil sur 24 heures). */
export async function deleteThreadsPost(context: ConnectorContext, id: string): Promise<void> {
  const body = await threadsRequest<{ success?: boolean }>(context, "threads.delete", encodeURIComponent(id), { method: "DELETE" });
  if (body?.success === false) throw new Error("Threads n’a pas supprimé la publication.");
}

/** Usage réel des publications du profil sur 24 heures glissantes. */
export async function readPublishingLimit(context: ConnectorContext): Promise<{ used: number; total: number } | null> {
  const body = await threadsRequest<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>(
    context,
    "threads.limit",
    "me/threads_publishing_limit",
    { query: { fields: "quota_usage,config" } }
  );
  const entry = body?.data?.[0];
  const used = Number(entry?.quota_usage);
  const total = Number(entry?.config?.quota_total);
  return Number.isFinite(used) && Number.isFinite(total) && total > 0 ? { used, total } : null;
}
