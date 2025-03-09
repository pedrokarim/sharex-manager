import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  apiModuleManager,
  initApiModuleManager,
} from "@/lib/modules/api-module-manager";
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

    // Initialiser le gestionnaire de modules API
    await initApiModuleManager();

    // Récupérer le fichier ZIP du module
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "Aucun fichier fourni" },
        { status: 400 }
      );
    }

    // Vérifier que c'est un fichier ZIP
    if (!file.name.endsWith(".zip")) {
      return NextResponse.json(
        { error: "Le fichier doit être au format ZIP" },
        { status: 400 }
      );
    }

    // Créer un dossier temporaire pour extraire le ZIP
    const tempDir = path.join(os.tmpdir(), `module-${uuidv4()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // Lire le contenu du fichier
      const buffer = Buffer.from(await file.arrayBuffer());

      // Écrire le fichier ZIP dans le dossier temporaire
      const zipPath = path.join(tempDir, "module.zip");
      fs.writeFileSync(zipPath, buffer);

      // Extraire le ZIP
      const zip = new AdmZip(zipPath);
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
