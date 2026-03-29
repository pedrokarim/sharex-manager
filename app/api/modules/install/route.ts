import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { apiModuleManager } from "@/lib/modules/module-manager.api";
import fs from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import AdmZip from "adm-zip";

export async function POST(request: NextRequest) {
  const session = await auth();
  try {
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    await apiModuleManager.ensureInitialized();

    // Récupérer le fichier ZIP du module
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "Aucun fichier fourni" },
        { status: 400 }
      );
    }

    // Vérifier que c'est un fichier ZIP (extension + magic bytes)
    if (!file.name.endsWith(".zip")) {
      return NextResponse.json(
        { error: "Le fichier doit être au format ZIP" },
        { status: 400 }
      );
    }

    // Lire le contenu du fichier
    const buffer = Buffer.from(await file.arrayBuffer());

    // Vérifier les magic bytes ZIP (PK\x03\x04)
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
      return NextResponse.json(
        { error: "Le fichier n'est pas un ZIP valide" },
        { status: 400 }
      );
    }

    // Limite de taille : 50 MB
    const MAX_ZIP_SIZE = 50 * 1024 * 1024;
    if (buffer.length > MAX_ZIP_SIZE) {
      return NextResponse.json(
        { error: "Le fichier ZIP est trop volumineux (max 50 MB)" },
        { status: 400 }
      );
    }

    // Créer un dossier temporaire pour extraire le ZIP
    const tempDir = path.join(os.tmpdir(), `module-${uuidv4()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // Écrire le fichier ZIP dans le dossier temporaire
      const zipPath = path.join(tempDir, "module.zip");
      fs.writeFileSync(zipPath, buffer);

      // Vérifier les entrées du ZIP avant extraction (protection ZIP bomb + path traversal)
      const zip = new AdmZip(zipPath);
      const MAX_EXTRACTED_SIZE = 100 * 1024 * 1024; // 100 MB max après extraction
      let totalSize = 0;
      for (const entry of zip.getEntries()) {
        // Protection path traversal
        if (entry.entryName.includes("..") || path.isAbsolute(entry.entryName)) {
          return NextResponse.json(
            { error: "Le ZIP contient des chemins invalides" },
            { status: 400 }
          );
        }
        // Protection ZIP bomb
        totalSize += entry.header.size;
        if (totalSize > MAX_EXTRACTED_SIZE) {
          return NextResponse.json(
            { error: "Le ZIP décompressé est trop volumineux (max 100 MB)" },
            { status: 400 }
          );
        }
      }

      zip.extractAllTo(tempDir, true);

      // Supprimer le fichier ZIP
      fs.unlinkSync(zipPath);

      // Installer le module
      const success = await apiModuleManager.installModule(tempDir);

      // Nettoyer le dossier temporaire
      fs.rmSync(tempDir, { recursive: true, force: true });

      if (success) {
        return NextResponse.json({ success: true });
      } else {
        return NextResponse.json(
          { error: "Échec de l'installation du module" },
          { status: 500 }
        );
      }
    } catch (error) {
      // Nettoyer le dossier temporaire en cas d'erreur
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      throw error;
    }
  } catch (error) {
    console.error("Erreur lors de l'installation du module:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'installation du module" },
      { status: 500 }
    );
  }
}
