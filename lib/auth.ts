import { Database } from "bun:sqlite";
import { join } from "path";
import { mkdirSync } from "fs";
import bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import {
  genericOAuth,
  username,
  type GenericOAuthConfig,
} from "better-auth/plugins";
import { createVerifier } from "@ascencia/id-server";

import {
  resolveAuthConfig,
  type AscenciaAuthConfig,
} from "@/lib/auth-config";

const dataDir = join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

const database = new Database(join(dataDir, "auth.db"));
const authConfig = resolveAuthConfig();

const ASCENCIA_PROVIDER_ID = "ascencia";

/**
 * better-auth rejette toute requête dont l'`Origin` ne correspond pas au
 * `baseURL` (l'équivalent d'Auth.js était `trustHost: true`, qui désactivait
 * la vérification). AUTH_URL pointe sur le domaine de production : sans cette
 * liste, se connecter depuis http://localhost:<PORT> renvoie 403.
 */
const trustedOrigins = [
  process.env.AUTH_URL,
  process.env.NEXT_PUBLIC_API_URL,
  process.env.NEXT_PUBLIC_APP_DOMAIN &&
    `https://${process.env.NEXT_PUBLIC_APP_DOMAIN}`,
  process.env.NODE_ENV === "development" &&
    `http://localhost:${process.env.PORT ?? 3000}`,
].filter((origin): origin is string => Boolean(origin));

export const auth = betterAuth({
  appName: "ShareX Manager",
  database,
  secret: process.env.AUTH_SECRET,
  baseURL: process.env.AUTH_URL,
  trustedOrigins,
  advanced: {
    ipAddress: {
      // Le port applicatif est limité au loopback et Nginx écrase cet en-tête
      // avec l'adresse cliente restaurée depuis Cloudflare.
      ipAddressHeaders: ["x-real-ip"],
    },
  },
  emailAndPassword: {
    enabled: authConfig.provider === "builtin",
    // Les comptes historiques (data/users.json) portent un hash bcrypt : on garde
    // bcrypt des deux côtés pour que les mots de passe existants restent valides.
    password: {
      hash: (password) => bcrypt.hash(password, 10),
      verify: ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
        // Le hook ci-dessous refuse toute élévation venant d'un endpoint
        // client. L'entrée n'est ouverte que pour recevoir le rôle calculé à
        // partir d'un jeton Ascencia ID vérifié lors du callback OIDC.
        input: true,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        async before(user, context) {
          // Les appels internes (migration des comptes historiques) sont déjà
          // sous contrôle du serveur et conservent leur rôle explicite.
          if (!context) return;

          return {
            data: {
              ...user,
              role:
                isAscenciaCallback(context.path) && user.role === "admin"
                  ? "admin"
                  : "user",
            },
          };
        },
      },
      update: {
        async before(user, context) {
          if (!context || !("role" in user)) return;

          return {
            data: {
              ...user,
              role:
                isAscenciaCallback(context.path) && user.role === "admin"
                  ? "admin"
                  : "user",
            },
          };
        },
      },
    },
  },
  // nextCookies() doit rester le dernier plugin.
  plugins: [
    username(),
    genericOAuth({
      config:
        authConfig.provider === "ascencia"
          ? [createAscenciaProvider(authConfig)]
          : [],
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;

function isAscenciaCallback(path: string | undefined): boolean {
  return path === `/oauth2/callback/${ASCENCIA_PROVIDER_ID}`;
}

function createAscenciaProvider(
  config: AscenciaAuthConfig
): GenericOAuthConfig {
  const verifyAccessToken = createVerifier({
    issuer: config.issuer,
    audience: config.clientId,
  });

  return {
    providerId: ASCENCIA_PROVIDER_ID,
    discoveryUrl: `${config.issuer}/.well-known/openid-configuration`,
    issuer: config.issuer,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    scopes: [
      "openid",
      "profile",
      "email",
      "offline_access",
      "ascencia.roles",
    ],
    pkce: true,
    authentication: "basic",
    overrideUserInfo: true,
    async getUserInfo(tokens) {
      if (!tokens.accessToken) return null;

      const [verified, response] = await Promise.all([
        verifyAccessToken(tokens.accessToken),
        fetch(`${config.issuer}/oauth/userinfo`, {
          headers: { authorization: `Bearer ${tokens.accessToken}` },
          cache: "no-store",
        }),
      ]);

      if (!response.ok) return null;

      const profile = (await response.json()) as {
        sub?: string;
        name?: string;
        preferred_username?: string;
        email?: string;
        email_verified?: boolean;
        picture?: string;
      };

      if (!profile.sub || profile.sub !== verified.claims.sub || !profile.email) {
        return null;
      }

      const effectiveRoles = new Set([
        ...(verified.claims.roles ?? []),
        ...(verified.claims.prole ?? []),
      ]);
      const isAdmin = config.adminRoles.some((role) =>
        effectiveRoles.has(role)
      );

      return {
        id: profile.sub,
        name: profile.name ?? profile.preferred_username ?? profile.email,
        email: profile.email,
        emailVerified: profile.email_verified === true,
        image: profile.picture,
        role: isAdmin ? "admin" : "user",
      };
    },
  };
}
