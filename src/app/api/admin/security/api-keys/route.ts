import type { NextRequest } from "next/server";
import { requireAccess } from "@/lib/api-guard";
import { auth } from "@/lib/auth";
import { getAllHistory } from "@/lib/history";
import { logger } from "@/lib/utils/logger";
import { deleteApiKey, loadApiKeys } from "@/lib/api-key-store";
import { sessionUsers, type SessionAdapter } from "@/lib/security/sessions";
import { buildAdminApiKeyList } from "@/lib/security/api-keys-admin";

/**
 * Clés API de toute l'instance, réservées aux administrateurs.
 *
 * GET           → `{ keys: [{ id, name, prefix, owner: { id, username } | null,
 *                  createdAt, lastUsedAt, expiresAt, permissions,
 *                  uploadsLastHour, status: "active" | "expired" | "orphan" }] }`
 * DELETE ?id=…  → révoque la clé
 *
 * Ni clé ni empreinte ne sortent : seulement le préfixe d'affichage.
 */

export async function GET() {
  const guard = await requireAccess("admin");
  if (!guard.ok) return guard.response;

  const keys = await loadApiKeys();
  const owners = [...new Set(keys.map((key) => key.createdBy).filter((id) => id && id !== "system"))];
  let users: Record<string, { id: string; username: string }> = {};
  try {
    const adapter = (await auth.$context).adapter as unknown as SessionAdapter;
    users = await sessionUsers(adapter, owners);
  } catch (error) {
    console.error("[admin/security/api-keys] comptes illisibles :", error instanceof Error ? error.message : error);
  }
  let history: Awaited<ReturnType<typeof getAllHistory>> = [];
  try {
    history = await getAllHistory();
  } catch {
    // Historique illisible : les envois de la dernière heure restent à zéro.
  }

  return Response.json(
    { keys: buildAdminApiKeyList(keys, users, history) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAccess("admin");
  if (!guard.ok) return guard.response;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Précisez « id »." }, { status: 400 });

  const removed = await deleteApiKey(id);
  if (!removed) return Response.json({ error: "Clé introuvable." }, { status: 404 });

  try {
    void logger.warning("api.request", `Révocation de la clé API : ${removed.name}`, {
      userId: guard.session.user.id,
      metadata: { keyId: removed.id, keyName: removed.name, ownerId: removed.createdBy },
    });
  } catch {
    // Journal indisponible : la clé est déjà révoquée.
  }
  return Response.json({ revoked: 1 });
}
