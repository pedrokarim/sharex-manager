/**
 * Bandeau « À la une » de la galerie : le choix des cartes, en calculs purs.
 *
 * Chaque carte est un raccourci vers un endroit de la galerie, illustré par
 * une image qui s'y trouve. Les cartes des modules ne sont pas décidées ici :
 * le bandeau les demande aux modules activés (voir `GalleryHighlights`).
 */

import { isImageFile } from "@/lib/media-kind";

export interface HighlightFile {
  name: string;
  createdAt: string;
  isSecure?: boolean;
  isStarred?: boolean;
}

export interface HighlightAlbum {
  id: number;
  name: string;
  fileCount: number;
  thumbnailFile?: string;
}

export type GalleryHighlight =
  /** Le dernier favori. */
  | { kind: "starred"; file: string; count: number; href: string }
  /** Le dernier fichier rendu privé. */
  | { kind: "secure"; file: string; count: number; href: string }
  /** Ces jours-ci, une année précédente. */
  | { kind: "memory"; file: string; count: number; href: string; years: number }
  /** Le mois en cours, une année précédente, faute de souvenir plus précis. */
  | { kind: "month"; file: string; count: number; href: string; years: number; date: string }
  /** L'album modifié en dernier. */
  | { kind: "album"; file: string; count: number; href: string; name: string };

const DAY = 24 * 60 * 60 * 1000;
/** Un souvenir tombe « ces jours-ci » à trois jours près. */
const MEMORY_WINDOW_DAYS = 3;

function rangeHref(start: number, end: number): string {
  const params = new URLSearchParams({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
  return `/gallery?${params.toString()}`;
}

/**
 * Cartes du bandeau, de la plus personnelle à la plus générale.
 *
 * `files` est trié du plus récent au plus ancien. `tzOffset` vaut
 * `Date.getTimezoneOffset()` du navigateur : un souvenir se compte en jours
 * du calendrier de la personne, pas du serveur.
 */
export function pickGalleryHighlights(
  files: HighlightFile[],
  albums: HighlightAlbum[],
  now: Date = new Date(),
  tzOffset = 0,
): GalleryHighlight[] {
  const images = files.filter((file) => isImageFile(file.name));
  const highlights: GalleryHighlight[] = [];

  // Souvenir : la même période du calendrier, l'année la plus proche qui en a.
  const shift = tzOffset * 60_000;
  const local = new Date(now.getTime() - shift);
  const currentYear = local.getUTCFullYear();
  const oldest = images.length ? new Date(new Date(images[images.length - 1].createdAt).getTime() - shift).getUTCFullYear() : currentYear;

  let memory: GalleryHighlight | null = null;
  for (let year = currentYear - 1; year >= oldest && !memory; year--) {
    const anniversary = Date.UTC(year, local.getUTCMonth(), local.getUTCDate()) + shift;
    const start = anniversary - MEMORY_WINDOW_DAYS * DAY;
    const end = anniversary + (MEMORY_WINDOW_DAYS + 1) * DAY - 1;
    const found = images.filter((file) => {
      const time = new Date(file.createdAt).getTime();
      return time >= start && time <= end;
    });
    if (found.length > 0) {
      memory = { kind: "memory", file: found[0].name, count: found.length, href: rangeHref(start, end), years: currentYear - year };
    }
  }
  for (let year = currentYear - 1; year >= oldest && !memory; year--) {
    const start = Date.UTC(year, local.getUTCMonth(), 1) + shift;
    const end = Date.UTC(year, local.getUTCMonth() + 1, 1) + shift - 1;
    const found = images.filter((file) => {
      const time = new Date(file.createdAt).getTime();
      return time >= start && time <= end;
    });
    if (found.length > 0) {
      memory = {
        kind: "month",
        file: found[0].name,
        count: found.length,
        href: rangeHref(start, end),
        years: currentYear - year,
        date: new Date(Date.UTC(year, local.getUTCMonth(), 15)).toISOString(),
      };
    }
  }
  if (memory) highlights.push(memory);

  const starred = images.filter((file) => file.isStarred);
  if (starred.length > 0) {
    highlights.push({ kind: "starred", file: starred[0].name, count: starred.length, href: "/gallery/starred" });
  }

  const secure = images.filter((file) => file.isSecure);
  if (secure.length > 0) {
    highlights.push({ kind: "secure", file: secure[0].name, count: secure.length, href: "/gallery/secure" });
  }

  const album = albums.find((entry) => entry.fileCount > 0 && entry.thumbnailFile && isImageFile(entry.thumbnailFile));
  if (album?.thumbnailFile) {
    highlights.push({ kind: "album", file: album.thumbnailFile, count: album.fileCount, href: `/albums/${album.id}`, name: album.name });
  }

  return highlights;
}
