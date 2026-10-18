/**
 * Points de contrôle de l'écran Sécurité : ce que l'instance fait bien, ce
 * qui est à revoir, ce qui pose problème. Chaque point est calculé sur des
 * faits lus au moment de la demande (variables d'environnement, droits des
 * fichiers, comptes, clés API, réglages, alertes), jamais sur une valeur
 * supposée.
 *
 * Aucune valeur secrète ne sort d'ici : pour `AUTH_SECRET`, seule sa
 * longueur est jugée, et le texte ne dit que « assez long » ou « trop
 * court ».
 *
 * Le calcul (`computeSecurityChecks`) est pur et se teste sous Node. La
 * collecte (`gatherSecurityChecks`) charge à la demande ce qui dépend de
 * `bun:sqlite` ou de better-auth.
 */

import fs from "fs";
import path from "path";
import type { SecuritySettings } from "./settings-schema";

export type CheckGroup = "access" | "files" | "keys" | "server";
export type CheckStatus = "ok" | "warning" | "problem" | "info";

/** Onglets de l'écran vers lesquels un point peut renvoyer. */
export type SecurityTabId = "overview" | "sessions" | "keys" | "sign-in" | "rules";

export interface SecurityCheck {
  id: string;
  group: CheckGroup;
  status: CheckStatus;
  title: string;
  detail: string;
  action?: { label: string; tab?: SecurityTabId; href?: string };
}

export interface SecurityChecksResult {
  checks: SecurityCheck[];
  checkedAt: string;
}

export interface ApiKeySummary {
  total: number;
  noExpiry: number;
  /** Ni utilisée ni créée depuis 90 jours (les expirées ne comptent pas). */
  inactive: number;
  orphan: number;
  expired: number;
}

export interface CheckInput {
  platform: NodeJS.Platform | string;
  authMode: "builtin" | "ascencia";
  /** Longueur d'`AUTH_SECRET`, jamais sa valeur. 0 s'il est absent. */
  authSecretLength: number;
  authUrl: string | null;
  /** Rôles Ascencia ID qui donnent l'administration (mode « ascencia » seulement). */
  ascenciaAdminRoles: string[] | null;
  /** D'où vient la clé de chiffrement des jetons et des secrets des modules. */
  encryptionKeySource: "env" | "auth-secret" | null;
  /** `null` : la base des comptes n'a pas pu être lue. */
  admins: number | null;
  apiKeys: ApiKeySummary | null;
  settings: SecuritySettings;
  /** `null` : la base des alertes n'a pas pu être lue. */
  unacknowledgedAlerts: number | null;
  /** Droits du dossier de données ; `null` sous Windows, où ils n'existent pas. */
  permissions: { dataDirLoose: boolean; looseFiles: string[] } | null;
  /** Fonctions de module ouvertes sans connexion, par module activé. */
  publicFunctions: { module: string; functions: string[] }[];
}

export const MIN_AUTH_SECRET_LENGTH = 32;
export const MAX_ADMINS = 5;
export const INACTIVE_KEY_DAYS = 90;
const DAY_MS = 86_400_000;

const STATUS_ORDER: Record<CheckStatus, number> = { problem: 0, warning: 1, info: 2, ok: 3 };

/** Problèmes d'abord, puis ce qui est à revoir, les informations, et ce qui va bien. */
export function compareChecks(a: SecurityCheck, b: SecurityCheck): number {
  return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
}

const plural = (count: number, one: string, many: string) => `${count.toLocaleString("fr-FR")} ${count > 1 ? many : one}`;

function durationDays(days: number): string {
  if (days % 365 === 0) return days === 365 ? "un an" : `${days / 365} ans`;
  return plural(days, "jour", "jours");
}

const LEVEL_LABELS: Record<SecuritySettings["rateLimits"]["level"], string> = {
  relaxed: "souple",
  normal: "normal",
  strict: "strict",
};

const IMAGE_VIEW_LABELS: Record<SecuritySettings["logs"]["imageViews"], string> = {
  all: "chaque affichage d’image est noté",
  sampled: "un affichage d’image sur vingt est noté",
  off: "les affichages d’images ne sont pas notés",
};

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]" || hostname.endsWith(".localhost");
}

/** Tous les points de contrôle, dans l'ordre des groupes puis de gravité. */
export function computeSecurityChecks(input: CheckInput): SecurityCheck[] {
  const checks: SecurityCheck[] = [];
  const add = (check: SecurityCheck) => checks.push(check);
  const { settings } = input;

  // ─── Accès ────────────────────────────────────────────────────────

  if (input.authSecretLength === 0) {
    add({
      id: "auth-secret",
      group: "access",
      status: "problem",
      title: "Secret d’authentification absent",
      detail: "AUTH_SECRET n’est pas défini : les sessions ne peuvent pas être signées de façon sûre. Générez une valeur aléatoire d’au moins 32 caractères.",
    });
  } else if (input.authSecretLength < MIN_AUTH_SECRET_LENGTH) {
    add({
      id: "auth-secret",
      group: "access",
      status: "problem",
      title: "Secret d’authentification trop court",
      detail: `AUTH_SECRET fait moins de ${MIN_AUTH_SECRET_LENGTH} caractères. Remplacez-le par une valeur aléatoire plus longue ; les sessions ouvertes seront fermées.`,
    });
  } else {
    add({
      id: "auth-secret",
      group: "access",
      status: "ok",
      title: "Secret d’authentification assez long",
      detail: `AUTH_SECRET fait au moins ${MIN_AUTH_SECRET_LENGTH} caractères.`,
    });
  }

  let authUrl: URL | null = null;
  try {
    authUrl = input.authUrl ? new URL(input.authUrl) : null;
  } catch {
    authUrl = null;
  }
  if (!authUrl) {
    add({
      id: "auth-url",
      group: "access",
      status: "warning",
      title: input.authUrl ? "Adresse publique illisible" : "Adresse publique non définie",
      detail: "AUTH_URL doit donner l’adresse publique de l’instance, en https : elle sert aux cookies de session et aux retours de connexion.",
    });
  } else if (authUrl.protocol === "https:") {
    add({
      id: "auth-url",
      group: "access",
      status: "ok",
      title: "Adresse publique en https",
      detail: `Les cookies de session ne circulent que chiffrés (${authUrl.host}).`,
    });
  } else if (isLocalHost(authUrl.hostname)) {
    add({
      id: "auth-url",
      group: "access",
      status: "info",
      title: "Adresse locale en http",
      detail: `AUTH_URL pointe sur ${authUrl.host} : acceptable sur ce poste, pas pour une instance ouverte sur Internet.`,
    });
  } else {
    add({
      id: "auth-url",
      group: "access",
      status: "problem",
      title: "Adresse publique en http",
      detail: `AUTH_URL utilise http (${authUrl.host}) : les cookies de session circulent en clair. Passez l’instance en https.`,
    });
  }

  add({
    id: "auth-mode",
    group: "access",
    status: "info",
    title: input.authMode === "ascencia" ? "Connexion par Ascencia ID" : "Comptes propres à l’instance",
    detail:
      input.authMode === "ascencia"
        ? "Mots de passe, double authentification et blocage relèvent du fournisseur d’identité."
        : `Mots de passe d’au moins ${settings.passwords.minLength} caractères${settings.passwords.rejectCommon ? ", mots de passe courants refusés" : ""} ; blocage après ${plural(settings.signIn.maxAttempts, "échec", "échecs")} pendant ${plural(settings.signIn.lockMinutes, "minute", "minutes")}.`,
    action: { label: "Connexion", tab: "sign-in" },
  });

  if (input.admins === null) {
    add({
      id: "admins",
      group: "access",
      status: "warning",
      title: "Administrateurs non comptés",
      detail: "La base des comptes n’a pas pu être lue.",
      action: { label: "Comptes", href: "/admin/users" },
    });
  } else if (input.admins === 0) {
    add({
      id: "admins",
      group: "access",
      status: "warning",
      title: "Aucun administrateur",
      detail: input.authMode === "ascencia" ? "Aucun compte n’a encore reçu le rôle d’administration par Ascencia ID." : "Aucun compte n’a le rôle d’administrateur.",
      action: { label: "Comptes", href: "/admin/users" },
    });
  } else if (input.admins > MAX_ADMINS) {
    add({
      id: "admins",
      group: "access",
      status: "warning",
      title: `${plural(input.admins, "administrateur", "administrateurs")}`,
      detail: `Au-delà de ${MAX_ADMINS}, chaque compte administrateur de plus est une porte d’entrée de plus. Retirez le rôle à ceux qui n’en ont pas l’usage.`,
      action: { label: "Comptes", href: "/admin/users" },
    });
  } else {
    add({
      id: "admins",
      group: "access",
      status: "ok",
      title: plural(input.admins, "administrateur", "administrateurs"),
      detail: "Un nombre restreint de comptes peut tout régler.",
      action: { label: "Comptes", href: "/admin/users" },
    });
  }

  if (input.authMode === "ascencia" && input.ascenciaAdminRoles) {
    const roles = input.ascenciaAdminRoles;
    const broad = roles.includes("authorized");
    add({
      id: "ascencia-admin-roles",
      group: "access",
      status: broad ? "warning" : "ok",
      title: broad ? "Administration ouverte à tout compte autorisé" : "Rôle d’administration dédié",
      detail: broad
        ? "ASCENCIA_ADMIN_ROLES contient « authorized » : tout compte autorisé à se connecter devient administrateur. Réservez l’administration à un rôle dédié."
        : `L’administration est donnée par ${roles.length > 1 ? "les rôles" : "le rôle"} ${roles.map((role) => `« ${role} »`).join(", ")}.`,
    });
  }

  add({
    id: "sessions",
    group: "access",
    status: settings.sessions.maxAgeDays > 30 ? "warning" : "info",
    title: `Sessions de ${durationDays(settings.sessions.maxAgeDays)}`,
    detail:
      settings.sessions.maxAgeDays > 30
        ? `Une session reste ouverte jusqu’à ${durationDays(settings.sessions.maxAgeDays)} sans nouvelle connexion : un appareil perdu le reste aussi longtemps.`
        : `Une session est prolongée toutes les ${plural(settings.sessions.refreshHours, "heure", "heures")} d’activité.`,
    action: { label: "Sessions", tab: "sessions" },
  });

  // ─── Fichiers ─────────────────────────────────────────────────────

  if (!input.permissions) {
    add({
      id: "data-permissions",
      group: "files",
      status: "info",
      title: "Droits des fichiers non vérifiables sous Windows",
      detail: "Les droits POSIX n’existent pas sur ce système : seul l’accès au compte Windows protège le dossier data.",
    });
  } else if (input.permissions.dataDirLoose || input.permissions.looseFiles.length > 0) {
    const parts = [
      input.permissions.dataDirLoose ? "le dossier data est lisible par d’autres comptes" : null,
      input.permissions.looseFiles.length ? `${input.permissions.looseFiles.join(", ")} ${input.permissions.looseFiles.length > 1 ? "sont lisibles" : "est lisible"} par d’autres comptes` : null,
    ].filter(Boolean);
    add({
      id: "data-permissions",
      group: "files",
      status: "warning",
      title: "Fichiers sensibles trop ouverts",
      detail: `${parts.join(" ; ")}. Ils sont resserrés au démarrage du serveur (dossier en 0700, fichiers en 0600) quand le compte du serveur en est propriétaire.`,
    });
  } else {
    add({
      id: "data-permissions",
      group: "files",
      status: "ok",
      title: "Fichiers sensibles protégés",
      detail: "Dossier data en 0700, clés, historique et bases en 0600.",
    });
  }

  if (input.encryptionKeySource === "env") {
    add({
      id: "encryption-key",
      group: "files",
      status: "ok",
      title: "Clé de chiffrement dédiée",
      detail: "Les jetons des comptes connectés et les secrets des modules sont chiffrés avec CONNECTIONS_ENCRYPTION_KEY(S), indépendante d’AUTH_SECRET.",
    });
  } else if (input.encryptionKeySource === "auth-secret") {
    add({
      id: "encryption-key",
      group: "files",
      status: "warning",
      title: "Clé de chiffrement tirée d’AUTH_SECRET",
      detail: "Changer AUTH_SECRET rendrait illisibles les jetons des comptes connectés et les secrets des modules. Définissez CONNECTIONS_ENCRYPTION_KEY pour les en séparer.",
    });
  } else {
    add({
      id: "encryption-key",
      group: "files",
      status: "problem",
      title: "Aucune clé de chiffrement",
      detail: "Ni CONNECTIONS_ENCRYPTION_KEY(S) ni AUTH_SECRET : les secrets des modules restent en clair sur le disque.",
    });
  }

  // ─── Clés API ─────────────────────────────────────────────────────

  if (settings.apiKeys.defaultExpiryDays === null) {
    add({
      id: "keys-default-expiry",
      group: "keys",
      status: "warning",
      title: "Nouvelles clés sans expiration",
      detail: "Une clé créée sans date choisie reste valable indéfiniment.",
      action: { label: "Règles des clés", tab: "keys" },
    });
  } else {
    add({
      id: "keys-default-expiry",
      group: "keys",
      status: "ok",
      title: `Nouvelles clés valables ${durationDays(settings.apiKeys.defaultExpiryDays)}`,
      detail:
        settings.apiKeys.maxExpiryDays === null
          ? "Sans durée maximale : une clé peut encore être créée sans expiration."
          : `Au plus ${durationDays(settings.apiKeys.maxExpiryDays)}, ${settings.apiKeys.uploadsPerHour.toLocaleString("fr-FR")} envois par heure et par clé.`,
      action: { label: "Règles des clés", tab: "keys" },
    });
  }

  const keys = input.apiKeys;
  if (!keys) {
    add({ id: "keys", group: "keys", status: "warning", title: "Clés API non lues", detail: "Le fichier des clés n’a pas pu être lu.", action: { label: "Clés API", tab: "keys" } });
  } else if (keys.total === 0) {
    add({ id: "keys", group: "keys", status: "ok", title: "Aucune clé API", detail: "Aucun accès par clé n’est ouvert sur cette instance." });
  } else {
    if (keys.orphan > 0) {
      add({
        id: "keys-orphan",
        group: "keys",
        status: "problem",
        title: plural(keys.orphan, "clé sans propriétaire", "clés sans propriétaire"),
        detail: "Leur compte a été supprimé, mais elles permettent toujours d’envoyer des fichiers. Révoquez-les.",
        action: { label: "Voir les clés", tab: "keys" },
      });
    }
    add({
      id: "keys-no-expiry",
      group: "keys",
      status: keys.noExpiry > 0 ? "warning" : "ok",
      title: keys.noExpiry > 0 ? plural(keys.noExpiry, "clé sans expiration", "clés sans expiration") : "Toutes les clés expirent",
      detail: keys.noExpiry > 0 ? "Une clé qui fuit reste valable tant qu’elle n’est pas révoquée à la main." : `${plural(keys.total, "clé", "clés")}, chacune avec une date de fin.`,
      action: keys.noExpiry > 0 ? { label: "Voir les clés", tab: "keys" } : undefined,
    });
    if (keys.inactive > 0) {
      add({
        id: "keys-inactive",
        group: "keys",
        status: "warning",
        title: plural(keys.inactive, `clé inutilisée depuis ${INACTIVE_KEY_DAYS} jours`, `clés inutilisées depuis ${INACTIVE_KEY_DAYS} jours`),
        detail: "Une clé dont personne ne se sert n’a plus de raison d’être valable.",
        action: { label: "Voir les clés", tab: "keys" },
      });
    }
    if (keys.expired > 0) {
      add({
        id: "keys-expired",
        group: "keys",
        status: "info",
        title: plural(keys.expired, "clé expirée", "clés expirées"),
        detail: "Elles sont déjà refusées ; les supprimer allège la liste.",
        action: { label: "Voir les clés", tab: "keys" },
      });
    }
  }

  // ─── Serveur ──────────────────────────────────────────────────────

  if (input.unacknowledgedAlerts === null) {
    add({ id: "alerts", group: "server", status: "warning", title: "Alertes non lues", detail: "La base des alertes n’a pas pu être lue." });
  } else if (input.unacknowledgedAlerts > 0) {
    add({
      id: "alerts",
      group: "server",
      status: "warning",
      title: plural(input.unacknowledgedAlerts, "alerte à voir", "alertes à voir"),
      detail: "Elles attendent dans le panneau Alertes, à droite ou plus bas.",
    });
  } else {
    add({ id: "alerts", group: "server", status: "ok", title: "Aucune alerte en attente", detail: "Toutes les alertes ont été vues." });
  }

  add({
    id: "rate-limits",
    group: "server",
    status: "info",
    title: `Limites de débit au niveau ${LEVEL_LABELS[settings.rateLimits.level]}`,
    detail: "Envois par clé, affichages d’images et appels de l’API publique par adresse.",
    action: { label: "Règles", tab: "rules" },
  });

  add({
    id: "logs",
    group: "server",
    status: "info",
    title: `Journaux gardés ${durationDays(settings.logs.retentionDays)}`,
    detail: `Au-delà, ils sont effacés ; ${IMAGE_VIEW_LABELS[settings.logs.imageViews]}.`,
    action: { label: "Règles", tab: "rules" },
  });

  const publicCount = input.publicFunctions.reduce((sum, entry) => sum + entry.functions.length, 0);
  add({
    id: "public-functions",
    group: "server",
    status: "info",
    title: publicCount ? plural(publicCount, "fonction de module ouverte à tous", "fonctions de module ouvertes à tous") : "Aucune fonction de module ouverte à tous",
    detail: publicCount
      ? `Appelables sans connexion : ${input.publicFunctions.map((entry) => `${entry.module} (${entry.functions.join(", ")})`).join(" ; ")}.`
      : "Les modules activés ne répondent qu’aux comptes connectés.",
    action: publicCount ? { label: "Modules", href: "/admin/modules" } : undefined,
  });

  return checks;
}

// ─── Collecte ─────────────────────────────────────────────────────

interface StoredApiKey {
  id?: string;
  createdAt?: string;
  expiresAt?: string | null;
  createdBy?: string;
  lastUsed?: string;
}

/** Comptage des clés API ; `userIds` : comptes existants, pour repérer les clés orphelines. */
export function summarizeApiKeys(keys: StoredApiKey[], userIds: Set<string> | null, now = Date.now()): ApiKeySummary {
  const summary: ApiKeySummary = { total: keys.length, noExpiry: 0, inactive: 0, orphan: 0, expired: 0 };
  for (const key of keys) {
    const expired = Boolean(key.expiresAt) && new Date(key.expiresAt!).getTime() <= now;
    if (expired) summary.expired += 1;
    if (!key.expiresAt) summary.noExpiry += 1;
    // Même règle que l'écran des clés : une clé encore valide sans compte existant (« system » compris) est orpheline.
    if (!expired && userIds && !(key.createdBy && userIds.has(key.createdBy))) summary.orphan += 1;
    const lastSeen = new Date(key.lastUsed ?? key.createdAt ?? 0).getTime();
    if (!expired && Number.isFinite(lastSeen) && now - lastSeen > INACTIVE_KEY_DAYS * DAY_MS) summary.inactive += 1;
  }
  return summary;
}

const dataDir = () => path.join(/* turbopackIgnore: true */ process.cwd(), "data");

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

/** Droits du dossier de données et des fichiers sensibles (systèmes POSIX). */
async function readPermissions(): Promise<CheckInput["permissions"]> {
  if (process.platform === "win32") return null;
  const { PRIVATE_DATA_FILES } = await import("./data-files");
  const dir = dataDir();
  let dataDirLoose = false;
  try {
    dataDirLoose = (fs.statSync(dir).mode & 0o077) !== 0;
  } catch {
    dataDirLoose = false;
  }
  const looseFiles = PRIVATE_DATA_FILES.filter((name) => {
    try {
      return (fs.statSync(path.join(dir, name)).mode & 0o077) !== 0;
    } catch {
      return false;
    }
  });
  return { dataDirLoose, looseFiles: [...looseFiles] };
}

/** Fonctions déclarées `public` des modules activés (module.json, surchargé par data/modules-state.json). */
function readPublicFunctions(): CheckInput["publicFunctions"] {
  const modulesDir = path.join(/* turbopackIgnore: true */ process.cwd(), "modules");
  const state = readJson<Record<string, { enabled?: boolean }>>(path.join(dataDir(), "modules-state.json"), {});
  let names: string[] = [];
  try {
    names = fs.readdirSync(modulesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
  const result: CheckInput["publicFunctions"] = [];
  for (const name of names.sort()) {
    const config = readJson<{ name?: string; enabled?: boolean; functions?: Record<string, string> } | null>(path.join(modulesDir, name, "module.json"), null);
    if (!config?.functions) continue;
    const moduleName = config.name ?? name;
    const enabled = state[moduleName]?.enabled ?? config.enabled ?? false;
    if (!enabled) continue;
    const functions = Object.entries(config.functions)
      .filter(([, access]) => access === "public")
      .map(([fn]) => fn);
    if (functions.length) result.push({ module: moduleName, functions });
  }
  return result;
}

/** Lit l'état de l'instance et calcule les points de contrôle. */
export async function gatherSecurityChecks(): Promise<SecurityChecksResult> {
  const env = process.env;
  const [{ resolveAuthProvider }, { getSecuritySettings }, { keySource }] = await Promise.all([
    import("@/lib/auth-config"),
    import("./settings"),
    import("@/lib/connections/crypto"),
  ]);

  let authMode: CheckInput["authMode"] = "builtin";
  try {
    authMode = resolveAuthProvider(env.SHAREX_AUTH_PROVIDER);
  } catch {
    authMode = "builtin";
  }

  let users: { id: string; role?: string | null }[] | null = null;
  try {
    const { listAppUsers } = await import("@/lib/admin-users");
    users = await listAppUsers();
  } catch (error) {
    console.error("[security/checks] comptes illisibles :", error instanceof Error ? error.message : error);
  }

  let unacknowledgedAlerts: number | null = null;
  try {
    const { listAlerts } = await import("./alerts-store");
    unacknowledgedAlerts = listAlerts({ limit: 1 }).unacknowledged;
  } catch (error) {
    console.error("[security/checks] alertes illisibles :", error instanceof Error ? error.message : error);
  }

  let apiKeys: ApiKeySummary | null = null;
  try {
    const { readStoredApiKeys } = await import("@/lib/api-key-store");
    apiKeys = summarizeApiKeys(await readStoredApiKeys(), users ? new Set(users.map((user) => user.id)) : null);
  } catch (error) {
    console.error("[security/checks] clés API illisibles :", error instanceof Error ? error.message : error);
  }

  const adminRoles =
    authMode === "ascencia"
      ? (env.ASCENCIA_ADMIN_ROLES ?? "superadmin")
          .split(",")
          .map((role) => role.trim())
          .filter(Boolean)
      : null;

  const source = keySource();
  const input: CheckInput = {
    platform: process.platform,
    authMode,
    authSecretLength: env.AUTH_SECRET?.length ?? 0,
    authUrl: env.AUTH_URL?.trim() || null,
    ascenciaAdminRoles: adminRoles,
    encryptionKeySource: source === "env" ? "env" : source ? "auth-secret" : null,
    admins: users ? users.filter((user) => user.role === "admin").length : null,
    apiKeys,
    settings: getSecuritySettings(),
    unacknowledgedAlerts,
    permissions: await readPermissions(),
    publicFunctions: readPublicFunctions(),
  };

  return { checks: computeSecurityChecks(input), checkedAt: new Date().toISOString() };
}
