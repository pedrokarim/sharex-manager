import { privatePageMetadata } from "@/lib/seo";
import { CollectionPageClient } from "./page.client";

export const metadata = privatePageMetadata({ title: "Collection" });

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CollectionPageClient slug={slug} />;
}
