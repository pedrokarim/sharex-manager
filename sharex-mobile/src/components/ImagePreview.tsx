// Composant de prévisualisation d'image

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  Dimensions,
} from "react-native";
import { Modal } from "react-native";
import { Icon } from "./Icon";
import { ClipboardService } from "../services/clipboard";
import { extractDominantColor, withOpacity } from "../services/colorExtractor";
import { COMPONENT_COLORS } from "../config/design";

const { width, height } = Dimensions.get("window");

interface ImagePreviewProps {
  visible: boolean;
  imageUri: string;
  filename: string;
  url?: string;
  onClose: () => void;
  onDelete?: () => void;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({
  visible,
  imageUri,
  filename,
  url,
  onClose,
  onDelete,
}) => {
  const [dominantColor, setDominantColor] = useState<string>("#6366F1");
  const [isDark, setIsDark] = useState<boolean>(false);

  // Extraire la couleur dominante quand l'image change
  useEffect(() => {
    if (visible && imageUri) {
      extractDominantColor(imageUri).then((result) => {
        setDominantColor(result.dominant);
        setIsDark(result.isDark);
      });
    }
  }, [visible, imageUri]);

  const handleCopyUrl = async () => {
    if (url) {
      await ClipboardService.copyUrl(url);
      Alert.alert("Succès", "URL copiée dans le presse-papiers !");
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Supprimer l'image",
      "Êtes-vous sûr de vouloir supprimer cette image de l'historique ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: onDelete,
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header avec couleur dominante */}
          <View
            style={[
              styles.header,
              { backgroundColor: withOpacity(dominantColor, 0.95) },
            ]}
          >
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon
                name="close"
                size={24}
                color={isDark ? "#ffffff" : "#000000"}
                type="ionicons"
              />
            </TouchableOpacity>
            <Text
              style={[
                styles.filename,
                { color: isDark ? "#ffffff" : "#000000" },
              ]}
              numberOfLines={1}
            >
              {filename}
            </Text>
            <View style={styles.placeholder} />
          </View>

          {/* Image */}
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: imageUri }}
              style={styles.image}
              resizeMode="contain"
            />
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {url && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleCopyUrl}
              >
                <Icon name="copy" size={20} color="#007AFF" type="ionicons" />
                <Text style={styles.actionText}>Copier l'URL</Text>
              </TouchableOpacity>
            )}

            {onDelete && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleDelete}
              >
                <Icon name="trash" size={20} color="#FF3B30" type="ionicons" />
                <Text style={[styles.actionText, { color: "#FF3B30" }]}>
                  Supprimer
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: width * 0.9,
    height: height * 0.8,
    backgroundColor: COMPONENT_COLORS.cardBackground,
    borderRadius: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    // backgroundColor sera défini dynamiquement
  },
  closeButton: {
    padding: 4,
  },
  filename: {
    flex: 1,
    // color sera défini dynamiquement
    fontSize: 16,
    fontWeight: "500",
    marginHorizontal: 12,
    textAlign: "center",
  },
  placeholder: {
    width: 32,
  },
  imageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  actions: {
    flexDirection: "row",
    padding: 16,
    backgroundColor: COMPONENT_COLORS.cardBackground,
    borderTopWidth: 1,
    borderTopColor: "#E5E5EA",
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    marginHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#F2F2F7",
  },
  actionText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: "500",
    color: "#007AFF",
  },
});
