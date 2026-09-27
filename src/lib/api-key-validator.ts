import { readFile, writeFile } from "fs/promises";
import path from "path";
import type { ApiKey } from "@/types/api-key";
import { logDb } from "@/lib/utils/db";

const API_KEYS_FILE = path.join(process.cwd(), "data/api-keys.json");

/**
 * Lit toutes les clés API depuis le fichier de stockage
 */
async function getApiKeys(): Promise<ApiKey[]> {
  try {
    const content = await readFile(API_KEYS_FILE, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error("Erreur lors de la lecture des clés API:", error);
    return [];
  }
}

/**
 * Sauvegarde les clés API dans le fichier de stockage
 */
async function saveApiKeys(keys: ApiKey[]): Promise<void> {
  try {
    await writeFile(API_KEYS_FILE, JSON.stringify(keys, null, 2));
  } catch (error) {
    console.error("Erreur lors de la sauvegarde des clés API:", error);
    throw error;
  }
}

/**
 * Valide une clé API et retourne les informations de la clé si elle est valide
 * @param apiKey La clé API à valider
 * @param requiredPermissions Permissions requises (optionnel)
 * @returns Les informations de la clé si valide, null sinon
 */
export async function validateApiKey(
  apiKey: string,
  requiredPermissions?: {
    uploadImages?: boolean;
    uploadText?: boolean;
    uploadFiles?: boolean;
    extractColors?: boolean;
  }
): Promise<ApiKey | null> {
  try {
    const keys = await getApiKeys();
    const key = keys.find((k) => k.key === apiKey);

    if (!key) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: "Tentative d'utilisation d'une clé API inexistante",
        metadata: {
          apiKey: apiKey.substring(0, 8) + "...",
        },
      });
      return null;
    }

    // Vérifier si la clé a expiré
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: "Tentative d'utilisation d'une clé API expirée",
        userId: key.id,
        metadata: {
          keyName: key.name,
          expiresAt: key.expiresAt,
        },
      });
      return null;
    }

    // Vérifier les permissions si spécifiées
    if (requiredPermissions) {
      const hasRequiredPermissions = Object.entries(requiredPermissions).every(
        ([permission, required]) => {
          if (!required) return true;
          return (
            key.permissions[permission as keyof typeof key.permissions] === true
          );
        }
      );

      if (!hasRequiredPermissions) {
        logDb.createLog({
          level: "warning",
          action: "api.request",
          message:
            "Tentative d'utilisation d'une clé API avec permissions insuffisantes",
          userId: key.id,
          metadata: {
            keyName: key.name,
            requiredPermissions,
            actualPermissions: key.permissions,
          },
        });
        return null;
      }
    }

    // Mettre à jour la date de dernière utilisation
    key.lastUsed = new Date().toISOString();
    await saveApiKeys(keys);

    logDb.createLog({
      level: "info",
      action: "api.request",
      message: "Validation de clé API réussie",
      userId: key.id,
      metadata: {
        keyName: key.name,
        requiredPermissions,
      },
    });

    return key;
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de la validation de la clé API",
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
        apiKey: apiKey.substring(0, 8) + "...",
      },
    });
    return null;
  }
}

/**
 * Valide une clé API pour l'upload de fichiers
 * @param apiKey La clé API à valider
 * @param fileType Le type de fichier à uploader
 * @returns Les informations de la clé si valide, null sinon
 */
export async function validateApiKeyForUpload(
  apiKey: string,
  fileType: string
): Promise<ApiKey | null> {
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileType);
  const isDocument = /\.(pdf|doc|docx|txt)$/i.test(fileType);
  const isArchive = /\.(zip|rar)$/i.test(fileType);

  let requiredPermissions: any = {};

  if (isImage) {
    requiredPermissions.uploadImages = true;
  } else if (isDocument) {
    requiredPermissions.uploadText = true;
  } else if (isArchive) {
    requiredPermissions.uploadFiles = true;
  } else {
    requiredPermissions.uploadFiles = true;
  }

  return validateApiKey(apiKey, requiredPermissions);
}

/**
 * Valide une clé API pour l'extraction de couleurs
 * @param apiKey La clé API à valider
 * @returns Les informations de la clé si valide, null sinon
 */
export async function validateApiKeyForColorExtraction(
  apiKey: string
): Promise<ApiKey | null> {
  // Pour l'instant, on accepte toutes les clés valides pour l'extraction de couleurs
  // On peut ajouter une permission spécifique plus tard si nécessaire
  return validateApiKey(apiKey);
}

/**
 * Extrait la clé API depuis les headers ou le FormData
 * @param request La requête NextRequest
 * @returns La clé API ou null si non trouvée
 */
export function extractApiKeyFromRequest(request: Request): string | null {
  // Essayer d'abord dans les headers
  const headerKey = request.headers.get("x-api-key");
  if (headerKey) {
    return headerKey;
  }

  // Si c'est une requête FormData, on ne peut pas l'extraire ici
  // Il faudra le faire dans la route qui traite le FormData
  return null;
}

/**
 * Extrait la clé API depuis FormData
 * @param formData Le FormData de la requête
 * @returns La clé API ou null si non trouvée
 */
export function extractApiKeyFromFormData(formData: FormData): string | null {
  const apiKey = formData.get("apiKey");
  return apiKey ? apiKey.toString() : null;
}
