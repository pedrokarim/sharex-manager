/**
 * Politique des mots de passe (mode « builtin ») : une seule source pour la
 * longueur minimale, le refus des mots de passe courants et le coût bcrypt.
 *
 * Utilisée par better-auth, la route d'administration des comptes, la CLI
 * (`bun cli users`, `bun run setup`) et `scripts/auth-set-password.ts`.
 */

import bcrypt from "bcryptjs";
import { COMMON_PASSWORDS } from "./common-passwords";
import { getPasswordSettings } from "./settings";
import { DEFAULT_PASSWORD_MIN_LENGTH } from "./settings-schema";

/**
 * Coût bcrypt de tous les nouveaux condensats. Les comptes historiques
 * (`data/users.json`) portent des condensats de coût 10 : bcrypt lit le coût
 * dans le condensat, ils restent donc valides quelle que soit cette valeur.
 */
export const BCRYPT_COST = 10;

/** Au-delà, bcrypt ignore la suite (72 octets) : on refuse plutôt que tronquer en silence. */
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordPolicy {
  minLength: number;
  rejectCommon: boolean;
}

export type PasswordCheck =
  | { ok: true }
  | { ok: false; reason: "too-short" | "too-long" | "common"; message: string };

const commonPasswords = new Set(COMMON_PASSWORDS);

/** Vrai si le mot de passe figure dans la liste des plus répandus (casse ignorée). */
export function isCommonPassword(password: string): boolean {
  return commonPasswords.has(password.trim().toLowerCase());
}

/** Politique en vigueur, lue dans `data/security.json` (12 caractères par défaut). */
export function getPasswordPolicy(): PasswordPolicy {
  try {
    return getPasswordSettings();
  } catch {
    return { minLength: DEFAULT_PASSWORD_MIN_LENGTH, rejectCommon: true };
  }
}

export function checkPassword(password: string, policy: PasswordPolicy = getPasswordPolicy()): PasswordCheck {
  if (password.length < policy.minLength) {
    return {
      ok: false,
      reason: "too-short",
      message: `Le mot de passe doit contenir au moins ${policy.minLength} caractères.`,
    };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      reason: "too-long",
      message: `Le mot de passe ne doit pas dépasser ${PASSWORD_MAX_LENGTH} caractères.`,
    };
  }
  if (policy.rejectCommon && isCommonPassword(password)) {
    return {
      ok: false,
      reason: "common",
      message: "Ce mot de passe fait partie des plus répandus : choisissez-en un autre.",
    };
  }
  return { ok: true };
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
