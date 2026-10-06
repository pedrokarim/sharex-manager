import { headers } from "next/headers";

import { renderSectionOgImage, sectionOgNotFound, SECTION_OG_SIZE } from "@/lib/catalog-section-og";
import { findCatalogSection, readSectionCoverFile, readSectionItem } from "@/lib/modules/catalog-sections";
import { getTrustedClientIp } from "@/lib/request-ip";

export const alt = "Chapitre à lire dans le catalogue public";
export const size = SECTION_OG_SIZE;
export const contentType = "image/png";

/**
 * Aperçu partagé d'un élément d'une section de module : sa première page en
 * couverture, son titre et celui de sa collection. L'élément est relu à
 * chaque demande (`headers()` écarte toute mise en cache du rendu) : privé ou
 * module désactivé, l'aperçu répond 404 comme la page.
 */
export default async function ItemOpengraphImage({ params }: { params: Promise<{ section: string; collection: string; item: string }> }) {
  const ip = getTrustedClientIp(await headers());
  const { section, collection, item: itemSlug } = await params;
  const resolved = await findCatalogSection(section);
  const item = resolved ? await readSectionItem(resolved, collection, itemSlug) : null;
  if (!resolved || !item || item.pages.length === 0) return sectionOgNotFound();

  return renderSectionOgImage({
    key: `${resolved.section.id}/${item.collection.slug}/${item.slug}/${item.cover ?? ""}/${item.title}/${item.collection.title}`,
    kicker: resolved.section.label,
    title: item.collection.title,
    subtitle: item.title,
    coverFile: await readSectionCoverFile(resolved, item.cover),
    ip,
  });
}
