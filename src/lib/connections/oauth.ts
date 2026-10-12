/**
 * Connexion OAuth commune à tous les services (dossier 07, § 8.3).
 *
 * Ce n'est pas un mode de connexion à ShareX Manager : Better Auth garde
 * l'identité. On relie ici un compte de publication à l'instance.
 *
 * - `state` aléatoire et vérificateur PKCE (S256) rangés dans un cookie de
 *   transaction `HttpOnly`, `Secure`, `SameSite=Lax`, signé et valable dix
 *   minutes ;
 * - URI de redirection fixe, tirée d'AUTH_URL ;
 * - aucun jeton n'est journalisé ni recopié dans un message d'erreur.
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { TOKEN_NEVER_EXPIRES, type Connector, type TokenResponseFields, type TokenSet } from "./types";
import { OAuthError } from "./errors";
import { sign, verifySignature } from "./crypto";
import { authorizeSettingParams, getAppCredentials, getAppSettings, missingAppSettings, redirectUri, type AppCredentials } from "./apps";
import { parseJsonKeepingIds } from "./json";
import { requireReadyConnector } from "./registry";

export const TRANSACTION_COOKIE = "sxm_connection_tx";
export const TRANSACTION_TTL_SECONDS = 600;
const COOKIE_PURPOSE = "oauth-transaction";

export interface Transaction {
  connector: string;
  state: string;
  verifier?: string;
  scopeSet: string;
  expiresAt: number;
  /** « popup » : le retour rend une page qui prévient la fenêtre d'origine puis se ferme. */
  mode?: "popup" | "redirect";
  /** Chemin interne où revenir ensuite (validé par `safeReturnPath`). */
  returnTo?: string;
  /**
   * Connexion incrémentale : portées demandées (celles du compte, plus
   * celles ajoutées), à la place de celles du jeu `scopeSet`.
   */
  scopes?: string[];
}

/**
 * Chemin interne sûr pour revenir après la connexion, ou `undefined` :
 * commence par une seule barre, sans schéma, sans hôte, sans caractère de
 * contrôle ni barre oblique inverse, 500 caractères au plus.
 */
export function safeReturnPath(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 500) return undefined;
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return undefined;
  try {
    const url = new URL(value, "http://sxm.invalid");
    if (url.origin !== "http://sxm.invalid") return undefined;
    return url.pathname + url.search + url.hash;
  } catch {
    return undefined;
  }
}

/** L'application du service n'est pas configurée : la page ouvre sa configuration. */
export class AppNotConfiguredError extends Error {
  constructor(label: string, message?: string) {
    super(message ?? `L’application ${label} n’est pas configurée.`);
    this.name = "AppNotConfiguredError";
  }
}

const base64url = (buffer: Buffer) => buffer.toString("base64url");

export function pkceChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

function encodeTransaction(transaction: Transaction): string {
  const payload = base64url(Buffer.from(JSON.stringify(transaction), "utf-8"));
  return `${payload}.${sign(payload, COOKIE_PURPOSE)}`;
}

export function requireApp(connector: Connector): AppCredentials {
  const app = getAppCredentials(connector);
  if (!app) throw new AppNotConfiguredError(connector.label);
  return app;
}

/**
 * Adresse d'autorisation chez le service et valeur du cookie de transaction.
 * `mode` et `returnTo` voyagent dans le cookie signé jusqu'au retour.
 */
export function startAuthorization(
  connectorId: string,
  scopeSetId: string | null,
  now = Date.now(),
  options: {
    mode?: "popup" | "redirect";
    returnTo?: string;
    /**
     * Connexion incrémentale : liste complète des portées à demander (celles
     * du compte et celles ajoutées, voir `incrementalScopes`). Jamais à la
     * première connexion, qui reste limitée au jeu choisi.
     */
    scopes?: string[];
  } = {}
): { url: string; cookie: string } {
  const connector = requireReadyConnector(connectorId);
  const app = requireApp(connector);
  if (missingAppSettings(connector).length > 0) throw new AppNotConfiguredError(connector.label);
  const scopeSet = connector.oauth.scopeSets.find((set) => set.id === scopeSetId) ?? connector.oauth.scopeSets[0];
  if (!scopeSet) throw new Error("Aucun jeu de portées pour ce service.");

  const state = base64url(randomBytes(24));
  const verifier = connector.oauth.pkce ? base64url(randomBytes(48)) : undefined;
  const url = new URL(connector.oauth.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("redirect_uri", redirectUri(connector.id));
  const incremental = Array.isArray(options.scopes) && options.scopes.length > 0 ? [...new Set(options.scopes.filter((scope) => typeof scope === "string" && scope))].slice(0, 50) : undefined;
  url.searchParams.set("scope", (incremental ?? scopeSet.scopes).join(connector.oauth.scopeSeparator ?? " "));
  url.searchParams.set("state", state);
  if (verifier) {
    url.searchParams.set("code_challenge", pkceChallenge(verifier));
    url.searchParams.set("code_challenge_method", "S256");
  }
  for (const [key, value] of Object.entries(connector.oauth.extraParams ?? {})) url.searchParams.set(key, value);
  for (const [key, value] of Object.entries(authorizeSettingParams(connector))) url.searchParams.set(key, value);
  if (incremental) {
    // Certains services fixent les autorisations par un réglage (configuration Meta) : les portées en plus en demandent un autre.
    const settings = getAppSettings(connector);
    for (const [param, settingKey] of Object.entries(connector.oauth.incremental?.settingParams ?? {})) {
      const value = settings[settingKey];
      if (!value) {
        const label = connector.app.settings?.find((setting) => setting.key === settingKey)?.label ?? settingKey;
        throw new AppNotConfiguredError(connector.label, `Pour ajouter cette autorisation, renseignez d’abord « ${label} » dans la configuration de l’application ${connector.label}.`);
      }
      url.searchParams.set(param, value);
    }
  }

  const returnTo = safeReturnPath(options.returnTo);
  const cookie = encodeTransaction({
    connector: connector.id,
    state,
    verifier,
    scopeSet: scopeSet.id,
    expiresAt: now + TRANSACTION_TTL_SECONDS * 1000,
    ...(options.mode === "popup" ? { mode: "popup" as const } : {}),
    ...(returnTo ? { returnTo } : {}),
    ...(incremental ? { scopes: incremental } : {}),
  });
  return { url: url.toString(), cookie };
}

/** Vérifie le cookie de transaction et le `state` rendu par le service. */
export function readTransaction(cookie: string | undefined, connectorId: string, state: string | null, now = Date.now()): Transaction {
  const invalid = () => new OAuthError("invalid_state", "Demande de connexion invalide ou expirée : recommencez depuis « Comptes connectés ».");
  if (!cookie || !state) throw invalid();
  const [payload, signature] = cookie.split(".");
  if (!payload || !signature || !verifySignature(payload, signature, COOKIE_PURPOSE)) throw invalid();
  let transaction: Transaction;
  try {
    transaction = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as Transaction;
  } catch {
    throw invalid();
  }
  if (transaction.connector !== connectorId || typeof transaction.expiresAt !== "number" || transaction.expiresAt < now) throw invalid();
  // Le cookie est signé, mais on ne fait jamais confiance à un chemin sans le revalider.
  transaction.returnTo = safeReturnPath(transaction.returnTo);
  if (transaction.mode !== "popup") delete transaction.mode;
  if (transaction.scopes !== undefined && (!Array.isArray(transaction.scopes) || !transaction.scopes.every((scope) => typeof scope === "string"))) delete transaction.scopes;
  const expected = Buffer.from(String(transaction.state));
  const received = Buffer.from(state);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw invalid();
  return transaction;
}

const OAUTH_MESSAGES: Record<string, string> = {
  invalid_grant: "Le service a refusé l’autorisation (jeton expiré ou révoqué) : reconnectez le compte.",
  access_denied: "Autorisation refusée chez le service.",
  invalid_client: "Identifiant ou secret de l’application refusé par le service : vérifiez la configuration.",
  redirect_uri_mismatch: "L’URI de redirection n’est pas déclarée chez le service : recopiez celle de la configuration.",
};

export function oauthMessage(code: string): string {
  return OAUTH_MESSAGES[code] ?? `Le service a refusé la connexion (${code.replace(/[^a-z_]/gi, "").slice(0, 60)}).`;
}

/** Message affichable d'un service : sans caractère de contrôle, sans rien qui ressemble à un jeton, borné. */
function cleanServiceMessage(message: string): string {
  return message
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/[A-Za-z0-9_\-.|]{32,}/g, "…")
    .trim()
    .slice(0, 200);
}

/** Erreur OAuth d'après un code (et, à défaut de message connu, le message lisible du service). */
export function oauthError(code: string, serviceMessage?: string): OAuthError {
  const known = OAUTH_MESSAGES[code];
  const cleaned = serviceMessage ? cleanServiceMessage(serviceMessage) : "";
  return new OAuthError(code, known ?? (cleaned ? `Le service a refusé la connexion : ${cleaned}` : oauthMessage(code)));
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): string | undefined => (typeof value === "string" && value ? value : typeof value === "number" ? String(value) : undefined);

/**
 * Lecture par défaut d'une erreur : `{ error: "code", error_description }`
 * (norme), `{ error: { message, type, code } }`, `{ error_type,
 * error_message }`. `null` si le corps n'en porte aucune.
 */
export function readDefaultError(body: unknown): { code: string; message?: string } | null {
  if (!isRecord(body)) return null;
  // Code normé : le message du cœur suffit (et reste celui qu'on a toujours affiché).
  if (typeof body.error === "string" && body.error) return { code: body.error };
  if (isRecord(body.error)) {
    const code = text(body.error.type) ?? text(body.error.code) ?? "error";
    return { code: code.replace(/[^A-Za-z0-9_]/g, "").slice(0, 60) || "error", message: text(body.error.message) };
  }
  if (body.error_type || body.error_message) {
    return { code: (text(body.error_type) ?? "error").replace(/[^A-Za-z0-9_]/g, "").slice(0, 60) || "error", message: text(body.error_message) };
  }
  return null;
}

/** Erreur d'un appel OAuth, lue par le connecteur s'il le sait, sinon par défaut. Utilisable par les connecteurs. */
export function readOAuthError(connector: Connector, body: unknown, status: number): OAuthError {
  const read = connector.oauth.readError?.(body, status) ?? readDefaultError(body);
  return read ? oauthError(read.code, read.message) : oauthError(`http_${status}`);
}

/** Réponse de jeton ramenée aux champs de la norme. */
function parseTokenBody(connector: Connector, raw: unknown, status: number): TokenResponseFields {
  if (connector.oauth.parseTokenResponse) return connector.oauth.parseTokenResponse(raw, status);
  // Forme « { data: [ { access_token, permissions } ] } » rendue par certains services.
  const body = isRecord(raw) && Array.isArray(raw.data) && isRecord(raw.data[0]) && !raw.access_token ? raw.data[0] : raw;
  if (!isRecord(body)) return {};
  return {
    access_token: text(body.access_token),
    refresh_token: text(body.refresh_token),
    expires_in: Number(body.expires_in) || undefined,
    scope:
      typeof body.scope === "string"
        ? body.scope
        : Array.isArray(body.scope)
          ? body.scope.filter((entry) => typeof entry === "string").join(" ")
          : typeof body.permissions === "string"
            ? body.permissions
            : undefined,
    token_type: text(body.token_type),
  };
}

/** En-tête `Authorization: Basic` du client (RFC 6749, § 2.3.1 : valeurs encodées en formulaire). */
function basicAuthorization(app: AppCredentials): string {
  const encode = (value: string) => encodeURIComponent(value).replace(/%20/g, "+");
  return `Basic ${Buffer.from(`${encode(app.clientId)}:${encode(app.clientSecret)}`).toString("base64")}`;
}

/** Échéance d'un jeton d'après `expires_in`, sinon d'après la durée par défaut du connecteur. */
export function tokenExpiry(connector: Connector, expiresIn: unknown, now = Date.now()): number {
  const seconds = Number(expiresIn);
  if (seconds > 0) return now + Math.max(60, seconds) * 1000;
  const fallback = connector.tokenLifetime?.defaultMs;
  if (fallback === null) return TOKEN_NEVER_EXPIRES;
  return now + (fallback ?? 3600 * 1000);
}

/** Portées d'une réponse : espaces selon la norme, virgules chez certains services. */
export function splitScopes(scope: string | undefined): string[] | undefined {
  return typeof scope === "string" ? scope.split(/[\s,]+/).filter(Boolean) : undefined;
}

async function tokenRequest(connector: Connector, params: Record<string, string>): Promise<{ tokens: TokenSet; scopes?: string[] }> {
  const app = requireApp(connector);
  const basic = connector.oauth.clientAuth === "basic";
  const body = new URLSearchParams(basic ? params : { ...params, client_id: app.clientId, client_secret: app.clientSecret });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (basic) headers.Authorization = basicAuthorization(app);
  let response: Response;
  if (connector.oauth.tokenMethod === "GET") {
    // Certains services ne documentent que l'échange en GET : les paramètres passent dans l'adresse.
    const url = new URL(connector.oauth.tokenUrl);
    for (const [key, value] of body) url.searchParams.set(key, value);
    delete headers["Content-Type"];
    response = await fetch(url, { method: "GET", headers });
  } else {
    response = await fetch(connector.oauth.tokenUrl, { method: "POST", headers, body: body.toString() });
  }
  let raw: unknown = null;
  try {
    // Les grands identifiants (17 chiffres) restent des chaînes.
    raw = parseJsonKeepingIds(await response.text());
  } catch {
    // Corps illisible : traité plus bas.
  }
  const data = parseTokenBody(connector, raw, response.status);
  if (!response.ok || !data.access_token) {
    if (data.error) throw oauthError(data.error, data.error_description);
    throw readOAuthError(connector, raw, response.status);
  }
  const now = Date.now();
  return {
    tokens: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: tokenExpiry(connector, data.expires_in, now),
      tokenType: data.token_type,
      issuedAt: now,
    },
    scopes: splitScopes(data.scope),
  };
}

/** Échange le code d'autorisation contre les jetons. */
export function exchangeCode(connector: Connector, code: string, verifier: string | undefined) {
  return tokenRequest(connector, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(connector.id),
    ...(verifier ? { code_verifier: verifier } : {}),
  });
}

/** Nouveau jeton d'accès ; Google ne rend pas de nouveau jeton d'actualisation, on garde l'ancien. */
export async function refreshTokens(connector: Connector, refreshToken: string) {
  const result = await tokenRequest(connector, { grant_type: "refresh_token", refresh_token: refreshToken });
  return { ...result, tokens: { ...result.tokens, refreshToken: result.tokens.refreshToken ?? refreshToken } };
}

/** Révoque un jeton chez le service, quand il le permet. Rend vrai si le service l'a accepté. */
export async function revokeToken(connector: Connector, token: string): Promise<boolean> {
  if (!connector.oauth.revokeUrl) return false;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
    if (connector.oauth.clientAuth === "basic") headers.Authorization = basicAuthorization(requireApp(connector));
    const response = await fetch(connector.oauth.revokeUrl, {
      method: "POST",
      headers,
      body: new URLSearchParams({ token }).toString(),
    });
    // 400 « invalid_token » : déjà révoqué, le résultat est le même.
    return response.ok || response.status === 400;
  } catch {
    return false;
  }
}
