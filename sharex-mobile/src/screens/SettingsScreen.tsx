// Écran des paramètres de l'application

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Switch,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationProps, AppSettings } from "../types";
import { StorageService } from "../services/storage";
import { ShareXApiService } from "../services/api";
import { Icon } from "../components/Icon";
import { ModernButton } from "../components/ModernButton";
import { ModernCard } from "../components/ModernCard";
import { QRCodeScannerScreen } from "./QRCodeScannerScreen";
import {
  COLORS,
  COMPONENT_COLORS,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
} from "../config/design";

const SettingsScreenComponent: React.FC<NavigationProps> = ({ navigation }) => {
  const [settings, setSettings] = useState<AppSettings>({
    serverUrl: "",
    apiKey: "",
    autoUpload: false,
    notifications: true,
    theme: "auto",
    allowImageEditing: true, // Activé par défaut
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedSettings = await StorageService.getSettings();
      if (savedSettings) {
        setSettings(savedSettings);
      }
    } catch (error) {
      console.error("Erreur lors du chargement des paramètres:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings.serverUrl.trim() || !settings.apiKey.trim()) {
      Alert.alert("Erreur", "Veuillez remplir tous les champs obligatoires.");
      return;
    }

    setIsSaving(true);
    try {
      await StorageService.saveSettings(settings);
      Alert.alert("Succès", "Paramètres sauvegardés avec succès.");
      navigation.goBack();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      Alert.alert("Erreur", "Impossible de sauvegarder les paramètres.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!settings.serverUrl.trim()) {
      Alert.alert("Erreur", "Veuillez remplir l'URL du serveur.");
      return;
    }

    setIsTestingConnection(true);
    try {
      // Tester seulement si l'URL est accessible
      const isConnected = await ShareXApiService.testServerUrl(
        settings.serverUrl
      );

      if (isConnected) {
        Alert.alert("Succès", "Serveur accessible ! L'URL est correcte.");
      } else {
        Alert.alert(
          "Erreur",
          "Impossible d'accéder au serveur. Vérifiez l'URL."
        );
      }
    } catch (error) {
      console.error("Erreur lors du test de connexion:", error);
      Alert.alert("Erreur", "Erreur lors du test de connexion.");
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleClearData = () => {
    Alert.alert(
      "Supprimer les données",
      "Êtes-vous sûr de vouloir supprimer toutes les données de l'application ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              await StorageService.clearAll();
              setSettings({
                serverUrl: "",
                apiKey: "",
                autoUpload: false,
                notifications: true,
                theme: "auto",
                allowImageEditing: true, // Activé par défaut
              });
              Alert.alert("Succès", "Données supprimées avec succès.");
            } catch (error) {
              console.error("Erreur lors de la suppression:", error);
              Alert.alert("Erreur", "Impossible de supprimer les données.");
            }
          },
        },
      ]
    );
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
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Icon
            name="arrow-back"
            size={24}
            color={COLORS.primary}
            type="ionicons"
          />
        </TouchableOpacity>
        <Text style={styles.title}>Paramètres</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Configuration du serveur - AVEC ModernCard CORRIGÉE */}
        <ModernCard title="Configuration du serveur" variant="elevated">
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>URL du serveur *</Text>
            <TextInput
              style={styles.textInput}
              value={settings.serverUrl}
              onChangeText={(text) => {
                setSettings((prev) => ({ ...prev, serverUrl: text }));
              }}
              placeholder="https://votre-serveur.com"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Clé API *</Text>
            <TextInput
              style={styles.textInput}
              value={settings.apiKey}
              onChangeText={(text) => {
                setSettings((prev) => ({ ...prev, apiKey: text }));
              }}
              placeholder="Votre clé API"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <ModernButton
            title={
              isTestingConnection
                ? "Test en cours..."
                : "Tester l'URL du serveur"
            }
            onPress={handleTestConnection}
            variant="secondary"
            size="md"
            disabled={isTestingConnection}
            loading={isTestingConnection}
            icon="wifi"
            iconType="ionicons"
          />
        </ModernCard>

        {/* Options de l'application */}
        <ModernCard title="Options de l'application" variant="elevated">
          <View style={styles.switchContainer}>
            <Text style={styles.switchLabel}>Upload automatique</Text>
            <Switch
              value={settings.autoUpload}
              onValueChange={(value) =>
                setSettings({ ...settings, autoUpload: value })
              }
            />
          </View>

          <View style={styles.switchContainer}>
            <Text style={styles.switchLabel}>Notifications</Text>
            <Switch
              value={settings.notifications}
              onValueChange={(value) =>
                setSettings({ ...settings, notifications: value })
              }
            />
          </View>

          <View style={styles.switchContainer}>
            <View style={styles.switchLabelContainer}>
              <Text style={styles.switchLabel}>
                Permettre l'édition d'images
              </Text>
              <Text style={styles.switchDescription}>
                Affiche les options de crop/modification lors de la sélection
                d'images
              </Text>
            </View>
            <Switch
              value={settings.allowImageEditing}
              onValueChange={(value) =>
                setSettings({ ...settings, allowImageEditing: value })
              }
            />
          </View>
        </ModernCard>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <ModernButton
            title={isSaving ? "Sauvegarde..." : "Sauvegarder"}
            onPress={handleSave}
            variant="primary"
            size="lg"
            disabled={isSaving}
            loading={isSaving}
            icon="save"
            iconType="ionicons"
          />

          <ModernButton
            title="Scanner QR Code"
            onPress={() => setShowQRScanner(true)}
            variant="secondary"
            size="lg"
            icon="qr-code"
            iconType="ionicons"
          />

          <ModernButton
            title="Supprimer les données"
            onPress={handleClearData}
            variant="danger"
            size="lg"
            icon="trash"
            iconType="ionicons"
          />

          <ModernButton
            title="À propos de l'application"
            onPress={() => navigation.navigate("About")}
            variant="ghost"
            size="lg"
            icon="information-circle"
            iconType="ionicons"
          />
        </View>
      </ScrollView>

      {/* QR Code Scanner Modal */}
      <QRCodeScannerScreen
        visible={showQRScanner}
        onClose={() => {
          setShowQRScanner(false);
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
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
    paddingBottom: 60, // Espace pour la bottom bar
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    backgroundColor: COLORS.background,
  },
  backButton: {
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primaryBg,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.textPrimary,
  },
  placeholder: {
    width: 40,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333333",
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    color: "#333333",
    marginBottom: 8,
    fontWeight: "500",
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#ffffff",
  },
  testButton: {
    backgroundColor: "#34C759",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginTop: 8,
  },
  testButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  switchContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingVertical: 8,
  },
  switchLabelContainer: {
    flex: 1,
    marginRight: 12,
  },
  switchLabel: {
    fontSize: 16,
    color: "#333333",
    fontWeight: "500",
  },
  switchDescription: {
    fontSize: 12,
    color: "#666666",
    marginTop: 2,
    lineHeight: 16,
  },
  actionsContainer: {
    marginTop: 20,
  },
  saveButton: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  clearButton: {
    backgroundColor: "#FF3B30",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  clearButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.6,
  },
});

export const SettingsScreen = SettingsScreenComponent;
