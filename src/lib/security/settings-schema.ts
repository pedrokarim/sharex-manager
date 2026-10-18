/**
 * Schéma des réglages de sécurité, sans accès disque : importable depuis le
 * navigateur (écran Sécurité) comme depuis le serveur.
 *
 * Chaque champ a une valeur par défaut sûre : un fichier absent, vide ou
 * partiel donne toujours des réglages complets.
 */

import { z } from "zod";

export const DEFAULT_PASSWORD_MIN_LENGTH = 12;

/** Niveaux de limitation de débit proposés dans l'écran, du plus souple au plus strict. */
export const RATE_LIMIT_LEVELS = ["relaxed", "normal", "strict"] as const;
export type RateLimitLevel = (typeof RATE_LIMIT_LEVELS)[number];

export interface RateLimitValues {
  /** Envois par clé API et par heure. */
  uploadsPerKeyPerHour: number;
  /** Affichages d'images par adresse IP et par minute. */
  imageViewsPerIpPerMinute: number;
  /** Appels de l'API publique par adresse IP et par minute. */
  publicApiPerIpPerMinute: number;
}

/**
 * Traduction d'un niveau en limites concrètes, affichée en infobulle dans
 * l'écran. Une galerie publique charge vite des dizaines de miniatures : les
 * affichages d'images restent larges, même au niveau strict.
 */
export const RATE_LIMIT_PRESETS: Record<RateLimitLevel, RateLimitValues> = {
  relaxed: { uploadsPerKeyPerHour: 600, imageViewsPerIpPerMinute: 600, publicApiPerIpPerMinute: 120 },
  normal: { uploadsPerKeyPerHour: 240, imageViewsPerIpPerMinute: 300, publicApiPerIpPerMinute: 60 },
  strict: { uploadsPerKeyPerHour: 60, imageViewsPerIpPerMinute: 120, publicApiPerIpPerMinute: 20 },
};

export const IMAGE_VIEW_LOGGING = ["all", "sampled", "off"] as const;
export type ImageViewLogging = (typeof IMAGE_VIEW_LOGGING)[number];

export const ALERT_KINDS = ["failedSignIns", "newApiKey", "adminNewIp", "fileMadePublic"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

const integer = (min: number, max: number) => z.number().int().min(min).max(max);
const expiryDays = integer(1, 3650).nullable();

const passwordsSchema = z
  .object({
    minLength: integer(8, 128).default(DEFAULT_PASSWORD_MIN_LENGTH),
    rejectCommon: z.boolean().default(true),
  })
  .prefault({});

const sessionsSchema = z
  .object({
    maxAgeDays: integer(1, 90).default(7),
    refreshHours: integer(1, 168).default(24),
  })
  .prefault({})
  .refine((value) => value.refreshHours < value.maxAgeDays * 24, {
    message: "Le renouvellement doit être plus court que la durée de la session.",
    path: ["refreshHours"],
  });

const signInSchema = z
  .object({
    maxAttempts: integer(3, 20).default(5),
    lockMinutes: integer(1, 1440).default(15),
  })
  .prefault({});

const apiKeysSchema = z
  .object({
    defaultExpiryDays: expiryDays.default(90),
    maxExpiryDays: expiryDays.default(365),
    uploadsPerHour: integer(1, 10_000).default(120),
  })
  .prefault({})
  .refine(
    (value) =>
      value.maxExpiryDays === null ||
      (value.defaultExpiryDays !== null && value.defaultExpiryDays <= value.maxExpiryDays),
    {
      message: "La durée par défaut doit exister et ne pas dépasser la durée maximale.",
      path: ["defaultExpiryDays"],
    }
  );

const rateLimitsSchema = z
  .object({
    level: z.enum(RATE_LIMIT_LEVELS).default("normal"),
  })
  .prefault({});

const logsSchema = z
  .object({
    retentionDays: integer(7, 3650).default(90),
    imageViews: z.enum(IMAGE_VIEW_LOGGING).default("all"),
  })
  .prefault({});

const alertsSchema = z
  .object({
    failedSignIns: z.boolean().default(true),
    newApiKey: z.boolean().default(true),
    adminNewIp: z.boolean().default(true),
    fileMadePublic: z.boolean().default(true),
  })
  .prefault({});

export const securitySettingsSchema = z.object({
  passwords: passwordsSchema,
  sessions: sessionsSchema,
  signIn: signInSchema,
  apiKeys: apiKeysSchema,
  rateLimits: rateLimitsSchema,
  logs: logsSchema,
  alerts: alertsSchema,
});

export type SecuritySettings = z.infer<typeof securitySettingsSchema>;
export type SecuritySection = keyof SecuritySettings;

/** Une modification partielle : seules les sections et les champs envoyés changent. */
export type SecuritySettingsPatch = {
  [Section in SecuritySection]?: Partial<SecuritySettings[Section]>;
};

export const SECURITY_SECTIONS = Object.keys(securitySettingsSchema.shape) as SecuritySection[];

/**
 * Sections qui ne servent qu'en mode « builtin » : avec Ascencia ID, mots de
 * passe et verrouillage relèvent du fournisseur d'identité.
 */
export const BUILTIN_ONLY_SECTIONS: SecuritySection[] = ["passwords", "signIn"];

/**
 * Sections lues par better-auth au démarrage du serveur seulement : une
 * modification s'applique au prochain redémarrage.
 */
export const RESTART_REQUIRED_SECTIONS: SecuritySection[] = ["sessions"];

export function defaultSecuritySettings(): SecuritySettings {
  return securitySettingsSchema.parse({});
}

/**
 * Fusionne une modification dans des réglages complets, sans valider : la
 * validation passe ensuite par `securitySettingsSchema`. Les sections ou
 * champs inconnus sont ignorés.
 */
export function mergeSecuritySettings(current: SecuritySettings, patch: unknown): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  const input = patch && typeof patch === "object" && !Array.isArray(patch) ? (patch as Record<string, unknown>) : {};
  for (const section of SECURITY_SECTIONS) {
    const given = input[section];
    const base = current[section] as Record<string, unknown>;
    if (!given || typeof given !== "object" || Array.isArray(given)) {
      next[section] = base;
      continue;
    }
    const merged: Record<string, unknown> = { ...base };
    for (const key of Object.keys(base)) {
      if (key in (given as Record<string, unknown>)) merged[key] = (given as Record<string, unknown>)[key];
    }
    next[section] = merged;
  }
  return next;
}

/** Limites concrètes du niveau choisi. */
export function rateLimitValues(level: RateLimitLevel): RateLimitValues {
  return RATE_LIMIT_PRESETS[level];
}
