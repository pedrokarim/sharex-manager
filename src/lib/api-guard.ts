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

let allowedOrigins: Set<string> | null = null;

/** Origines de confiance, lues au premier usage (et non à l'import du module). */
function getAllowedOrigins(): Set<string> {
  allowedOrigins ??= new Set(
    trustedOrigins.flatMap((value) => {
      try {
        return [new URL(value).origin];
      } catch {
        return [];
      }
    })
  );
  return allowedOrigins;
}

/**
 * Vrai si la requête ne vient pas d'un autre site. Un navigateur joint
 * `Origin` aux requêtes qui modifient ; une page d'un autre site (même un
 * sous-domaine, pour qui le cookie de session part aussi) est refusée. Sans
 * `Origin` (ShareX, curl, navigation simple), rien n'est bloqué.
 */
export function isTrustedOrigin(origin: string | null): boolean {
  return !origin || getAllowedOrigins().has(origin);
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

/** Méthodes qui modifient : seules celles-ci exigent une origine de confiance. */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface WithAuthOptions {
  /** Niveau exigé ; `"user"` (tout compte connecté) par défaut. */
  role?: AccessLevel;
  /**
   * Refuser les requêtes qui modifient (POST, PUT, PATCH, DELETE) venues d'un
   * autre site. Actif par défaut : ne le couper que pour une route appelée
   * hors navigateur, et l'expliquer.
   */
  origin?: boolean;
}

/**
 * Enveloppe d'une route à session : origine de confiance pour les méthodes
 * qui modifient, session exigée, puis rôle. Le gestionnaire reçoit la session
 * en troisième argument et n'a plus à la relire.
 *
 * ```ts
 * export const DELETE = withAuth(async (request, context, session) => { … }, { role: "admin" });
 * ```
 */
export function withAuth<Req extends Request = Request, Ctx = unknown>(
  handler: (request: Req, context: Ctx, session: Session) => Response | Promise<Response>,
  options: WithAuthOptions = {}
): (request: Req, context: Ctx) => Promise<Response> {
  const level = options.role ?? "user";
  const checkOrigin = options.origin ?? true;
  return async (request, context) => {
    const requestHeaders = await headers();
    const method = (request?.method ?? "GET").toUpperCase();
    const origin = request?.headers?.get("origin") ?? requestHeaders.get("origin");
    if (checkOrigin && MUTATING_METHODS.has(method) && !isTrustedOrigin(origin)) {
      return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
    }
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!hasAccess(session, level)) {
      return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
    }
    return handler(request, context, session);
  };
}
