// Écran principal moderne avec galerie

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Dimensions,
  Alert,
  TextInput,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationProps, ImageInfo } from "../types";
import { StorageService } from "../services/storage";
import { ImageService } from "../services/imageService";
import { UploadHistoryService } from "../services/uploadHistory";
import { ClipboardService } from "../services/clipboard";
import { ShareService } from "../services/shareService";
import { getApiService } from "../services/api";
import { ViewSelector } from "../components/ViewSelector";
import { ImageCard } from "../components/ImageCard";
import {
  ImageActionDrawer,
  ImageActionDrawerRef,
} from "../components/ImageActionDrawer";
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
  const [viewMode, setViewMode] = useState<"grid" | "list" | "mini-grid">(
    "grid"
  );
  const [sortBy, setSortBy] = useState<"date" | "name">("date");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewImage, setPreviewImage] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const actionDrawerRef = useRef<ImageActionDrawerRef>(null);
  const waveAnimation = useRef(new Animated.Value(0)).current;

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
      setHistory(uploadHistory);
    } catch (error) {
      console.error("Erreur lors du chargement de l'historique:", error);
    }
  };

  const getFilteredAndSortedHistory = () => {
    let filtered = [...history];

    // Filtrage par nom
    if (searchQuery.trim()) {
      filtered = filtered.filter((item) =>
        item.filename.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Tri
    filtered.sort((a, b) => {
      if (sortBy === "date") {
        return (
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
        );
      } else {
        return a.filename.localeCompare(b.filename);
      }
    });

    return filtered;
  };

  const getGreetingMessage = () => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return "Bonjour !";
    } else if (hour < 18) {
      return "Bon après-midi !";
    } else {
      return "Bonsoir !";
    }
  };

  const startWaveAnimation = () => {
    Animated.sequence([
      Animated.timing(waveAnimation, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(waveAnimation, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleGreetingPress = () => {
    startWaveAnimation();
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

  const handleShareImage = async (item: any) => {
    try {
      await ShareService.shareImageUrl({
        url: item.url,
        filename: item.filename,
      });
    } catch (error) {
      Alert.alert("Erreur", "Impossible de partager l'image");
    }
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

  const handleMenuPress = (item: any) => {
    console.log("handleMenuPress called with item:", item);
    actionDrawerRef.current?.present(item);
  };

  const handleCopyLink = async (item: any) => {
    try {
      await ClipboardService.copyUrl(item.url);
      Alert.alert("Succès", "Lien copié dans le presse-papiers !");
    } catch (error) {
      Alert.alert("Erreur", "Impossible de copier le lien");
    }
  };

  const handleDeleteImage = (item: any) => {
    Alert.alert(
      "Supprimer l'image",
      "Êtes-vous sûr de vouloir supprimer cette image de l'historique ?",
      [
        {
          text: "Annuler",
          style: "cancel",
        },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              await UploadHistoryService.removeUpload(item.id);
              setHistory(await UploadHistoryService.getHistory());
              Alert.alert("Succès", "Image supprimée de l'historique");
            } catch (error) {
              Alert.alert("Erreur", "Impossible de supprimer l'image");
            }
          },
        },
      ]
    );
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
            <TouchableOpacity
              style={styles.greetingContainer}
              onPress={handleGreetingPress}
              onPressIn={() => setIsHovering(true)}
              onPressOut={() => setIsHovering(false)}
            >
              <Text style={styles.greeting}>{getGreetingMessage()}</Text>
              <Animated.View
                style={{
                  transform: [
                    {
                      rotate: waveAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["0deg", "20deg"],
                      }),
                    },
                  ],
                }}
              >
                <Icon
                  name="hand-left"
                  size={20}
                  color={isHovering ? COLORS.primary : COLORS.accent}
                  type="ionicons"
                />
              </Animated.View>
            </TouchableOpacity>
            <Text style={styles.appName}>ShareX Manager</Text>
          </View>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={handleSettings}
          >
            <Icon
              name="settings"
              size={20}
              color={COLORS.primary}
              type="ionicons"
            />
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
            <View style={styles.statusContent}>
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
                {isConfigured ? "Configuré" : "Non configuré"}
              </Text>
            </View>
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
              <View style={styles.statusContent}>
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
                  {isConnected ? "Connecté" : "Déconnecté"}
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Actions rapides */}
        <ModernCard
          title="Actions rapides"
          variant="elevated"
          style={{
            marginTop: 3,
          }}
        >
          <View style={styles.quickActions}>
            <ModernButton
              title="Galerie"
              onPress={handleSelectImage}
              variant="primary"
              size="lg"
              disabled={!isConfigured}
              icon="images"
              iconType="ionicons"
              style={styles.halfWidthButton}
            />

            <ModernButton
              title="Photo"
              onPress={handleTakePhoto}
              variant="accent"
              size="lg"
              disabled={!isConfigured}
              icon="camera"
              iconType="ionicons"
              style={styles.halfWidthButton}
            />
          </View>
        </ModernCard>

        {/* Galerie */}
        <View style={styles.galleryContainer}>
          <View style={styles.galleryHeader}>
            <Text style={styles.sectionTitle}>Galerie</Text>
            <ViewSelector currentView={viewMode} onViewChange={setViewMode} />
          </View>

          {/* Contrôles de filtre et recherche */}
          {history.length > 0 && (
            <View style={styles.filterContainer}>
              <View style={styles.searchContainer}>
                <Icon
                  name="search"
                  size={16}
                  color={COLORS.textTertiary}
                  type="ionicons"
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Rechercher par nom..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholderTextColor={COLORS.textTertiary}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <Icon
                      name="close"
                      size={16}
                      color={COLORS.textTertiary}
                      type="ionicons"
                    />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.sortContainer}>
                <TouchableOpacity
                  style={[
                    styles.sortButton,
                    sortBy === "date" && styles.sortButtonActive,
                  ]}
                  onPress={() => setSortBy("date")}
                >
                  <Icon
                    name="calendar"
                    size={14}
                    color={
                      sortBy === "date"
                        ? COLORS.textInverse
                        : COLORS.textSecondary
                    }
                    type="ionicons"
                  />
                  <Text
                    style={[
                      styles.sortButtonText,
                      sortBy === "date" && styles.sortButtonTextActive,
                    ]}
                  >
                    Date
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.sortButton,
                    sortBy === "name" && styles.sortButtonActive,
                  ]}
                  onPress={() => setSortBy("name")}
                >
                  <Icon
                    name="text"
                    size={14}
                    color={
                      sortBy === "name"
                        ? COLORS.textInverse
                        : COLORS.textSecondary
                    }
                    type="ionicons"
                  />
                  <Text
                    style={[
                      styles.sortButtonText,
                      sortBy === "name" && styles.sortButtonTextActive,
                    ]}
                  >
                    Nom
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {getFilteredAndSortedHistory().length === 0 ? (
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
                  : viewMode === "mini-grid"
                  ? styles.miniGridContainer
                  : styles.listContainer
              }
            >
              {getFilteredAndSortedHistory().map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => handleGalleryItemPress(item)}
                  style={
                    viewMode === "grid"
                      ? styles.gridItem
                      : viewMode === "mini-grid"
                      ? styles.miniGridItem
                      : undefined
                  }
                >
                  <ImageCard
                    item={item}
                    onPress={handleGalleryItemPress}
                    onMenuPress={handleMenuPress}
                    viewMode={viewMode}
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Message de configuration */}
        {!isConfigured && (
          <View style={styles.configMessage}>
            <View style={styles.configIconContainer}>
              <Icon name="warning" size={20} color="#856404" type="ionicons" />
            </View>
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

      {/* Action Drawer */}
      <ImageActionDrawer
        ref={actionDrawerRef}
        onCopyLink={handleCopyLink}
        onDelete={handleDeleteImage}
        onShare={handleShareImage}
      />
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
    color: COLORS.primary,
    marginRight: 8,
    fontWeight: "600",
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
  statusContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 60, // Espace pour la bottom bar
  },
  quickActionsContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333333",
    flex: 1,
    textAlignVertical: "center",
  },
  quickActions: {
    flexDirection: "row",
  },
  halfWidthButton: {
    flex: 1,
    marginHorizontal: 4,
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
  galleryContainer: {
    marginBottom: 0,
  },
  galleryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    minHeight: 40,
    paddingHorizontal: 0,
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
  miniGridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  miniGridItem: {
    width: (width - 40 - 24) / 4, // width - padding (20*2) - (3 gaps de 8px)
  },
  listContainer: {
    gap: 8,
  },
  configMessage: {
    backgroundColor: "#FFF3CD",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  configIconContainer: {
    paddingRight: 12,
  },
  configMessageText: {
    flex: 1,
    color: "#856404",
    fontSize: 14,
    lineHeight: 20,
  },
  // Styles pour les contrôles de filtre
  filterContainer: {
    marginBottom: 16,
    gap: 12,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  sortContainer: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.backgroundSecondary,
    gap: SPACING.xs,
  },
  sortButtonActive: {
    backgroundColor: COLORS.primary,
  },
  sortButtonText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  sortButtonTextActive: {
    color: COLORS.textInverse,
  },
});
