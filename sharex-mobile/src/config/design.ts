// Configuration du design moderne

export const COLORS = {
  // Couleur principale - Indigo moderne
  primary: "#6366F1",
  primaryLight: "#A5B4FC",
  primaryDark: "#4F46E5",
  primaryBg: "#EEF2FF",

  // Couleur secondaire - Émeraude
  secondary: "#10B981",
  secondaryLight: "#6EE7B7",
  secondaryDark: "#059669",
  secondaryBg: "#ECFDF5",

  // Couleurs d'accent
  accent: "#F59E0B",
  accentLight: "#FEF3C7",
  accentDark: "#D97706",

  // Couleurs d'état
  success: "#10B981",
  successLight: "#D1FAE5",
  successDark: "#059669",

  error: "#EF4444",
  errorLight: "#FEE2E2",
  errorDark: "#DC2626",

  warning: "#F59E0B",
  warningLight: "#FEF3C7",
  warningDark: "#D97706",

  info: "#3B82F6",
  infoLight: "#DBEAFE",
  infoDark: "#2563EB",

  // Couleurs neutres
  white: "#FFFFFF",
  black: "#000000",

  // Grises
  gray50: "#F8FAFC",
  gray100: "#F1F5F9",
  gray200: "#E2E8F0",
  gray300: "#CBD5E1",
  gray400: "#94A3B8",
  gray500: "#64748B",
  gray600: "#475569",
  gray700: "#334155",
  gray800: "#1E293B",
  gray900: "#0F172A",

  // Couleurs de texte
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textTertiary: "#64748B",
  textInverse: "#FFFFFF",

  // Couleurs de fond
  background: "#FFFFFF",
  backgroundSecondary: "#F8FAFC",
  backgroundTertiary: "#F1F5F9",

  // Couleurs de bordure
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
  borderDark: "#CBD5E1",

  // Couleurs d'ombre
  shadow: "rgba(0, 0, 0, 0.1)",
  shadowLight: "rgba(0, 0, 0, 0.05)",
  shadowDark: "rgba(0, 0, 0, 0.15)",

  // Couleurs de gradient
  gradientStart: "#6366F1",
  gradientEnd: "#3B82F6",
  gradientSecondary: "#10B981",
  gradientAccent: "#F59E0B",
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const BORDER_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  round: 50,
} as const;

export const SHADOWS = {
  sm: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

export const TYPOGRAPHY = {
  // Tailles de police
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 28,
    huge: 32,
  },

  // Poids de police
  fontWeight: {
    light: "300",
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
    black: "900",
  },

  // Hauteur de ligne
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
    loose: 1.8,
  },
} as const;

export const ANIMATIONS = {
  // Durées d'animation
  duration: {
    fast: 200,
    normal: 300,
    slow: 500,
  },

  // Easing
  easing: {
    ease: "ease",
    easeIn: "ease-in",
    easeOut: "ease-out",
    easeInOut: "ease-in-out",
  },
} as const;

export const LAYOUT = {
  // Tailles d'écran
  breakpoints: {
    sm: 576,
    md: 768,
    lg: 992,
    xl: 1200,
  },

  // Marges et paddings
  containerPadding: 20,
  sectionSpacing: 24,
  cardPadding: 16,

  // Hauteurs
  headerHeight: 60,
  tabBarHeight: 80,
  buttonHeight: 48,
  inputHeight: 44,
} as const;

// Couleurs spécifiques aux composants
export const COMPONENT_COLORS = {
  // Boutons
  buttonPrimary: COLORS.primary,
  buttonPrimaryHover: COLORS.primaryDark,
  buttonSecondary: COLORS.secondary,
  buttonSecondaryHover: COLORS.secondaryDark,
  buttonAccent: COLORS.accent,
  buttonAccentHover: COLORS.accentDark,
  buttonDanger: COLORS.error,
  buttonDangerHover: COLORS.errorDark,
  buttonCancel: COLORS.gray500,
  buttonOutline: COLORS.white,
  buttonOutlineBorder: COLORS.border,
  buttonOutlineText: COLORS.textSecondary,

  // Badges de statut
  statusSuccess: COLORS.success,
  statusSuccessBg: COLORS.successLight,
  statusError: COLORS.error,
  statusErrorBg: COLORS.errorLight,
  statusWarning: COLORS.warning,
  statusWarningBg: COLORS.warningLight,

  // Cartes
  cardBackground: COLORS.white,
  cardBorder: COLORS.border,
  cardShadow: COLORS.shadow,

  // Inputs
  inputBackground: COLORS.white,
  inputBorder: COLORS.border,
  inputBorderFocus: COLORS.primary,
  inputText: COLORS.textPrimary,
  inputPlaceholder: COLORS.textTertiary,
} as const;
