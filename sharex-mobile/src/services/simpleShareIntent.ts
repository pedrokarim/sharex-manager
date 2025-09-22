// Service simplifié pour les Share Intents

import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { ImageInfo } from "../types";

export class SimpleShareIntentService {
  /**
   * Traite les données partagées via Share Intent
   */
  static async processSharedData(sharedData?: any): Promise<ImageInfo | null> {
    try {
      console.log("Traitement d'un Share Intent...", sharedData);

      // Si on a des données partagées, on les utilise
      if (sharedData && sharedData.uri) {
        const imageInfo: ImageInfo = {
          uri: sharedData.uri,
          name: sharedData.name || "shared_image.jpg",
          type: sharedData.type || "image/jpeg",
          size: sharedData.size || 0,
          width: sharedData.width || 0,
          height: sharedData.height || 0,
        };

        console.log("Image partagée traitée:", imageInfo);
        return imageInfo;
      }

      // Sinon, on simule avec des données de test pour les tests
      console.log("Aucune donnée partagée, simulation pour les tests...");
      const mockImageInfo: ImageInfo = {
        uri: "https://picsum.photos/800/600",
        name: "shared_image.jpg",
        type: "image/jpeg",
        size: 245760, // ~240 KB - taille plus réaliste
        width: 800,
        height: 600,
      };

      console.log("Image simulée créée:", mockImageInfo);
      return mockImageInfo;
    } catch (error) {
      console.error("Erreur lors du traitement du Share Intent:", error);
      return null;
    }
  }

  /**
   * Vérifie si l'app peut gérer les Share Intents
   */
  static canHandleShareIntents(): boolean {
    // Pour l'instant, on retourne true pour les tests
    // Dans une vraie implémentation, on vérifierait la configuration
    return true;
  }

  /**
   * Obtient les instructions pour tester le Share Intent
   */
  static getTestInstructions(): string[] {
    return [
      "1. Ouvrez votre galerie d'images",
      "2. Sélectionnez une image",
      "3. Appuyez sur le bouton 'Partager'",
      "4. Choisissez 'ShareX Manager' dans la liste",
      "5. L'image devrait s'ouvrir directement dans l'app !",
    ];
  }

  /**
   * Vérifie si l'app a été lancée via un Share Intent
   */
  static async checkForSharedContent(): Promise<any | null> {
    try {
      // Cette méthode sera appelée au démarrage de l'app
      // pour vérifier si elle a été lancée via un Share Intent
      console.log("Vérification des contenus partagés...");

      // Pour l'instant, on retourne null
      // Dans une vraie implémentation, on utiliserait expo-sharing
      // pour récupérer les données partagées
      return null;
    } catch (error) {
      console.error(
        "Erreur lors de la vérification des contenus partagés:",
        error
      );
      return null;
    }
  }
}
