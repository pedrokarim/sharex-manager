import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { GalleryClient } from "./page.client";
import { headers } from "next/headers";

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
  const session = await auth();
  const headersList = await headers();
  const resolvedSearchParams = await searchParams;

  if (!session) {
    redirect("/login");
  }

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/files?page=1&limit=20&q=${
        resolvedSearchParams.q || ""
      }`,
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

      />
    );
  }
}
