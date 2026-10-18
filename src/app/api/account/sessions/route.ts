import type { NextRequest } from "next/server";
import { requireAccess } from "@/lib/api-guard";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import {
  listSessionViews,
  revokeSessionById,
  revokeSessionsOfUser,
  type SessionAdapter,
} from "@/lib/security/sessions";

/**
 * Sessions du compte connecté (« Mon compte »).
 *
 * GET                    → `{ sessions: [{ id, device, ip, createdAt, lastActiveAt, expiresAt, current }] }`
 * DELETE ?id=…           → ferme une de ses sessions (la session en cours comprise)
 * DELETE ?scope=others   → ferme toutes ses autres sessions
 *
 * Les jetons ne sortent jamais : la révocation passe par l'identifiant.
 */

async function adapter(): Promise<SessionAdapter> {
  return (await auth.$context).adapter as unknown as SessionAdapter;
}

export async function GET() {
  const guard = await requireAccess("user");
  if (!guard.ok) return guard.response;

  const sessions = await listSessionViews(await adapter(), {
    userId: guard.session.user.id,
    currentSessionId: guard.session.session.id,
  });
  return Response.json({ sessions });
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAccess("user");
  if (!guard.ok) return guard.response;

  const id = request.nextUrl.searchParams.get("id");
  const scope = request.nextUrl.searchParams.get("scope");
  const db = await adapter();
  let revoked = 0;

  if (id) {
    // Seulement une session de ce compte : une autre donne 404, comme une session inexistante.
    const row = await revokeSessionById(db, id, { userId: guard.session.user.id });
    if (!row) return Response.json({ error: "Session introuvable." }, { status: 404 });
    revoked = 1;
  } else if (scope === "others") {
    revoked = await revokeSessionsOfUser(db, guard.session.user.id, { exceptSessionId: guard.session.session.id });
  } else {
    return Response.json({ error: "Précisez « id » ou « scope=others »." }, { status: 400 });
  }

  void logger.info("security.session.revoke", "Sessions fermées par leur titulaire", {
    userId: guard.session.user.id,
    userEmail: guard.session.user.email,
    metadata: { sessionId: id ?? undefined, scope: scope ?? undefined, revoked },
  });
  return Response.json({ revoked });
}
