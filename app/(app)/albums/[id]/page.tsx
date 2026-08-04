import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { AlbumViewClient } from "./page.client";

interface AlbumPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function AlbumPage({ params }: AlbumPageProps) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const albumId = parseInt(id);
  if (isNaN(albumId)) {
    redirect("/albums");
  }

  return <AlbumViewClient albumId={albumId} />;
}
