/**
 * Limites de débit réglées dans l'écran Sécurité (niveau souple, normal ou
 * strict : `getRateLimits()`), appliquées aux routes qui les concernent.
 *
 * Chaque garde renvoie une réponse 429 prête à renvoyer, ou `null` quand la
 * requête peut passer.
 */

import { checkIpRateLimit, checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getRateLimits } from "./settings";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Envois par clé API et par heure (`/api/upload`). Message lisible dans ShareX. */
export function limitApiKeyUploads(keyId: string): Response | null {
  const max = getRateLimits().uploadsPerKeyPerHour;
  const result = checkRateLimit(`api-key-uploads:${keyId}`, { max, windowMs: HOUR });
  if (result.allowed) return null;
  return rateLimitResponse(
    result,
    `Limite atteinte : ${max} envois par heure pour cette clé API. Réessayez plus tard.`
  );
}

/** Affichages d'images par adresse IP et par minute (`/img-handler`). */
export function limitImageView(request: Request): Response | null {
  const result = checkIpRateLimit("image-views", request.headers, {
    max: getRateLimits().imageViewsPerIpPerMinute,
    windowMs: MINUTE,
  });
  return result.allowed ? null : rateLimitResponse(result, "Trop d’images demandées, réessayez dans un instant.");
}

/** Appels de l'API publique par adresse IP et par minute (`/api/public/**`). */
export function limitPublicApi(request: Request): Response | null {
  const result = checkIpRateLimit("public-api", request.headers, {
    max: getRateLimits().publicApiPerIpPerMinute,
    windowMs: MINUTE,
  });
  return result.allowed ? null : rateLimitResponse(result);
}
