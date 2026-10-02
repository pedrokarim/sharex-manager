import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { GalleryClient } from "./page.client";
import { headers } from "next/headers";
import { readGalleryFirstPage } from "@/lib/gallery-listing";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata({ title: "Galerie" });

interface SearchParams {
  q?: string;
  view?: string;
  secure?: string;
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

  // Lecture directe : la page arrive avec ses fichiers, sans requête vers
  // sa propre API.
  const firstPage = await readGalleryFirstPage({
    search: resolvedSearchParams.q || "",
  });

  return (
    <GalleryClient
      initialFiles={firstPage.files}
      initialHasMore={firstPage.hasMore}
      initialView={resolvedSearchParams.view as "grid" | "list" | "details"}
      initialSearch={resolvedSearchParams.q}
    />
  );
}
