import { NextRequest } from "next/server";
import { proxySkinApiImage } from "@/lib/minecraft/skin-api-proxy";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const params: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    params[key] = value;
  });

  return proxySkinApiImage("/api/namemc/texture/cape", params);
}
