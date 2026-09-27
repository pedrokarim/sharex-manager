/**
 * Contrôle d'accès commun aux routes d'API.
 *
 * Le proxy laisse passer toutes les requêtes (voir `proxy.ts`) : chaque route
 * se protège elle-même. Passer par ce garde plutôt que de réécrire
 * `getSession` et le test de rôle à la main évite l'oubli du rôle, qui avait
 * laissé les routes de gestion des modules ouvertes à tout compte connecté.
 */

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth, trustedOrigins, type Session } from "@/lib/auth";

export type AccessLevel = "user" | "admin";

export type GuardResult =
  | { ok: true; session: Session }
  | { ok: false; response: NextResponse };

export function isAdmin(session: Session | null | undefined): boolean {
  return session?.user?.role === "admin";
}

/** Vrai si la session satisfait le niveau demandé. */
export function hasAccess(session: Session | null | undefined, level: AccessLevel): boolean {
  if (!session) return false;
  return level === "user" || isAdmin(session);
}

const allowedOrigins = new Set(
  trustedOrigins.flatMap((value) => {
    try {
      return [new URL(value).origin];
    } catch {
      return [];
    }
  })
);

/**
 * Vrai si la requête ne vient pas d'un autre site. Un navigateur joint
 * `Origin` aux requêtes qui modifient ; une page d'un autre site (même un
 * sous-domaine, pour qui le cookie de session part aussi) est refusée. Sans
 * `Origin` (ShareX, curl, navigation simple), rien n'est bloqué.
 */
export function isTrustedOrigin(origin: string | null): boolean {
  return !origin || allowedOrigins.has(origin);
}

/**
 * Session exigée, et rôle admin si `level` vaut `"admin"`. En cas de refus,
 * `response` est prête à être renvoyée telle quelle (401 ou 403).
 */
export async function requireAccess(level: AccessLevel): Promise<GuardResult> {
  const requestHeaders = await headers();
  if (!isTrustedOrigin(requestHeaders.get("origin"))) {
    return { ok: false, response: NextResponse.json({ error: "Origine refusée" }, { status: 403 }) };
  }
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "Non autorisé" }, { status: 401 }) };
  }
  if (!hasAccess(session, level)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 }),
    };
  }
  return { ok: true, session };
}
