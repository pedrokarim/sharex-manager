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

function getClientInfo(request: NextRequest) {
  const ip = request.ip || 
             request.headers.get('x-forwarded-for') || 
             request.headers.get('x-real-ip') || 
             'IP inconnue';
             
  const userAgent = request.headers.get('user-agent') || 'User-Agent inconnu';
  const referer = request.headers.get('referer') || 'Referer inconnu';
  
  return {
    ip,
    userAgent,
    referer,
    method: request.method,
    url: request.url,
    timestamp: new Date().toISOString()
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  const clientInfo = getClientInfo(request);
  
  try {
    // Sécurisation : on ne prend que le nom du fichier, sans chemin
    const filename = params.filename.replace(/[/\\]/g, "");

    // Log de la requête
    console.log('Nouvelle requête image :', {
      ...clientInfo,
      filename,
      status: 'début'
    });

    // Vérifier si le fichier a une extension
    const ext = filename.split(".").pop()?.toLowerCase();
    if (!ext) {
      console.log('Requête échouée :', {
        ...clientInfo,
        filename,
        error: 'Extension manquante',
        status: 'échec'
      });
      return serveFileNotFound();
    }

    const filePath = join(UPLOADS_DIR, filename);

    // Vérifier si le fichier existe
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      console.log('Requête échouée :', {
        ...clientInfo,
        filename,
        error: 'Fichier non trouvé',
        status: 'échec'
      });
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
      console.log('Requête échouée :', {
        ...clientInfo,
        filename,
        error: 'Type MIME non supporté',
        status: 'échec'
      });
      return serveFileNotFound();
    }

    // Créer un stream de lecture du fichier
    const fileStream = createReadStream(filePath);

    console.log('Requête réussie :', {
      ...clientInfo,
      filename,
      fileSize: stats.size,
      contentType,
      status: 'succès'
    });

    // Retourner le fichier avec le bon type MIME
    return new Response(fileStream as any, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": stats.size.toString(),
      },
    });
  } catch (error) {
    console.error('Erreur critique :', {
      ...clientInfo,
      filename: params.filename,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
      status: 'erreur critique'
    });
    return serveFileNotFound();
  }
}
