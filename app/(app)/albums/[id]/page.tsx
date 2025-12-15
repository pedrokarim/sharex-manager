import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AlbumViewClient } from "./page.client";

interface AlbumPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function AlbumPage({ params }: AlbumPageProps) {
  const session = await auth();

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
