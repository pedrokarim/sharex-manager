import { writeFile, readFile } from "fs/promises";
import { join } from "path";
import { NextRequest } from "next/server";
import { ApiKey } from "@/types/api-key";
import { storeDeletionToken } from "@/lib/deletion-tokens";
import { recordUpload } from "@/lib/history";
import { getConfig } from "@/lib/upload-config";
import { handleFileUpload } from "@/lib/upload";

const UPLOADS_DIR = join(process.cwd(), "public/uploads");
const API_KEYS_FILE = join(process.cwd(), "data/api-keys.json");

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

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
    const isDocument = /\.(pdf|doc|docx|txt)$/i.test(fileType);
    const isArchive = /\.(zip|rar)$/i.test(fileType);

    if (isImage && !key.permissions.uploadImages) return null;
    if (isDocument && !key.permissions.uploadText) return null;
    if (!isImage && !isDocument && !isArchive && !key.permissions.uploadFiles)
      return null;

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
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Clé API manquante" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return new Response(JSON.stringify({ error: "Aucun fichier fourni" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const validKey = await validateApiKey(apiKey, file.name);
    if (!validKey) {
      return new Response(
        JSON.stringify({
          error: "Clé API invalide ou permissions insuffisantes",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Charger la configuration
    const config = await getConfig();

    // Vérifier le type de fichier
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
    const isDocument = /\.(pdf|doc|docx|txt)$/i.test(file.name);
    const isArchive = /\.(zip|rar)$/i.test(file.name);

    if (isImage && !config.allowedTypes.images) {
      return new Response(
        JSON.stringify({ error: "L'upload d'images n'est pas autorisé" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (isDocument && !config.allowedTypes.documents) {
      return new Response(
        JSON.stringify({ error: "L'upload de documents n'est pas autorisé" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (isArchive && !config.allowedTypes.archives) {
      return new Response(
        JSON.stringify({ error: "L'upload d'archives n'est pas autorisé" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!isImage && !isDocument && !isArchive) {
      return new Response(
        JSON.stringify({ error: "Type de fichier non supporté" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Vérifier la taille minimale
    if (file.size < config.limits.minFileSize * 1024) {
      return new Response(
        JSON.stringify({
          error: `La taille du fichier est inférieure à la limite minimale de ${config.limits.minFileSize}KB`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Vérifier la taille maximale
    if (file.size > config.limits.maxFileSize * 1024 * 1024) {
      return new Response(
        JSON.stringify({
          error: `La taille du fichier dépasse la limite de ${config.limits.maxFileSize}MB`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Utiliser handleFileUpload pour gérer l'upload
    const uploadResult = await handleFileUpload(file, config);

    if (!uploadResult.success) {
      return new Response(JSON.stringify({ error: uploadResult.error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Enregistrer dans l'historique
    await recordUpload({
      filename: uploadResult.fileUrl!.split("/").pop()!,
      originalFilename: file.name,
      fileSize: file.size,
      mimeType: file.type,
      uploadMethod: "api",
      fileUrl: `${API_URL}${uploadResult.fileUrl}`,
      thumbnailUrl: uploadResult.thumbnailUrl
        ? `${API_URL}${uploadResult.thumbnailUrl}`
        : undefined,
      deletionToken: uploadResult.deletionToken,
      ipAddress:
        request.ip || request.headers.get("x-forwarded-for") || "unknown",
      userId: validKey.id,
      userName: validKey.name,
    });

    return new Response(
      JSON.stringify({
        url: `${API_URL}${uploadResult.fileUrl}`,
        thumbnail_url: uploadResult.thumbnailUrl
          ? `${API_URL}${uploadResult.thumbnailUrl}`
          : null,
        deletion_url: uploadResult.deletionToken
          ? `${API_URL}/api/files/${uploadResult
              .fileUrl!.split("/")
              .pop()}?token=${uploadResult.deletionToken}`
          : null,
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
    return new Response(
      JSON.stringify({ error: "Erreur lors du traitement" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
