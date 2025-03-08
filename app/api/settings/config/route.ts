import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import type { NextRequest } from "next/server";
import type { UploadConfig } from "@/lib/types/upload-config";
import { logDb } from "@/lib/utils/db";
import { auth } from "@/auth";
import { defaultConfig } from "@/lib/defaultConfig";

const CONFIG_PATH = resolve(process.cwd(), "config", "uploads.json");

async function readConfig(): Promise<UploadConfig> {
  try {
    const configFile = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(configFile);
  } catch (error) {
    logDb.createLog({
      level: "warning",
      action: "system.error",
      message:
        "Configuration non trouvée, utilisation de la configuration par défaut",
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
        configPath: CONFIG_PATH,
      },
    });
    return defaultConfig;
  }
}

async function writeConfig(config: UploadConfig): Promise<void> {
  try {
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de l'écriture de la configuration",
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
        configPath: CONFIG_PATH,
      },
    });
    throw error;
  }
}

export async function GET() {
  const session = await auth();
  try {
    if (!session?.user) {
      // Si l'utilisateur n'est pas authentifié, retourner la configuration par défaut
      return Response.json(defaultConfig);
    }

    const config = await readConfig();

    logDb.createLog({
      level: "info",
      action: "admin.action",
      message: "Lecture de la configuration réussie",
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
    });

    return Response.json(config);
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
    return Response.json(defaultConfig);
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  try {
    if (!session?.user || session.user.role !== "admin") {
      logDb.createLog({
        level: "warning",
        action: "admin.action",
        message: "Tentative de modification de configuration non autorisée",
        userId: session?.user?.id || undefined,
        userEmail: session?.user?.email || undefined,
      });
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }

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

    const body = await req.json();
    const oldConfig = await readConfig();
    await writeConfig(body);

    logDb.createLog({
      level: "info",
      action: "config.update",
      message: "Mise à jour de la configuration réussie",
      userId: session.user.id,
      userEmail: session.user.email,
      metadata: {
        changes: {
          before: oldConfig,
          after: body,
        },
      },
    });

    return Response.json(body);
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
}

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
