/**
 * Import d'une image hébergée ailleurs, pour s'en servir comme image de départ.
 *
 * Le navigateur ne peut pas lire une image d'un autre domaine (CORS) : c'est
 * donc le serveur qui la télécharge. Une requête sortante déclenchée par un
 * utilisateur est un vecteur classique de SSRF, d'où les garde-fous : HTTP(S)
 * uniquement, aucune adresse interne, redirections revérifiées à chaque saut,
 * taille et durée bornées.
 */

import { lookup } from "dns/promises";
import { isIP } from "net";

const MAX_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

export interface RemoteImage {
  b64: string;
  mimeType: string;
  name: string;
}

export async function fetchRemoteImage(rawUrl: string): Promise<RemoteImage> {
  let url = parseUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url.hostname);

    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Plusieurs hébergeurs (Wikimedia, certains CDN) refusent une requête
      // sans agent identifié.
      headers: {
        accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
        "user-agent": "ShareX-Manager/ai-image-gen (image import)",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirection sans destination");
      url = parseUrl(new URL(location, url).toString());
      continue;
    }

    if (!response.ok) {
      throw new Error(`Le site a répondu HTTP ${response.status}`);
    }

    const mimeType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!mimeType.startsWith("image/") || mimeType === "image/svg+xml") {
      throw new Error("Ce lien ne pointe pas vers une image (PNG, JPEG, WebP…)");
    }

    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) throw new Error("Image trop lourde (20 Mo maximum)");

    const buffer = await readBounded(response);
    return {
      b64: buffer.toString("base64"),
      mimeType,
      name: fileNameFrom(url, mimeType),
    };
  }

  throw new Error("Trop de redirections");
}

function parseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Lien invalide");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Seuls les liens http et https sont acceptés");
  }
  if (url.username || url.password) {
    throw new Error("Les liens avec identifiants ne sont pas acceptés");
  }
  return url;
}

/**
 * Refuse tout hôte qui résout vers une adresse non publique. On vérifie
 * toutes les adresses renvoyées : un nom qui en mélange une publique et une
 * privée est refusé.
 */
async function assertPublicHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => {
        throw new Error("Nom de domaine introuvable");
      })).map((entry) => entry.address);

  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error("Ce lien pointe vers une adresse interne, refusé");
  }
}

export function isPrivateAddress(address: string): boolean {
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const ip = mapped ? mapped[1] : address.toLowerCase();

  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  return (
    ip === "::" ||
    ip === "::1" ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("fe8") ||
    ip.startsWith("fe9") ||
    ip.startsWith("fea") ||
    ip.startsWith("feb") ||
    ip.startsWith("ff")
  );
}

async function readBounded(response: Response): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error("Image trop lourde (20 Mo maximum)");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function fileNameFrom(url: URL, mimeType: string): string {
  const last = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return last.slice(0, 120);
  return `image.${mimeType.split("/")[1] ?? "png"}`;
}
