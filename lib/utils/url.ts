import { UploadConfig, Domain } from "../types/upload-config";

/**
 * Génère une URL d'image pour la galerie basée sur la variable d'environnement NEXT_PUBLIC_IMAGE_DOMAIN
 * @param filename - Le nom du fichier
 * @returns L'URL complète de l'image
 */
export function getGalleryImageUrl(filename: string): string {
  const imageDomain = process.env.NEXT_PUBLIC_IMAGE_DOMAIN;

  // En production, utiliser la variable d'environnement si définie
  if (process.env.NODE_ENV === "production" && imageDomain) {
    return `https://${imageDomain}/${filename}`;
  }

  // En développement, utiliser la variable d'environnement si définie, sinon localhost
  if (imageDomain) {
    return `https://${imageDomain}/${filename}`;
  }

  // Fallback vers localhost en développement
  return `http://localhost:3000/api/files/${filename}`;
}

/**
 * Génère le chemin de stockage du fichier (pour affichage dans les détails)
 * @param filename - Le nom du fichier
 * @returns Le chemin de stockage
 */
export function getFileStoragePath(filename: string): string {
  return `/api/files/${filename}`;
}

export function getFileUrl(
  config: UploadConfig,
  filePath: string,
  domainId?: string
): string {
  const { domains } = config;

  // Trouver le domaine à utiliser
  let domain: Domain | undefined;

  if (domainId) {
    domain = domains.list.find((d) => d.id === domainId);
  }

  if (!domain) {
    // Si pas de domaine spécifié ou non trouvé, utiliser le domaine par défaut
    domain =
      domains.list.find((d) => d.id === domains.defaultDomain) ||
      domains.list.find((d) => d.isDefault) ||
      domains.list[0];
  }

  if (!domain) {
    throw new Error("Aucun domaine configuré");
  }

  // Construire l'URL
  let baseUrl = domain.url;

  // Forcer HTTPS si demandé
  if (domains.useSSL && baseUrl.startsWith("http:")) {
    baseUrl = baseUrl.replace("http:", "https:");
  }

  // Nettoyer les slashes
  const cleanPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  const cleanPrefix = domains.pathPrefix.endsWith("/")
    ? domains.pathPrefix.slice(0, -1)
    : domains.pathPrefix;

  return `${baseUrl}${cleanPrefix}/${cleanPath}`;
}

export function getDomainsList(config: UploadConfig): Domain[] {
  return config.domains.list;
}

export function getDefaultDomain(config: UploadConfig): Domain {
  const domain =
    config.domains.list.find((d) => d.id === config.domains.defaultDomain) ||
    config.domains.list.find((d) => d.isDefault) ||
    config.domains.list[0];

  if (!domain) {
    throw new Error("Aucun domaine configuré");
  }

  return domain;
}
