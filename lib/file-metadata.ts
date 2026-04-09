import { stat } from "fs/promises";
import { join } from "path";
import { getAbsoluteUploadPath } from "@/lib/config";
import { getSecureFiles } from "@/lib/secure-files";
import { getStarredFiles } from "@/lib/starred-files";
import type { FileInfo } from "@/types/files";

const UPLOADS_DIR = getAbsoluteUploadPath();

export interface FileFlagSets {
  secureFiles: Set<string>;
  starredFiles: Set<string>;
}

export const sanitizeFilename = (filename: string) =>
  filename.replace(/[/\\]/g, "");

export async function loadFileFlagSets(): Promise<FileFlagSets> {
  const [secureFiles, starredFiles] = await Promise.all([
    getSecureFiles(),
    getStarredFiles(),
  ]);

  return {
    secureFiles: new Set(secureFiles),
    starredFiles: new Set(starredFiles),
  };
}

export async function getFileMetadata(
  filename: string,
  flagSets?: FileFlagSets,
): Promise<FileInfo | null> {
  const safeFilename = sanitizeFilename(filename);

  try {
    const stats = await stat(join(UPLOADS_DIR, safeFilename));
    const flags = flagSets ?? (await loadFileFlagSets());

    return {
      name: safeFilename,
      url: `/api/files/${encodeURIComponent(safeFilename)}`,
      size: stats.size,
      createdAt: stats.mtime.toISOString(),
      isSecure: flags.secureFiles.has(safeFilename),
      isStarred: flags.starredFiles.has(safeFilename),
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}
