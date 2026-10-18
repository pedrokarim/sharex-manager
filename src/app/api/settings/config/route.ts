import { isAdmin, withAuth } from "@/lib/api-guard";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { NextRequest } from "next/server";
import { logDb } from "@/lib/utils/db";
import { defaultConfig } from "@/lib/defaultConfig";
import { presentUploadConfig, readUploadConfig, saveUploadConfig } from "@/lib/server/upload-config-store";

// Lecture ouverte : sans session, la configuration par défaut (aucun réglage de l'instance).
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  try {
    if (!session?.user) {
      // Si l'utilisateur n'est pas authentifié, retourner la configuration par défaut
      return Response.json(presentUploadConfig(defaultConfig, { admin: false }));
    }

    const config = await readUploadConfig();

    logDb.createLog({
      level: "info",
      action: "admin.action",
      message: "Lecture de la configuration réussie",
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
    });

    return Response.json(presentUploadConfig(config, { admin: isAdmin(session) }));
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur système lors de la lecture de la configuration",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    // En cas d'erreur, retourner la configuration par défaut
    return Response.json(presentUploadConfig(defaultConfig, { admin: false }));
  }
}

export const PUT = withAuth(async (req: NextRequest, _context: unknown, session) => {
  try {
    if (!session.user.id || !session.user.email) {
      logDb.createLog({
        level: "warning",
        action: "admin.action",
        message: "Session invalide lors de la modification de configuration",
        userId: session?.user?.id || undefined,
        userEmail: session?.user?.email || undefined,
      });
      return Response.json({ error: "Session invalide" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Configuration invalide" }, { status: 400 });
    }

    // Même chemin d'écriture que POST /api/uploads/config.
    const result = await saveUploadConfig(body);
    if (!result.ok) {
      logDb.createLog({
        level: "warning",
        action: "config.update",
        message: "Tentative de sauvegarde d'une configuration invalide",
        userId: session.user.id,
        userEmail: session.user.email,
        metadata: {
          fieldErrors: result.fieldErrors,
          formErrors: result.formErrors,
        },
      });

      return Response.json({ error: result.error }, { status: 400 });
    }

    logDb.createLog({
      level: "info",
      action: "config.update",
      message: "Mise à jour de la configuration réussie",
      userId: session.user.id,
      userEmail: session.user.email,
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
      message: "Erreur système lors de la mise à jour de la configuration",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return Response.json(
      { error: "Erreur lors de la mise à jour de la configuration" },
      { status: 500 }
    );
  }
}, { role: "admin" });

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
