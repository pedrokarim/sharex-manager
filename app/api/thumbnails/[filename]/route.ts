import { join } from "path";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { getAbsoluteUploadPath } from "@/lib/config";

const UPLOADS_DIR = getAbsoluteUploadPath();
const THUMBNAIL_SIZE = 300;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const filePath = join(UPLOADS_DIR, filename);

    // Vérifier si le fichier existe
    try {
      await stat(filePath);
    } catch {
      return new Response("Fichier non trouvé", { status: 404 });
    }

    // Vérifier si c'est une image
    if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(filename)) {
      return new Response("Ce fichier n'est pas une image", { status: 400 });
    }

    // Créer un stream de l'image d'origine
    const imageStream = createReadStream(filePath);

    // Générer la miniature
    const transform = sharp()
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 });

    // Pipe l'image à travers sharp
    const thumbnailStream = imageStream.pipe(transform);

    return new Response(thumbnailStream as any, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (error) {
    console.error("Erreur lors de la génération de la miniature:", error);
    return new Response("Erreur lors de la génération de la miniature", {
      status: 500,
    });
  }
}
