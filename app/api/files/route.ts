import { auth } from "@/auth";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAbsoluteUploadPath } from "@/lib/config";
import type { NextRequest } from "next/server";
import { logger } from "@/lib/utils/logger";

const UPLOADS_DIR = getAbsoluteUploadPath();
const PAGE_SIZE = 12; // Nombre d'images par page

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return new Response("Non autorisé", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Number.parseInt(searchParams.get("page") || "1", 10);
    const search = searchParams.get("q") || "";

    // Force la revalidation du dossier public/uploads
    revalidatePath("/uploads");

    // Récupérer tous les fichiers et leurs stats
    const entries = await readdir(UPLOADS_DIR, { withFileTypes: true });
    const filesInfo = await Promise.all(
      entries
        // Ne garder que les fichiers (pas les dossiers)
        .filter((entry) => entry.isFile())
        // Filtrer par la recherche si nécessaire
        .filter((entry) =>
          search
            ? entry.name.toLowerCase().includes(search.toLowerCase())
            : true
        )
        .map(async (entry) => {
          const filePath = join(UPLOADS_DIR, entry.name);
          const stats = await stat(filePath);

          // Utiliser mtime au lieu de birthtime car plus fiable dans Docker
          const fileDate = stats.mtime;

          return {
            name: entry.name,
            url: `/api/files/${entry.name}`,
            size: stats.size,
            createdAt: fileDate.toISOString(),
          };
        })
    );

    // Trier par date de création décroissante
    filesInfo.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Pagination
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const paginatedFiles = filesInfo.slice(start, end);
    const hasMore = end < filesInfo.length;

    return NextResponse.json({
      files: paginatedFiles,
      hasMore,
      total: filesInfo.length,
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des fichiers:", error);
    return new Response("Erreur lors de la récupération des fichiers", {
      status: 500,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();

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
    return Response.json(
      { error: "Erreur lors de l'upload du fichier" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Vérifier que l'utilisateur a un ID et un email
    if (!session.user.id || !session.user.email) {
      return Response.json({ error: "Session invalide" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get("id");

    if (!fileId) {
      return Response.json(
        { error: "ID du fichier manquant" },
        { status: 400 }
      );
    }

    // Suppression du fichier ici...
    // Exemple : suppression physique, mise à jour de la base de données, etc.

    await logger.logFileAction("file.delete", "Suppression d'un fichier", {
      userId: session.user.id,
      userEmail: session.user.email,
      metadata: {
        fileId,
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Erreur lors de la suppression:", error);
    return Response.json(
      { error: "Erreur lors de la suppression du fichier" },
      { status: 500 }
    );
  }
}
