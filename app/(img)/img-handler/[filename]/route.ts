import { join } from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { NextRequest } from "next/server";
import { getAbsoluteUploadPath } from "@/lib/config";

const UPLOADS_DIR = getAbsoluteUploadPath();
const FILE_NOT_FOUND_PATH = join(process.cwd(), "public", "file_not_found.png");

async function serveFileNotFound() {
  const fileStream = createReadStream(FILE_NOT_FOUND_PATH);
  const stats = await stat(FILE_NOT_FOUND_PATH);

  return new Response(fileStream as any, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": stats.size.toString(),
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    // Sécurisation : on ne prend que le nom du fichier, sans chemin
    const filename = params.filename.replace(/[/\\]/g, "");

    // Vérifier si le fichier a une extension
    const ext = filename.split(".").pop()?.toLowerCase();
    if (!ext) {
      return serveFileNotFound();
    }

    const filePath = join(UPLOADS_DIR, filename);

    // Vérifier si le fichier existe
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      return serveFileNotFound();
    }

    // Déterminer le type MIME basé sur l'extension
    const mimeTypes: { [key: string]: string } = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      pdf: "application/pdf",
      txt: "text/plain",
    };

    const contentType = mimeTypes[ext];
    if (!contentType) {
      return serveFileNotFound();
    }

    // Créer un stream de lecture du fichier
    const fileStream = createReadStream(filePath);

    // Retourner le fichier avec le bon type MIME
    return new Response(fileStream as any, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": stats.size.toString(),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la lecture du fichier:", error);
    return serveFileNotFound();
  }
}
