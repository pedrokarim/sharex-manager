import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { albumsDb } from "@/lib/utils/albums-db";
import { logDb } from "@/lib/utils/db";
import { LogAction } from "@/lib/types/logs";
import { z } from "zod";

const UpdateAlbumSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  thumbnailFile: z.string().optional(),
  isPublic: z.boolean().optional(),
});

const IdSchema = z.coerce.number().int().positive();

// GET /api/albums/[id] - Récupérer un album spécifique
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  try {
    if (!session?.user) {
      logDb.createLog({
        level: "warning",
        action: "album.get" as LogAction,
        message: "Tentative d'accès non autorisé à un album",
        userId: undefined,
        userEmail: undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;
    const albumId = IdSchema.parse(id);
    const album = albumsDb.getAlbum(albumId);

    if (!album) {
      logDb.createLog({
        level: "warning",
        action: "album.get" as LogAction,
        message: `Tentative d'accès à un album inexistant: ${albumId}`,
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: { albumId },
      });
      return NextResponse.json({ error: "Album introuvable" }, { status: 404 });
    }

    // Vérifier les permissions (pour le multi-utilisateur futur)
    if (album.userId && album.userId !== session.user.id) {
      logDb.createLog({
        level: "warning",
        action: "album.get" as LogAction,
        message: `Tentative d'accès non autorisé à l'album ${albumId}`,
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: { albumId, ownerId: album.userId },
      });
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    // Récupérer les fichiers de l'album
    const files = albumsDb.getAlbumFiles(albumId);

    logDb.createLog({
      level: "info",
      action: "album.get" as LogAction,
      message: `Accès à l'album "${album.name}"`,
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        albumId,
        albumName: album.name,
        fileCount: files.length,
      },
    });

    return NextResponse.json({
      ...album,
      files,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error(
      "Erreur lors de la récupération de l'album:",
      errorMessage,
      errorStack
    );

    logDb.createLog({
      level: "error",
      action: "system.error" as LogAction,
      message: "Erreur lors de la récupération de l'album",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: errorMessage,
        stack: errorStack,
        albumId: (await params).id,
      },
    });

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "ID invalide", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "Erreur serveur",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

// PUT /api/albums/[id] - Modifier un album
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  try {
    if (!session?.user) {
      logDb.createLog({
        level: "warning",
        action: "album.update" as LogAction,
        message: "Tentative de modification d'album non autorisée",
        userId: undefined,
        userEmail: undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;
    const albumId = IdSchema.parse(id);
    const body = await request.json();
    const updates = UpdateAlbumSchema.parse(body);

    // Vérifier que l'album existe
    const existingAlbum = albumsDb.getAlbum(albumId);
    if (!existingAlbum) {
      return NextResponse.json({ error: "Album introuvable" }, { status: 404 });
    }

    // Vérifier les permissions
    if (existingAlbum.userId && existingAlbum.userId !== session.user.id) {
      logDb.createLog({
        level: "warning",
        action: "album.update" as LogAction,
        message: `Tentative de modification non autorisée de l'album ${albumId}`,
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: { albumId, ownerId: existingAlbum.userId },
      });
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    // Gérer la visibilité publique
    const finalUpdates = { ...updates };
    if (updates.isPublic !== undefined) {
      if (updates.isPublic && !existingAlbum.publicSlug) {
        // Générer un slug unique si l'album devient public
        finalUpdates.publicSlug = albumsDb.generateUniqueSlug(
          existingAlbum.name,
          albumId
        );
      } else if (!updates.isPublic) {
        // Supprimer le slug si l'album devient privé
        finalUpdates.publicSlug = undefined;
      }
    }

    const updatedAlbum = albumsDb.updateAlbum(albumId, finalUpdates);

    if (!updatedAlbum) {
      return NextResponse.json(
        { error: "Erreur lors de la mise à jour" },
        { status: 500 }
      );
    }

    logDb.createLog({
      level: "info",
      action: "album.update" as LogAction,
      message: `Modification de l'album "${updatedAlbum.name}"`,
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        albumId,
        albumName: updatedAlbum.name,
        updates: Object.keys(updates),
      },
    });

    return NextResponse.json(updatedAlbum);
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error" as LogAction,
      message: "Erreur lors de la modification de l'album",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
        albumId: (await params).id,
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

// DELETE /api/albums/[id] - Supprimer un album
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  try {
    if (!session?.user) {
      logDb.createLog({
        level: "warning",
        action: "album.delete" as LogAction,
        message: "Tentative de suppression d'album non autorisée",
        userId: undefined,
        userEmail: undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;
    const albumId = IdSchema.parse(id);

    // Vérifier que l'album existe
    const existingAlbum = albumsDb.getAlbum(albumId);
    if (!existingAlbum) {
      return NextResponse.json({ error: "Album introuvable" }, { status: 404 });
    }

    // Vérifier les permissions
    if (existingAlbum.userId && existingAlbum.userId !== session.user.id) {
      logDb.createLog({
        level: "warning",
        action: "album.delete" as LogAction,
        message: `Tentative de suppression non autorisée de l'album ${albumId}`,
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: { albumId, ownerId: existingAlbum.userId },
      });
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    const success = albumsDb.deleteAlbum(albumId);

    if (!success) {
      return NextResponse.json(
        { error: "Erreur lors de la suppression" },
        { status: 500 }
      );
    }

    logDb.createLog({
      level: "info",
      action: "album.delete" as LogAction,
      message: `Suppression de l'album "${existingAlbum.name}"`,
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        albumId,
        albumName: existingAlbum.name,
        fileCount: existingAlbum.fileCount,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error" as LogAction,
      message: "Erreur lors de la suppression de l'album",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
        albumId: (await params).id,
      },
    });

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "ID invalide" }, { status: 400 });
    }

    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
