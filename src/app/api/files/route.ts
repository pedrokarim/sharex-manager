import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { unlink } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAbsoluteUploadPath } from "@/lib/config";
import { setFileSecure, removeFileFromSecure } from "@/lib/secure-files";
import { galleryQueryFrom, listGalleryFiles } from "@/lib/gallery-listing";
import { summarizeMonths } from "@/lib/timeline";
import type { NextRequest } from "next/server";
import { logger } from "@/lib/utils/logger";
import { basename } from "path";
import { forgetVideo } from "@/lib/media/video";

const UPLOADS_DIR = getAbsoluteUploadPath();
const PAGE_SIZE = 12; // Nombre d'images par page
const MAX_PAGE_SIZE = 60;

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return new Response("Non autorisé", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Number.parseInt(searchParams.get("page") || "1", 10);
    // Les sélecteurs à grille dense demandent plus de 12 vignettes à la fois.
    const pageSize = Math.min(
      Math.max(Number.parseInt(searchParams.get("limit") || "", 10) || PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );

    // Force la revalidation du dossier public/uploads
    revalidatePath("/uploads");

    const query = galleryQueryFrom(searchParams);
    const validFiles = await listGalleryFiles(query);

    // Frise des mois : le nombre de fichiers par mois, sans les fichiers
    // eux-mêmes, pour le rail de défilement et le saut à une date.
    if (searchParams.get("timeline") === "1") {
      const tzOffset = Number.parseInt(searchParams.get("tz") || "0", 10) || 0;
      const months =
        query.sort === "date" ? summarizeMonths(validFiles.map((file) => file.createdAt), tzOffset) : [];
      return NextResponse.json(
        { months, total: validFiles.length, pageSize },
        { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
      );
    }

    // Pagination
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedFiles = validFiles.slice(start, end);
    const hasMore = end < validFiles.length;

    return NextResponse.json(
      {
        files: paginatedFiles,
        hasMore,
        total: validFiles.length,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Erreur lors de la récupération des fichiers:", error);
    return new Response("Erreur lors de la récupération des fichiers", {
      status: 500,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Vérifier que l'utilisateur a un ID et un email
    if (!session.user.id || !session.user.email) {
      return Response.json({ error: "Session invalide" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return Response.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    // Traitement du fichier ici...
    // Exemple : sauvegarde du fichier, génération d'URL, etc.

    await logger.logFileAction("file.upload", "Upload d'un fichier", {
      userId: session.user.id,
      userEmail: session.user.email,
      metadata: {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Erreur lors de l'upload:", error);

    // Si c'est une erreur d'authentification, retourner 401
    if (error instanceof Error && error.message.includes("auth")) {
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }

    return Response.json(
      { error: "Erreur lors de l'upload du fichier" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }

    if (!session.user.id) {
      return Response.json({ error: "Session invalide" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("id");

    // Un nom seul, jamais un chemin : « ../ » sortirait des uploads.
    if (!filename || filename !== basename(filename) || filename.includes("\\") || filename.startsWith(".")) {
      return Response.json(
        { error: "Nom du fichier manquant" },
        { status: 400 }
      );
    }

    const filePath = join(UPLOADS_DIR, filename);

    try {
      // Supprimer le fichier physiquement
      await unlink(filePath);
      await forgetVideo(filename);

      // Retirer le fichier de la liste des fichiers sécurisés s'il y est
      await removeFileFromSecure(filename);

      await logger.logFileAction("file.delete", "Suppression d'un fichier", {
        userId: session.user.id,
        userEmail: session.user.email ?? "unknown",
        metadata: {
          fileName: filename,
        },
      });

      return Response.json({ success: true });
    } catch (error) {
      console.error("Erreur lors de la suppression du fichier:", error);
      return Response.json({ error: "Fichier introuvable" }, { status: 404 });
    }
  } catch (error) {
    console.error("Erreur lors de la suppression:", error);
    return Response.json(
      { error: "Erreur lors de la suppression du fichier" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return new Response("Non autorisé", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filename = searchParams.get("filename");

    if (!filename) {
      return new Response("Nom de fichier manquant", { status: 400 });
    }

    const formData = await request.formData();
    const isSecure = formData.get("isSecure") === "true";

    await setFileSecure(filename, isSecure);

    return NextResponse.json({
      success: true,
      isSecure,
    });
  } catch (error) {
    console.error("Erreur lors de la modification de la sécurité:", error);
    return new Response("Erreur serveur", { status: 500 });
  }
}
