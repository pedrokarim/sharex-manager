/**
 * Contrôle d'un fichier de police déposé par un utilisateur, partagé par les
 * modules qui acceptent des polices (Scan Studio, Image de marque).
 *
 * Un fichier n'est gardé qu'après contrôle : sa taille, son type réel lu sur
 * ses premiers octets (ni l'extension ni le type annoncé ne comptent), la
 * cohérence de son répertoire de tables et une table des noms lisible. Rien de
 * tout cela ne prouve qu'un navigateur saura la dessiner : c'est lui qui a le
 * dernier mot.
 */

import { brotliDecompressSync } from "zlib";

export type FontFormat = "ttf" | "otf" | "woff2";

export const FONT_FILE_LIMITS = {
  /** Poids d'un fichier : une police en fait rarement le dixième. */
  bytes: 5 * 1024 * 1024,
  /** Longueur d'un nom de famille ou d'un nom affiché. */
  name: 80,
  /** Taille d'une police WOFF2 une fois décompressée. */
  unpackedBytes: 40 * 1024 * 1024,
  /** Tables d'un fichier : une vraie police en compte quelques dizaines. */
  tables: 256,
};

// ─── Lecture du fichier ──────────────────────────────────────────

export interface FontInspection {
  format: FontFormat;
  /** Nom de famille lu dans la table des noms. */
  family: string;
}

class FontRefusal extends Error {}

function refuse(reason: string): never {
  throw new FontRefusal(reason);
}

const tagAt = (buffer: Buffer, offset: number) => buffer.toString("latin1", offset, offset + 4);

/** Signatures d'une police TrueType : la version 1.0, ou « true » chez Apple. */
function sfntKind(buffer: Buffer, offset: number): "ttf" | "otf" | "collection" | null {
  if (buffer.length < offset + 4) return null;
  const magic = buffer.readUInt32BE(offset);
  if (magic === 0x00010000 || tagAt(buffer, offset) === "true") return "ttf";
  if (tagAt(buffer, offset) === "OTTO") return "otf";
  if (tagAt(buffer, offset) === "ttcf") return "collection";
  return null;
}

interface TableEntry {
  offset: number;
  length: number;
}

/** Tables sans lesquelles un fichier n'est pas une police dessinable. */
function assertUsableTables(tables: Map<string, TableEntry>) {
  for (const tag of ["name", "cmap", "head"]) {
    if (!tables.has(tag)) refuse(`il lui manque la table « ${tag.trim()} »`);
  }
  if (!tables.has("glyf") && !tables.has("CFF ") && !tables.has("CFF2")) refuse("il ne contient aucun dessin de lettres");
}

/** Répertoire des tables d'un fichier TrueType ou OpenType. */
function readSfntDirectory(buffer: Buffer): Map<string, TableEntry> {
  if (buffer.length < 12) refuse("le fichier est tronqué");
  const count = buffer.readUInt16BE(4);
  if (count === 0 || count > FONT_FILE_LIMITS.tables) refuse("son répertoire de tables est incohérent");
  if (buffer.length < 12 + count * 16) refuse("le fichier est tronqué");

  const tables = new Map<string, TableEntry>();
  for (let index = 0; index < count; index++) {
    const record = 12 + index * 16;
    const offset = buffer.readUInt32BE(record + 8);
    const length = buffer.readUInt32BE(record + 12);
    if (offset + length > buffer.length) refuse("une de ses tables dépasse la fin du fichier");
    tables.set(tagAt(buffer, record), { offset, length });
  }
  return tables;
}

/** Texte d'un nom, sans caractère de contrôle, sur une ligne. */
export function cleanName(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, FONT_FILE_LIMITS.name);
}

function decodeUtf16BE(bytes: Buffer): string {
  let text = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) text += String.fromCharCode(bytes.readUInt16BE(index));
  return text;
}

/**
 * Nom de famille d'une table `name`. On préfère la famille typographique (16)
 * à la famille (1) puis au nom complet (4), et les noms Unicode aux noms du
 * vieux Macintosh. Rend `null` quand rien n'est lisible.
 */
export function readFamilyName(table: Buffer): string | null {
  if (table.length < 6) return null;
  const count = table.readUInt16BE(2);
  const strings = table.readUInt16BE(4);
  if (count === 0 || count > 4096 || table.length < 6 + count * 12) return null;

  let best: { rank: number; text: string } | null = null;
  for (let index = 0; index < count; index++) {
    const record = 6 + index * 12;
    const platform = table.readUInt16BE(record);
    const language = table.readUInt16BE(record + 4);
    const nameId = table.readUInt16BE(record + 6);
    const length = table.readUInt16BE(record + 8);
    const offset = strings + table.readUInt16BE(record + 10);
    const nameRank = nameId === 16 ? 0 : nameId === 1 ? 1 : nameId === 4 ? 2 : -1;
    if (nameRank < 0 || length === 0 || offset + length > table.length) continue;

    const bytes = table.subarray(offset, offset + length);
    let text: string;
    let platformRank: number;
    if (platform === 3 || platform === 0) {
      text = decodeUtf16BE(bytes);
      // Windows en anglais des États-Unis d'abord : c'est le nom que portent les outils.
      platformRank = platform === 3 && language === 0x0409 ? 0 : 1;
    } else if (platform === 1) {
      text = bytes.toString("latin1");
      platformRank = 2;
    } else {
      continue;
    }
    const cleaned = cleanName(text);
    // Un nom sans une seule lettre ni un chiffre n'en est pas un.
    if (!/[\p{L}\p{N}]/u.test(cleaned)) continue;
    const rank = nameRank * 3 + platformRank;
    if (!best || rank < best.rank) best = { rank, text: cleaned };
  }
  return best?.text ?? null;
}

function inspectSfnt(buffer: Buffer, format: "ttf" | "otf"): FontInspection {
  const tables = readSfntDirectory(buffer);
  assertUsableTables(tables);
  const name = tables.get("name")!;
  const family = readFamilyName(buffer.subarray(name.offset, name.offset + name.length));
  if (!family) refuse("sa table des noms est illisible");
  return { format, family };
}

/** Tables connues de WOFF2, dans l'ordre de leur numéro (les 63 premières valeurs du drapeau). */
const WOFF2_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT",
  "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH",
  "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar",
  "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
];

const WOFF2_HEADER = 48;

/** Entier de longueur variable de WOFF2 (« UIntBase128 ») : cinq octets au plus, sans zéro de tête. */
function readBase128(buffer: Buffer, position: number): { value: number; next: number } {
  let value = 0;
  for (let index = 0; index < 5; index++) {
    if (position + index >= buffer.length) refuse("le fichier est tronqué");
    const byte = buffer[position + index];
    if (index === 0 && byte === 0x80) refuse("son répertoire de tables est incohérent");
    if (value > 0x1ffffff) refuse("son répertoire de tables est incohérent");
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, next: position + index + 1 };
  }
  return refuse("son répertoire de tables est incohérent");
}

function inspectWoff2(buffer: Buffer): FontInspection {
  if (buffer.length < WOFF2_HEADER) refuse("le fichier est tronqué");
  const flavor = sfntKind(buffer, 4);
  if (flavor === "collection") refuse("c'est une collection de polices : déposez une police à la fois");
  if (!flavor) refuse("ce qu'il emballe n'est pas une police TrueType ni OpenType");
  if (buffer.readUInt32BE(8) !== buffer.length) refuse("sa taille annoncée ne correspond pas au fichier");
  const count = buffer.readUInt16BE(12);
  const unpacked = buffer.readUInt32BE(16);
  const compressed = buffer.readUInt32BE(20);
  if (count === 0 || count > FONT_FILE_LIMITS.tables) refuse("son répertoire de tables est incohérent");
  if (unpacked > FONT_FILE_LIMITS.unpackedBytes) refuse("il est trop gros une fois décompressé");

  // Le répertoire : un drapeau, parfois une étiquette, la longueur d'origine, et la longueur transformée s'il y en a une.
  let position = WOFF2_HEADER;
  let stream = 0;
  const tables = new Map<string, TableEntry>();
  for (let index = 0; index < count; index++) {
    if (position >= buffer.length) refuse("le fichier est tronqué");
    const flags = buffer[position++];
    const known = flags & 0x3f;
    let tag: string;
    if (known === 0x3f) {
      if (position + 4 > buffer.length) refuse("le fichier est tronqué");
      tag = tagAt(buffer, position);
      position += 4;
    } else {
      tag = WOFF2_TAGS[known];
    }
    const original = readBase128(buffer, position);
    position = original.next;
    let length = original.value;
    const version = flags >> 6;
    // `glyf` et `loca` sont transformées par défaut (version 0) ; les autres tables seulement si la version le dit.
    const transformed = tag === "glyf" || tag === "loca" ? version === 0 : version !== 0;
    if (transformed) {
      const packed = readBase128(buffer, position);
      position = packed.next;
      length = packed.value;
    }
    tables.set(tag, { offset: stream, length });
    stream += length;
    if (stream > FONT_FILE_LIMITS.unpackedBytes) refuse("il est trop gros une fois décompressé");
  }
  assertUsableTables(tables);
  if (position + compressed > buffer.length) refuse("le fichier est tronqué");

  let data: Buffer;
  try {
    // Borné : un fichier de quelques kilo-octets ne doit pas pouvoir en occuper des gigas en mémoire.
    data = brotliDecompressSync(buffer.subarray(position, position + compressed), { maxOutputLength: stream });
  } catch {
    return refuse("ses données compressées sont illisibles");
  }
  const name = tables.get("name")!;
  if (name.offset + name.length > data.length) refuse("ses données compressées sont incomplètes");
  const family = readFamilyName(data.subarray(name.offset, name.offset + name.length));
  if (!family) refuse("sa table des noms est illisible");
  return { format: "woff2", family };
}

/**
 * Contrôle un fichier de police et rend son format réel et son nom de famille.
 * Lève une erreur en français, qui dit pourquoi le fichier est refusé.
 */
export function inspectFont(data: Uint8Array): FontInspection {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (buffer.length === 0) throw new Error("Ce fichier est vide.");
  if (buffer.length > FONT_FILE_LIMITS.bytes) {
    throw new Error(`Cette police est trop lourde : ${FONT_FILE_LIMITS.bytes / (1024 * 1024)} Mo au plus.`);
  }
  try {
    const signature = buffer.length >= 4 ? tagAt(buffer, 0) : "";
    if (signature === "wOF2") return inspectWoff2(buffer);
    if (signature === "wOFF") refuse("c'est une police WOFF de première version : déposez-la en WOFF2, TTF ou OTF");
    const kind = sfntKind(buffer, 0);
    if (kind === "collection") refuse("c'est une collection de polices (.ttc) : déposez une police à la fois");
    if (!kind) refuse("ce n'est pas une police TTF, OTF ni WOFF2, quelle que soit son extension");
    return inspectSfnt(buffer, kind);
  } catch (error) {
    if (error instanceof FontRefusal) throw new Error(`Ce fichier n'est pas une police utilisable : ${error.message}.`);
    // Une lecture hors du fichier (répertoire mensonger) vaut un refus, pas une panne.
    throw new Error("Ce fichier n'est pas une police utilisable : il est mal formé.");
  }
}
