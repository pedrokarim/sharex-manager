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
import { Icon } from "../components/Icon";
import { ModernButton } from "../components/ModernButton";
import { ModernCard } from "../components/ModernCard";
import { COLORS, COMPONENT_COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY } from "../config/design";

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
          localUri: image.uri,
          width: image.width,
          height: image.height,
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
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleCancel}>
            <Icon
              name="arrow-back"
              size={24}
              color={COLORS.primary}
              type="ionicons"
            />
          </TouchableOpacity>
          <Text style={styles.title}>Upload d'image</Text>
        </View>

        {/* Prévisualisation de l'image */}
        <View style={styles.imageContainer}>
          <Image source={{ uri: image.uri }} style={styles.image} />
        </View>

        {/* Informations sur l'image */}
        <ModernCard title="Informations de l'image" variant="elevated">
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
        </ModernCard>

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
                {
                  color: uploadResult.success
                    ? COMPONENT_COLORS.statusSuccess
                    : COMPONENT_COLORS.statusError,
                },
              ]}
            >
              <Icon
                name={
                  uploadResult.success ? "checkmark-circle" : "close-circle"
                }
                size={16}
                color={
                  uploadResult.success
                    ? COMPONENT_COLORS.statusSuccess
                    : COMPONENT_COLORS.statusError
                }
                type="ionicons"
              />
              <Text style={{ marginLeft: 8 }}>
                {uploadResult.success ? "Upload réussi" : "Upload échoué"}
              </Text>
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
              <ModernButton
                title={isUploading ? "Upload en cours..." : "Uploader l'image"}
                onPress={handleUpload}
                variant="primary"
                size="lg"
                disabled={isUploading}
                loading={isUploading}
                icon="cloud-upload"
                iconType="ionicons"
              />

              <ModernButton
                title="Crop/Modifier"
                onPress={handleCropImage}
                variant="accent"
                size="lg"
                disabled={isUploading}
                icon="cut"
                iconType="ionicons"
              />
            </>
          )}

          {uploadResult && !uploadResult.success && (
            <ModernButton
              title="Réessayer"
              onPress={handleRetry}
              variant="accent"
              size="lg"
              icon="refresh"
              iconType="ionicons"
            />
          )}

          <ModernButton
            title="Annuler"
            onPress={handleCancel}
            variant="ghost"
            size="lg"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.primaryBg,
    borderRadius: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.textPrimary,
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
  // Style uniforme pour tous les boutons
});
