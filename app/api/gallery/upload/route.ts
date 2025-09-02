import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { storeDeletionToken } from "@/lib/deletion-tokens";
import { recordUpload } from "@/lib/history";
import { getServerConfig } from "@/lib/server/config";
import { handleFileUpload } from "@/lib/upload";
import { logDb } from "@/lib/utils/db";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session) {
      logDb.createLog({
        level: "warning",
        action: "file.upload",
        message: "Tentative d'upload non autorisée",
        userId: undefined,
        userEmail: undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    if (!session.user?.id) {
      logDb.createLog({
        level: "warning",
        action: "file.upload",
        message: "Session utilisateur invalide",
        userId: undefined,
        userEmail: session.user?.email || undefined,
      });
      return NextResponse.json({ error: "Session invalide" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      logDb.createLog({
        level: "warning",
        action: "file.upload",
        message: "Tentative d'upload sans fichier",
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
      });
      return NextResponse.json(
        { error: "Aucun fichier fourni" },
        { status: 400 }
      );
    }

    const config = await getServerConfig();

    // Vérifier le type de fichier
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
    const isDocument = /\.(pdf|doc|docx|txt)$/i.test(file.name);
    const isArchive = /\.(zip|rar)$/i.test(file.name);

    if (isImage && !config.allowedTypes.images) {
      logDb.createLog({
        level: "warning",
        action: "file.upload",
        message: "Tentative d'upload d'image non autorisée",
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: {
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
        },
      });
      return NextResponse.json(
        { error: "L'upload d'images n'est pas autorisé" },
        { status: 400 }
      );
    }

    if (isDocument && !config.allowedTypes.documents) {
      logDb.createLog({
        level: "warning",
        action: "file.upload",
        message: "Tentative d'upload de document non autorisé",
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: {
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
        },
      });
      return NextResponse.json(
        { error: "L'upload de documents n'est pas autorisé" },
        { status: 400 }
      );
    }

    if (isArchive && !config.allowedTypes.archives) {
      logDb.createLog({
        level: "warning",
        action: "file.upload",
        message: "Tentative d'upload d'archive non autorisée",
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: {
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
        },
      });
      return NextResponse.json(
        { error: "L'upload d'archives n'est pas autorisé" },
        { status: 400 }
      );
    }

    if (!isImage && !isDocument && !isArchive) {
      logDb.createLog({
        level: "warning",
        action: "file.upload",
        message: "Tentative d'upload d'un type de fichier non supporté",
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: {
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
        },
      });
      return NextResponse.json(
        { error: "Type de fichier non supporté" },
        { status: 400 }
      );
    }

    // Vérifier la taille minimale
    if (file.size < config.limits.minFileSize * 1024) {
      logDb.createLog({
        level: "warning",
        action: "file.upload",
        message: `Tentative d'upload d'un fichier trop petit (< ${config.limits.minFileSize}KB)`,
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: {
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
          minSize: config.limits.minFileSize * 1024,
        },
      });
      return NextResponse.json(
        {
          error: `La taille du fichier est inférieure à la limite minimale de ${config.limits.minFileSize}KB`,
        },
        { status: 400 }
      );
    }

    // Vérifier la taille maximale
    if (file.size > config.limits.maxFileSize * 1024 * 1024) {
      logDb.createLog({
        level: "warning",
        action: "file.upload",
        message: `Tentative d'upload d'un fichier trop grand (> ${config.limits.maxFileSize}MB)`,
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: {
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
          maxSize: config.limits.maxFileSize * 1024 * 1024,
        },
      });
      return NextResponse.json(
        {
          error: `La taille du fichier dépasse la limite de ${config.limits.maxFileSize}MB`,
        },
        { status: 400 }
      );
    }

    // Utiliser handleFileUpload pour gérer l'upload
    const uploadResult = await handleFileUpload(file, config);

    if (!uploadResult.success) {
      logDb.createLog({
        level: "error",
        action: "file.upload",
        message: "Erreur lors de l'upload du fichier",
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: {
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
          error: uploadResult.error,
        },
      });
      return NextResponse.json({ error: uploadResult.error }, { status: 400 });
    }

    // Enregistrer dans l'historique
    await recordUpload({
      filename: uploadResult.fileUrl!.split("/").pop()!,
      originalFilename: file.name,
      fileSize: file.size,
      mimeType: file.type,
      uploadMethod: "web",
      fileUrl: uploadResult.fileUrl!,
      thumbnailUrl: uploadResult.thumbnailUrl,
      deletionToken: uploadResult.deletionToken,
      ipAddress:
        request.ip || request.headers.get("x-forwarded-for") || "unknown",
      userId: session?.user?.id,
    });

    logDb.createLog({
      level: "info",
      action: "file.upload",
      message: `Upload réussi: ${file.name}`,
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type,
        fileUrl: uploadResult.fileUrl,
        thumbnailUrl: uploadResult.thumbnailUrl,
        uploadMethod: "web",
      },
    });

    return NextResponse.json({
      url: uploadResult.fileUrl,
      thumbnailUrl: uploadResult.thumbnailUrl,
      deletionToken: uploadResult.deletionToken,
    });
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur système lors de l'upload",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return NextResponse.json(
      { error: "Erreur lors de l'upload" },
      { status: 500 }
    );
  }
}
