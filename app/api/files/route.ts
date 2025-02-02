import { auth } from "@/auth";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

const UPLOADS_DIR = join(process.cwd(), "public/uploads");
const PAGE_SIZE = 12; // Nombre d'images par page

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return new Response("Non autorisé", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const search = searchParams.get("q") || "";

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
            url: `/uploads/${entry.name}`,
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
