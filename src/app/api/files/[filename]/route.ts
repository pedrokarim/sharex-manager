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
import { isFileSecure, removeFileFromSecure } from "@/lib/secure-files";
import { isTrustedOrigin } from "@/lib/api-guard";
import { canManageFile } from "@/lib/file-ownership";
import { logDb } from "@/lib/utils/db";
import { basename } from "path";
import { existsSync } from "fs";
import { isVideoFile } from "@/lib/media-kind";
import { forgetVideo } from "@/lib/media/video";
import { serveMediaFile } from "@/lib/modules/media-response";

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

    // Une page d'un autre site ne doit pas pouvoir supprimer, ni avec la
    // session de la personne, ni avec un jeton.
    if (!isTrustedOrigin(request.headers.get("origin"))) {
      return Response.json({ error: "Origine refusée" }, { status: 403 });
    }

    const name = safeName(resolvedParams.filename);
    if (!name) return new Response("Fichier introuvable", { status: 404 });

    // Suppression par le lien ShareX (jeton), ou par un compte connecté :
    // le propriétaire du fichier ou un admin.
    const token = request.nextUrl.searchParams.get("token");
    let actor: { userId?: string; userEmail?: string; via: "token" | "session" };
    if (token) {
      if (!(await validateDeletionToken(name, token))) {
        return new Response("Token de suppression invalide", { status: 403 });
      }
      actor = { via: "token" };
    } else {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user) return new Response("Non autorisé", { status: 401 });
      if (!(await canManageFile(session, name))) {
        logDb.createLog({
          level: "warning",
          action: "file.unauthorized",
          message: "Suppression refusée : le fichier appartient à un autre compte",
          userId: session.user.id,
          userEmail: session.user.email ?? undefined,
          metadata: { fileName: name },
        });
        return Response.json({ error: "Seul le propriétaire du fichier ou un admin peut le supprimer" }, { status: 403 });
      }
      actor = { userId: session.user.id, userEmail: session.user.email ?? undefined, via: "session" };
    }

    try {
      await unlink(join(UPLOADS_DIR, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return new Response("Fichier introuvable", { status: 404 });
      }
      throw error;
    }
    await forgetVideo(name);
    await removeFileFromSecure(name);
    await deleteDeletionToken(name);

    logDb.createLog({
      level: "info",
      action: "file.delete",
      message: actor.via === "token" ? "Fichier supprimé par son lien de suppression" : "Suppression d'un fichier",
      userId: actor.userId,
      userEmail: actor.userEmail,
      metadata: { fileName: name, via: actor.via },
    });

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

  const cacheControl = secure ? "private, no-store" : PUBLIC_IMAGE_CACHE;
  if (isVideoFile(filename) && existsSync(filePath)) {
    return serveMediaFile(request, filePath, { cacheControl });
  }

  return serveFile({
    filePath,
    filename,
    enableLogging: false,
    cacheControl,
  });
}
