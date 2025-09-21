// Composant d'icône moderne réutilisable

import React from "react";
import { Text, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { COLORS, SPACING, BORDER_RADIUS } from "../config/design";

interface ModernIconProps {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  color?: string;
  backgroundColor?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const ModernIcon: React.FC<ModernIconProps> = ({
  name,
  size = "md",
  color = COLORS.textPrimary,
  backgroundColor,
  style,
  textStyle,
}) => {
  const getSize = (): number => {
    switch (size) {
      case "sm":
        return 16;
      case "md":
        return 20;
      case "lg":
        return 24;
      case "xl":
        return 32;
      default:
        return 20;
    }
  };

  const getContainerStyle = (): ViewStyle => {
    const baseStyle: ViewStyle = {
      alignItems: "center",
      justifyContent: "center",
    };

    if (backgroundColor) {
      const iconSize = getSize();
      return {
        ...baseStyle,
        width: iconSize + SPACING.lg,
        height: iconSize + SPACING.lg,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor,
      };
    }

    return baseStyle;
  };

  const getTextStyle = (): TextStyle => {
    return {
      fontSize: getSize(),
      color,
      textAlign: "center",
    };
  };

  return (
    <Text style={[getContainerStyle(), getTextStyle(), style, textStyle]}>
      {name}
    </Text>
  );
};

// Composant d'icône avec fond coloré
interface IconButtonProps extends ModernIconProps {
  onPress?: () => void;
  disabled?: boolean;
}

export const IconButton: React.FC<IconButtonProps> = ({
  name,
  size = "md",
  color = COLORS.textInverse,
  backgroundColor = COLORS.primary,
  onPress,
  disabled = false,
  style,
  textStyle,
}) => {
  const iconSize = getSize();
  const containerSize = iconSize + SPACING.xxl;

  return (
    <ModernIcon
      name={name}
      size={size}
      color={color}
      backgroundColor={backgroundColor}
      style={[
        {
          width: containerSize,
          height: containerSize,
          borderRadius: BORDER_RADIUS.round,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
      textStyle={textStyle}
    />
  );
};

const getSize = (): number => {
  return 20; // Taille par défaut
};
