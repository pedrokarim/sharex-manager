import { NextRequest, NextResponse } from "next/server";
import { galleryProvenance, visitorAccess } from "@/lib/provenance/gallery";
import { checkRateLimit } from "@/lib/rate-limit";
import { getTrustedClientIp } from "@/lib/request-ip";

/** Un visiteur sans compte ne peut pas en demander à la chaîne : chaque version coûte deux décodages. */
const VISITOR_RATE = { max: 30, windowMs: 10 * 60 * 1000 };

/**
 * Le fichier sans ses métadonnées, pixels identiques, produit à la volée :
 * l'original n'est jamais réécrit. Même règle d'accès que le fichier lui-même :
 * public, sauf s'il est marqué privé (`isFileSecure(…)`, dans `visitorAccess`).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const { signedIn, canRead } = await visitorAccess();
  if (!(await canRead(filename))) return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });

  if (!signedIn) {
    const { allowed, retryAfterMs } = checkRateLimit(`clean:${getTrustedClientIp(request.headers)}`, VISITOR_RATE);
    if (!allowed) {
      return NextResponse.json(
        { error: "Trop de téléchargements d'affilée. Réessayez dans quelques minutes." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }
  }

  try {
    const { fileName, mimeType, output, clean } = await galleryProvenance.cleanFile(filename);
    return new NextResponse(new Uint8Array(output), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(output.length),
        "Content-Disposition": `attachment; filename="${fileName.replace(/[^\w.-]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Clean-Saved-Bytes": String(clean.savedBytes),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Version propre indisponible" },
      { status: 422 }
    );
  }
}
