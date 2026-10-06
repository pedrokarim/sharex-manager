import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { SectionReader } from "@/components/catalog/section-reader";
import { FRONT_NARROW } from "@/components/front/container";
import { PhotoHeader } from "@/components/front/photo-header";
import { PageTransition } from "@/components/page-transition";
import { SITE_LINKS } from "@/config/links";
import { catalogSectionPath } from "@/lib/catalog-section-paths";
import { findCatalogSection, readSectionCollection, readSectionItem } from "@/lib/modules/catalog-sections";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { cn } from "@/lib/utils";

interface ItemPageProps {
  params: Promise<{ section: string; collection: string; item: string }>;
}

async function load(params: ItemPageProps["params"]) {
  const { section, collection, item } = await params;
  const resolved = await findCatalogSection(section);
  const found = resolved ? await readSectionItem(resolved, collection, item) : null;
  return resolved && found && found.pages.length > 0 ? { resolved, item: found } : null;
}

const pagesLabel = (count: number) => `${count} ${count > 1 ? "pages" : "page"}`;

/** Une adresse de site, pour un lien sortant : jamais autre chose que http ou https. */
function safeHref(href: string | undefined): string | undefined {
  return href && /^https?:\/\//i.test(href) ? href : undefined;
}

/**
 * C'est la page qui circule : le lien d'un chapitre partagé affiche son titre
 * et celui de sa série. Un chapitre public par son seul lien se partage, il ne
 * se référence pas (`noindex`).
 */
export async function generateMetadata({ params }: ItemPageProps): Promise<Metadata> {
  const loaded = await load(params);
  if (!loaded) return { title: "Page introuvable", robots: { index: false, follow: false } };

  const { resolved, item } = loaded;
  const title = `${item.collection.title} – ${item.title}`;
  const description = `${item.collection.title}, ${item.title} : ${pagesLabel(item.pages.length)} à lire en ligne.`;
  const url = absoluteUrl(catalogSectionPath(resolved.section.id, item.collection.slug, item.slug));
  return {
    title,
    description,
    alternates: { canonical: url },
    ...(item.listed ? {} : { robots: { index: false, follow: false, googleBot: { index: false, follow: false } } }),
    openGraph: { type: "article", siteName: SITE_NAME, locale: "fr_FR", url, title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CatalogItemPage({ params }: ItemPageProps) {
  // La visibilité se relit à chaque visite : un chapitre repassé en privé ne s'affiche plus.
  await connection();
  const loaded = await load(params);
  if (!loaded) notFound();
  const { resolved, item } = loaded;

  const sectionId = resolved.section.id;
  const hrefOf = (slug: string) => catalogSectionPath(sectionId, item.collection.slug, slug);
  // La page de la série n'existe que si elle a des chapitres listés : sinon, pas de lien vers elle.
  const collection = await readSectionCollection(resolved, item.collection.slug);
  const collectionHref = collection && collection.items.length > 0 ? catalogSectionPath(sectionId, item.collection.slug) : undefined;

  const report = `mailto:${SITE_LINKS.email}?subject=${encodeURIComponent(`Signalement : ${item.collection.title}, ${item.title}`)}&body=${encodeURIComponent(
    `Page concernée : ${absoluteUrl(hrefOf(item.slug))}\n\nCe qui pose problème :\n`,
  )}`;

  return (
    <PageTransition>
      <PhotoHeader
        photo="glade"
        kicker={
          <>
            <Link href={catalogSectionPath(sectionId)} className="transition-colors hover:text-white">
              {resolved.section.label}
            </Link>
            <span className="mx-2 text-white/40">/</span>
            {collectionHref ? (
              <Link href={collectionHref} className="text-white/70 transition-colors hover:text-white">
                {item.collection.title}
              </Link>
            ) : (
              <span className="text-white/70">{item.collection.title}</span>
            )}
          </>
        }
        title={item.title}
        description={item.collection.title}
      />

      <SectionReader
        title={`${item.collection.title}, ${item.title}`}
        reading={item.reading}
        pages={item.pages}
        previous={item.previous ? { href: hrefOf(item.previous.slug), title: item.previous.title } : undefined}
        next={item.next ? { href: hrefOf(item.next.slug), title: item.next.title } : undefined}
        collection={collectionHref ? { href: collectionHref, title: `Tous les chapitres de ${item.collection.title}` } : undefined}
      />

      <section className="bg-foreground/[0.035] py-14">
        <div className={cn(FRONT_NARROW, "text-sm text-muted-foreground")}>
          {item.credits && item.credits.length > 0 ? (
            <dl className="mb-6 grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
              {item.credits.map((credit) => {
                const href = safeHref(credit.href);
                return (
                  <div key={credit.label} className="contents">
                    <dt className="font-medium text-foreground">{credit.label}</dt>
                    <dd className="min-w-0 break-words">
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-1 underline-offset-4 hover:text-foreground">
                          {credit.value}
                        </a>
                      ) : (
                        credit.value
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          ) : null}
          <p className="text-pretty">
            Ces pages sont publiées par la personne qui tient ce site, sous sa responsabilité. Un contenu qui ne devrait pas être ici ?{" "}
            <a href={report} className="font-medium text-foreground underline decoration-1 underline-offset-4 hover:opacity-80">
              Signaler un problème
            </a>
            .
          </p>
        </div>
      </section>
    </PageTransition>
  );
}
