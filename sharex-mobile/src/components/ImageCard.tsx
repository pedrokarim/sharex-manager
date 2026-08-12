// Composant de carte d'image pour la vue grille

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { UploadHistoryItem } from "../types";
import { ViewMode } from "./ViewSelector";
import { Icon } from "./Icon";
import { HistoryImage } from "./HistoryImage";
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
          <HistoryImage
            item={item}
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
        <HistoryImage
          item={item}
          style={styles.miniImage}
          resizeMode="cover"
        />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress(item)}>
      <View style={styles.imageContainer}>
        <HistoryImage
          item={item}
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
    margin: 0,
    backgroundColor: COMPONENT_COLORS.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    overflow: "hidden",
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  imageContainer: {
    position: "relative",
    aspectRatio: 1,
    borderRadius: BORDER_RADIUS.lg,
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
    backgroundColor: "rgba(74, 29, 120, 0.88)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.round,
  },
  dateText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: TYPOGRAPHY.rounded,
  },
  infoContainer: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filename: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
    fontFamily: TYPOGRAPHY.rounded,
    marginBottom: 4,
    flex: 1,
    marginRight: 8,
  },
  sizeText: {
    fontSize: 12,
    color: COLORS.textTertiary,
  },
  // Styles pour le mode liste
  listContainer: {
    flexDirection: "row",
    backgroundColor: COMPONENT_COLORS.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: 8,
    padding: 12,
    shadowColor: COLORS.primaryDark,
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
    fontWeight: "600",
    color: COLORS.textPrimary,
    fontFamily: TYPOGRAPHY.rounded,
    marginBottom: 4,
    flex: 1,
    marginRight: 8,
  },
  listSizeText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  listDateText: {
    fontSize: 11,
    color: COLORS.textTertiary,
  },
  // Styles pour le mode mini-grille
  miniContainer: {
    aspectRatio: 1,
    borderRadius: BORDER_RADIUS.md,
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
