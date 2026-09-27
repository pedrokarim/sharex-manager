import { NextRequest, NextResponse } from "next/server";
import { announceNewUpload } from "@/lib/gallery-events";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import fs from "fs";
import path from "path";
import { getAbsoluteUploadPath } from "@/lib/config";
import { logDb } from "@/lib/utils/db";
import { LogAction } from "@/lib/types/logs";
import { apiModuleManager } from "@/lib/modules/module-manager.api";
import { isFileSecure, setFileSecure } from "@/lib/secure-files";
import sharp from "sharp";

/** Extension d'après le format réellement produit par le module. */
const EXTENSION_BY_FORMAT: Record<string, string> = {
  jpeg: ".jpg",
  png: ".png",
  webp: ".webp",
  gif: ".gif",
  avif: ".avif",
  tiff: ".tiff",
};

/** Nom d'un fichier de la galerie : un seul segment, sans chemin ni fichier caché. */
function isGalleryFileName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 255 &&
    value === path.basename(value) &&
    !value.startsWith(".") &&
    !/[\\/\0]/.test(value)
  );
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
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
    } = await request.json();

    // S'assurer que le gestionnaire de modules est initialisé
    await apiModuleManager.ensureInitialized();

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

    // Le nom vient du navigateur : sans ce contrôle, « ../ » faisait lire
    // (et publier dans la galerie) n'importe quel fichier du serveur.
    if (!isGalleryFileName(fileName) || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(String(moduleName))) {
      return NextResponse.json({ error: "Nom de fichier ou de module invalide" }, { status: 400 });
    }

    // Obtenir le chemin absolu du fichier
    const uploadPath = path.resolve(getAbsoluteUploadPath());
    const filePath = path.resolve(uploadPath, fileName);
    if (!filePath.startsWith(uploadPath + path.sep)) {
      return NextResponse.json({ error: "Nom de fichier invalide" }, { status: 400 });
    }

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

    // Traiter l'image avec le module. En mode strict, un échec remonte au lieu
    // de rendre l'original : sinon la « nouvelle version » était une simple
    // copie du fichier source.
    let processedBuffer: Buffer;
    try {
      processedBuffer = await apiModuleManager.processImageWithModule(
        moduleName,
        fileBuffer,
        settings,
        { strict: true }
      );
    } catch (error) {
      // L'échec d'un module se dit tel quel : « Erreur lors du traitement »
      // n'aidait personne à comprendre ce qui clochait.
      const message = error instanceof Error ? error.message : "Le module a échoué";
      return NextResponse.json({ error: message }, { status: 422 });
    }

    // Une « nouvelle version » identique à l'original n'est pas un succès :
    // c'est ce qui se passait quand un module échouait en silence.
    if (Buffer.compare(processedBuffer, fileBuffer) === 0) {
      return NextResponse.json(
        { error: "Le module n'a rien changé à l'image avec ces réglages." },
        { status: 422 }
      );
    }

    // Générer un nouveau nom de fichier si nécessaire
    // Un module peut changer de format (un recadrage rond passe en PNG pour
    // la transparence) : l'extension suit le contenu, sinon un « .jpg »
    // contiendrait du PNG.
    const fileExt = path.extname(fileName);
    const format = await sharp(processedBuffer).metadata().then((meta) => meta.format).catch(() => undefined);
    const producedExt = format ? EXTENSION_BY_FORMAT[format] : undefined;
    const sameFormat = !producedExt || producedExt === fileExt.toLowerCase() || (producedExt === ".jpg" && fileExt.toLowerCase() === ".jpeg");
    let newFileName = fileName;
    if (createNewVersion || !sameFormat) {
      const fileNameWithoutExt = path.basename(fileName, fileExt);
      const timestamp = Date.now();
      newFileName = `${fileNameWithoutExt}_${moduleName}_${timestamp}${sameFormat ? fileExt : producedExt}`;
    }

    // Écrire le fichier traité
    const newFilePath = path.resolve(uploadPath, newFileName);
    if (!newFilePath.startsWith(uploadPath + path.sep)) {
      return NextResponse.json({ error: "Nom de fichier invalide" }, { status: 400 });
    }
    fs.writeFileSync(newFilePath, processedBuffer);

    // Une version d'un fichier sécurisé reste sécurisée : sinon elle serait
    // publique sur le domaine d'images.
    if (newFileName !== fileName && (await isFileSecure(fileName))) {
      await setFileSecure(newFileName, true);
    }

    // Une nouvelle version doit apparaître tout de suite dans les galeries
    // ouvertes, comme un upload ShareX.
    if (newFileName !== fileName) {
      await announceNewUpload(newFileName);
    }

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
