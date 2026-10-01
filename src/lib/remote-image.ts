/**
 * Import d'une image hébergée ailleurs, pour s'en servir comme image de départ.
 *
 * Le navigateur ne peut pas lire une image d'un autre domaine (CORS) : c'est
 * donc le serveur qui la télécharge. Une requête sortante déclenchée par un
 * utilisateur est un vecteur classique de SSRF, d'où les garde-fous : HTTP(S)
 * uniquement, aucune adresse interne, redirections revérifiées à chaque saut,
 * taille et durée bornées.
 *
 * L'adresse est vérifiée dans la résolution DNS de la connexion elle-même
 * (option `lookup`) : vérifier puis laisser `fetch` résoudre à nouveau
 * laissait un nom à durée de vie nulle répondre d'abord une adresse publique,
 * puis une adresse interne.
 */

import { lookup as dnsLookup } from "dns";
import http from "http";
import https from "https";
import { isIP, type LookupFunction } from "net";

const MAX_BYTES = 20 * 1024 * 1024;
/** Délai total, redirections comprises. */
const DEADLINE_MS = 30_000;
const MAX_REDIRECTS = 3;

export interface RemoteImage {
  b64: string;
  mimeType: string;
  name: string;
}

export async function fetchRemoteImage(rawUrl: string): Promise<RemoteImage> {
  let url = parseUrl(rawUrl);
  const deadline = Date.now() + DEADLINE_MS;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const literal = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(literal) && isPrivateAddress(literal)) throw internalRefused();

    const response = await request(url, deadline);

    if (response.status >= 300 && response.status < 400) {
      response.discard();
      const location = response.headers.location;
      if (!location) throw new Error("Redirection sans destination");
      url = parseUrl(new URL(location, url).toString());
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      response.discard();
      throw new Error(`Le site a répondu HTTP ${response.status}`);
    }

    const mimeType = String(response.headers["content-type"] ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!mimeType.startsWith("image/") || mimeType === "image/svg+xml") {
      response.discard();
      throw new Error("Ce lien ne pointe pas vers une image (PNG, JPEG, WebP…)");
    }

    const declared = Number(response.headers["content-length"] ?? 0);
    if (declared > MAX_BYTES) {
      response.discard();
      throw new Error("Image trop lourde (20 Mo maximum)");
    }

    const buffer = await response.read(MAX_BYTES);
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

function internalRefused() {
  return new Error("Ce lien pointe vers une adresse interne, refusé");
}

/**
 * Résolution DNS de la connexion : toutes les adresses renvoyées doivent être
 * publiques (un nom qui mélange une adresse publique et une privée est
 * refusé), et c'est l'une d'elles qui sert à se connecter.
 */
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(new Error("Nom de domaine introuvable"), "", 4);
    const list = addresses as { address: string; family: number }[];
    if (list.length === 0 || list.some((entry) => isPrivateAddress(entry.address))) {
      return callback(internalRefused(), "", 4);
    }
    if ((options as { all?: boolean }).all) {
      return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
    }
    callback(null, list[0].address, list[0].family);
  });
};

interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  read: (limit: number) => Promise<Buffer>;
  discard: () => void;
}

function request(url: URL, deadline: number): Promise<RawResponse> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new Error("Le site met trop de temps à répondre"));

  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.get(
      url,
      {
        lookup: safeLookup,
        timeout: remaining,
        // Plusieurs hébergeurs (Wikimedia, certains CDN) refusent une requête
        // sans agent identifié.
        headers: {
          accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
          "user-agent": "ShareX-Manager/ai-image-gen (image import)",
        },
      },
      (res) => {
        const timer = setTimeout(() => res.destroy(new Error("Le site met trop de temps à répondre")), Math.max(1, deadline - Date.now()));
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          discard: () => {
            clearTimeout(timer);
            res.destroy();
          },
          read: (limit) =>
            new Promise<Buffer>((done, fail) => {
              const chunks: Buffer[] = [];
              let total = 0;
              res.on("data", (chunk: Buffer) => {
                total += chunk.length;
                if (total > limit) {
                  res.destroy(new Error("Image trop lourde (20 Mo maximum)"));
                  return;
                }
                chunks.push(chunk);
              });
              res.on("end", () => {
                clearTimeout(timer);
                done(Buffer.concat(chunks));
              });
              res.on("error", (error) => {
                clearTimeout(timer);
                fail(error);
              });
            }),
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Le site met trop de temps à répondre")));
    req.on("error", reject);
  });
}

// ─── Adresses non publiques ──────────────────────────────────────

function isPrivateIPv4(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/** Adresse IPv6 développée en 8 mots de 16 bits, ou null si elle est invalide. */
function parseIPv6(input: string): number[] | null {
  let address = input.toLowerCase().split("%")[0];
  // Suffixe IPv4 (`::ffff:1.2.3.4`) : converti en deux mots.
  const dotted = address.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (isIP(dotted[2]) !== 4) return null;
    const [a, b, c, d] = dotted[2].split(".").map(Number);
    address = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part ? part.split(":").map((word) => parseInt(word, 16)) : []);
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const words = [...head, ...new Array(Math.max(0, missing)).fill(0), ...tail];
  if (words.length !== 8 || words.some((word) => !Number.isInteger(word) || word < 0 || word > 0xffff)) return null;
  return words;
}

export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "");
  if (isIP(ip) === 4) return isPrivateIPv4(ip);
  if (isIP(ip) !== 6) return true;

  const words = parseIPv6(ip);
  if (!words) return true;

  // IPv4 encapsulée (`::ffff:a.b.c.d`, toutes écritures confondues) : c'est
  // l'adresse IPv4 qui compte.
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    const v4 = [words[6] >> 8, words[6] & 0xff, words[7] >> 8, words[7] & 0xff].join(".");
    return isPrivateIPv4(v4);
  }

  // Seules les adresses unicast globales (2000::/3) sont publiques. Cela
  // écarte ::, ::1, les adresses IPv4 compatibles, NAT64 (64:ff9b::/96),
  // 100::/64, les adresses locales (fc00::/7, fe80::/10, fec0::/10) et la
  // multidiffusion (ff00::/8).
  if ((words[0] & 0xe000) !== 0x2000) return true;

  return (
    (words[0] === 0x2001 && words[1] === 0x0db8) || // documentation
    (words[0] === 0x2001 && words[1] === 0x0000) || // Teredo : tunnel vers une IPv4 quelconque
    words[0] === 0x2002 // 6to4 : encapsule une IPv4 quelconque
  );
}

function fileNameFrom(url: URL, mimeType: string): string {
  const last = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return last.slice(0, 120);
  return `image.${mimeType.split("/")[1] ?? "png"}`;
}
