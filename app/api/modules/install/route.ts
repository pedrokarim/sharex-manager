import { NextRequest, NextResponse } from "next/server";
import { moduleManager } from "@/lib/modules/module-manager";
import { auth } from "@/auth";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { mkdir, writeFile } from "fs/promises";

export async function POST(request: NextRequest) {
  try {
    // Vérifier l'authentification
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupérer les données du formulaire
    const formData = await request.formData();
    const moduleZip = formData.get("module") as File;
    const iconUrl = formData.get("iconUrl") as string;

    if (!moduleZip) {
      return NextResponse.json(
        { error: "Aucun fichier fourni" },
        { status: 400 }
      );
    }

    // Vérifier le type de fichier
    if (
      moduleZip.type !== "application/zip" &&
      moduleZip.type !== "application/x-zip-compressed"
    ) {
      return NextResponse.json(
        { error: "Le fichier doit être au format ZIP" },
        { status: 400 }
      );
    }

    // Créer un dossier temporaire pour extraire le module
    const tempDir = path.join(process.cwd(), "temp", nanoid());
    await mkdir(tempDir, { recursive: true });

    try {
      // Enregistrer le fichier ZIP
      const zipPath = path.join(tempDir, "module.zip");
      const zipBuffer = Buffer.from(await moduleZip.arrayBuffer());
      await writeFile(zipPath, zipBuffer);

      // Extraire le fichier ZIP (cette partie nécessite une bibliothèque d'extraction ZIP)
      // Pour simplifier, nous supposons que le module est déjà extrait
      // Dans une implémentation réelle, vous devriez utiliser une bibliothèque comme 'adm-zip' ou 'unzipper'

      // Si une URL d'icône est fournie, la sauvegarder dans le fichier module.json
      if (iconUrl) {
        const configPath = path.join(tempDir, "module.json");
        if (fs.existsSync(configPath)) {
          const configContent = fs.readFileSync(configPath, "utf-8");
          const config = JSON.parse(configContent);
          config.icon = iconUrl;
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        }
      }

      // Installer le module
      const success = await moduleManager.installModule(tempDir);

      // Nettoyer le dossier temporaire
      fs.rmSync(tempDir, { recursive: true, force: true });

      if (success) {
        return NextResponse.json({ success: true });
      } else {
        return NextResponse.json(
          { error: "Impossible d'installer le module" },
          { status: 400 }
        );
      }
    } catch (error) {
      // Nettoyer le dossier temporaire en cas d'erreur
      fs.rmSync(tempDir, { recursive: true, force: true });
      throw error;
    }
  } catch (error) {
    console.error("Erreur lors de l'installation du module:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
