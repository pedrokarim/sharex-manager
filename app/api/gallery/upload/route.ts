import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { storeDeletionToken } from "@/lib/deletion-tokens";
import { recordUpload } from "@/lib/history";
import { getConfig } from "@/lib/upload-config";
import { handleFileUpload } from "@/lib/upload";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export async function POST(request: NextRequest) {
  try {
    // Vérifier que l'utilisateur est connecté
    const session = await auth();
    if (!session) {
      return NextResponse.json(
        { error: "Vous devez être connecté pour uploader des fichiers" },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "Aucun fichier fourni" },
        { status: 400 }
      );
    }

    // Charger la configuration
    const config = await getConfig();

    // Vérifier le type de fichier
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
    const isDocument = /\.(pdf|doc|docx|txt)$/i.test(file.name);
    const isArchive = /\.(zip|rar)$/i.test(file.name);

    if (isImage && !config.allowedTypes.images) {
      return NextResponse.json(
        { error: "L'upload d'images n'est pas autorisé" },
        { status: 400 }
      );
    }

    if (isDocument && !config.allowedTypes.documents) {
      return NextResponse.json(
        { error: "L'upload de documents n'est pas autorisé" },
        { status: 400 }
      );
    }

    if (isArchive && !config.allowedTypes.archives) {
      return NextResponse.json(
        { error: "L'upload d'archives n'est pas autorisé" },
        { status: 400 }
      );
    }

    if (!isImage && !isDocument && !isArchive) {
      return NextResponse.json(
        { error: "Type de fichier non supporté" },
        { status: 400 }
      );
    }

    // Vérifier la taille minimale
    if (file.size < config.limits.minFileSize * 1024) {
      return NextResponse.json(
        {
          error: `La taille du fichier est inférieure à la limite minimale de ${config.limits.minFileSize}KB`,
        },
        { status: 400 }
      );
    }

    // Vérifier la taille maximale
    if (file.size > config.limits.maxFileSize * 1024 * 1024) {
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
      return NextResponse.json({ error: uploadResult.error }, { status: 400 });
    }

    // Enregistrer dans l'historique
    await recordUpload({
      filename: uploadResult.fileUrl!.split("/").pop()!,
      originalFilename: file.name,
      fileSize: file.size,
      mimeType: file.type,
      uploadMethod: "web",
      fileUrl: `${API_URL}${uploadResult.fileUrl}`,
      thumbnailUrl: uploadResult.thumbnailUrl
        ? `${API_URL}${uploadResult.thumbnailUrl}`
        : undefined,
      deletionToken: uploadResult.deletionToken,
      ipAddress:
        request.ip || request.headers.get("x-forwarded-for") || "unknown",
      userId: session?.user?.id,
      userName: session?.user?.name || undefined,
    });

    return NextResponse.json({
      success: true,
      file: {
        url: `${API_URL}${uploadResult.fileUrl}`,
        name: uploadResult.fileUrl!.split("/").pop()!,
        originalName: file.name,
        size: file.size,
        type: file.type,
        deletionToken: uploadResult.deletionToken,
      },
    });
  } catch (error) {
    console.error("Erreur lors de l'upload:", error);
    return NextResponse.json(
      { error: "Une erreur est survenue lors de l'upload" },
      { status: 500 }
    );
  }
}
