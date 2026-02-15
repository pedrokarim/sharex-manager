import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import fs from "fs";
import path from "path";
import { getAbsoluteUploadPath } from "@/lib/config";
import { logDb } from "@/lib/utils/db";
import { LogAction } from "@/lib/types/logs";
import { apiModuleManager } from "@/lib/modules/module-manager.api";

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

    const {
      fileName,
      moduleName,
      settings,
      createNewVersion = true,
      internalProcessing = false,
      fileBuffer: encodedBuffer,
    } = await request.json();

    // S'assurer que le gestionnaire de modules est initialisé
    await apiModuleManager.ensureInitialized();

    // Vérifier si c'est un traitement interne (depuis le module manager)
    if (internalProcessing) {
      if (!moduleName || !encodedBuffer) {
        return NextResponse.json(
          { error: "Nom de module ou buffer d'image non fourni" },
          { status: 400 }
        );
      }

      // Convertir le buffer base64 en Buffer
      const fileBuffer = Buffer.from(encodedBuffer, "base64");

      // Traiter l'image avec le module
      const processedBuffer = await apiModuleManager.processImageWithModule(
        moduleName,
        fileBuffer,
        settings
      );

      // Retourner le buffer traité
      return new NextResponse(processedBuffer);
    }

    // Traitement normal (depuis l'interface utilisateur)
    if (!fileName || !moduleName) {
      logDb.createLog({
        level: "warning",
        action: "file.update" as LogAction,
        message:
          "Tentative de traitement d'image sans nom de fichier ou de module",
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });
      return NextResponse.json(
        { error: "Nom de fichier ou de module non fourni" },
        { status: 400 }
      );
    }

    // Obtenir le chemin absolu du fichier
    const uploadPath = getAbsoluteUploadPath();
    const filePath = path.join(uploadPath, fileName);

    // Vérifier si le fichier existe
    if (!fs.existsSync(filePath)) {
      logDb.createLog({
        level: "error",
        action: "file.update" as LogAction,
        message: `Fichier ${fileName} non trouvé`,
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });

      return NextResponse.json(
        { error: `Fichier ${fileName} non trouvé` },
        { status: 404 }
      );
    }

    // Lire le fichier
    const fileBuffer = fs.readFileSync(filePath);

    // Vérifier si le module existe
    const loadedModule = apiModuleManager.getLoadedModule(moduleName);
    if (!loadedModule) {
      const availableModules = apiModuleManager
        .getAllLoadedModules()
        .map((m) => m.name)
        .join(", ");

      logDb.createLog({
        level: "error",
        action: "file.update" as LogAction,
        message: `Module ${moduleName} non trouvé. Modules disponibles: ${availableModules}`,
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });

      return NextResponse.json(
        {
          error: `Module ${moduleName} non trouvé`,
          availableModules,
        },
        { status: 404 }
      );
    }

    // Traiter l'image avec le module
    const processedBuffer = await apiModuleManager.processImageWithModule(
      moduleName,
      fileBuffer,
      settings
    );

    // Générer un nouveau nom de fichier si nécessaire
    let newFileName = fileName;
    if (createNewVersion) {
      const fileExt = path.extname(fileName);
      const fileNameWithoutExt = path.basename(fileName, fileExt);
      const timestamp = Date.now();
      newFileName = `${fileNameWithoutExt}_${moduleName}_${timestamp}${fileExt}`;
    }

    // Écrire le fichier traité
    const newFilePath = path.join(uploadPath, newFileName);
    fs.writeFileSync(newFilePath, processedBuffer);

    // Journaliser l'action
    logDb.createLog({
      level: "info",
      action: "file.update" as LogAction,
      message: `Fichier ${fileName} traité avec le module ${moduleName}`,
      userId: session.user?.id || undefined,
      userEmail: session.user?.email || undefined,
      metadata: {
        originalFile: fileName,
        newFile: newFileName,
        module: moduleName,
        createNewVersion,
      },
    });

    return NextResponse.json({
      success: true,
      fileName: newFileName,
      originalName: fileName,
      moduleName,
    });
  } catch (error) {
    console.error("Erreur lors du traitement de l'image:", error);

    logDb.createLog({
      level: "error",
      action: "file.update" as LogAction,
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
