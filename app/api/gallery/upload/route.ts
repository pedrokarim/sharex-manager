import { writeFile } from "fs/promises";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { storeDeletionToken } from "@/lib/deletion-tokens";
import crypto from "crypto";

const UPLOADS_DIR = join(process.cwd(), "public/uploads");
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export async function POST(request: NextRequest) {
  try {
    // Vérifier que l'utilisateur est connecté
    const session = await auth();
    if (!session) {
      return NextResponse.json(
        { error: "Vous devez être connecté pour uploader des fichiers" },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "Aucun fichier fourni" },
        { status: 400 }
      );
    }

    // Vérifier que c'est une image
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
    if (!isImage) {
      return NextResponse.json(
        { error: "Seules les images sont autorisées (JPG, PNG, GIF, WEBP)" },
        { status: 400 }
      );
    }

    // Générer un nom de fichier unique
    const ext = file.name.split(".").pop();
    const uniqueId = crypto.randomBytes(8).toString("hex");
    const fileName = `${uniqueId}.${ext}`;
    const filePath = join(UPLOADS_DIR, fileName);

    // Convertir le File en Buffer et sauvegarder
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Générer et stocker le token de suppression
    const deletionToken = crypto.randomUUID();
    await storeDeletionToken(fileName, deletionToken);

    return NextResponse.json({
      success: true,
      file: {
        url: `${API_URL}/uploads/${fileName}`,
        name: fileName,
        originalName: file.name,
        size: file.size,
        type: file.type,
        deletionToken,
      },
    });
  } catch (error) {
    console.error("Erreur lors de l'upload:", error);
    return NextResponse.json(
      { error: "Une erreur est survenue lors de l'upload" },
      { status: 500 }
    );
  }
}
