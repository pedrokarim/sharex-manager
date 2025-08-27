import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import fs from "fs";
import path from "path";
import { processImage } from "@/lib/modules/image-processor";
import { getAbsoluteUploadPath } from "@/lib/config";
import { logDb } from "@/lib/utils/db";
import { LogAction } from "@/lib/types/logs";

export async function POST(request: NextRequest) {
  const session = await auth();
  try {
    if (!session) {
      logDb.createLog({
        level: "warning",
        action: "file.update" as LogAction,
        message: "Tentative de traitement d'image non autorisée",
        userId: undefined,
        userEmail: undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { fileName } = await request.json();

    if (!fileName) {
      logDb.createLog({
        level: "warning",
        action: "file.update" as LogAction,
        message: "Tentative de traitement d'image sans nom de fichier",
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });
      return NextResponse.json(
        { error: "Aucun nom de fichier fourni" },
        { status: 400 }
      );
    }

    // Vérifier si le fichier est une image
    if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
      logDb.createLog({
        level: "warning",
        action: "file.update" as LogAction,
        message: `Tentative de traitement d'un fichier non image: ${fileName}`,
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });
      return NextResponse.json(
        { error: "Le fichier n'est pas une image" },
        { status: 400 }
      );
    }

    // Construire le chemin du fichier
    const uploadPath = getAbsoluteUploadPath();
    const filePath = path.join(uploadPath, fileName);

    // Vérifier si le fichier existe
    if (!fs.existsSync(filePath)) {
      logDb.createLog({
        level: "warning",
        action: "file.update" as LogAction,
        message: `Fichier non trouvé: ${fileName}`,
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });
      return NextResponse.json(
        { error: "Fichier non trouvé" },
        { status: 404 }
      );
    }

    // Lire le fichier
    const imageBuffer = fs.readFileSync(filePath);

    // Traiter l'image avec tous les modules activés
    const processedImageBuffer = await processImage(imageBuffer);

    // Écrire le fichier traité
    fs.writeFileSync(filePath, processedImageBuffer);

    logDb.createLog({
      level: "info",
      action: "file.update" as LogAction,
      message: `Image traitée avec succès: ${fileName}`,
      userId: session.user?.id || undefined,
      userEmail: session.user?.email || undefined,
    });

    return NextResponse.json({
      success: true,
      message: "Image traitée avec succès",
      fileName: fileName,
    });
  } catch (error) {
    console.error("Erreur lors du traitement de l'image:", error);
    logDb.createLog({
      level: "error",
      action: "system.error" as LogAction,
      message: `Erreur lors du traitement de l'image: ${error}`,
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
    });
    return NextResponse.json(
      { error: "Erreur lors du traitement de l'image" },
      { status: 500 }
    );
  }
}
