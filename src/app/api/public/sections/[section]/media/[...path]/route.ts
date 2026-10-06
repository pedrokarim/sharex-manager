import { NextRequest, NextResponse } from "next/server";
import { findCatalogSection, readSectionMedia } from "@/lib/modules/catalog-sections";
import { serveMediaFile } from "@/lib/modules/media-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { getTrustedClientIp } from "@/lib/request-ip";

/**
 * Images des sections que les modules apportent au catalogue public
 * (`catalogSections`). Sans session : c'est le module qui dit, à chaque
 * demande, si l'adresse désigne encore quelque chose de public.
 *
 * `Cache-Control: private, no-cache` est voulu :
 *
 * - `private` interdit à un cache partagé (Cloudflare, dont la zone sert bien
 *   d'autres projets et ne se purge pas) de garder une copie. Une image qui
 *   cesse d'être publique ne doit pas continuer d'être servie par un tiers ;
 * - `no-cache` fait revalider le navigateur à chaque affichage. La
 *   revalidation repasse par cette route, donc par le contrôle de visibilité :
 *   un chapitre repassé en privé répond 404 à la demande suivante, et une
 *   image inchangée ne coûte qu'un `304`.
 *
 * Un refus n'est jamais gardé non plus (`no-store`).
 */
const CACHE_CONTROL = "private, no-cache";

/** Une lecture charge des dizaines d'images d'affilée ; au-delà, ce n'est plus une lecture. */
const MAX_PER_MINUTE = 1200;

function refuse(status: number, error: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex", ...headers } });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ section: string; path: string[] }> }) {
  const { section, path } = await params;

  const limit = checkRateLimit(`catalog-media:${getTrustedClientIp(request.headers)}`, { max: MAX_PER_MINUTE, windowMs: 60_000 });
  if (!limit.allowed) {
    return refuse(429, "Trop de demandes, réessayez dans un instant", { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) });
  }

  // Module désactivé, section inconnue, adresse qui ne désigne plus rien de
  // public : la même réponse, qui ne dit pas lequel des trois.
  const resolved = await findCatalogSection(section);
  const media = resolved ? await readSectionMedia(resolved, path) : null;
  if (!media) return refuse(404, "Image introuvable");

  const response = serveMediaFile(request, media.file, { cacheControl: CACHE_CONTROL });
  if (!media.indexable) response.headers.set("X-Robots-Tag", "noindex, noimageindex");
  return response;
}
