import { join } from "node:path";
import type { NextRequest } from "next/server";
import { getAbsoluteUploadPath } from "@/lib/config";
import { serveFile, getClientInfo } from "@/lib/file-handler";

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

  return serveFile({
    filePath,
    filename,
    clientInfo,
    fallbackPath: FILE_NOT_FOUND_PATH,
    enableLogging: true,
  });
}
