// Composant de carte moderne réutilisable

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TouchableOpacity,
} from "react-native";
import { COLORS, COMPONENT_COLORS, SPACING, BORDER_RADIUS, SHADOWS, TYPOGRAPHY } from "../config/design";

interface ModernCardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onPress?: () => void;
  style?: ViewStyle;
  variant?: "default" | "elevated" | "outlined";
  padding?: "sm" | "md" | "lg";
}

export const ModernCard: React.FC<ModernCardProps> = ({
  children,
  title,
  subtitle,
  onPress,
  style,
  variant = "default",
  padding = "md",
}) => {
  const getCardStyle = (): ViewStyle => {
    const baseStyle: ViewStyle = {
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: COLORS.background,
      ...SHADOWS.sm,
    };

    // Variantes
    switch (variant) {
      case "elevated":
        return {
          ...baseStyle,
          ...SHADOWS.md,
        };
      case "outlined":
        return {
          ...baseStyle,
          borderWidth: 1,
          borderColor: COLORS.border,
          shadowOpacity: 0,
          elevation: 0,
        };
      default:
        return baseStyle;
    }
  };

  const getPaddingStyle = (): ViewStyle => {
    switch (padding) {
      case "sm":
        return { padding: SPACING.sm };
      case "md":
        return { padding: SPACING.lg };
      case "lg":
        return { padding: SPACING.xxl };
      default:
        return { padding: SPACING.lg };
    }
  };

  const CardContent = () => (
    <View style={[getCardStyle(), getPaddingStyle(), style]}>
      {(title || subtitle) && (
        <View style={styles.header}>
          {title && <Text style={styles.title}>{title}</Text>}
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      )}
      {children}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.95}>
        <CardContent />
      </TouchableOpacity>
    );
  }

  return <CardContent />;
};

const styles = StyleSheet.create({
  header: {
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
});
