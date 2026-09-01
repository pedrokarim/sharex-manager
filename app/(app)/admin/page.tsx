import { redirect } from "next/navigation";
import { AdminPageClient } from "./page.client";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Administration",
  description:
    "Gérez les paramètres d'administration de votre application ShareX Manager",
};

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || session.user.role !== "admin") {
    redirect("/");
  }

  return <AdminPageClient />;
}
