import { mkdir, chmod, stat, writeFile } from "fs/promises";
import { join, dirname, extname, basename } from "path";
import sharp from "sharp";
import { UploadConfig } from "@/lib/types/upload-config";
import { generateId } from "@/lib/utils";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { getFileUrl } from "@/lib/utils/url";
import { getAbsoluteUploadPath } from "@/lib/config";

export interface UploadResult {
  success: boolean;
  error?: string;
  fileUrl?: string;
  thumbnailUrl?: string;
  deletionToken?: string;
}

function formatFileName(
  originalName: string,
  pattern: string,
  preserveFilenames: boolean
): string {
  if (preserveFilenames) {
    return originalName.replace(/[^a-zA-Z0-9-_\.]/g, "-").toLowerCase();
  }

  const timestamp = Date.now();
  const random = generateId();
  const ext = extname(originalName);
  const nameWithoutExt = originalName.slice(0, -ext.length);

  return (
    pattern
      .replace("{timestamp}", timestamp.toString())
      .replace("{random}", random)
      .replace("{original}", nameWithoutExt)
      .replace(/[^a-zA-Z0-9-_\.]/g, "-") + // Assainir le nom de fichier
    ext.toLowerCase()
  );
}

async function getUploadPath(
  config: UploadConfig,
  fileName: string
): Promise<string> {
  const baseDir = getAbsoluteUploadPath();

  switch (config.storage.structure) {
    case "date": {
      const now = new Date();
      const zoned = toZonedTime(now, config.storage.dateFormat.timezone);
      const datePath = format(zoned, config.storage.dateFormat.folderStructure);
      const fullPath = join(baseDir, datePath);
      await mkdir(fullPath, {
        recursive: true,
        mode: parseInt(config.storage.permissions.directories, 8),
      });
      return fullPath;
    }
    case "type": {
      const ext = extname(fileName).toLowerCase();
      // let typePath = "others";

      // if (/\.(jpg|jpeg|png|gif|webp)$/i.test(ext)) typePath = "images";
      // else if (/\.(pdf|doc|docx|txt)$/i.test(ext)) typePath = "documents";
      // else if (/\.(zip|rar)$/i.test(ext)) typePath = "archives";

      const fullPath = join(baseDir);
      await mkdir(fullPath, {
        recursive: true,
        mode: parseInt(config.storage.permissions.directories, 8),
      });
      return fullPath;
    }
    default: {
      await mkdir(baseDir, {
        recursive: true,
        mode: parseInt(config.storage.permissions.directories, 8),
      });
      return baseDir;
    }
  }
}

async function getThumbnailPath(
  config: UploadConfig,
  uploadPath: string
): Promise<string> {
  const thumbnailPath = join(
    uploadPath,
    config.storage.thumbnailsPath
  );

  await mkdir(thumbnailPath, {
    recursive: true,
    mode: parseInt(config.storage.permissions.directories, 8),
  });
  return thumbnailPath;
}

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function generateDeletionToken(): Promise<string> {
  return generateId(32);
}

async function saveFile(
  filePath: string,
  buffer: Buffer,
  permissions: string
): Promise<void> {
  await writeFile(filePath, buffer);
  await chmod(filePath, parseInt(permissions, 8));
}

async function generateThumbnail(
  buffer: Buffer,
  config: UploadConfig,
  originalFormat: string
): Promise<Buffer> {
  let sharpInstance = sharp(buffer);

  // Déterminer le format de sortie
  const outputFormat =
    config.thumbnails.format === "auto"
      ? /\.(png|webp)$/i.test(originalFormat) &&
        config.thumbnails.preserveFormat
        ? originalFormat.replace(".", "").toLowerCase()
        : "jpeg"
      : config.thumbnails.format;

  // Appliquer les transformations de base
  sharpInstance = sharpInstance.resize(
    config.thumbnails.maxWidth,
    config.thumbnails.maxHeight,
    {
      fit: config.thumbnails.fit,
      withoutEnlargement: true,
      background: config.thumbnails.background,
    }
  );

  // Appliquer les optimisations selon le format
  switch (outputFormat) {
    case "png":
      sharpInstance = sharpInstance.png({
        compressionLevel: 9,
        palette: true,
        progressive: config.thumbnails.progressive,
      });
      break;
    case "webp":
      sharpInstance = sharpInstance.webp({
        quality: config.thumbnails.quality,
        lossless: false,
        smartSubsample: true,
        effort: 6,
      });
      break;
    default:
      sharpInstance = sharpInstance.jpeg({
        quality: config.thumbnails.quality,
        mozjpeg: true,
        progressive: config.thumbnails.progressive,
        optimizeCoding: true,
        trellisQuantisation: true,
        overshootDeringing: true,
        optimizeScans: true,
      });
  }

  // Appliquer les optimisations supplémentaires
  if (config.thumbnails.blur > 0) {
    sharpInstance = sharpInstance.blur(config.thumbnails.blur);
  }

  if (config.thumbnails.sharpen) {
    sharpInstance = sharpInstance.sharpen({
      sigma: 1,
      m1: 0.5,
      m2: 0.5,
      x1: 4,
      y2: 10,
      y3: 20,
    });
  }

  // Gérer les métadonnées selon la configuration
  if (config.thumbnails.metadata) {
    sharpInstance = sharpInstance.withMetadata();
  }

  return sharpInstance.toBuffer();
}

export async function handleFileUpload(
  file: File,
  config: UploadConfig
): Promise<UploadResult> {
  try {
    const uploadPath = getAbsoluteUploadPath();
    const fileName = formatFileName(
      file.name,
      config.filenamePattern,
      config.storage.preserveFilenames
    );
    const filePath = join(uploadPath, fileName);

    // Vérifier si le fichier existe déjà
    if (!config.storage.replaceExisting && (await checkFileExists(filePath))) {
      return {
        success: false,
        error: "Un fichier avec ce nom existe déjà",
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Écrire le fichier avec les permissions configurées
    await saveFile(filePath, buffer, config.storage.permissions.files);

    let thumbnailUrl: string | undefined;

    // Générer une miniature si c'est une image et que les miniatures sont activées
    if (
      config.thumbnails.enabled &&
      /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)
    ) {
      const thumbnailPath = await getThumbnailPath(config, uploadPath);
      const thumbnailFileName = `thumb_${fileName}`;
      const thumbnailFilePath = join(thumbnailPath, thumbnailFileName);

      // Générer la miniature avec les options avancées
      const thumbnailBuffer = await generateThumbnail(
        buffer,
        config,
        extname(file.name)
      );
      await saveFile(
        thumbnailFilePath,
        thumbnailBuffer,
        config.storage.permissions.files
      );

      thumbnailUrl = `/${config.storage.thumbnailsPath}/${thumbnailFileName}`;
    }

    // Générer un token de suppression
    const deletionToken = await generateDeletionToken();

    // Construire les URLs avec le domaine configuré
    const relativeFileUrl = `/${
      config.storage.structure === "type" ? basename(uploadPath) + "/" : ""
    }${fileName}`;

    const fileUrl = getFileUrl(config, relativeFileUrl);
    const fullThumbnailUrl = thumbnailUrl
      ? getFileUrl(config, thumbnailUrl)
      : undefined;

    return {
      success: true,
      fileUrl,
      thumbnailUrl: fullThumbnailUrl,
      deletionToken,
    };
  } catch (error) {
    console.error("Erreur lors de l'upload:", error);
    return {
      success: false,
      error: "Une erreur est survenue lors de l'upload du fichier",
    };
  }
}
