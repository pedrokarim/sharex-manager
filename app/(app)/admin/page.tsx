import { redirect } from "next/navigation";
import { AdminPageClient } from "./page.client";
import { auth } from "@/auth";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Administration | ShareX Manager",
  description:
    "Gérez les paramètres d'administration de votre application ShareX Manager",
};

export default async function AdminPage() {
  const session = await auth();

  if (!session || session.user.role !== "admin") {
    redirect("/");
  }

  return <AdminPageClient />;
}
