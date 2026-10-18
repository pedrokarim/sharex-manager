/**
 * Crochets better-auth de la sécurité : blocage après des échecs répétés
 * (mode « builtin »), journal des connexions, des échecs et des
 * déconnexions, alertes.
 *
 * En mode Ascencia ID, le mot de passe et le verrouillage relèvent du
 * fournisseur d'identité : seul le retour du callback OIDC est journalisé.
 */

import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import type { AuthProvider } from "@/lib/auth-config";
import { getTrustedClientIp, UNKNOWN_CLIENT_IP } from "@/lib/request-ip";
import { logger } from "@/lib/utils/logger";
import { raiseAlert } from "./alerts";
import { noteAdminSignIn } from "./alerts-store";
import { getSignInSettings } from "./settings";
import { getSignInLock, recordSignInFailure, recordSignInSuccess } from "./sign-in-attempts";

const PASSWORD_SIGN_IN_PATHS = new Set(["/sign-in/username", "/sign-in/email"]);
const OAUTH_CALLBACK_PREFIX = "/oauth2/callback/";

interface HookContext {
  path?: string;
  body?: unknown;
  headers?: Headers;
  request?: Request;
  context: {
    returned?: unknown;
    newSession?: { session: { id: string }; user: { id: string; email?: string | null; role?: string | null } } | null;
  };
}

function requestInfo(ctx: HookContext) {
  const headers = ctx.headers ?? ctx.request?.headers ?? new Headers();
  return {
    ip: getTrustedClientIp(headers),
    userAgent: headers.get("user-agent") ?? undefined,
  };
}

/** Identifiant saisi : nom d'utilisateur ou adresse e-mail, en minuscules. */
function signInIdentifier(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const { username, email } = body as { username?: unknown; email?: unknown };
  const value = typeof username === "string" ? username : typeof email === "string" ? email : "";
  return value.trim().toLowerCase().slice(0, 200);
}

function minutesLabel(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

function isOAuthCallback(path: string | undefined): boolean {
  return Boolean(path?.startsWith(OAUTH_CALLBACK_PREFIX));
}

/** Vrai pour un refus d'identifiants (401), pas pour une requête mal formée. */
function isCredentialFailure(returned: unknown): boolean {
  return isAPIError(returned) && (returned.statusCode === 401 || returned.status === "UNAUTHORIZED");
}

function afterSuccessfulSignIn(ctx: HookContext, method: "password" | "oidc") {
  const newSession = ctx.context.newSession;
  if (!newSession) return;
  const { ip, userAgent } = requestInfo(ctx);
  const { user } = newSession;

  void logger.logAuthAction("auth.login", method === "oidc" ? "Connexion par Ascencia ID" : "Connexion", {
    userId: user.id,
    userEmail: user.email ?? "",
    ip,
    userAgent,
  });

  if (user.role === "admin" && ip !== UNKNOWN_CLIENT_IP) {
    try {
      if (noteAdminSignIn(user.id, ip).isNew) {
        void raiseAlert("adminNewIp", { userId: user.id, userEmail: user.email ?? undefined, ip, userAgent });
      }
    } catch (error) {
      console.error("[security] suivi des adresses administrateur impossible :", error);
    }
  }
}

export function createSecurityHooks(provider: AuthProvider) {
  const before = createAuthMiddleware(async (rawCtx) => {
    const ctx = rawCtx as unknown as HookContext;

    if (provider === "builtin" && ctx.path && PASSWORD_SIGN_IN_PATHS.has(ctx.path)) {
      const identifier = signInIdentifier(ctx.body);
      const { ip, userAgent } = requestInfo(ctx);
      let lock: ReturnType<typeof getSignInLock> | null = null;
      try {
        lock = getSignInLock(identifier, ip);
      } catch (error) {
        // La base de sécurité indisponible ne doit pas fermer la connexion à tous.
        console.error("[security] lecture des échecs de connexion impossible :", error);
      }
      if (lock?.locked) {
        void logger.warning("auth.login.blocked", "Connexion refusée : trop d'échecs récents", {
          ip,
          userAgent,
          metadata: { identifier, scope: lock.scope, retryAfterSeconds: Math.ceil(lock.retryAfterMs / 1000) },
        });
        throw new APIError("TOO_MANY_REQUESTS", {
          message: `Trop de tentatives de connexion. Réessayez dans ${minutesLabel(lock.retryAfterMs)}.`,
        });
      }
      return;
    }

    if (ctx.path === "/sign-out") {
      try {
        const session = await getSessionFromCtx(rawCtx);
        if (session) {
          const { ip, userAgent } = requestInfo(ctx);
          void logger.logAuthAction("auth.logout", "Déconnexion", {
            userId: session.user.id,
            userEmail: session.user.email ?? "",
            ip,
            userAgent,
          });
        }
      } catch {
        // Session déjà expirée : rien à journaliser.
      }
    }
  });

  const after = createAuthMiddleware(async (rawCtx) => {
    const ctx = rawCtx as unknown as HookContext;

    if (ctx.path && PASSWORD_SIGN_IN_PATHS.has(ctx.path)) {
      const identifier = signInIdentifier(ctx.body);
      if (ctx.context.newSession) {
        if (provider === "builtin") {
          try {
            recordSignInSuccess(identifier);
          } catch (error) {
            console.error("[security] remise à zéro des échecs impossible :", error);
          }
        }
        afterSuccessfulSignIn(ctx, "password");
        return;
      }
      if (!isCredentialFailure(ctx.context.returned)) return;

      const { ip, userAgent } = requestInfo(ctx);
      let lockedScopes: string[] = [];
      let failures = 0;
      if (provider === "builtin") {
        try {
          ({ lockedScopes, failures } = recordSignInFailure(identifier, ip));
        } catch (error) {
          console.error("[security] enregistrement de l'échec impossible :", error);
        }
      }
      void logger.warning("auth.login.failed", "Échec de connexion", {
        ip,
        userAgent,
        metadata: { identifier, failures },
      });
      if (lockedScopes.length > 0) {
        void raiseAlert("failedSignIns", {
          identifier,
          ip,
          userAgent,
          scope: lockedScopes.join(","),
          maxAttempts: getSignInSettings().maxAttempts,
          lockMinutes: getSignInSettings().lockMinutes,
        });
      }
      return;
    }

    if (isOAuthCallback(ctx.path)) {
      if (ctx.context.newSession) {
        afterSuccessfulSignIn(ctx, "oidc");
        return;
      }
      const { ip, userAgent } = requestInfo(ctx);
      const returned = ctx.context.returned;
      // L'échec se lit dans l'adresse de redirection (`?error=…`), jamais un secret.
      let reason: string | undefined;
      if (isAPIError(returned)) {
        const location = new Headers(returned.headers ?? undefined).get("location");
        try {
          reason = location ? (new URL(location, "http://localhost").searchParams.get("error") ?? undefined) : undefined;
        } catch {
          reason = undefined;
        }
        reason ??= String(returned.status);
      }
      void logger.warning("auth.login.failed", "Échec de connexion par Ascencia ID", {
        ip,
        userAgent,
        metadata: { provider: "ascencia", reason },
      });
    }
  });

  return { before, after };
}
