import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AlbumsClient } from "./page.client";

export default async function AlbumsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return <AlbumsClient />;
}


