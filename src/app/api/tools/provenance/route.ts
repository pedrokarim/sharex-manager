import { NextRequest, NextResponse } from "next/server";
import { inspectImage } from "@/lib/provenance/inspect";
import { provenanceVerdict } from "@/lib/provenance/types";
import { checkRateLimit } from "@/lib/rate-limit";
import { getTrustedClientIp } from "@/lib/request-ip";

/** Taille maximale d'une image analysée. */
const MAX_BYTES = 30 * 1024 * 1024;
/** Analyses par adresse, par tranche de dix minutes. */
const RATE = { max: 40, windowMs: 10 * 60 * 1000 };

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } as const;

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { ...headers, ...extra } });

/**
 * Outil public « Origine d'une image » : lit les marques d'origine d'un
 * fichier déposé (manifeste C2PA, XMP, EXIF, textes) et rend ce qui a été lu.
 *
 * Ouvert sans compte, donc borné en taille et en débit. Le fichier n'est ni
 * enregistré ni journalisé : il est lu en mémoire, puis oublié.
 */
export async function POST(request: NextRequest) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES + 4096) return json({ error: "Image trop lourde (30 Mo maximum)." }, 413);

  const { allowed, retryAfterMs } = checkRateLimit(`tools-provenance:${getTrustedClientIp(request.headers)}`, RATE);
  if (!allowed) {
    return json({ error: "Trop d'analyses d'affilée. Réessayez dans quelques minutes." }, 429, {
      "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
    });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return json({ error: "Requête illisible." }, 400);
  }
  if (!(file instanceof File) || file.size === 0) return json({ error: "Aucune image reçue." }, 400);
  if (file.size > MAX_BYTES) return json({ error: "Image trop lourde (30 Mo maximum)." }, 413);

  const report = inspectImage(Buffer.from(await file.arrayBuffer()));
  return json({ report, verdict: provenanceVerdict(report) }, 200);
}
