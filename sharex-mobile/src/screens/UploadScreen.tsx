// Écran d'upload d'images

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationProps, ImageInfo, UploadResponse } from "../types";
import { StorageService } from "../services/storage";
import { getApiService } from "../services/api";
import { ImageService } from "../services/imageService";
import { UploadHistoryService } from "../services/uploadHistory";
import { ClipboardService } from "../services/clipboard";

export const UploadScreen: React.FC<NavigationProps> = ({
  navigation,
  route,
}) => {
  const { image } = route.params as { image: ImageInfo };
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [serverConfig, setServerConfig] = useState<any>(null);

  useEffect(() => {
    loadServerConfig();
  }, []);

  const loadServerConfig = async () => {
    try {
      const config = await StorageService.getServerConfig();
      setServerConfig(config);
    } catch (error) {
      console.error("Erreur lors du chargement de la configuration:", error);
      Alert.alert(
        "Erreur",
        "Impossible de charger la configuration du serveur."
      );
    }
  };

  const handleUpload = async () => {
    if (!serverConfig) {
      Alert.alert("Erreur", "Configuration du serveur manquante.");
      return;
    }

    setIsUploading(true);
    setUploadResult(null);

    try {
      const apiService = getApiService(serverConfig);
      const result = await apiService.uploadImage(image.uri, image.name);

      setUploadResult(result);

      if (result.success) {
        // Sauvegarder dans l'historique
        await UploadHistoryService.addUpload({
          filename: result.filename || image.name,
          url: result.url || "",
          size: image.size,
          type: image.type,
        });

        Alert.alert(
          "Upload réussi !",
          `Image uploadée avec succès.\nURL: ${result.url}`,
          [
            {
              text: "Copier l'URL",
              onPress: () => {
                if (result.url) {
                  ClipboardService.copyUrl(result.url);
                }
              },
            },
            {
              text: "OK",
              onPress: () => navigation.goBack(),
            },
          ]
        );
      } else {
        Alert.alert("Erreur d'upload", result.error || "Erreur inconnue");
      }
    } catch (error) {
      console.error("Erreur lors de l'upload:", error);
      Alert.alert("Erreur", "Impossible d'uploader l'image.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetry = () => {
    setUploadResult(null);
    handleUpload();
  };

  const handleCancel = () => {
    navigation.goBack();
  };

  const handleCropImage = async () => {
    try {
      // Vérifier si l'édition d'images est autorisée
      const settings = await StorageService.getSettings();
      const allowEditing = settings?.allowImageEditing ?? true;

      if (!allowEditing) {
        Alert.alert(
          "Édition désactivée",
          "L'édition d'images est désactivée dans les paramètres. Activez-la pour pouvoir modifier les images."
        );
        return;
      }

      // Proposer à l'utilisateur de choisir une nouvelle image avec crop
      Alert.alert(
        "Modifier l'image",
        "Voulez-vous sélectionner une nouvelle image à modifier ?",
        [
          {
            text: "Sélectionner depuis la galerie",
            onPress: async () => {
              const croppedImage = await ImageService.pickImageFromGallery(
                true
              );
              if (croppedImage) {
                // Naviguer vers un nouvel écran d'upload avec l'image modifiée
                navigation.replace("Upload", { image: croppedImage });
              }
            },
          },
          {
            text: "Prendre une nouvelle photo",
            onPress: async () => {
              const croppedImage = await ImageService.takePhoto(true);
              if (croppedImage) {
                // Naviguer vers un nouvel écran d'upload avec l'image modifiée
                navigation.replace("Upload", { image: croppedImage });
              }
            },
          },
          { text: "Annuler", style: "cancel" },
        ]
      );
    } catch (error) {
      console.error("Erreur lors du crop de l'image:", error);
      Alert.alert("Erreur", "Impossible de modifier l'image.");
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleCancel}>
            <Text style={styles.backButtonText}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Upload d'image</Text>
        </View>

        {/* Prévisualisation de l'image */}
        <View style={styles.imageContainer}>
          <Image source={{ uri: image.uri }} style={styles.image} />
        </View>

        {/* Informations sur l'image */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>Informations de l'image</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Nom:</Text>
            <Text style={styles.infoValue}>{image.name}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Type:</Text>
            <Text style={styles.infoValue}>{image.type}</Text>
          </View>

          {image.size > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Taille:</Text>
              <Text style={styles.infoValue}>{formatFileSize(image.size)}</Text>
            </View>
          )}

          {image.width && image.height && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Dimensions:</Text>
              <Text style={styles.infoValue}>
                {image.width} × {image.height}
              </Text>
            </View>
          )}
        </View>

        {/* Résultat de l'upload */}
        {uploadResult && (
          <View
            style={[
              styles.resultContainer,
              { backgroundColor: uploadResult.success ? "#E8F5E8" : "#FFEBEE" },
            ]}
          >
            <Text
              style={[
                styles.resultTitle,
                { color: uploadResult.success ? "#2E7D32" : "#C62828" },
              ]}
            >
              {uploadResult.success ? "✓ Upload réussi" : "✗ Upload échoué"}
            </Text>

            {uploadResult.success && uploadResult.url && (
              <View style={styles.urlContainer}>
                <Text style={styles.urlLabel}>URL:</Text>
                <Text style={styles.urlValue}>{uploadResult.url}</Text>
              </View>
            )}

            {uploadResult.error && (
              <Text style={styles.errorText}>{uploadResult.error}</Text>
            )}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {!uploadResult && (
            <>
              <TouchableOpacity
                style={[
                  styles.uploadButton,
                  isUploading && styles.disabledButton,
                ]}
                onPress={handleUpload}
                disabled={isUploading}
              >
                {isUploading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#ffffff" size="small" />
                    <Text style={styles.uploadButtonText}>
                      Upload en cours...
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.uploadButtonText}>
                    📤 Uploader l'image
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cropButton}
                onPress={handleCropImage}
                disabled={isUploading}
              >
                <Text style={styles.cropButtonText}>✂️ Crop/Modifier</Text>
              </TouchableOpacity>
            </>
          )}

          {uploadResult && !uploadResult.success && (
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryButtonText}>🔄 Réessayer</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelButtonText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  backButton: {
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: "#007AFF",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333333",
  },
  imageContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: 12,
    resizeMode: "cover",
  },
  infoContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333333",
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: "#666666",
    fontWeight: "500",
  },
  infoValue: {
    fontSize: 14,
    color: "#333333",
    flex: 1,
    textAlign: "right",
  },
  resultContainer: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  urlContainer: {
    marginTop: 8,
  },
  urlLabel: {
    fontSize: 14,
    color: "#666666",
    marginBottom: 4,
  },
  urlValue: {
    fontSize: 12,
    color: "#333333",
    fontFamily: "monospace",
    backgroundColor: "#ffffff",
    padding: 8,
    borderRadius: 4,
  },
  errorText: {
    fontSize: 14,
    color: "#C62828",
    marginTop: 8,
  },
  actionsContainer: {
    marginTop: 20,
  },
  uploadButton: {
    backgroundColor: "#007AFF",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  uploadButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  cropButton: {
    backgroundColor: "#FF9500",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  cropButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  retryButton: {
    backgroundColor: "#FF9500",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  cancelButton: {
    backgroundColor: "#8E8E93",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.6,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
});
