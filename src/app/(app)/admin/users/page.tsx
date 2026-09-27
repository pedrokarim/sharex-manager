import UsersPageClient from "./page.client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/api-guard";
import { listAppUsers } from "@/lib/admin-users";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata({ title: "Gestion des utilisateurs" });

export default async function UsersPage() {
  // Lecture directe : l'ancien appel HTTP à /api/admin/users ne transmettait
  // pas le cookie (headers() est asynchrone) et renvoyait vers la connexion.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (!isAdmin(session)) redirect("/");

  return <UsersPageClient initialUsers={await listAppUsers()} />;
}
