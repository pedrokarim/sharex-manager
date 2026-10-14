/**
 * Appels à l'API de TikTok (dossier 07e) : adresses, lecture des erreurs,
 * identité du compte, révocation, liste des vidéos.
 *
 * L'API v2 rend toujours `{ data, error: { code, message, log_id } }` ; tout
 * code autre que « ok » est un échec, même avec un statut HTTP 200 (lecture
 * de `creator_info`). Les échanges OAuth ont une autre forme, normée
 * (`{ error, error_description, log_id }`), lue par le cœur. Le jeton n'est
 * jamais journalisé ni recopié dans un message d'erreur.
 */

import type { AccessToken, AccountProfile, ConnectorContext, PostSummary, TokenHookContext, TokenSet } from "../../types";
import { QuotaExceededError, ReconnectRequiredError, ServiceError } from "../../errors";
import { parseJsonKeepingIds } from "../../json";
import { truncateChars } from "../../templates";

export const TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
export const TIKTOK_API = "https://open.tiktokapis.com";
export const TIKTOK_TOKEN_URL = `${TIKTOK_API}/v2/oauth/token/`;
export const TIKTOK_REVOKE_URL = `${TIKTOK_API}/v2/oauth/revoke/`;
export const TIKTOK_WEB = "https://www.tiktok.com";

/** Champs d'identité accordés par `user.info.basic`. */
export const BASIC_FIELDS = ["open_id", "union_id", "avatar_url", "display_name"];
/** Champs accordés en plus par `user.info.profile`. */
export const PROFILE_FIELDS = ["username", "bio_description", "profile_deep_link", "is_verified"];

/** Message propre à chaque code d'erreur de TikTok (pages de référence de Content Posting et de l'API v2). */
const MESSAGES: Record<string, string> = {
  unaudited_client_can_only_post_to_private_accounts:
    "TikTok refuse la publication directe : l’application n’est pas encore auditée, et un client non audité ne publie que sur un compte privé, en « Moi uniquement ». Passez le compte en privé dans TikTok, ou envoyez en brouillon (décochez « Application auditée par TikTok » dans la configuration du service).",
  privacy_level_option_mismatch: "TikTok refuse cette visibilité pour ce compte : relisez le compte dans l’écran Publier et choisissez une des visibilités proposées.",
  spam_risk_user_banned_from_posting: "TikTok interdit pour l’instant à ce compte de publier par l’API.",
  spam_risk_text: "TikTok a refusé le texte de la publication.",
  spam_risk: "TikTok a refusé la publication (risque d’abus).",
  url_ownership_unverified: "TikTok refuse l’adresse du fichier : son domaine n’est pas vérifié dans le portail des développeurs.",
  scope_not_authorized: "Ce compte n’a pas accordé l’autorisation nécessaire à TikTok : reconnectez-le avec le jeu de portées « Tout ».",
  scope_permission_missed: "Ce compte n’a pas accordé l’autorisation nécessaire à TikTok : reconnectez-le avec le jeu de portées « Tout ».",
  invalid_publish_id: "TikTok ne connaît pas cet envoi.",
  token_not_authorized_for_specified_publish_id: "Cet envoi appartient à un autre compte TikTok.",
  app_version_check_failed: "L’application TikTok du téléphone est trop ancienne pour recevoir ce brouillon : mettez-la à jour.",
};

/** Limites passagères, avec le délai avant un nouvel essai. */
const LIMITS: Record<string, { message: string; retryMs: number }> = {
  rate_limit_exceeded: { message: "TikTok limite les appels de ce compte pour le moment : l’envoi reprendra d’ici une minute.", retryMs: 60_000 },
  spam_risk_too_many_posts: {
    message: "Ce compte TikTok a atteint sa limite de publications sur 24 heures (une quinzaine, toutes applications confondues) : la publication reprendra plus tard.",
    retryMs: 6 * 60 * 60_000,
  },
  spam_risk_too_many_pending_share: {
    message: "Ce compte TikTok a déjà cinq brouillons envoyés par l’API en attente sur 24 heures : publiez-les ou supprimez-les dans l’application, l’envoi reprendra plus tard.",
    retryMs: 60 * 60_000,
  },
  reached_active_user_cap: {
    message: "L’application TikTok a atteint son plafond de comptes actifs sur 24 heures (cinq sans audit) : la publication reprendra plus tard.",
    retryMs: 6 * 60 * 60_000,
  },
};

interface TiktokErrorBody {
  error?: { code?: string; message?: string; log_id?: string; logid?: string } | string;
  error_description?: string;
}

function cleanMessage(message: unknown): string {
  return truncateChars(String(message ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim(), 200);
}

/** Code d'erreur d'une réponse de l'API v2, « ok » en cas de succès, `undefined` sans bloc d'erreur. */
export function errorCode(body: unknown): string | undefined {
  const error = (body && typeof body === "object" ? (body as TiktokErrorBody).error : undefined) as TiktokErrorBody["error"];
  if (typeof error === "string") return error;
  return typeof error?.code === "string" ? error.code : undefined;
}

/** Erreur affichable d'après le statut et le code de TikTok. */
export function tiktokError(status: number, body: unknown): Error {
  const parsed = (body && typeof body === "object" ? body : {}) as TiktokErrorBody;
  const code = (errorCode(body) ?? "").replace(/[^A-Za-z0-9_.]/g, "").slice(0, 80);
  const message = cleanMessage(typeof parsed.error === "object" ? parsed.error?.message : parsed.error_description);
  if (code === "access_token_invalid" || (status === 401 && !code.startsWith("scope_"))) {
    return new ReconnectRequiredError("TikTok a refusé le jeton d’accès : reconnectez le compte.");
  }
  const limit = LIMITS[code] ?? (status === 429 ? LIMITS.rate_limit_exceeded : undefined);
  if (limit) return new QuotaExceededError(limit.message, Date.now() + limit.retryMs, code || "rate_limit_exceeded", "account");
  const known = MESSAGES[code];
  if (known) return new ServiceError(status, known, code);
  return new ServiceError(status, `TikTok a refusé la demande (HTTP ${status}${code ? `, code ${code}` : ""})${message ? ` : ${message}` : "."}`, code || undefined);
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    // Les identifiants de vidéo sont des int64 : gardés en chaînes, sans arrondi.
    return parseJsonKeepingIds(text);
  } catch {
    return { error: { code: "", message: text.slice(0, 200) } };
  }
}

/** Appel brut avec un jeton donné : JSON en `POST`, paramètres en `GET`. Rend `data`. */
export async function tiktokFetch<T>(
  token: string,
  path: string,
  options: { method?: "GET" | "POST"; query?: Record<string, string>; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const url = new URL(path, TIKTOK_API);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
  const method = options.method ?? "GET";
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(method === "POST" ? { "Content-Type": "application/json; charset=UTF-8" } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(options.body ?? {}) } : {}),
    signal: options.signal,
  });
  const body = await readBody(response);
  const code = errorCode(body);
  if (!response.ok || (code !== undefined && code !== "ok")) throw tiktokError(response.status, body);
  return ((body as { data?: T } | null)?.data ?? {}) as T;
}

/** Appel au nom d'un compte, `quotaMethod` compté avant (les lectures ne coûtent rien). */
export async function tiktokRequest<T>(
  context: ConnectorContext,
  path: string,
  options: { method?: "GET" | "POST"; query?: Record<string, string>; body?: unknown; quotaMethod?: string; signal?: AbortSignal } = {}
): Promise<T> {
  if (options.quotaMethod) context.chargeQuota(options.quotaMethod);
  const token = await context.getAccessToken();
  return tiktokFetch<T>(token.value, path, options);
}

// ─── Identité ─────────────────────────────────────────────────────

export interface TiktokUser {
  open_id?: string;
  union_id?: string;
  avatar_url?: string;
  display_name?: string;
  username?: string;
  bio_description?: string;
  profile_deep_link?: string;
  is_verified?: boolean;
}

/**
 * Identité du compte : champs de `user.info.basic`, puis, à part, ceux de
 * `user.info.profile` (pseudo, bio), que le compte n'a peut-être pas
 * accordés : leur refus n'empêche pas la connexion.
 */
export async function fetchTiktokUser(token: string): Promise<TiktokUser> {
  const basic = await tiktokFetch<{ user?: TiktokUser }>(token, "/v2/user/info/", { query: { fields: BASIC_FIELDS.join(",") } });
  let profile: TiktokUser = {};
  try {
    profile = (await tiktokFetch<{ user?: TiktokUser }>(token, "/v2/user/info/", { query: { fields: PROFILE_FIELDS.join(",") } })).user ?? {};
  } catch (error) {
    if (error instanceof ReconnectRequiredError) throw error;
  }
  return { ...profile, ...(basic.user ?? {}) };
}

/** Adresse publique d'un profil, d'après son pseudo. */
export const profileUrl = (username: string) => `${TIKTOK_WEB}/@${encodeURIComponent(username)}`;

export async function fetchTiktokProfile(token: AccessToken): Promise<AccountProfile> {
  const user = await fetchTiktokUser(token.value);
  if (!user.open_id) throw new Error("TikTok n’a pas rendu l’identifiant du compte.");
  const username = user.username?.trim();
  return {
    externalId: user.open_id,
    name: user.display_name?.trim() || (username ? `@${username}` : "Compte TikTok"),
    ...(username ? { handle: `@${username}`, url: profileUrl(username) } : {}),
    ...(user.avatar_url?.startsWith("https://") ? { avatarUrl: user.avatar_url } : {}),
  };
}

// ─── Révocation ───────────────────────────────────────────────────

/**
 * Révoque l'accès (`POST /v2/oauth/revoke/`, corps de formulaire
 * `client_key`, `client_secret`, `token`) : l'application disparaît des
 * autorisations du compte. Un corps vide signifie le succès.
 */
export async function revokeTiktokAccess(tokens: TokenSet, context: TokenHookContext): Promise<boolean> {
  try {
    const response = await fetch(TIKTOK_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_key: context.app.clientId, client_secret: context.app.clientSecret, token: tokens.accessToken }).toString(),
    });
    if (!response.ok) return false;
    const body = await readBody(response);
    const code = errorCode(body);
    return code === undefined || code === "ok" || code === "";
  } catch {
    return false;
  }
}

// ─── Vidéos du compte ─────────────────────────────────────────────

interface TiktokVideo {
  id?: string;
  title?: string;
  video_description?: string;
  duration?: number;
  cover_image_url?: string;
  share_url?: string;
  create_time?: number;
  like_count?: number;
  comment_count?: number;
  view_count?: number;
}

const VIDEO_FIELDS = ["id", "title", "video_description", "duration", "cover_image_url", "share_url", "create_time", "like_count", "comment_count", "view_count"];
/** Vingt vidéos par page (le plus que TikTok rende), cinq pages au plus. */
const PAGE_SIZE = 20;
const MAX_PAGES = 5;

const hashtagsOf = (text: string) => [...new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((tag) => tag.slice(1)))].slice(0, 30);

/**
 * Vidéos publiques du compte (`video.list`), de la plus récente à la plus
 * ancienne. TikTok ne rend que les vidéos publiques : les brouillons et les
 * vidéos privées n'y figurent pas.
 */
export async function listTiktokVideos(context: ConnectorContext): Promise<PostSummary[]> {
  const posts: PostSummary[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await tiktokRequest<{ videos?: TiktokVideo[]; cursor?: number; has_more?: boolean }>(context, "/v2/video/list/", {
      method: "POST",
      query: { fields: VIDEO_FIELDS.join(",") },
      body: { max_count: PAGE_SIZE, ...(cursor ? { cursor } : {}) },
    });
    for (const video of data.videos ?? []) {
      if (!video.id) continue;
      const description = String(video.video_description ?? "");
      const firstLine = description.split("\n")[0]?.trim() ?? "";
      posts.push({
        id: String(video.id),
        title: truncateChars(video.title?.trim() || firstLine || "Vidéo TikTok", 100),
        description,
        tags: hashtagsOf(description),
        ...(video.cover_image_url?.startsWith("https://") ? { thumbnailUrl: video.cover_image_url } : {}),
        url: video.share_url?.startsWith("https://") ? video.share_url : `${TIKTOK_WEB}/`,
        // La liste de TikTok ne contient que des vidéos publiques.
        privacy: "public",
        ...(video.create_time ? { publishedAt: new Date(video.create_time * 1000).toISOString() } : {}),
        ...(typeof video.view_count === "number" ? { views: video.view_count } : {}),
        ...(typeof video.like_count === "number" ? { likes: video.like_count } : {}),
        ...(typeof video.comment_count === "number" ? { comments: video.comment_count } : {}),
      });
    }
    if (!data.has_more || !data.cursor) break;
    cursor = data.cursor;
  }
  return posts;
}
