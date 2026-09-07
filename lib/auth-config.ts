export const AUTH_PROVIDERS = ["builtin", "ascencia"] as const;

export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export interface BuiltinAuthConfig {
  provider: "builtin";
}

export interface AscenciaAuthConfig {
  provider: "ascencia";
  issuer: string;
  clientId: string;
  clientSecret: string;
  adminRoles: string[];
}

export type AuthConfig = BuiltinAuthConfig | AscenciaAuthConfig;

type Environment = Record<string, string | undefined>;

/**
 * Résout le mode d'authentification sans dépendre du navigateur. La valeur
 * vide conserve volontairement le mode historique pour les installations
 * existantes.
 */
export function resolveAuthProvider(value: string | undefined): AuthProvider {
  const normalized = value?.trim().toLowerCase() || "builtin";

  if (normalized === "builtin" || normalized === "ascencia") {
    return normalized;
  }

  throw new Error(
    `SHAREX_AUTH_PROVIDER doit valoir "builtin" ou "ascencia" (reçu : ${value})`
  );
}

export function resolveAuthConfig(env: Environment = process.env): AuthConfig {
  const provider = resolveAuthProvider(env.SHAREX_AUTH_PROVIDER);

  if (provider === "builtin") {
    return { provider };
  }

  const issuer = requiredValue(env, "ASCENCIA_ISSUER").replace(/\/+$/, "");
  const clientId = requiredValue(env, "ASCENCIA_CLIENT_ID");
  const clientSecret = requiredValue(env, "ASCENCIA_CLIENT_SECRET");
  const adminRoles = (env.ASCENCIA_ADMIN_ROLES ?? "superadmin")
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);

  if (adminRoles.length === 0) {
    throw new Error("ASCENCIA_ADMIN_ROLES doit contenir au moins un rôle");
  }

  return {
    provider,
    issuer,
    clientId,
    clientSecret,
    adminRoles,
  };
}

function requiredValue(env: Environment, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} est obligatoire lorsque SHAREX_AUTH_PROVIDER=ascencia`
    );
  }
  return value;
}
