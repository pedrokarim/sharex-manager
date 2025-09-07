import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { albumsDb } from "@/lib/utils/albums-db";
import { logDb } from "@/lib/utils/db";
import { LogAction } from "@/lib/types/logs";
import { z } from "zod";

const BatchAddToAlbumSchema = z.object({
  albumId: z.number().int().positive(),
  fileNames: z.array(z.string().min(1)).min(1).max(50),
});

const BatchRemoveFromAlbumsSchema = z.object({
  fileNames: z.array(z.string().min(1)).min(1).max(50),
  albumIds: z.array(z.number().int().positive()).optional(), // Si non fourni, retire de tous les albums
});

const BatchActionSchema = z.object({
  action: z.enum(["add_to_album", "remove_from_albums"]),
});

// POST /api/files/batch - Opérations en lot sur les fichiers
export async function POST(request: NextRequest) {
  const session = await auth();

  try {
    if (!session?.user) {
      logDb.createLog({
        level: "warning",
        action: "files.batch" as LogAction,
        message: "Tentative d'opération en lot non autorisée",
        userId: undefined,
        userEmail: undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = BatchActionSchema.parse(body);

    switch (action) {
      case "add_to_album": {
        const { albumId, fileNames } = BatchAddToAlbumSchema.parse(body);

        // Vérifier que l'album existe et appartient à l'utilisateur
        const album = albumsDb.getAlbum(albumId);
        if (!album) {
          return NextResponse.json(
            { error: "Album introuvable" },
            { status: 404 }
          );
        }

        if (album.userId && album.userId !== session.user.id) {
          logDb.createLog({
            level: "warning",
            action: "files.batch" as LogAction,
            message: `Tentative d'ajout en lot non autorisée à l'album ${albumId}`,
            userId: session.user.id || undefined,
            userEmail: session.user.email || undefined,
            metadata: { albumId, ownerId: album.userId },
          });
          return NextResponse.json(
            { error: "Accès interdit" },
            { status: 403 }
          );
        }

        const addedFiles = albumsDb.addFilesToAlbum(albumId, fileNames);

        logDb.createLog({
          level: "info",
          action: "files.batch" as LogAction,
          message: `Ajout en lot de ${addedFiles.length} fichier(s) à l'album "${album.name}"`,
          userId: session.user.id || undefined,
          userEmail: session.user.email || undefined,
          metadata: {
            action: "add_to_album",
            albumId,
            albumName: album.name,
            addedCount: addedFiles.length,
            totalRequested: fileNames.length,
          },
        });

        // Récupérer l'album mis à jour
        const updatedAlbum = albumsDb.getAlbum(albumId);

        return NextResponse.json({
          success: true,
          action: "add_to_album",
          addedFiles,
          album: updatedAlbum,
          message: `${addedFiles.length} fichier(s) ajouté(s) à l'album "${album.name}"`,
        });
      }

      case "remove_from_albums": {
        const { fileNames, albumIds } = BatchRemoveFromAlbumsSchema.parse(body);

        if (albumIds && albumIds.length > 0) {
          // Retirer de albums spécifiques
          let totalRemoved = 0;
          const results: Array<{
            albumId: number;
            albumName: string;
            removed: boolean;
          }> = [];

          for (const albumId of albumIds) {
            const album = albumsDb.getAlbum(albumId);
            if (!album) {
              results.push({
                albumId,
                albumName: "Introuvable",
                removed: false,
              });
              continue;
            }

            // Vérifier les permissions
            if (album.userId && album.userId !== session.user.id) {
              results.push({ albumId, albumName: album.name, removed: false });
              continue;
            }

            const success = albumsDb.removeFilesFromAlbum(albumId, fileNames);
            results.push({ albumId, albumName: album.name, removed: success });
            if (success) totalRemoved++;
          }

          logDb.createLog({
            level: "info",
            action: "files.batch" as LogAction,
            message: `Suppression en lot de fichiers de ${totalRemoved} album(s)`,
            userId: session.user.id || undefined,
            userEmail: session.user.email || undefined,
            metadata: {
              action: "remove_from_albums",
              fileCount: fileNames.length,
              albumsProcessed: albumIds.length,
              albumsModified: totalRemoved,
            },
          });

          return NextResponse.json({
            success: true,
            action: "remove_from_albums",
            results,
            totalRemoved,
            message: `Fichiers retirés de ${totalRemoved} album(s)`,
          });
        } else {
          // Retirer de tous les albums
          let totalRemoved = 0;
          for (const fileName of fileNames) {
            const removed = albumsDb.removeFileFromAllAlbums(fileName);
            if (removed) totalRemoved++;
          }

          logDb.createLog({
            level: "info",
            action: "files.batch" as LogAction,
            message: `Suppression en lot de ${fileNames.length} fichier(s) de tous les albums`,
            userId: session.user.id || undefined,
            userEmail: session.user.email || undefined,
            metadata: {
              action: "remove_from_albums",
              fileCount: fileNames.length,
              filesRemoved: totalRemoved,
            },
          });

          return NextResponse.json({
            success: true,
            action: "remove_from_albums",
            filesRemoved: totalRemoved,
            message: `${totalRemoved} fichier(s) retiré(s) de tous les albums`,
          });
        }
      }

      default:
        return NextResponse.json(
          { error: "Action non supportée" },
          { status: 400 }
        );
    }
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error" as LogAction,
      message: "Erreur lors de l'opération en lot sur les fichiers",
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
