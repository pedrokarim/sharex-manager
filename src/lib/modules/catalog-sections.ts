/**
 * Sections que les modules apportent au catalogue public (`catalogSections`).
 *
 * Le catalogue ne connaît aucun module par son nom : il lit les sections
 * déclarées par les modules activés, et appelle leurs fonctions. Trois règles
 * tiennent l'ensemble :
 *
 * - une section n'existe que si son module est activé **et** chargé. L'état
 *   « activé » est relu sur le disque à chaque demande : couper un module
 *   retire sa section, ses pages et ses médias tout de suite ;
 * - seules les fonctions déclarées avec l'audience `public` sont appelées. Une
 *   section qui désignerait par erreur une fonction réservée aux comptes
 *   connectés n'est pas servie ;
 * - une fonction qui échoue donne « rien » : une page publique répond 404, elle
 *   n'affiche jamais le message d'erreur d'un module.
 */

import fs from "fs";
import path from "path";
import { CATALOG_SECTION_ID, CATALOG_SLUG, RESERVED_CATALOG_SEGMENTS, catalogSectionMediaUrl } from "@/lib/catalog-section-paths";
import { MEDIA_TYPES } from "@/lib/modules/media-response";
import type {
  CatalogSectionCollection,
  CatalogSectionItem,
  CatalogSectionListing,
  CatalogSectionMedia,
  ModuleCatalogSection,
  ModuleConfig,
} from "@/types/modules";

export interface ResolvedCatalogSection {
  /** Nom du module qui apporte la section. */
  module: string;
  section: ModuleCatalogSection;
}

const SECTION_FUNCTIONS = ["list", "collection", "item", "media"] as const;

/**
 * Sections valides des modules activés. Fonction pure : elle ne lit que les
 * configurations qu'on lui donne. La première déclaration d'un identifiant
 * l'emporte : deux modules ne se partagent pas une adresse.
 */
export function resolveCatalogSections(configs: ModuleConfig[]): ResolvedCatalogSection[] {
  const resolved: ResolvedCatalogSection[] = [];
  const taken = new Set<string>(RESERVED_CATALOG_SEGMENTS);
  for (const config of configs) {
    if (!config.enabled) continue;
    for (const section of config.catalogSections ?? []) {
      if (!section || typeof section.id !== "string" || !CATALOG_SECTION_ID.test(section.id) || taken.has(section.id)) continue;
      if (section.kind !== "reader") continue;
      const open = SECTION_FUNCTIONS.every((key) => typeof section[key] === "string" && config.functions?.[section[key]] === "public");
      if (!open) continue;
      taken.add(section.id);
      resolved.push({ module: config.name, section });
    }
  }
  return resolved;
}

/**
 * Le gestionnaire de modules tire avec lui tous les modules : il n'est chargé
 * qu'au moment de s'en servir, pas avec ce fichier.
 */
async function manager() {
  const { apiModuleManager } = await import("@/lib/modules/module-manager.api");
  await apiModuleManager.ensureInitialized();
  return apiModuleManager;
}

/** Sections des modules activés et chargés. */
export async function listCatalogSections(): Promise<ResolvedCatalogSection[]> {
  try {
    const modules = await manager();
    // `getModules` relit `module.json` et l'état de l'instance sur le disque.
    const sections = resolveCatalogSections(await modules.getModules());
    return sections.filter(({ module }) => modules.getLoadedModule(module)?.status === "loaded");
  } catch (error) {
    console.error("Sections de catalogue indisponibles :", error);
    return [];
  }
}

export async function findCatalogSection(id: string): Promise<ResolvedCatalogSection | null> {
  if (typeof id !== "string" || !CATALOG_SECTION_ID.test(id)) return null;
  return (await listCatalogSections()).find((entry) => entry.section.id === id) ?? null;
}

async function call<T>(resolved: ResolvedCatalogSection, key: (typeof SECTION_FUNCTIONS)[number], ...args: unknown[]): Promise<T | null> {
  try {
    const modules = await manager();
    const result = await modules.callModuleFunction(resolved.module, resolved.section[key], ...args);
    return (result ?? null) as T | null;
  } catch (error) {
    console.error(`Section de catalogue « ${resolved.section.id} » (${key}) :`, error);
    return null;
  }
}

export async function readSectionListing(resolved: ResolvedCatalogSection): Promise<CatalogSectionListing> {
  const listing = await call<CatalogSectionListing>(resolved, "list");
  return listing && Array.isArray(listing.collections) ? listing : { collections: [] };
}

export async function readSectionCollection(resolved: ResolvedCatalogSection, collection: string): Promise<CatalogSectionCollection | null> {
  if (typeof collection !== "string" || !CATALOG_SLUG.test(collection)) return null;
  const found = await call<CatalogSectionCollection>(resolved, "collection", collection);
  return found && Array.isArray(found.items) ? found : null;
}

export async function readSectionItem(resolved: ResolvedCatalogSection, collection: string, item: string): Promise<CatalogSectionItem | null> {
  if (typeof collection !== "string" || !CATALOG_SLUG.test(collection)) return null;
  if (typeof item !== "string" || !CATALOG_SLUG.test(item)) return null;
  const found = await call<CatalogSectionItem>(resolved, "item", collection, item);
  return found && Array.isArray(found.pages) ? found : null;
}

/** Sections qui ont quelque chose à montrer : seules celles-là entrent dans la navigation. */
export async function listVisibleCatalogSections(): Promise<(ResolvedCatalogSection & { listing: CatalogSectionListing })[]> {
  const visible: (ResolvedCatalogSection & { listing: CatalogSectionListing })[] = [];
  for (const resolved of await listCatalogSections()) {
    const listing = await readSectionListing(resolved);
    if (listing.collections.length > 0) visible.push({ ...resolved, listing });
  }
  return visible;
}

// ─── Médias ──────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

/**
 * Chemin absolu d'un média rendu par un module, ou `null` s'il ne peut pas
 * être servi. Le module ne donne qu'un chemin relatif à son répertoire
 * `data/` : il est borné ici, comme dans la route des données des modules.
 * Seules des images sont servies au public.
 */
export function resolveSectionMediaFile(dataDir: string, relative: unknown): string | null {
  if (typeof relative !== "string" || relative.length === 0 || relative.length > 400) return null;
  const segments = relative.split("/");
  if (segments.some((segment) => segment === "" || segment === ".." || segment.startsWith(".") || segment.includes("\\") || segment.includes("\0"))) {
    return null;
  }
  const extension = path.extname(segments[segments.length - 1]).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension) || !MEDIA_TYPES[extension]) return null;

  const root = path.resolve(dataDir);
  const resolved = path.resolve(root, ...segments);
  if (!resolved.startsWith(root + path.sep)) return null;
  try {
    // `lstat` puis chemin réel : un lien symbolique posé dans les données ne fait pas sortir du répertoire.
    if (!fs.lstatSync(resolved).isFile()) return null;
    if (!fs.realpathSync(resolved).startsWith(fs.realpathSync(root) + path.sep)) return null;
  } catch {
    return null;
  }
  return resolved;
}

/** Le média désigné par une adresse publique : fichier à servir et indexation, ou `null`. */
export async function readSectionMedia(resolved: ResolvedCatalogSection, parts: string[]): Promise<{ file: string; indexable: boolean } | null> {
  if (!Array.isArray(parts) || parts.length === 0 || parts.length > 6 || !parts.every((part) => typeof part === "string" && CATALOG_SLUG.test(part))) {
    return null;
  }
  const media = await call<CatalogSectionMedia>(resolved, "media", parts);
  if (!media) return null;
  // Le nom du module vient du registre, jamais de l'adresse demandée.
  const dataDir = path.join(process.cwd(), "modules", resolved.module, "data");
  const file = resolveSectionMediaFile(dataDir, media.file);
  return file ? { file, indexable: media.indexable === true } : null;
}

/**
 * Le fichier derrière l'adresse de couverture qu'un module a rendue, pour
 * composer une image d'aperçu sans repasser par le réseau. `null` si l'adresse
 * n'est pas une image de cette section.
 */
export async function readSectionCoverFile(resolved: ResolvedCatalogSection, coverUrl: string | undefined): Promise<string | null> {
  const prefix = catalogSectionMediaUrl(resolved.section.id, []);
  if (typeof coverUrl !== "string" || !coverUrl.startsWith(prefix)) return null;
  let parts: string[];
  try {
    parts = coverUrl.slice(prefix.length).split("/").map(decodeURIComponent);
  } catch {
    return null;
  }
  return (await readSectionMedia(resolved, parts))?.file ?? null;
}
