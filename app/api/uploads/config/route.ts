import type { NextRequest } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { auth } from "@/auth";
import { defaultConfig } from "@/lib/defaultConfig";
import type { UploadConfig } from "@/lib/types/upload-config";
import { logDb } from "@/lib/utils/db";

const CONFIG_FILE_PATH = join(process.cwd(), "config", "uploads.json");

async function getConfig(): Promise<UploadConfig> {
  try {
    const configData = await readFile(CONFIG_FILE_PATH, "utf-8");
    return JSON.parse(configData);
  } catch (error) {
    logDb.createLog({
      level: "warning",
      action: "system.error",
      message:
        "Configuration non trouvée, utilisation de la configuration par défaut",
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
        configPath: CONFIG_FILE_PATH,
      },
    });
    // Si le fichier n'existe pas ou est invalide, retourner la configuration par défaut
    return defaultConfig;
  }
}

async function saveConfig(config: UploadConfig): Promise<void> {
  try {
    await writeFile(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de la sauvegarde de la configuration",
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
        configPath: CONFIG_FILE_PATH,
      },
    });
    throw error;
  }
}

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    logDb.createLog({
      level: "warning",
      action: "admin.action",
      message:
        "Tentative de lecture de la configuration des uploads non autorisée",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
    });
    return new Response("Non autorisé", { status: 401 });
  }

  try {
    const config = await getConfig();

    logDb.createLog({
      level: "info",
      action: "admin.action",
      message: "Lecture de la configuration des uploads réussie",
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
    });

    return Response.json(config);
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
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    logDb.createLog({
      level: "warning",
      action: "admin.action",
      message:
        "Tentative de modification de la configuration des uploads non autorisée",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
    });
    return new Response("Non autorisé", { status: 401 });
  }

  try {
    const newConfig: UploadConfig = await request.json();
    const oldConfig = await getConfig();

    // Validation basique
    if (
      typeof newConfig !== "object" ||
      !newConfig.allowedTypes ||
      typeof newConfig.limits.maxFileSize !== "number" ||
      typeof newConfig.filenamePattern !== "string" ||
      !newConfig.thumbnails ||
      !newConfig.storage
    ) {
      logDb.createLog({
        level: "warning",
        action: "admin.action",
        message: "Tentative de sauvegarde d'une configuration invalide",
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: {
          invalidConfig: newConfig,
        },
      });
      return new Response("Configuration invalide", { status: 400 });
    }

    await saveConfig(newConfig);

    logDb.createLog({
      level: "info",
      action: "config.update",
      message: "Mise à jour de la configuration des uploads réussie",
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        changes: {
          before: oldConfig,
          after: newConfig,
        },
      },
    });

    return new Response("Configuration sauvegardée", { status: 200 });
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
}
