import type { NextRequest } from "next/server";
import { buildDeletionUrl, storeDeletionToken } from "@/lib/deletion-tokens";
import { recordUpload } from "@/lib/history";
import { getServerConfig } from "@/lib/server/config";
import { handleFileUpload } from "@/lib/upload";
import { revalidatePath } from "next/cache";
import { getTrustedClientIp } from "@/lib/request-ip";
import { getAbsoluteUploadPath } from "@/lib/config";
import fs from "fs/promises";
import { logDb } from "@/lib/utils/db";
import { gallerySSEManager } from "@/lib/sse";
import { stat } from "fs/promises";
import { join } from "path";
import { getSecureFiles } from "@/lib/secure-files";
import { getStarredFiles } from "@/lib/starred-files";
import { isVideoFile, maxVideoMb } from "@/lib/media-kind";
import { extractApiKeyFromRequest, findActiveApiKey, validateApiKeyForUpload } from "@/lib/api-key-validator";
import { limitApiKeyUploads } from "@/lib/security/rate-limits";

export async function POST(request: NextRequest) {
  try {
    // Envoi ShareX : la clé vient de l'en-tête `x-api-key`, jamais d'un cookie.
    const apiKey = extractApiKeyFromRequest(request);
    if (!apiKey) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: "Tentative d'upload sans clé API",
        metadata: {
          ip: getTrustedClientIp(request.headers),
        },
      });
      return new Response(JSON.stringify({ error: "Clé API manquante" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Avant de lire le corps : une clé inconnue ou expirée, ou un envoi sans
    // taille annoncée, ne doit pas pouvoir faire charger en mémoire des
    // dizaines de mégaoctets.
    const activeKey = await findActiveApiKey(apiKey);
    if (!activeKey) {
      return new Response(
        JSON.stringify({ error: "Clé API invalide ou permissions insuffisantes" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    // Envois par clé et par heure (écran Sécurité), comptés avant de lire le corps.
    const limited = limitApiKeyUploads(activeKey.id);
    if (limited) return limited;
    const declared = Number(request.headers.get("content-length"));
    const serverConfig = await getServerConfig();
    const limits = serverConfig.limits;
    // Le nom du fichier n'est connu qu'après lecture du corps : la limite
    // vidéo ne compte ici que si les vidéos sont acceptées.
    const maxMb = serverConfig.allowedTypes.videos
      ? Math.max(limits.maxFileSize, maxVideoMb(limits))
      : limits.maxFileSize;
    // Marge pour l'enveloppe multipart autour du fichier.
    const maxBody = maxMb * 1024 * 1024 + 1024 * 1024;
    if (!Number.isFinite(declared) || declared <= 0) {
      return new Response(JSON.stringify({ error: "Taille de l'envoi non annoncée" }), {
        status: 411,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (declared > maxBody) {
      return new Response(
        JSON.stringify({ error: `La taille du fichier dépasse la limite de ${maxMb}MB` }),
        { status: 413, headers: { "Content-Type": "application/json" } }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: "Tentative d'upload sans fichier",
        metadata: {
          ip: getTrustedClientIp(request.headers),
          keyId: activeKey.id,
        },
      });
      return new Response(JSON.stringify({ error: "Aucun fichier fourni" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const validKey = await validateApiKeyForUpload(apiKey, file.name);
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
    const isVideo = isVideoFile(file.name);

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

    if (isVideo && !config.allowedTypes.videos) {
      return new Response(
        JSON.stringify({ error: "L'upload de vidéos n'est pas autorisé" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!isImage && !isDocument && !isArchive && !isVideo) {
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

    // Vérifier la taille maximale (les vidéos ont leur propre limite)
    const maxFileMb = isVideo ? maxVideoMb(config.limits) : config.limits.maxFileSize;
    if (file.size > maxFileMb * 1024 * 1024) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: `Tentative d'upload d'un fichier trop grand (> ${maxFileMb}MB)`,
        userId: validKey.id,
        metadata: {
          keyName: validKey.name,
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
          maxSize: maxFileMb * 1024 * 1024,
        },
      });
      return new Response(
        JSON.stringify({
          error: `La taille du fichier dépasse la limite de ${maxFileMb}MB`,
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

    const storedName = uploadResult.fileUrl!.split("/").pop()!;

    // Le jeton n'est remis qu'ici, dans le lien de suppression : le serveur
    // n'en garde que l'empreinte.
    const deletionUrl = uploadResult.deletionToken
      ? buildDeletionUrl(request.nextUrl.origin, storedName, uploadResult.deletionToken)
      : null;
    if (uploadResult.deletionToken) {
      await storeDeletionToken(storedName, uploadResult.deletionToken);
    }

    // Enregistrer dans l'historique
    await recordUpload({
      filename: storedName,
      originalFilename: file.name,
      fileSize: file.size,
      mimeType: file.type,
      uploadMethod: "api",
      fileUrl: uploadResult.fileUrl!,
      thumbnailUrl: uploadResult.thumbnailUrl,
      ipAddress: getTrustedClientIp(request.headers),
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
        deletion_url: deletionUrl,
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
        ip: getTrustedClientIp(request.headers),
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
