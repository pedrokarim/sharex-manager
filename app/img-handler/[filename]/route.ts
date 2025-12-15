import { join } from "path";
import type { NextRequest } from "next/server";
import { getAbsoluteUploadPath } from "@/lib/config";
import { serveFile, getClientInfo } from "@/lib/file-handler";
import { logDb } from "@/lib/utils/db";
import { existsSync } from "fs";
import { auth } from "@/auth";
import { isFileSecure } from "@/lib/secure-files";

const UPLOADS_DIR = getAbsoluteUploadPath();
const FILE_NOT_FOUND_PATH = join(process.cwd(), "public", "file_not_found.png");
const UNAUTHORIZED_PATH = join(process.cwd(), "public", "unauthorized.png");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename?: string }> }
) {
  const clientInfo = getClientInfo(request);

  // Dans Next.js 16, params est une Promise
  const resolvedParams = await params;

  // Vérifier si le paramètre filename existe
  if (!resolvedParams?.filename) {
    console.error('ERROR: params.filename is undefined');
    return new Response('Filename parameter is missing', { status: 400 });
  }

  // Sécurisation : on ne prend que le nom du fichier, sans chemin
  const filename = resolvedParams.filename.replace(/[/\\]/g, "");
  console.log('Cleaned filename:', filename);
  const filePath = join(UPLOADS_DIR, filename);

  // Vérifier si le fichier existe
  const fileExists = existsSync(filePath);

  // Vérifier si le fichier est sécurisé
  const isSecure = await isFileSecure(filename);

  // Si le fichier est sécurisé, vérifier l'authentification
  if (isSecure) {
    // Remarque : ça ne fonctionne pas avec le middleware auth
    const session = await auth();
    if (!session?.user) {
      // Logger la tentative d'accès non autorisé
      logDb.createLog({
        level: "warning",
        action: "file.unauthorized",
        message: `Tentative d'accès non autorisé à une image sécurisée: ${filename}`,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        metadata: {
          filename,
          path: filePath,
          referer: request.headers.get("referer") || undefined,
        },
      });

      return serveFile({
        filePath: UNAUTHORIZED_PATH,
        filename: "unauthorized.png",
        clientInfo,
        fallbackPath: FILE_NOT_FOUND_PATH,
        enableLogging: false,
      });
    }
  }

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
      isSecure,
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
