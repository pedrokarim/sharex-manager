import { headers } from "next/headers";

import { renderSectionOgImage, sectionOgNotFound, SECTION_OG_SIZE } from "@/lib/catalog-section-og";
import { findCatalogSection, readSectionCollection, readSectionCoverFile } from "@/lib/modules/catalog-sections";
import { getTrustedClientIp } from "@/lib/request-ip";

export const alt = "Série à lire dans le catalogue public";
export const size = SECTION_OG_SIZE;
export const contentType = "image/png";

/**
 * Aperçu partagé d'une collection d'une section de module : sa couverture et
 * son titre. Relue à chaque demande (`headers()` écarte toute mise en cache du
 * rendu) : sans élément listé, ou module désactivé, l'aperçu répond 404 comme
 * la page.
 */
export default async function CollectionOpengraphImage({ params }: { params: Promise<{ section: string; collection: string }> }) {
  const ip = getTrustedClientIp(await headers());
  const { section, collection: collectionSlug } = await params;
  const resolved = await findCatalogSection(section);
  const collection = resolved ? await readSectionCollection(resolved, collectionSlug) : null;
  if (!resolved || !collection || collection.items.length === 0) return sectionOgNotFound();

  const count = collection.items.length;
  return renderSectionOgImage({
    key: `${resolved.section.id}/${collection.slug}/${collection.cover ?? ""}/${collection.title}/${count}`,
    kicker: resolved.section.label,
    title: collection.title,
    subtitle: `${count} ${count > 1 ? "chapitres" : "chapitre"} à lire en ligne`,
    coverFile: await readSectionCoverFile(resolved, collection.cover),
    ip,
  });
}
