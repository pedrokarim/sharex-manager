import path from "path";
import fs from "fs";

// Définition du type pour la configuration
interface StorageConfig {
  uploadPath: string;
}

// Configuration avec valeur par défaut
export const storageConfig: StorageConfig = {
  uploadPath: process.env.UPLOAD_PATH || "./uploads",
};

// Helper function pour obtenir le chemin absolu
export function getAbsoluteUploadPath(): string {
  let uploadPath;
  // check if the uploadPath is a relative path
  if (!path.isAbsolute(storageConfig.uploadPath)) {
    uploadPath = path.resolve(process.cwd(), storageConfig.uploadPath);
  } else {
    uploadPath = storageConfig.uploadPath;
  }

  // check if the uploadPath is a directory
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }

  return uploadPath;
}
