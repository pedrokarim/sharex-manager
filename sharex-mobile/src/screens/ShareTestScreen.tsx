// Écran de test pour le Share Intent

import React, { useState } from "react";
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
import { SimpleShareIntentService } from "../services/simpleShareIntent";
import { Icon } from "../components/Icon";
import { COLORS } from "../config/design";

export const ShareTestScreen: React.FC<NavigationProps> = ({ navigation }) => {
  const [testResults, setTestResults] = useState<string[]>([]);

  const addTestResult = (result: string) => {
    setTestResults((prev) => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${result}`,
    ]);
  };

  const testShareIntent = () => {
    addTestResult("Test du Share Intent lancé");

    const instructions = SimpleShareIntentService.getTestInstructions();
    const instructionText = instructions.join("\n");

    Alert.alert(
      "Test Share Intent",
      `Pour tester le Share Intent:\n\n${instructionText}\n\nIMPORTANT: L'app n'apparaîtra dans la liste de partage qu'avec un build natif (pas Expo Go) !`,
      [
        { text: "OK" },
        {
          text: "Simuler le test",
          onPress: () => {
            addTestResult("Simulation d'un Share Intent");
            // Simuler la navigation vers l'écran d'upload
            navigation.navigate("Upload", {
              image: {
                uri: "https://via.placeholder.com/300x200/007AFF/FFFFFF?text=Test+Image",
                name: "test_shared_image.jpg",
                type: "image/jpeg",
                size: 1024,
                width: 300,
                height: 200,
              },
            });
          },
        },
      ]
    );
  };

  const clearResults = () => {
    setTestResults([]);
  };

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
            <Icon
              name="arrow-back"
              size={20}
              color={COLORS.primary}
              type="ionicons"
            />
            <Text style={styles.backButtonText}>Retour</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Test Share Intent</Text>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsTitle}>
            Comment tester le Share Intent :
          </Text>

          <View style={styles.stepContainer}>
            <Text style={styles.stepNumber}>1</Text>
            <Text style={styles.stepText}>Ouvrez votre galerie d'images</Text>
          </View>

          <View style={styles.stepContainer}>
            <Text style={styles.stepNumber}>2</Text>
            <Text style={styles.stepText}>Sélectionnez une image</Text>
          </View>

          <View style={styles.stepContainer}>
            <Text style={styles.stepNumber}>3</Text>
            <Text style={styles.stepText}>
              Appuyez sur le bouton "Partager"
            </Text>
          </View>

          <View style={styles.stepContainer}>
            <Text style={styles.stepNumber}>4</Text>
            <Text style={styles.stepText}>
              Choisissez "ShareX Manager" dans la liste
            </Text>
          </View>

          <View style={styles.stepContainer}>
            <Text style={styles.stepNumber}>5</Text>
            <Text style={styles.stepText}>
              L'image devrait s'ouvrir directement dans l'app !
            </Text>
          </View>
        </View>

        {/* Bouton de test */}
        <TouchableOpacity style={styles.testButton} onPress={testShareIntent}>
          <Text style={styles.testButtonText}>🧪 Lancer le test</Text>
        </TouchableOpacity>

        {/* Résultats des tests */}
        {testResults.length > 0 && (
          <View style={styles.resultsContainer}>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>Résultats des tests :</Text>
              <TouchableOpacity onPress={clearResults}>
                <Text style={styles.clearButton}>Effacer</Text>
              </TouchableOpacity>
            </View>

            {testResults.map((result, index) => (
              <Text key={index} style={styles.resultText}>
                {result}
              </Text>
            ))}
          </View>
        )}

        {/* Informations techniques */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>Informations techniques :</Text>
          <Text style={styles.infoText}>
            • Scheme: sharex-manager{"\n"}• Intent Filters: SEND, SEND_MULTIPLE
            {"\n"}• Types supportés: image/*{"\n"}• Plateformes: Android, iOS
          </Text>
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
    fontSize: 24,
    fontWeight: "bold",
    color: "#333333",
  },
  instructionsContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333333",
    marginBottom: 16,
  },
  stepContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#007AFF",
    color: "#ffffff",
    textAlign: "center",
    lineHeight: 24,
    fontSize: 14,
    fontWeight: "600",
    marginRight: 12,
  },
  stepText: {
    flex: 1,
    fontSize: 16,
    color: "#333333",
  },
  testButton: {
    backgroundColor: "#34C759",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 20,
  },
  testButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  resultsContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  resultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333333",
  },
  clearButton: {
    fontSize: 14,
    color: "#FF3B30",
    fontWeight: "500",
  },
  resultText: {
    fontSize: 14,
    color: "#666666",
    marginBottom: 4,
    fontFamily: "monospace",
  },
  infoContainer: {
    backgroundColor: "#E3F2FD",
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#2196F3",
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1976D2",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: "#1976D2",
    lineHeight: 20,
  },
});
