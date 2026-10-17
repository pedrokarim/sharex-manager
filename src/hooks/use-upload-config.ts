"use client";

import { useEffect, useState } from "react";
import type { UploadConfig } from "@/lib/types/upload-config";
import { defaultConfig } from "@/lib/defaultConfig";

/** Issue d'un enregistrement : l'appelant l'affiche là où il a été demandé. */
export type SaveConfigResult = { ok: true } | { ok: false; error: string };

/**
 * Configuration des envois. Le crochet n'affiche rien lui-même : l'échec du
 * chargement est exposé dans `loadError`, et `saveConfig` rend son issue, pour
 * que chaque écran la dise à sa place (à côté du bouton Enregistrer, en tête
 * de page…).
 */
export function useUploadConfig() {
  const [config, setConfig] = useState<UploadConfig>(defaultConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadConfig = async () => {
    try {
      setLoadError(null);
      const response = await fetch("/api/settings/config");
      if (!response.ok)
        throw new Error("Erreur lors du chargement de la configuration");
      const data = await response.json();
      setConfig(data);
    } catch (error) {
      console.error("Erreur lors du chargement de la configuration:", error);
      setLoadError(
        "La configuration des envois n’a pas pu être chargée ; les valeurs par défaut s’appliquent."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfig = async (
    newConfig: Partial<UploadConfig>
  ): Promise<SaveConfigResult> => {
    try {
      setIsSaving(true);
      const response = await fetch("/api/settings/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de la sauvegarde");
      }

      setConfig(data);
      return { ok: true };
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      return {
        ok: false,
        error:
          error instanceof Error && error.message
            ? error.message
            : "La configuration n’a pas pu être enregistrée. Réessayez.",
      };
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
      case "type": {
        const type = fileType.split("/")[0];
        return `${config.storage.path}/${type}/${filename}`;
      }
      default:
        return `${config.storage.path}/${filename}`;
    }
  };

  return {
    config,
    isLoading,
    isSaving,
    loadError,
    loadConfig,
    saveConfig,
    isFileAllowed,
    generateFilename,
    getUploadPath,
  };
}
