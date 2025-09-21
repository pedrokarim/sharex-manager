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
    filename: string
  ): Promise<UploadResponse> {
    try {
      // Créer un AbortController pour gérer le timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

      // Créer un FormData avec l'image
      const formData = new FormData();

      // Pour React Native, on doit créer un objet avec les propriétés requises
      formData.append("file", {
        uri: imageUri,
        name: filename,
        type: "image/jpeg", // Type par défaut, peut être ajusté selon le fichier
      } as any);

      const response = await fetch(`${this.baseUrl}/api/upload`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "Content-Type": "multipart/form-data",
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error || `Erreur HTTP: ${response.status}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        url: data.url,
        filename: data.filename,
      };
    } catch (error) {
      console.error("Erreur lors de l'upload:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erreur inconnue",
      };
    }
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
  return apiServiceInstance;
};

export const initializeApiService = (
  config: ServerConfig
): ShareXApiService => {
  apiServiceInstance = new ShareXApiService(config);
  return apiServiceInstance;
};
