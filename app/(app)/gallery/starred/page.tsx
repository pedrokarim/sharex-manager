import { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
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
  searchParams: SearchParams;
}) {
  const session = await auth();
  const cookieStore = cookies();

  if (!session?.user) {
    redirect("/login");
  }

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/files?page=1&limit=20&q=${
        searchParams.q || ""
      }&starred=true`,
      {
        cache: "no-store",
        headers: {
          Cookie: cookieStore.toString(),
        },
      }
    );

    const data = await res.json();

    return (
      <GalleryClient
        initialFiles={data.files}
        initialHasMore={data.hasMore}
        initialView={searchParams.view as "grid" | "list" | "details"}
        initialSearch={searchParams.q}
        initialPage={1}
        starredOnly
      />
    );
  } catch (error) {
    console.error("Erreur lors du chargement initial des fichiers:", error);
    return (
      <GalleryClient
        initialFiles={[]}
        initialHasMore={false}
        initialView={searchParams.view as "grid" | "list" | "details"}
        initialSearch={searchParams.q}
        initialPage={1}
        starredOnly
      />
    );
  }
}
