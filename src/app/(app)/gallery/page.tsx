import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { GalleryClient } from "./page.client";
import { headers } from "next/headers";
import { readGalleryFirstPage } from "@/lib/gallery-listing";
import { privatePageMetadata } from "@/lib/seo";
import { slugify } from "@/lib/organization/types";

export const metadata = privatePageMetadata({ title: "Galerie" });

interface SearchParams {
  q?: string;
  view?: string;
  secure?: string;
  /** `?tag=valorant`, répétable : fichiers qui portent tous ces tags. */
  tag?: string | string[];
}

/** Les slugs du filtre, sans doublon ni valeur vide : la même lecture que `galleryQueryFrom`. */
function tagsFrom(value: string | string[] | undefined): string[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(list.map(slugify).filter(Boolean))];
}

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const resolvedSearchParams = await searchParams;

  if (!session) {
    redirect("/login");
  }

  const tags = tagsFrom(resolvedSearchParams.tag);

  // Lecture directe : la page arrive avec ses fichiers, sans requête vers
  // sa propre API.
  const firstPage = await readGalleryFirstPage({
    search: resolvedSearchParams.q || "",
    ...(tags.length > 0 ? { tags } : {}),
  });

  return (
    <GalleryClient
      initialFiles={firstPage.files}
      initialHasMore={firstPage.hasMore}
      initialView={resolvedSearchParams.view as "grid" | "list" | "details"}
      initialSearch={resolvedSearchParams.q}
      tags={tags.length > 0 ? tags : undefined}
    />
  );
}
