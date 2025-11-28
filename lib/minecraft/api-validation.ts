/**
 * Utilitaires de validation partagés pour les APIs Minecraft
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Valide un paramètre skin (UUID ou URL)
 */
export function validateSkinParam(skin: string | null): ValidationResult {
  if (!skin) {
    return { isValid: false, error: "Paramètre skin manquant" };
  }

  // UUID format ou URL valide
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const urlRegex = /^https?:\/\/.+/;

  if (!uuidRegex.test(skin) && !urlRegex.test(skin)) {
    return {
      isValid: false,
      error: "Format de skin invalide (UUID ou URL requis)",
    };
  }

  return { isValid: true };
}

/**
 * Valide les dimensions d'une image
 */
export function validateDimensions(
  width: number,
  height: number,
  minSize: number = 8,
  maxSize: number = 2000
): ValidationResult {
  if (
    width < minSize ||
    width > maxSize ||
    height < minSize ||
    height > maxSize
  ) {
    return {
      isValid: false,
      error: `Dimensions invalides (${minSize}-${maxSize}px)`,
    };
  }

  return { isValid: true };
}

/**
 * Valide un nom d'utilisateur Minecraft
 */
export function validateUsername(username: string | null): ValidationResult {
  if (!username) {
    return { isValid: false, error: "Paramètre username manquant" };
  }

  if (username.length < 3 || username.length > 16) {
    return {
      isValid: false,
      error: "Le pseudo doit contenir entre 3 et 16 caractères",
    };
  }

  const validUsernameRegex = /^[a-zA-Z0-9_]+$/;
  if (!validUsernameRegex.test(username)) {
    return {
      isValid: false,
      error: "Le pseudo contient des caractères invalides",
    };
  }

  return { isValid: true };
}

/**
 * Valide les angles de rotation pour le rendu 3D
 */
export function validateRotationAngles(
  theta: number,
  phi: number
): ValidationResult {
  if (theta < -180 || theta > 180) {
    return { isValid: false, error: "Angle theta invalide (-180 à 180)" };
  }

  if (phi < -90 || phi > 90) {
    return { isValid: false, error: "Angle phi invalide (-90 à 90)" };
  }

  return { isValid: true };
}

/**
 * Valide un paramètre booléen depuis les query params
 */
export function parseBooleanParam(
  value: string | null,
  defaultValue: boolean = false
): boolean {
  if (!value) return defaultValue;
  return value === "1" || value === "true";
}

/**
 * Valide et parse un paramètre numérique depuis les query params
 */
export function parseNumberParam(
  value: string | null,
  defaultValue: number,
  min?: number,
  max?: number
): { value: number; error?: string } {
  if (!value) return { value: defaultValue };

  const parsed = parseInt(value);
  if (isNaN(parsed)) {
    return { value: defaultValue, error: "Valeur numérique invalide" };
  }

  if (min !== undefined && parsed < min) {
    return {
      value: defaultValue,
      error: `Valeur trop petite (minimum: ${min})`,
    };
  }

  if (max !== undefined && parsed > max) {
    return {
      value: defaultValue,
      error: `Valeur trop grande (maximum: ${max})`,
    };
  }

  return { value: parsed };
}
