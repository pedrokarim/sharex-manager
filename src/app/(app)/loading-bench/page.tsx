import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/api-guard";
import { privatePageMetadata } from "@/lib/seo";
import { LoadingBenchClient } from "./page.client";

export const metadata = privatePageMetadata({ title: "Banc des chargements" });

/** Banc d'essai réservé à l'administration : tous les visuels d'attente de l'application, en direct. */
export default async function LoadingBenchPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !isAdmin(session)) redirect("/");
  return <LoadingBenchClient />;
}
