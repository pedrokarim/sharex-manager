import { auth } from "@/auth";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { ApiKey } from "@/types/api-key";

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
  try {
    const session = await auth();
    if (!session) {
      return new Response("Non autorisé", { status: 401 });
    }

    const keys = await getApiKeys();
    return NextResponse.json(keys);
  } catch (error) {
    return new Response("Erreur serveur", { status: 500 });
  }
}

// POST /api/api-keys
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
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
      createdBy: session.user.id,
      permissions: data.permissions,
    };

    keys.push(newKey);
    await saveApiKeys(keys);

    return NextResponse.json(newKey);
  } catch (error) {
    return new Response("Erreur serveur", { status: 500 });
  }
}
