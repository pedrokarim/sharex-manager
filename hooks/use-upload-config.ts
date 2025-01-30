import { useEffect, useState } from "react";
import { toast } from "sonner";

export interface UploadConfig {
  allowedTypes: {
    images: boolean;
    documents: boolean;
    archives: boolean;
  };
  limits: {
    maxFileSize: number; // en MB
    minFileSize: number; // en KB
    maxFilesPerUpload: number;
    maxFilesPerType: {
      images: number;
      documents: number;
      archives: number;
    };
  };
  filenamePattern: string;
  thumbnails: {
    enabled: boolean;
    maxWidth: number;
    maxHeight: number;
    quality: number;
    fit: "cover" | "contain" | "fill" | "inside" | "outside";
    format: "jpeg" | "png" | "webp" | "auto";
    preserveFormat: boolean;
    background: { r: number; g: number; b: number; alpha: number };
    sharpen: boolean;
    blur: number;
    progressive: boolean;
    metadata: boolean;
  };
  storage: {
    path: string;
    structure: "flat" | "date" | "type";
    preserveFilenames: boolean;
    replaceExisting: boolean;
    thumbnailsPath: string;
    dateFormat: {
      folderStructure: string;
      timezone: string;
    };
    permissions: {
      files: string;
      directories: string;
    };
  };
}

export const defaultConfig: UploadConfig = {
  allowedTypes: {
    images: true,
    documents: false,
    archives: false,
  },
  limits: {
    maxFileSize: 10, // 10 MB
    minFileSize: 1, // 1 KB
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
    fit: "inside",
    format: "auto",
    preserveFormat: true,
    background: { r: 255, g: 255, b: 255, alpha: 0 },
    sharpen: true,
    blur: 0,
    progressive: true,
    metadata: false,
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
};

export function useUploadConfig() {
  const [config, setConfig] = useState<UploadConfig>(defaultConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/uploads/config");
      if (!response.ok)
        throw new Error("Erreur lors du chargement de la configuration");
      const data = await response.json();
      setConfig(data);
    } catch (error) {
      console.error("Erreur:", error);
      toast.error("Impossible de charger la configuration");
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfig = async (newConfig: UploadConfig) => {
    try {
      setIsSaving(true);
      const response = await fetch("/api/uploads/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newConfig),
      });

      if (!response.ok) throw new Error("Erreur lors de la sauvegarde");

      setConfig(newConfig);
      toast.success("Configuration sauvegardée");
    } catch (error) {
      console.error("Erreur:", error);
      toast.error("Impossible de sauvegarder la configuration");
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const isFileAllowed = (file: File): boolean => {
    const imageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const documentTypes = [
      "application/pdf",
      "application/msword",
      "text/plain",
    ];
    const archiveTypes = ["application/zip", "application/x-rar-compressed"];

    if (file.size > config.maxFileSize * 1024 * 1024) {
      return false;
    }

    if (imageTypes.includes(file.type) && config.allowedTypes.images) {
      return true;
    }

    if (documentTypes.includes(file.type) && config.allowedTypes.documents) {
      return true;
    }

    if (archiveTypes.includes(file.type) && config.allowedTypes.archives) {
      return true;
    }

    return false;
  };

  const generateFilename = (originalFilename: string): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);

    return config.filenamePattern
      .replace("{timestamp}", timestamp.toString())
      .replace("{random}", random);
  };

  const getUploadPath = (filename: string, fileType: string): string => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    switch (config.storage.structure) {
      case "date":
        return `${config.storage.path}/${year}/${month}/${day}/${filename}`;
      case "type":
        const type = fileType.split("/")[0];
        return `${config.storage.path}/${type}/${filename}`;
      default:
        return `${config.storage.path}/${filename}`;
    }
  };

  return {
    config,
    isLoading,
    isSaving,
    loadConfig,
    saveConfig,
    isFileAllowed,
    generateFilename,
    getUploadPath,
  };
}
