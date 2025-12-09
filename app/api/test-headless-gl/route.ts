import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { unlinkSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

const execAsync = promisify(exec);

export async function GET(request: NextRequest) {
  let tempImagePath = "";

  try {
    console.log("Test rendu Three.js avec gl via script Node.js...");

    // Récupérer les paramètres de la requête
    const { searchParams } = new URL(request.url);
    const playerName = searchParams.get("player") || "pedrokarim64";
    const modelType = searchParams.get("model") || "default";
    const width = parseInt(searchParams.get("width") || "400");
    const height = parseInt(searchParams.get("height") || "600");

    // Validation des paramètres
    if (width < 100 || width > 2000 || height < 100 || height > 2000) {
      return NextResponse.json(
        { error: true, message: "Dimensions invalides" },
        { status: 400 }
      );
    }

    // Générer un nom de fichier temporaire unique
    const tempId = randomUUID();
    tempImagePath = join(process.cwd(), `temp-image-${tempId}.png`);

    // Chemin vers le script fixe
    const scriptPath = join(process.cwd(), "scripts", "render-skin.js");

    // Construire la commande avec les arguments (utiliser npx pour contourner Bun)
    const command = `npx node "${scriptPath}" --player="${sanitizeInput(
      playerName
    )}" --model="${sanitizeInput(
      modelType
    )}" --width=${width} --height=${height} --output="${tempImagePath}"`;

    console.log(`Exécution de la commande: ${command}`);

    // Exécuter le script Node.js
    const { stdout, stderr } = await execAsync(command);

    if (stderr) {
      console.error("Erreur d'exécution:", stderr);
      throw new Error(`Erreur d'exécution: ${stderr}`);
    }

    console.log("Sortie du script:", stdout);

    // Vérifier que l'image a été générée
    if (!existsSync(tempImagePath)) {
      throw new Error("L'image n'a pas été générée");
    }

    // Lire l'image générée
    const imageBuffer = readFileSync(tempImagePath);

    console.log("Rendu Three.js avec gl terminé avec succès !");

    return new Response(imageBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Erreur avec gl:", error);
    return NextResponse.json(
      {
        error: true,
        message: "Erreur gl",
        details: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 }
    );
  } finally {
    // Nettoyer le fichier temporaire
    try {
      if (tempImagePath && existsSync(tempImagePath)) {
        unlinkSync(tempImagePath);
        console.log(`Image temporaire supprimée: ${tempImagePath}`);
      }
    } catch (cleanupError) {
      console.error("Erreur lors du nettoyage:", cleanupError);
    }
  }
}

// Fonction pour sécuriser les entrées utilisateur
function sanitizeInput(input: string): string {
  // Supprimer les caractères dangereux
  return input
    .replace(/[<>:"/\\|?*]/g, "") // Caractères de fichiers interdits
    .replace(/[;|&$`]/g, "") // Caractères de commande dangereux
    .substring(0, 50); // Limiter la longueur
}
