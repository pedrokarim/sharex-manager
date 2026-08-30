import { isIP } from "node:net";

export const UNKNOWN_CLIENT_IP = "unknown";

/**
 * Résout uniquement l'adresse attestée par le reverse proxy.
 *
 * Nginx écrase `X-Real-IP` avec `$remote_addr` après validation du pair
 * Cloudflare. `X-Forwarded-For` reste une donnée déclarative du client et ne
 * doit jamais alimenter les quotas ou les journaux de sécurité.
 */
export function getTrustedClientIp(headers: Headers): string {
  const raw = headers.get("x-real-ip")?.trim();
  if (!raw || raw.includes(",")) return UNKNOWN_CLIENT_IP;

  const normalized = raw.startsWith("::ffff:") ? raw.slice(7) : raw;
  return isIP(normalized) ? normalized : UNKNOWN_CLIENT_IP;
}
