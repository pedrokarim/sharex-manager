import { NextRequest, NextResponse } from "next/server";
import { galleryProvenance, visitorAccess } from "@/lib/provenance/gallery";

/** Noms acceptés en un appel : une page de grille, largement. */
const MAX_NAMES = 240;

/**
 * Indicateurs d'origine de plusieurs fichiers de la galerie : un appel par
 * page affichée. Même règle d'accès que les fichiers eux-mêmes : un visiteur
 * n'obtient rien sur un fichier marqué privé (`isFileSecure(…)`, dans
 * `visitorAccess`).
 */
export async function POST(request: NextRequest) {
  let names: unknown;
  try {
    ({ names } = await request.json());
  } catch {
    return NextResponse.json({ error: "Requête illisible" }, { status: 400 });
  }
  if (!Array.isArray(names)) return NextResponse.json({ summaries: {} });

  const { canRead } = await visitorAccess();
  const readable: string[] = [];
  for (const name of names.slice(0, MAX_NAMES)) {
    if (typeof name === "string" && (await canRead(name))) readable.push(name);
  }
  return NextResponse.json(
    { summaries: galleryProvenance.inspectMany(readable) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
