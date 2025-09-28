import { NextRequest, NextResponse } from "next/server";
import { drawSkin3D } from "@/lib/minecraft/skin-renderer";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const skin = searchParams.get("skin");
    const model = (searchParams.get("model") as "classic" | "slim") || "slim";
    const width = parseInt(searchParams.get("width") || "600");
    const height = parseInt(searchParams.get("height") || "800");
    const theta = parseInt(searchParams.get("theta") || "-30");
    const phi = parseInt(searchParams.get("phi") || "20");
    const time = parseInt(searchParams.get("time") || "90");
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

    if (theta < -180 || theta > 180 || phi < -90 || phi > 90) {
      return NextResponse.json(
        {
          error: true,
          message: "Angles invalides (theta: -180 à 180, phi: -90 à 90)",
        },
        { status: 400 }
      );
    }

    const canvas = await drawSkin3D({
      skin,
      model,
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
