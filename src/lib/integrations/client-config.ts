/**
 * Fichiers de configuration remis aux outils d'envoi : le `.sxcu` que ShareX
 * (Windows) et `fu` (Flameshot, Linux) importent tels quels, et la
 * configuration que l'application mobile lit dans un QR code.
 *
 * Module pur, sans accès au réseau ni au DOM : tout se fabrique dans le
 * navigateur, à partir d'une clé que le serveur ne connaît plus (il n'en garde
 * que l'empreinte).
 */

import type { ApiKeyPermissions } from "@/types/api-key";

/** Nom de l'uploader dans ShareX quand l'appelant n'en donne pas. */
export const DEFAULT_SXCU_NAME = "ShareX Upload";

/** Version du format `.sxcu` produite. */
const SXCU_VERSION = "14.0.0";

/** Marque et version du QR code, vérifiées par `QRCodeScannerScreen` de l'application mobile. */
export const MOBILE_CONFIG_TYPE = "sharex-mobile-config";
export const MOBILE_CONFIG_VERSION = "1.0.0";

export interface SxcuConfig {
  Version: string;
  Name: string;
  DestinationType: string;
  RequestMethod: "POST";
  RequestURL: string;
  Headers: { "x-api-key": string };
  Body: "MultipartFormData";
  FileFormName: "file";
  URL: string;
  ThumbnailURL: string;
  DeletionURL: string;
  ErrorMessage: string;
}

export interface MobileConfig {
  type: typeof MOBILE_CONFIG_TYPE;
  version: typeof MOBILE_CONFIG_VERSION;
  serverUrl: string;
  apiKey: string;
  permissions: ApiKeyPermissions;
}

/** Adresse publique du serveur : `NEXT_PUBLIC_API_URL`, sinon l'origine de la page. */
export function serverBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured;
  return typeof window === "undefined" ? "" : window.location.origin;
}

function trimBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

/** Destinations ShareX ouvertes par les permissions de la clé, dans l'ordre images, texte, fichiers. */
export function sxcuDestinations(permissions: ApiKeyPermissions): string[] {
  const destinations: string[] = [];
  if (permissions.uploadImages) destinations.push("ImageUploader");
  if (permissions.uploadText) destinations.push("TextUploader");
  if (permissions.uploadFiles) destinations.push("FileUploader");
  return destinations;
}

/** Vrai si la clé peut envoyer quelque chose : sans cela, un `.sxcu` ne servirait à rien. */
export function canUpload(permissions: ApiKeyPermissions): boolean {
  return sxcuDestinations(permissions).length > 0;
}

export function buildSxcu({
  baseUrl,
  key,
  permissions,
  name = DEFAULT_SXCU_NAME,
}: {
  baseUrl: string;
  key: string;
  permissions: ApiKeyPermissions;
  name?: string;
}): SxcuConfig {
  return {
    Version: SXCU_VERSION,
    Name: name.trim() || DEFAULT_SXCU_NAME,
    DestinationType: sxcuDestinations(permissions).join(", "),
    RequestMethod: "POST",
    RequestURL: `${trimBaseUrl(baseUrl)}/api/upload`,
    Headers: { "x-api-key": key },
    Body: "MultipartFormData",
    FileFormName: "file",
    URL: "{json:url}",
    ThumbnailURL: "{json:thumbnail_url}",
    DeletionURL: "{json:deletion_url}",
    ErrorMessage: "{json:error}",
  };
}

/** Le `.sxcu` tel qu'il s'écrit dans le fichier. */
export function serializeSxcu(config: SxcuConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * Nom de fichier tiré du nom de la clé : « ShareX – Windows » donne
 * `sharex-windows.sxcu`. `fu` nomme l'uploader d'après ce fichier, sans
 * l'extension.
 */
export function sxcuFileName(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `${slug || "sharex-manager"}.sxcu`;
}

/** Configuration lue par l'application mobile ; l'ordre des champs reprend celui qu'elle a toujours reçu. */
export function buildMobileConfig({
  baseUrl,
  key,
  permissions,
}: {
  baseUrl: string;
  key: string;
  permissions: ApiKeyPermissions;
}): MobileConfig {
  return {
    type: MOBILE_CONFIG_TYPE,
    version: MOBILE_CONFIG_VERSION,
    serverUrl: trimBaseUrl(baseUrl),
    apiKey: key,
    permissions,
  };
}

/**
 * Forme d'une clé collée à la main : un seul bloc, sans espace. Les clés
 * actuelles commencent par `sk_` ; d'anciennes clés saisies à la main
 * peuvent être plus courtes et sans préfixe.
 */
export function looksLikeApiKey(value: string): boolean {
  const key = value.trim();
  return key.length >= 8 && key.length <= 200 && !/\s/.test(key);
}
