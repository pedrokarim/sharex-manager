"use client";

/**
 * Ressources de l'écran Sécurité, une par route. Les clés sont partagées :
 * l'en-tête et l'onglet État lisent les mêmes points de contrôle, tous les
 * onglets de réglages le même fichier de réglages.
 */

import type { LogAction } from "@/lib/types/logs";
import {
  requestJson,
  type AlertsPayload,
  type ApiKeyEntry,
  type SecurityChecksResult,
  type SessionEntry,
  type SettingsPayload,
  type SignInLog,
} from "./api";
import { useResource } from "./resource";

export const SETTINGS_URL = "/api/admin/security/settings";

export function useSettings() {
  return useResource("settings", () => requestJson<SettingsPayload>(SETTINGS_URL), { fallback: "Les réglages n’ont pas pu être lus." });
}

export function useChecks(options: { auto?: boolean } = {}) {
  return useResource("checks", () => requestJson<SecurityChecksResult>("/api/admin/security/checks"), {
    ...options,
    fallback: "Les points de contrôle n’ont pas pu être calculés.",
  });
}

/** Alertes non vues, les cinquante plus récentes. */
export function useAlerts(options: { auto?: boolean } = {}) {
  return useResource("alerts", () => requestJson<AlertsPayload>("/api/admin/security/alerts?limit=50"), { ...options, fallback: "Les alertes n’ont pas pu être lues." });
}

export function useSessions() {
  return useResource("sessions", () => requestJson<{ sessions: SessionEntry[] }>("/api/admin/security/sessions").then((body) => body.sessions), {
    fallback: "Les sessions n’ont pas pu être lues.",
  });
}

export function useApiKeys() {
  return useResource("api-keys", () => requestJson<{ keys: ApiKeyEntry[] }>("/api/admin/security/api-keys").then((body) => body.keys), {
    fallback: "Les clés API n’ont pas pu être lues.",
  });
}

/** Actions du journal qui forment le journal des connexions. */
export const SIGN_IN_ACTIONS = ["auth.login", "auth.login.failed", "auth.login.blocked", "auth.logout"] as const satisfies readonly LogAction[];

/** Entrées gardées par résultat : assez pour plusieurs pages, sans tout le journal. */
const SIGN_IN_LIMIT = 200;

/** Les quatre sortes d'entrées, lues ensemble puis fusionnées de la plus récente à la plus ancienne. */
export async function loadSignInJournal(): Promise<SignInLog[]> {
  const lists = await Promise.all(
    SIGN_IN_ACTIONS.map((action) => requestJson<SignInLog[]>(`/api/admin/logs?action=${encodeURIComponent(action)}&limit=${SIGN_IN_LIMIT}`))
  );
  return lists.flat().sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.id - a.id);
}

export function useSignInJournal() {
  return useResource("sign-in", loadSignInJournal, { fallback: "Le journal des connexions n’a pas pu être lu." });
}
