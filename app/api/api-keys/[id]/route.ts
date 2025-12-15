import { auth } from "@/auth";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { NextRequest } from "next/server";
import { ApiKey } from "@/types/api-key";
import { logDb } from "@/lib/utils/db";

const API_KEYS_FILE = join(process.cwd(), "data/api-keys.json");

// DELETE /api/api-keys/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  try {
    if (!session?.user) {
      logDb.createLog({
        level: "warning",
        action: "admin.action",
        message: "Tentative de suppression de clé API non autorisée",
        userId: session?.user?.id || undefined,
        userEmail: session?.user?.email || undefined,
      });
      return new Response("Non autorisé", { status: 401 });
    }

    const { id } = await params;
    const content = await readFile(API_KEYS_FILE, "utf-8");
    const keys: ApiKey[] = JSON.parse(content);

    const keyToDelete = keys.find((key) => key.id === id);
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

    const newKeys = keys.filter((key) => key.id !== id);
    await writeFile(API_KEYS_FILE, JSON.stringify(newKeys, null, 2));

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
}
