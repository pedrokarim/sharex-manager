"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UploadConfig } from "@/lib/types/upload-config";

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

export function useUploadConfig() {
  const [config, setConfig] = useState<UploadConfig>(defaultConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadConfig = async () => {
    try {
      const response = await fetch("/api/settings/config");
      if (!response.ok)
        throw new Error("Erreur lors du chargement de la configuration");
      const data = await response.json();
      setConfig(data);
    } catch (error) {
      console.error("Erreur lors du chargement de la configuration:", error);
      toast.error("Impossible de charger la configuration");
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfig = async (newConfig: Partial<UploadConfig>) => {
    try {
      setIsSaving(true);
      const response = await fetch("/api/settings/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });

      if (!response.ok) throw new Error("Erreur lors de la sauvegarde");

      const updatedConfig = await response.json();
      setConfig(updatedConfig);
      toast.success("Configuration mise à jour");
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      toast.error("Impossible de sauvegarder la configuration");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const isFileAllowed = (file: File): boolean => {
    const imageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const documentTypes = [
      "application/pdf",
      "application/msword",
      "text/plain",
    ];
    const archiveTypes = ["application/zip", "application/x-rar-compressed"];

    if (file.size > config.limits.maxFileSize * 1024 * 1024) {
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
