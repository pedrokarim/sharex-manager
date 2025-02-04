import { auth } from "@/auth";
import { unlink } from "fs/promises";
import { join } from "path";
import { NextRequest } from "next/server";
import {
  validateDeletionToken,
  deleteDeletionToken,
} from "@/lib/deletion-tokens";
import { getAbsoluteUploadPath } from "@/lib/config";
import { serveFile } from "@/lib/file-handler";

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
  // Sécurisation : on ne prend que le nom du fichier, sans chemin
	const filename = params.filename.replace(/[/\\]/g, "");
	const filePath = join(UPLOADS_DIR, filename);

	return serveFile({
		filePath,
		filename,
		enableLogging: false,
	});
}
