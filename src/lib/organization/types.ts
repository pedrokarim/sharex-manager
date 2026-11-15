/**
 * Tags et collections (docs/organisation.md) : types partagés par le serveur
 * et l'interface, sans dépendance Node.
 *
 * - Un **tag** est une étiquette posée à la main sur un fichier. Les tags sont
 *   communs à toute l'instance, comme les favoris : la galerie est commune.
 * - Une **collection** est une sélection enregistrée, recalculée à chaque
 *   ouverture à partir de règles (tags, type de fichier, favoris, période…).
 *   Elle appartient à un compte. Un album, lui, se remplit à la main.
 */
import type { FileKind } from "@/lib/media-kind";

export interface Tag {
  id: number;
  /** Nom affiché, tel que saisi (« Captures de jeu »). */
  name: string;
  /** Identifiant d'URL, unique (`captures-de-jeu`) : `/gallery?tag=captures-de-jeu`. */
  slug: string;
  description?: string | null;
  /** Fichiers qui portent le tag (fichiers encore présents sur le disque). */
  fileCount: number;
  createdAt: string;
  updatedAt: string;
  /** Compte qui a créé le tag ; `null` pour un tag sans auteur connu. */
  createdBy: string | null;
  /** Dernière pose du tag sur un fichier. */
  lastUsedAt: string | null;
}

/** Longueurs maximales, vérifiées des deux côtés. */
export const TAG_NAME_MAX = 40;
export const TAG_DESCRIPTION_MAX = 200;
export const TAGS_PER_FILE_MAX = 30;
export const COLLECTION_NAME_MAX = 60;
export const COLLECTION_DESCRIPTION_MAX = 300;

/** Le slug d'un nom de tag ou de collection : minuscules, sans accent, tirets. */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Nom de tag nettoyé : espaces resserrés, longueur bornée ; `null` s'il ne reste rien. */
export function cleanTagName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim().slice(0, TAG_NAME_MAX);
  return name && slugify(name) ? name : null;
}

// ─── Collections ─────────────────────────────────────────────────

/** Une période relative (« 30 derniers jours ») ou des bornes fixes (AAAA-MM-JJ). */
export type CollectionPeriod = { lastDays: number } | { from?: string; to?: string };

/**
 * Règles d'une collection. Toutes les conditions présentes doivent être
 * vraies (ET) ; une liste vide ou absente ne filtre rien.
 */
export interface CollectionRules {
  /** Le fichier porte **tous** ces tags (slugs). */
  tagsAll?: string[];
  /** Le fichier porte **au moins un** de ces tags. */
  tagsAny?: string[];
  /** Le fichier ne porte **aucun** de ces tags. */
  tagsNone?: string[];
  /** Types de fichier admis. */
  kinds?: FileKind[];
  /** `true` : favoris seulement ; `false` : hors favoris ; absent : sans condition. */
  starred?: boolean;
  /** `true` : fichiers sécurisés seulement ; `false` : hors fichiers sécurisés. */
  secure?: boolean;
  period?: CollectionPeriod;
  /** Texte cherché dans le nom du fichier. */
  search?: string;
}

export type CollectionSort = "date" | "name" | "size";
export type CollectionOrder = "asc" | "desc";

export interface Collection {
  id: number;
  name: string;
  /** Unique pour un même compte : `/organization/collections/<slug>`. */
  slug: string;
  description?: string | null;
  rules: CollectionRules;
  sort: CollectionSort;
  order: CollectionOrder;
  /** Compte propriétaire : une collection est privée. */
  userId: string;
  /** Épinglée en tête de la liste. */
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Une collection avec ce qu'en montre la liste : le compte et quatre fichiers d'aperçu. */
export interface CollectionSummary extends Collection {
  fileCount: number;
  /** Jusqu'à quatre noms de fichiers, dans l'ordre de la collection. */
  cover: string[];
}

/** Réponse de l'aperçu d'une règle en cours d'écriture. */
export interface CollectionPreview {
  fileCount: number;
  cover: string[];
}

/** Une collection sans aucune règle prendrait toute la galerie : refusée. */
export function hasAnyRule(rules: CollectionRules): boolean {
  return Boolean(
    rules.tagsAll?.length ||
      rules.tagsAny?.length ||
      rules.tagsNone?.length ||
      rules.kinds?.length ||
      rules.starred !== undefined ||
      rules.secure !== undefined ||
      rules.period ||
      rules.search?.trim(),
  );
}

// ─── Ajouts de l'étape O1 ────────────────────────────────────────

/** Un tag tel qu'il est posé sur un fichier : sans compte de fichiers. */
export type TagRef = Pick<Tag, "id" | "name" | "slug">;
