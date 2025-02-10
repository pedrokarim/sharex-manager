import { auth } from "@/auth";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { ApiKey } from "@/types/api-key";
import { logDb } from "@/lib/utils/db";

const API_KEYS_FILE = join(process.cwd(), "data/api-keys.json");

// Lire les clés API
async function getApiKeys(): Promise<ApiKey[]> {
  try {
    const content = await readFile(API_KEYS_FILE, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    return [];
  }
}

// Sauvegarder les clés API
async function saveApiKeys(keys: ApiKey[]): Promise<void> {
  await writeFile(API_KEYS_FILE, JSON.stringify(keys, null, 2));
}

// GET /api/api-keys
export async function GET() {
  const session = await auth();
  try {
    if (!session?.user) {
      logDb.createLog({
        level: "warning",
        action: "admin.action",
        message: "Tentative d'accès non autorisé aux clés API",
        userId: session?.user?.id || undefined,
        userEmail: session?.user?.email || undefined,
      });
      return new Response("Non autorisé", { status: 401 });
    }

    const keys = await getApiKeys();
    return NextResponse.json(keys);
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de la récupération des clés API",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return new Response("Erreur serveur", { status: 500 });
  }
}

// POST /api/api-keys
export async function POST(request: NextRequest) {
  const session = await auth();
  try {
    if (!session?.user) {
      logDb.createLog({
        level: "warning",
        action: "admin.action",
        message: "Tentative de création de clé API non autorisée",
        userId: session?.user?.id || undefined,
        userEmail: session?.user?.email || undefined,
      });
      return new Response("Non autorisé", { status: 401 });
    }

    const data = await request.json();
    const keys = await getApiKeys();

    const newKey: ApiKey = {
      id: `key_${nanoid()}`,
      name: data.name,
      key: data.key || `sk_${nanoid(32)}`,
      createdAt: new Date().toISOString(),
      expiresAt: data.expiresAt || null,
      createdBy: session.user.id || "system",
      permissions: data.permissions,
    };

    keys.push(newKey);
    await saveApiKeys(keys);

    logDb.createLog({
      level: "info",
      action: "api.request",
      message: `Création d'une nouvelle clé API: ${newKey.name}`,
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        keyId: newKey.id,
        keyName: newKey.name,
        permissions: newKey.permissions,
        expiresAt: newKey.expiresAt,
      },
    });

    return NextResponse.json(newKey);
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de la création d'une clé API",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return new Response("Erreur serveur", { status: 500 });
  }
}
