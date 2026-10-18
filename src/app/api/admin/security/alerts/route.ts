import type { NextRequest } from "next/server";
import { requireAccess } from "@/lib/api-guard";
import { acknowledgeAlert, acknowledgeAllAlerts, listAlerts } from "@/lib/security/alerts-store";

/**
 * Alertes de sécurité, réservées aux administrateurs.
 *
 * GET  ?all=1&limit=50&offset=0 → `{ alerts: [{ id, kind, createdAt, details, acknowledgedAt, acknowledgedBy }], unacknowledged }`
 *                                 (sans `all`, seulement les alertes non vues)
 * POST { id }                   → marque une alerte comme vue
 * POST { all: true }            → marque toutes les alertes comme vues
 */

export async function GET(request: NextRequest) {
  const guard = await requireAccess("admin");
  if (!guard.ok) return guard.response;

  const params = request.nextUrl.searchParams;
  const number = (name: string) => {
    const value = Number(params.get(name));
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
  };
  return Response.json(
    listAlerts({ includeAcknowledged: params.get("all") === "1", limit: number("limit"), offset: number("offset") })
  );
}

export async function POST(request: NextRequest) {
  const guard = await requireAccess("admin");
  if (!guard.ok) return guard.response;

  let body: { id?: unknown; all?: unknown };
  try {
    body = (await request.json()) as { id?: unknown; all?: unknown };
  } catch {
    return Response.json({ error: "Requête invalide : un objet JSON est attendu." }, { status: 400 });
  }

  if (body?.all === true) {
    return Response.json({ acknowledged: acknowledgeAllAlerts(guard.session.user.id) });
  }
  if (typeof body?.id === "number" && Number.isInteger(body.id)) {
    const done = acknowledgeAlert(body.id, guard.session.user.id);
    if (!done) return Response.json({ error: "Alerte introuvable ou déjà vue." }, { status: 404 });
    return Response.json({ acknowledged: 1 });
  }
  return Response.json({ error: "Précisez « id » ou « all »." }, { status: 400 });
}
