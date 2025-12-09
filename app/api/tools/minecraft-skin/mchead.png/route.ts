import { NextRequest, NextResponse } from "next/server";
import { drawSkin2DHead } from "@/lib/minecraft/skin-renderer";
import {
  validateSkinParam,
  validateDimensions,
  parseBooleanParam,
  parseNumberParam,
} from "@/lib/minecraft/api-validation";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const skin = searchParams.get("skin");
    const width = parseNumberParam(
      searchParams.get("width"),
      32,
      8,
      1000
    ).value;
    const height = parseNumberParam(
      searchParams.get("height"),
      32,
      8,
      1000
    ).value;
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
    const dimensionsValidation = validateDimensions(width, height, 8, 1000);
    if (!dimensionsValidation.isValid) {
      return NextResponse.json(
        { error: true, message: dimensionsValidation.error },
        { status: 400 }
      );
    }

    const canvas = await drawSkin2DHead({
      skin,
      width,
      height,
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
    console.error("Error generating Minecraft head:", error);
    return NextResponse.json(
      { error: true, message: "Erreur lors de la génération de la tête" },
      { status: 500 }
    );
  }
}
