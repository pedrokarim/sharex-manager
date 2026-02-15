import { NextRequest, NextResponse } from "next/server";
import { getRecentSkins, addRecentSkin } from "@/lib/minecraft/recent-skins";

export async function GET() {
  try {
    const skins = await getRecentSkins();
    return NextResponse.json({ success: true, skins });
  } catch (error) {
    console.error("Error fetching recent skins:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { uuid, username, isSlim } = body;

    if (!uuid || !username) {
      return NextResponse.json(
        { success: false, message: "uuid and username are required" },
        { status: 400 }
      );
    }

    await addRecentSkin(uuid, username, !!isSlim);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding recent skin:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
