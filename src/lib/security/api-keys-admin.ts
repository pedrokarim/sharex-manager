/**
 * Vue des clés API pour l'écran Sécurité : propriétaire, état, envois de la
 * dernière heure. Jamais d'empreinte ni de clé : seulement le préfixe
 * d'affichage.
 *
 * Fonction pure (les données sont passées en paramètre) : elle se teste sous
 * Node sans base ni fichier.
 */

import type { ApiKey, ApiKeyPermissions } from "@/types/api-key";
import type { HistoryEntry } from "@/lib/types/history";
import { isApiKeyExpired } from "@/lib/api-key-store";

export type AdminApiKeyStatus = "active" | "expired" | "orphan";

export interface AdminApiKeyView {
  id: string;
  name: string;
  prefix: string;
  owner: { id: string; username: string } | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  permissions: ApiKeyPermissions;
  uploadsLastHour: number;
  status: AdminApiKeyStatus;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Une clé expirée l'est quel que soit son propriétaire ; une clé encore
 * valide dont le compte n'existe plus (ou créée par « system ») est
 * « orpheline » : elle fonctionne toujours, l'admin peut la révoquer.
 */
export function buildAdminApiKeyList(
  keys: ApiKey[],
  users: Record<string, { id: string; username: string }>,
  history: HistoryEntry[],
  now = new Date()
): AdminApiKeyView[] {
  const since = now.getTime() - HOUR_MS;
  const recent = new Map<string, number>();
  for (const entry of history) {
    if (!entry.userId || entry.uploadMethod !== "api") continue;
    const time = new Date(entry.uploadDate).getTime();
    if (Number.isNaN(time) || time < since || time > now.getTime()) continue;
    recent.set(entry.userId, (recent.get(entry.userId) ?? 0) + 1);
  }

  return keys.map((key) => {
    const user = users[key.createdBy];
    const owner = user ? { id: user.id, username: user.username } : null;
    const status: AdminApiKeyStatus = isApiKeyExpired(key, now) ? "expired" : owner ? "active" : "orphan";
    return {
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      owner,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsed ?? null,
      expiresAt: key.expiresAt ?? null,
      permissions: {
        uploadImages: key.permissions?.uploadImages === true,
        uploadText: key.permissions?.uploadText === true,
        uploadFiles: key.permissions?.uploadFiles === true,
        extractColors: key.permissions?.extractColors === true,
      },
      uploadsLastHour: recent.get(key.id) ?? 0,
      status,
    };
  });
}
