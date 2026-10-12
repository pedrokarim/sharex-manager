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
import { BUNDLED_FONTS, customFontFamily, isBundledFamily, replaceFamilyInRegions, replaceFamilyInStyles } from "../custom-fonts";
import { dataRoot, readAllFolders, readAllPages, readChapter, readJson, writeChapter, writeFolder, writeJson, writePage } from "../store";
import { isId, type CustomFont, type FontFormat, type FontUsage } from "../types";
import { FONT_FILE_LIMITS, cleanName, inspectFont } from "@/lib/fonts/inspect";

export { inspectFont, readFamilyName, type FontInspection } from "@/lib/fonts/inspect";

export const FONT_LIMITS = {
  ...FONT_FILE_LIMITS,
  /** Polices gardées en même temps. */
  count: 60,
};

const FORMATS: FontFormat[] = ["ttf", "otf", "woff2"];

// Le chemin dépend de `setDataRoot` (les tests) : sans cette mention, le build
// suivrait tout le projet à la trace pour trouver ce qu'il peut lire.
const fontsDir = () => path.join(/* turbopackIgnore: true */ dataRoot(), "fonts");
const indexFile = () => path.join(fontsDir(), "index.json");
/** `id` et `format` viennent toujours de la liste, jamais de la demande. */
const fontFile = (font: Pick<CustomFont, "id" | "format">) => path.join(fontsDir(), `${font.id}.${font.format}`);

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
