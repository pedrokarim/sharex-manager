import { NextRequest, NextResponse } from "next/server";
import { moduleManager } from "@/lib/modules/module-manager";
import { auth } from "@/auth";
import fs from "fs";
import path from "path";
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

    const { fileName, moduleName, settings } = await request.json();

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

    // Récupérer le module
    const loadedModule = moduleManager.getLoadedModule(moduleName);
    if (!loadedModule) {
      logDb.createLog({
        level: "warning",
        action: "file.update" as LogAction,
        message: `Module non trouvé: ${moduleName}`,
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });
      return NextResponse.json({ error: "Module non trouvé" }, { status: 404 });
    }

    // Vérifier si le module supporte le type de fichier
    const fileExtension = fileName.split(".").pop()?.toLowerCase() || "";
    if (!loadedModule.config.supportedFileTypes.includes(fileExtension)) {
      logDb.createLog({
        level: "warning",
        action: "file.update" as LogAction,
        message: `Le module ${moduleName} ne supporte pas le type de fichier ${fileExtension}`,
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });
      return NextResponse.json(
        {
          error: `Le module ${moduleName} ne supporte pas le type de fichier ${fileExtension}`,
        },
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
    const fileBuffer = fs.readFileSync(filePath);

    // Appliquer le module au fichier
    let processedBuffer = fileBuffer;

    try {
      // Si des paramètres spécifiques sont fournis, les utiliser temporairement
      const originalSettings = { ...loadedModule.config.settings };
      if (settings) {
        loadedModule.config.settings = { ...originalSettings, ...settings };
      }

      console.log(`Traitement du fichier avec le module ${moduleName}`, {
        hasProcessImage: !!loadedModule.module.processImage,
        hasCropImage: !!loadedModule.module.cropImage,
        settings: settings ? JSON.stringify(settings) : "aucun",
      });

      // Si c'est le module de recadrage et que des données de recadrage sont fournies
      if (
        moduleName === "Crop" &&
        settings &&
        settings.crop &&
        loadedModule.module.cropImage
      ) {
        console.log("Utilisation de la fonction de recadrage spécifique");
        // Utiliser la fonction de recadrage spécifique
        processedBuffer = await loadedModule.module.cropImage(
          fileBuffer,
          settings
        );
      } else if (loadedModule.module.processImage) {
        console.log("Utilisation de la fonction de traitement standard");
        // Traiter l'image avec la fonction standard
        processedBuffer = await loadedModule.module.processImage(fileBuffer);
      } else {
        console.log("Aucune fonction de traitement disponible pour ce module");
      }

      // Restaurer les paramètres originaux
      if (settings) {
        loadedModule.config.settings = originalSettings;
      }
    } catch (error) {
      console.error(
        `Erreur lors du traitement de l'image avec le module ${moduleName}:`,
        error
      );
      logDb.createLog({
        level: "error",
        action: "file.update" as LogAction,
        message: `Erreur lors du traitement de l'image avec le module ${moduleName}: ${error}`,
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });
      return NextResponse.json(
        {
          error: `Erreur lors du traitement de l'image: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
        { status: 500 }
      );
    }

    // Écrire le fichier traité
    fs.writeFileSync(filePath, processedBuffer);

    logDb.createLog({
      level: "info",
      action: "file.update" as LogAction,
      message: `Fichier traité avec succès par le module ${moduleName}: ${fileName}`,
      userId: session.user?.id || undefined,
      userEmail: session.user?.email || undefined,
    });

    return NextResponse.json({
      success: true,
      message: `Fichier traité avec succès par le module ${moduleName}`,
      fileName: fileName,
    });
  } catch (error) {
    console.error("Erreur lors du traitement du fichier:", error);
    logDb.createLog({
      level: "error",
      action: "system.error" as LogAction,
      message: `Erreur lors du traitement du fichier: ${error}`,
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
    });
    return NextResponse.json(
      { error: "Erreur lors du traitement du fichier" },
      { status: 500 }
    );
  }
}
