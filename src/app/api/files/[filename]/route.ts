import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { unlink } from "fs/promises";
import { join } from "path";
import { NextRequest } from "next/server";
import {
  validateDeletionToken,
  deleteDeletionToken,
} from "@/lib/deletion-tokens";
import { getAbsoluteUploadPath } from "@/lib/config";
import { PUBLIC_IMAGE_CACHE, serveFile } from "@/lib/file-handler";
import { isFileSecure } from "@/lib/secure-files";
import { basename } from "path";

/** Nom de fichier seul : le paramètre est décodé, « %2F.. » y devient un chemin. */
function safeName(value: string): string | null {
  return value && value === basename(value) && !value.includes("\\") && !value.startsWith(".") ? value : null;
}

const UPLOADS_DIR = getAbsoluteUploadPath();

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const resolvedParams = await params;

    // Vérifier si c'est une suppression authentifiée ou par token
    const session = await auth.api.getSession({ headers: await headers() });
    const token = request.nextUrl.searchParams.get("token");

    if (!session && !token) {
      return new Response("Non autorisé", { status: 401 });
    }

    // Si un token est fourni, le valider
    if (token) {
      const isValidToken = await validateDeletionToken(resolvedParams.filename, token);
      if (!isValidToken) {
        return new Response("Token de suppression invalide", { status: 403 });
      }
    }

    const name = safeName(resolvedParams.filename);
    if (!name) return new Response("Fichier introuvable", { status: 404 });
    const filePath = join(UPLOADS_DIR, name);
    await unlink(filePath);

    // Si le fichier a été supprimé avec succès, supprimer aussi le token
    if (token) {
      await deleteDeletionToken(resolvedParams.filename);
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Erreur lors de la suppression:", error);
    return new Response("Erreur lors de la suppression", { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const resolvedParams = await params;

  const filename = safeName(resolvedParams.filename);
  if (!filename) return new Response("Fichier introuvable", { status: 404 });
  const filePath = join(UPLOADS_DIR, filename);

  // Les captures sont publiques par défaut ; celles marquées privées ne se
  // servent qu'à une session, comme sur le domaine d'images.
  const secure = await isFileSecure(filename);
  if (secure) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return new Response("Fichier introuvable", { status: 404 });
  }

  return serveFile({
    filePath,
    filename,
    enableLogging: false,
    cacheControl: secure ? "private, no-store" : PUBLIC_IMAGE_CACHE,
  });
}
