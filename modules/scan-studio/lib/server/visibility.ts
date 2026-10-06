/**
 * Règles de la lecture publique (§ 11.2 du dossier), partagées par la
 * bibliothèque (`library.ts`, qui publie) et par les lectures sans compte
 * (`public.ts`, qui sert).
 *
 * - Trois visibilités, celles des albums : privé (défaut), public par son
 *   lien, listé au catalogue.
 * - Une adresse publique est faite de l'identifiant de la fiche suivi de seize
 *   caractères tirés au hasard. L'identifiant permet de retrouver la fiche
 *   sans rien parcourir ; le hasard rend l'adresse imprévisible. Elle n'ouvre
 *   rien par elle-même : la fiche doit porter exactement cette adresse.
 * - Seule une page exportée, et pas « laissée telle quelle », peut être lue en
 *   public : c'est son rendu qui est servi, jamais son image d'origine.
 */

import { createHash, randomBytes } from "crypto";
import { catalogSectionPath } from "@/lib/catalog-section-paths";
import { isAssetName } from "../store";
import { CHAPTER_VISIBILITIES, isId, type ChapterVisibility, type ScanPage } from "../types";

/** Identifiant de la section dans `module.json` (`catalogSections`) : `/catalog/scans`. */
export const PUBLIC_SECTION_ID = "scans";

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const SLUG_RANDOM_LENGTH = 16;
/** Douze caractères d'identifiant, seize de hasard. */
export const PUBLIC_SLUG_PATTERN = /^[a-z0-9]{28}$/;

export function isChapterVisibility(value: unknown): value is ChapterVisibility {
  return typeof value === "string" && (CHAPTER_VISIBILITIES as string[]).includes(value);
}

/** Visibilité effective d'une fiche : tout ce qui n'est pas une valeur connue vaut « privé ». */
export function visibilityOf(entity: { visibility?: unknown }): ChapterVisibility {
  return isChapterVisibility(entity.visibility) ? entity.visibility : "private";
}

/** Adresse neuve pour une fiche. Tirée avec le générateur du système, sans biais notable sur 36 symboles. */
export function newPublicSlug(id: string): string {
  if (!isId(id)) throw new Error("Identifiant invalide.");
  let random = "";
  while (random.length < SLUG_RANDOM_LENGTH) {
    for (const byte of randomBytes(SLUG_RANDOM_LENGTH * 2)) {
      // 252 est le plus grand multiple de 36 sous 256 : au-delà, l'octet est rejeté.
      if (byte < 252 && random.length < SLUG_RANDOM_LENGTH) random += SLUG_ALPHABET[byte % 36];
    }
  }
  return `${id}${random}`;
}

/** L'identifiant de fiche que porte une adresse ; `null` si elle n'en a pas la forme. */
export function idOfPublicSlug(slug: unknown): string | null {
  return typeof slug === "string" && PUBLIC_SLUG_PATTERN.test(slug) ? slug.slice(0, 12) : null;
}

/** La page peut-elle être lue en public ? Son rendu existe, et ce n'est pas son image d'origine. */
export function isPublishablePage(page: Pick<ScanPage, "skipped" | "exported" | "source">): boolean {
  if (page.skipped === true) return false;
  const file = page.exported?.file;
  return isAssetName(file) && file !== page.source?.file;
}

/**
 * Jeton d'une page dans une adresse d'image publique. Il ne laisse rien
 * deviner du nom du fichier, et change avec le rendu : une adresse donnée
 * désigne toujours la même image, ou plus rien.
 */
export function pageToken(chapterSlug: string, exportedFile: string): string {
  return createHash("sha256").update(`${chapterSlug}:${exportedFile}`).digest("hex").slice(0, 24);
}

/** Adresse de lecture publique d'un chapitre. */
export function publicChapterPath(folderSlug: string, chapterSlug: string): string {
  return catalogSectionPath(PUBLIC_SECTION_ID, folderSlug, chapterSlug);
}
