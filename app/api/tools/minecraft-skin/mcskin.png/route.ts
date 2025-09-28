import { NextRequest, NextResponse } from "next/server";
import { drawSkin2DFull } from "@/lib/minecraft/skin-renderer";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const skin = searchParams.get("skin");
    const width = parseInt(searchParams.get("width") || "600");
    const height = parseInt(searchParams.get("height") || "800");
    const flip =
      searchParams.get("flip") === "1" || searchParams.get("flip") === "true";

    if (!skin) {
      return NextResponse.json(
        { error: true, message: "Paramètre skin manquant" },
        { status: 400 }
      );
    }

    if (width < 32 || width > 2000 || height < 32 || height > 2000) {
      return NextResponse.json(
        { error: true, message: "Dimensions invalides (32-2000px)" },
        { status: 400 }
      );
    }

    const canvas = await drawSkin2DFull({
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
    console.error("Error generating Minecraft skin:", error);
    return NextResponse.json(
      { error: true, message: "Erreur lors de la génération du skin" },
      { status: 500 }
    );
  }
}
