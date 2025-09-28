import { NextRequest, NextResponse } from "next/server";
import { generateAllServerImages } from "@/lib/minecraft/server-renderer";
import { getPlayerDataByUUID } from "@/lib/minecraft/player-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      uuid,
      username,
      width = 400,
      height = 400,
      flip = false,
      model = "classic",
    } = body;

    if (!uuid && !username) {
      return NextResponse.json(
        { error: true, message: "UUID ou nom d'utilisateur requis" },
        { status: 400 }
      );
    }

    let playerUuid = uuid;
    let playerName = username;

    // Si on a un nom d'utilisateur, récupérer l'UUID
    if (username && !uuid) {
      const { getUUIDFromUsername } = await import(
        "@/lib/minecraft/player-service"
      );
      playerUuid = await getUUIDFromUsername(username);
      if (!playerUuid) {
        return NextResponse.json(
          { error: true, message: "Joueur non trouvé" },
          { status: 404 }
        );
      }
    }

    // Si on a un UUID, récupérer le nom
    if (uuid && !username) {
      const playerData = await getPlayerDataByUUID(uuid);
      if (playerData) {
        playerName = playerData.name;
      }
    }

    const images = await generateAllServerImages({
      uuid: playerUuid,
      width,
      height,
      flip,
      model: model as "classic" | "slim",
    });

    // Convertir les buffers en base64 pour l'envoi
    const result: any = {
      success: true,
      data: {
        uuid: playerUuid,
        username: playerName,
        images: {},
        errors: images.errors,
      },
    };

    if (images.head) {
      result.data.images.head = `data:image/png;base64,${images.head.toString(
        "base64"
      )}`;
    }
    if (images.cape) {
      result.data.images.cape = `data:image/png;base64,${images.cape.toString(
        "base64"
      )}`;
    }
    if (images.skin) {
      result.data.images.skin = `data:image/png;base64,${images.skin.toString(
        "base64"
      )}`;
    }
    if (images.body) {
      result.data.images.body = `data:image/png;base64,${images.body.toString(
        "base64"
      )}`;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error generating all images:", error);
    return NextResponse.json(
      { error: true, message: "Erreur lors de la génération des images" },
      { status: 500 }
    );
  }
}
