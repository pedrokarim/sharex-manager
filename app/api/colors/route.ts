import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { logDb } from "@/lib/utils/db";
import {
  validateApiKeyForColorExtraction,
  extractApiKeyFromFormData,
} from "@/lib/api-key-validator";

interface ColorResult {
  dominant: string;
  palette: string[];
  isDark: boolean;
}

// Fonction pour convertir RGB en hex
function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// Fonction pour déterminer si une couleur est sombre
function isDarkColor(r: number, g: number, b: number): boolean {
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128;
}

// Fonction pour extraire la couleur dominante avec sharp
async function extractDominantColor(imageBuffer: Buffer): Promise<ColorResult> {
  console.log("🔍 Début de l'extraction de couleur avec sharp");
  console.log("📊 Taille du buffer:", imageBuffer.length, "bytes");

  return await extractColorWithSharp(imageBuffer);
}

// Fonction principale utilisant sharp directement
async function extractColorWithSharp(
  imageBuffer: Buffer
): Promise<ColorResult> {
  console.log("🎨 Extraction de couleurs avec sharp");

  const sharp = (await import("sharp")).default;

  // Redimensionner l'image pour accélérer le traitement
  const resized = await sharp(imageBuffer)
    .resize(150, 150, { fit: "inside" })
    .raw()
    .toBuffer();

  // Analyser les pixels
  const pixels = new Uint8Array(resized);
  const colorCounts = new Map<string, number>();

  // Compter les couleurs (ignorer les pixels blancs/noirs purs)
  for (let i = 0; i < pixels.length; i += 3) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    // Ignorer les pixels trop clairs ou trop sombres
    if ((r > 240 && g > 240 && b > 240) || (r < 15 && g < 15 && b < 15)) {
      continue;
    }

    // Quantifier les couleurs pour réduire le nombre de variations
    const quantizedR = Math.round(r / 16) * 16;
    const quantizedG = Math.round(g / 16) * 16;
    const quantizedB = Math.round(b / 16) * 16;

    const colorKey = `${quantizedR},${quantizedG},${quantizedB}`;
    colorCounts.set(colorKey, (colorCounts.get(colorKey) || 0) + 1);
  }

  // Trier les couleurs par fréquence
  const sortedColors = Array.from(colorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8); // Prendre les 8 couleurs les plus fréquentes

  if (sortedColors.length === 0) {
    // Fallback ultime
    const defaultColor = [128, 128, 128];
    const hexColor = rgbToHex(
      defaultColor[0],
      defaultColor[1],
      defaultColor[2]
    );
    return {
      dominant: hexColor,
      palette: [hexColor],
      isDark: isDarkColor(defaultColor[0], defaultColor[1], defaultColor[2]),
    };
  }

  // La couleur dominante est la plus fréquente
  const dominantColor = sortedColors[0][0].split(",").map(Number);
  const [r, g, b] = dominantColor;
  const hexColor = rgbToHex(r, g, b);
  const isDark = isDarkColor(r, g, b);

  // Créer la palette complète
  const palette = sortedColors.map(([colorKey]) => {
    const [r, g, b] = colorKey.split(",").map(Number);
    return rgbToHex(r, g, b);
  });

  console.log("✅ Palette extraite avec sharp:", {
    dominant: {
      hex: hexColor,
      rgb: `rgb(${r}, ${g}, ${b})`,
      isDark: isDark,
    },
    palette: palette,
    totalColors: colorCounts.size,
    paletteSize: palette.length,
  });

  return {
    dominant: hexColor,
    palette: palette,
    isDark,
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const image = formData.get("image") as File;
    const apiKey = extractApiKeyFromFormData(formData);

    console.log("🔑 Clé API extraite:", apiKey ? "Présente" : "Absente");

    // Vérifier l'authentification : Session OU Clé API
    const session = await auth();
    const hasSession = !!session?.user;

    console.log(
      "👤 Session utilisateur:",
      hasSession ? session.user.id : "Aucune"
    );

    if (!image) {
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: "Tentative d'extraction de couleur sans image",
        userId: hasSession ? session.user.id : undefined,
        metadata: {
          ip: request.ip || request.headers.get("x-forwarded-for") || "unknown",
        },
      });
      return new Response(JSON.stringify({ error: "Aucune image fournie" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Logique d'authentification : Session OU Clé API
    let validatedKey = null;
    let userId = null;

    if (hasSession) {
      // Session valide, on laisse passer
      userId = session.user.id;
      console.log("✅ Accès autorisé via session utilisateur");
    } else if (apiKey) {
      // Pas de session mais clé API fournie, la valider
      validatedKey = await validateApiKeyForColorExtraction(apiKey);
      if (!validatedKey) {
        return new Response(
          JSON.stringify({ error: "Clé API invalide ou expirée" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      userId = validatedKey.id;
      console.log("✅ Accès autorisé via clé API");
    } else {
      // Ni session ni clé API
      logDb.createLog({
        level: "warning",
        action: "api.request",
        message: "Tentative d'accès à l'API couleurs sans authentification",
        metadata: {
          ip: request.ip || request.headers.get("x-forwarded-for") || "unknown",
        },
      });
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Convertir l'image en buffer
    const imageBuffer = Buffer.from(await image.arrayBuffer());

    // Extraire la couleur dominante
    const colorResult = await extractDominantColor(imageBuffer);

    logDb.createLog({
      level: "info",
      action: "api.request",
      message: "Extraction de couleur dominante réussie",
      userId: userId,
      metadata: {
        filename: image.name,
        fileSize: image.size,
        mimeType: image.type,
        dominantColor: colorResult.dominant,
        isDark: colorResult.isDark,
        accessMethod: validatedKey ? "api_key" : "session",
        ...(validatedKey && {
          apiKeyName: validatedKey.name,
          apiKeyId: validatedKey.id,
        }),
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        colors: colorResult,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de l'extraction de couleur dominante",
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
        ip: request.ip || request.headers.get("x-forwarded-for") || "unknown",
      },
    });
    return new Response(
      JSON.stringify({ error: "Erreur lors de l'extraction des couleurs" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
