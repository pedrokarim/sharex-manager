import { auth } from "@/auth";
import { readdir, stat, unlink } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAbsoluteUploadPath } from "@/lib/config";
import {
  getSecureFiles,
  isFileSecure,
  setFileSecure,
  removeFileFromSecure,
} from "@/lib/secure-files";
import { getStarredFiles, isFileStarred } from "@/lib/starred-files";
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
    const secureOnly = searchParams.get("secure") === "true";
    const starredOnly = searchParams.get("starred") === "true";
    const sort = searchParams.get("sort") || "date"; // name | date | size
    const order = searchParams.get("order") || "desc"; // asc | desc
    const startDate = searchParams.get("start");
    const endDate = searchParams.get("end");

    // Force la revalidation du dossier public/uploads
    revalidatePath("/uploads");

    // Récupérer tous les fichiers et leurs stats
    const entries = await readdir(UPLOADS_DIR, { withFileTypes: true });
    const secureFiles = await getSecureFiles();
    const starredFiles = await getStarredFiles();

    const filesInfo = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .filter((entry) =>
          search
            ? entry.name.toLowerCase().includes(search.toLowerCase())
            : true
        )
        .map(async (entry) => {
          const filePath = join(UPLOADS_DIR, entry.name);
          const stats = await stat(filePath);
          const isSecure = secureFiles.includes(entry.name);
          const isStarred = starredFiles.includes(entry.name);

          // Si on veut uniquement les fichiers sécurisés et que ce fichier n'est pas sécurisé, on le saute
          if (secureOnly && !isSecure) {
            return null;
          }

          // Si on veut uniquement les fichiers favoris et que ce fichier n'est pas favori, on le saute
          if (starredOnly && !isStarred) {
            return null;
          }

          return {
            name: entry.name,
            url: `/api/files/${entry.name}`,
            size: stats.size,
            createdAt: stats.mtime.toISOString(),
            isSecure,
            isStarred,
          };
        })
    );

    // Filtrer les fichiers null (ceux qui ont été sautés)
    let validFiles = filesInfo.filter(
      (file): file is NonNullable<typeof file> => file !== null
    );

    // Filtrer par plage de dates
    if (startDate) {
      const start = new Date(startDate).getTime();
      validFiles = validFiles.filter(
        (file) => new Date(file.createdAt).getTime() >= start
      );
    }
    if (endDate) {
      const end = new Date(endDate).getTime();
      validFiles = validFiles.filter(
        (file) => new Date(file.createdAt).getTime() <= end
      );
    }

    // Tri dynamique
    validFiles.sort((a, b) => {
      let comparison = 0;
      switch (sort) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "size":
          comparison = a.size - b.size;
          break;
        case "date":
        default:
          comparison =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return order === "asc" ? comparison : -comparison;
    });

    // Pagination
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const paginatedFiles = validFiles.slice(start, end);
    const hasMore = end < validFiles.length;

    return NextResponse.json({
      files: paginatedFiles,
      hasMore,
      total: validFiles.length,
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
    const session = await auth();

    if (!session?.user) {
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }

    if (!session.user.id) {
      return Response.json({ error: "Session invalide" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("id");

    if (!filename) {
      return Response.json(
        { error: "Nom du fichier manquant" },
        { status: 400 }
      );
    }

    const filePath = join(UPLOADS_DIR, filename);

    try {
      // Supprimer le fichier physiquement
      await unlink(filePath);

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
    const session = await auth();
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
