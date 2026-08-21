import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { albumFallbackDescription, getPublicAlbumSummary } from "@/lib/seo-album";
import { CatalogAlbumDetailPage } from "./page.client";

interface AlbumDetailPageProps {
  params: Promise<{
    slug: string;
  }>;
}

/**
 * C'est la page qui circule : un lien d'album partagé doit afficher le nom de
 * l'album, pas le titre générique du site. L'image d'aperçu est produite par
 * `opengraph-image.tsx`, à côté.
 */
export async function generateMetadata({
  params,
}: AlbumDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const album = getPublicAlbumSummary(slug);

  if (!album) {
    return {
      title: "Album introuvable",
      robots: { index: false, follow: false },
    };
  }

  const description =
    album.description?.trim() || albumFallbackDescription(album.imageCount);
  const url = absoluteUrl(`/catalog/albums/${slug}`);

  return {
    title: album.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      locale: "fr_FR",
      url,
      title: album.name,
      description,
      ...(album.updatedAt ? { modifiedTime: album.updatedAt } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: album.name,
      description,
    },
  };
}

export default async function AlbumDetailPage({
  params,
}: AlbumDetailPageProps) {
  const { slug } = await params;

  if (!slug) {
    notFound();
  }

  return <CatalogAlbumDetailPage slug={slug} />;
}

