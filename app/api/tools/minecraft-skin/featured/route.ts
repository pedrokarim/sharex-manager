import { NextResponse } from "next/server";
import { getFeaturedSkins } from "@/lib/minecraft/featured-skins";

export async function GET() {
  try {
    const data = await getFeaturedSkins();
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error("Error fetching featured skins:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
