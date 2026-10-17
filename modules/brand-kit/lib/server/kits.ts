/**
 * Règles du module : fiches, fichiers d'une marque, polices, archives.
 *
 * Un nom de fichier ne vient jamais du navigateur pour être lu ou écrit tel
 * quel : un fichier déposé est retrouvé dans le dépôt de la route d'upload,
 * ouvert pour vérifier qu'il s'agit bien d'une image, puis rangé sous un nom
 * neuf ; un fichier de la marque est toujours désigné par son identifiant.
 */

import fs from "fs";
import path from "path";
import sharp, { type Metadata } from "sharp";
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { getAbsoluteUploadPath } from "@/lib/config";
import { announceNewUpload } from "@/lib/gallery-events";
import { FONT_FILE_LIMITS, inspectFont } from "@/lib/fonts/inspect";
import { createDefaultKit, newItemId } from "../defaults";
import { FORMATS } from "../formats";
import { formatImageAsset, proposePoseTags, sanitizePoseTags } from "../mascot";
import { toBrandTheme, watermarkAsset } from "../theme";
import { sanitizeKit } from "../validate";
import {
  ASSET_KINDS,
  FORMAT_IDS,
  KIT_LIMITS,
  brandFontFamily,
  isItemId,
  isKitId,
  kitAssetUrl,
  kitExportUrl,
  type AssetKind,
  type BrandAsset,
  type BrandFont,
  type BrandKit,
  type BrandTheme,
  type FormatId,
  type KitSummary,
} from "../types";
import { cutOutImage } from "./cutout-image";
import { isFileName, kitArea, kitDir, listKitFiles, readKit, removeKitDir, uploadsDir, writeKit } from "./store";

/** Au-delà, une image n'a rien à faire dans une marque : un logo pèse quelques centaines de kilo-octets. */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MAX_SVG_BYTES = 1024 * 1024;
const MAX_ARCHIVE_BYTES = 15 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 200;
const MAX_ARCHIVE_UNPACKED = 60 * 1024 * 1024;

const IMAGE_EXTENSIONS: Record<string, string> = { png: "png", jpeg: "jpg", webp: "webp", gif: "gif" };

export { FORMAT_IDS, type FormatId };

// ─── Lecture ─────────────────────────────────────────────────────

export function requireKit(id: unknown): BrandKit {
  const kit = readKit(id);
  if (!kit) throw new Error("Image de marque introuvable");
  return kit;
}

function summarize(kit: BrandKit): KitSummary {
  const logo = kit.assets.find((asset) => asset.id === kit.logoAssetId);
  const banner = listFormatExports(kit.id).find((entry) => entry.format === "banner");
  return {
    id: kit.id,
    name: kit.name,
    tagline: kit.tagline,
    palette: kit.palette,
    logoUrl: logo ? kitAssetUrl(kit.id, logo.file) : undefined,
    bannerUrl: banner?.url,
    accountIds: kit.publishing.accountIds,
    ...(kit.voice ? { voice: kit.voice } : {}),
    isDefault: kit.isDefault,
    updatedAt: kit.updatedAt,
  };
}

export function listKits(): KitSummary[] {
  return listKitFiles()
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.updatedAt - a.updatedAt)
    .map(summarize);
}

export function getBrandTheme(id: unknown): BrandTheme {
  return toBrandTheme(requireKit(id));
}

// ─── Écriture ────────────────────────────────────────────────────

function touch(kit: BrandKit): BrandKit {
  const saved = { ...kit, updatedAt: Math.max(Date.now(), kit.updatedAt + 1) };
  writeKit(saved);
  return saved;
}

export function createKit(input: { name?: unknown; from?: unknown }): BrandKit {
  const name = typeof input?.name === "string" ? input.name.replace(/\s+/g, " ").trim().slice(0, KIT_LIMITS.name) : "";
  if (!name) throw new Error("Donnez un nom à l'image de marque.");
  if (input.from !== undefined && input.from !== null && input.from !== "") {
    return duplicateKit(input.from, name);
  }
  const kit = createDefaultKit(name);
  // La première marque devient celle par défaut : il n'y a rien d'autre à présélectionner.
  if (listKitFiles().length === 0) kit.isDefault = true;
  writeKit(kit);
  return kit;
}

export function duplicateKit(sourceId: unknown, name?: string): BrandKit {
  const source = requireKit(sourceId);
  const fresh = createDefaultKit(name || `${source.name} (copie)`);
  const copy: BrandKit = { ...structuredClone(source), id: fresh.id, name: fresh.name, isDefault: false, createdAt: fresh.createdAt, updatedAt: fresh.updatedAt };
  // Les polices portent la marque dans leur famille : on la réécrit partout.
  const rename = new Map(source.fonts.map((font) => [font.family, brandFontFamily(copy.id, font.id)]));
  copy.fonts = copy.fonts.map((font) => ({ ...font, family: rename.get(font.family)! }));
  for (const style of Object.values(copy.textStyles)) style.font = rename.get(style.font) ?? style.font;
  writeKit(copy);
  for (const area of ["assets", "fonts"] as const) {
    const from = kitArea(source.id, area);
    if (fs.existsSync(from)) fs.cpSync(from, kitArea(copy.id, area), { recursive: true });
  }
  return copy;
}

export function saveKit(input: unknown, expectedUpdatedAt?: unknown): BrandKit {
  const id = (input as { id?: unknown })?.id;
  const stored = requireKit(id);
  if (expectedUpdatedAt !== undefined && Number(expectedUpdatedAt) !== stored.updatedAt) {
    throw new Error("Cette image de marque a changé ailleurs entre-temps : rechargez-la avant de continuer.");
  }
  return touch(sanitizeKit(input, stored));
}

export function deleteKit(id: unknown) {
  const kit = requireKit(id);
  removeKitDir(kit.id);
  if (kit.isDefault) {
    const [next] = listKitFiles().sort((a, b) => b.updatedAt - a.updatedAt);
    if (next) writeKit({ ...next, isDefault: true });
  }
}

export function setDefaultKit(id: unknown): KitSummary[] {
  const target = requireKit(id);
  for (const kit of listKitFiles()) {
    const isDefault = kit.id === target.id;
    if (kit.isDefault !== isDefault) writeKit({ ...kit, isDefault });
  }
  return listKits();
}

// ─── Images ──────────────────────────────────────────────────────

function assertKind(kind: unknown): asserts kind is AssetKind {
  if (!ASSET_KINDS.includes(kind as AssetKind)) throw new Error("Type d'image inconnu");
}

/** Ouvre une image et la range dans la marque sous un nom neuf. */
async function storeImage(kit: BrandKit, buffer: Buffer, kind: AssetKind, label: string, extra: Partial<BrandAsset> = {}): Promise<BrandAsset> {
  if (kit.assets.length >= KIT_LIMITS.assets) throw new Error(`Une marque garde ${KIT_LIMITS.assets} images au plus.`);
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("Image trop lourde (20 Mo au plus).");
  let metadata: Metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new Error(`« ${label} » n'est pas une image lisible.`);
  }
  const extension = IMAGE_EXTENSIONS[metadata.format ?? ""];
  if (!extension || !metadata.width || !metadata.height) throw new Error("Image refusée : PNG, JPEG, WebP ou GIF seulement.");
  const turned = (metadata.orientation ?? 1) >= 5;
  const id = newItemId("ast");
  const file = `${id}.${extension}`;
  fs.mkdirSync(kitArea(kit.id, "assets"), { recursive: true });
  fs.writeFileSync(path.join(kitArea(kit.id, "assets"), file), buffer, { flag: "wx" });
  return {
    id,
    file,
    kind,
    label: label.replace(/\s+/g, " ").trim().slice(0, KIT_LIMITS.label) || "Image",
    width: turned ? metadata.height : metadata.width,
    height: turned ? metadata.width : metadata.height,
    createdAt: Date.now(),
    ...extra,
  };
}

/** Le premier logo ajouté devient le logo principal, et le premier logo réduit la marque du filigrane. */
function adoptAsset(kit: BrandKit, asset: BrandAsset): BrandKit {
  const next: BrandKit = { ...kit, assets: [...kit.assets, asset] };
  if (asset.kind === "logo" && !next.logoAssetId) next.logoAssetId = asset.id;
  if (asset.kind === "logo-mark" && !next.markAssetId) next.markAssetId = asset.id;
  if ((asset.kind === "logo" || asset.kind === "logo-mark") && !next.watermark) {
    next.watermark = { assetId: asset.id, anchor: "bottom-right", size: 0.14, opacity: 0.85, margin: 0.035, startSeconds: 0 };
  }
  if (asset.kind === "mascot-sheet" || asset.kind === "mascot-pose") {
    const mascot = next.mascot ?? { identityPrompt: "", sheetAssetIds: [], poseAssetIds: [] };
    next.mascot = {
      ...mascot,
      sheetAssetIds: asset.kind === "mascot-sheet" ? [...mascot.sheetAssetIds, asset.id] : mascot.sheetAssetIds,
      poseAssetIds: asset.kind === "mascot-pose" ? [...mascot.poseAssetIds, asset.id] : mascot.poseAssetIds,
    };
  }
  return next;
}

/**
 * Range une image dans la marque. Une pose de la mascotte est d'abord
 * détourée (fond vert, ou lueur d'un fond transparent) puis recadrée, et
 * reçoit des étiquettes : celles fournies, sinon proposées d'après son libellé.
 */
export async function addImageToKit(kitId: unknown, buffer: Buffer, kind: unknown, label: string, extra: Partial<BrandAsset> = {}): Promise<{ kit: BrandKit; asset: BrandAsset }> {
  assertKind(kind);
  const kit = requireKit(kitId);
  if (kind === "mascot-pose" && (kit.mascot?.poseAssetIds.length ?? 0) >= KIT_LIMITS.poses) throw new Error(`Une mascotte garde ${KIT_LIMITS.poses} poses au plus.`);
  const image = kind === "mascot-pose" && buffer.length <= MAX_IMAGE_BYTES ? await cutOutImage(buffer).then((result) => result.buffer, () => buffer) : buffer;
  const stored = await storeImage(kit, image, kind, label, extra);
  const asset: BrandAsset = kind === "mascot-pose" ? { ...stored, pose: sanitizePoseTags(extra.pose, proposePoseTags(stored)) } : stored;
  return { kit: touch(adoptAsset(kit, asset)), asset };
}

/** Range un fichier déposé par la route d'upload des modules (`data/assets/`). */
export async function registerKitAsset(kitId: unknown, input: { file?: unknown; kind?: unknown; label?: unknown }) {
  if (!isFileName(input?.file)) throw new Error("Nom de fichier invalide");
  const dropped = path.join(uploadsDir(), input.file);
  if (!fs.existsSync(dropped)) throw new Error("Fichier déposé introuvable");
  try {
    const buffer = fs.readFileSync(dropped);
    return await addImageToKit(kitId, buffer, input.kind, typeof input.label === "string" ? input.label : input.file);
  } finally {
    fs.rmSync(dropped, { force: true });
  }
}

function isGalleryFileName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 255 && value === path.basename(value) && !value.startsWith(".") && !/[\\/\0]/.test(value);
}

/** Copie une image de la galerie dans la marque. */
export async function importGalleryAsset(kitId: unknown, input: { name?: unknown; kind?: unknown }) {
  if (!isGalleryFileName(input?.name)) throw new Error("Nom de fichier invalide");
  const uploads = path.resolve(getAbsoluteUploadPath());
  const source = path.join(uploads, input.name);
  // `lstat` : un lien symbolique posé dans les uploads n'est pas suivi.
  const stats = fs.lstatSync(source, { throwIfNoEntry: false });
  if (!stats?.isFile()) throw new Error(`Image introuvable dans la galerie : « ${input.name} ».`);
  if (stats.size > MAX_IMAGE_BYTES) throw new Error("Image trop lourde (20 Mo au plus).");
  return addImageToKit(kitId, fs.readFileSync(source), input.kind, input.name);
}

/**
 * Un SVG peut porter du script, des entités ou des références externes : il
 * est refusé s'il en contient, puis rastérisé en PNG. Aucun SVG n'est gardé
 * ni servi.
 */
export function assertSafeSvg(svg: string) {
  if (Buffer.byteLength(svg) > MAX_SVG_BYTES) throw new Error("SVG trop lourd (1 Mo au plus).");
  if (!/<svg[\s>]/i.test(svg)) throw new Error("Ce fichier n'est pas un SVG.");
  const forbidden = [
    /<!ENTITY/i,
    /<!DOCTYPE/i,
    /<script[\s>]/i,
    /<foreignObject[\s>]/i,
    /\son[a-z]+\s*=/i,
    /javascript:/i,
    // Références : seulement vers le document lui-même (#id) ou une image embarquée.
    /(?:xlink:)?href\s*=\s*["'](?!#|data:image\/(?:png|jpeg|webp|gif);base64,)/i,
    /url\(\s*["']?(?!#)/i,
    /@import/i,
  ];
  if (forbidden.some((pattern) => pattern.test(svg))) {
    throw new Error("Ce SVG contient un script, une entité ou une référence externe : il est refusé.");
  }
}

export async function importSvgAsset(kitId: unknown, input: { svg?: unknown; kind?: unknown; label?: unknown }) {
  if (typeof input?.svg !== "string") throw new Error("SVG manquant");
  assertSafeSvg(input.svg);
  let png: Buffer;
  try {
    png = await sharp(Buffer.from(input.svg), { density: 300, limitInputPixels: MAX_PIXELS })
      .resize(2048, 2048, { fit: "inside", withoutEnlargement: false })
      .png()
      .toBuffer();
  } catch {
    throw new Error("Ce SVG n'a pas pu être dessiné.");
  }
  return addImageToKit(kitId, png, input.kind, typeof input.label === "string" ? input.label.replace(/\.svg$/i, "") : "Logo");
}

export function removeKitAsset(kitId: unknown, assetId: unknown): BrandKit {
  const kit = requireKit(kitId);
  const asset = kit.assets.find((entry) => entry.id === assetId);
  if (!asset) throw new Error("Image introuvable");
  fs.rmSync(path.join(kitArea(kit.id, "assets"), asset.file), { force: true });
  const next: BrandKit = { ...kit, assets: kit.assets.filter((entry) => entry.id !== asset.id) };
  if (next.logoAssetId === asset.id) next.logoAssetId = undefined;
  if (next.markAssetId === asset.id) next.markAssetId = undefined;
  if (next.watermark?.assetId === asset.id) {
    const fallback = next.markAssetId ?? next.logoAssetId;
    next.watermark = fallback ? { ...next.watermark, assetId: fallback } : undefined;
  }
  if (next.endCard.poseAssetId === asset.id) next.endCard = { ...next.endCard, poseAssetId: undefined };
  if (next.mascot) {
    // Un format qui montrait cette pose reprend la proposition par défaut.
    const formatPoses = Object.fromEntries(Object.entries(next.mascot.formatPoses ?? {}).filter(([, id]) => id !== asset.id));
    const presence = next.mascot.presence;
    next.mascot = {
      ...next.mascot,
      sheetAssetIds: next.mascot.sheetAssetIds.filter((id) => id !== asset.id),
      poseAssetIds: next.mascot.poseAssetIds.filter((id) => id !== asset.id),
      ...(next.mascot.formatPoses ? { formatPoses } : {}),
      ...(presence ? { presence: { ...presence, openingPoseId: presence.openingPoseId === asset.id ? undefined : presence.openingPoseId } } : {}),
    };
  }
  if (next.formatImages) {
    next.formatImages = Object.fromEntries(Object.entries(next.formatImages).filter(([, id]) => id !== asset.id));
  }
  return touch(next);
}

// ─── Images finies des formats ───────────────────────────────────

/** Écart toléré entre la proportion d'une image fournie et celle de son format. */
const FORMAT_RATIO_TOLERANCE = 0.01;

/**
 * Contrôle et ré-encode l'image finie d'un format : une image lisible, à la
 * proportion du format (1 % d'écart au plus), ramenée à sa taille exacte et
 * réécrite en PNG. Le ré-encodage ne garde que les pixels : métadonnées,
 * profils et signatures (C2PA) ne passent pas. Le filigrane garde sa
 * transparence ; les autres formats sont posés sur un fond opaque.
 */
export async function normalizeFormatImage(format: FormatId, buffer: Buffer): Promise<Buffer> {
  const spec = FORMATS.find((entry) => entry.id === format);
  if (!spec) throw new Error("Format inconnu");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("Image trop lourde (20 Mo au plus).");
  let metadata: Metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new Error("Ce fichier n’est pas une image lisible.");
  }
  if (!IMAGE_EXTENSIONS[metadata.format ?? ""] || !metadata.width || !metadata.height) throw new Error("Image refusée : PNG, JPEG, WebP ou GIF seulement.");
  const turned = (metadata.orientation ?? 1) >= 5;
  const width = turned ? metadata.height : metadata.width;
  const height = turned ? metadata.width : metadata.height;
  const expected = spec.width / spec.height;
  if (Math.abs(width / height - expected) / expected > FORMAT_RATIO_TOLERANCE) {
    throw new Error(`${spec.label} : il faut une image de ${spec.width} × ${spec.height} (ou à cette proportion) ; celle-ci mesure ${width} × ${height}.`);
  }
  let pipeline = sharp(buffer, { limitInputPixels: MAX_PIXELS }).rotate().resize(spec.width, spec.height, { fit: "fill" });
  if (!spec.transparent) pipeline = pipeline.flatten({ background: "#ffffff" });
  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}

const FORMAT_IMAGE_LABEL = (format: FormatId) => `${FORMATS.find((entry) => entry.id === format)?.label ?? format} (image finie)`;

/**
 * Range l'image finie d'un format, qui remplace son rendu composé. Une image
 * précédente du même format est retirée. La même image, déjà rangée, ne
 * change rien.
 */
export async function setFormatImage(kitId: unknown, format: unknown, buffer: Buffer): Promise<BrandKit> {
  if (!FORMAT_IDS.includes(format as FormatId)) throw new Error("Format inconnu");
  const id = format as FormatId;
  const kit = requireKit(kitId);
  const png = await normalizeFormatImage(id, buffer);
  const previous = formatImageAsset(kit, id);
  if (previous) {
    const current = path.join(kitArea(kit.id, "assets"), previous.file);
    if (fs.existsSync(current) && fs.readFileSync(current).equals(png)) return kit;
  }
  const without = previous ? { ...kit, assets: kit.assets.filter((asset) => asset.id !== previous.id) } : kit;
  const asset = await storeImage(without, png, "format", FORMAT_IMAGE_LABEL(id));
  if (previous) fs.rmSync(path.join(kitArea(kit.id, "assets"), previous.file), { force: true });
  return touch({ ...without, assets: [...without.assets, asset], formatImages: { ...without.formatImages, [id]: asset.id } });
}

/** Image finie déposée par la route d'upload, ou prise dans la galerie. */
export async function setFormatImageFrom(kitId: unknown, format: unknown, input: { file?: unknown; gallery?: unknown }): Promise<BrandKit> {
  if (input?.gallery !== undefined) {
    if (!isGalleryFileName(input.gallery)) throw new Error("Nom de fichier invalide");
    const source = path.join(path.resolve(getAbsoluteUploadPath()), input.gallery);
    const stats = fs.lstatSync(source, { throwIfNoEntry: false });
    if (!stats?.isFile()) throw new Error(`Image introuvable dans la galerie : « ${input.gallery} ».`);
    if (stats.size > MAX_IMAGE_BYTES) throw new Error("Image trop lourde (20 Mo au plus).");
    return setFormatImage(kitId, format, fs.readFileSync(source));
  }
  if (!isFileName(input?.file)) throw new Error("Nom de fichier invalide");
  const dropped = path.join(uploadsDir(), input.file);
  if (!fs.existsSync(dropped)) throw new Error("Fichier déposé introuvable");
  try {
    return await setFormatImage(kitId, format, fs.readFileSync(dropped));
  } finally {
    fs.rmSync(dropped, { force: true });
  }
}

/** Le format revient à son rendu composé ; l'image finie quitte la marque. */
export function clearFormatImage(kitId: unknown, format: unknown): BrandKit {
  if (!FORMAT_IDS.includes(format as FormatId)) throw new Error("Format inconnu");
  const kit = requireKit(kitId);
  const asset = formatImageAsset(kit, format as FormatId);
  if (!asset) {
    if (!kit.formatImages?.[format as FormatId]) return kit;
    const formatImages = { ...kit.formatImages };
    delete formatImages[format as FormatId];
    return touch({ ...kit, formatImages });
  }
  return removeKitAsset(kit.id, asset.id);
}

// ─── Polices ─────────────────────────────────────────────────────

export function importFont(kitId: unknown, input: { name?: unknown; data?: unknown }): BrandKit {
  const kit = requireKit(kitId);
  if (kit.fonts.length >= KIT_LIMITS.fonts) throw new Error(`Une marque garde ${KIT_LIMITS.fonts} polices au plus.`);
  const data = Buffer.isBuffer(input?.data) ? input.data : typeof input?.data === "string" ? Buffer.from(input.data, "base64") : null;
  if (!data) throw new Error("Fichier de police manquant");
  const inspection = inspectFont(data);
  const id = newItemId("fnt");
  const file = `${id}.${inspection.format}`;
  fs.mkdirSync(kitArea(kit.id, "fonts"), { recursive: true });
  fs.writeFileSync(path.join(kitArea(kit.id, "fonts"), file), data, { flag: "wx" });
  const requested = typeof input.name === "string" ? input.name.replace(/\.(ttf|otf|woff2)$/i, "").replace(/\s+/g, " ").trim() : "";
  const font: BrandFont = {
    id,
    name: (requested || inspection.family).slice(0, FONT_FILE_LIMITS.name),
    family: brandFontFamily(kit.id, id),
    file,
    format: inspection.format,
    size: data.length,
  };
  return touch({ ...kit, fonts: [...kit.fonts, font] });
}

/** Contenu d'une police, en base64 : elle n'a pas d'adresse, seule une session la lit. */
export function readFontFile(kitId: unknown, fontId: unknown): string {
  const kit = requireKit(kitId);
  const font = kit.fonts.find((entry) => entry.id === fontId);
  if (!font) throw new Error("Police introuvable");
  return fs.readFileSync(path.join(kitArea(kit.id, "fonts"), font.file)).toString("base64");
}

export function removeFont(kitId: unknown, fontId: unknown): BrandKit {
  const kit = requireKit(kitId);
  const font = kit.fonts.find((entry) => entry.id === fontId);
  if (!font) throw new Error("Police introuvable");
  fs.rmSync(path.join(kitArea(kit.id, "fonts"), font.file), { force: true });
  // Les styles qui l'utilisaient reprennent la police du catalogue de la maquette.
  const fallback = createDefaultKit("x").textStyles;
  const textStyles = Object.fromEntries(
    Object.entries(kit.textStyles).map(([role, style]) => [role, style.font === font.family ? { ...style, font: fallback[role as keyof typeof fallback].font } : style])
  ) as BrandKit["textStyles"];
  return touch({ ...kit, fonts: kit.fonts.filter((entry) => entry.id !== font.id), textStyles });
}

// ─── Formats exportés ────────────────────────────────────────────

export interface FormatExport {
  format: FormatId;
  file: string;
  url: string;
  size: number;
  updatedAt: number;
}

export function listFormatExports(kitId: string): FormatExport[] {
  if (!isKitId(kitId)) return [];
  const dir = kitArea(kitId, "exports");
  if (!fs.existsSync(dir)) return [];
  return FORMAT_IDS.flatMap((format) => {
    const file = `${format}.png`;
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) return [];
    const stats = fs.statSync(full);
    return [{ format, file, url: `${kitExportUrl(kitId, file)}?v=${Math.floor(stats.mtimeMs)}`, size: stats.size, updatedAt: stats.mtimeMs }];
  });
}

export async function saveFormatExport(kitId: unknown, format: unknown, png: unknown): Promise<FormatExport> {
  const kit = requireKit(kitId);
  if (!FORMAT_IDS.includes(format as FormatId)) throw new Error("Format inconnu");
  const data = Buffer.isBuffer(png) ? png : null;
  if (!data || data.length > 12 * 1024 * 1024) throw new Error("Image du format manquante ou trop lourde");
  const metadata = await sharp(data).metadata().catch(() => null);
  if (metadata?.format !== "png") throw new Error("Le format doit être rendu en PNG");
  const file = `${format}.png`;
  fs.mkdirSync(kitArea(kit.id, "exports"), { recursive: true });
  const target = path.join(kitArea(kit.id, "exports"), file);
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, data);
  fs.renameSync(temporary, target);
  return listFormatExports(kit.id).find((entry) => entry.format === format)!;
}

/** Copie un format exporté dans la galerie, comme une capture. */
export async function sendFormatToGallery(kitId: unknown, format: unknown): Promise<{ fileName: string }> {
  const kit = requireKit(kitId);
  if (!FORMAT_IDS.includes(format as FormatId)) throw new Error("Format inconnu");
  const source = path.join(kitArea(kit.id, "exports"), `${format}.png`);
  if (!fs.existsSync(source)) throw new Error("Exportez d'abord ce format");
  const uploads = getAbsoluteUploadPath();
  fs.mkdirSync(uploads, { recursive: true });
  const slug = kit.name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "marque";
  const fileName = `${slug}-${format}-${Date.now().toString(36)}.png`;
  fs.copyFileSync(source, path.join(uploads, fileName));
  await announceNewUpload(fileName);
  return { fileName };
}

// ─── Filigrane des captures ──────────────────────────────────────

/** Logo du filigrane et ses réglages, pour le module `watermark` (appel serveur seulement). */
export function getWatermarkImage(kitId: unknown) {
  const kit = requireKit(kitId);
  // L'image finie du filigrane, si la marque en a une, passe telle quelle.
  const asset = formatImageAsset(kit, "watermark") ?? watermarkAsset(kit);
  if (!asset) throw new Error(`L'image de marque « ${kit.name} » n'a pas de logo pour le filigrane.`);
  return {
    kitId: kit.id,
    name: kit.name,
    image: fs.readFileSync(path.join(kitArea(kit.id, "assets"), asset.file)),
    anchor: kit.watermark?.anchor ?? "bottom-right",
    size: kit.watermark?.size ?? 0.14,
    opacity: kit.watermark?.opacity ?? 0.85,
    margin: kit.watermark?.margin ?? 0.035,
    updatedAt: kit.updatedAt,
  };
}

// ─── Archives ────────────────────────────────────────────────────

/** Archive ZIP d'une marque : `brand.json`, `assets/`, `fonts/`. */
export function exportKit(kitId: unknown): { fileName: string; data: Buffer } {
  const kit = requireKit(kitId);
  const files: Zippable = { "brand.json": strToU8(JSON.stringify(kit, null, 2)) };
  for (const asset of kit.assets) {
    const full = path.join(kitArea(kit.id, "assets"), asset.file);
    if (fs.existsSync(full)) files[`assets/${asset.file}`] = [new Uint8Array(fs.readFileSync(full)), { level: 0 }];
  }
  for (const font of kit.fonts) {
    const full = path.join(kitArea(kit.id, "fonts"), font.file);
    if (fs.existsSync(full)) files[`fonts/${font.file}`] = new Uint8Array(fs.readFileSync(full));
  }
  const slug = kit.name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "marque";
  return { fileName: `${slug}.zip`, data: Buffer.from(zipSync(files)) };
}

/** Identifiants d'images d'une table (format → image) réécrits ; `null` (« sans mascotte ») est gardé. */
function remapRecord(value: unknown, remap: (id: unknown) => string | undefined): Record<string, string | null> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, string | null> = {};
  for (const [key, id] of Object.entries(value as Record<string, unknown>)) {
    if (id === null) out[key] = null;
    else if (remap(id)) out[key] = remap(id)!;
  }
  return out;
}

/**
 * Recharge une archive exportée : nouvelle marque, nouveaux identifiants de
 * fichiers. Chaque fichier repasse les contrôles d'un envoi.
 */
export async function importKit(archive: unknown): Promise<BrandKit> {
  const data = Buffer.isBuffer(archive) ? archive : null;
  if (!data) throw new Error("Archive manquante");
  if (data.length > MAX_ARCHIVE_BYTES) throw new Error("Archive trop lourde (15 Mo au plus).");
  let entries: Record<string, Uint8Array>;
  let unpacked = 0;
  let count = 0;
  try {
    entries = unzipSync(new Uint8Array(data), {
      filter: (file) => {
        count++;
        unpacked += file.originalSize;
        if (count > MAX_ARCHIVE_FILES || unpacked > MAX_ARCHIVE_UNPACKED) throw new Error("archive trop grande");
        return file.name === "brand.json" || /^(assets|fonts)\/[a-z0-9][a-z0-9._-]{0,120}$/i.test(file.name);
      },
    });
  } catch {
    throw new Error("Archive illisible, ou trop grande une fois décompressée.");
  }
  const manifest = entries["brand.json"];
  if (!manifest) throw new Error("Cette archive ne contient pas de brand.json.");
  let source: BrandKit;
  try {
    source = JSON.parse(strFromU8(manifest));
  } catch {
    throw new Error("brand.json est illisible.");
  }
  if (!source || source.version !== 1) throw new Error("brand.json n'est pas une image de marque reconnue.");

  const name = typeof source.name === "string" && source.name.trim() ? source.name.trim().slice(0, KIT_LIMITS.name) : "Marque importée";
  let kit = createDefaultKit(name);
  writeKit(kit);
  try {
    // Images : chacune repasse les contrôles, sous un identifiant neuf.
    const assetIds = new Map<string, string>();
    for (const asset of Array.isArray(source.assets) ? source.assets.slice(0, KIT_LIMITS.assets) : []) {
      const bytes = typeof asset?.file === "string" ? entries[`assets/${asset.file}`] : undefined;
      if (!bytes || !(ASSET_KINDS.includes(asset.kind) || asset.kind === "format")) continue;
      const stored = await storeImage(kit, Buffer.from(bytes), asset.kind, String(asset.label ?? "Image"), {
        note: typeof asset.note === "string" ? asset.note.slice(0, KIT_LIMITS.note) : undefined,
      });
      // Une pose garde ses étiquettes (contrôlées), sinon en reçoit d'après son libellé.
      if (stored.kind === "mascot-pose") stored.pose = sanitizePoseTags(asset.pose, proposePoseTags(stored));
      kit = { ...kit, assets: [...kit.assets, stored] };
      assetIds.set(asset.id, stored.id);
    }
    // Polices : idem, et les styles suivent la nouvelle famille.
    const families = new Map<string, string>();
    for (const font of Array.isArray(source.fonts) ? source.fonts.slice(0, KIT_LIMITS.fonts) : []) {
      const bytes = typeof font?.file === "string" ? entries[`fonts/${font.file}`] : undefined;
      if (!bytes) continue;
      const before = kit.fonts.length;
      writeKit(kit);
      kit = importFont(kit.id, { name: font.name, data: Buffer.from(bytes) });
      if (kit.fonts.length > before) families.set(font.family, kit.fonts[kit.fonts.length - 1].family);
    }
    const remap = (id: unknown) => (typeof id === "string" ? assetIds.get(id) : undefined);
    const textStyles = Object.fromEntries(
      Object.entries(source.textStyles ?? {}).map(([role, style]: [string, any]) => [role, { ...style, font: families.get(style?.font) ?? style?.font }])
    );
    const draft = {
      ...source,
      id: kit.id,
      textStyles,
      logoAssetId: remap(source.logoAssetId),
      markAssetId: remap(source.markAssetId),
      watermark: source.watermark ? { ...source.watermark, assetId: remap(source.watermark.assetId) } : undefined,
      endCard: source.endCard ? { ...source.endCard, poseAssetId: remap(source.endCard.poseAssetId) } : undefined,
      mascot: source.mascot
        ? {
            ...source.mascot,
            sheetAssetIds: (source.mascot.sheetAssetIds ?? []).map(remap).filter(Boolean),
            poseAssetIds: (source.mascot.poseAssetIds ?? []).map(remap).filter(Boolean),
            formatPoses: remapRecord(source.mascot.formatPoses, remap),
            presence: source.mascot.presence ? { ...source.mascot.presence, openingPoseId: remap(source.mascot.presence.openingPoseId) } : undefined,
          }
        : undefined,
      formatImages: remapRecord(source.formatImages, remap),
      // Les comptes et la collection appartiennent à l'autre instance.
      publishing: source.publishing ? { ...source.publishing, accountIds: [] } : undefined,
      ai: source.ai ? { ...source.ai, collectionId: undefined } : undefined,
    };
    // Les images finies sont des fichiers : elles passent par la fiche « enregistrée », jamais par le brouillon.
    const formatImages = draft.formatImages as BrandKit["formatImages"];
    return touch(sanitizeKit(draft, { ...kit, ...(formatImages ? { formatImages } : {}) }));
  } catch (error) {
    removeKitDir(kit.id);
    throw error;
  }
}

export { isItemId, kitDir };
