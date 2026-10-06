import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { CatalogSectionCard } from "@/components/catalog/section-card";
import { FRONT_WIDE } from "@/components/front/container";
import { PhotoHeader } from "@/components/front/photo-header";
import { Reveal } from "@/components/front/reveal";
import { PageTransition } from "@/components/page-transition";
import { catalogSectionPath } from "@/lib/catalog-section-paths";
import { findCatalogSection, readSectionListing } from "@/lib/modules/catalog-sections";
import { publicPageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";

interface SectionPageProps {
  params: Promise<{ section: string }>;
}

const MISSING: Metadata = { title: "Page introuvable", robots: { index: false, follow: false } };

/**
 * Une rubrique que le catalogue doit à un module (`catalogSections`). Le
 * catalogue ne sait pas de quel module il s'agit : il affiche les collections
 * que la section lui rend. Module désactivé, ou rien de listé : la page
 * n'existe pas.
 */
export async function generateMetadata({ params }: SectionPageProps): Promise<Metadata> {
  const { section } = await params;
  const resolved = await findCatalogSection(section);
  if (!resolved || (await readSectionListing(resolved)).collections.length === 0) return MISSING;
  return publicPageMetadata({
    title: resolved.section.label,
    description: resolved.section.description ?? `${resolved.section.label} du catalogue public.`,
    path: catalogSectionPath(resolved.section.id),
  });
}

export default async function CatalogSectionPage({ params }: SectionPageProps) {
  // Ce qui est public change d'un clic : rien n'est figé à la construction.
  await connection();
  const { section } = await params;
  const resolved = await findCatalogSection(section);
  if (!resolved) notFound();
  const { collections } = await readSectionListing(resolved);
  if (collections.length === 0) notFound();

  return (
    <PageTransition>
      <PhotoHeader
        photo="pines"
        kicker={`${collections.length} ${collections.length > 1 ? "séries" : "série"}`}
        title={`${resolved.section.label},`}
        titleAccent="à lire ici."
        description={resolved.section.description}
      />
      <section className={cn(FRONT_WIDE, "pt-4 pb-24 sm:pb-32")}>
        <ul className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {collections.map((collection, index) => (
            <Reveal as="li" key={collection.slug} delay={(index % 5) * 0.06}>
              <CatalogSectionCard card={collection} href={catalogSectionPath(resolved.section.id, collection.slug)} unit={["chapitre", "chapitres"]} />
            </Reveal>
          ))}
        </ul>
      </section>
    </PageTransition>
  );
}
