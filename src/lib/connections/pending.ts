/**
 * Autorisations en attente du choix des comptes (dossier 07, § 8.9, et
 * parcours de connexion, étape 5).
 *
 * Quand un service rend plusieurs comptes d'un coup (pages, comptes liés),
 * rien n'est enregistré au retour : les comptes trouvés et leurs jetons sont
 * mis de côté, chiffrés, dix minutes, liés à l'administrateur qui a lancé la
 * connexion. L'interface lit la liste (sans jeton), l'administrateur coche
 * ceux à garder, et la finalisation n'enregistre que ceux-là ; les jetons des
 * autres sont oubliés (jamais révoqués : révoquer l'autorisation casserait
 * aussi les comptes gardés).
 *
 * Un service à compte unique (sans `fetchAccounts`), ou une autorisation qui
 * ne rend qu'un compte, est enregistré directement.
 */

import type { AccountSummary, ConnectionCapability, DiscoveredAccount, EncryptedBlob, TokenSet } from "./types";
import { decryptJson, encryptJson } from "./crypto";
import { newId, readStore, updateStore } from "./store";
import { requireReadyConnector } from "./registry";
import { discoverAuthorization, discoveredCapabilities, existingAccountId, upsertAccounts } from "./accounts";
import type { Transaction } from "./oauth";

export const PENDING_TTL_MS = 10 * 60 * 1000;

interface PendingRecord {
  id: string;
  connector: string;
  /** Administrateur qui a lancé la connexion : seul lui peut lire ou finaliser. */
  userId: string;
  createdAt: number;
  expiresAt: number;
  /** Jetons et comptes trouvés, chiffrés (lié à l'identifiant et à l'administrateur). */
  payload: EncryptedBlob;
}

interface PendingPayload {
  tokens: TokenSet;
  scopes: string[];
  accounts: DiscoveredAccount[];
}

interface PendingFile {
  pending: PendingRecord[];
}

/** Ce que l'interface lit d'une autorisation en attente : jamais de jeton. */
export interface PendingAuthorizationView {
  id: string;
  connector: string;
  connectorLabel: string;
  logo: string;
  accountNoun: { one: string; many: string };
  expiresAt: number;
  accounts: {
    externalId: string;
    name: string;
    handle?: string;
    avatarUrl?: string;
    url?: string;
    capabilities: ConnectionCapability[];
    /** Compte déjà connecté (il sera mis à jour), sinon `null`. */
    existingAccountId: string | null;
  }[];
}

/** Ce que rend le retour du service. */
export type AuthorizationOutcome =
  | { kind: "connected"; connector: string; grantId: string; accounts: AccountSummary[] }
  | { kind: "pending"; connector: string; pendingId: string; count: number };

const payloadContext = (id: string, userId: string) => `pending:${id}:${userId}`;

function changePending(change: (records: PendingRecord[]) => PendingRecord[] | void, now = Date.now()) {
  updateStore<PendingFile>("pending", { pending: [] }, (file) => {
    const records = Array.isArray(file.pending) ? file.pending : [];
    const next = change(records) ?? records;
    // Les autorisations expirées sont oubliées à chaque écriture.
    return { pending: next.filter((record) => record.expiresAt > now) };
  });
}

function findRecord(id: unknown, userId: unknown, now = Date.now()): PendingRecord | null {
  if (typeof id !== "string" || typeof userId !== "string" || !userId) return null;
  const record = (readStore<PendingFile>("pending", { pending: [] }).pending ?? []).find((entry) => entry.id === id);
  if (!record || record.userId !== userId || record.expiresAt <= now) return null;
  return record;
}

const expired = () => new Error("Le choix des comptes a expiré : recommencez la connexion.");

/**
 * Retour du service : échange, découverte, puis enregistrement direct (un
 * seul compte) ou mise de côté (plusieurs comptes à choisir).
 */
export async function receiveAuthorization(connectorId: string, code: string, transaction: Transaction, userId: string): Promise<AuthorizationOutcome> {
  const found = await discoverAuthorization(connectorId, code, transaction);
  if (!found.connector.fetchAccounts || found.accounts.length === 1) {
    const grantId = newId("grt");
    return { kind: "connected", connector: found.connector.id, grantId, accounts: upsertAccounts(found.connector, found.accounts, found.tokens, found.scopes, grantId) };
  }
  const now = Date.now();
  const id = newId("pnd");
  const payload: PendingPayload = { tokens: found.tokens, scopes: found.scopes, accounts: found.accounts.slice(0, 200) };
  changePending(
    (records) => [
      // Une seule autorisation en attente par administrateur et par service.
      ...records.filter((record) => !(record.userId === userId && record.connector === found.connector.id)),
      { id, connector: found.connector.id, userId, createdAt: now, expiresAt: now + PENDING_TTL_MS, payload: encryptJson(payload, payloadContext(id, userId)) },
    ],
    now
  );
  return { kind: "pending", connector: found.connector.id, pendingId: id, count: payload.accounts.length };
}

/** Comptes trouvés, sans jeton, pour l'écran de choix ; `null` si inconnue, expirée ou d'un autre administrateur. */
export function readPendingAuthorization(id: string, userId: string): PendingAuthorizationView | null {
  const record = findRecord(id, userId);
  if (!record) return null;
  const connector = requireReadyConnector(record.connector);
  const payload = decryptJson<PendingPayload>(record.payload, payloadContext(record.id, record.userId));
  return {
    id: record.id,
    connector: connector.id,
    connectorLabel: connector.label,
    logo: connector.logo,
    accountNoun: connector.accountNoun,
    expiresAt: record.expiresAt,
    accounts: payload.accounts.map((account) => ({
      externalId: account.externalId,
      name: account.name,
      handle: account.handle,
      avatarUrl: account.avatarUrl?.startsWith("https://") ? account.avatarUrl : undefined,
      url: account.url?.startsWith("https://") ? account.url : undefined,
      capabilities: discoveredCapabilities(connector, account, payload.scopes),
      existingAccountId: existingAccountId(connector.id, account.externalId),
    })),
  };
}

/**
 * Enregistre les comptes cochés (par `externalId`) et oublie les autres.
 * L'autorisation en attente est effacée dans tous les cas.
 */
export function finalizePendingAuthorization(id: string, userId: string, keep: string[]): { grantId: string; accounts: AccountSummary[] } {
  const record = findRecord(id, userId);
  if (!record) throw expired();
  const connector = requireReadyConnector(record.connector);
  const payload = decryptJson<PendingPayload>(record.payload, payloadContext(record.id, record.userId));
  const wanted = new Set(Array.isArray(keep) ? keep.filter((value): value is string => typeof value === "string") : []);
  const chosen = payload.accounts.filter((account) => wanted.has(account.externalId));
  changePending((records) => records.filter((entry) => entry.id !== record.id));
  if (chosen.length === 0) throw new Error("Aucun compte choisi : rien n’a été connecté.");
  const grantId = newId("grt");
  return { grantId, accounts: upsertAccounts(connector, chosen, payload.tokens, payload.scopes, grantId) };
}

/** Abandon du choix : tout est oublié, rien n'est révoqué. */
export function cancelPendingAuthorization(id: string, userId: string) {
  const record = findRecord(id, userId);
  if (!record) return;
  changePending((records) => records.filter((entry) => entry.id !== record.id));
}

/** Efface les autorisations expirées (tâche de fond). */
export function purgePendingAuthorizations(now = Date.now()) {
  changePending(() => undefined, now);
}
