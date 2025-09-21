// Service de stockage sécurisé pour l'application

import * as SecureStore from "expo-secure-store";
import { AppSettings, ServerConfig } from "../types";

const STORAGE_KEYS = {
  SERVER_URL: "server_url",
  API_KEY: "api_key",
  AUTO_UPLOAD: "auto_upload",
  NOTIFICATIONS: "notifications",
  THEME: "theme",
  ALLOW_IMAGE_EDITING: "allow_image_editing",
  ONBOARDING_COMPLETED: "onboarding_completed",
} as const;

export class StorageService {
  /**
   * Sauvegarde l'URL du serveur
   */
  static async saveServerUrl(url: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.SERVER_URL, url);
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de l'URL du serveur:", error);
      throw error;
    }
  }

  /**
   * Récupère l'URL du serveur
   */
  static async getServerUrl(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(STORAGE_KEYS.SERVER_URL);
    } catch (error) {
      console.error(
        "Erreur lors de la récupération de l'URL du serveur:",
        error
      );
      return null;
    }
  }

  /**
   * Sauvegarde la clé API
   */
  static async saveApiKey(apiKey: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.API_KEY, apiKey);
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de la clé API:", error);
      throw error;
    }
  }

  /**
   * Récupère la clé API
   */
  static async getApiKey(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(STORAGE_KEYS.API_KEY);
    } catch (error) {
      console.error("Erreur lors de la récupération de la clé API:", error);
      return null;
    }
  }

  /**
   * Sauvegarde les paramètres de l'application
   */
  static async saveSettings(settings: AppSettings): Promise<void> {
    try {
      await Promise.all([
        SecureStore.setItemAsync(STORAGE_KEYS.SERVER_URL, settings.serverUrl),
        SecureStore.setItemAsync(STORAGE_KEYS.API_KEY, settings.apiKey),
        SecureStore.setItemAsync(
          STORAGE_KEYS.AUTO_UPLOAD,
          settings.autoUpload.toString()
        ),
        SecureStore.setItemAsync(
          STORAGE_KEYS.NOTIFICATIONS,
          settings.notifications.toString()
        ),
        SecureStore.setItemAsync(STORAGE_KEYS.THEME, settings.theme),
        SecureStore.setItemAsync(
          STORAGE_KEYS.ALLOW_IMAGE_EDITING,
          settings.allowImageEditing.toString()
        ),
      ]);
    } catch (error) {
      console.error("Erreur lors de la sauvegarde des paramètres:", error);
      throw error;
    }
  }

  /**
   * Récupère les paramètres de l'application
   */
  static async getSettings(): Promise<AppSettings | null> {
    try {
      const [
        serverUrl,
        apiKey,
        autoUpload,
        notifications,
        theme,
        allowImageEditing,
      ] = await Promise.all([
        SecureStore.getItemAsync(STORAGE_KEYS.SERVER_URL),
        SecureStore.getItemAsync(STORAGE_KEYS.API_KEY),
        SecureStore.getItemAsync(STORAGE_KEYS.AUTO_UPLOAD),
        SecureStore.getItemAsync(STORAGE_KEYS.NOTIFICATIONS),
        SecureStore.getItemAsync(STORAGE_KEYS.THEME),
        SecureStore.getItemAsync(STORAGE_KEYS.ALLOW_IMAGE_EDITING),
      ]);

      if (!serverUrl || !apiKey) {
        return null;
      }

      return {
        serverUrl,
        apiKey,
        autoUpload: autoUpload === "true",
        notifications: notifications === "true",
        theme: (theme as "light" | "dark" | "auto") || "auto",
        allowImageEditing: allowImageEditing === "true",
      };
    } catch (error) {
      console.error("Erreur lors de la récupération des paramètres:", error);
      return null;
    }
  }

  /**
   * Récupère la configuration du serveur
   */
  static async getServerConfig(): Promise<ServerConfig | null> {
    try {
      const [serverUrl, apiKey] = await Promise.all([
        SecureStore.getItemAsync(STORAGE_KEYS.SERVER_URL),
        SecureStore.getItemAsync(STORAGE_KEYS.API_KEY),
      ]);

      if (!serverUrl || !apiKey) {
        return null;
      }

      return {
        url: serverUrl,
        apiKey,
        isConnected: false, // Sera mis à jour lors du test de connexion
      };
    } catch (error) {
      console.error(
        "Erreur lors de la récupération de la configuration du serveur:",
        error
      );
      return null;
    }
  }

  /**
   * Marque l'onboarding comme complété
   */
  static async setOnboardingCompleted(completed: boolean): Promise<void> {
    try {
      await SecureStore.setItemAsync(
        STORAGE_KEYS.ONBOARDING_COMPLETED,
        completed.toString()
      );
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de l'onboarding:", error);
      throw error;
    }
  }

  /**
   * Vérifie si l'onboarding a été complété
   */
  static async getOnboardingCompleted(): Promise<boolean> {
    try {
      const completed = await SecureStore.getItemAsync(
        STORAGE_KEYS.ONBOARDING_COMPLETED
      );
      return completed === "true";
    } catch (error) {
      console.error("Erreur lors de la récupération de l'onboarding:", error);
      return false;
    }
  }

  /**
   * Supprime toutes les données stockées
   */
  static async clearAll(): Promise<void> {
    try {
      await Promise.all([
        SecureStore.deleteItemAsync(STORAGE_KEYS.SERVER_URL),
        SecureStore.deleteItemAsync(STORAGE_KEYS.API_KEY),
        SecureStore.deleteItemAsync(STORAGE_KEYS.AUTO_UPLOAD),
        SecureStore.deleteItemAsync(STORAGE_KEYS.NOTIFICATIONS),
        SecureStore.deleteItemAsync(STORAGE_KEYS.THEME),
        SecureStore.deleteItemAsync(STORAGE_KEYS.ALLOW_IMAGE_EDITING),
        SecureStore.deleteItemAsync(STORAGE_KEYS.ONBOARDING_COMPLETED),
      ]);
    } catch (error) {
      console.error("Erreur lors de la suppression des données:", error);
      throw error;
    }
  }

  /**
   * Vérifie si l'application est configurée
   */
  static async isConfigured(): Promise<boolean> {
    try {
      const [serverUrl, apiKey] = await Promise.all([
        SecureStore.getItemAsync(STORAGE_KEYS.SERVER_URL),
        SecureStore.getItemAsync(STORAGE_KEYS.API_KEY),
      ]);
      return !!(serverUrl && apiKey);
    } catch (error) {
      console.error(
        "Erreur lors de la vérification de la configuration:",
        error
      );
      return false;
    }
  }
}
