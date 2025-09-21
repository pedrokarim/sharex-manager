// Composant de bouton moderne réutilisable

import React from "react";
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from "react-native";
import {
  COLORS,
  COMPONENT_COLORS,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
} from "../config/design";
import { Icon } from "./Icon";

interface ModernButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "accent" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  iconType?: "ionicons" | "material" | "antdesign" | "feather";
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const ModernButton: React.FC<ModernButtonProps> = ({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  icon,
  iconType = "ionicons",
  style,
  textStyle,
}) => {
  const getButtonStyle = (): ViewStyle => {
    const baseStyle: ViewStyle = {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: BORDER_RADIUS.lg,
      marginBottom: SPACING.md,
    };

    // Variantes de couleur
    switch (variant) {
      case "primary":
        baseStyle.backgroundColor = COMPONENT_COLORS.buttonPrimary;
        break;
      case "secondary":
        baseStyle.backgroundColor = COMPONENT_COLORS.buttonSecondary;
        break;
      case "accent":
        baseStyle.backgroundColor = COMPONENT_COLORS.buttonAccent;
        break;
      case "danger":
        baseStyle.backgroundColor = COMPONENT_COLORS.buttonDanger;
        break;
      case "ghost":
        baseStyle.backgroundColor = "transparent";
        baseStyle.borderWidth = 1;
        baseStyle.borderColor = COLORS.border;
        break;
    }

    // Tailles
    switch (size) {
      case "sm":
        baseStyle.paddingVertical = SPACING.md;
        baseStyle.paddingHorizontal = SPACING.lg;
        break;
      case "md":
        baseStyle.paddingVertical = SPACING.lg;
        baseStyle.paddingHorizontal = SPACING.xl;
        break;
      case "lg":
        baseStyle.paddingVertical = SPACING.xl;
        baseStyle.paddingHorizontal = SPACING.xxl;
        break;
    }

    // État désactivé
    if (disabled || loading) {
      baseStyle.opacity = 0.6;
    }

    return baseStyle;
  };

  const getTextStyle = (): TextStyle => {
    const baseStyle: TextStyle = {
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      textAlign: "center",
      color: COLORS.textInverse,
    };

    // Tailles de texte
    switch (size) {
      case "sm":
        baseStyle.fontSize = TYPOGRAPHY.fontSize.sm;
        break;
      case "md":
        baseStyle.fontSize = TYPOGRAPHY.fontSize.md;
        break;
      case "lg":
        baseStyle.fontSize = TYPOGRAPHY.fontSize.lg;
        break;
    }

    // Couleurs de texte
    if (variant === "ghost") {
      baseStyle.color = COLORS.textPrimary;
    }

    return baseStyle;
  };

  return (
    <TouchableOpacity
      style={[getButtonStyle(), style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "ghost" ? COLORS.primary : COLORS.textInverse}
          size="small"
        />
      ) : (
        <View style={styles.buttonContent}>
          {icon && (
            <Icon
              name={icon}
              size={20}
              color={variant === "ghost" ? COLORS.primary : COLORS.textInverse}
              type={iconType}
            />
          )}
          <Text style={[getTextStyle(), textStyle]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
});
