// Écran d'accueil de l'application

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationProps } from "../types";
import { StorageService } from "../services/storage";
import { ImageService } from "../services/imageService";
import { getApiService } from "../services/api";
import { Icon } from "../components/Icon";
import { ModernButton } from "../components/ModernButton";
import {
  COLORS,
  COMPONENT_COLORS,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
} from "../config/design";

export const HomeScreen: React.FC<NavigationProps> = ({ navigation }) => {
  const [isConfigured, setIsConfigured] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkConfiguration();
  }, []);

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

      // Récupérer les paramètres pour savoir si l'édition est autorisée
      const settings = await StorageService.getSettings();
      const allowEditing = settings?.allowImageEditing || false;

      const image = await ImageService.pickImageFromGallery(allowEditing);
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

      // Prendre la photo directement, l'utilisateur pourra choisir de modifier dans l'écran d'upload
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

  const handleGallery = () => {
    navigation.navigate("Gallery");
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

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>ShareX Manager</Text>
          <Text style={styles.subtitle}>Upload d'images mobile</Text>
        </View>

        {/* Status */}
        <View style={styles.statusContainer}>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Configuration:</Text>
            <Text
              style={[
                styles.statusValue,
                { color: isConfigured ? "#4CAF50" : "#F44336" },
              ]}
            >
              <Icon
                name={isConfigured ? "checkmark-circle" : "close-circle"}
                size={12}
                color={isConfigured ? "#2E7D32" : "#C62828"}
                type="ionicons"
              />
              <Text style={{ marginLeft: 4 }}>
                {isConfigured ? "Configuré" : "Non configuré"}
              </Text>
            </Text>
          </View>

          {isConfigured && (
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Connexion:</Text>
              <Text
                style={[
                  styles.statusValue,
                  { color: isConnected ? "#4CAF50" : "#F44336" },
                ]}
              >
                <Icon
                  name={isConnected ? "checkmark-circle" : "close-circle"}
                  size={12}
                  color={isConnected ? "#2E7D32" : "#C62828"}
                  type="ionicons"
                />
                <Text style={{ marginLeft: 4 }}>
                  {isConnected ? "Connecté" : "Déconnecté"}
                </Text>
              </Text>
            </View>
          )}
        </View>

        {/* Actions principales */}
        <View style={styles.actionsContainer}>
          <ModernButton
            title="Sélectionner une image"
            onPress={handleSelectImage}
            variant="primary"
            size="lg"
            disabled={!isConfigured}
            icon="images"
            iconType="ionicons"
            style={styles.actionButton}
          />

          <ModernButton
            title="Prendre une photo"
            onPress={handleTakePhoto}
            variant="accent"
            size="lg"
            disabled={!isConfigured}
            icon="camera"
            iconType="ionicons"
            style={styles.actionButton}
          />
        </View>

        {/* Actions secondaires */}
        <View style={styles.secondaryActionsContainer}>
          <ModernButton
            title="Galerie"
            onPress={handleGallery}
            variant="ghost"
            size="md"
            icon="images"
            iconType="ionicons"
            style={styles.secondaryActionButton}
          />

          <ModernButton
            title="Paramètres"
            onPress={handleSettings}
            variant="ghost"
            size="md"
            icon="settings"
            iconType="ionicons"
            style={styles.secondaryActionButton}
          />
        </View>

        {/* Message de configuration */}
        {!isConfigured && (
          <View style={styles.configMessage}>
            <Text style={styles.configMessageText}>
              <Icon name="warning" size={20} color="#856404" type="ionicons" />
              <Text style={{ marginLeft: 8, flex: 1 }}>
                Veuillez configurer l'URL du serveur et votre clé API dans les
                paramètres.
              </Text>
            </Text>
          </View>
        )}
      </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#333333",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666666",
  },
  statusContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
  },
  statusItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 16,
    color: "#333333",
    fontWeight: "500",
  },
  statusValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  actionsContainer: {
    marginBottom: 30,
  },
  actionButton: {
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginBottom: 16,
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
  primaryButton: {
    backgroundColor: COMPONENT_COLORS.buttonPrimary,
  },
  secondaryButton: {
    backgroundColor: COMPONENT_COLORS.buttonSecondary,
  },
  primaryButtonText: {
    color: COLORS.textInverse,
    fontSize: 16,
    fontWeight: "600",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: COLORS.textInverse,
    fontSize: 16,
    fontWeight: "600",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  secondaryActionButton: {
    backgroundColor: COMPONENT_COLORS.buttonOutline,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flex: 0.48,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: COMPONENT_COLORS.buttonOutlineBorder,
  },
  secondaryActionText: {
    color: COMPONENT_COLORS.buttonOutlineText,
    fontSize: 16,
    fontWeight: "500",
  },
  configMessage: {
    backgroundColor: "#FFF3CD",
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#FFC107",
  },
  configMessageText: {
    color: "#856404",
    fontSize: 14,
    lineHeight: 20,
  },
});
