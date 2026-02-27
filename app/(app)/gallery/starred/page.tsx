import { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { GalleryClient } from "../page.client";

export const metadata: Metadata = {
  title: "Fichiers Favoris - ShareX Manager",
  description: "Gérez vos fichiers favoris",
};

interface SearchParams {
  q?: string;
  view?: string;
}

export default async function StarredGalleryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  const headersList = await headers();
  const resolvedSearchParams = await searchParams;

  if (!session?.user) {
    redirect("/login");
  }

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/files?page=1&limit=20&q=${
        resolvedSearchParams.q || ""
      }&starred=true`,
      {
        cache: "no-store",
        headers: {
          Cookie: headersList.get("cookie") || "",
        },
      }
    );

    const data = await res.json();

    return (
      <GalleryClient
        initialFiles={data.files}
        initialHasMore={data.hasMore}
        initialView={resolvedSearchParams.view as "grid" | "list" | "details"}
        initialSearch={resolvedSearchParams.q}

        starredOnly
      />
    );
  } catch (error) {
    console.error("Erreur lors du chargement initial des fichiers:", error);
    return (
      <GalleryClient
        initialFiles={[]}
        initialHasMore={false}
        initialView={resolvedSearchParams.view as "grid" | "list" | "details"}
        initialSearch={resolvedSearchParams.q}

        starredOnly
      />
    );
  }
}
