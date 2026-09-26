import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import fs from "fs";
import path from "path";
import { MEDIA_TYPES, serveMediaFile } from "@/lib/modules/media-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ moduleName: string; filePath: string[] }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { moduleName, filePath } = await params;

  // Nom de module strict : sans ce contrôle, un nom encodé (« %2E%2E »)
  // ferait sortir la route du dossier `modules/`.
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(moduleName)) {
    return NextResponse.json({ error: "Module invalide" }, { status: 400 });
  }

  // Pas de remontée, pas de fichier caché (`.env`, `.git`…).
  if (
    filePath.some(
      (seg) => seg === ".." || seg.startsWith(".") || seg.includes("\\") || seg.includes("/")
    )
  ) {
    return NextResponse.json({ error: "Chemin invalide" }, { status: 400 });
  }

  // Seuls les médias sont servis. Les données internes d'un module (historique,
  // `secrets.json` et ses clés API…) passent par ses fonctions, jamais par ici.
  const extension = path.extname(filePath[filePath.length - 1] ?? "").toLowerCase();
  if (!MEDIA_TYPES[extension] || extension === ".json") {
    return NextResponse.json({ error: "Type de fichier non servi" }, { status: 403 });
  }

  const modulesDir = path.join(process.cwd(), "modules");
  const fullPath = path.join(modulesDir, moduleName, "data", ...filePath);

  // Ensure resolved path stays within module data directory
  const dataDir = path.join(modulesDir, moduleName, "data");
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(dataDir) + path.sep)) {
    return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
  }

  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: "Fichier non trouvé" }, { status: 404 });
  }

  // Lecture en flux avec `Range` : indispensable aux vidéos et aux sons.
  if (!fs.statSync(resolved).isFile()) {
    return NextResponse.json({ error: "Fichier non trouvé" }, { status: 404 });
  }
  return serveMediaFile(request, resolved);
}
