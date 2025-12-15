import { auth } from "@/auth";
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getAbsoluteUploadPath } from "@/lib/config";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new Response("Non autorisé", { status: 401 });
    }

    const { filename } = await params;
    const formData = await request.formData();
    const isSecure = formData.get("isSecure") === "true";

    const sourceDir = isSecure
      ? getAbsoluteUploadPath()
      : path.join(getAbsoluteUploadPath(), "secure");
    const targetDir = isSecure
      ? path.join(getAbsoluteUploadPath(), "secure")
      : getAbsoluteUploadPath();

    const sourcePath = path.join(sourceDir, filename);
    const targetPath = path.join(targetDir, filename);

    // Vérifier si le fichier existe
    try {
      await fs.access(sourcePath);
    } catch {
      return new Response("Fichier non trouvé", { status: 404 });
    }

    // Créer le dossier cible s'il n'existe pas
    await fs.mkdir(targetDir, { recursive: true });

    // Déplacer le fichier
    await fs.rename(sourcePath, targetPath);

    // Construire la nouvelle URL
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
    const newUrl = `${baseUrl}/api/files${
      isSecure ? "/secure" : ""
    }/${filename}`;

    return NextResponse.json({
      success: true,
      url: newUrl,
      isSecure: isSecure,
    });
  } catch (error) {
    console.error("Erreur lors de la modification de la sécurité:", error);
    return new Response("Erreur serveur", { status: 500 });
  }
}
