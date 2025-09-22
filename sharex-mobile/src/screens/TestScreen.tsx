// Écran de test pour les fonctionnalités de développement

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationProps } from "../types";
import { StorageService } from "../services/storage";
import { Icon } from "../components/Icon";
import { ModernButton } from "../components/ModernButton";
import { ModernCard } from "../components/ModernCard";
import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY } from "../config/design";

export const TestScreen: React.FC<NavigationProps> = ({ navigation }) => {
  const handleResetOnboarding = () => {
    Alert.alert(
      "Relancer l'onboarding",
      "Voulez-vous relancer l'écran d'onboarding ? Cela vous permettra de revoir les fonctionnalités de l'application.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Relancer",
          onPress: async () => {
            try {
              await StorageService.setOnboardingCompleted(false);
              Alert.alert(
                "Succès",
                "L'onboarding sera relancé au prochain redémarrage de l'application.",
                [
                  {
                    text: "OK",
                    onPress: () => {
                      // Optionnel : redémarrer l'app ou naviguer vers l'onboarding
                      // Pour l'instant, on laisse l'utilisateur redémarrer manuellement
                    },
                  },
                ]
              );
            } catch (error) {
              console.error(
                "Erreur lors de la réinitialisation de l'onboarding:",
                error
              );
              Alert.alert(
                "Erreur",
                "Impossible de réinitialiser l'onboarding."
              );
            }
          },
        },
      ]
    );
  };

  const handleTestShareIntent = () => {
    navigation.navigate("ShareTest");
  };

  const handleTestQRScanner = () => {
    // Navigation vers un écran de test QR si nécessaire
    Alert.alert(
      "Test QR Scanner",
      "Fonctionnalité de test du scanner QR Code",
      [{ text: "OK" }]
    );
  };

  const handleTestImagePicker = () => {
    // Test de l'image picker
    Alert.alert(
      "Test Image Picker",
      "Fonctionnalité de test du sélecteur d'images",
      [{ text: "OK" }]
    );
  };

  const handleTestAPI = () => {
    // Test de l'API
    Alert.alert("Test API", "Fonctionnalité de test de l'API", [
      { text: "OK" },
    ]);
  };

  const handleClearAllData = () => {
    Alert.alert(
      "Supprimer toutes les données",
      "Êtes-vous sûr de vouloir supprimer toutes les données de test ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              await StorageService.clearAll();
              Alert.alert(
                "Succès",
                "Toutes les données de test ont été supprimées."
              );
            } catch (error) {
              console.error("Erreur lors de la suppression:", error);
              Alert.alert("Erreur", "Impossible de supprimer les données.");
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.backgroundSecondary}
      />

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
        <Text style={styles.title}>Tests & Debug</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Avertissement */}
        <ModernCard title="⚠️ Mode Développement" variant="elevated">
          <Text style={styles.warningText}>
            Cette section contient des outils de test et de debug. Ces
            fonctionnalités ne sont disponibles qu'en mode développement.
          </Text>
        </ModernCard>

        {/* Tests de Navigation */}
        <ModernCard title="🧪 Tests de Navigation" variant="elevated">
          <ModernButton
            title="Relancer l'onboarding"
            onPress={handleResetOnboarding}
            variant="secondary"
            size="md"
            icon="refresh"
            iconType="ionicons"
          />

          <ModernButton
            title="Test Share Intent"
            onPress={handleTestShareIntent}
            variant="secondary"
            size="md"
            icon="share"
            iconType="ionicons"
          />
        </ModernCard>

        {/* Tests de Fonctionnalités */}
        <ModernCard title="🔧 Tests de Fonctionnalités" variant="elevated">
          <ModernButton
            title="Test QR Scanner"
            onPress={handleTestQRScanner}
            variant="secondary"
            size="md"
            icon="qr-code"
            iconType="ionicons"
          />

          <ModernButton
            title="Test Image Picker"
            onPress={handleTestImagePicker}
            variant="secondary"
            size="md"
            icon="images"
            iconType="ionicons"
          />

          <ModernButton
            title="Test API"
            onPress={handleTestAPI}
            variant="secondary"
            size="md"
            icon="wifi"
            iconType="ionicons"
          />
        </ModernCard>

        {/* Actions de Debug */}
        <ModernCard title="🗑️ Actions de Debug" variant="elevated">
          <ModernButton
            title="Supprimer toutes les données"
            onPress={handleClearAllData}
            variant="danger"
            size="md"
            icon="trash"
            iconType="ionicons"
          />
        </ModernCard>

        {/* Informations de Debug */}
        <ModernCard title="ℹ️ Informations de Debug" variant="elevated">
          <View style={styles.infoContainer}>
            <Text style={styles.infoTitle}>Version de l'app :</Text>
            <Text style={styles.infoText}>1.0.0</Text>
          </View>

          <View style={styles.infoContainer}>
            <Text style={styles.infoTitle}>Mode :</Text>
            <Text style={styles.infoText}>Développement</Text>
          </View>

          <View style={styles.infoContainer}>
            <Text style={styles.infoTitle}>Package Android :</Text>
            <Text style={styles.infoText}>re.ascencia.sharexmanager</Text>
          </View>
        </ModernCard>
      </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
    padding: SPACING.lg,
    paddingBottom: 50, // Espace pour la bottom bar
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    backgroundColor: COLORS.backgroundSecondary,
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
  warningText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
    lineHeight: TYPOGRAPHY.lineHeight.relaxed * TYPOGRAPHY.fontSize.sm,
    textAlign: "center",
  },
  infoContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  infoTitle: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  infoText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textPrimary,
    fontWeight: TYPOGRAPHY.fontWeight.normal,
  },
});
