/**
 * Application déclarée chez chaque service (identifiant et secret du client
 * OAuth). Deux sources, dans cet ordre :
 *
 * 1. l'environnement du serveur, `<PREFIX>_CLIENT_ID` et `<PREFIX>_CLIENT_SECRET` ;
 * 2. à défaut, la configuration saisie dans « Comptes connectés », rangée dans
 *    `data/connections/apps.json`, secret chiffré.
 *
 * Un connecteur peut déclarer des réglages de plus (`app.settings` : un
 * identifiant de configuration de connexion…), chacun lu dans sa variable
 * d'environnement ou saisi avec l'application ; un réglage secret est chiffré
 * et n'est jamais réaffiché.
 *
 * Les valeurs de l'environnement s'affichent comme telles et ne se modifient
 * pas depuis l'interface.
 */

import { createHmac } from "crypto";
import type { AppSetting, Connector, EncryptedBlob } from "./types";
import { decrypt, encrypt } from "./crypto";
import { readStore, updateStore } from "./store";
import { requireReadyConnector } from "./registry";

interface StoredApp {
  /** Absents quand l'environnement fournit l'application et que seuls des réglages sont saisis. */
  clientId?: string;
  secret?: EncryptedBlob;
  /** Réglages non secrets. */
  settings?: Record<string, string>;
  /** Réglages secrets, chiffrés un à un. */
  secretSettings?: Record<string, EncryptedBlob>;
  updatedAt: number;
}

type AppsFile = Record<string, StoredApp>;

export interface AppCredentials {
  clientId: string;
  clientSecret: string;
  source: "env" | "file";
}

/** État d'un réglage, pour l'interface : jamais la valeur d'un réglage secret. */
export interface AppSettingStatus {
  key: string;
  label: string;
  help?: string;
  required: boolean;
  secret: boolean;
  envName?: string;
  pattern?: string;
  source: "env" | "file" | null;
  /** Valeur d'un réglage non secret. */
  value?: string;
}

export interface AppStatus {
  connector: string;
  /** Identifiant, secret et réglages obligatoires présents. */
  configured: boolean;
  source: "env" | "file" | null;
  /** L'identifiant du client n'est pas un secret : il figure dans l'adresse d'autorisation. */
  clientId?: string;
  envNames: { clientId: string; clientSecret: string };
  /** URI à déclarer chez le service, ou `null` si AUTH_URL manque. */
  redirectUri: string | null;
  /** Adresses de rappel signées à déclarer aussi (services de Meta) : retrait de l'autorisation, suppression des données. */
  signedCallbacks?: { deauthorize: string; dataDeletion: string };
  /** Secret enregistré mais illisible (clé de chiffrement changée). */
  secretUnreadable?: boolean;
  /** Réglages propres au service. */
  settings: AppSettingStatus[];
  /** Réglages obligatoires manquants (libellés). */
  missingSettings?: string[];
  updatedAt?: number;
}

const appContext = (connectorId: string) => `app:${connectorId}`;
const settingContext = (connectorId: string, key: string) => `app-setting:${connectorId}:${key}`;

function envNames(connector: Connector) {
  return { clientId: `${connector.app.envPrefix}_CLIENT_ID`, clientSecret: `${connector.app.envPrefix}_CLIENT_SECRET` };
}

function fromEnv(connector: Connector): AppCredentials | null {
  const names = envNames(connector);
  const clientId = process.env[names.clientId]?.trim();
  const clientSecret = process.env[names.clientSecret]?.trim();
  return clientId && clientSecret ? { clientId, clientSecret, source: "env" } : null;
}

const storedApp = (connector: Connector): StoredApp | undefined => readStore<AppsFile>("apps", {})[connector.id];

/** Adresse publique de l'instance, sans barre finale. */
export function publicBaseUrl(): string | null {
  const value = process.env.AUTH_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** Services dont la console exige des adresses de rappel signées (retrait de l'autorisation, suppression des données). */
export const SIGNED_CALLBACK_CONNECTORS: readonly string[] = ["facebook", "instagram", "threads"];

/** URI de redirection fixe, tirée d'AUTH_URL et jamais d'une requête. */
export function redirectUri(connectorId: string): string {
  const base = publicBaseUrl();
  if (!base) throw new Error("AUTH_URL n’est pas défini : impossible de construire l’URI de redirection.");
  return `${base}/api/connections/${encodeURIComponent(connectorId)}/callback`;
}

/** Identifiant et secret de l'application, ou `null` si elle n'est pas configurée. */
export function getAppCredentials(connector: Connector): AppCredentials | null {
  const env = fromEnv(connector);
  if (env) return env;
  const stored = storedApp(connector);
  if (!stored?.clientId || !stored.secret) return null;
  return { clientId: stored.clientId, clientSecret: decrypt(stored.secret, appContext(connector.id)), source: "file" };
}

/** Valeur d'un réglage : l'environnement d'abord, puis la saisie. */
function settingValue(connector: Connector, setting: AppSetting, stored: StoredApp | undefined): { value?: string; source: "env" | "file" | null } {
  const env = setting.env ? process.env[setting.env]?.trim() : undefined;
  if (env) return { value: env, source: "env" };
  if (setting.secret) {
    const blob = stored?.secretSettings?.[setting.key];
    if (!blob) return { source: null };
    try {
      return { value: decrypt(blob, settingContext(connector.id, setting.key)), source: "file" };
    } catch {
      return { source: null };
    }
  }
  const value = stored?.settings?.[setting.key];
  return value ? { value, source: "file" } : { source: null };
}

/**
 * Réglages de l'application. `includeSecret` faux (par défaut) : seulement les
 * réglages non secrets, ceux qu'un connecteur reçoit dans son contexte.
 */
export function getAppSettings(connector: Connector, options: { includeSecret?: boolean } = {}): Record<string, string> {
  const stored = storedApp(connector);
  const result: Record<string, string> = {};
  for (const setting of connector.app.settings ?? []) {
    if (setting.secret && !options.includeSecret) continue;
    const { value } = settingValue(connector, setting, stored);
    if (value) result[setting.key] = value;
  }
  return result;
}

/** Paramètres à ajouter à l'adresse d'autorisation (réglages marqués `authorizeParam`). */
export function authorizeSettingParams(connector: Connector): Record<string, string> {
  const stored = storedApp(connector);
  const params: Record<string, string> = {};
  for (const setting of connector.app.settings ?? []) {
    if (!setting.authorizeParam || setting.secret) continue;
    const { value } = settingValue(connector, setting, stored);
    if (value) params[typeof setting.authorizeParam === "string" ? setting.authorizeParam : setting.key] = value;
  }
  return params;
}

/** Libellés des réglages obligatoires manquants. */
export function missingAppSettings(connector: Connector): string[] {
  const stored = storedApp(connector);
  return (connector.app.settings ?? []).filter((setting) => setting.required && !settingValue(connector, setting, stored).value).map((setting) => setting.label);
}

/**
 * Preuve dérivée du secret de l'application (HMAC-SHA256 de `value` par le
 * secret, en hexadécimal) : le connecteur signe ses appels sans jamais
 * recevoir le secret.
 */
export function appSecretProof(connector: Connector, value: string): string {
  const app = getAppCredentials(connector);
  if (!app) throw new Error(`L’application ${connector.label} n’est pas configurée.`);
  return createHmac("sha256", app.clientSecret).update(value).digest("hex");
}

export function getAppStatus(connector: Connector): AppStatus {
  const names = envNames(connector);
  let redirect: string | null = null;
  try {
    redirect = redirectUri(connector.id);
  } catch {
    redirect = null;
  }
  const stored = storedApp(connector);
  const settings: AppSettingStatus[] = (connector.app.settings ?? []).map((setting) => {
    const { value, source } = settingValue(connector, setting, stored);
    return {
      key: setting.key,
      label: setting.label,
      help: setting.help,
      required: Boolean(setting.required),
      secret: Boolean(setting.secret),
      envName: setting.env,
      pattern: setting.pattern,
      source,
      ...(value && !setting.secret ? { value } : {}),
    };
  });
  const missing = settings.filter((setting) => setting.required && !setting.source).map((setting) => setting.label);
  const base: AppStatus = { connector: connector.id, configured: false, source: null, envNames: names, redirectUri: redirect, settings };
  const origin = publicBaseUrl();
  if (origin && SIGNED_CALLBACK_CONNECTORS.includes(connector.id)) {
    const prefix = `${origin}/api/connections/${encodeURIComponent(connector.id)}`;
    base.signedCallbacks = { deauthorize: `${prefix}/deauthorize`, dataDeletion: `${prefix}/data-deletion` };
  }
  if (missing.length > 0) base.missingSettings = missing;
  const env = fromEnv(connector);
  if (env) return { ...base, configured: missing.length === 0, source: "env", clientId: env.clientId, updatedAt: stored?.updatedAt };
  if (!stored?.clientId || !stored.secret) return base;
  let unreadable = false;
  try {
    decrypt(stored.secret, appContext(connector.id));
  } catch {
    unreadable = true;
  }
  return {
    ...base,
    configured: !unreadable && missing.length === 0,
    source: "file",
    clientId: stored.clientId,
    secretUnreadable: unreadable || undefined,
    updatedAt: stored.updatedAt,
  };
}

/** Valide et range les réglages saisis ; une valeur vide garde un réglage secret déjà enregistré, et efface un réglage non secret. */
function applySettings(connector: Connector, entry: StoredApp, input: unknown) {
  if (!input || typeof input !== "object") return;
  const values = input as Record<string, unknown>;
  for (const setting of connector.app.settings ?? []) {
    if (!(setting.key in values)) continue;
    const raw = values[setting.key];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value.length > 500) throw new Error(`${setting.label} : 500 caractères au plus.`);
    if (value && setting.pattern && !new RegExp(`^(?:${setting.pattern})$`).test(value)) throw new Error(`${setting.label} : forme invalide.`);
    if (setting.secret) {
      if (!value) continue;
      entry.secretSettings = { ...entry.secretSettings, [setting.key]: encrypt(value, settingContext(connector.id, setting.key)) };
    } else if (value) {
      entry.settings = { ...entry.settings, [setting.key]: value };
    } else if (entry.settings) {
      delete entry.settings[setting.key];
    }
  }
}

/**
 * Enregistre l'application saisie dans l'interface. Un secret vide garde le
 * secret déjà enregistré (pour ne changer que l'identifiant). Quand
 * l'environnement fournit l'application, seuls les réglages se saisissent.
 */
export function saveAppConfig(connectorId: string, input: { clientId?: unknown; clientSecret?: unknown; settings?: unknown }): AppStatus {
  const connector = requireReadyConnector(connectorId);
  const env = fromEnv(connector);
  if (env) {
    if (!input.settings) throw new Error("Cette application est définie par l’environnement du serveur : modifiez-la là.");
    updateStore<AppsFile>("apps", {}, (file) => {
      const entry: StoredApp = { ...file[connector.id], updatedAt: Date.now() };
      applySettings(connector, entry, input.settings);
      file[connector.id] = entry;
    });
    return getAppStatus(connector);
  }
  const clientId = typeof input.clientId === "string" ? input.clientId.trim() : "";
  const clientSecret = typeof input.clientSecret === "string" ? input.clientSecret.trim() : "";
  if (!clientId || clientId.length > 300 || /\s/.test(clientId)) throw new Error("Identifiant du client invalide.");
  if (clientSecret.length > 300 || /\s/.test(clientSecret)) throw new Error("Secret du client invalide.");
  updateStore<AppsFile>("apps", {}, (file) => {
    const existing = file[connector.id];
    if (!clientSecret && !existing?.secret) throw new Error("Le secret du client est obligatoire.");
    const entry: StoredApp = {
      ...existing,
      clientId,
      secret: clientSecret ? encrypt(clientSecret, appContext(connector.id)) : existing!.secret,
      updatedAt: Date.now(),
    };
    applySettings(connector, entry, input.settings);
    file[connector.id] = entry;
  });
  return getAppStatus(connector);
}

export function clearAppConfig(connectorId: string): AppStatus {
  const connector = requireReadyConnector(connectorId);
  updateStore<AppsFile>("apps", {}, (file) => {
    delete file[connector.id];
  });
  return getAppStatus(connector);
}
