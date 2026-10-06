/**
 * L'icône d'un site, lue chez lui.
 *
 * On préfère une icône déclarée en haute définition (manifeste d'application
 * web, `apple-touch-icon`, `link rel="icon"` avec une taille) à
 * `/favicon.ico`. Ce qui est reçu n'est jamais servi tel quel : l'image est
 * ouverte avec sharp, refusée si elle n'en est pas une, puis redessinée en PNG
 * de taille fixe. Un SVG n'est pas accepté.
 *
 * L'icône est récupérée la première fois que l'adaptateur est listé, puis
 * seulement à la demande d'un administrateur : jamais à chaque affichage. Les
 * requêtes passent par le client poli, et ne visent que les domaines déclarés
 * par l'adaptateur.
 */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import sharp from "sharp";
import type { SourceAdapter } from "./adapter";
import type { PoliteFetcher } from "./fetcher";
import { iconFile } from "./settings";

/** Côté de l'icône enregistrée, en pixels. */
export const ICON_SIZE = 128;
/** Une icône reçue ne pèse pas plus. */
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const MAX_ICON_PIXELS = 16_000_000;
/** Images essayées au plus pour un site : on ne fait pas le tour de toutes ses déclinaisons. */
const MAX_ATTEMPTS = 3;

const ACCEPTED_FORMATS = new Set(["png", "jpeg", "webp", "gif"]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface IconCandidate {
  url: string;
  /** Côté déclaré, en pixels ; 0 quand le site ne le dit pas. */
  size: number;
}

/**
 * Un fichier `.ico` est une boîte : sharp ne la lit pas, mais ses grandes
 * images y sont rangées en PNG. On rend la plus grande, ou `null`. Les
 * petites, brutes, sont lues par `largestBitmapOfIco`.
 */
function largestPngOfIco(buffer: Buffer): Buffer | null {
  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) return null;
  const count = Math.min(buffer.readUInt16LE(4), 64);
  let best: Buffer | null = null;
  for (let index = 0; index < count; index++) {
    const entry = 6 + index * 16;
    if (entry + 16 > buffer.length) break;
    const size = buffer.readUInt32LE(entry + 8);
    const offset = buffer.readUInt32LE(entry + 12);
    if (size < PNG_SIGNATURE.length || offset + size > buffer.length) continue;
    const image = buffer.subarray(offset, offset + size);
    if (image.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) && (!best || image.length > best.length)) best = image;
  }
  return best;
}

/** Côté maximal d'une image brute lue dans un `.ico` : au-delà, ce n'est plus une icône. */
const MAX_BITMAP_SIDE = 256;

/**
 * Les petites images d'un `.ico` y sont rangées brutes, sans en-tête de
 * fichier : des lignes de pixels, de bas en haut, suivies d'un masque de
 * transparence. On lit les formes courantes (32, 24 et 8 bits, non compressées)
 * et on rend les pixels en RGBA, ou `null` pour tout le reste.
 */
function largestBitmapOfIco(buffer: Buffer): { data: Buffer; width: number; height: number } | null {
  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) return null;
  const count = Math.min(buffer.readUInt16LE(4), 64);
  let best: { data: Buffer; width: number; height: number } | null = null;
  for (let index = 0; index < count; index++) {
    const entry = 6 + index * 16;
    if (entry + 16 > buffer.length) break;
    const size = buffer.readUInt32LE(entry + 8);
    const offset = buffer.readUInt32LE(entry + 12);
    if (size < 40 || offset + size > buffer.length) continue;
    const image = decodeIcoBitmap(buffer.subarray(offset, offset + size));
    if (image && (!best || image.width > best.width)) best = image;
  }
  return best;
}

function decodeIcoBitmap(image: Buffer): { data: Buffer; width: number; height: number } | null {
  if (image.readUInt32LE(0) !== 40) return null;
  const width = image.readInt32LE(4);
  // La hauteur déclarée compte l'image et son masque.
  const height = image.readInt32LE(8) / 2;
  const depth = image.readUInt16LE(14);
  if (image.readUInt32LE(16) !== 0 || ![8, 24, 32].includes(depth)) return null;
  if (!Number.isInteger(height) || width <= 0 || height <= 0 || width > MAX_BITMAP_SIDE || height > MAX_BITMAP_SIDE) return null;

  const paletteSize = depth === 8 ? image.readUInt32LE(32) || 256 : 0;
  const paletteStart = 40;
  const pixelsStart = paletteStart + paletteSize * 4;
  const rowBytes = Math.ceil((width * depth) / 32) * 4;
  const maskStart = pixelsStart + rowBytes * height;
  const maskRowBytes = Math.ceil(width / 32) * 4;
  if (paletteSize > 256 || maskStart > image.length) return null;
  const hasMask = maskStart + maskRowBytes * height <= image.length;

  const data = Buffer.alloc(width * height * 4);
  let opaque = false;
  for (let y = 0; y < height; y++) {
    // Les lignes sont rangées de bas en haut.
    const row = pixelsStart + (height - 1 - y) * rowBytes;
    const maskRow = maskStart + (height - 1 - y) * maskRowBytes;
    for (let x = 0; x < width; x++) {
      const target = (y * width + x) * 4;
      let blue: number, green: number, red: number;
      let alpha = 255;
      if (depth === 8) {
        const color = paletteStart + image[row + x] * 4;
        if (color + 3 > pixelsStart) return null;
        [blue, green, red] = [image[color], image[color + 1], image[color + 2]];
      } else {
        const source = row + x * (depth / 8);
        [blue, green, red] = [image[source], image[source + 1], image[source + 2]];
        if (depth === 32) alpha = image[source + 3];
      }
      if (depth !== 32 && hasMask && (image[maskRow + (x >> 3)] >> (7 - (x & 7))) & 1) alpha = 0;
      if (alpha !== 0) opaque = true;
      data[target] = red;
      data[target + 1] = green;
      data[target + 2] = blue;
      data[target + 3] = alpha;
    }
  }
  // Une image 32 bits dont toute la transparence vaut zéro n'en porte pas : elle est opaque.
  if (!opaque && depth === 32) for (let index = 3; index < data.length; index += 4) data[index] = 255;
  else if (!opaque) return null;
  return { data, width, height };
}

/** Ouvre ce qui a été reçu et le redessine en PNG carré. Lève si ce n'est pas une image acceptée. */
export async function normalizeIcon(received: Buffer): Promise<Buffer> {
  if (received.length === 0 || received.length > MAX_ICON_BYTES) throw new Error("Icône vide ou trop lourde.");
  let buffer = largestPngOfIco(received) ?? received;
  if (buffer === received) {
    const bitmap = largestBitmapOfIco(received);
    if (bitmap) buffer = await sharp(bitmap.data, { raw: { width: bitmap.width, height: bitmap.height, channels: 4 } }).png().toBuffer();
  }
  let format: string | undefined;
  try {
    const metadata = await sharp(buffer, { limitInputPixels: MAX_ICON_PIXELS }).metadata();
    format = metadata.width && metadata.height ? metadata.format : undefined;
  } catch {
    throw new Error("Ce que le site a rendu n’est pas une image lisible.");
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) throw new Error("Ce que le site a rendu n’est pas une image acceptée (PNG, JPEG, WebP ou GIF).");
  return sharp(buffer, { limitInputPixels: MAX_ICON_PIXELS })
    .resize(ICON_SIZE, ICON_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

const attribute = (tag: string, name: string): string | undefined => {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
};

/** Le plus grand côté d'une déclaration `sizes="180x180 512x512"`. */
const declaredSize = (sizes: string | undefined): number => Math.max(0, ...(sizes ?? "").split(/\s+/).map((entry) => Number.parseInt(entry, 10) || 0));

const looksLikeSvg = (url: string, type?: string) => (type ?? "").toLowerCase().includes("svg") || /\.svg(?:$|[?#])/i.test(url);

/** Les icônes qu'une page d'accueil déclare, et l'adresse de son manifeste. Exportée pour les tests. */
export function findDeclaredIcons(html: string, pageUrl: string): { icons: IconCandidate[]; manifest?: string } {
  const icons: IconCandidate[] = [];
  let manifest: string | undefined;
  for (const [tag] of html.slice(0, 500_000).matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attribute(tag, "rel") ?? "").toLowerCase().split(/\s+/);
    const href = attribute(tag, "href");
    if (!href) continue;
    let url: string;
    try {
      url = new URL(href, pageUrl).toString();
    } catch {
      continue;
    }
    if (rel.includes("manifest")) manifest ??= url;
    else if (rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed")) {
      // Sans taille déclarée, une icône Apple fait 180 px.
      if (!looksLikeSvg(url, attribute(tag, "type"))) icons.push({ url, size: declaredSize(attribute(tag, "sizes")) || 180 });
    } else if (rel.includes("icon")) {
      if (!looksLikeSvg(url, attribute(tag, "type"))) icons.push({ url, size: declaredSize(attribute(tag, "sizes")) });
    }
  }
  return { icons, manifest };
}

function manifestIcons(data: unknown, manifestUrl: string): IconCandidate[] {
  const list = data && typeof data === "object" ? (data as { icons?: unknown }).icons : undefined;
  if (!Array.isArray(list)) return [];
  return list.slice(0, 40).flatMap((entry): IconCandidate[] => {
    if (!entry || typeof entry !== "object") return [];
    const { src, sizes, type } = entry as { src?: unknown; sizes?: unknown; type?: unknown };
    if (typeof src !== "string") return [];
    try {
      const url = new URL(src, manifestUrl).toString();
      return looksLikeSvg(url, typeof type === "string" ? type : undefined) ? [] : [{ url, size: declaredSize(typeof sizes === "string" ? sizes : undefined) }];
    } catch {
      return [];
    }
  });
}

/** La plus petite icône qui suffit d'abord, puis les plus grandes des trop petites. */
function rank(candidates: IconCandidate[]): IconCandidate[] {
  const enough = candidates.filter((candidate) => candidate.size >= ICON_SIZE).sort((left, right) => left.size - right.size);
  const small = candidates.filter((candidate) => candidate.size < ICON_SIZE).sort((left, right) => right.size - left.size);
  return [...enough, ...small];
}

/**
 * Cherche l'icône d'un site chez lui et la rend en PNG, ou lève une erreur qui
 * dit pourquoi. Quelques requêtes au plus : la page d'accueil, son manifeste,
 * puis trois images au maximum.
 */
export async function fetchSourceIcon(adapter: SourceAdapter, fetcher: PoliteFetcher, signal?: AbortSignal): Promise<Buffer> {
  const allowed = (candidate: IconCandidate) => {
    try {
      return fetcher.isAllowed(new URL(candidate.url).hostname);
    } catch {
      return false;
    }
  };

  const candidates: IconCandidate[] = [];
  try {
    const page = await fetcher.request(adapter.homepage, { kind: "html", retries: 0, signal });
    if (page.status >= 200 && page.status < 300) {
      const declared = findDeclaredIcons(page.body.toString("utf-8"), page.url);
      if (declared.manifest && allowed({ url: declared.manifest, size: 0 })) {
        try {
          const manifest = await fetcher.request(declared.manifest, { kind: "any", maxBytes: 256 * 1024, retries: 0, signal });
          if (manifest.status >= 200 && manifest.status < 300) candidates.push(...manifestIcons(JSON.parse(manifest.body.toString("utf-8")), manifest.url));
        } catch {
          // Pas de manifeste lisible : les icônes de la page suffiront.
        }
      }
      candidates.push(...declared.icons);
    }
  } catch {
    // Page d'accueil illisible : il reste `/favicon.ico`.
  }
  if (signal?.aborted) throw new Error("Interrompu.");

  const seen = new Set<string>();
  const ordered = [...rank(candidates), { url: new URL("/favicon.ico", adapter.homepage).toString(), size: 0 }].filter((candidate) => {
    if (seen.has(candidate.url) || !allowed(candidate)) return false;
    seen.add(candidate.url);
    return true;
  });

  let reason = "aucune icône trouvée";
  for (const candidate of ordered.slice(0, MAX_ATTEMPTS)) {
    try {
      // `any` : un `.ico` s'annonce sous plusieurs types ; c'est sharp qui dit si c'est une image.
      const response = await fetcher.request(candidate.url, { kind: "any", maxBytes: MAX_ICON_BYTES, retries: 0, signal });
      if (response.status < 200 || response.status >= 300) {
        reason = `HTTP ${response.status}`;
        continue;
      }
      return await normalizeIcon(response.body);
    } catch (error) {
      reason = error instanceof Error ? error.message : "erreur";
    }
  }
  throw new Error(`L’icône de ${adapter.name} n’a pas pu être récupérée (${reason}).`);
}

/** Range l'icône dans les données du module, par fichier temporaire puis renommage. */
export function storeIcon(id: string, png: Buffer) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Identifiant de source invalide.");
  const target = iconFile(id);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(temporary, png);
    fs.renameSync(temporary, target);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}
