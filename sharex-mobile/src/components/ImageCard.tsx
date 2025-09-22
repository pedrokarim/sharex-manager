// Composant de carte d'image pour la vue grille

import React from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { UploadHistoryItem } from "../types";
import { ViewMode } from "./ViewSelector";
import { Icon } from "./Icon";
import {
  COLORS,
  COMPONENT_COLORS,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
} from "../config/design";

interface ImageCardProps {
  item: UploadHistoryItem;
  onPress: (item: UploadHistoryItem) => void;
  onMenuPress: (item: UploadHistoryItem) => void;
  viewMode?: ViewMode;
}

export const ImageCard: React.FC<ImageCardProps> = ({
  item,
  onPress,
  onMenuPress,
  viewMode = "grid",
}) => {
  const handleMenuPress = (e: any) => {
    e.stopPropagation();
    onMenuPress(item);
  };

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

  if (viewMode === "list") {
    return (
      <TouchableOpacity
        style={styles.listContainer}
        onPress={() => onPress(item)}
      >
        <View style={styles.listImageContainer}>
          <Image
            source={{ uri: item.localUri }}
            style={styles.listImage}
            resizeMode="cover"
          />
        </View>

        <View style={styles.listInfoContainer}>
          <View style={styles.listTextContainer}>
            <View style={styles.listFirstLine}>
              <Text style={styles.listFilename} numberOfLines={1}>
                {item.filename}
              </Text>
              <TouchableOpacity
                style={styles.menuButton}
                onPress={handleMenuPress}
              >
                <Icon
                  name="ellipsis-vertical"
                  size={16}
                  color={COLORS.textSecondary}
                  type="ionicons"
                />
              </TouchableOpacity>
            </View>
            <Text style={styles.listSizeText}>{formatFileSize(item.size)}</Text>
            <Text style={styles.listDateText}>
              {formatDate(item.uploadedAt)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  if (viewMode === "mini-grid") {
    return (
      <TouchableOpacity
        style={styles.miniContainer}
        onPress={() => onPress(item)}
      >
        <Image
          source={{ uri: item.localUri }}
          style={styles.miniImage}
          resizeMode="cover"
        />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress(item)}>
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: item.localUri }}
          style={styles.image}
          resizeMode="cover"
        />
        <View style={styles.overlay}>
          <Text style={styles.dateText}>{formatDate(item.uploadedAt)}</Text>
        </View>
      </View>

      <View style={styles.infoContainer}>
        <View style={styles.gridTextContainer}>
          <View style={styles.gridFirstLine}>
            <Text style={styles.filename} numberOfLines={1}>
              {item.filename}
            </Text>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={handleMenuPress}
            >
              <Icon
                name="ellipsis-vertical"
                size={16}
                color={COLORS.textSecondary}
                type="ionicons"
              />
            </TouchableOpacity>
          </View>
          <Text style={styles.sizeText}>{formatFileSize(item.size)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    margin: 4,
    backgroundColor: COMPONENT_COLORS.cardBackground,
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
    flex: 1,
    marginRight: 8,
  },
  sizeText: {
    fontSize: 12,
    color: "#666666",
  },
  // Styles pour le mode liste
  listContainer: {
    flexDirection: "row",
    backgroundColor: COMPONENT_COLORS.cardBackground,
    borderRadius: 12,
    marginBottom: 8,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    alignItems: "center",
  },
  listImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: "hidden",
    marginRight: 12,
  },
  listImage: {
    width: "100%",
    height: "100%",
  },
  listInfoContainer: {
    flex: 1,
    justifyContent: "center",
  },
  listFilename: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333333",
    marginBottom: 4,
    flex: 1,
    marginRight: 8,
  },
  listSizeText: {
    fontSize: 12,
    color: "#666666",
    marginBottom: 2,
  },
  listDateText: {
    fontSize: 11,
    color: "#999999",
  },
  // Styles pour le mode mini-grille
  miniContainer: {
    aspectRatio: 1,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#f5f5f5",
  },
  miniImage: {
    width: "100%",
    height: "100%",
  },
  // Styles pour le menu contextuel
  listTextContainer: {
    flex: 1,
    justifyContent: "center",
  },
  listFirstLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  gridTextContainer: {
    flex: 1,
  },
  gridFirstLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  menuButton: {
    padding: 8,
    borderRadius: 4,
    backgroundColor: "transparent",
  },
});
