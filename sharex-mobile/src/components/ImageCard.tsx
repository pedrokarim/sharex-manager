// Composant de carte d'image pour la vue grille

import React from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { UploadHistoryItem } from "../types";

interface ImageCardProps {
  item: UploadHistoryItem;
  onPress: (item: UploadHistoryItem) => void;
}

export const ImageCard: React.FC<ImageCardProps> = ({ item, onPress }) => {
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("fr-FR", {
      month: "short",
      day: "numeric",
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress(item)}>
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: item.url }}
          style={styles.image}
          resizeMode="cover"
        />
        <View style={styles.overlay}>
          <Text style={styles.dateText}>{formatDate(item.uploadedAt)}</Text>
        </View>
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.filename} numberOfLines={1}>
          {item.filename}
        </Text>
        <Text style={styles.sizeText}>{formatFileSize(item.size)}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    margin: 4,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  imageContainer: {
    position: "relative",
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  overlay: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dateText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "500",
  },
  infoContainer: {
    padding: 12,
  },
  filename: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333333",
    marginBottom: 4,
  },
  sizeText: {
    fontSize: 12,
    color: "#666666",
  },
});

