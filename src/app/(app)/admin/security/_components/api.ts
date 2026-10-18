/**
 * Ce que l'écran Sécurité lit et envoie : les formes des réponses des routes
 * `/api/admin/security/*`, et une requête JSON qui rend l'erreur du serveur
 * en français, prête à afficher à côté du geste qui l'a provoquée.
 */

import type { DeviceInfo } from "@/lib/security/sessions";
import type { SecurityCheck, SecurityChecksResult } from "@/lib/security/checks";
import type { AlertKind, RateLimitLevel, RateLimitValues, SecuritySection, SecuritySettings } from "@/lib/security/settings-schema";
import type { Log } from "@/lib/types/logs";

export type { SecurityCheck, SecurityChecksResult };

export interface SettingsPayload {
  settings: SecuritySettings;
  defaults: SecuritySettings;
  authMode: "builtin" | "ascencia";
  builtinOnly: SecuritySection[];
  restartRequired: SecuritySection[];
  rateLimitPresets: Record<RateLimitLevel, RateLimitValues>;
}

export interface SessionEntry {
  id: string;
  userId: string;
  user: { id: string; username: string; role: "admin" | "user" } | null;
  device: DeviceInfo;
  ip: string | null;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  current: boolean;
}

export interface AlertEntry {
  id: number;
  kind: AlertKind;
  createdAt: string;
  details: Record<string, string | number | boolean | null | undefined>;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

export interface AlertsPayload {
  alerts: AlertEntry[];
  unacknowledged: number;
}

export type ApiKeyStatus = "active" | "expired" | "orphan";

export interface ApiKeyEntry {
  id: string;
  name: string;
  prefix: string;
  owner: { id: string; username: string } | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  /** Droits de la clé : objet de booléens (`uploadImages`…) ou liste de noms. */
  permissions: Record<string, boolean | undefined> | string[];
  uploadsLastHour: number;
  status: ApiKeyStatus;
}

export type SignInLog = Log;

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues: { path: string; message: string }[] = []
  ) {
    super(message);
    this.name = "RequestError";
  }
}

/** Libellés des champs de réglages, pour un refus du serveur. */
const FIELD_LABELS: Record<string, string> = {
  "passwords.minLength": "Longueur minimale",
  "sessions.maxAgeDays": "Durée d’une session",
  "sessions.refreshHours": "Prolongée toutes les",
  "signIn.maxAttempts": "Échecs avant blocage",
  "signIn.lockMinutes": "Durée du blocage",
  "apiKeys.defaultExpiryDays": "Durée par défaut",
  "apiKeys.maxExpiryDays": "Durée maximale",
  "apiKeys.uploadsPerHour": "Envois par heure",
  "logs.retentionDays": "Conservation",
};

/**
 * Message lisible d'un refus de réglage : le texte du serveur quand il est
 * rédigé en français (règles croisées), sinon le nom du champ refusé.
 */
export function issuesMessage(issues: { path: string; message: string }[]): string {
  return issues
    .map((issue) => {
      if (/[À-ÿ’]/.test(issue.message)) return issue.message;
      const label = FIELD_LABELS[issue.path];
      return label ? `« ${label} » : valeur refusée.` : "Une valeur a été refusée.";
    })
    .join(" ");
}

/** Requête JSON ; une erreur porte le message du serveur, en français. */
export async function requestJson<T>(url: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "GET",
      headers: init.json === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
      cache: "no-store",
    });
  } catch {
    throw new RequestError("Le serveur ne répond pas. Vérifiez la connexion, puis réessayez.", 0);
  }
  const body = (await response.json().catch(() => null)) as { error?: unknown; issues?: { path: string; message: string }[] } | null;
  if (!response.ok) {
    const issues = Array.isArray(body?.issues) ? body.issues : [];
    const message = issues.length
      ? issuesMessage(issues)
      : typeof body?.error === "string" && body.error
        ? body.error
        : response.status === 403
          ? "Réservé aux administrateurs."
          : response.status === 404
            ? "Introuvable : la liste a peut-être changé entre-temps."
            : "La demande a échoué. Réessayez dans un instant.";
    throw new RequestError(message, response.status, issues);
  }
  return body as T;
}
