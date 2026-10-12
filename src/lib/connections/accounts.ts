/**
 * Comptes connectés : enregistrement, jetons, renommage, déconnexion.
 *
 * Un compte est identifié par `connector` + `externalId` : reconnecter la même
 * chaîne met à jour le compte au lieu d'en créer un second. Plusieurs comptes
 * d'un même service coexistent sans limite.
 *
 * Une autorisation (« grant ») peut rendre plusieurs comptes (`fetchAccounts`
 * du connecteur : pages d'un profil…). Chacun est enregistré à part, avec son
 * propre jeton s'il en a un, sinon une copie du jeton de l'autorisation,
 * renouvelée pour tous ensemble. Déconnecter l'un ne touche pas aux autres :
 * l'accès n'est révoqué chez le service qu'avec le dernier compte de
 * l'autorisation.
 *
 * Les jetons ne sortent jamais de ce fichier, sinon vers le connecteur au
 * moment d'un appel : `listAccounts` rend des résumés sans jeton.
 */

import {
  TOKEN_NEVER_EXPIRES,
  type AccessToken,
  type AccountReadContext,
  type AccountProfile,
  type AccountSummary,
  type ConnectedAccount,
  type ConnectionCapability,
  type Connector,
  type ConnectorContext,
  type DiscoveredAccount,
  type TokenHookContext,
  type TokenRenewal,
  type TokenSet,
  type TokenState,
} from "./types";
import { OAuthError, ReconnectRequiredError, errorMessage } from "./errors";
import { decryptJson, encryptJson } from "./crypto";
import { newId, readStore, updateStore, withLock } from "./store";
import { capabilitiesForScopes, getConnector, requestableCapabilities, requireReadyConnector } from "./registry";
import { exchangeCode, refreshTokens, requireApp, revokeToken, type Transaction } from "./oauth";
import { appSecretProof, getAppSettings } from "./apps";
import { chargeAccountQuota, chargeQuota, forgetAccountQuota } from "./quota";

interface AccountsFile {
  accounts: ConnectedAccount[];
}

/** Marge avant expiration : un jeton qui expire dans moins d'une minute est renouvelé. */
const REFRESH_MARGIN_MS = 60_000;
/** Un jeton qu'on ne sait pas prolonger est signalé « expire bientôt » une semaine avant. */
const EXPIRING_SOON_MS = 7 * 24 * 60 * 60 * 1000;
/** Comptes gardés au plus pour une autorisation. */
const MAX_ACCOUNTS_PER_GRANT = 200;
/** Écriture des jetons renouvelés : essais avant de garder le nouveau couple en mémoire seulement. */
const WRITE_ATTEMPTS = 3;

/**
 * Jetons renouvelés que le disque n'a pas pu recevoir (disque plein…). Un
 * jeton d'actualisation à usage unique est déjà consommé chez le service :
 * perdre le nouveau couple ferait perdre le compte. On le garde ici, il sert
 * aux appels suivants et l'écriture est retentée à chaque usage.
 */
const unsaved = ((globalThis as typeof globalThis & { __sxmUnsavedTokens?: Map<string, TokenSet> }).__sxmUnsavedTokens ??= new Map<string, TokenSet>());

const credentialsContext = (accountId: string) => `account:${accountId}`;
const grantCredentialsContext = (accountId: string) => `account-grant:${accountId}`;

function readAccounts(): ConnectedAccount[] {
  const file = readStore<AccountsFile>("accounts", { accounts: [] });
  return Array.isArray(file.accounts) ? file.accounts : [];
}

function changeAccounts(change: (accounts: ConnectedAccount[]) => ConnectedAccount[] | void): ConnectedAccount[] {
  return updateStore<AccountsFile>("accounts", { accounts: [] }, (file) => {
    const accounts = Array.isArray(file.accounts) ? file.accounts : [];
    return { accounts: change(accounts) ?? accounts };
  }).accounts;
}

function changeAccount(id: string, change: (account: ConnectedAccount) => void): ConnectedAccount {
  let found: ConnectedAccount | undefined;
  changeAccounts((accounts) => {
    found = accounts.find((account) => account.id === id);
    if (found) change(found);
  });
  if (!found) throw new Error("Compte introuvable.");
  return found;
}

/** Le jeton de ce compte est-il la copie de celui de l'autorisation ? */
const sharesGrantToken = (account: ConnectedAccount) => Boolean(account.grantId) && (account.tokenSource ?? "grant") === "grant";

/** Comptes qui partagent le même jeton d'autorisation (le compte lui-même compris). */
function sameTokenAs(account: ConnectedAccount) {
  return (entry: ConnectedAccount) =>
    entry.id === account.id || (sharesGrantToken(account) && sharesGrantToken(entry) && entry.connector === account.connector && entry.grantId === account.grantId);
}

function tokenState(account: ConnectedAccount, now = Date.now()): { state: TokenState; reason?: string } {
  const expiresAt = account.tokenExpiresAt;
  if (!expiresAt || expiresAt >= TOKEN_NEVER_EXPIRES) return { state: "ok" };
  if (account.tokenRenewal === "automatic" && !account.tokenRenewError) return { state: "ok" };
  if (expiresAt <= now) return { state: "expired", reason: "Jeton expiré : reconnectez le compte." };
  if (account.tokenRenewError) return { state: "expiring-soon", reason: `Renouvellement de l’accès en échec : ${account.tokenRenewError}` };
  if (expiresAt - now < EXPIRING_SOON_MS) {
    return { state: "expiring-soon", reason: "Le service ne permet pas de prolonger cet accès : reconnectez le compte avant l’échéance." };
  }
  return { state: "ok" };
}

/** Limites propres au compte (`limitsFor`), si le connecteur en déclare. */
function accountLimits(connector: Connector | null, account: ConnectedAccount) {
  if (!connector?.limitsFor) return undefined;
  try {
    return connector.limitsFor({ externalId: account.externalId, data: account.data }) ?? undefined;
  } catch {
    return undefined;
  }
}

export function summarizeAccount(account: ConnectedAccount): AccountSummary {
  const connector = getConnector(account.connector);
  const token = tokenState(account);
  const limits = accountLimits(connector, account);
  return {
    id: account.id,
    connector: account.connector,
    connectorLabel: connector?.label ?? account.connector,
    logo: connector?.logo ?? account.connector,
    externalId: account.externalId,
    name: account.name,
    label: account.label,
    displayName: account.label || account.name,
    handle: account.handle,
    avatarUrl: account.avatarUrl,
    url: account.url,
    scopes: [...account.scopes],
    capabilities: [...account.capabilities],
    status: account.status,
    statusReason: account.statusReason,
    connectedAt: account.connectedAt,
    lastCheckedAt: account.lastCheckedAt,
    grantId: account.grantId,
    tokenExpiresAt: account.tokenExpiresAt && account.tokenExpiresAt < TOKEN_NEVER_EXPIRES ? account.tokenExpiresAt : undefined,
    tokenRenewal: account.tokenRenewal,
    tokenState: token.state,
    tokenStateReason: token.reason,
    ...(limits ? { limits } : {}),
    requestableCapabilities: connector && connector.status === "ready" ? requestableCapabilities(connector, account.scopes) : [],
  };
}

/** Comptes, sans jeton ; filtrés par capacité ou par service. */
export function listAccounts(filter: { capability?: ConnectionCapability; connector?: string } = {}): AccountSummary[] {
  return readAccounts()
    .filter((account) => !filter.capability || account.capabilities.includes(filter.capability))
    .filter((account) => !filter.connector || account.connector === filter.connector)
    .sort((a, b) => a.connector.localeCompare(b.connector) || a.connectedAt - b.connectedAt)
    .map(summarizeAccount);
}

export function getAccountSummary(id: string): AccountSummary | null {
  const account = readAccounts().find((entry) => entry.id === id);
  return account ? summarizeAccount(account) : null;
}

function requireAccountRecord(id: unknown): ConnectedAccount {
  const account = typeof id === "string" ? readAccounts().find((entry) => entry.id === id) : undefined;
  if (!account) throw new Error("Compte introuvable.");
  return account;
}

/** Ce que reçoivent les points d'extension des jetons du connecteur. */
function hookContext(connector: Connector): TokenHookContext {
  const app = requireApp(connector);
  return {
    app: { clientId: app.clientId, clientSecret: app.clientSecret },
    settings: getAppSettings(connector, { includeSecret: true }),
    chargeQuota: (method) => chargeQuota(connector, method),
  };
}

function renewalFor(connector: Connector, tokens: TokenSet): TokenRenewal {
  if (tokens.expiresAt >= TOKEN_NEVER_EXPIRES) return "none";
  return tokens.refreshToken || connector.refreshToken ? "automatic" : "manual";
}

/** Données du connecteur : chaînes courtes seulement, rangées en clair. */
function sanitizeData(data: unknown): Record<string, string> | undefined {
  if (!data || typeof data !== "object") return undefined;
  const entries = Object.entries(data as Record<string, unknown>)
    .filter(([key, value]) => /^[A-Za-z0-9_.-]{1,64}$/.test(key) && typeof value === "string")
    .slice(0, 20)
    .map(([key, value]) => [key, (value as string).slice(0, 500)]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * Enregistre les comptes rendus par une autorisation. Un compte déjà connu
 * (même service, même `externalId`) est mis à jour : jetons, portées, nom et
 * avatar ; son nom choisi dans ShareX Manager est gardé.
 */
export function upsertAccounts(
  connector: Connector,
  discovered: DiscoveredAccount[],
  grantTokens: TokenSet,
  scopes: string[],
  grantId = newId("grt"),
  now = Date.now()
): AccountSummary[] {
  const seen = new Set<string>();
  const unique = discovered
    .filter((entry) => entry && typeof entry.externalId === "string" && entry.externalId && !seen.has(entry.externalId) && seen.add(entry.externalId))
    .slice(0, MAX_ACCOUNTS_PER_GRANT);
  const saved: ConnectedAccount[] = [];
  changeAccounts((accounts) => {
    let next = accounts;
    for (const profile of unique) {
      const existing = next.find((account) => account.connector === connector.id && account.externalId === profile.externalId);
      const id = existing?.id ?? newId("acc");
      const own = Boolean(profile.token?.accessToken);
      let stored: TokenSet = own
        ? {
            accessToken: profile.token!.accessToken,
            refreshToken: profile.token!.refreshToken,
            expiresAt: profile.token!.expiresAt ?? TOKEN_NEVER_EXPIRES,
            tokenType: profile.token!.tokenType,
            issuedAt: now,
          }
        : grantTokens;
      if (!stored.refreshToken && existing && (existing.tokenSource ?? "grant") === (own ? "own" : "grant")) {
        // Sans nouveau jeton d'actualisation, on garde l'ancien plutôt que de perdre l'accès hors ligne.
        try {
          const previous = decryptJson<TokenSet>(existing.credentials, credentialsContext(existing.id));
          if (previous.refreshToken) stored = { ...stored, refreshToken: previous.refreshToken };
        } catch {
          // Ancien jeton illisible : on garde le nouveau tel quel.
        }
      }
      const granted = profile.scopes && profile.scopes.length > 0 ? profile.scopes : scopes;
      let capabilities = capabilitiesForScopes(connector, granted);
      if (Array.isArray(profile.capabilities)) capabilities = capabilities.filter((capability) => profile.capabilities!.includes(capability));
      const account: ConnectedAccount = {
        id,
        connector: connector.id,
        externalId: profile.externalId,
        name: String(profile.name ?? profile.externalId).slice(0, 200),
        label: existing?.label,
        handle: profile.handle?.slice(0, 100),
        avatarUrl: profile.avatarUrl?.startsWith("https://") ? profile.avatarUrl : undefined,
        url: profile.url?.startsWith("https://") ? profile.url : undefined,
        credentials: encryptJson(stored, credentialsContext(id)),
        scopes: [...new Set(granted)],
        capabilities,
        status: "connected",
        connectedAt: existing?.connectedAt ?? now,
        lastCheckedAt: now,
        grantId,
        tokenSource: own ? "own" : "grant",
        grantCredentials: own ? encryptJson(grantTokens, grantCredentialsContext(id)) : undefined,
        data: sanitizeData(profile.data),
        tokenExpiresAt: stored.expiresAt,
        tokenRenewal: renewalFor(connector, stored),
      };
      saved.push(account);
      next = existing ? next.map((entry) => (entry.id === existing.id ? account : entry)) : [...next, account];
    }
    return next;
  });
  return saved.map(summarizeAccount);
}

/** Un seul compte (ancienne forme, gardée pour les appelants existants). */
export function upsertAccount(connector: Connector, profile: AccountProfile, tokens: TokenSet, scopes: string[], now = Date.now()): AccountSummary {
  return upsertAccounts(connector, [profile], tokens, scopes, newId("grt"), now)[0];
}

/** Ce qu'une autorisation a rendu, avant tout enregistrement. */
export interface DiscoveredAuthorization {
  connector: Connector;
  /** Jetons de l'autorisation (après l'échange longue durée éventuel). */
  tokens: TokenSet;
  /** Portées accordées, sinon celles demandées. */
  scopes: string[];
  accounts: DiscoveredAccount[];
}

/**
 * Retour du service : échange du code (sans délai, certains codes ne valent
 * que trente secondes), échange éventuel contre un jeton longue durée,
 * portées accordées, lecture du ou des comptes. Rien n'est enregistré.
 */
export async function discoverAuthorization(connectorId: string, code: string, transaction: Transaction): Promise<DiscoveredAuthorization> {
  const connector = requireReadyConnector(connectorId);
  if (!connector.fetchProfile && !connector.fetchAccounts) throw new Error(`${connector.label} ne sait pas lire l’identité d’un compte.`);
  const exchanged = await exchangeCode(connector, code, transaction.verifier);
  let tokens = exchanged.tokens;
  let scopes = exchanged.scopes;
  const context = hookContext(connector);
  if (connector.exchangeToken) {
    const longLived = await connector.exchangeToken(tokens, context);
    tokens = { ...longLived, issuedAt: longLived.issuedAt ?? Date.now() };
  }
  const token: AccessToken = { value: tokens.accessToken, expiresAt: tokens.expiresAt };
  if ((!scopes || scopes.length === 0) && connector.fetchGrantedScopes) {
    try {
      scopes = (await connector.fetchGrantedScopes(token, context)) ?? undefined;
    } catch {
      scopes = undefined;
    }
  }
  const requested = transaction.scopes ?? connector.oauth.scopeSets.find((set) => set.id === transaction.scopeSet)?.scopes ?? [];
  // Les portées réellement accordées priment : l'utilisateur a pu en décocher chez le service.
  const granted = scopes && scopes.length > 0 ? scopes : requested;
  const charge = (method: string) => chargeQuota(connector, method);
  const reading = readContext(connector, charge);
  const accounts = connector.fetchAccounts
    ? await connector.fetchAccounts(token, charge, reading)
    : [await connector.fetchProfile!(token, charge, undefined, reading)];
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new OAuthError("no_accounts", `${connector.label} n’a rendu aucun compte : vérifiez ce que vous avez autorisé lors de la connexion.`);
  }
  return { connector, tokens, scopes: granted, accounts };
}

/** Capacités qu'aurait un compte trouvé, pour l'écran de choix. */
export function discoveredCapabilities(connector: Connector, account: DiscoveredAccount, scopes: string[]): ConnectionCapability[] {
  let capabilities = capabilitiesForScopes(connector, account.scopes && account.scopes.length > 0 ? account.scopes : scopes);
  if (Array.isArray(account.capabilities)) capabilities = capabilities.filter((capability) => account.capabilities!.includes(capability));
  return capabilities;
}

/** Identifiant interne d'un compte déjà connecté (même service, même `externalId`), s'il existe. */
export function existingAccountId(connectorId: string, externalId: string): string | null {
  return readAccounts().find((account) => account.connector === connectorId && account.externalId === externalId)?.id ?? null;
}

/**
 * Fin du parcours OAuth sans choix des comptes : tous les comptes rendus sont
 * enregistrés (le parcours en plusieurs étapes passe par `pending.ts`).
 */
export async function completeAuthorization(
  connectorId: string,
  code: string,
  transaction: Transaction
): Promise<{ grantId: string; accounts: AccountSummary[] }> {
  const found = await discoverAuthorization(connectorId, code, transaction);
  const grantId = newId("grt");
  return { grantId, accounts: upsertAccounts(found.connector, found.accounts, found.tokens, found.scopes, grantId) };
}

/** Fin du parcours OAuth pour un seul compte : le premier rendu. */
export async function completeConnection(connectorId: string, code: string, transaction: Transaction): Promise<AccountSummary> {
  return (await completeAuthorization(connectorId, code, transaction)).accounts[0];
}

export function markNeedsReconnect(id: string, reason: string) {
  changeAccount(id, (account) => {
    account.status = "needs-reconnect";
    account.statusReason = reason.slice(0, 300);
    account.lastCheckedAt = Date.now();
  });
}

/** Passe « à reconnecter » le compte et ceux qui partagent son jeton. */
function markTokenDead(account: ConnectedAccount, reason: string) {
  const shares = sameTokenAs(account);
  changeAccounts((accounts) => {
    for (const entry of accounts) {
      if (!shares(entry)) continue;
      entry.status = "needs-reconnect";
      entry.statusReason = reason.slice(0, 300);
      entry.lastCheckedAt = Date.now();
    }
  });
}

/**
 * Range les jetons renouvelés dans le compte et dans ceux qui partagent le
 * même jeton d'autorisation. L'écriture est atomique (fichier temporaire puis
 * renommage) ; si elle échoue malgré les essais, le nouveau couple reste en
 * mémoire (`unsaved`) au lieu d'être perdu, et l'écriture est retentée au
 * prochain usage.
 */
function storeRenewedTokens(account: ConnectedAccount, connector: Connector, next: TokenSet, scopes?: string[]) {
  const shares = sameTokenAs(account);
  const now = Date.now();
  let lastError: unknown;
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    try {
      writeRenewedTokens(account, connector, next, scopes, shares, now);
      for (const entry of readAccounts()) if (shares(entry)) unsaved.delete(entry.id);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  unsaved.set(account.id, next);
  console.error("[connections] jetons renouvelés gardés en mémoire, écriture impossible :", errorMessage(lastError));
}

function writeRenewedTokens(
  account: ConnectedAccount,
  connector: Connector,
  next: TokenSet,
  scopes: string[] | undefined,
  shares: (entry: ConnectedAccount) => boolean,
  now: number
) {
  changeAccounts((accounts) => {
    for (const entry of accounts) {
      if (!shares(entry)) continue;
      entry.credentials = encryptJson(next, credentialsContext(entry.id));
      // Les portées rendues au renouvellement ne valent que pour un compte seul de son autorisation.
      if (entry.id === account.id && !connector.fetchAccounts && scopes && scopes.length > 0) {
        entry.scopes = [...new Set(scopes)];
        entry.capabilities = capabilitiesForScopes(connector, entry.scopes);
      }
      entry.tokenExpiresAt = next.expiresAt;
      entry.tokenRenewal = renewalFor(connector, next);
      entry.tokenRenewedAt = now;
      delete entry.tokenRenewError;
      entry.lastCheckedAt = now;
    }
  });
}

function recordRenewError(account: ConnectedAccount, message: string) {
  const shares = sameTokenAs(account);
  changeAccounts((accounts) => {
    for (const entry of accounts) if (shares(entry)) entry.tokenRenewError = message.slice(0, 300);
  });
}

/** Le service refuse définitivement le renouvellement : seule une reconnexion rétablira l'accès. */
function isRefusal(error: unknown): boolean {
  return error instanceof ReconnectRequiredError || (error instanceof OAuthError && (error.code === "invalid_grant" || error.code === "unauthorized_client"));
}

/**
 * Jeton d'accès valide pour un compte, renouvelé avant expiration (une minute
 * par défaut, `tokenLifetime.renewBeforeMs` sinon), sous un verrou : par
 * compte, ou par autorisation quand plusieurs comptes partagent le même
 * jeton. Deux renouvellements ne partent jamais ensemble.
 *
 * - `refresh_token` présent : renouvellement OAuth classique ;
 * - sinon `connector.refreshToken`, pas avant `tokenLifetime.minAgeMs` ;
 * - sinon le jeton sert jusqu'à son échéance, puis le compte est « à reconnecter ».
 *
 * Un refus (`invalid_grant`…) passe le compte « à reconnecter ». Une autre
 * erreur, tant que le jeton reste valable, est notée et le jeton actuel sert.
 */
export function getAccessToken(accountId: string, options: { force?: boolean } = {}): Promise<AccessToken> {
  const first = requireAccountRecord(accountId);
  const lockKey = sharesGrantToken(first) ? `token:grant:${first.grantId}` : `token:${first.id}`;
  return withLock(lockKey, async () => {
    const account = requireAccountRecord(accountId);
    const name = account.label || account.name;
    if (account.status === "needs-reconnect") throw new ReconnectRequiredError(`Le compte « ${name} » doit être reconnecté.`);
    const connector = requireReadyConnector(account.connector);
    const pending = unsaved.get(account.id);
    if (pending) storeRenewedTokens(account, connector, pending);
    const tokens = pending ?? decryptJson<TokenSet>(account.credentials, credentialsContext(account.id));
    const now = Date.now();
    const current: AccessToken = { value: tokens.accessToken, expiresAt: tokens.expiresAt };
    const renewBefore = Math.max(REFRESH_MARGIN_MS, connector.tokenLifetime?.renewBeforeMs ?? REFRESH_MARGIN_MS);
    if (!options.force && tokens.expiresAt - renewBefore > now) return current;
    const usable = tokens.expiresAt - REFRESH_MARGIN_MS > now;

    let renew: () => Promise<{ tokens: TokenSet; scopes?: string[] }>;
    if (tokens.refreshToken) {
      const refreshToken = tokens.refreshToken;
      renew = () => refreshTokens(connector, refreshToken);
    } else if (connector.refreshToken) {
      const minAge = connector.tokenLifetime?.minAgeMs;
      // « Pas avant » : un jeton trop jeune ne peut pas encore être prolongé.
      if (usable && minAge && tokens.issuedAt && now - tokens.issuedAt < minAge) return current;
      const hook = connector.refreshToken.bind(connector);
      renew = async () => ({
        tokens: await hook({ id: account.id, externalId: account.externalId, tokenSource: account.tokenSource ?? "grant", data: account.data }, tokens, hookContext(connector)),
      });
    } else {
      if (usable) return current;
      markTokenDead(account, "Aucun jeton d’actualisation : reconnectez le compte.");
      throw new ReconnectRequiredError(`Le compte « ${name} » doit être reconnecté.`);
    }

    try {
      const { tokens: renewed, scopes } = await renew();
      const next: TokenSet = { ...renewed, issuedAt: renewed.issuedAt ?? Date.now() };
      storeRenewedTokens(account, connector, next, scopes);
      return { value: next.accessToken, expiresAt: next.expiresAt };
    } catch (error) {
      if (isRefusal(error)) {
        markTokenDead(account, errorMessage(error, "Renouvellement refusé."));
        throw new ReconnectRequiredError(`Le compte « ${name} » doit être reconnecté : ${connector.label} a refusé le renouvellement de l’accès.`);
      }
      if (usable) {
        recordRenewError(account, errorMessage(error, "Renouvellement impossible."));
        return current;
      }
      throw error;
    }
  });
}

/**
 * Tâche planifiée (au démarrage, puis toutes les heures) : prolonge les
 * jetons des connecteurs qui déclarent un cycle de vie propre
 * (`tokenLifetime` ou `refreshToken`), même sans publication, et passe « à
 * reconnecter » les comptes dont le jeton non renouvelable a expiré. Les
 * jetons à `refresh_token` classique (YouTube) restent renouvelés à l'usage
 * seulement.
 */
export async function renewDueTokens(): Promise<{ renewed: number; failed: number; expired: number }> {
  const result = { renewed: 0, failed: 0, expired: 0 };
  for (const account of readAccounts()) {
    if (account.status !== "connected") continue;
    const connector = getConnector(account.connector);
    if (!connector || connector.status !== "ready") continue;
    const expiresAt = account.tokenExpiresAt;
    if (!expiresAt || expiresAt >= TOKEN_NEVER_EXPIRES) continue;
    const now = Date.now();
    if (account.tokenRenewal === "manual") {
      if (expiresAt <= now) {
        markNeedsReconnect(account.id, "Jeton expiré : reconnectez le compte.");
        result.expired += 1;
      }
      continue;
    }
    if (!connector.tokenLifetime && !connector.refreshToken) continue;
    let force = false;
    if (connector.tokenLifetime?.schedule === "on-use") {
      // À l'usage seulement, sauf l'entretien : un jeton d'actualisation qui ne tourne jamais finit par expirer.
      const maintenance = connector.tokenLifetime.maintenanceAfterMs;
      if (!maintenance || now - (account.tokenRenewedAt ?? account.connectedAt) < maintenance) continue;
      force = true;
    } else {
      const renewBefore = Math.max(REFRESH_MARGIN_MS, connector.tokenLifetime?.renewBeforeMs ?? REFRESH_MARGIN_MS);
      if (expiresAt - renewBefore > now) continue;
    }
    const before = account.tokenRenewedAt;
    try {
      await getAccessToken(account.id, { force });
      const after = readAccounts().find((entry) => entry.id === account.id);
      if (after?.tokenRenewedAt && after.tokenRenewedAt !== before) result.renewed += 1;
      else if (after?.tokenRenewError) result.failed += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

function safeSettings(connector: Connector): Record<string, string> {
  try {
    return getAppSettings(connector);
  } catch {
    return {};
  }
}

/**
 * Le connecteur a levé `ReconnectRequiredError` pendant un usage (jeton
 * refusé en pleine publication ou gestion) : le compte passe « à
 * reconnecter », avec la raison donnée, et la file suspend ses travaux.
 */
export function noteReconnectRequired(accountId: string, error: unknown) {
  const account = readAccounts().find((entry) => entry.id === accountId);
  if (!account || account.status === "needs-reconnect") return;
  markTokenDead(account, errorMessage(error, "Le service a refusé l’accès : reconnectez le compte."));
}

/**
 * Contexte de lecture d'un compte à la connexion (`fetchAccounts`,
 * `fetchProfile`) : la preuve dérivée du secret, jamais le secret.
 */
function readContext(connector: Connector, charge: (method: string) => void): AccountReadContext {
  return {
    chargeQuota: charge,
    appSecretProof: (value) => appSecretProof(connector, value),
    appSettings: safeSettings(connector),
  };
}

/** Contexte remis à un connecteur pour agir au nom d'un compte. */
export function accountContext(accountId: string): { account: AccountSummary; connector: Connector; context: ConnectorContext } {
  const record = requireAccountRecord(accountId);
  const connector = requireReadyConnector(record.connector);
  return {
    account: summarizeAccount(record),
    connector,
    context: {
      accountId: record.id,
      externalId: record.externalId,
      data: record.data ? { ...record.data } : undefined,
      appSecretProof: (value) => appSecretProof(connector, value),
      appSettings: safeSettings(connector),
      getAccessToken: () => getAccessToken(record.id),
      chargeQuota: (method) => {
        // Le quota du compte est vérifié d'abord, compté en dernier : un refus de l'un ne consomme pas l'autre.
        chargeAccountQuota(connector, record.id, method, { dryRun: true });
        chargeQuota(connector, method);
        chargeAccountQuota(connector, record.id, method);
      },
    },
  };
}

/** Exige une capacité ; le message dit pourquoi elle manque. */
export function requireCapability(accountId: string, capability: ConnectionCapability) {
  const resolved = accountContext(accountId);
  if (!resolved.account.capabilities.includes(capability)) {
    throw new Error(`Le compte « ${resolved.account.displayName} » n’a pas le droit de faire cela : reconnectez-le avec le jeu de portées « Tout ».`);
  }
  if (resolved.account.status !== "connected") {
    throw new ReconnectRequiredError(`Le compte « ${resolved.account.displayName} » doit être reconnecté.`);
  }
  return resolved;
}

/** Relit l'identité du compte chez le service (nom, avatar) et note la vérification. */
export async function verifyAccount(accountId: string): Promise<AccountSummary> {
  const { connector, context } = accountContext(accountId);
  if (!connector.fetchProfile) {
    // Sans lecture d'identité, on vérifie au moins que le jeton est utilisable.
    await context.getAccessToken();
    return summarizeAccount(changeAccount(accountId, (account) => void (account.lastCheckedAt = Date.now())));
  }
  const token = await context.getAccessToken();
  const record = requireAccountRecord(accountId);
  const profile = await connector.fetchProfile(
    token,
    context.chargeQuota,
    { externalId: record.externalId, data: record.data },
    { chargeQuota: context.chargeQuota, appSecretProof: context.appSecretProof, appSettings: context.appSettings }
  );
  const updated = changeAccount(accountId, (account) => {
    if (profile.externalId !== account.externalId) throw new Error("Le jeton désigne désormais un autre compte : reconnectez-le.");
    account.name = profile.name.slice(0, 200);
    account.handle = profile.handle?.slice(0, 100);
    if (profile.avatarUrl?.startsWith("https://")) account.avatarUrl = profile.avatarUrl;
    if (profile.url?.startsWith("https://")) account.url = profile.url;
    account.lastCheckedAt = Date.now();
  });
  return summarizeAccount(updated);
}

/** Nom affiché dans ShareX Manager ; vide : le nom chez le service. */
export function renameAccount(accountId: string, label: unknown): AccountSummary {
  const clean = typeof label === "string" ? label.replace(/\s+/g, " ").trim().slice(0, 100) : "";
  return summarizeAccount(
    changeAccount(accountId, (account) => {
      account.label = clean || undefined;
    })
  );
}

export interface DisconnectResult {
  /** Le service a accepté la révocation. */
  revoked: boolean;
  /** Comptes de la même autorisation encore connectés : l'accès n'est alors pas révoqué. */
  remaining: number;
  /** Consigne du connecteur quand l'accès n'a pas pu être révoqué par l'API. */
  help?: string;
}

/**
 * Déconnecte un compte et l'efface. L'accès n'est révoqué chez le service
 * (`revokeAccess` du connecteur, sinon `oauth.revokeUrl` avec le jeton
 * d'actualisation, qui révoque aussi les jetons d'accès) que si aucun autre
 * compte de la même autorisation ne reste : sinon, les révoquer casserait
 * ceux-là.
 */
export async function disconnectAccount(accountId: string): Promise<DisconnectResult> {
  const account = requireAccountRecord(accountId);
  const connector = getConnector(account.connector);
  const remaining = account.grantId
    ? readAccounts().filter((entry) => entry.id !== account.id && entry.connector === account.connector && entry.grantId === account.grantId).length
    : 0;
  let revoked = false;
  if (connector && remaining === 0) {
    try {
      const tokens = account.grantCredentials
        ? decryptJson<TokenSet>(account.grantCredentials, grantCredentialsContext(account.id))
        : decryptJson<TokenSet>(account.credentials, credentialsContext(account.id));
      revoked = connector.revokeAccess
        ? await connector.revokeAccess(tokens, hookContext(connector))
        : await revokeToken(connector, tokens.refreshToken ?? tokens.accessToken);
    } catch {
      revoked = false;
    }
  }
  changeAccounts((accounts) => accounts.filter((entry) => entry.id !== account.id));
  unsaved.delete(account.id);
  forgetAccountQuota(account.id);
  const help = !revoked && remaining === 0 ? connector?.app.disconnectHelp : undefined;
  return { revoked, remaining, ...(help ? { help } : {}) };
}
