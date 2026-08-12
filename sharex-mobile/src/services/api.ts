// Service API pour communiquer avec le serveur ShareX Manager

import { ApiKey, UploadResponse, ServerConfig } from "../types";

const API_TIMEOUT = 30000; // 30 secondes

export class ShareXApiService {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: ServerConfig) {
    this.baseUrl = config.url.replace(/\/$/, ""); // Supprimer le slash final
    this.apiKey = config.apiKey;
  }

  /**
   * Teste la connexion au serveur (vérifie seulement si l'URL est accessible)
   */
  async testConnection(): Promise<boolean> {
    try {
      // Créer un AbortController pour gérer le timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

      // Faire une simple requête GET vers la racine du serveur
      const response = await fetch(`${this.baseUrl}/`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Si on reçoit une réponse (même 404), le serveur est accessible
      return response.status !== 0;
    } catch (error) {
      console.error("Erreur de connexion:", error);
      return false;
    }
  }

  /**
   * Upload une image vers le serveur
   */
  async uploadImage(
    imageUri: string,
    filename: string,
    mimeType: string = "image/jpeg"
  ): Promise<UploadResponse> {
    return this.uploadFile(imageUri, filename, mimeType);
  }

  /** Upload une image ou un fichier reçu depuis le menu de partage. */
  async uploadFile(
    fileUri: string,
    filename: string,
    mimeType: string = "application/octet-stream",
    onProgress?: (progress: number) => void
  ): Promise<UploadResponse> {
    return new Promise((resolve) => {
      const formData = new FormData();
      formData.append("file", {
        uri: fileUri,
        name: filename,
        type: mimeType,
      } as any);

      const request = new XMLHttpRequest();
      request.open("POST", `${this.baseUrl}/api/upload`);
      request.setRequestHeader("x-api-key", this.apiKey);
      request.timeout = API_TIMEOUT;

      request.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress?.(Math.min(event.loaded / event.total, 0.99));
        }
      };

      request.onload = () => {
        let data: any = {};
        try {
          data = JSON.parse(request.responseText || "{}");
        } catch {
          data = {};
        }

        if (request.status < 200 || request.status >= 300) {
          resolve({
            success: false,
            error: data.error || `Erreur HTTP: ${request.status}`,
          });
          return;
        }

        onProgress?.(1);
        resolve({
          success: true,
          url: data.url,
          thumbnailUrl: data.thumbnail_url || undefined,
          filename:
            data.filename ||
            (typeof data.url === "string"
              ? data.url.split("/").pop()?.split("?")[0]
              : undefined),
        });
      };

      const resolveNetworkError = (message: string) =>
        resolve({ success: false, error: message });

      request.onerror = () =>
        resolveNetworkError("Le serveur n’a pas pu recevoir ce fichier.");
      request.ontimeout = () =>
        resolveNetworkError("L’envoi a dépassé le délai autorisé.");
      request.onabort = () => resolveNetworkError("L’envoi a été annulé.");
      request.send(formData);
    });
  }

  /**
   * Teste la connexion avec une URL spécifique (pour les paramètres)
   */
  static async testServerUrl(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

      const cleanUrl = url.replace(/\/$/, "");
      const response = await fetch(`${cleanUrl}/`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.status !== 0;
    } catch (error) {
      console.error("Erreur lors du test de l'URL:", error);
      return false;
    }
  }

  /**
   * Met à jour la configuration du service
   */
  updateConfig(config: ServerConfig) {
    this.baseUrl = config.url.replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }
}

// Instance singleton du service API
let apiServiceInstance: ShareXApiService | null = null;

export const getApiService = (config?: ServerConfig): ShareXApiService => {
  if (!apiServiceInstance && config) {
    apiServiceInstance = new ShareXApiService(config);
  }
  if (!apiServiceInstance) {
    throw new Error(
      "Service API non initialisé. Fournissez une configuration."
    );
  }
  if (config) {
    apiServiceInstance.updateConfig(config);
  }
  return apiServiceInstance;
};

export const initializeApiService = (
  config: ServerConfig
): ShareXApiService => {
  apiServiceInstance = new ShareXApiService(config);
  return apiServiceInstance;
};
