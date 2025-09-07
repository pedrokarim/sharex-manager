import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { albumsDb } from "@/lib/utils/albums-db";
import { logDb } from "@/lib/utils/db";
import { LogAction } from "@/lib/types/logs";
import { z } from "zod";

const CreateAlbumSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

const SearchSchema = z
  .object({
    q: z.string().nullish(),
    limit: z.string().nullish().default("50"),
    offset: z.string().nullish().default("0"),
  })
  .transform((data) => ({
    q: data.q || undefined,
    limit: Math.min(Math.max(parseInt(data.limit || "50", 10) || 50, 1), 100),
    offset: Math.max(parseInt(data.offset || "0", 10) || 0, 0),
  }));

// GET /api/albums - Récupérer tous les albums
export async function GET(request: NextRequest) {
  const session = await auth();

  try {
    if (!session?.user) {
      logDb.createLog({
        level: "warning",
        action: "album.list" as LogAction,
        message: "Tentative d'accès non autorisé aux albums",
        userId: undefined,
        userEmail: undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const url = new URL(request.url);
    const rawParams = {
      q: url.searchParams.get("q"),
      limit: url.searchParams.get("limit"),
      offset: url.searchParams.get("offset"),
    };

    const searchParams = SearchSchema.parse(rawParams);

    let albums;
    const userId = session.user?.id || undefined;

    try {
      if (searchParams.q) {
        albums = albumsDb.searchAlbums(searchParams.q, userId);
      } else {
        albums = albumsDb.getAlbums(userId);
      }
    } catch (dbError) {
      console.error("Database error:", dbError);
      logDb.createLog({
        level: "error",
        action: "system.error" as LogAction,
        message: "Erreur de base de données lors de la récupération des albums",
        userId: userId,
        userEmail: session.user?.email || undefined,
        metadata: {
          error:
            dbError instanceof Error
              ? dbError.message
              : "Unknown database error",
          userId: userId,
        },
      });
      throw dbError;
    }

    // Pagination
    const startIndex = searchParams.offset;
    const endIndex = startIndex + searchParams.limit;
    const paginatedAlbums = albums.slice(startIndex, endIndex);

    const hasMore = endIndex < albums.length;

    logDb.createLog({
      level: "info",
      action: "album.list" as LogAction,
      message: `Récupération de ${paginatedAlbums.length} album(s)`,
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        count: paginatedAlbums.length,
        hasSearch: !!searchParams.q,
      },
    });

    return NextResponse.json({
      albums: paginatedAlbums,
      hasMore,
      total: albums.length,
    });
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error" as LogAction,
      message: "Erreur lors de la récupération des albums",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Paramètres invalides" },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST /api/albums - Créer un nouvel album
export async function POST(request: NextRequest) {
  const session = await auth();

  try {
    if (!session?.user) {
      logDb.createLog({
        level: "warning",
        action: "album.create" as LogAction,
        message: "Tentative de création d'album non autorisée",
        userId: undefined,
        userEmail: undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description } = CreateAlbumSchema.parse(body);

    const album = albumsDb.createAlbum({
      name,
      description,
      userId: session.user.id || undefined,
    });

    logDb.createLog({
      level: "info",
      action: "album.create" as LogAction,
      message: `Création de l'album "${name}"`,
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        albumId: album.id,
        albumName: name,
      },
    });

    return NextResponse.json(album, { status: 201 });
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error" as LogAction,
      message: "Erreur lors de la création de l'album",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Données invalides", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
