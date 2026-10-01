import { NextResponse } from "next/server";
import { galleryProvenance, visitorAccess } from "@/lib/provenance/gallery";
import { provenanceVerdict } from "@/lib/provenance/types";

/**
 * Marques d'origine d'un fichier de la galerie : ce qui a été lu, et ce que le
 * fichier déclare. Même règle d'accès que le fichier lui-même : public, sauf
 * s'il est marqué privé (`isFileSecure(…)`, dans `visitorAccess`).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const { canRead } = await visitorAccess();
  if (!(await canRead(filename))) return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });

  try {
    const { report } = await galleryProvenance.inspectOne(filename);
    return NextResponse.json({ report, verdict: provenanceVerdict(report) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lecture impossible" },
      { status: 404 }
    );
  }
}
