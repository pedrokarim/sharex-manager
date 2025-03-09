import { ModuleHooks } from "../../types/modules";
import sharp from "sharp";
import React from "react";
import { Stamp } from "lucide-react";
import dynamic from "next/dynamic";

// Import dynamique de l'interface utilisateur
const WatermarkUI = dynamic(
  () => import("./ui").then((mod) => mod.WatermarkUI),
  {
    ssr: false,
    loading: () =>
      React.createElement("div", {}, "Chargement de l'interface..."),
  }
);

// Récupération des paramètres du module depuis module.json
let settings: {
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  opacity: number;
  text: string;
  color?: string;
};

// Fonction pour ajouter un watermark à une image
async function addWatermark(imageBuffer: Buffer): Promise<Buffer> {
  try {
    // Création d'une image SVG contenant le texte du watermark
    const color = settings.color || "white";
    const svgText = `
      <svg width="300" height="50">
        <text 
          x="0" 
          y="30" 
          font-family="Arial" 
          font-size="24" 
          fill="rgba(${hexToRgb(color)}, ${settings.opacity})"
        >
          ${settings.text}
        </text>
      </svg>
    `;

    // Obtenir les dimensions de l'image
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 800;
    const height = metadata.height || 600;

    // Calculer la position du watermark
    let gravity: sharp.Gravity;
    switch (settings.position) {
      case "top-left":
        gravity = sharp.gravity.northwest;
        break;
      case "top-right":
        gravity = sharp.gravity.northeast;
        break;
      case "bottom-left":
        gravity = sharp.gravity.southwest;
        break;
      case "bottom-right":
      default:
        gravity = sharp.gravity.southeast;
        break;
    }

    // Ajouter le watermark à l'image
    return await sharp(imageBuffer)
      .composite([
        {
          input: Buffer.from(svgText),
          gravity: gravity,
        },
      ])
      .toBuffer();
  } catch (error) {
    console.error("Erreur lors de l'ajout du watermark:", error);
    return imageBuffer; // Retourner l'image originale en cas d'erreur
  }
}

// Fonction pour convertir une couleur hexadécimale en RGB
function hexToRgb(hex: string): string {
  // Supprimer le # si présent
  hex = hex.replace(/^#/, "");

  // Convertir en RGB
  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  return `${r}, ${g}, ${b}`;
}

// Interface utilisateur du module
const renderUI = (fileInfo: any, onComplete: (result: any) => void) => {
  return React.createElement(WatermarkUI, {
    fileInfo,
    initialSettings: settings,
    onComplete,
    onCancel: () => onComplete(null),
  });
};

// Icône d'action du module
const getActionIcon = () => {
  return {
    icon: Stamp,
    tooltip: "Ajouter un filigrane",
  };
};

// Hooks du module
const moduleHooks: ModuleHooks = {
  onInit: () => {
    console.log("Module Watermark initialisé");
  },
  onEnable: () => {
    console.log("Module Watermark activé");
  },
  onDisable: () => {
    console.log("Module Watermark désactivé");
  },
  processImage: async (imageBuffer: Buffer) => {
    return await addWatermark(imageBuffer);
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
