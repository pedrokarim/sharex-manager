import { Platform } from "react-native";

/**
 * Editorial design system inspired by the warm, playful Behance reference.
 * The names from the previous theme are intentionally preserved so legacy
 * screens and utilities inherit the redesign without carrying two palettes.
 */
export const COLORS = {
  primary: "#4A1D78",
  primaryLight: "#B891D6",
  primaryDark: "#31104F",
  primaryBg: "#F1E8F7",

  secondary: "#F47F5B",
  secondaryLight: "#FFB29A",
  secondaryDark: "#D95F3C",
  secondaryBg: "#FFE5DB",

  accent: "#F6B85F",
  accentLight: "#FFF0CC",
  accentDark: "#D9912D",

  success: "#39866D",
  successLight: "#DDF2E9",
  successDark: "#24634F",
  error: "#C95050",
  errorLight: "#FBE4E1",
  errorDark: "#A93C3C",
  warning: "#D98A2B",
  warningLight: "#FFF0D5",
  warningDark: "#A96618",
  info: "#5C8FC7",
  infoLight: "#E3F0FB",
  infoDark: "#3B6FAD",

  white: "#FFFFFF",
  black: "#1F171C",
  gray50: "#FFF9F6",
  gray100: "#F8EEE9",
  gray200: "#ECDCD4",
  gray300: "#D9C7C0",
  gray400: "#B6A6A3",
  gray500: "#897A7D",
  gray600: "#6D5F64",
  gray700: "#51434A",
  gray800: "#382D33",
  gray900: "#251C21",

  textPrimary: "#251C21",
  textSecondary: "#6F6268",
  textTertiary: "#94868A",
  textInverse: "#FFFFFF",

  background: "#FFF7F2",
  backgroundSecondary: "#FFF1EB",
  backgroundTertiary: "#F4E6DF",
  surface: "#FFFFFF",
  coral: "#F47F5B",
  peach: "#FFD3C2",
  lavender: "#CDA9E8",
  purpleCard: "#7650A3",

  border: "#EEDDD5",
  borderLight: "#F5E9E3",
  borderDark: "#D7C2B9",
  shadow: "rgba(62, 27, 52, 0.12)",
  shadowLight: "rgba(62, 27, 52, 0.06)",
  shadowDark: "rgba(62, 27, 52, 0.18)",

  gradientStart: "#F69069",
  gradientEnd: "#F3B3BE",
  gradientSecondary: "#7650A3",
  gradientAccent: "#F6B85F",
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 28,
  huge: 36,
} as const;

export const BORDER_RADIUS = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  xxl: 32,
  round: 999,
} as const;

export const SHADOWS = {
  sm: {
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  md: {
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 5,
  },
  lg: {
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 9,
  },
} as const;

export const TYPOGRAPHY = {
  family: Platform.select({ ios: "Avenir Next", android: "sans-serif", default: "System" }),
  rounded: Platform.select({ ios: "Avenir Next", android: "sans-serif-medium", default: "System" }),
  fontSize: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    xxxl: 30,
    huge: 38,
  },
  fontWeight: {
    light: "300",
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
    black: "900",
  },
  lineHeight: { tight: 1.15, normal: 1.4, relaxed: 1.6, loose: 1.8 },
} as const;

export const ANIMATIONS = {
  duration: { fast: 180, normal: 280, slow: 480 },
  easing: { ease: "ease", easeIn: "ease-in", easeOut: "ease-out", easeInOut: "ease-in-out" },
} as const;

export const LAYOUT = {
  breakpoints: { sm: 576, md: 768, lg: 992, xl: 1200 },
  containerPadding: 22,
  sectionSpacing: 28,
  cardPadding: 18,
  headerHeight: 60,
  tabBarHeight: 76,
  buttonHeight: 52,
  inputHeight: 54,
} as const;

export const COMPONENT_COLORS = {
  buttonPrimary: COLORS.primary,
  buttonPrimaryHover: COLORS.primaryDark,
  buttonSecondary: COLORS.coral,
  buttonSecondaryHover: COLORS.secondaryDark,
  buttonAccent: COLORS.accent,
  buttonAccentHover: COLORS.accentDark,
  buttonDanger: COLORS.error,
  buttonDangerHover: COLORS.errorDark,
  buttonCancel: COLORS.gray500,
  buttonOutline: COLORS.white,
  buttonOutlineBorder: COLORS.border,
  buttonOutlineText: COLORS.textSecondary,
  statusSuccess: COLORS.success,
  statusSuccessBg: COLORS.successLight,
  statusError: COLORS.error,
  statusErrorBg: COLORS.errorLight,
  statusWarning: COLORS.warning,
  statusWarningBg: COLORS.warningLight,
  cardBackground: COLORS.surface,
  cardBorder: COLORS.border,
  cardShadow: COLORS.shadow,
  inputBackground: COLORS.white,
  inputBorder: COLORS.border,
  inputBorderFocus: COLORS.primary,
  inputText: COLORS.textPrimary,
  inputPlaceholder: COLORS.textTertiary,
} as const;
