import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { CatalogSectionCard } from "@/components/catalog/section-card";
import { FRONT_WIDE } from "@/components/front/container";
import { PhotoHeader } from "@/components/front/photo-header";
import { Reveal } from "@/components/front/reveal";
import { PageTransition } from "@/components/page-transition";
import { catalogSectionPath } from "@/lib/catalog-section-paths";
import { findCatalogSection, readSectionCollection } from "@/lib/modules/catalog-sections";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { cn } from "@/lib/utils";

interface CollectionPageProps {
  params: Promise<{ section: string; collection: string }>;
}

async function load(params: CollectionPageProps["params"]) {
  const { section, collection } = await params;
  const resolved = await findCatalogSection(section);
  const found = resolved ? await readSectionCollection(resolved, collection) : null;
  return resolved && found && found.items.length > 0 ? { resolved, collection: found } : null;
}

const countLabel = (count: number) => `${count} ${count > 1 ? "chapitres" : "chapitre"}`;

/**
 * Une collection d'une section de module : une série et ses chapitres listés.
 * L'image d'aperçu est produite par `opengraph-image.tsx`, à côté.
 */
export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const loaded = await load(params);
  if (!loaded) return { title: "Page introuvable", robots: { index: false, follow: false } };

  const { resolved, collection } = loaded;
  const description = collection.description?.trim() || `${countLabel(collection.items.length)} à lire en ligne, dans la rubrique ${resolved.section.label} du catalogue.`;
  const url = absoluteUrl(catalogSectionPath(resolved.section.id, collection.slug));
  return {
    title: collection.title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", siteName: SITE_NAME, locale: "fr_FR", url, title: collection.title, description },
    twitter: { card: "summary_large_image", title: collection.title, description },
  };
}

export default async function CatalogCollectionPage({ params }: CollectionPageProps) {
  await connection();
  const loaded = await load(params);
  if (!loaded) notFound();
  const { resolved, collection } = loaded;
  const sectionHref = catalogSectionPath(resolved.section.id);

  return (
    <PageTransition>
      <PhotoHeader
        photo="path"
        kicker={
          <>
            <Link href={sectionHref} className="transition-colors hover:text-white">
              {resolved.section.label}
            </Link>
            <span className="mx-2 text-white/40">/</span>
            <span className="text-white/70">{collection.title}</span>
          </>
        }
        title={collection.title}
        description={collection.description}
      >
        <p className="text-sm text-white/65 tabular-nums">{countLabel(collection.items.length)}</p>
      </PhotoHeader>
      <section className={cn(FRONT_WIDE, "pt-4 pb-24 sm:pb-32")}>
        <ul className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {collection.items.map((item, index) => (
            <Reveal as="li" key={item.slug} delay={(index % 5) * 0.06}>
              <CatalogSectionCard card={item} href={catalogSectionPath(resolved.section.id, collection.slug, item.slug)} unit={["page", "pages"]} />
            </Reveal>
          ))}
        </ul>
      </section>
    </PageTransition>
  );
}
