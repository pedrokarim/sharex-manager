import { readFile } from "fs/promises";
import { join } from "path";
import { UploadConfig } from "@/lib/types/upload-config";

const CONFIG_FILE_PATH = join(process.cwd(), "config", "uploads.json");

export const defaultConfig: UploadConfig = {
  allowedTypes: {
    images: true,
    documents: false,
    archives: false,
  },
  limits: {
    maxFileSize: 10,
    minFileSize: 1,
    maxFilesPerUpload: 50,
    maxFilesPerType: {
      images: 30,
      documents: 20,
      archives: 10,
    },
  },
  filenamePattern: "{timestamp}-{random}-{original}",
  thumbnails: {
    enabled: true,
    maxWidth: 200,
    maxHeight: 200,
    quality: 80,
    format: "auto",
    preserveFormat: true,
    fit: "cover", 
    background: "rgba(255, 255, 255, 0)",
    metadata: true,
    progressive: true,
    blur: 0,
    sharpen: false,
  },
  storage: {
    path: "./uploads",
    structure: "type",
    preserveFilenames: false,
    replaceExisting: false,
    thumbnailsPath: "thumbnails",
    dateFormat: {
      folderStructure: "YYYY/MM",
      timezone: "Europe/Paris",
    },
    permissions: {
      files: "0644",
      directories: "0755",
    },
  },
  domains: {
    list: [
      {
        id: "default",
        name: "Local Development",
        url: "http://localhost:3000",
        isDefault: true,
      },
    ],
    defaultDomain: "default",
    useSSL: true,
    pathPrefix: "/uploads",
  },
};

export async function getConfig(): Promise<UploadConfig> {
  try {
    const configData = await readFile(CONFIG_FILE_PATH, "utf-8");
    return JSON.parse(configData);
  } catch (error) {
    // Si le fichier n'existe pas ou est invalide, retourner la configuration par défaut
    return defaultConfig;
  }
}
