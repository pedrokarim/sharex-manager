import { moduleManager } from "./module-manager";
import fs from "fs";
import path from "path";

/**
 * Traite une image avec tous les modules activés
 * @param imageBuffer Buffer de l'image à traiter
 * @returns Buffer de l'image traitée
 */
export async function processImage(imageBuffer: Buffer): Promise<Buffer> {
  try {
    // Traiter l'image avec tous les modules activés
    return await moduleManager.processImage(imageBuffer);
  } catch (error) {
    console.error("Erreur lors du traitement de l'image:", error);
    return imageBuffer; // Retourner l'image originale en cas d'erreur
  }
}

/**
 * Traite un fichier image avec tous les modules activés
 * @param inputPath Chemin du fichier image à traiter
 * @param outputPath Chemin où enregistrer l'image traitée (si non spécifié, écrase le fichier original)
 * @returns true si le traitement a réussi, false sinon
 */
export async function processImageFile(
  inputPath: string,
  outputPath?: string
): Promise<boolean> {
  try {
    // Vérifier si le fichier existe
    if (!fs.existsSync(inputPath)) {
      console.error(`Le fichier ${inputPath} n'existe pas`);
      return false;
    }

    // Lire le fichier
    const imageBuffer = fs.readFileSync(inputPath);

    // Traiter l'image
    const processedImageBuffer = await processImage(imageBuffer);

    // Enregistrer l'image traitée
    const finalOutputPath = outputPath || inputPath;

    // Créer le dossier de destination s'il n'existe pas
    const outputDir = path.dirname(finalOutputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Écrire le fichier
    fs.writeFileSync(finalOutputPath, processedImageBuffer);

    return true;
  } catch (error) {
    console.error("Erreur lors du traitement du fichier image:", error);
    return false;
  }
}
