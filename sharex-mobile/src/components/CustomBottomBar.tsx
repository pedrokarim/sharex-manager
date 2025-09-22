// Bottom bar personnalisée moderne

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Icon } from "./Icon";
import {
  COLORS,
  COMPONENT_COLORS,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
} from "../config/design";

const { width } = Dimensions.get("window");

export type TabName = "home" | "stats" | "settings" | "about";

interface TabItem {
  name: TabName;
  label: string;
  icon: string;
  iconType: "ionicons" | "material" | "antdesign" | "feather";
}

interface CustomBottomBarProps {
  activeTab: TabName;
  onTabPress: (tab: TabName) => void;
}

const tabs: TabItem[] = [
  {
    name: "home",
    label: "Accueil",
    icon: "home",
    iconType: "ionicons",
  },
  {
    name: "stats",
    label: "Stats",
    icon: "stats-chart",
    iconType: "ionicons",
  },
  {
    name: "settings",
    label: "Paramètres",
    icon: "settings",
    iconType: "ionicons",
  },
  {
    name: "about",
    label: "À propos",
    icon: "information-circle",
    iconType: "ionicons",
  },
];

export const CustomBottomBar: React.FC<CustomBottomBarProps> = ({
  activeTab,
  onTabPress,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.name;
          return (
            <TouchableOpacity
              key={tab.name}
              style={[styles.tab, isActive && styles.activeTab]}
              onPress={() => onTabPress(tab.name)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.iconContainer,
                  isActive && styles.activeIconContainer,
                ]}
              >
                <Icon
                  name={tab.icon}
                  size={20}
                  color={isActive ? COLORS.textInverse : COLORS.textTertiary}
                  type={tab.iconType}
                />
              </View>
              {isActive && <Text style={styles.tabLabel}>{tab.label}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    paddingTop: SPACING.md,
    backgroundColor: "transparent",
  },
  bar: {
    flexDirection: "row",
    backgroundColor: COMPONENT_COLORS.cardBackground,
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    minHeight: 48,
  },
  activeTab: {
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  activeIconContainer: {
    // Pas de style supplémentaire pour l'icône active
  },
  tabLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.textInverse,
  },
});
