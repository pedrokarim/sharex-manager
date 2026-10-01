import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/api-guard";
import { galleryProvenance } from "@/lib/provenance/gallery";
import { provenanceVerdict } from "@/lib/provenance/types";

/** Marques d'origine d'un fichier de la galerie : ce qui a été lu, et ce que le fichier déclare. */
export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const access = await requireAccess("user");
  if (!access.ok) return access.response;

  try {
    const { filename } = await params;
    const { report } = await galleryProvenance.inspectOne(filename);
    return NextResponse.json({ report, verdict: provenanceVerdict(report) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lecture impossible" },
      { status: 404 }
    );
  }
}
