import type { NextRequest } from "next/server";
import { requireAccess } from "@/lib/api-guard";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import {
  listSessionViews,
  revokeSessionById,
  revokeSessionsOfUser,
  sessionUsers,
  type SessionAdapter,
} from "@/lib/security/sessions";

/**
 * Sessions actives de tous les comptes, réservées aux administrateurs.
 *
 * GET    ?userId=…  → `{ sessions: [{ id, userId, user, device, ip, createdAt, lastActiveAt, expiresAt, current }] }`
 * DELETE ?id=…      → révoque une session
 * DELETE ?userId=…  → révoque toutes les sessions du compte (sauf la session
 *                     en cours, s'il s'agit du sien)
 *
 * Les jetons ne sortent jamais : la révocation passe par l'identifiant.
 */

async function adapter(): Promise<SessionAdapter> {
  return (await auth.$context).adapter as unknown as SessionAdapter;
}

export async function GET(request: NextRequest) {
  const guard = await requireAccess("admin");
  if (!guard.ok) return guard.response;

  const userId = request.nextUrl.searchParams.get("userId") || undefined;
  const db = await adapter();
  const sessions = await listSessionViews(db, { userId, currentSessionId: guard.session.session.id });
  const users = await sessionUsers(
    db,
    sessions.map((session) => session.userId)
  );
  return Response.json({
    sessions: sessions.map((session) => ({ ...session, user: users[session.userId] ?? null })),
  });
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAccess("admin");
  if (!guard.ok) return guard.response;

  const id = request.nextUrl.searchParams.get("id");
  const userId = request.nextUrl.searchParams.get("userId");
  if (!id && !userId) {
    return Response.json({ error: "Précisez « id » ou « userId »." }, { status: 400 });
  }

  const db = await adapter();
  let revoked = 0;
  let targetUserId = userId;
  if (id) {
    const row = await revokeSessionById(db, id);
    if (!row) return Response.json({ error: "Session introuvable." }, { status: 404 });
    revoked = 1;
    targetUserId = row.userId;
  } else if (userId) {
    revoked = await revokeSessionsOfUser(db, userId, {
      exceptSessionId: userId === guard.session.user.id ? guard.session.session.id : null,
    });
  }

  void logger.info("security.session.revoke", "Sessions révoquées par un administrateur", {
    userId: guard.session.user.id,
    userEmail: guard.session.user.email,
    metadata: { targetUserId, sessionId: id ?? undefined, revoked },
  });
  return Response.json({ revoked });
}
