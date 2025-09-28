import { NextRequest, NextResponse } from "next/server";
import { drawSkin2DHead } from "@/lib/minecraft/skin-renderer";
import { getPlayerDataByUUID } from "@/lib/minecraft/player-service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const skin = searchParams.get("skin");
    const width = parseInt(searchParams.get("width") || "32");
    const height = parseInt(searchParams.get("height") || "32");
    const flip =
      searchParams.get("flip") === "1" || searchParams.get("flip") === "true";

    if (!skin) {
      return NextResponse.json(
        { error: true, message: "Paramètre skin manquant" },
        { status: 400 }
      );
    }

    if (width < 8 || width > 1000 || height < 8 || height > 1000) {
      return NextResponse.json(
        { error: true, message: "Dimensions invalides (8-1000px)" },
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
