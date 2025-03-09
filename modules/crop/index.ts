import { ModuleHooks } from "../../types/modules";
import sharp from "sharp";
import React from "react";
import { Crop as CropIcon } from "lucide-react";
import dynamic from "next/dynamic";

// Import dynamique de l'interface utilisateur
const CropUI = dynamic(() => import("./ui").then((mod) => mod.CropUI), {
  ssr: false,
  loading: () => React.createElement("div", {}, "Chargement de l'interface..."),
});

// Récupération des paramètres du module depuis module.json
let settings: {
  aspectRatio: number | null;
  circularCrop: boolean;
  quality: number;
};

// Fonction pour recadrer une image
async function cropImage(imageBuffer: Buffer, cropData: any): Promise<Buffer> {
  try {
    console.log("Recadrage avec les données:", cropData);

    // Extraire les informations de recadrage
    const { crop, circularCrop, quality } = cropData;

    // Si crop est au format PixelCrop (valeurs en pixels)
    if (crop.unit === "px") {
      // Recadrer l'image avec les valeurs en pixels
      let processedImage = sharp(imageBuffer).extract({
        left: Math.round(crop.x),
        top: Math.round(crop.y),
        width: Math.round(crop.width),
        height: Math.round(crop.height),
      });

      // Appliquer un masque circulaire si nécessaire
      if (circularCrop) {
        const width = Math.round(crop.width);
        const height = Math.round(crop.height);

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

      // Convertir en JPEG avec la qualité spécifiée
      return await processedImage.jpeg({ quality: quality || 90 }).toBuffer();
    }
    // Si crop est au format pourcentage ou autre format
    else {
      console.error("Format de recadrage non pris en charge:", crop);
      return imageBuffer; // Retourner l'image originale en cas d'erreur
    }
  } catch (error) {
    console.error("Erreur lors du recadrage de l'image:", error);
    return imageBuffer; // Retourner l'image originale en cas d'erreur
  }
}

// Interface utilisateur du module
const renderUI = (fileInfo: any, onComplete: (result: any) => void) => {
  // Utilisation de l'importation dynamique directement ici
  const CropUI = React.lazy(() => import("./ui"));

  return React.createElement(
    React.Suspense,
    {
      fallback: React.createElement("div", {}, "Chargement de l'interface..."),
    },
    React.createElement(CropUI, {
      fileInfo,
      onComplete,
    })
  );
};

// Icône d'action du module
const getActionIcon = () => {
  return {
    icon: CropIcon,
    tooltip: "Recadrer l'image",
  };
};

// Hooks du module
const moduleHooks: ModuleHooks = {
  onInit: () => {
    console.log("Module Crop initialisé");
  },
  onEnable: () => {
    console.log("Module Crop activé");
  },
  onDisable: () => {
    console.log("Module Crop désactivé");
  },
  processImage: async (imageBuffer: Buffer) => {
    // Ce module ne traite pas automatiquement les images
    // Il nécessite une interaction utilisateur
    return imageBuffer;
  },
  cropImage,
  renderUI,
  getActionIcon,
};

// Fonction pour initialiser les paramètres du module
export function initModule(config: any) {
  settings = config.settings;
  return moduleHooks;
}

export default moduleHooks;
