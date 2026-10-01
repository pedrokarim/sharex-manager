"use client";

import { useEffect, useState } from "react";
import type { Catalogue, EngineId } from "./types";

export const MODULE_NAME = "reverse-search";
export const MODULE_PATH = `/m/${MODULE_NAME}`;

/** Les fonctions du module répondent `{ success, data, error }` : on lève sur échec. */
export async function callModule<T = unknown>(functionName: string, ...args: unknown[]): Promise<T> {
  const response = await fetch("/api/modules/call-function", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ moduleName: MODULE_NAME, functionName, args }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || `Échec de ${functionName} (HTTP ${response.status})`);
  }
  return payload?.data as T;
}

/** Lit un fichier en base64 nu, sans le préfixe `data:`. */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

let catalogueCache: Catalogue | null = null;

/** Catalogue des moteurs, gardé d'une page à l'autre ; `reload` le relit après un changement de clé. */
export function useCatalogue() {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(catalogueCache);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    callModule<Catalogue>("getCatalogue")
      .then((result) => {
        catalogueCache = result;
        if (!cancelled) setCatalogue(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [version]);

  return { catalogue, reload: () => setVersion((current) => current + 1) };
}

/** Réglages de recherche retenus dans le compte. */
export const SEARCH_PREFERENCE_SCOPE = "reverse-search.search";

export const SEARCH_PREFERENCE_DEFAULTS: { engines: EngineId[]; ephemeral: boolean; showWeak: boolean } = {
  engines: ["tracemoe", "saucenao", "iqdb", "google", "yandex"],
  ephemeral: false,
  showWeak: false,
};

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}
