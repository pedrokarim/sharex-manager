import { join } from "path";
import type { NextRequest } from "next/server";
import { getAbsoluteUploadPath } from "@/lib/config";
import { serveFile, getClientInfo } from "@/lib/file-handler";
import { logDb } from "@/lib/utils/db";
import { existsSync } from "fs";

const UPLOADS_DIR = getAbsoluteUploadPath();
const FILE_NOT_FOUND_PATH = join(process.cwd(), "public", "file_not_found.png");

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  const clientInfo = getClientInfo(request);

  // Sécurisation : on ne prend que le nom du fichier, sans chemin
  const filename = params.filename.replace(/[/\\]/g, "");
  const filePath = join(UPLOADS_DIR, filename);

  // Vérifier si le fichier existe
  const fileExists = existsSync(filePath);

  // Logger la tentative d'accès
  logDb.createLog({
    level: fileExists ? "info" : "warning",
    action: "file.download",
    message: fileExists
      ? `Accès à l'image: ${filename}`
      : `Tentative d'accès à une image inexistante: ${filename}`,
    ip: clientInfo.ip,
    userAgent: clientInfo.userAgent,
    metadata: {
      filename,
      path: filePath,
      exists: fileExists,
      referer: request.headers.get("referer") || undefined,
    },
  });

  return serveFile({
    filePath,
    filename,
    clientInfo,
    fallbackPath: FILE_NOT_FOUND_PATH,
    enableLogging: false, // On désactive le logging interne car on le gère nous-mêmes
  });
}
