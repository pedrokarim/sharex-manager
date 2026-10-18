import type { NextRequest } from "next/server";
import { isAdmin, withAuth } from "@/lib/api-guard";
import { logDb } from "@/lib/utils/db";
import { presentUploadConfig, readUploadConfig, saveUploadConfig } from "@/lib/server/upload-config-store";

export const GET = withAuth(async (_request: Request, _context: unknown, session) => {
  try {
    const config = await readUploadConfig();

    logDb.createLog({
      level: "info",
      action: "admin.action",
      message: "Lecture de la configuration des uploads réussie",
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
    });

    return Response.json(presentUploadConfig(config, { admin: isAdmin(session) }));
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de la lecture de la configuration des uploads",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return new Response("Erreur serveur", { status: 500 });
  }
});

export const POST = withAuth(async (request: NextRequest, _context: unknown, session) => {
  // Mêmes droits et même validation que PUT /api/settings/config, utilisé
  // par l'interface : les deux passent par `saveUploadConfig`.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Configuration invalide" }, { status: 400 });
  }

  try {
    const result = await saveUploadConfig(body);
    if (!result.ok) {
      logDb.createLog({
        level: "warning",
        action: "admin.action",
        message: "Tentative de sauvegarde d'une configuration invalide",
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: { fieldErrors: result.fieldErrors, formErrors: result.formErrors },
      });
      return Response.json({ error: result.error }, { status: 400 });
    }

    logDb.createLog({
      level: "info",
      action: "config.update",
      message: "Mise à jour de la configuration des uploads réussie",
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        changes: {
          before: result.before,
          after: result.config,
        },
      },
    });

    return Response.json(presentUploadConfig(result.config, { admin: true }));
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de la sauvegarde de la configuration des uploads",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return new Response("Erreur serveur", { status: 500 });
  }
}, { role: "admin" });
