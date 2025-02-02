import { readFile } from "fs/promises";
import { resolve } from "path";
import { UploadConfig } from "@/lib/types/upload-config";

const CONFIG_PATH = resolve(process.cwd(), "config", "uploads.json");

const defaultConfig: UploadConfig = {
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

export async function getServerConfig(): Promise<UploadConfig> {
  try {
    const configData = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(configData);
  } catch (error) {
    console.error("Erreur lors de la lecture de la configuration:", error);
    return defaultConfig;
  }
}
