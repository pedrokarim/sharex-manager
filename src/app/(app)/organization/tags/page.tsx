import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { listAppUsers } from "@/lib/admin-users";
import { privatePageMetadata } from "@/lib/seo";
import { TagsPageClient } from "./page.client";

export const metadata = privatePageMetadata({ title: "Tags" });

export default async function TagsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  // La colonne « Créateur » montre un nom de compte, pas un identifiant. Seuls
  // l'identifiant et le nom partent vers la page.
  let userNames: Record<string, string> = {};
  try {
    userNames = Object.fromEntries((await listAppUsers()).map((user) => [user.id, user.username]));
  } catch (error) {
    console.error("Comptes illisibles pour la page des tags:", error);
  }

  return (
    <TagsPageClient
      viewer={{ id: session.user.id, isAdmin: session.user.role === "admin" }}
      userNames={userNames}
    />
  );
}
