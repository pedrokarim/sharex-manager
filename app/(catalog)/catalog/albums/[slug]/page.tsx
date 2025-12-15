import { notFound } from "next/navigation";
import { CatalogAlbumDetailPage } from "./page.client";

interface AlbumDetailPageProps {
  params: Promise<{
    slug: string;
  }>;
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

