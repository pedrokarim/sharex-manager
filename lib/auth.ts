import { Database } from "bun:sqlite";
import { join } from "path";
import { mkdirSync } from "fs";
import bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";

const dataDir = join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

const database = new Database(join(dataDir, "auth.db"));

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
  emailAndPassword: {
    enabled: true,
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
        // Le rôle ne doit jamais être fixé depuis une requête client.
        input: false,
      },
    },
  },
  // nextCookies() doit rester le dernier plugin.
  plugins: [username(), nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
