import { ModuleHooks } from "../../types/modules";
import sharp from "sharp";

// Récupération des paramètres du module depuis module.json
let settings: {
  aspectRatio: number | null;
  circularCrop: boolean;
  quality: number;
};

// Fonction pour recadrer une image
async function toOutputFormat(
  pipeline: sharp.Sharp,
  format: string | undefined,
  quality: number
): Promise<Buffer> {
  switch (format) {
    case "png":
      return pipeline.png().toBuffer();
    case "webp":
      return pipeline.webp({ quality }).toBuffer();
    case "gif":
      return pipeline.gif().toBuffer();
    case "avif":
      return pipeline.avif({ quality }).toBuffer();
    case "tiff":
      return pipeline.tiff({ quality }).toBuffer();
    default:
      return pipeline.jpeg({ quality }).toBuffer();
  }
}

export async function cropImage(
  imageBuffer: Buffer,
  cropData: any
): Promise<Buffer> {
  try {
    console.log("Recadrage avec les données:", cropData);

    // Extraire les informations de recadrage
    const { crop, circularCrop, quality } = cropData;

    // Obtenir les métadonnées de l'image originale
    const metadata = await sharp(imageBuffer).metadata();
    const originalWidth = metadata.width || 800;
    const originalHeight = metadata.height || 600;
    const inputFormat = metadata.format;
    console.log(
      "Métadonnées de l'image originale:",
      originalWidth,
      "x",
      originalHeight
    );

    // Si crop est au format PixelCrop (valeurs en pixels)
    if (crop.unit === "px") {
      console.log("Recadrage en pixels:", crop);

      // Vérifier que les valeurs sont dans les limites de l'image
      const x = Math.max(0, Math.round(crop.x));
      const y = Math.max(0, Math.round(crop.y));
      const width = Math.min(Math.round(crop.width), originalWidth - x);
      const height = Math.min(Math.round(crop.height), originalHeight - y);

      console.log(
        `Recadrage effectif: x=${x}, y=${y}, width=${width}, height=${height}`
      );

      if (width <= 0 || height <= 0) {
        console.error("Dimensions de recadrage invalides");
        return imageBuffer;
      }

      // Recadrer l'image avec les valeurs en pixels
      let processedImage = sharp(imageBuffer).extract({
        left: x,
        top: y,
        width: width,
        height: height,
      });

      // Appliquer un masque circulaire si nécessaire
      if (circularCrop) {
        console.log("Application d'un masque circulaire");

        // Créer un masque circulaire
        const circleBuffer = Buffer.from(`
          <svg width="${width}" height="${height}">
            <circle cx="${width / 2}" cy="${height / 2}" r="${
          Math.min(width, height) / 2
        }" fill="white" />
          </svg>
        `);

        // Appliquer le masque
        processedImage = processedImage.composite([
          {
            input: circleBuffer,
            blend: "dest-in",
          },
        ]);
      }

      const result = await toOutputFormat(processedImage, inputFormat, quality || 90);

      console.log("Image recadrée avec succès");
      return result;
    }
    // Si crop est au format pourcentage
    else if (crop.unit === "%" || crop.unit === "percent") {
      console.log("Recadrage en pourcentage:", crop);

      // Convertir les pourcentages en pixels
      const x = Math.round((crop.x / 100) * originalWidth);
      const y = Math.round((crop.y / 100) * originalHeight);
      const width = Math.round((crop.width / 100) * originalWidth);
      const height = Math.round((crop.height / 100) * originalHeight);

      console.log(
        `Recadrage converti en pixels: x=${x}, y=${y}, width=${width}, height=${height}`
      );

      if (width <= 0 || height <= 0) {
        console.error("Dimensions de recadrage invalides après conversion");
        return imageBuffer;
      }

      // Recadrer l'image avec les valeurs converties en pixels
      let processedImage = sharp(imageBuffer).extract({
        left: x,
        top: y,
        width: width,
        height: height,
      });

      // Appliquer un masque circulaire si nécessaire
      if (circularCrop) {
        console.log("Application d'un masque circulaire");

        // Créer un masque circulaire
        const circleBuffer = Buffer.from(`
          <svg width="${width}" height="${height}">
            <circle cx="${width / 2}" cy="${height / 2}" r="${
          Math.min(width, height) / 2
        }" fill="white" />
          </svg>
        `);

        // Appliquer le masque
        processedImage = processedImage.composite([
          {
            input: circleBuffer,
            blend: "dest-in",
          },
        ]);
      }

      const result = await toOutputFormat(processedImage, inputFormat, quality || 90);

      console.log("Image recadrée avec succès");
      return result;
    } else {
      console.error("Format de recadrage non pris en charge:", crop.unit);
      return imageBuffer;
    }
  } catch (error) {
    console.error("Erreur lors du recadrage de l'image:", error);
    return imageBuffer; // Retourner l'image originale en cas d'erreur
  }
}

// Top-level processImage export for the module manager
export async function processImage(
  imageBuffer: Buffer,
  data?: any
): Promise<Buffer> {
  return await cropImage(imageBuffer, data);
}

// Hooks du module
export const moduleHooks: ModuleHooks = {
  onInit: () => {
    console.log("Module Crop initialisé");
  },
  onEnable: () => {
    console.log("Module Crop activé");
  },
  onDisable: () => {
    console.log("Module Crop désactivé");
  },
  processImage,
};

// Fonction pour initialiser les paramètres du module
export function initModule(config: any) {
  settings = config.settings;
  return moduleHooks;
}

export default moduleHooks;
