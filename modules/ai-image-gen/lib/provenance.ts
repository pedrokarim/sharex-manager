/**
 * Marques d'origine d'une image : les lire, et les retirer sans toucher aux
 * pixels. Manifeste C2PA, XMP, EXIF et textes libres, pour PNG, JPEG et WebP.
 *
 * Deux règles tiennent tout le fichier :
 * - on ne parcourt que le **conteneur** (chunks PNG, segments JPEG, chunks
 *   RIFF). Aucune recherche n'est faite dans le fichier entier : les données
 *   d'image compressées contiennent n'importe quelle suite d'octets ;
 * - le retrait **recopie** les morceaux gardés octet pour octet. Aucun passage
 *   par un encodeur, donc aucune recompression.
 *
 * Ce module ne voit que ce qui est écrit dans le fichier. Un filigrane inscrit
 * dans les pixels (SynthID et équivalents) lui est invisible.
 */

import zlib from "node:zlib";
import { readManifest } from "./c2pa";
import {
  TEXT_PREVIEW_LIMIT,
  type CarrierKind,
  type ProvenanceCarrier,
  type ProvenanceReport,
  type ProvenanceSummary,
  type ProvenanceText,
} from "./provenance-types";

type Format = "png" | "jpeg" | "webp";

export function sniffFormat(file: Buffer): Format | null {
  if (file.length >= 8 && file[0] === 0x89 && file.toString("latin1", 1, 4) === "PNG") return "png";
  if (file.length >= 3 && file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff) return "jpeg";
  if (file.length >= 12 && file.toString("latin1", 0, 4) === "RIFF" && file.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

/** Un morceau du conteneur : chunk PNG, segment JPEG ou chunk RIFF. */
interface Piece {
  /** `caBX`, `APP11`, `XMP `… */
  type: string;
  /** Début du morceau, en-tête compris. */
  start: number;
  /** Fin du morceau, CRC ou octet de bourrage compris. */
  end: number;
  dataStart: number;
  dataEnd: number;
}

// ─── PNG ─────────────────────────────────────────────────────────

/** Liste les chunks d'un PNG sans décoder un seul pixel. */
export function readPngChunks(file: Buffer): Piece[] {
  const chunks: Piece[] = [];
  let offset = 8;
  while (offset + 12 <= file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("latin1", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > file.length) break;
    chunks.push({ type, start: offset, end, dataStart: offset + 8, dataEnd: offset + 8 + length });
    offset = end;
    if (type === "IEND") break;
  }
  return chunks;
}

/**
 * Chunks conservés au retrait : l'image, sa colorimétrie et son animation.
 * Tout le reste est métadonnée. Le profil de couleur (`iCCP`, `cICP`) reste :
 * le retirer changerait les couleurs affichées.
 */
const PNG_KEPT = new Set([
  "IHDR", "PLTE", "tRNS", "IDAT", "IEND",
  "sRGB", "gAMA", "cHRM", "iCCP", "cICP", "sBIT", "pHYs", "bKGD",
  "acTL", "fcTL", "fdAT",
]);

const PNG_KINDS: Record<string, CarrierKind> = {
  caBX: "c2pa",
  eXIf: "exif",
  tEXt: "text",
  zTXt: "text",
  iTXt: "text",
};

/** Texte d'un chunk `tEXt`, `zTXt` ou `iTXt` : mot-clé et contenu. */
function readPngText(file: Buffer, chunk: Piece): { keyword: string; text: string } | null {
  const data = file.subarray(chunk.dataStart, chunk.dataEnd);
  const zero = data.indexOf(0);
  if (zero <= 0) return null;
  const keyword = data.toString("latin1", 0, zero);
  try {
    if (chunk.type === "tEXt") return { keyword, text: data.toString("latin1", zero + 1) };
    if (chunk.type === "zTXt") {
      return { keyword, text: inflateBounded(data.subarray(zero + 2)).toString("latin1") };
    }
    // iTXt : drapeau de compression, méthode, langue\0, mot-clé traduit\0, texte.
    const compressed = data[zero + 1] === 1;
    const language = data.indexOf(0, zero + 3);
    const translated = language === -1 ? -1 : data.indexOf(0, language + 1);
    if (translated === -1) return null;
    const body = data.subarray(translated + 1);
    return { keyword, text: (compressed ? inflateBounded(body) : body).toString("utf8") };
  } catch {
    return { keyword, text: "" };
  }
}

/** Décompresse un texte en bornant la sortie : un chunk peut être une bombe. */
function inflateBounded(data: Buffer): Buffer {
  return zlib.inflateSync(data, { maxOutputLength: 4 * 1024 * 1024 });
}

// ─── JPEG ────────────────────────────────────────────────────────

/** Segments d'un JPEG jusqu'au début des données d'image (`SOS`). */
export function readJpegSegments(file: Buffer): Piece[] {
  const segments: Piece[] = [];
  let offset = 2;
  while (offset + 4 <= file.length) {
    if (file[offset] !== 0xff) break;
    const marker = file[offset + 1];
    // Octets de remplissage entre deux segments.
    if (marker === 0xff) {
      offset++;
      continue;
    }
    // SOS : les données d'image commencent, on ne les parcourt pas.
    if (marker === 0xda || marker === 0xd9) break;
    const length = file.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > file.length) break;
    segments.push({ type: jpegMarkerName(marker), start: offset, end, dataStart: offset + 4, dataEnd: end });
    offset = end;
  }
  return segments;
}

function jpegMarkerName(marker: number): string {
  if (marker >= 0xe0 && marker <= 0xef) return `APP${marker - 0xe0}`;
  if (marker === 0xfe) return "COM";
  return `0x${marker.toString(16).toUpperCase()}`;
}

const EXIF_PREFIX = Buffer.from("Exif\0\0", "latin1");
const XMP_PREFIX = Buffer.from("http://ns.adobe.com/xap/1.0/\0", "latin1");
const XMP_EXTENSION_PREFIX = Buffer.from("http://ns.adobe.com/xmp/extension/\0", "latin1");

const startsWith = (file: Buffer, piece: Piece, prefix: Buffer) =>
  piece.dataEnd - piece.dataStart >= prefix.length &&
  file.subarray(piece.dataStart, piece.dataStart + prefix.length).equals(prefix);

/** Ce que porte un segment JPEG, ou `null` s'il fait partie de l'image. */
function jpegKind(file: Buffer, segment: Piece): CarrierKind | null {
  switch (segment.type) {
    case "APP1":
      if (startsWith(file, segment, EXIF_PREFIX)) return "exif";
      if (startsWith(file, segment, XMP_PREFIX) || startsWith(file, segment, XMP_EXTENSION_PREFIX)) return "xmp";
      return "other";
    case "APP11":
      return file.toString("latin1", segment.dataStart, segment.dataStart + 2) === "JP" ? "c2pa" : "other";
    case "APP13":
      return "iptc";
    case "COM":
      return "comment";
    default:
      // APP0 (JFIF), APP2 (profil de couleur), APP14 (Adobe) et les tables
      // servent au décodage ou à la colorimétrie.
      return null;
  }
}

/**
 * Rassemble le JUMBF réparti sur plusieurs segments APP11. Chaque segment
 * porte : « JP », un numéro de boîte, un numéro de paquet, puis l'en-tête de
 * la boîte (répété à chaque paquet) et un morceau de son contenu.
 */
function assembleJpegJumbf(file: Buffer, segments: Piece[]): Buffer | null {
  const packets = segments
    .filter((segment) => jpegKind(file, segment) === "c2pa" && segment.dataEnd - segment.dataStart > 16)
    .map((segment) => ({
      box: file.readUInt16BE(segment.dataStart + 2),
      sequence: file.readUInt32BE(segment.dataStart + 4),
      data: file.subarray(segment.dataStart + 8, segment.dataEnd),
    }));
  if (packets.length === 0) return null;
  const first = packets[0].box;
  const ordered = packets.filter((packet) => packet.box === first).sort((a, b) => a.sequence - b.sequence);
  return Buffer.concat(ordered.map((packet, index) => (index === 0 ? packet.data : packet.data.subarray(8))));
}

// ─── WebP ────────────────────────────────────────────────────────

/** Chunks RIFF d'un WebP. */
export function readWebpChunks(file: Buffer): Piece[] {
  const chunks: Piece[] = [];
  let offset = 12;
  while (offset + 8 <= file.length) {
    const type = file.toString("latin1", offset, offset + 4);
    const length = file.readUInt32LE(offset + 4);
    const dataEnd = offset + 8 + length;
    if (dataEnd > file.length) break;
    // Un chunk de taille impaire est suivi d'un octet de bourrage.
    const end = Math.min(file.length, dataEnd + (length & 1));
    chunks.push({ type, start: offset, end, dataStart: offset + 8, dataEnd });
    offset = end;
  }
  return chunks;
}

const WEBP_KINDS: Record<string, CarrierKind> = { C2PA: "c2pa", EXIF: "exif", "XMP ": "xmp" };

// ─── EXIF ────────────────────────────────────────────────────────

const EXIF_TAGS: Record<number, string> = {
  0x010e: "ImageDescription",
  0x010f: "Make",
  0x0110: "Model",
  0x0131: "Software",
  0x0132: "DateTime",
  0x013b: "Artist",
  0x8298: "Copyright",
  0x9003: "DateTimeOriginal",
  0x9286: "UserComment",
  0xa434: "LensModel",
};

interface ExifData {
  fields: Record<string, string>;
  orientation?: number;
}

/** Lit les quelques champs EXIF qui disent d'où vient l'image. `tiff` commence à l'en-tête TIFF. */
export function readExif(tiff: Buffer): ExifData {
  const result: ExifData = { fields: {} };
  if (tiff.length < 8) return result;
  const order = tiff.toString("latin1", 0, 2);
  if (order !== "II" && order !== "MM") return result;
  const little = order === "II";
  const u16 = (at: number) => (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
  const u32 = (at: number) => (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at));

  const readDirectory = (at: number, depth: number) => {
    if (depth > 2 || at <= 0 || at + 2 > tiff.length) return;
    const count = Math.min(u16(at), 200);
    for (let index = 0; index < count; index++) {
      const entry = at + 2 + index * 12;
      if (entry + 12 > tiff.length) return;
      const tag = u16(entry);
      const type = u16(entry + 2);
      const size = u32(entry + 4);
      if (tag === 0x0112 && type === 3) result.orientation = u16(entry + 8);
      else if (tag === 0x8769) readDirectory(u32(entry + 8), depth + 1);
      else if (tag === 0x8825) result.fields.GPS = "position présente";
      else if (EXIF_TAGS[tag] && (type === 2 || type === 7) && size > 0 && size < 4096) {
        const from = size <= 4 ? entry + 8 : u32(entry + 8);
        if (from + size > tiff.length) continue;
        let text = tiff.toString(type === 2 ? "latin1" : "utf8", from, from + size);
        // UserComment commence par huit octets qui nomment son encodage.
        if (tag === 0x9286) text = text.slice(8);
        text = text.replace(/\0/g, "").trim();
        if (text) result.fields[EXIF_TAGS[tag]] = text.slice(0, 500);
      }
    }
  };

  try {
    readDirectory(u32(4), 0);
  } catch {
    // Bloc EXIF abîmé : on garde ce qui a été lu.
  }
  return result;
}

/** Bloc EXIF minimal ne portant que l'orientation, pour que l'image garde son sens. */
function orientationExif(orientation: number): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write("MM", 0, "latin1");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8); // une seule entrée
  tiff.writeUInt16BE(0x0112, 10);
  tiff.writeUInt16BE(3, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt16BE(orientation, 18);
  tiff.writeUInt32BE(0, 22); // pas de répertoire suivant
  return tiff;
}

// ─── XMP et textes ───────────────────────────────────────────────

const XMP_FIELDS = [
  "photoshop:Credit",
  "dc:creator",
  "xmp:CreatorTool",
  "Iptc4xmpExt:DigitalSourceType",
  "photoshop:DateCreated",
  "xmp:CreateDate",
  "tiff:Software",
  "dc:rights",
];

/** Champs utiles d'un paquet XMP, attributs ou éléments. */
export function readXmp(packet: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const clean = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  for (const field of XMP_FIELDS) {
    const name = field.replace(/[.:]/g, "\\$&");
    const attribute = new RegExp(`${name}\\s*=\\s*"([^"]*)"`).exec(packet);
    const element = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(packet);
    const value = clean(attribute?.[1] ?? element?.[1] ?? "");
    if (value) fields[field] = value;
  }
  if (/xmpMM:History/.test(packet)) fields["xmpMM:History"] = "historique de modifications présent";
  return fields;
}

/** Bloc `parameters` de Stable Diffusion : prompt, prompt négatif, puis les réglages. */
export function parseParameters(text: string): ProvenanceText["parameters"] {
  const lines = text.split(/\r?\n/);
  const settingsAt = lines.findIndex((line) => /^Steps:\s*\d+/.test(line));
  const head = settingsAt === -1 ? lines : lines.slice(0, settingsAt);
  const negativeAt = head.findIndex((line) => line.startsWith("Negative prompt:"));
  const prompt = (negativeAt === -1 ? head : head.slice(0, negativeAt)).join("\n").trim();
  const negativePrompt =
    negativeAt === -1 ? undefined : head.slice(negativeAt).join("\n").replace(/^Negative prompt:\s*/, "").trim();

  const settings: Record<string, string> = {};
  if (settingsAt !== -1) {
    // « Clé: valeur, Clé: "valeur, avec virgule" »
    const pattern = /\s*([^:,]+):\s*("(?:[^"\\]|\\.)*"|[^,]*)(?:,|$)/g;
    for (const match of lines.slice(settingsAt).join(" ").matchAll(pattern)) {
      const key = match[1].trim();
      if (key) settings[key] = match[2].trim().slice(0, 200);
    }
  }
  return { prompt: prompt || undefined, negativePrompt: negativePrompt || undefined, settings };
}

function describeText(keyword: string, text: string): ProvenanceText {
  const entry: ProvenanceText = {
    keyword,
    text: text.slice(0, TEXT_PREVIEW_LIMIT),
    truncated: text.length > TEXT_PREVIEW_LIMIT,
  };
  if (keyword === "parameters") entry.parameters = parseParameters(text);
  return entry;
}

// ─── Lecture ─────────────────────────────────────────────────────

const UNSUPPORTED = "Le retrait sans recompression est géré pour les PNG, JPEG et WebP.";

/** Tout ce que le fichier porte comme marques d'origine, sans décoder l'image. */
export function inspectImage(file: Buffer): ProvenanceReport {
  const format = sniffFormat(file);
  const report: ProvenanceReport = {
    format,
    status: "none",
    bytes: file.length,
    carriers: [],
    removable: format !== null,
  };
  if (!format) return { ...report, status: "unsupported", removableReason: UNSUPPORTED };

  const carriers: ProvenanceCarrier[] = [];
  const texts: ProvenanceText[] = [];
  let jumbf: Buffer | null = null;
  let exif: ExifData | null = null;
  let xmp = "";

  if (format === "png") {
    for (const chunk of readPngChunks(file)) {
      if (chunk.type === "IHDR") {
        report.width = file.readUInt32BE(chunk.dataStart);
        report.height = file.readUInt32BE(chunk.dataStart + 4);
      }
      if (PNG_KEPT.has(chunk.type)) continue;
      const data = file.subarray(chunk.dataStart, chunk.dataEnd);
      let kind = PNG_KINDS[chunk.type] ?? "other";
      let label = chunk.type;
      if (chunk.type === "caBX") jumbf = data;
      else if (chunk.type === "eXIf") exif = readExif(data);
      else if (kind === "text") {
        const entry = readPngText(file, chunk);
        if (entry) {
          label = `${chunk.type} ${entry.keyword}`;
          if (entry.keyword === "XML:com.adobe.xmp") {
            kind = "xmp";
            xmp += entry.text;
          } else {
            texts.push(describeText(entry.keyword, entry.text));
          }
        }
      }
      carriers.push({ kind, label, bytes: chunk.end - chunk.start });
    }
  } else if (format === "jpeg") {
    const segments = readJpegSegments(file);
    for (const segment of segments) {
      const kind = jpegKind(file, segment);
      if (!kind) continue;
      if (kind === "exif") exif = readExif(file.subarray(segment.dataStart + EXIF_PREFIX.length, segment.dataEnd));
      else if (kind === "xmp" && startsWith(file, segment, XMP_PREFIX)) {
        xmp += file.toString("utf8", segment.dataStart + XMP_PREFIX.length, segment.dataEnd);
      } else if (kind === "comment") {
        texts.push(describeText("COM", file.toString("utf8", segment.dataStart, segment.dataEnd)));
      }
      carriers.push({ kind, label: segment.type, bytes: segment.end - segment.start });
    }
    jumbf = assembleJpegJumbf(file, segments);
  } else {
    for (const chunk of readWebpChunks(file)) {
      const kind = WEBP_KINDS[chunk.type];
      if (chunk.type === "VP8X" && chunk.dataEnd - chunk.dataStart >= 10) {
        report.width = file.readUIntLE(chunk.dataStart + 4, 3) + 1;
        report.height = file.readUIntLE(chunk.dataStart + 7, 3) + 1;
      }
      if (!kind) continue;
      const data = file.subarray(chunk.dataStart, chunk.dataEnd);
      if (kind === "c2pa") jumbf = data;
      else if (kind === "exif") {
        // Certains encodeurs gardent le préfixe « Exif\0\0 » des JPEG.
        exif = readExif(data.subarray(0, 6).equals(EXIF_PREFIX) ? data.subarray(6) : data);
      } else xmp += data.toString("utf8");
      carriers.push({ kind, label: chunk.type.trim(), bytes: chunk.end - chunk.start });
    }
  }

  report.carriers = carriers;
  if (jumbf) report.manifest = readManifest(jumbf, file);
  if (exif && Object.keys(exif.fields).length > 0) report.exif = exif.fields;
  if (xmp) {
    const fields = readXmp(xmp);
    if (Object.keys(fields).length > 0) report.xmp = fields;
  }
  if (texts.length > 0) report.texts = texts;
  report.status = jumbf ? "signed" : carriers.length > 0 ? "metadata" : "none";
  return report;
}

export function summarize(report: ProvenanceReport): ProvenanceSummary {
  return {
    status: report.status,
    generator: report.manifest?.generator?.name,
    digitalSourceType: report.manifest?.digitalSourceType,
  };
}

// ─── Retrait ─────────────────────────────────────────────────────

export interface StripResult {
  output: Buffer;
  /** Chunks ou segments retirés, dans l'ordre du fichier. */
  removed: string[];
}

/**
 * Réécrit le fichier sans ses métadonnées, sans toucher aux pixels. Une seule
 * chose est préservée d'un bloc EXIF retiré : l'orientation, sans laquelle
 * l'image s'afficherait couchée.
 */
export function stripMetadata(file: Buffer): StripResult {
  const format = sniffFormat(file);
  if (format === "png") return stripPng(file);
  if (format === "jpeg") return stripJpeg(file);
  if (format === "webp") return stripWebp(file);
  throw new Error(UNSUPPORTED);
}

const needsOrientation = (orientation?: number): orientation is number =>
  orientation !== undefined && orientation >= 2 && orientation <= 8;

function stripPng(file: Buffer): StripResult {
  const kept: Buffer[] = [file.subarray(0, 8)];
  const removed: string[] = [];
  for (const chunk of readPngChunks(file)) {
    if (PNG_KEPT.has(chunk.type)) {
      kept.push(file.subarray(chunk.start, chunk.end));
      continue;
    }
    removed.push(chunk.type);
    if (chunk.type !== "eXIf") continue;
    const { orientation } = readExif(file.subarray(chunk.dataStart, chunk.dataEnd));
    if (needsOrientation(orientation)) kept.push(pngChunk("eXIf", orientationExif(orientation)));
  }
  return { output: Buffer.concat(kept), removed };
}

function pngChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, "latin1");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

/** CRC-32 d'un chunk PNG, sur son type et ses données. */
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function stripJpeg(file: Buffer): StripResult {
  const kept: Buffer[] = [file.subarray(0, 2)];
  const removed: string[] = [];
  let cursor = 2;
  for (const segment of readJpegSegments(file)) {
    const kind = jpegKind(file, segment);
    if (!kind) continue;
    kept.push(file.subarray(cursor, segment.start));
    cursor = segment.end;
    removed.push(segment.type);
    if (kind !== "exif") continue;
    const { orientation } = readExif(file.subarray(segment.dataStart + EXIF_PREFIX.length, segment.dataEnd));
    if (!needsOrientation(orientation)) continue;
    const payload = Buffer.concat([EXIF_PREFIX, orientationExif(orientation)]);
    const header = Buffer.from([0xff, 0xe1, 0, 0]);
    header.writeUInt16BE(payload.length + 2, 2);
    kept.push(header, payload);
  }
  // Tout le reste, données d'image comprises, est recopié tel quel.
  kept.push(file.subarray(cursor));
  return { output: Buffer.concat(kept), removed };
}

function stripWebp(file: Buffer): StripResult {
  const kept: Buffer[] = [];
  const removed: string[] = [];
  let keepsExif = false;
  for (const chunk of readWebpChunks(file)) {
    if (!WEBP_KINDS[chunk.type]) {
      kept.push(Buffer.from(file.subarray(chunk.start, chunk.end)));
      continue;
    }
    removed.push(chunk.type.trim());
    if (chunk.type !== "EXIF") continue;
    const data = file.subarray(chunk.dataStart, chunk.dataEnd);
    const { orientation } = readExif(data.subarray(0, 6).equals(EXIF_PREFIX) ? data.subarray(6) : data);
    if (!needsOrientation(orientation)) continue;
    const payload = orientationExif(orientation);
    const header = Buffer.alloc(8);
    header.write("EXIF", 0, "latin1");
    header.writeUInt32LE(payload.length, 4);
    kept.push(header, payload);
    keepsExif = true;
  }
  // L'en-tête étendu annonce la présence d'EXIF (0x08) et de XMP (0x04).
  const extended = kept.find((chunk) => chunk.toString("latin1", 0, 4) === "VP8X");
  if (extended && extended.length > 8) extended[8] = (extended[8] & ~0x0c) | (keepsExif ? 0x08 : 0);

  const body = Buffer.concat(kept);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "latin1");
  return { output: Buffer.concat([header, body]), removed };
}
