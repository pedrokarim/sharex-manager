import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { readFileSync } from "fs";
import { join } from "path";
import { getSkinDataForRendering } from "@/lib/minecraft/skin-utils";

export async function GET(request: NextRequest) {
  let browser;

  try {
    // Récupérer les paramètres de l'URL
    const { searchParams } = new URL(request.url);
    const model = searchParams.get("model") || "classic";
    const player = searchParams.get("player") || "pedrokarim64";

    // Valider le modèle
    const validModels = ["classic", "slim"];
    const modelType = validModels.includes(model) ? model : "classic";

    console.log(
      `Rendu skin Minecraft pour ${player} avec modèle ${modelType}...`
    );

    // Récupérer les données du skin côté serveur
    const skinData = await getSkinDataForRendering(player);
    if (!skinData) {
      return NextResponse.json(
        {
          error: true,
          message: "Impossible de récupérer les données du skin",
          details: `Joueur ${player} non trouvé ou skin indisponible`,
        },
        { status: 404 }
      );
    }

    console.log(
      `Skin récupéré: UUID=${skinData.uuid}, Slim=${skinData.isSlim}`
    );

    // Lancer Puppeteer en mode visible pour debug
    browser = await puppeteer.launch({
      headless: false, // Mode visible pour voir ce qui se passe
      devtools: true, // Ouvrir les DevTools automatiquement
      slowMo: 100, // Ralentir les actions pour mieux voir
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--enable-webgl",
        "--enable-accelerated-2d-canvas",
        "--enable-gpu-rasterization",
        "--enable-zero-copy",
        "--ignore-gpu-blacklist",
        "--ignore-gpu-blocklist",
        "--window-size=1000,800", // Taille de fenêtre fixe
      ],
    });

    const page = await browser.newPage();

    // Définir la taille de la page
    await page.setViewport({ width: 800, height: 600 });

    // Lire le fichier HTML, le script NameMC et Three.js
    const htmlTemplate = readFileSync(
      join(process.cwd(), "lib/namemc-scripts/skin-renderer.html"),
      "utf-8"
    );

    const namemcScript = readFileSync(
      join(process.cwd(), "lib/namemc-scripts/test.js"),
      "utf-8"
    );

    const threeJsScript = readFileSync(
      join(process.cwd(), "lib/namemc-scripts/three.min.js"),
      "utf-8"
    );

    // Injecter Three.js et le script NameMC dans le HTML
    let htmlContent = htmlTemplate.replace(
      "<!-- INJECT-THREEJS -->",
      threeJsScript
    );

    htmlContent = htmlContent.replace(
      "<!-- INJECT-NAMEMC-SCRIPT -->",
      namemcScript
    );

    // Injecter les paramètres et données du skin
    htmlContent = htmlContent.replace(
      "let modelType = 'classic'; // Sera injecté par la route",
      `let modelType = '${modelType}';`
    );

    htmlContent = htmlContent.replace(
      "const playerSkin = { uuid: 'placeholder', base64: 'placeholder' }; // Sera remplacé par la route",
      `const playerSkin = { uuid: '${skinData.uuid}', base64: '${skinData.base64}' };`
    );

    // Charger le contenu HTML
    await page.setContent(htmlContent);

    // Attendre que le rendu soit terminé
    await page.waitForFunction(
      () => {
        const canvas = document.getElementById("skinCanvas");
        return canvas && canvas.getAttribute("data-time") !== null;
      },
      { timeout: 30000 }
    );

    // Attendre un peu pour que le rendu se stabilise
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Prendre une capture d'écran
    const screenshot = await page.screenshot({
      type: "png",
      fullPage: true,
    });

    console.log("Rendu skin Minecraft avec Puppeteer terminé avec succès !");
    console.log(
      "Le navigateur reste ouvert pour que tu puisses voir le résultat..."
    );

    return new Response(screenshot as any, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Erreur avec Puppeteer skin Minecraft:", error);
    return NextResponse.json(
      {
        error: true,
        message: "Erreur Puppeteer skin Minecraft",
        details: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 }
    );
  } finally {
    // En mode debug, on ne ferme pas automatiquement le navigateur
    // Tu peux le fermer manuellement quand tu as fini de regarder
    // if (browser) {
    //   await browser.close();
    // }
  }
}
