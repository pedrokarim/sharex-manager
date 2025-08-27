import { ModuleHooks } from "../../types/modules";
import sharp from "sharp";

// Récupération des paramètres du module depuis module.json
let settings: {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  maintainAspectRatio: boolean;
};

// Fonction pour redimensionner une image
export async function resizeImage(
  imageBuffer: Buffer,
  customSettings?: any
): Promise<Buffer> {
  try {
    // Utiliser les paramètres personnalisés s'ils sont fournis, sinon utiliser les paramètres par défaut
    const resizeSettings = customSettings ||
      settings || {
        maxWidth: 1920,
        maxHeight: 1080,
        quality: 90,
        maintainAspectRatio: true,
      };

    console.log("Redimensionnement avec les paramètres:", resizeSettings);

    // Obtenir les dimensions de l'image
    const metadata = await sharp(imageBuffer).metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;

    console.log("Dimensions originales:", originalWidth, "x", originalHeight);

    // Vérifier si l'image a besoin d'être redimensionnée
    if (
      originalWidth <= resizeSettings.maxWidth &&
      originalHeight <= resizeSettings.maxHeight
    ) {
      console.log(
        "L'image est déjà dans les dimensions maximales, pas de redimensionnement nécessaire"
      );
      return imageBuffer; // Pas besoin de redimensionner
    }

    // Calculer les nouvelles dimensions
    let newWidth = resizeSettings.maxWidth;
    let newHeight = resizeSettings.maxHeight;

    if (resizeSettings.maintainAspectRatio) {
      const aspectRatio = originalWidth / originalHeight;

      if (originalWidth > originalHeight) {
        // Image horizontale
        newWidth = resizeSettings.maxWidth;
        newHeight = Math.round(newWidth / aspectRatio);

        if (newHeight > resizeSettings.maxHeight) {
          newHeight = resizeSettings.maxHeight;
          newWidth = Math.round(newHeight * aspectRatio);
        }
      } else {
        // Image verticale ou carrée
        newHeight = resizeSettings.maxHeight;
        newWidth = Math.round(newHeight * aspectRatio);

        if (newWidth > resizeSettings.maxWidth) {
          newWidth = resizeSettings.maxWidth;
          newHeight = Math.round(newWidth / aspectRatio);
        }
      }
    }

    console.log(`Nouvelles dimensions: ${newWidth}x${newHeight}`);

    // Redimensionner l'image
    const result = await sharp(imageBuffer)
      .resize(newWidth, newHeight, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: resizeSettings.quality })
      .toBuffer();

    // Vérifier les dimensions après redimensionnement
    const newMetadata = await sharp(result).metadata();
    console.log(
      "Dimensions après redimensionnement:",
      newMetadata.width,
      "x",
      newMetadata.height
    );

    console.log("Image redimensionnée avec succès");
    return result;
  } catch (error) {
    console.error("Erreur lors du redimensionnement de l'image:", error);
    return imageBuffer; // Retourner l'image originale en cas d'erreur
  }
}

// Hooks du module
export const moduleHooks: ModuleHooks = {
  onInit: () => {
    console.log("Module Resize initialisé");
  },
  onEnable: () => {
    console.log("Module Resize activé");
  },
  onDisable: () => {
    console.log("Module Resize désactivé");
  },
  processImage: async (imageBuffer: Buffer) => {
    return await resizeImage(imageBuffer);
  },
};

// Fonction pour initialiser les paramètres du module
export function initModule(config: any) {
  settings = config.settings;
  return moduleHooks;
}

export default moduleHooks;
