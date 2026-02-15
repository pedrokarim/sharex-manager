import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import fs from "fs";
import path from "path";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".json": "application/json",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ moduleName: string; filePath: string[] }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { moduleName, filePath } = await params;

  // Security: reject path traversal
  if (filePath.some((seg) => seg === ".." || seg.includes("\\"))) {
    return NextResponse.json({ error: "Chemin invalide" }, { status: 400 });
  }

  const modulesDir = path.join(process.cwd(), "modules");
  const fullPath = path.join(modulesDir, moduleName, "data", ...filePath);

  // Ensure resolved path stays within module data directory
  const dataDir = path.join(modulesDir, moduleName, "data");
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(dataDir))) {
    return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
  }

  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: "Fichier non trouvé" }, { status: 404 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const fileBuffer = fs.readFileSync(resolved);

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
