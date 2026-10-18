import { isAdmin, withAuth } from "@/lib/api-guard";
import { NextRequest } from "next/server";
import { logDb } from "@/lib/utils/db";
import { deleteApiKey } from "@/lib/api-key-store";

// DELETE /api/api-keys/[id]
export const DELETE = withAuth(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  session
) => {
  try {
    const { id } = await params;
    // Seul un admin supprime la clé d'un autre compte.
    const keyToDelete = await deleteApiKey(id, (key) => isAdmin(session) || key.createdBy === session.user.id);
    if (!keyToDelete) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: "Tentative de suppression d'une clé API inexistante",
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: { keyId: id },
      });
      return new Response("Clé non trouvée", { status: 404 });
    }

    logDb.createLog({
      level: "info",
      action: "api.request",
      message: `Suppression de la clé API: ${keyToDelete.name}`,
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        keyId: keyToDelete.id,
        keyName: keyToDelete.name,
        permissions: keyToDelete.permissions,
      },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de la suppression d'une clé API",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return new Response("Erreur serveur", { status: 500 });
  }
});
