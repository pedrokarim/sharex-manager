import { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { GalleryClient } from "../page.client";
import { readGalleryFirstPage } from "@/lib/gallery-listing";

export const metadata: Metadata = {
  title: "Fichiers sécurisés",
  description: "Gérez vos fichiers privés",
};

interface SearchParams {
  q?: string;
  view?: string;
}

export default async function SecureGalleryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const resolvedSearchParams = await searchParams;

  if (!session?.user) {
    redirect("/login");
  }

  // Lecture directe : la page arrive avec ses fichiers, sans requête vers
  // sa propre API.
  const firstPage = await readGalleryFirstPage({
    search: resolvedSearchParams.q || "",
    secureOnly: true,
  });

  return (
    <GalleryClient
      initialFiles={firstPage.files}
      initialHasMore={firstPage.hasMore}
      initialView={resolvedSearchParams.view as "grid" | "list" | "details"}
      initialSearch={resolvedSearchParams.q}
      secureOnly
    />
  );
}
