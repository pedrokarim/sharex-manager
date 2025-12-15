import { writeFile, readFile } from "fs/promises";
import path from "path";
import type { NextRequest } from "next/server";
import type { ApiKey } from "@/types/api-key";
import { storeDeletionToken } from "@/lib/deletion-tokens";
import { recordUpload } from "@/lib/history";
import { getServerConfig } from "@/lib/server/config";
import { handleFileUpload } from "@/lib/upload";
import { revalidatePath } from "next/cache";
import { getAbsoluteUploadPath } from "@/lib/config";
import fs from "fs/promises";
import { logDb } from "@/lib/utils/db";
import { gallerySSEManager } from "@/lib/sse";
import { stat } from "fs/promises";
import { join } from "path";
import { getSecureFiles } from "@/lib/secure-files";
import { getStarredFiles } from "@/lib/starred-files";

const API_KEYS_FILE = path.join(process.cwd(), "data/api-keys.json");

async function validateApiKey(
  apiKey: string,
  fileType: string
): Promise<ApiKey | null> {
  try {
    const content = await readFile(API_KEYS_FILE, "utf-8");
    const keys: ApiKey[] = JSON.parse(content);

    const key = keys.find((k) => k.key === apiKey);
    if (!key) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: "Tentative d'utilisation d'une clé API inexistante",
        metadata: {
          apiKey: apiKey.substring(0, 8) + "...", // On ne log que le début de la clé pour la sécurité
        },
      });
      return null;
    }

    // Vérifier si la clé a expiré
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: "Tentative d'utilisation d'une clé API expirée",
        userId: key.id,
        metadata: {
          keyName: key.name,
          expiresAt: key.expiresAt,
        },
      });
      return null;
    }

    // Vérifier les permissions selon le type de fichier
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileType);
    const isDocument = /\.(pdf|doc|docx|txt)$/i.test(fileType);
    const isArchive = /\.(zip|rar)$/i.test(fileType);

    if (isImage && !key.permissions.uploadImages) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: "Tentative d'upload d'image sans permission",
        userId: key.id,
        metadata: {
          keyName: key.name,
          fileType,
        },
      });
      return null;
    }
    if (isDocument && !key.permissions.uploadText) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: "Tentative d'upload de document sans permission",
        userId: key.id,
        metadata: {
          keyName: key.name,
          fileType,
        },
      });
      return null;
    }
    if (!isImage && !isDocument && !isArchive && !key.permissions.uploadFiles) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: "Tentative d'upload de fichier sans permission",
        userId: key.id,
        metadata: {
          keyName: key.name,
          fileType,
        },
      });
      return null;
    }

    // Mettre à jour la date de dernière utilisation
    key.lastUsed = new Date().toISOString();
    await writeFile(API_KEYS_FILE, JSON.stringify(keys, null, 2));

    logDb.createLog({
      level: "info",
      action: "api.request",
      message: "Validation de clé API réussie",
      userId: key.id,
      metadata: {
        keyName: key.name,
        fileType,
      },
    });

    return key;
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de la validation de la clé API",
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
        apiKey: apiKey.substring(0, 8) + "...",
      },
    });
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: "Tentative d'upload sans clé API",
        metadata: {
          ip: request.ip || request.headers.get("x-forwarded-for") || "unknown",
        },
      });
      return new Response(JSON.stringify({ error: "Clé API manquante" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: "Tentative d'upload sans fichier",
        metadata: {
          ip: request.ip || request.headers.get("x-forwarded-for") || "unknown",
          apiKey: apiKey.substring(0, 8) + "...",
        },
      });
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
    const config = await getServerConfig();

    // Vérifier le type de fichier
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
    const isDocument = /\.(pdf|doc|docx|txt)$/i.test(file.name);
    const isArchive = /\.(zip|rar)$/i.test(file.name);

    if (isImage && !config.allowedTypes.images) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: "Tentative d'upload d'image non autorisée",
        userId: validKey.id,
        metadata: {
          keyName: validKey.name,
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
        },
      });
      return new Response(
        JSON.stringify({ error: "L'upload d'images n'est pas autorisé" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (isDocument && !config.allowedTypes.documents) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: "Tentative d'upload de document non autorisé",
        userId: validKey.id,
        metadata: {
          keyName: validKey.name,
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
        },
      });
      return new Response(
        JSON.stringify({ error: "L'upload de documents n'est pas autorisé" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (isArchive && !config.allowedTypes.archives) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: "Tentative d'upload d'archive non autorisée",
        userId: validKey.id,
        metadata: {
          keyName: validKey.name,
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
        },
      });
      return new Response(
        JSON.stringify({ error: "L'upload d'archives n'est pas autorisé" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!isImage && !isDocument && !isArchive) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: "Tentative d'upload d'un type de fichier non supporté",
        userId: validKey.id,
        metadata: {
          keyName: validKey.name,
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
        },
      });
      return new Response(
        JSON.stringify({ error: "Type de fichier non supporté" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Vérifier la taille minimale
    if (file.size < config.limits.minFileSize * 1024) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: `Tentative d'upload d'un fichier trop petit (< ${config.limits.minFileSize}KB)`,
        userId: validKey.id,
        metadata: {
          keyName: validKey.name,
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
          minSize: config.limits.minFileSize * 1024,
        },
      });
      return new Response(
        JSON.stringify({
          error: `La taille du fichier est inférieure à la limite minimale de ${config.limits.minFileSize}KB`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Vérifier la taille maximale
    if (file.size > config.limits.maxFileSize * 1024 * 1024) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: `Tentative d'upload d'un fichier trop grand (> ${config.limits.maxFileSize}MB)`,
        userId: validKey.id,
        metadata: {
          keyName: validKey.name,
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
          maxSize: config.limits.maxFileSize * 1024 * 1024,
        },
      });
      return new Response(
        JSON.stringify({
          error: `La taille du fichier dépasse la limite de ${config.limits.maxFileSize}MB`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const uploadPath = getAbsoluteUploadPath();

    // Assurez-vous que le dossier existe
    await fs.mkdir(uploadPath, { recursive: true });

    // Utiliser handleFileUpload pour gérer l'upload
    const uploadResult = await handleFileUpload(file, config);

    if (!uploadResult.success) {
      logDb.createLog({
        level: "error",
        action: "api.request",
        message: "Erreur lors de l'upload du fichier",
        userId: validKey.id,
        metadata: {
          keyName: validKey.name,
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
          error: uploadResult.error,
        },
      });
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
      fileUrl: uploadResult.fileUrl!,
      thumbnailUrl: uploadResult.thumbnailUrl,
      deletionToken: uploadResult.deletionToken,
      ipAddress:
        request.ip || request.headers.get("x-forwarded-for") || "unknown",
      userId: validKey.id,
      userName: validKey.name,
    });

    logDb.createLog({
      level: "info",
      action: "api.request",
      message: "Upload via API réussi",
      userId: validKey.id,
      metadata: {
        keyName: validKey.name,
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type,
        fileUrl: uploadResult.fileUrl,
        thumbnailUrl: uploadResult.thumbnailUrl,
        uploadMethod: "api",
      },
    });

    // Après l'upload réussi
    revalidatePath("/uploads");

    // Préparer les données du fichier pour SSE
    try {
      // Extraire le nom du fichier depuis l'URL de manière plus robuste
      let filename = file.name; // fallback par défaut

      if (uploadResult.fileUrl) {
        // Essayer d'extraire le nom du fichier depuis l'URL
        const urlParts = uploadResult.fileUrl.split("/");
        const lastPart = urlParts[urlParts.length - 1];
        if (lastPart && lastPart.includes(".")) {
          filename = lastPart;
        }
      }

      console.log(
        "[SSE] Extracted filename:",
        filename,
        "from URL:",
        uploadResult.fileUrl
      );

      const UPLOADS_DIR = getAbsoluteUploadPath();
      const filePath = join(UPLOADS_DIR, filename);
      const stats = await stat(filePath);
      const secureFiles = await getSecureFiles();
      const starredFiles = await getStarredFiles();
      const isSecure = secureFiles.includes(filename);
      const isStarred = starredFiles.includes(filename);

      const fileData = {
        name: filename,
        url: uploadResult.fileUrl,
        size: stats.size,
        createdAt: stats.mtime.toISOString(),
        isSecure,
        isStarred,
      };

      // Émettre l'événement SSE pour tous les clients connectés
      const sseData = {
        type: "new_file",
        file: fileData,
        timestamp: new Date().toISOString(),
      };
      console.log(
        `[SSE] Broadcasting new file to ${gallerySSEManager.getClientCount()} client(s)`
      );
      gallerySSEManager.broadcast("gallery", sseData);

      // Émettre l'événement de mise à jour des stats
      const statsUpdateData = {
        type: "stats_update",
        action: "file_uploaded",
        file: {
          name: filename,
          size: stats.size,
          uploadMethod: validKey ? "api" : "unknown",
        },
        timestamp: new Date().toISOString(),
      };
      gallerySSEManager.broadcast("stats", statsUpdateData);
    } catch (sseError) {
      console.error(
        "[SSE] Erreur lors de la préparation des données SSE:",
        sseError
      );
      // Ne pas échouer l'upload pour autant
    }

    return new Response(
      JSON.stringify({
        url: uploadResult.fileUrl,
        thumbnail_url: uploadResult.thumbnailUrl || null,
        deletion_url: uploadResult.deletionToken
          ? `${uploadResult.fileUrl}?token=${uploadResult.deletionToken}`
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
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur système lors de l'upload via API",
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
        ip: request.ip || request.headers.get("x-forwarded-for") || "unknown",
      },
    });
    return new Response(
      JSON.stringify({
        error: "Une erreur est survenue lors de l'upload",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
