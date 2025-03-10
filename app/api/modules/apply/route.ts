import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import fs from "fs";
import path from "path";
import { getAbsoluteUploadPath } from "@/lib/config";
import { logDb } from "@/lib/utils/db";
import { LogAction } from "@/lib/types/logs";
import {
  apiModuleManager,
  initApiModuleManager,
} from "@/lib/modules/module-manager.api";
import sharp from "sharp";

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
    await initApiModuleManager();

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

// Fonction pour traiter une image avec un module
async function processImageWithModule(
  moduleExports: any,
  fileBuffer: Buffer,
  settings: any,
  moduleName: string
): Promise<Buffer> {
  // Normaliser le nom du module pour la comparaison (insensible à la casse)
  const normalizedModuleName = moduleName.toLowerCase();

  console.log(
    `Traitement de l'image avec le module ${moduleName} (normalisé: ${normalizedModuleName})`
  );
  console.log("Paramètres reçus:", JSON.stringify(settings, null, 2));
  console.log("Fonctions disponibles:", Object.keys(moduleExports).join(", "));

  try {
    // Essayer d'utiliser la fonction spécifique au module si elle existe
    // Par exemple: cropImage pour crop, addWatermark pour watermark, resizeImage pour resize
    const specificFunctions: Record<string, string> = {
      crop: "cropImage",
      watermark: "addWatermark",
      resize: "resizeImage",
    };

    const specificFunction = specificFunctions[normalizedModuleName];

    if (
      specificFunction &&
      typeof moduleExports[specificFunction] === "function"
    ) {
      console.log(`Utilisation de la fonction spécifique: ${specificFunction}`);
      try {
        const result = await moduleExports[specificFunction](
          fileBuffer,
          settings
        );

        if (Buffer.isBuffer(result)) {
          console.log(`Image traitée avec succès via ${specificFunction}`);
          return result;
        } else {
          console.warn(
            `La fonction ${specificFunction} n'a pas retourné un Buffer valide`
          );
        }
      } catch (error) {
        console.error(
          `Erreur lors de l'utilisation de ${specificFunction}:`,
          error
        );
      }
    }

    // Si aucune fonction spécifique n'a fonctionné ou n'existe, utiliser processImage
    if (typeof moduleExports.processImage === "function") {
      console.log("Utilisation de la fonction processImage générique");
      try {
        const result = await moduleExports.processImage(fileBuffer, settings);

        if (Buffer.isBuffer(result)) {
          console.log("Image traitée avec succès via processImage");
          return result;
        } else {
          console.warn(
            "La fonction processImage n'a pas retourné un Buffer valide"
          );
        }
      } catch (error) {
        console.error("Erreur lors de l'utilisation de processImage:", error);
      }
    }

    // Si le module a une fonction initModule, essayer de l'utiliser
    if (typeof moduleExports.initModule === "function") {
      console.log("Utilisation de la fonction initModule");
      try {
        const moduleInstance = moduleExports.initModule({ settings });

        if (
          moduleInstance &&
          typeof moduleInstance.processImage === "function"
        ) {
          const result = await moduleInstance.processImage(
            fileBuffer,
            settings
          );

          if (Buffer.isBuffer(result)) {
            console.log(
              "Image traitée avec succès via moduleInstance.processImage"
            );
            return result;
          } else {
            console.warn(
              "La fonction moduleInstance.processImage n'a pas retourné un Buffer valide"
            );
          }
        }
      } catch (error) {
        console.error("Erreur lors de l'utilisation de initModule:", error);
      }
    }

    // Si le module a un export par défaut, essayer de l'utiliser
    if (moduleExports.default) {
      console.log("Utilisation de l'export par défaut");
      try {
        const defaultExport = moduleExports.default;

        if (typeof defaultExport.processImage === "function") {
          const result = await defaultExport.processImage(fileBuffer, settings);

          if (Buffer.isBuffer(result)) {
            console.log("Image traitée avec succès via default.processImage");
            return result;
          } else {
            console.warn(
              "La fonction default.processImage n'a pas retourné un Buffer valide"
            );
          }
        }
      } catch (error) {
        console.error(
          "Erreur lors de l'utilisation de l'export par défaut:",
          error
        );
      }
    }

    // Essayer de trouver n'importe quelle fonction qui pourrait traiter des images
    for (const funcName of Object.keys(moduleExports)) {
      if (
        typeof moduleExports[funcName] === "function" &&
        funcName.toLowerCase().includes("image") &&
        funcName !== "processImage" // Éviter la duplication avec le test précédent
      ) {
        try {
          console.log(`Tentative d'utilisation de la fonction ${funcName}`);
          const result = await moduleExports[funcName](fileBuffer, settings);

          if (Buffer.isBuffer(result)) {
            console.log(`Image traitée avec succès via ${funcName}`);
            return result;
          }
        } catch (error) {
          console.error(`Erreur lors de l'utilisation de ${funcName}:`, error);
        }
      }
    }

    console.warn("Aucune fonction de traitement n'a réussi à modifier l'image");
    return fileBuffer;
  } catch (error) {
    console.error("Erreur lors du traitement de l'image:", error);
    return fileBuffer;
  }
}

// Fonction pour convertir une couleur hexadécimale en RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Supprimer le # si présent
  hex = hex.replace(/^#/, "");

  // Convertir en RGB
  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return null;
  }

  return { r, g, b };
}
