import { randomBytes } from "node:crypto";

import { resolveAuthProvider, type AuthProvider } from "../lib/auth-config";

export interface SetupOptions {
  authProvider: AuthProvider;
  appUrl: string;
  port: number;
  authSecret: string;
  builtinAdmin?: {
    username: string;
    password: string;
  };
  ascenciaIssuer?: string;
  ascenciaClientId?: string;
  ascenciaClientSecret?: string;
  ascenciaAdminRoles?: string;
}

type Environment = Record<string, string | undefined>;

export function parseSetupOptions(
  args: string[],
  env: Environment = process.env
): SetupOptions {
  const authProvider = resolveAuthProvider(
    setupOptionValue(args, "--auth") ?? env.SHAREX_AUTH_PROVIDER
  );
  const appUrl = normalizedUrl(
    setupOptionValue(args, "--app-url") ??
      env.AUTH_URL ??
      "http://localhost:3000",
    "--app-url"
  );
  const port = normalizedPort(
    setupOptionValue(args, "--port") ||
      env.PORT?.trim() ||
      new URL(appUrl).port ||
      "3000"
  );
  const authSecret =
    (setupOptionValue(args, "--auth-secret") ?? env.AUTH_SECRET?.trim()) ||
    randomBytes(32).toString("base64url");

  if (authProvider === "builtin") {
    const adminUsername =
      setupOptionValue(args, "--admin-username") ??
      env.SHAREX_SETUP_ADMIN_USERNAME?.trim();
    const adminPassword =
      setupOptionValue(args, "--admin-password") ??
      env.SHAREX_SETUP_ADMIN_PASSWORD;

    if (Boolean(adminUsername) !== Boolean(adminPassword)) {
      throw new Error(
        "--admin-username et --admin-password doivent être fournis ensemble"
      );
    }

    if (adminUsername && adminPassword) {
      if (adminUsername.length < 3) {
        throw new Error("--admin-username doit contenir au moins 3 caractères");
      }
      if (adminPassword.length < 12) {
        throw new Error("--admin-password doit contenir au moins 12 caractères");
      }
    }

    return {
      authProvider,
      appUrl,
      port,
      authSecret,
      ...(adminUsername && adminPassword
        ? { builtinAdmin: { username: adminUsername, password: adminPassword } }
        : {}),
    };
  }

  return {
    authProvider,
    appUrl,
    port,
    authSecret,
    ascenciaIssuer: normalizedUrl(
      requiredOption(
        setupOptionValue(args, "--ascencia-issuer") ?? env.ASCENCIA_ISSUER,
        "--ascencia-issuer"
      ),
      "--ascencia-issuer"
    ).replace(/\/+$/, ""),
    ascenciaClientId: requiredOption(
      setupOptionValue(args, "--ascencia-client-id") ?? env.ASCENCIA_CLIENT_ID,
      "--ascencia-client-id"
    ),
    ascenciaClientSecret: requiredOption(
      setupOptionValue(args, "--ascencia-client-secret") ??
        env.ASCENCIA_CLIENT_SECRET,
      "--ascencia-client-secret"
    ),
    ascenciaAdminRoles:
      (setupOptionValue(args, "--ascencia-admin-roles") ??
        env.ASCENCIA_ADMIN_ROLES?.trim()) ||
      "superadmin",
  };
}

export function setupEnvironment(options: SetupOptions): Record<string, string> {
  return {
    SHAREX_AUTH_PROVIDER: options.authProvider,
    AUTH_SECRET: options.authSecret,
    AUTH_URL: options.appUrl,
    PORT: String(options.port),
    NEXT_PUBLIC_API_URL: options.appUrl,
    NEXT_PUBLIC_SITE_URL: options.appUrl,
    ...(options.authProvider === "ascencia"
      ? {
          ASCENCIA_ISSUER: options.ascenciaIssuer!,
          ASCENCIA_CLIENT_ID: options.ascenciaClientId!,
          ASCENCIA_CLIENT_SECRET: options.ascenciaClientSecret!,
          ASCENCIA_ADMIN_ROLES: options.ascenciaAdminRoles!,
        }
      : {}),
  };
}

/** Met à jour uniquement les clés gérées et préserve le reste du fichier. */
export function mergeEnvironmentFile(
  content: string,
  updates: Record<string, string>
): string {
  const remaining = new Map(Object.entries(updates));
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const merged = lines.map((line) => {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line);
    const key = match?.[1];
    if (!key || !remaining.has(key)) return line;

    const value = remaining.get(key)!;
    remaining.delete(key);
    return `${key}=${serializeEnvironmentValue(value)}`;
  });

  if (remaining.size > 0) {
    while (merged.at(-1) === "") merged.pop();
    if (merged.length > 0) merged.push("");
    merged.push("# Configuration générée par bun run setup");
    for (const [key, value] of remaining) {
      merged.push(`${key}=${serializeEnvironmentValue(value)}`);
    }
  }

  return `${merged.join("\n").replace(/\n+$/, "")}\n`;
}

export function setupOptionValue(
  args: string[],
  name: string
): string | undefined {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();

  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Valeur manquante pour ${name}`);
  }
  return value.trim();
}

function requiredOption(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`${name} est obligatoire avec --auth ascencia`);
  }
  return value.trim();
}

function normalizedUrl(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} doit être une URL absolue valide`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} doit utiliser http ou https`);
  }

  return url.toString().replace(/\/$/, "");
}

function normalizedPort(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error("--port doit être un nombre entier");
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("--port doit être compris entre 1 et 65535");
  }

  return port;
}

function serializeEnvironmentValue(value: string): string {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")}"`;
}
