// Composant de sélection de vue pour la galerie

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Icon } from "./Icon";
import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY } from "../config/design";

export type ViewMode = "grid" | "list" | "mini-grid";

interface ViewSelectorProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export const ViewSelector: React.FC<ViewSelectorProps> = ({
  currentView,
  onViewChange,
}) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, currentView === "grid" && styles.activeButton]}
        onPress={() => onViewChange("grid")}
      >
        <Icon
          name="grid"
          size={16}
          color={
            currentView === "grid" ? COLORS.textInverse : COLORS.textTertiary
          }
          type="ionicons"
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, currentView === "list" && styles.activeButton]}
        onPress={() => onViewChange("list")}
      >
        <Icon
          name="list"
          size={16}
          color={
            currentView === "list" ? COLORS.textInverse : COLORS.textTertiary
          }
          type="ionicons"
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.button,
          currentView === "mini-grid" && styles.activeButton,
        ]}
        onPress={() => onViewChange("mini-grid")}
      >
        <Icon
          name="apps"
          size={16}
          color={
            currentView === "mini-grid"
              ? COLORS.textInverse
              : COLORS.textTertiary
          }
          type="ionicons"
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.round,
    padding: 4,
    flex: 0,
    maxWidth: 156,
    gap: 4,
  },
  button: {
    flex: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 38,
  },
  activeButton: {
    backgroundColor: COLORS.primary,
  },
  buttonText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  activeButtonText: {
    color: COLORS.textInverse,
  },
});
