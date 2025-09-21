// Service de gestion des images

import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { ImageInfo } from "../types";

export class ImageService {
  /**
   * Demande les permissions nécessaires
   */
  static async requestPermissions(): Promise<boolean> {
    try {
      let hasGalleryPermission = false;
      let hasCameraPermission = false;

      // Permission pour la galerie
      try {
        const mediaPermission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        hasGalleryPermission = mediaPermission.status === "granted";
        if (!hasGalleryPermission) {
          console.warn("Permission galerie refusée");
        }
      } catch (error) {
        console.warn("Erreur permission galerie:", error);
      }

      // Permission pour l'appareil photo
      try {
        const cameraPermission =
          await ImagePicker.requestCameraPermissionsAsync();
        hasCameraPermission = cameraPermission.status === "granted";
        if (!hasCameraPermission) {
          console.warn("Permission caméra refusée");
        }
      } catch (error) {
        console.warn("Erreur permission caméra:", error);
      }

      // On considère que c'est OK si au moins une permission fonctionne
      const hasAnyPermission = hasGalleryPermission || hasCameraPermission;

      if (!hasAnyPermission) {
        console.warn("Aucune permission accordée");
      }

      return hasAnyPermission;
    } catch (error) {
      console.error("Erreur lors de la demande de permissions:", error);
      return false;
    }
  }

  /**
   * Sélectionne une image depuis la galerie
   */
  static async pickImageFromGallery(
    allowEditing: boolean = false
  ): Promise<ImageInfo | null> {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: allowEditing,
        quality: 0.8,
        exif: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];
      return {
        uri: asset.uri,
        name: asset.fileName || `image_${Date.now()}.jpg`,
        type: asset.type || "image",
        size: asset.fileSize || 0,
        width: asset.width,
        height: asset.height,
      };
    } catch (error) {
      console.error("Erreur lors de la sélection d'image:", error);
      return null;
    }
  }

  /**
   * Prend une photo avec l'appareil photo
   */
  static async takePhoto(
    allowEditing: boolean = false
  ): Promise<ImageInfo | null> {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false, // Force à false pour éviter le crop automatique
        quality: 0.8,
        exif: false,
        presentationStyle: ImagePicker.UIImagePickerPresentationStyle.AUTOMATIC,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];
      return {
        uri: asset.uri,
        name: asset.fileName || `photo_${Date.now()}.jpg`,
        type: asset.type || "image",
        size: asset.fileSize || 0,
        width: asset.width,
        height: asset.height,
      };
    } catch (error) {
      console.error("Erreur lors de la prise de photo:", error);
      return null;
    }
  }

  /**
   * Sélectionne plusieurs images depuis la galerie
   */
  static async pickMultipleImages(): Promise<ImageInfo[]> {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        exif: false,
      });

      if (result.canceled || !result.assets) {
        return [];
      }

      return result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.fileName || `image_${Date.now()}.jpg`,
        type: asset.type || "image",
        size: asset.fileSize || 0,
        width: asset.width,
        height: asset.height,
      }));
    } catch (error) {
      console.error("Erreur lors de la sélection multiple d'images:", error);
      return [];
    }
  }

  /**
   * Sauvegarde une image dans la galerie
   */
  static async saveToGallery(uri: string): Promise<boolean> {
    try {
      // Vérifier si MediaLibrary est disponible
      if (!MediaLibrary || !MediaLibrary.createAssetAsync) {
        console.warn("MediaLibrary non disponible dans Expo Go");
        return false;
      }

      const asset = await MediaLibrary.createAssetAsync(uri);
      return !!asset;
    } catch (error) {
      console.error("Erreur lors de la sauvegarde dans la galerie:", error);
      return false;
    }
  }

  /**
   * Obtient les informations d'une image
   */
  static async getImageInfo(uri: string): Promise<ImageInfo | null> {
    try {
      // Pour React Native, on peut utiliser des bibliothèques comme react-native-image-size
      // Pour l'instant, on retourne des informations basiques
      return {
        uri,
        name: uri.split("/").pop() || "image.jpg",
        type: "image",
        size: 0, // Nécessiterait une bibliothèque supplémentaire
      };
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des informations d'image:",
        error
      );
      return null;
    }
  }

  /**
   * Vérifie si une URI est une image valide
   */
  static isValidImageUri(uri: string): boolean {
    const validExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
    const lowerUri = uri.toLowerCase();
    return validExtensions.some((ext) => lowerUri.includes(ext));
  }

  /**
   * Génère un nom de fichier unique
   */
  static generateFileName(originalName?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);

    if (originalName) {
      const extension = originalName.split(".").pop();
      return `sharex_${timestamp}_${random}.${extension}`;
    }

    return `sharex_${timestamp}_${random}.jpg`;
  }

  /**
   * Vérifie les permissions actuelles sans les demander
   */
  static async checkPermissions(): Promise<{
    gallery: boolean;
    camera: boolean;
  }> {
    try {
      let galleryPermission = false;
      let cameraPermission = false;

      // Vérifier la permission galerie
      try {
        const mediaPermission =
          await ImagePicker.getMediaLibraryPermissionsAsync();
        galleryPermission = mediaPermission.status === "granted";
      } catch (error) {
        console.warn("Erreur vérification permission galerie:", error);
      }

      // Vérifier la permission caméra
      try {
        const cameraPermissionResult =
          await ImagePicker.getCameraPermissionsAsync();
        cameraPermission = cameraPermissionResult.status === "granted";
      } catch (error) {
        console.warn("Erreur vérification permission caméra:", error);
      }

      return {
        gallery: galleryPermission,
        camera: cameraPermission,
      };
    } catch (error) {
      console.error("Erreur lors de la vérification des permissions:", error);
      return {
        gallery: false,
        camera: false,
      };
    }
  }
}
