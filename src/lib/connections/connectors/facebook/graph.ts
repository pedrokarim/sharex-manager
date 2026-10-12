/**
 * Appels à la Graph API de Meta pour le connecteur Facebook (dossier 07a).
 *
 * - Version figée dans `GRAPH_VERSION` : à relever quand Meta annonce la fin
 *   de la v26.0 (journal des versions de la Graph API).
 * - Chaque appel porte `appsecret_proof` (HMAC-SHA256 du jeton par le secret
 *   de l'application) : obligatoire si « Exiger la clé secrète » est activé
 *   chez Meta, ignoré sinon. Le connecteur ne voit jamais le secret.
 * - Les erreurs de Meta sont traduites : jeton invalide → compte « à
 *   reconnecter », limite de débit → attente du seul compte, panne passagère
 *   → nouvel essai. Aucun jeton n'est journalisé ni recopié dans un message.
 */

import type { ConnectorContext } from "../../types";
import { QuotaExceededError, ReconnectRequiredError, ServiceError } from "../../errors";
import { readJsonKeepingIds } from "../../json";

export const FACEBOOK_ID = "facebook";
export const GRAPH_VERSION = "v26.0";
export const GRAPH_API = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const RUPLOAD_API = `https://rupload.facebook.com/video-upload/${GRAPH_VERSION}`;
export const FACEBOOK_WEB = "https://www.facebook.com";

/** Attentes entre deux essais d'un envoi interrompu. */
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

/** Jeton et preuve d'un appel. */
export interface GraphAuth {
  token: string;
  proof?: string;
}

/** Erreur passagère (coupure, 5xx, erreur 1 ou 2 de Meta) : on réessaie après une attente. */
export class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableError";
  }
}

/** Erreur de la Graph API, lue dans `{ error: { … } }`. */
export interface GraphErrorFields {
  message?: string;
  type?: string;
  code?: number | string;
  error_subcode?: number | string;
  error_user_msg?: string;
  is_transient?: boolean;
  error_data?: unknown;
}

/** Erreur de la Graph API qui n'appelle ni reconnexion, ni attente, ni nouvel essai. */
export class GraphError extends ServiceError {
  readonly code: number;
  readonly subcode?: number;
  readonly data?: unknown;
  constructor(status: number, message: string, fields: GraphErrorFields) {
    super(status, message, fields.code !== undefined ? String(fields.code) : undefined);
    this.name = "GraphError";
    this.code = Number(fields.code) || 0;
    this.subcode = fields.error_subcode !== undefined ? Number(fields.error_subcode) : undefined;
    this.data = fields.error_data;
  }
}

/**
 * Preuve d'un jeton, calculée par le cœur qui garde le secret (contexte d'un
 * compte, ou contexte de lecture à la connexion). Sans contexte ou sans
 * application configurée : aucune, et Meta l'ignore si elle n'est pas exigée.
 */
export function proofFor(context: Pick<ConnectorContext, "appSecretProof"> | undefined, token: string): string | undefined {
  if (!context) return undefined;
  try {
    return context.appSecretProof(token);
  } catch {
    return undefined;
  }
}

/** Jeton d'accès et preuve, depuis le contexte d'un compte. */
export async function authFromContext(context: ConnectorContext): Promise<GraphAuth> {
  const token = await context.getAccessToken();
  return { token: token.value, proof: proofFor(context, token.value) };
}

/** Message de Meta, sans caractère de contrôle ni rien qui ressemble à un jeton, borné. */
export function cleanMessage(message: unknown): string {
  return String(message ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/[A-Za-z0-9_\-.|]{32,}/g, "…")
    .trim()
    .slice(0, 200);
}

/** Délai annoncé par Meta avant de retrouver l'accès (`X-Business-Use-Case-Usage`, en minutes). */
export function regainAccessDelayMs(headers: Headers | undefined): number | undefined {
  const raw = headers?.get("x-business-use-case-usage");
  if (!raw) return undefined;
  try {
    const usage = JSON.parse(raw) as Record<string, { estimated_time_to_regain_access?: number }[]>;
    let minutes = 0;
    for (const entries of Object.values(usage)) {
      for (const entry of Array.isArray(entries) ? entries : []) minutes = Math.max(minutes, Number(entry?.estimated_time_to_regain_access) || 0);
    }
    return minutes > 0 ? minutes * 60 * 1000 : undefined;
  } catch {
    return undefined;
  }
}

const TOKEN_SUBCODES = new Set([458, 459, 460, 463, 464, 467, 492]);

function reconnectMessage(subcode: number | undefined): string {
  switch (subcode) {
    case 460:
      return "Le mot de passe du compte Facebook a changé : reconnectez la Page.";
    case 459:
    case 464:
      return "Facebook demande une vérification du compte : connectez-vous sur facebook.com, puis reconnectez la Page.";
    case 492:
      return "Le compte Facebook n’a plus de rôle suffisant sur cette Page : rétablissez le rôle, puis reconnectez la Page.";
    case 458:
      return "L’application a été retirée du compte Facebook : reconnectez la Page.";
    default:
      return "Facebook a refusé le jeton de la Page : reconnectez-la.";
  }
}

/** Codes de limite de débit propres à un compte ou à une Page. */
const ACCOUNT_THROTTLE_CODES = new Set([17, 32, 613, 80001]);

/** Traduit une erreur de la Graph API en erreur du cœur. */
export function graphError(status: number, body: unknown, headers?: Headers): Error {
  const fields: GraphErrorFields =
    body && typeof body === "object" && (body as { error?: unknown }).error && typeof (body as { error?: unknown }).error === "object"
      ? ((body as { error: GraphErrorFields }).error ?? {})
      : {};
  const code = Number(fields.code) || 0;
  const subcode = fields.error_subcode !== undefined ? Number(fields.error_subcode) : undefined;
  const detail = cleanMessage(fields.error_user_msg || fields.message);

  if (code === 190 || code === 102 || (subcode !== undefined && TOKEN_SUBCODES.has(subcode)) || (status === 401 && !code)) {
    return new ReconnectRequiredError(reconnectMessage(subcode));
  }
  if (code === 4) {
    return new QuotaExceededError(
      "Limite d’appels de l’application Facebook atteinte : la publication reprendra d’elle-même.",
      Date.now() + (regainAccessDelayMs(headers) ?? 60 * 60 * 1000),
      "calls",
      "app"
    );
  }
  if (ACCOUNT_THROTTLE_CODES.has(code)) {
    return new QuotaExceededError(
      "Facebook limite les appels pour cette Page : la publication reprendra d’elle-même.",
      Date.now() + (regainAccessDelayMs(headers) ?? 60 * 60 * 1000),
      "calls",
      "account"
    );
  }
  if (code === 1 || code === 2 || fields.is_transient === true || status >= 500 || status === 429) {
    return new RetryableError(`Facebook est momentanément indisponible (HTTP ${status}${code ? `, code ${code}` : ""}).`);
  }
  if (code === 368) {
    return new GraphError(status, "Facebook a bloqué cette action pour cette Page (règles de la plateforme). Vérifiez l’état de la Page dans Meta Business Suite.", fields);
  }
  if (code === 10 || code === 3 || (code >= 200 && code < 300)) {
    return new GraphError(status, "Droits insuffisants chez Facebook : reconnectez la Page avec le jeu « Tout » et vérifiez votre rôle sur elle.", fields);
  }
  return new GraphError(
    status,
    `Facebook a refusé la demande (HTTP ${status}${code ? `, code ${code}${subcode ? `/${subcode}` : ""}` : ""})${detail ? ` : ${detail}` : "."}`,
    fields
  );
}

/** Coupure réseau levée par `fetch`, ou erreur passagère déjà reconnue. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof RetryableError) return true;
  if (error instanceof ServiceError || error instanceof QuotaExceededError || error instanceof ReconnectRequiredError) return false;
  if (error instanceof Error && error.name === "AbortError") return false;
  return error instanceof TypeError || (error instanceof Error && /network|socket|ECONN|ETIMEDOUT|EPIPE|fetch failed|terminated/i.test(error.message));
}

type Params = Record<string, string | number | boolean | undefined>;

export interface GraphRequestOptions {
  method?: "GET" | "POST" | "DELETE";
  /** Paramètres d'adresse (GET, DELETE) ou de formulaire (POST). */
  params?: Params;
  /** Corps `multipart/form-data` (fichier) ; le jeton et la preuve y sont ajoutés. */
  form?: FormData;
  signal?: AbortSignal;
}

/** Appel à la Graph API ; rend le corps JSON (grands identifiants gardés en chaînes). */
export async function graphRequest<T>(auth: GraphAuth, path: string, options: GraphRequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const url = new URL(`${GRAPH_API}/${path.replace(/^\//, "")}`);
  const credentials: Params = { access_token: auth.token, appsecret_proof: auth.proof };
  let body: BodyInit | undefined;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method === "POST") {
    if (options.form) {
      for (const [key, value] of Object.entries({ ...options.params, ...credentials })) if (value !== undefined) options.form.set(key, String(value));
      body = options.form;
    } else {
      const form = new URLSearchParams();
      for (const [key, value] of Object.entries({ ...options.params, ...credentials })) if (value !== undefined) form.set(key, String(value));
      body = form.toString();
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
  } else {
    for (const [key, value] of Object.entries({ ...options.params, ...credentials })) if (value !== undefined) url.searchParams.set(key, String(value));
  }
  let response: Response;
  try {
    response = await fetch(url, { method, headers, body, signal: options.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new RetryableError("La connexion avec Facebook a été coupée.");
  }
  const json = await readJsonKeepingIds(response);
  if (!response.ok || (json && typeof json === "object" && "error" in json)) throw graphError(response.status, json, response.headers);
  return (json ?? {}) as T;
}

/** Adresse publique d'un objet Facebook (publication, vidéo). */
export function facebookUrl(idOrPath: string): string {
  if (/^https:\/\//.test(idOrPath)) return idOrPath;
  if (idOrPath.startsWith("/")) return `${FACEBOOK_WEB}${idOrPath}`;
  return `${FACEBOOK_WEB}/${encodeURIComponent(idOrPath)}`;
}
