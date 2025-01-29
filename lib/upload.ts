import { mkdir } from "fs/promises";
import { join, dirname } from "path";
import sharp from "sharp";
import { UploadConfig } from "@/hooks/use-upload-config";

export interface UploadResult {
  success: boolean;
  error?: string;
  fileUrl?: string;
  thumbnailUrl?: string;
  deletionToken?: string;
}

export async function handleFileUpload(
  file: File,
  config: UploadConfig,
  userId?: string
): Promise<UploadResult> {
  try {
    // Vérification du type de fichier
    const imageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const documentTypes = [
      "application/pdf",
      "application/msword",
      "text/plain",
    ];
    const archiveTypes = ["application/zip", "application/x-rar-compressed"];

    let isAllowed = false;

    if (imageTypes.includes(file.type) && config.allowedTypes.images) {
      isAllowed = true;
    } else if (
      documentTypes.includes(file.type) &&
      config.allowedTypes.documents
    ) {
      isAllowed = true;
    } else if (
      archiveTypes.includes(file.type) &&
      config.allowedTypes.archives
    ) {
      isAllowed = true;
    }

    if (!isAllowed) {
      return {
        success: false,
        error: "Type de fichier non autorisé",
      };
    }

    // Vérification de la taille
    if (file.size > config.maxFileSize * 1024 * 1024) {
      return {
        success: false,
        error: `La taille du fichier dépasse la limite de ${config.maxFileSize}MB`,
      };
    }

    // Génération du nom de fichier
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const filename = config.filenamePattern
      .replace("{timestamp}", timestamp.toString())
      .replace("{original}", file.name)
      .replace("{random}", random);

    // Détermination du chemin de stockage
    const uploadPath = getUploadPath(config, filename, file.type);
    const fullPath = join(process.cwd(), uploadPath);

    // Création des dossiers nécessaires
    await mkdir(dirname(fullPath), { recursive: true });

    // Lecture du fichier
    const buffer = await file.arrayBuffer();

    // Génération de la miniature pour les images si activé
    let thumbnailPath: string | undefined;
    if (config.thumbnails.enabled && imageTypes.includes(file.type)) {
      thumbnailPath = join(dirname(uploadPath), "thumbnails", filename);
      const thumbnailFullPath = join(process.cwd(), thumbnailPath);
      await mkdir(dirname(thumbnailFullPath), { recursive: true });

      await sharp(Buffer.from(buffer))
        .resize(config.thumbnails.maxWidth, config.thumbnails.maxHeight, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({
          quality: config.thumbnails.quality,
        })
        .toFile(thumbnailFullPath);
    }

    // Sauvegarde du fichier original
    const fileData = Buffer.from(buffer);
    await Bun.write(fullPath, fileData);

    // Génération du token de suppression
    const deletionToken = generateDeletionToken();

    return {
      success: true,
      fileUrl: uploadPath,
      thumbnailUrl: thumbnailPath,
      deletionToken,
    };
  } catch (error) {
    console.error("Erreur lors de l'upload:", error);
    return {
      success: false,
      error: "Erreur lors de l'upload du fichier",
    };
  }
}

function getUploadPath(
  config: UploadConfig,
  filename: string,
  fileType: string
): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  let basePath = config.storage.path;
  if (!basePath.startsWith("./")) {
    basePath = "./" + basePath;
  }

  switch (config.storage.structure) {
    case "date":
      return join(basePath, year.toString(), month, day, filename);
    case "type":
      const type = fileType.split("/")[0];
      return join(basePath, type, filename);
    default:
      return join(basePath, filename);
  }
}

function generateDeletionToken(): string {
  return Buffer.from(
    Math.random().toString(36).substring(2) + Date.now().toString()
  )
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 32);
}
