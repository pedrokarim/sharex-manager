/**
 * Adresses des sections que les modules apportent au catalogue public
 * (`catalogSections` de leur `module.json`).
 *
 * Le schéma d'adresse appartient au catalogue, pas aux modules : il est écrit
 * ici une fois. Un module s'en sert pour donner à son propriétaire le lien
 * public d'un élément, et pour fabriquer les adresses de ses médias.
 *
 * Ce fichier ne dépend de rien : il se charge aussi bien côté serveur que dans
 * le navigateur.
 */

/** Segment d'adresse d'une section : « scans ». */
export const CATALOG_SECTION_ID = /^[a-z][a-z0-9-]{1,31}$/;

/** Rubriques du catalogue lui-même : une section de module ne peut pas prendre leur place. */
export const RESERVED_CATALOG_SEGMENTS = ["albums", "gallery"];

/** Identifiant d'adresse d'une collection ou d'un élément : choisi par le module, sans séparateur. */
export const CATALOG_SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;

/** `/catalog/<section>`, `/catalog/<section>/<collection>`, `/catalog/<section>/<collection>/<élément>`. */
export function catalogSectionPath(section: string, collection?: string, item?: string): string {
  return ["/catalog", section, collection, item].filter(Boolean).join("/");
}

/** Adresse d'un média d'une section, servi par la route publique des sections. */
export function catalogSectionMediaUrl(section: string, parts: string[]): string {
  return `/api/public/sections/${section}/media/${parts.map(encodeURIComponent).join("/")}`;
}
