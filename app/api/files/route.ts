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

    const files = await readdir(UPLOADS_DIR);
    const filesInfo = await Promise.all(
      files
        .filter((filename) =>
          search ? filename.toLowerCase().includes(search.toLowerCase()) : true
        )
        .map(async (filename) => {
          const filePath = join(UPLOADS_DIR, filename);
          const stats = await stat(filePath);

          return {
            name: filename,
            url: `/uploads/${filename}`,
            size: stats.size,
            createdAt: stats.birthtime.toISOString(),
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
    return new Response("Erreur lors de la récupération des fichiers", {
      status: 500,
    });
  }
}
