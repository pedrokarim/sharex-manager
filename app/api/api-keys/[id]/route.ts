import { auth } from "@/auth";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { NextRequest } from "next/server";
import { ApiKey } from "@/types/api-key";

const API_KEYS_FILE = join(process.cwd(), "data/api-keys.json");

// DELETE /api/api-keys/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return new Response("Non autorisé", { status: 401 });
    }

    const content = await readFile(API_KEYS_FILE, "utf-8");
    const keys: ApiKey[] = JSON.parse(content);

    const newKeys = keys.filter((key) => key.id !== params.id);

    await writeFile(API_KEYS_FILE, JSON.stringify(newKeys, null, 2));

    return new Response(null, { status: 204 });
  } catch (error) {
    return new Response("Erreur serveur", { status: 500 });
  }
}
