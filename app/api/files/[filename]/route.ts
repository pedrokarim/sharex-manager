import { auth } from "@/auth";
import { unlink } from "fs/promises";
import { join } from "path";
import { NextRequest } from "next/server";
import {
  validateDeletionToken,
  deleteDeletionToken,
} from "@/lib/deletion-tokens";
import { getAbsoluteUploadPath } from "@/lib/config";
import path from "path";
import fs from "fs/promises";

const UPLOADS_DIR = getAbsoluteUploadPath();

export async function DELETE(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    // Vérifier si c'est une suppression authentifiée ou par token
    const session = await auth();
    const token = request.nextUrl.searchParams.get("token");

    if (!session && !token) {
      return new Response("Non autorisé", { status: 401 });
    }

    // Si un token est fourni, le valider
    if (token) {
      const isValidToken = await validateDeletionToken(params.filename, token);
      if (!isValidToken) {
        return new Response("Token de suppression invalide", { status: 403 });
      }
    }

    const filePath = join(UPLOADS_DIR, params.filename);
    await unlink(filePath);

    // Si le fichier a été supprimé avec succès, supprimer aussi le token
    if (token) {
      await deleteDeletionToken(params.filename);
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Erreur lors de la suppression:", error);
    return new Response("Erreur lors de la suppression", { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const filePath = path.join(UPLOADS_DIR, params.filename);
    
    // Vérifier si le fichier existe
    try {
      await fs.access(filePath);
    } catch {
      return new Response("File not found", { status: 404 });
    }
    
    // Lire et retourner le fichier
    const file = await fs.readFile(filePath);
    
    // Déterminer le type MIME
    const mimeType = getMimeType(params.filename);
    
    return new Response(file, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (error) {
    console.error("Erreur lors de la lecture du fichier:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".zip": "application/zip",
    ".rar": "application/x-rar-compressed",
  };
  
  return mimeTypes[ext] || "application/octet-stream";
}
