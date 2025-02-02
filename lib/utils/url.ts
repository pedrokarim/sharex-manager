import { UploadConfig, Domain } from "../types/upload-config";

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
