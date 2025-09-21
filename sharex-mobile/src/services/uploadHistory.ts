// Service de gestion de l'historique des uploads

import * as SecureStore from "expo-secure-store";
import { UploadHistoryItem } from "../types";

const HISTORY_KEY = "upload_history";

export class UploadHistoryService {
  /**
   * Sauvegarde un nouvel upload dans l'historique
   */
  static async addUpload(uploadData: {
    filename: string;
    url: string;
    size: number;
    type: string;
  }): Promise<void> {
    try {
      const history = await this.getHistory();
      const newItem: UploadHistoryItem = {
        id: Date.now().toString(),
        filename: uploadData.filename,
        url: uploadData.url,
        uploadedAt: new Date().toISOString(),
        size: uploadData.size,
        type: uploadData.type,
      };

      // Ajouter au début de la liste (plus récent en premier)
      const updatedHistory = [newItem, ...history];

      // Limiter à 100 éléments maximum
      const limitedHistory = updatedHistory.slice(0, 100);

      await SecureStore.setItemAsync(
        HISTORY_KEY,
        JSON.stringify(limitedHistory)
      );
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de l'historique:", error);
    }
  }

  /**
   * Récupère l'historique des uploads
   */
  static async getHistory(): Promise<UploadHistoryItem[]> {
    try {
      const historyJson = await SecureStore.getItemAsync(HISTORY_KEY);
      if (!historyJson) {
        return [];
      }
      return JSON.parse(historyJson);
    } catch (error) {
      console.error("Erreur lors de la récupération de l'historique:", error);
      return [];
    }
  }

  /**
   * Supprime un élément de l'historique
   */
  static async removeUpload(id: string): Promise<void> {
    try {
      const history = await this.getHistory();
      const updatedHistory = history.filter((item) => item.id !== id);
      await SecureStore.setItemAsync(
        HISTORY_KEY,
        JSON.stringify(updatedHistory)
      );
    } catch (error) {
      console.error("Erreur lors de la suppression de l'historique:", error);
    }
  }

  /**
   * Vide tout l'historique
   */
  static async clearHistory(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(HISTORY_KEY);
    } catch (error) {
      console.error("Erreur lors de la suppression de l'historique:", error);
    }
  }

  /**
   * Récupère les statistiques de l'historique
   */
  static async getStats(): Promise<{
    totalUploads: number;
    totalSize: number;
    lastUpload?: string;
  }> {
    try {
      const history = await this.getHistory();
      const totalSize = history.reduce((sum, item) => sum + item.size, 0);
      const lastUpload = history.length > 0 ? history[0].uploadedAt : undefined;

      return {
        totalUploads: history.length,
        totalSize,
        lastUpload,
      };
    } catch (error) {
      console.error("Erreur lors du calcul des statistiques:", error);
      return {
        totalUploads: 0,
        totalSize: 0,
      };
    }
  }
}

