/**
 * Polices ajoutées par le propriétaire de l'instance (§ 8 du dossier) : c'est
 * par là qu'il installe une police de lettrage dont il a la licence.
 *
 *   data/fonts/index.json     la liste : identifiant, nom affiché, format, poids
 *   data/fonts/<id>.<format>  le fichier, tel que déposé
 *
 * Un fichier n'est gardé qu'après contrôle : sa taille, son type réel lu sur
 * ses premiers octets (ni l'extension ni le type annoncé ne comptent), la
 * cohérence de son répertoire de tables et une table des noms lisible. Rien de
 * tout cela ne prouve qu'un navigateur saura la dessiner : c'est lui qui a le
 * dernier mot, et la page « Polices » le dit quand il refuse.
 *
 * Les fichiers ne sont jamais servis par une adresse : `readFontFile` les rend
 * à une fonction du module, donc à un compte connecté seulement.
 */

import fs from "fs";
import path from "path";
import { brotliDecompressSync } from "zlib";
import { BUNDLED_FONTS, customFontFamily, isBundledFamily, replaceFamilyInRegions, replaceFamilyInStyles } from "../custom-fonts";
import { dataRoot, readAllFolders, readAllPages, readChapter, readJson, writeChapter, writeFolder, writeJson, writePage } from "../store";
import { isId, type CustomFont, type FontFormat, type FontUsage } from "../types";

export const FONT_LIMITS = {
  /** Poids d'un fichier : une police de lettrage en fait rarement le dixième. */
  bytes: 5 * 1024 * 1024,
  /** Polices gardées en même temps. */
  count: 60,
  /** Longueur d'un nom affiché. */
  name: 80,
  /** Taille d'une police WOFF2 une fois décompressée. */
  unpackedBytes: 40 * 1024 * 1024,
  /** Tables d'un fichier : une vraie police en compte quelques dizaines. */
  tables: 256,
};

const FORMATS: FontFormat[] = ["ttf", "otf", "woff2"];

// Le chemin dépend de `setDataRoot` (les tests) : sans cette mention, le build
// suivrait tout le projet à la trace pour trouver ce qu'il peut lire.
const fontsDir = () => path.join(/* turbopackIgnore: true */ dataRoot(), "fonts");
const indexFile = () => path.join(fontsDir(), "index.json");
/** `id` et `format` viennent toujours de la liste, jamais de la demande. */
const fontFile = (font: Pick<CustomFont, "id" | "format">) => path.join(fontsDir(), `${font.id}.${font.format}`);

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
  if (count === 0 || count > FONT_LIMITS.tables) refuse("son répertoire de tables est incohérent");
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
function cleanName(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, FONT_LIMITS.name);
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
  if (count === 0 || count > FONT_LIMITS.tables) refuse("son répertoire de tables est incohérent");
  if (unpacked > FONT_LIMITS.unpackedBytes) refuse("il est trop gros une fois décompressé");

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
    if (stream > FONT_LIMITS.unpackedBytes) refuse("il est trop gros une fois décompressé");
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
  if (buffer.length > FONT_LIMITS.bytes) {
    throw new Error(`Cette police est trop lourde : ${FONT_LIMITS.bytes / (1024 * 1024)} Mo au plus.`);
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

// ─── Liste ───────────────────────────────────────────────────────

interface StoredIndex {
  version: 1;
  fonts: CustomFont[];
}

function isStoredFont(value: unknown): value is CustomFont {
  if (!value || typeof value !== "object") return false;
  const font = value as Record<string, unknown>;
  return (
    isId(font.id) &&
    font.family === customFontFamily(font.id) &&
    typeof font.name === "string" &&
    typeof font.originalName === "string" &&
    FORMATS.includes(font.format as FontFormat) &&
    typeof font.size === "number" &&
    typeof font.addedAt === "number"
  );
}

export function listFonts(): CustomFont[] {
  const stored = readJson<StoredIndex>(indexFile());
  const fonts = stored?.version === 1 && Array.isArray(stored.fonts) ? stored.fonts.filter(isStoredFont) : [];
  return fonts.sort((left, right) => left.name.localeCompare(right.name, "fr"));
}

function writeFonts(fonts: CustomFont[]) {
  writeJson(indexFile(), { version: 1, fonts } satisfies StoredIndex);
}

function requireFont(id: unknown): CustomFont {
  const font = isId(id) ? listFonts().find((entry) => entry.id === id) : undefined;
  if (!font) throw new Error("Police introuvable.");
  return font;
}

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function freshFontId(taken: ReadonlySet<string>): string {
  for (;;) {
    const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join("");
    if (!taken.has(id)) return id;
  }
}

/** Nom affiché : sur une ligne, borné, et que ne porte aucune autre police. */
function cleanDisplayName(value: unknown, fonts: readonly CustomFont[], exceptId?: string): string {
  if (typeof value !== "string") throw new Error("Donnez un nom à la police.");
  const name = cleanName(value);
  if (!name) throw new Error("Donnez un nom à la police.");
  const lowered = name.toLocaleLowerCase("fr");
  if (BUNDLED_FONTS.some((font) => font.family.toLocaleLowerCase("fr") === lowered)) {
    throw new Error(`« ${name} » est déjà le nom d'une police fournie : choisissez-en un autre.`);
  }
  if (fonts.some((font) => font.id !== exceptId && font.name.toLocaleLowerCase("fr") === lowered)) {
    throw new Error(`Une police ajoutée s'appelle déjà « ${name} ».`);
  }
  return name;
}

/** Premier nom libre à partir de celui du fichier : « Nom », « Nom 2 », « Nom 3 »… */
function availableName(base: string, fonts: readonly CustomFont[]): string {
  for (let attempt = 1; ; attempt++) {
    const candidate = attempt === 1 ? base : `${base.slice(0, FONT_LIMITS.name - 4)} ${attempt}`;
    try {
      return cleanDisplayName(candidate, fonts);
    } catch {
      // Nom pris : on essaie le suivant.
    }
  }
}

// ─── Ajout, renommage, lecture ───────────────────────────────────

/**
 * Ajoute une police. `data` est le contenu du fichier ; `name`, facultatif, le
 * nom à afficher (sinon celui que porte le fichier).
 */
export function addFont(input: unknown): CustomFont {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Police invalide.");
  const { data, name } = input as { data?: unknown; name?: unknown };
  if (!(data instanceof Uint8Array)) throw new Error("Fichier de police manquant.");

  const inspection = inspectFont(data);
  const fonts = listFonts();
  if (fonts.length >= FONT_LIMITS.count) {
    throw new Error(`Le module garde ${FONT_LIMITS.count} polices au plus : retirez-en une avant d'en ajouter.`);
  }
  const displayName = name === undefined || name === null || name === "" ? availableName(inspection.family, fonts) : cleanDisplayName(name, fonts);

  const id = freshFontId(new Set(fonts.map((font) => font.id)));
  const font: CustomFont = {
    id,
    family: customFontFamily(id),
    name: displayName,
    originalName: inspection.family,
    format: inspection.format,
    size: data.byteLength,
    addedAt: Date.now(),
  };
  fs.mkdirSync(fontsDir(), { recursive: true });
  const target = fontFile(font);
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, data);
    fs.renameSync(temporary, target);
    writeFonts([...fonts, font]);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    fs.rmSync(target, { force: true });
    throw error;
  }
  return font;
}

/** Change le nom affiché. La famille CSS ne bouge pas : aucune page n'est à réécrire. */
export function renameFont(id: unknown, name: unknown): CustomFont {
  const font = requireFont(id);
  const fonts = listFonts();
  const renamed = { ...font, name: cleanDisplayName(name, fonts, font.id) };
  writeFonts(fonts.map((entry) => (entry.id === font.id ? renamed : entry)));
  return renamed;
}

/** Contenu d'une police, pour le navigateur d'un compte connecté. */
export function readFontFile(id: unknown): Buffer {
  const font = requireFont(id);
  try {
    return fs.readFileSync(/* turbopackIgnore: true */ fontFile(font));
  } catch {
    throw new Error(`Le fichier de la police « ${font.name} » est introuvable sur le serveur.`);
  }
}

// ─── Usage et retrait ────────────────────────────────────────────

function chaptersOf(folders: ReturnType<typeof readAllFolders>) {
  return folders.flatMap((folder) => folder.chapterIds.flatMap((chapterId) => readChapter(chapterId) ?? []));
}

/** Ce qui porte une famille : zones des pages, styles des chapitres, styles par défaut des dossiers. */
export function fontUsageOf(family: string): FontUsage {
  const folders = readAllFolders();
  const carries = (styles: Record<string, { font?: string }> | undefined) => Object.values(styles ?? {}).some((style) => style?.font === family);
  return {
    pages: readAllPages().filter((page) => page.regions.some((region) => region.text.style?.font === family)).length,
    chapters: chaptersOf(folders).filter((chapter) => carries(chapter.settings?.styles)).length,
    folders: folders.filter((folder) => carries(folder.defaults?.styles)).length,
  };
}

export function getFontUsage(id: unknown): FontUsage {
  return fontUsageOf(requireFont(id).family);
}

const inUse = (usage: FontUsage) => usage.pages + usage.chapters + usage.folders > 0;

function usageSentence(usage: FontUsage): string {
  const parts = [
    usage.pages > 0 ? `${usage.pages} page${usage.pages > 1 ? "s" : ""}` : "",
    usage.chapters > 0 ? `${usage.chapters} chapitre${usage.chapters > 1 ? "s" : ""}` : "",
    usage.folders > 0 ? `${usage.folders} dossier${usage.folders > 1 ? "s" : ""}` : "",
  ].filter(Boolean);
  return parts.join(", ");
}

/**
 * Retire une police. Une police encore utilisée ne disparaît pas en silence :
 * sans `replaceWith`, le retrait est refusé et le message dit ce qui la porte ;
 * avec, tout ce qui la portait passe à la police de remplacement avant que le
 * fichier soit effacé. Les pages réécrites changent de révision : un atelier
 * resté ouvert dessus est invité à recharger au lieu d'y remettre l'ancienne.
 */
export function removeFont(id: unknown, options?: unknown): { removed: boolean; replaced: FontUsage } {
  const font = requireFont(id);
  const fonts = listFonts();
  const usage = fontUsageOf(font.family);
  const replaced: FontUsage = { pages: 0, chapters: 0, folders: 0 };

  if (inUse(usage)) {
    const replaceWith = options && typeof options === "object" ? (options as { replaceWith?: unknown }).replaceWith : undefined;
    if (replaceWith === undefined || replaceWith === null) {
      throw new Error(`« ${font.name} » est encore utilisée (${usageSentence(usage)}) : choisissez la police qui la remplacera.`);
    }
    const known = typeof replaceWith === "string" && (isBundledFamily(replaceWith) || fonts.some((entry) => entry.family === replaceWith));
    if (!known || replaceWith === font.family) throw new Error("Police de remplacement inconnue.");
    const target = replaceWith as string;

    const now = Date.now();
    for (const page of readAllPages()) {
      const regions = replaceFamilyInRegions(page.regions, font.family, target);
      if (regions === page.regions) continue;
      writePage({ ...page, regions, revision: page.revision + 1, updatedAt: now });
      replaced.pages++;
    }
    const folders = readAllFolders();
    for (const chapter of chaptersOf(folders)) {
      const styles = replaceFamilyInStyles(chapter.settings.styles, font.family, target);
      if (styles === chapter.settings.styles) continue;
      writeChapter({ ...chapter, settings: { ...chapter.settings, styles }, updatedAt: now });
      replaced.chapters++;
    }
    for (const folder of folders) {
      const styles = replaceFamilyInStyles(folder.defaults.styles, font.family, target);
      if (styles === folder.defaults.styles) continue;
      writeFolder({ ...folder, defaults: { ...folder.defaults, styles }, updatedAt: now });
      replaced.folders++;
    }
  }

  writeFonts(fonts.filter((entry) => entry.id !== font.id));
  fs.rmSync(/* turbopackIgnore: true */ fontFile(font), { force: true });
  return { removed: true, replaced };
}
