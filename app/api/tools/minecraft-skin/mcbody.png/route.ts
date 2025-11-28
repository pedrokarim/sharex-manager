import { NextRequest, NextResponse } from "next/server";
import { drawSkin3D } from "@/lib/minecraft/skin-renderer";
import { getPlayerDataByUUID } from "@/lib/minecraft/player-service";
import {
  validateSkinParam,
  validateDimensions,
  validateRotationAngles,
  parseBooleanParam,
  parseNumberParam,
} from "@/lib/minecraft/api-validation";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const skin = searchParams.get("skin");
    const model = (searchParams.get("model") as "classic" | "slim") || "slim";
    const width = parseNumberParam(
      searchParams.get("width"),
      600,
      32,
      2000
    ).value;
    const height = parseNumberParam(
      searchParams.get("height"),
      800,
      32,
      2000
    ).value;
    const theta = parseNumberParam(
      searchParams.get("theta"),
      -30,
      -180,
      180
    ).value;
    const phi = parseNumberParam(searchParams.get("phi"), 20, -90, 90).value;
    const time = parseNumberParam(searchParams.get("time"), 90, 0, 360).value;
    const flip = parseBooleanParam(searchParams.get("flip"), false);

    // Validation du paramètre skin
    const skinValidation = validateSkinParam(skin);
    if (!skinValidation.isValid) {
      return NextResponse.json(
        { error: true, message: skinValidation.error },
        { status: 400 }
      );
    }

    // Validation des dimensions
    const dimensionsValidation = validateDimensions(width, height, 32, 2000);
    if (!dimensionsValidation.isValid) {
      return NextResponse.json(
        { error: true, message: dimensionsValidation.error },
        { status: 400 }
      );
    }

    // Validation des angles
    const anglesValidation = validateRotationAngles(theta, phi);
    if (!anglesValidation.isValid) {
      return NextResponse.json(
        { error: true, message: anglesValidation.error },
        { status: 400 }
      );
    }

    // Récupérer les URLs des textures
    let skinUrl = skin!;
    let capeUrl: string | undefined;

    // Si c'est un UUID, récupérer les URLs des textures
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(skin!)) {
      const playerData = await getPlayerDataByUUID(skin!);
      if (playerData) {
        skinUrl = playerData.skinUrl || skin!;
        capeUrl = playerData.capeUrl;
      }
    }

    const canvas = await drawSkin3D({
      skin: skinUrl,
      model: model as "classic" | "slim",
      width,
      height,
      theta,
      phi,
      time,
      flip,
    });

    const buffer = canvas.toBuffer("image/png");

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error generating Minecraft 3D body:", error);
    return NextResponse.json(
      { error: true, message: "Erreur lors de la génération du modèle 3D" },
      { status: 500 }
    );
  }
}
