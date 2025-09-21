// Constantes de configuration pour l'application

export const APP_CONFIG = {
  // Nom de l'application
  APP_NAME: "ShareX Manager",

  // Version de l'application
  VERSION: "1.0.0",

  // URLs par défaut
  DEFAULT_SERVER_URL: "http://localhost:3000",

  // Timeouts
  API_TIMEOUT: 30000, // 30 secondes
  UPLOAD_TIMEOUT: 60000, // 60 secondes

  // Tailles de fichiers
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50 MB
  MAX_IMAGE_DIMENSION: 4096, // 4096px

  // Formats supportés
  SUPPORTED_IMAGE_FORMATS: ["jpg", "jpeg", "png", "gif", "webp"],

  // Qualité d'image par défaut
  DEFAULT_IMAGE_QUALITY: 0.8,

  // Messages d'erreur
  ERROR_MESSAGES: {
    NETWORK_ERROR: "Erreur de connexion réseau",
    UPLOAD_FAILED: "Échec de l'upload",
    INVALID_API_KEY: "Clé API invalide",
    SERVER_ERROR: "Erreur du serveur",
    PERMISSION_DENIED: "Permission refusée",
    FILE_TOO_LARGE: "Fichier trop volumineux",
    INVALID_FORMAT: "Format de fichier non supporté",
  },

  // Messages de succès
  SUCCESS_MESSAGES: {
    UPLOAD_SUCCESS: "Upload réussi",
    SETTINGS_SAVED: "Paramètres sauvegardés",
    CONNECTION_SUCCESS: "Connexion réussie",
  },

  // Couleurs du thème
  COLORS: {
    PRIMARY: "#007AFF",
    SECONDARY: "#34C759",
    ERROR: "#FF3B30",
    WARNING: "#FF9500",
    SUCCESS: "#34C759",
    BACKGROUND: "#FFFFFF",
    SURFACE: "#F8F9FA",
    TEXT_PRIMARY: "#333333",
    TEXT_SECONDARY: "#666666",
    BORDER: "#E0E0E0",
  },

  // Tailles de police
  FONT_SIZES: {
    SMALL: 12,
    MEDIUM: 16,
    LARGE: 20,
    XLARGE: 24,
    XXLARGE: 32,
  },

  // Espacements
  SPACING: {
    XS: 4,
    SM: 8,
    MD: 16,
    LG: 24,
    XL: 32,
    XXL: 40,
  },

  // Rayons de bordure
  BORDER_RADIUS: {
    SM: 4,
    MD: 8,
    LG: 12,
    XL: 16,
  },
} as const;

// Types pour les constantes
export type AppConfig = typeof APP_CONFIG;
export type ErrorMessage = keyof typeof APP_CONFIG.ERROR_MESSAGES;
export type SuccessMessage = keyof typeof APP_CONFIG.SUCCESS_MESSAGES;
