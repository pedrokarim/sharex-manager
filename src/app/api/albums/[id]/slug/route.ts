import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin, withAuth } from "@/lib/api-guard";
import { albumsDb } from "@/lib/utils/albums-db";
import { logDb } from "@/lib/utils/db";
import type { LogAction } from "@/lib/types/logs";

const IdSchema = z.coerce.number().int().positive();

/**
 * POST /api/albums/[id]/slug – remplace l'adresse publique d'un album par une
 * nouvelle, imprévisible. L'ancien lien cesse aussitôt de fonctionner : c'est
 * le moyen de retirer un lien trop partagé, ou une adresse ancienne tirée du
 * seul nom de l'album. Réservé au propriétaire de l'album et aux admins.
 */
export const POST = withAuth(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }, session) => {
    const parsed = IdSchema.safeParse((await params).id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Album introuvable" }, { status: 404 });
    }
    const albumId = parsed.data;

    const album = albumsDb.getAlbum(albumId);
    if (!album) {
      return NextResponse.json({ error: "Album introuvable" }, { status: 404 });
    }
    if (!isAdmin(session) && album.userId !== session.user.id) {
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }
    if (!album.isPublic) {
      return NextResponse.json({ error: "Cet album est privé : il n'a pas de lien public" }, { status: 409 });
    }

    const updated = albumsDb.regeneratePublicSlug(albumId);
    if (!updated) {
      return NextResponse.json({ error: "Album introuvable" }, { status: 404 });
    }

    logDb.createLog({
      level: "info",
      action: "album.update" as LogAction,
      message: `Nouveau lien public pour l'album "${album.name}"`,
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: { albumId, albumName: album.name },
    });

    return NextResponse.json(updated);
  }
);
