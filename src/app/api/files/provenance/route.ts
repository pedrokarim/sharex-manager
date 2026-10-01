import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "@/lib/api-guard";
import { galleryProvenance } from "@/lib/provenance/gallery";

/** Indicateurs d'origine de plusieurs fichiers de la galerie : un appel par page affichée. */
export async function POST(request: NextRequest) {
  const access = await requireAccess("user");
  if (!access.ok) return access.response;

  let names: unknown;
  try {
    ({ names } = await request.json());
  } catch {
    return NextResponse.json({ error: "Requête illisible" }, { status: 400 });
  }
  return NextResponse.json(
    { summaries: galleryProvenance.inspectMany(names) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
