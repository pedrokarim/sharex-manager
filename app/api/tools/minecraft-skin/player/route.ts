import { NextRequest, NextResponse } from "next/server";
import { getPlayerData } from "@/lib/minecraft/player-service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get("username");

    if (!username) {
      return NextResponse.json(
        { error: true, message: "Paramètre username manquant" },
        { status: 400 }
      );
    }

    if (username.length < 3 || username.length > 16) {
      return NextResponse.json(
        { error: true, message: "Le pseudo doit contenir entre 3 et 16 caractères" },
        { status: 400 }
      );
    }

    // Vérifier que le pseudo ne contient que des caractères valides
    const validUsernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!validUsernameRegex.test(username)) {
      return NextResponse.json(
        { error: true, message: "Le pseudo contient des caractères invalides" },
        { status: 400 }
      );
    }

    const playerData = await getPlayerData(username);

    if (!playerData) {
      return NextResponse.json(
        { error: true, message: "Joueur non trouvé" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: playerData
    });

  } catch (error) {
    console.error("Error in player lookup API:", error);
    return NextResponse.json(
      { error: true, message: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
