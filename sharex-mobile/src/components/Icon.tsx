// Composant d'icône moderne avec @expo/vector-icons

import React from "react";
import { ViewStyle, TextStyle } from "react-native";
import {
  Ionicons,
  MaterialIcons,
  AntDesign,
  Feather,
} from "@expo/vector-icons";
import { COLORS } from "../config/design";

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  backgroundColor?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
  type?: "ionicons" | "material" | "antdesign" | "feather";
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = 24,
  color = COLORS.textPrimary,
  backgroundColor,
  style,
  textStyle,
  type = "ionicons",
}) => {
  const getIconComponent = () => {
    const iconProps = {
      name: name as any,
      size,
      color,
      style: textStyle,
    };

    switch (type) {
      case "ionicons":
        return <Ionicons {...iconProps} />;
      case "material":
        return <MaterialIcons {...iconProps} />;
      case "antdesign":
        return <AntDesign {...iconProps} />;
      case "feather":
        return <Feather {...iconProps} />;
      default:
        return <Ionicons {...iconProps} />;
    }
  };

  if (backgroundColor) {
    return (
      <View
        style={[
          {
            width: size + 16,
            height: size + 16,
            borderRadius: (size + 16) / 2,
            backgroundColor,
            justifyContent: "center",
            alignItems: "center",
          },
          style,
        ]}
      >
        {getIconComponent()}
      </View>
    );
  }

  return getIconComponent();
};

// Composant d'icône avec fond coloré
interface IconButtonProps extends IconProps {
  onPress?: () => void;
  disabled?: boolean;
}

export const IconButton: React.FC<IconButtonProps> = ({
  name,
  size = 24,
  color = COLORS.textInverse,
  backgroundColor = COLORS.primary,
  onPress,
  disabled = false,
  style,
  textStyle,
  type = "ionicons",
}) => {
  return (
    <Icon
      name={name}
      size={size}
      color={color}
      backgroundColor={backgroundColor}
      style={[
        {
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
      textStyle={textStyle}
      type={type}
    />
  );
};

