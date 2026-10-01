/**
 * Règles des préférences de compte, sans dépendance : utilisables côté
 * serveur comme dans les tests (la base, elle, a besoin de `bun:sqlite`).
 */

/** Une portée : minuscules, chiffres, points et tirets, comme « module.sujet ». */
const SCOPE = /^[a-z0-9][a-z0-9.-]{0,63}$/;
/** Une préférence est un réglage, pas un espace de stockage. */
export const MAX_PREFERENCE_BYTES = 8 * 1024;
export const MAX_SCOPES_PER_USER = 100;

export type PreferenceValue = Record<string, unknown>;

export function isPreferenceScope(value: unknown): value is string {
  return typeof value === "string" && SCOPE.test(value);
}

/** Objet JSON simple, de taille raisonnable ; sinon `null`. */
export function parsePreferenceValue(value: unknown): PreferenceValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return null;
  }
  if (Buffer.byteLength(serialized) > MAX_PREFERENCE_BYTES) return null;
  return JSON.parse(serialized) as PreferenceValue;
}
