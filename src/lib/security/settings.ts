/**
 * Réglages de sécurité de l'instance : `data/security.json`.
 *
 * Fichier en 0600 dans un dossier en 0700, écrit par fichier temporaire puis
 * renommage (comme `lib/connections/store.ts`) : une coupure ne laisse jamais
 * un JSON tronqué. Un fichier absent ou illisible donne les valeurs par
 * défaut, qui sont sûres ; un champ invalide reprend sa valeur par défaut
 * sans emporter les autres.
 *
 * La lecture est mise en cache et ne relit le disque que si la date de
 * modification du fichier a changé : les getters peuvent être appelés à
 * chaque requête.
 */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import {
  defaultSecuritySettings,
  mergeSecuritySettings,
  rateLimitValues,
  SECURITY_SECTIONS,
  securitySettingsSchema,
  type AlertKind,
  type RateLimitValues,
  type SecuritySettings,
} from "./settings-schema";

export * from "./settings-schema";

let pathOverride: string | null = null;

/** Déplace le fichier ailleurs, pour les tests. `null` rétablit l'emplacement normal. */
export function setSecuritySettingsPath(file: string | null) {
  pathOverride = file;
  cache = null;
}

export function securitySettingsPath(): string {
  return pathOverride ?? path.join(/* turbopackIgnore: true */ process.cwd(), "data", "security.json");
}

let cache: { file: string; mtimeMs: number; settings: SecuritySettings } | null = null;

/**
 * Valide section par section : un champ refusé (valeur écrite à la main hors
 * bornes) reprend la valeur par défaut de sa section, le reste est conservé.
 */
export function normalizeSecuritySettings(raw: unknown): SecuritySettings {
  const full = securitySettingsSchema.safeParse(raw ?? {});
  if (full.success) return full.data;

  const defaults = defaultSecuritySettings();
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const result: Record<string, unknown> = {};
  for (const section of SECURITY_SECTIONS) {
    const sectionSchema = securitySettingsSchema.shape[section];
    const parsed = sectionSchema.safeParse(input[section]);
    result[section] = parsed.success ? parsed.data : defaults[section];
  }
  return result as SecuritySettings;
}

/** Réglages complets, depuis le cache tant que le fichier n'a pas bougé. */
export function getSecuritySettings(): SecuritySettings {
  const file = securitySettingsPath();
  let mtimeMs = -1;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    // Pas de fichier : valeurs par défaut.
  }
  if (cache && cache.file === file && cache.mtimeMs === mtimeMs) return cache.settings;

  let raw: unknown = {};
  if (mtimeMs >= 0) {
    try {
      raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch (error) {
      console.error("[security] data/security.json illisible, valeurs par défaut appliquées :", error);
      raw = {};
    }
  }
  const settings = normalizeSecuritySettings(raw);
  cache = { file, mtimeMs, settings };
  return settings;
}

export class SecuritySettingsError extends Error {
  constructor(public readonly issues: { path: string; message: string }[]) {
    super(issues.map((issue) => `${issue.path} : ${issue.message}`).join(" ; "));
    this.name = "SecuritySettingsError";
  }
}

function writeAtomic(file: string, content: string) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(temporary, content, { mode: 0o600 });
    fs.renameSync(temporary, file);
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      // Systèmes de fichiers sans droits POSIX (Windows) : sans effet.
    }
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

/**
 * Applique une modification partielle et l'enregistre. Rien n'est écrit si
 * un champ est refusé : l'erreur liste les champs en cause.
 */
export function updateSecuritySettings(patch: unknown): SecuritySettings {
  const merged = mergeSecuritySettings(getSecuritySettings(), patch);
  const parsed = securitySettingsSchema.safeParse(merged);
  if (!parsed.success) {
    throw new SecuritySettingsError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
    );
  }
  const file = securitySettingsPath();
  writeAtomic(file, `${JSON.stringify(parsed.data, null, 2)}\n`);
  cache = null;
  return getSecuritySettings();
}

// ─── Getters ──────────────────────────────────────────────────────

export const getPasswordSettings = () => getSecuritySettings().passwords;
export const getSessionSettings = () => getSecuritySettings().sessions;
export const getSignInSettings = () => getSecuritySettings().signIn;
export const getApiKeySettings = () => getSecuritySettings().apiKeys;
export const getLogSettings = () => getSecuritySettings().logs;
export const getAlertSettings = () => getSecuritySettings().alerts;

/** Limites concrètes du niveau choisi dans l'écran. */
export function getRateLimits(): RateLimitValues {
  const settings = getSecuritySettings();
  const preset = rateLimitValues(settings.rateLimits.level);
  // La limite propre aux clés API ne peut que resserrer celle du niveau.
  return {
    ...preset,
    uploadsPerKeyPerHour: Math.min(preset.uploadsPerKeyPerHour, settings.apiKeys.uploadsPerHour),
  };
}

export function isAlertEnabled(kind: AlertKind): boolean {
  return getSecuritySettings().alerts[kind];
}

/** Durées de session en secondes, au format attendu par better-auth. */
export function sessionDurations(settings = getSessionSettings()) {
  return {
    expiresIn: settings.maxAgeDays * 24 * 60 * 60,
    updateAge: settings.refreshHours * 60 * 60,
  };
}

/**
 * Date d'expiration d'une nouvelle clé API : la durée demandée, bornée par la
 * durée maximale ; sans durée demandée, la durée par défaut. `null` : sans
 * expiration (seulement si aucune durée maximale n'est fixée).
 */
export function apiKeyExpiry(requestedDays: number | null | undefined, now = new Date()): Date | null {
  const { defaultExpiryDays, maxExpiryDays } = getApiKeySettings();
  let days = requestedDays === undefined ? defaultExpiryDays : requestedDays;
  if (maxExpiryDays !== null) days = days === null ? maxExpiryDays : Math.min(days, maxExpiryDays);
  if (days === null) return null;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}
