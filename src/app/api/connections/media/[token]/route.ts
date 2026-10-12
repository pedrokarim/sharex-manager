/**
 * Lien public temporaire vers un fichier à publier (dossier 07, § 8.9) :
 * `GET` et `HEAD /api/connections/media/<jeton>.<extension>`, **sans
 * session** : c'est le service (ses robots) qui vient chercher le fichier.
 *
 * Tout le contrôle est dans `servePublicMedia` : jeton de 256 bits lié à un
 * seul fichier résolu par le serveur, durée courte, lectures bornées, même
 * réponse 404 pour un jeton inconnu, expiré, révoqué ou épuisé, jamais de
 * chemin dans la réponse, `Cache-Control: no-store`, `X-Robots-Tag: noindex`.
 *
 * En production, ce chemin doit échapper aux défis anti-robots du proxy
 * (Cloudflare…) : un défi ferait échouer la publication chez le service.
 */

import type { NextRequest } from "next/server";
import { servePublicMedia } from "@/lib/connections/public-media";
import { checkRateLimit } from "@/lib/rate-limit";
import { getTrustedClientIp } from "@/lib/request-ip";

/** Un service lit par morceaux : large, mais un balayage de jetons au hasard est vite freiné. */
const MAX_PER_MINUTE = 600;

function limited(request: NextRequest): Response | null {
  const limit = checkRateLimit(`connections-media:${getTrustedClientIp(request.headers)}`, { max: MAX_PER_MINUTE, windowMs: 60_000 });
  if (limit.allowed) return null;
  return new Response(JSON.stringify({ error: "Trop de demandes, réessayez dans un instant" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
    },
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const refusal = limited(request);
  if (refusal) return refusal;
  const { token } = await params;
  return servePublicMedia(request, token);
}

export async function HEAD(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const refusal = limited(request);
  if (refusal) return refusal;
  const { token } = await params;
  return servePublicMedia(request, token);
}
