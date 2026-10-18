/**
 * Validation des clés API : la seule, utilisée par `/api/upload` comme par
 * `/api/colors`.
 *
 * La clé présentée est comparée par empreinte SHA-256, à temps constant
 * (`lib/api-key-store.ts`). Une clé inconnue, expirée ou sans la permission
 * demandée est refusée de la même façon : l'appelant ne dit pas laquelle des
 * trois.
 */

import type { ApiKey, ApiKeyPermission } from "@/types/api-key";
import { logDb } from "@/lib/utils/db";
import { displayPrefix, findApiKeyBySecret, isApiKeyExpired, loadApiKeys, touchApiKey } from "@/lib/api-key-store";

export const API_KEY_HEADER = "x-api-key";

function log(entry: Parameters<typeof logDb.createLog>[0]) {
  try {
    logDb.createLog(entry);
  } catch {
    // Journal indisponible : la validation n'en dépend pas.
  }
}

/** Permissions exigées pour envoyer ce fichier, d'après son extension. */
export function permissionsForFile(filename: string): ApiKeyPermission[] {
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(filename)) return ["uploadImages"];
  if (/\.(pdf|doc|docx|txt)$/i.test(filename)) return ["uploadText"];
  // Archive, vidéo ou autre : un fichier comme un autre.
  return ["uploadFiles"];
}

/**
 * Clé existante et non expirée, sans contrôle de permission ni écriture :
 * le contrôle rapide fait avant de lire le corps d'un envoi.
 */
export async function findActiveApiKey(secret: string | null | undefined): Promise<ApiKey | null> {
  if (!secret) return null;
  const key = findApiKeyBySecret(await loadApiKeys(), secret);
  return key && !isApiKeyExpired(key) ? key : null;
}

/**
 * Valide une clé et ses permissions. Renvoie la clé (avec `lastUsed` à jour)
 * si elle convient, `null` sinon.
 */
export async function validateApiKey(
  secret: string | null | undefined,
  required: ApiKeyPermission[] = [],
  context: Record<string, unknown> = {}
): Promise<ApiKey | null> {
  if (!secret) return null;
  try {
    const key = findApiKeyBySecret(await loadApiKeys(), secret);
    if (!key) {
      log({
        level: "warning",
        action: "api.request",
        message: "Tentative d'utilisation d'une clé API inexistante",
        metadata: { apiKey: `${displayPrefix(secret)}…`, ...context },
      });
      return null;
    }

    if (isApiKeyExpired(key)) {
      log({
        level: "warning",
        action: "api.request",
        message: "Tentative d'utilisation d'une clé API expirée",
        userId: key.id,
        metadata: { keyName: key.name, expiresAt: key.expiresAt, ...context },
      });
      return null;
    }

    const missing = required.filter((permission) => key.permissions?.[permission] !== true);
    if (missing.length > 0) {
      log({
        level: "warning",
        action: "api.request",
        message: "Tentative d'utilisation d'une clé API avec permissions insuffisantes",
        userId: key.id,
        metadata: { keyName: key.name, missingPermissions: missing, ...context },
      });
      return null;
    }

    let lastUsed = key.lastUsed;
    try {
      lastUsed = await touchApiKey(key.id);
    } catch (error) {
      console.error("[api-keys] dernière utilisation non enregistrée :", (error as Error).message);
    }

    log({
      level: "info",
      action: "api.request",
      message: "Validation de clé API réussie",
      userId: key.id,
      metadata: { keyName: key.name, requiredPermissions: required, ...context },
    });
    return { ...key, lastUsed };
  } catch (error) {
    log({
      level: "error",
      action: "system.error",
      message: "Erreur lors de la validation de la clé API",
      metadata: { error: error instanceof Error ? error.message : "Unknown error" },
    });
    return null;
  }
}

/** Valide une clé pour l'envoi de ce fichier (permission selon l'extension). */
export function validateApiKeyForUpload(secret: string | null | undefined, filename: string): Promise<ApiKey | null> {
  return validateApiKey(secret, permissionsForFile(filename), { fileType: filename });
}

/** Valide une clé pour l'extraction de couleurs : permission `extractColors` exigée. */
export function validateApiKeyForColorExtraction(secret: string | null | undefined): Promise<ApiKey | null> {
  return validateApiKey(secret, ["extractColors"]);
}

/** Clé lue dans l'en-tête `x-api-key`, partout le moyen attendu. */
export function extractApiKeyFromRequest(request: Request): string | null {
  return request.headers.get(API_KEY_HEADER)?.trim() || null;
}

/**
 * Clé lue dans le champ `apiKey` d'un formulaire. Déprécié : seul
 * `/api/colors` l'accepte encore, après l'en-tête.
 */
export function extractApiKeyFromFormData(formData: { get(name: string): unknown }): string | null {
  const value = formData.get("apiKey");
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
