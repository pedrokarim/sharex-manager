import { ModuleHooks } from "../../types/modules";
import sharp from "sharp";
import React from "react";
import { Scaling } from "lucide-react";
import dynamic from "next/dynamic";

// Import dynamique de l'interface utilisateur
const ResizeUI = dynamic(() => import("./ui").then((mod) => mod.ResizeUI), {
  ssr: false,
  loading: () => React.createElement("div", {}, "Chargement de l'interface..."),
});

// Récupération des paramètres du module depuis module.json
let settings: {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  maintainAspectRatio: boolean;
};

// Fonction pour redimensionner une image
async function resizeImage(imageBuffer: Buffer): Promise<Buffer> {
  try {
    // Obtenir les dimensions de l'image
    const metadata = await sharp(imageBuffer).metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;

    // Vérifier si l'image a besoin d'être redimensionnée
    if (
      originalWidth <= settings.maxWidth &&
      originalHeight <= settings.maxHeight
    ) {
      return imageBuffer; // Pas besoin de redimensionner
    }

    // Calculer les nouvelles dimensions
    let newWidth = settings.maxWidth;
    let newHeight = settings.maxHeight;

    if (settings.maintainAspectRatio) {
      const aspectRatio = originalWidth / originalHeight;

      if (originalWidth > originalHeight) {
        // Image horizontale
        newWidth = settings.maxWidth;
        newHeight = Math.round(newWidth / aspectRatio);

        if (newHeight > settings.maxHeight) {
          newHeight = settings.maxHeight;
          newWidth = Math.round(newHeight * aspectRatio);
        }
      } else {
        // Image verticale ou carrée
        newHeight = settings.maxHeight;
        newWidth = Math.round(newHeight * aspectRatio);

        if (newWidth > settings.maxWidth) {
          newWidth = settings.maxWidth;
          newHeight = Math.round(newWidth / aspectRatio);
        }
      }
    }

    // Redimensionner l'image
    return await sharp(imageBuffer)
      .resize(newWidth, newHeight, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: settings.quality })
      .toBuffer();
  } catch (error) {
    console.error("Erreur lors du redimensionnement de l'image:", error);
    return imageBuffer; // Retourner l'image originale en cas d'erreur
  }
}

// Interface utilisateur du module
const renderUI = (fileInfo: any, onComplete: (result: any) => void) => {
  return React.createElement(ResizeUI, {
    fileInfo,
    initialSettings: settings,
    onComplete,
    onCancel: () => onComplete(null),
  });
};

// Icône d'action du module
const getActionIcon = () => {
  return {
    icon: Scaling,
    tooltip: "Redimensionner l'image",
  };
};

// Hooks du module
const moduleHooks: ModuleHooks = {
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
  renderUI,
  getActionIcon,
};

// Fonction pour initialiser les paramètres du module
export function initModule(config: any) {
  settings = config.settings;
  return moduleHooks;
}

export default moduleHooks;
