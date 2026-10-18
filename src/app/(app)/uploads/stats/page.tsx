import { headers } from "next/headers";
import { StatsPageClient } from "./page.client";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/api-guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Statistiques d'upload",
  description: "Visualisez les statistiques de vos uploads ShareX",
};

export default async function StatsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  return <StatsPageClient showNetwork={isAdmin(session)} />;
}
