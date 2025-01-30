import { readFile } from "fs/promises";
import { join } from "path";
import { UploadConfig, defaultConfig } from "@/hooks/use-upload-config";

const CONFIG_FILE_PATH = join(process.cwd(), "config", "uploads.json");

export async function getConfig(): Promise<UploadConfig> {
  try {
    const configData = await readFile(CONFIG_FILE_PATH, "utf-8");
    return JSON.parse(configData);
  } catch (error) {
    // Si le fichier n'existe pas ou est invalide, retourner la configuration par défaut
    return defaultConfig;
  }
}
