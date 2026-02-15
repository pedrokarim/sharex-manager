import { NextResponse } from "next/server";
import { getSkinApiUrl } from "@/lib/minecraft/skin-api-proxy";

export async function GET() {
  try {
    const url = getSkinApiUrl("/health");
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (res.ok) {
      return NextResponse.json({ status: "ok" });
    }

    return NextResponse.json({ status: "down" }, { status: 503 });
  } catch {
    return NextResponse.json({ status: "down" }, { status: 503 });
  }
}
