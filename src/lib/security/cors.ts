/**
 * Origines admises (CORS et contrôle d'origine), lues dans l'environnement.
 * La logique vit dans `cors-origins.mjs`, que `next.config.mjs` importe aussi.
 */

import * as origins from "./cors-origins.mjs";

export type Environment = Record<string, string | undefined>;

const env = (): Environment => process.env;

export const toOrigin = (value: string | undefined): string | null => origins.toOrigin(value);

export const primaryAppOrigin = (source: Environment = env()): string | null => origins.primaryAppOrigin(source);

export const appOrigins = (source: Environment = env()): string[] => origins.appOrigins(source);

export const imageOrigin = (source: Environment = env()): string | null => origins.imageOrigin(source);

export const imageHost = (source: Environment = env()): string | null => origins.imageHost(source);

export const extraOrigins = (source: Environment = env()): string[] => origins.extraOrigins(source);

export const allowedCorsOrigins = (source: Environment = env()): string[] => origins.allowedCorsOrigins(source);

export const resolveCorsOrigin = (origin: string | null | undefined, source: Environment = env()): string | null =>
  origins.resolveCorsOrigin(origin, source);

/** En-têtes CORS communs des réponses de l'application. */
export const CORS_BASE_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;
