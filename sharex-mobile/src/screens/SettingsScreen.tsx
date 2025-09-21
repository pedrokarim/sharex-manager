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

export const SettingsScreen: React.FC<NavigationProps> = ({ navigation }) => {
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
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Paramètres</Text>
        </View>

        {/* Configuration du serveur */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configuration du serveur</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>URL du serveur *</Text>
            <TextInput
              style={styles.textInput}
              value={settings.serverUrl}
              onChangeText={(text) =>
                setSettings({ ...settings, serverUrl: text })
              }
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
              onChangeText={(text) =>
                setSettings({ ...settings, apiKey: text })
              }
              placeholder="Votre clé API"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.testButton,
              isTestingConnection && styles.disabledButton,
            ]}
            onPress={handleTestConnection}
            disabled={isTestingConnection}
          >
            <Text style={styles.testButtonText}>
              {isTestingConnection
                ? "Test en cours..."
                : "Tester l'URL du serveur"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Options de l'application */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Options de l'application</Text>

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
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.disabledButton]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <Text style={styles.saveButtonText}>
              {isSaving ? "Sauvegarde..." : "Sauvegarder"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClearData}
          >
            <Text style={styles.clearButtonText}>Supprimer les données</Text>
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
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 30,
  },
  backButton: {
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: "#007AFF",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333333",
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
