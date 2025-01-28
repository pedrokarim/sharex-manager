import { writeFile, readFile } from "fs/promises";
import { join } from "path";
import { NextRequest } from "next/server";
import { ApiKey } from "@/types/api-key";

const UPLOADS_DIR = join(process.cwd(), "public/uploads");
const API_KEYS_FILE = join(process.cwd(), "data/api-keys.json");

async function validateApiKey(
  apiKey: string,
  fileType: string
): Promise<ApiKey | null> {
  try {
    const content = await readFile(API_KEYS_FILE, "utf-8");
    const keys: ApiKey[] = JSON.parse(content);

    const key = keys.find((k) => k.key === apiKey);
    if (!key) return null;

    // Vérifier si la clé a expiré
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return null;
    }

    // Vérifier les permissions selon le type de fichier
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileType);
    const isText = /\.(txt|md|json|csv)$/i.test(fileType);

    if (isImage && !key.permissions.uploadImages) return null;
    if (isText && !key.permissions.uploadText) return null;
    if (!isImage && !isText && !key.permissions.uploadFiles) return null;

    // Mettre à jour la date de dernière utilisation
    key.lastUsed = new Date().toISOString();
    await writeFile(API_KEYS_FILE, JSON.stringify(keys, null, 2));

    return key;
  } catch (error) {
    console.error("Erreur lors de la validation de la clé API:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Récupérer la clé API de l'en-tête
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey) {
      return new Response("Clé API manquante", { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return new Response("Aucun fichier fourni", { status: 400 });
    }

    // Valider la clé API et les permissions
    const validKey = await validateApiKey(apiKey, file.name);
    if (!validKey) {
      return new Response("Clé API invalide ou permissions insuffisantes", {
        status: 403,
      });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Générer un nom de fichier unique
    const fileName = `${Date.now()}-${file.name}`;
    const filePath = join(UPLOADS_DIR, fileName);

    await writeFile(filePath, buffer);

    return new Response(
      JSON.stringify({
        url: `/uploads/${fileName}`,
        key: {
          name: validKey.name,
          lastUsed: validKey.lastUsed,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Erreur lors de l'upload:", error);
    return new Response("Erreur lors du traitement", { status: 500 });
  }
}
