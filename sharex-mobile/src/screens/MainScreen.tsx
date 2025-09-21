// Écran principal moderne avec galerie

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Dimensions,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationProps, ImageInfo } from "../types";
import { StorageService } from "../services/storage";
import { ImageService } from "../services/imageService";
import { UploadHistoryService } from "../services/uploadHistory";
import { ClipboardService } from "../services/clipboard";
import { getApiService } from "../services/api";
import { ViewSelector } from "../components/ViewSelector";
import { ImageCard } from "../components/ImageCard";
import { Icon } from "../components/Icon";
import { ImagePreview } from "../components/ImagePreview";
import { ModernButton } from "../components/ModernButton";
import { ModernCard } from "../components/ModernCard";
import {
  COLORS,
  COMPONENT_COLORS,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
} from "../config/design";

const { width } = Dimensions.get("window");

export const MainScreen: React.FC<NavigationProps> = ({ navigation }) => {
  const [isConfigured, setIsConfigured] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [history, setHistory] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [stats, setStats] = useState({
    totalUploads: 0,
    totalSize: 0,
    lastUpload: null as Date | null,
  });
  const [previewImage, setPreviewImage] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    checkConfiguration();
    loadHistory();
  }, []);

  // Recharger l'historique quand on revient sur l'écran
  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      loadHistory();
    });

    return unsubscribe;
  }, [navigation]);

  const checkConfiguration = async () => {
    try {
      const configured = await StorageService.isConfigured();
      setIsConfigured(configured);

      if (configured) {
        const config = await StorageService.getServerConfig();
        if (config) {
          const apiService = getApiService(config);
          const connected = await apiService.testConnection();
          setIsConnected(connected);
        }
      }
    } catch (error) {
      console.error(
        "Erreur lors de la vérification de la configuration:",
        error
      );
    } finally {
      setIsLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const uploadHistory = await UploadHistoryService.getHistory();
      const historyStats = await UploadHistoryService.getStats();

      setHistory(uploadHistory);
      setStats({
        ...historyStats,
        lastUpload: historyStats.lastUpload
          ? new Date(historyStats.lastUpload)
          : null,
      });
    } catch (error) {
      console.error("Erreur lors du chargement de l'historique:", error);
    }
  };

  const handleSelectImage = async () => {
    try {
      const hasPermissions = await ImageService.requestPermissions();
      if (!hasPermissions) {
        Alert.alert(
          "Permissions requises",
          "Veuillez autoriser l'accès à la galerie et à l'appareil photo dans les paramètres."
        );
        return;
      }

      const image = await ImageService.pickImageFromGallery(false);
      if (image) {
        navigation.navigate("Upload", { image });
      }
    } catch (error) {
      console.error("Erreur lors de la sélection d'image:", error);
      Alert.alert("Erreur", "Impossible de sélectionner une image.");
    }
  };

  const handleTakePhoto = async () => {
    try {
      const hasPermissions = await ImageService.requestPermissions();
      if (!hasPermissions) {
        Alert.alert(
          "Permissions requises",
          "Veuillez autoriser l'accès à l'appareil photo dans les paramètres."
        );
        return;
      }

      const image = await ImageService.takePhoto(false);
      if (image) {
        navigation.navigate("Upload", { image });
      }
    } catch (error) {
      console.error("Erreur lors de la prise de photo:", error);
      Alert.alert("Erreur", "Impossible de prendre une photo.");
    }
  };

  const handleSettings = () => {
    navigation.navigate("Settings");
  };

  const handleGalleryItemPress = (item: any) => {
    setPreviewImage({
      uri: item.localUri,
      filename: item.filename,
      url: item.url,
      id: item.id,
    });
    setShowPreview(true);
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await UploadHistoryService.removeUpload(id);
      await loadHistory(); // Recharger la liste
      setShowPreview(false); // Fermer la prévisualisation
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Header moderne */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <View style={styles.greetingContainer}>
              <Text style={styles.greeting}>Bonjour !</Text>
              <Icon
                name="hand-left"
                size={20}
                color="#666666"
                type="ionicons"
              />
            </View>
            <Text style={styles.appName}>ShareX Manager</Text>
          </View>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={handleSettings}
          >
            <Icon name="settings" size={20} color="#666666" type="ionicons" />
          </TouchableOpacity>
        </View>

        {/* Status indicators */}
        <View style={styles.statusContainer}>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: isConfigured
                  ? COMPONENT_COLORS.statusSuccessBg
                  : COMPONENT_COLORS.statusErrorBg,
              },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                {
                  color: isConfigured
                    ? COMPONENT_COLORS.statusSuccess
                    : COMPONENT_COLORS.statusError,
                },
              ]}
            >
              <Icon
                name={isConfigured ? "checkmark-circle" : "close-circle"}
                size={12}
                color={
                  isConfigured
                    ? COMPONENT_COLORS.statusSuccess
                    : COMPONENT_COLORS.statusError
                }
                type="ionicons"
              />
              <Text style={{ marginLeft: 4 }}>
                {isConfigured ? "Configuré" : "Non configuré"}
              </Text>
            </Text>
          </View>
          {isConfigured && (
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: isConnected
                    ? COMPONENT_COLORS.statusSuccessBg
                    : COMPONENT_COLORS.statusErrorBg,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  {
                    color: isConnected
                      ? COMPONENT_COLORS.statusSuccess
                      : COMPONENT_COLORS.statusError,
                  },
                ]}
              >
                <Icon
                  name={isConnected ? "checkmark-circle" : "close-circle"}
                  size={12}
                  color={
                    isConnected
                      ? COMPONENT_COLORS.statusSuccess
                      : COMPONENT_COLORS.statusError
                  }
                  type="ionicons"
                />
                <Text style={{ marginLeft: 4 }}>
                  {isConnected ? "Connecté" : "Déconnecté"}
                </Text>
              </Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Actions rapides */}
        <ModernCard title="Actions rapides" variant="elevated">
          <View style={styles.quickActions}>
            <ModernButton
              title="Galerie"
              onPress={handleSelectImage}
              variant="primary"
              size="lg"
              disabled={!isConfigured}
              icon="images"
              iconType="ionicons"
              style={styles.quickActionButton}
            />

            <ModernButton
              title="Photo"
              onPress={handleTakePhoto}
              variant="accent"
              size="lg"
              disabled={!isConfigured}
              icon="camera"
              iconType="ionicons"
              style={styles.quickActionButton}
            />
          </View>
        </ModernCard>

        {/* Statistiques */}
        {history.length > 0 && (
          <ModernCard title="Statistiques" variant="elevated">
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{stats.totalUploads}</Text>
                <Text style={styles.statLabel}>Images</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>
                  {formatFileSize(stats.totalSize)}
                </Text>
                <Text style={styles.statLabel}>Taille totale</Text>
              </View>
            </View>
          </ModernCard>
        )}

        {/* Galerie */}
        <View style={styles.galleryContainer}>
          <View style={styles.galleryHeader}>
            <Text style={styles.sectionTitle}>Galerie</Text>
            <ViewSelector currentView={viewMode} onViewChange={setViewMode} />
          </View>

          {history.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon
                name="images-outline"
                size={48}
                color="#8E8E93"
                type="ionicons"
              />
              <Text style={styles.emptyStateTitle}>Aucune image</Text>
              <Text style={styles.emptyStateText}>
                Commencez par uploader votre première image !
              </Text>
            </View>
          ) : (
            <View
              style={
                viewMode === "grid"
                  ? styles.gridContainer
                  : styles.listContainer
              }
            >
              {history.map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => handleGalleryItemPress(item)}
                  style={
                    viewMode === "grid" ? styles.gridItem : styles.listItem
                  }
                >
                  {viewMode === "grid" ? (
                    <ImageCard item={item} onPress={handleGalleryItemPress} />
                  ) : (
                    <View style={styles.listItemContent}>
                      <Text style={styles.listItemTitle}>{item.filename}</Text>
                      <Text style={styles.listItemSubtitle}>
                        {new Date(item.uploadedAt).toLocaleDateString()}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Message de configuration */}
        {!isConfigured && (
          <View style={styles.configMessage}>
            <Icon name="warning" size={20} color="#856404" type="ionicons" />
            <Text style={styles.configMessageText}>
              Configurez l'URL du serveur et votre clé API dans les paramètres
              pour commencer.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Prévisualisation d'image */}
      {previewImage && (
        <ImagePreview
          visible={showPreview}
          imageUri={previewImage.uri}
          filename={previewImage.filename}
          url={previewImage.url}
          onClose={() => setShowPreview(false)}
          onDelete={() => handleDeleteItem(previewImage.id)}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 18,
    color: "#666666",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    backgroundColor: "#ffffff",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  greetingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  greeting: {
    fontSize: 16,
    color: "#666666",
    marginRight: 8,
  },
  appName: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333333",
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F8F9FA",
    justifyContent: "center",
    alignItems: "center",
  },
  settingsIcon: {
    fontSize: 20,
  },
  statusContainer: {
    flexDirection: "row",
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  quickActionsContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333333",
    marginBottom: 16,
  },
  quickActions: {
    flexDirection: "row",
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryAction: {
    backgroundColor: COMPONENT_COLORS.buttonPrimary,
  },
  secondaryAction: {
    backgroundColor: COMPONENT_COLORS.buttonSecondary,
  },
  quickActionText: {
    color: COLORS.textInverse,
    fontSize: 16,
    fontWeight: "600",
    marginTop: 8,
  },
  statsContainer: {
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#F8F9FA",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333333",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#666666",
    textAlign: "center",
  },
  galleryContainer: {
    marginBottom: 24,
  },
  galleryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    minHeight: 40,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333333",
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#666666",
    textAlign: "center",
    maxWidth: 200,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  gridItem: {
    width: (width - 52) / 2,
  },
  listContainer: {
    gap: 8,
  },
  listItem: {
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: 16,
  },
  listItemContent: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333333",
    marginBottom: 4,
  },
  listItemSubtitle: {
    fontSize: 14,
    color: "#666666",
  },
  configMessage: {
    backgroundColor: "#FFF3CD",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  configMessageText: {
    flex: 1,
    color: "#856404",
    fontSize: 14,
    lineHeight: 20,
  },
});
