import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { albumsDb } from "@/lib/utils/albums-db";
import { logDb } from "@/lib/utils/db";
import { LogAction } from "@/lib/types/logs";
import { z } from "zod";

const IdSchema = z.coerce.number().int().positive();

const FileNamesSchema = z.object({
  fileNames: z.array(z.string().min(1)).min(1).max(50), // Max 50 fichiers par opération
});

// GET /api/albums/[id]/files - Récupérer les fichiers d'un album
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();

  try {
    if (!session?.user) {
      logDb.createLog({
        level: "warning",
        action: "album.files.list" as LogAction,
        message: "Tentative d'accès non autorisé aux fichiers d'un album",
        userId: undefined,
        userEmail: undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const albumId = IdSchema.parse(params.id);
    const album = albumsDb.getAlbum(albumId);

    if (!album) {
      return NextResponse.json({ error: "Album introuvable" }, { status: 404 });
    }

    // Vérifier les permissions
    if (album.userId && album.userId !== session.user.id) {
      logDb.createLog({
        level: "warning",
        action: "album.files.list" as LogAction,
        message: `Tentative d'accès non autorisé aux fichiers de l'album ${albumId}`,
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: { albumId, ownerId: album.userId },
      });
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    const files = albumsDb.getAlbumFiles(albumId);

    logDb.createLog({
      level: "info",
      action: "album.files.list" as LogAction,
      message: `Récupération des fichiers de l'album "${album.name}"`,
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        albumId,
        albumName: album.name,
        fileCount: files.length,
      },
    });

    return NextResponse.json({ files });
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error" as LogAction,
      message: "Erreur lors de la récupération des fichiers de l'album",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
        albumId: params.id,
      },
    });

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "ID invalide" }, { status: 400 });
    }

    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST /api/albums/[id]/files - Ajouter des fichiers à un album
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();

  try {
    if (!session?.user) {
      logDb.createLog({
        level: "warning",
        action: "album.files.add" as LogAction,
        message: "Tentative d'ajout de fichiers non autorisée",
        userId: undefined,
        userEmail: undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const albumId = IdSchema.parse(params.id);
    const body = await request.json();
    const { fileNames } = FileNamesSchema.parse(body);

    // Vérifier que l'album existe
    const album = albumsDb.getAlbum(albumId);
    if (!album) {
      return NextResponse.json({ error: "Album introuvable" }, { status: 404 });
    }

    // Vérifier les permissions
    if (album.userId && album.userId !== session.user.id) {
      logDb.createLog({
        level: "warning",
        action: "album.files.add" as LogAction,
        message: `Tentative d'ajout de fichiers non autorisée à l'album ${albumId}`,
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: { albumId, ownerId: album.userId },
      });
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    // TODO: Ici, on pourrait vérifier que les fichiers existent réellement
    // en consultant le système de fichiers ou une base de données

    const addedFiles = albumsDb.addFilesToAlbum(albumId, fileNames);

    logDb.createLog({
      level: "info",
      action: "album.files.add" as LogAction,
      message: `Ajout de ${addedFiles.length} fichier(s) à l'album "${album.name}"`,
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        albumId,
        albumName: album.name,
        addedCount: addedFiles.length,
        totalRequested: fileNames.length,
        fileNames: fileNames.slice(0, 10), // Limiter le log aux 10 premiers
      },
    });

    // Récupérer l'album mis à jour avec le nouveau compteur
    const updatedAlbum = albumsDb.getAlbum(albumId);

    return NextResponse.json({
      success: true,
      addedFiles,
      album: updatedAlbum,
      message: `${addedFiles.length} fichier(s) ajouté(s) à l'album`,
    });
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error" as LogAction,
      message: "Erreur lors de l'ajout de fichiers à l'album",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
        albumId: params.id,
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

// DELETE /api/albums/[id]/files - Retirer des fichiers d'un album
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();

  try {
    if (!session?.user) {
      logDb.createLog({
        level: "warning",
        action: "album.files.remove" as LogAction,
        message: "Tentative de suppression de fichiers non autorisée",
        userId: undefined,
        userEmail: undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const albumId = IdSchema.parse(params.id);
    const body = await request.json();
    const { fileNames } = FileNamesSchema.parse(body);

    // Vérifier que l'album existe
    const album = albumsDb.getAlbum(albumId);
    if (!album) {
      return NextResponse.json({ error: "Album introuvable" }, { status: 404 });
    }

    // Vérifier les permissions
    if (album.userId && album.userId !== session.user.id) {
      logDb.createLog({
        level: "warning",
        action: "album.files.remove" as LogAction,
        message: `Tentative de suppression de fichiers non autorisée de l'album ${albumId}`,
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: { albumId, ownerId: album.userId },
      });
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    const success = albumsDb.removeFilesFromAlbum(albumId, fileNames);

    if (!success) {
      return NextResponse.json(
        { error: "Aucun fichier trouvé à supprimer" },
        { status: 404 }
      );
    }

    logDb.createLog({
      level: "info",
      action: "album.files.remove" as LogAction,
      message: `Suppression de fichiers de l'album "${album.name}"`,
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        albumId,
        albumName: album.name,
        fileCount: fileNames.length,
        fileNames: fileNames.slice(0, 10), // Limiter le log aux 10 premiers
      },
    });

    // Récupérer l'album mis à jour avec le nouveau compteur
    const updatedAlbum = albumsDb.getAlbum(albumId);

    return NextResponse.json({
      success: true,
      album: updatedAlbum,
      message: `${fileNames.length} fichier(s) retiré(s) de l'album`,
    });
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error" as LogAction,
      message: "Erreur lors de la suppression de fichiers de l'album",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
        albumId: params.id,
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
