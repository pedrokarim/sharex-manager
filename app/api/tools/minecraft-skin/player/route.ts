import { NextRequest, NextResponse } from "next/server";
import { getPlayerData, getPlayerDataByUUID } from "@/lib/minecraft/player-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username");
  const uuid = searchParams.get("uuid");

  if (!username && !uuid) {
    return NextResponse.json(
      { success: false, message: "Parameter username or uuid is required" },
      { status: 400 }
    );
  }

  try {
    const playerData = uuid
      ? await getPlayerDataByUUID(uuid)
      : await getPlayerData(username!);

    if (!playerData) {
      return NextResponse.json(
        { success: false, message: "Player not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: playerData,
    });
  } catch (error) {
    console.error("Error fetching player data:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
