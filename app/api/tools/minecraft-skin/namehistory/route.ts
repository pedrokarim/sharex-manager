import { NextRequest } from "next/server";
import { proxySkinApiJson } from "@/lib/minecraft/skin-api-proxy";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const uuid = searchParams.get("uuid");

  if (!uuid) {
    return new Response(
      JSON.stringify({ error: true, message: "Parameter uuid is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  return proxySkinApiJson(`/api/namemc/namehistory/${encodeURIComponent(uuid)}`);
}
