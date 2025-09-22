// Service pour extraire la couleur dominante d'une image

// Service simplifié utilisant uniquement l'API du serveur

interface ColorResult {
  dominant: string;
  palette: string[];
  isDark: boolean;
}

// Cache pour éviter de recalculer les couleurs
const colorCache = new Map<string, ColorResult>();

/**
 * Extrait la couleur dominante via l'API du serveur
 * @param imageUri URI de l'image
 * @returns Promise avec la couleur dominante ou null si échec
 */
async function extractColorFromAPI(
  imageUri: string
): Promise<ColorResult | null> {
  try {
    // Récupérer la configuration du serveur
    const StorageService = require("./storage").StorageService;
    const config = await StorageService.getServerConfig();

    if (!config) {
      return null;
    }

    // Récupérer la clé API stockée
    const apiKey = await StorageService.getApiKey();
    if (!apiKey) {
      return null;
    }

    // Télécharger l'image
    const response = await fetch(imageUri);
    if (!response.ok) {
      throw new Error(`Erreur HTTP lors du téléchargement: ${response.status}`);
    }

    const imageBlob = await response.blob();

    // Créer FormData pour l'API
    const formData = new FormData();
    formData.append("image", {
      uri: imageUri,
      type: "image/jpeg",
      name: "image.jpg",
    } as any);
    formData.append("apiKey", apiKey); // Vraie clé API

    const apiUrl = `${config.url}/api/colors`;

    // Appeler l'API d'extraction de couleurs
    const apiResponse = await fetch(apiUrl, {
      method: "POST",
      body: formData,
      headers: {
        Accept: "application/json",
      },
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`Erreur API: ${apiResponse.status} - ${errorText}`);
    }

    const result = await apiResponse.json();

    if (result.success && result.colors) {
      return result.colors;
    }

    return null;
  } catch (error) {
    console.error(
      "Erreur lors de l'appel à l'API d'extraction de couleurs:",
      error
    );
    return null;
  }
}

/**
 * Extrait la couleur dominante d'une image
 * @param imageUri URI de l'image
 * @returns Promise avec la couleur dominante et la palette
 */
export const extractDominantColor = async (
  imageUri: string
): Promise<ColorResult> => {
  // Vérifier le cache d'abord
  if (colorCache.has(imageUri)) {
    return colorCache.get(imageUri)!;
  }

  try {
    // Essayer d'abord l'API du serveur
    const apiResult = await extractColorFromAPI(imageUri);
    if (apiResult) {
      // Mettre en cache
      colorCache.set(imageUri, apiResult);
      return apiResult;
    }
  } catch (error) {
    // API non disponible, utilisation du fallback
  }

  try {
    // Fallback : Générer une couleur basée sur l'URI
    const fallbackColor = generateColorFromUri(imageUri);

    const fallback: ColorResult = {
      dominant: fallbackColor,
      palette: generatePalette(fallbackColor),
      isDark: isDarkColor(fallbackColor),
    };

    // Mettre en cache le fallback
    colorCache.set(imageUri, fallback);

    return fallback;
  } catch (error) {
    console.error("Erreur lors de l'extraction de la couleur:", error);

    // Dernier recours : couleur par défaut
    const defaultColor = "#6366F1";
    const fallback: ColorResult = {
      dominant: defaultColor,
      palette: generatePalette(defaultColor),
      isDark: isDarkColor(defaultColor),
    };

    colorCache.set(imageUri, fallback);
    return fallback;
  }
};

/**
 * Génère une couleur basée sur l'URI de l'image (fallback)
 * @param uri URI de l'image
 * @returns Couleur hexadécimale
 */
const generateColorFromUri = (uri: string): string => {
  // Créer un hash simple à partir de l'URI
  let hash = 0;
  for (let i = 0; i < uri.length; i++) {
    const char = uri.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convertir en 32-bit integer
  }

  // Utiliser le hash pour générer des couleurs cohérentes
  const hue = Math.abs(hash) % 360;
  const saturation = 60 + (Math.abs(hash) % 30); // 60-90%
  const lightness = 45 + (Math.abs(hash) % 20); // 45-65%

  return hslToHex(hue, saturation, lightness);
};

/**
 * Convertit HSL en hexadécimal
 */
const hslToHex = (h: number, s: number, l: number): string => {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

/**
 * Génère une palette de couleurs basée sur la couleur dominante
 */
const generatePalette = (dominant: string): string[] => {
  const hsl = hexToHsl(dominant);

  return [
    dominant, // Couleur dominante
    hslToHex(hsl.h, Math.min(hsl.s + 20, 100), Math.min(hsl.l + 10, 100)), // Plus claire
    hslToHex(hsl.h, Math.max(hsl.s - 20, 0), Math.max(hsl.l - 10, 0)), // Plus foncée
  ];
};

/**
 * Convertit hexadécimal en HSL
 */
const hexToHsl = (hex: string): { h: number; s: number; l: number } => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: h * 360,
    s: s * 100,
    l: l * 100,
  };
};

/**
 * Détermine si une couleur est sombre
 */
const isDarkColor = (hex: string): boolean => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // Calcul de la luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
};

/**
 * Nettoie le cache des couleurs
 */
export const clearColorCache = (): void => {
  colorCache.clear();
};

/**
 * Obtient une couleur avec opacité
 */
export const withOpacity = (color: string, opacity: number): string => {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};
