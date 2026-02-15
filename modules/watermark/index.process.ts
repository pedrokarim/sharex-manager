import { ModuleHooks } from "../../types/modules";
import sharp from "sharp";

// Récupération des paramètres du module depuis module.json
let settings: {
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  opacity: number;
  text: string;
  color?: string;
  fontSize?: number;
  padding?: number;
};

// Fonction pour ajouter un watermark à une image
export async function addWatermark(
  imageBuffer: Buffer,
  watermarkSettings?: any
): Promise<Buffer> {
  try {
    // Utiliser les paramètres fournis ou les paramètres par défaut
    const options = watermarkSettings ||
      settings || {
        position: "bottom-right",
        opacity: 0.5,
        text: "ShareX Manager",
        color: "#ffffff",
        fontSize: 24,
        padding: 20,
      };

    console.log("Ajout du filigrane avec les paramètres:", options);

    // Obtenir les métadonnées de l'image
    const metadata = await sharp(imageBuffer).metadata();
    const imageWidth = metadata.width || 800;
    const imageHeight = metadata.height || 600;

    console.log("Dimensions de l'image:", imageWidth, "x", imageHeight);

    // Créer un SVG avec le texte du filigrane
    const watermarkText = options.text || "ShareX Manager";
    const watermarkColor = options.color || "#ffffff";
    const opacity = options.opacity || 0.5;
    const fontSize = options.fontSize || 24;
    const padding = options.padding || 20;

    // Ajuster la taille de la police en fonction de la taille de l'image
    const adjustedFontSize = Math.max(
      Math.min(fontSize, Math.floor(imageWidth / 20)),
      12
    );

    console.log("Taille de police ajustée:", adjustedFontSize);

    // Convertir la couleur hex en RGB
    const rgbColor = hexToRgb(watermarkColor);
    if (!rgbColor) {
      console.error("Couleur de filigrane invalide");
      return imageBuffer;
    }

    // Créer le SVG avec le texte et la couleur
    // Utiliser une largeur et hauteur plus grandes pour le SVG
    const svgWidth = Math.min(imageWidth, 1000);
    const svgHeight = Math.min(adjustedFontSize * 3, imageHeight / 4);

    const svgText = `
      <svg width="${svgWidth}" height="${svgHeight}">
        <text 
          x="50%" 
          y="50%" 
          font-family="Arial" 
          font-size="${adjustedFontSize}" 
          fill="rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, ${opacity})" 
          text-anchor="middle" 
          dominant-baseline="middle"
          font-weight="bold"
        >
          ${watermarkText}
        </text>
      </svg>
    `;

    console.log("SVG généré pour le filigrane");

    // Calculer la position du filigrane
    let gravity;
    const position = options.position || "bottom-right";

    switch (position) {
      case "top-left":
        gravity = sharp.gravity.northwest;
        break;
      case "top-center":
        gravity = sharp.gravity.north;
        break;
      case "top-right":
        gravity = sharp.gravity.northeast;
        break;
      case "middle-left":
        gravity = sharp.gravity.west;
        break;
      case "middle-center":
        gravity = sharp.gravity.center;
        break;
      case "middle-right":
        gravity = sharp.gravity.east;
        break;
      case "bottom-left":
        gravity = sharp.gravity.southwest;
        break;
      case "bottom-center":
        gravity = sharp.gravity.south;
        break;
      case "bottom-right":
      default:
        gravity = sharp.gravity.southeast;
        break;
    }

    console.log("Position du filigrane:", position, "gravity:", gravity);

    // Créer un buffer à partir du SVG
    const watermarkBuffer = Buffer.from(svgText);

    // Appliquer le filigrane à l'image
    const result = await sharp(imageBuffer)
      .composite([
        {
          input: watermarkBuffer,
          gravity: gravity,
          // Utiliser les propriétés correctes pour le positionnement
          ...(position.includes("top") ? { top: padding } : {}),
          ...(position.includes("bottom")
            ? { top: imageHeight - svgHeight - padding }
            : {}),
          ...(position.includes("left") ? { left: padding } : {}),
          ...(position.includes("right")
            ? { left: imageWidth - svgWidth - padding }
            : {}),
        },
      ])
      .toBuffer();

    console.log("Filigrane appliqué avec succès");
    return result;
  } catch (error) {
    console.error("Erreur lors de l'ajout du filigrane:", error);
    return imageBuffer;
  }
}

// Fonction pour convertir une couleur hexadécimale en RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Supprimer le # si présent
  hex = hex.replace(/^#/, "");

  // Convertir en RGB
  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return null;
  }

  return { r, g, b };
}

// Top-level processImage export for the module manager
export async function processImage(
  imageBuffer: Buffer,
  data?: any
): Promise<Buffer> {
  return await addWatermark(imageBuffer, data);
}

// Hooks du module
export const moduleHooks: ModuleHooks = {
  onInit: () => {
    console.log("Module Watermark initialisé");
  },
  onEnable: () => {
    console.log("Module Watermark activé");
  },
  onDisable: () => {
    console.log("Module Watermark désactivé");
  },
  processImage,
};

// Fonction pour initialiser les paramètres du module
export function initModule(config: any) {
  settings = config.settings;
  return moduleHooks;
}

export default moduleHooks;
