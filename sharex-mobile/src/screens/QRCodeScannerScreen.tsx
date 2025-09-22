import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  StatusBar,
  Modal,
} from "react-native";
import { CameraView, Camera } from "expo-camera";
import { Icon } from "../components/Icon";
import { ModernButton } from "../components/ModernButton";
import { COLORS, TYPOGRAPHY, SPACING } from "../config/design";
import { StorageService } from "../services/storage";
import { AppSettings } from "../types";

const { width, height } = Dimensions.get("window");

export interface QRCodeScannerScreenProps {
  visible: boolean;
  onClose: () => void;
}

export const QRCodeScannerScreen: React.FC<QRCodeScannerScreenProps> = ({
  visible,
  onClose,
}) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    getCameraPermissions();
  }, []);

  const getCameraPermissions = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === "granted");
  };

  const handleBarCodeScanned = async ({
    type,
    data,
  }: {
    type: string;
    data: string;
  }) => {
    if (scanned) return;

    setScanned(true);
    setIsLoading(true);

    try {
      const config = JSON.parse(data);

      // Vérifier que c'est bien un QR code de configuration ShareX
      if (config.type !== "sharex-mobile-config") {
        Alert.alert(
          "QR Code invalide",
          "Ce QR code n'est pas une configuration ShareX Manager valide.",
          [{ text: "OK", onPress: () => setScanned(false) }]
        );
        return;
      }

      // Sauvegarder la configuration
      const settings: AppSettings = {
        serverUrl: config.serverUrl,
        apiKey: config.apiKey,
        allowImageEditing: true,
        autoUpload: false,
        notifications: true,
        theme: "auto",
      };

      await StorageService.saveSettings(settings);

      Alert.alert(
        "Configuration appliquée !",
        "La configuration a été appliquée avec succès. Vous pouvez maintenant utiliser l'application.",
        [
          {
            text: "OK",
            onPress: () => {
              onClose();
            },
          },
        ]
      );
    } catch (error) {
      console.error("Erreur lors du scan du QR code:", error);
      Alert.alert(
        "Erreur",
        "Impossible de lire le QR code. Veuillez réessayer.",
        [{ text: "OK", onPress: () => setScanned(false) }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const resetScanner = () => {
    setScanned(false);
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Demande d'autorisation caméra...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Icon
            name="camera-off"
            size={64}
            color={COLORS.textSecondary}
            type="feather"
          />
          <Text style={styles.title}>Caméra non autorisée</Text>
          <Text style={styles.message}>
            L'accès à la caméra est nécessaire pour scanner le QR code.
          </Text>
          <ModernButton
            title="Autoriser la caméra"
            onPress={getCameraPermissions}
            variant="primary"
            size="lg"
            style={styles.button}
          />
          <ModernButton
            title="Retour"
            onPress={onClose}
            variant="ghost"
            size="lg"
            style={styles.button}
          />
        </View>
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent
        />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onClose}>
            <Icon
              name="arrow-left"
              size={24}
              color={COLORS.background}
              type="feather"
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scanner QR Code</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Camera */}
        <View style={styles.cameraContainer}>
          <CameraView
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            style={styles.camera}
            barcodeScannerSettings={{
              barcodeTypes: ["qr"],
            }}
          />

          {/* Overlay */}
          <View style={styles.overlay}>
            <View style={styles.scanArea}>
              <View style={styles.corner} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
          </View>

          {/* Instructions */}
          <View style={styles.instructionsContainer}>
            <Text style={styles.instructions}>
              Pointez la caméra vers le QR code de configuration
            </Text>
          </View>
        </View>

        {/* Bottom Actions */}
        <View style={styles.bottomContainer}>
          {scanned && (
            <ModernButton
              title="Scanner à nouveau"
              onPress={resetScanner}
              variant="secondary"
              size="lg"
              style={styles.actionButton}
            />
          )}

          {isLoading && (
            <View style={styles.loadingContainer}>
              <Icon
                name="loader"
                size={24}
                color={COLORS.primary}
                type="feather"
              />
              <Text style={styles.loadingText}>Configuration en cours...</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: StatusBar.currentHeight || 44,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.backgroundSecondary,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryBg,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.textPrimary,
  },
  placeholder: {
    width: 40,
  },
  cameraContainer: {
    flex: 1,
    position: "relative",
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  scanArea: {
    width: 250,
    height: 250,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderColor: COLORS.primary,
    borderWidth: 3,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    transform: [{ rotate: "90deg" }],
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    transform: [{ rotate: "-90deg" }],
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    transform: [{ rotate: "180deg" }],
  },
  instructionsContainer: {
    position: "absolute",
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
  },
  instructions: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.background,
    textAlign: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
  },
  bottomContainer: {
    padding: SPACING.lg,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  actionButton: {
    marginBottom: SPACING.sm,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.md,
  },
  loadingText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.background,
    marginLeft: SPACING.sm,
  },
  permissionContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xl,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.textPrimary,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  message: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.xl,
  },
  button: {
    marginBottom: SPACING.md,
    width: "100%",
  },
});
