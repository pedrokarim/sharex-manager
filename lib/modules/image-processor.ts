import { apiModuleManager } from "./module-manager.api";
import fs from "fs";
import path from "path";

export async function processImage(imageBuffer: Buffer): Promise<Buffer> {
  try {
    await apiModuleManager.ensureInitialized();
    return await apiModuleManager.processImage(imageBuffer);
  } catch (error) {
    console.error("Erreur lors du traitement de l'image:", error);
    return imageBuffer;
  }
}

export async function processImageFile(
  inputPath: string,
  outputPath?: string
): Promise<boolean> {
  try {
    if (!fs.existsSync(inputPath)) {
      console.error(`Le fichier ${inputPath} n'existe pas`);
      return false;
    }

    const imageBuffer = fs.readFileSync(inputPath);
    const processedImageBuffer = await processImage(imageBuffer);

    const finalOutputPath = outputPath || inputPath;
    const outputDir = path.dirname(finalOutputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(finalOutputPath, processedImageBuffer);
    return true;
  } catch (error) {
    console.error("Erreur lors du traitement du fichier image:", error);
    return false;
  }
}
