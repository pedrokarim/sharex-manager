// Composant de sélection de vue pour la galerie

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Icon } from "./Icon";

export type ViewMode = "grid" | "list";

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
          color={currentView === "grid" ? "#ffffff" : "#8E8E93"}
          type="ionicons"
        />
        <Text
          style={[
            styles.buttonText,
            currentView === "grid" && styles.activeButtonText,
          ]}
        >
          Grille
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, currentView === "list" && styles.activeButton]}
        onPress={() => onViewChange("list")}
      >
        <Icon
          name="list"
          size={16}
          color={currentView === "list" ? "#ffffff" : "#8E8E93"}
          type="ionicons"
        />
        <Text
          style={[
            styles.buttonText,
            currentView === "list" && styles.activeButtonText,
          ]}
        >
          Liste
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 4,
    marginHorizontal: 20,
    marginVertical: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 36,
  },
  activeButton: {
    backgroundColor: "#007AFF",
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666666",
    marginLeft: 6,
  },
  activeButtonText: {
    color: "#ffffff",
  },
});
