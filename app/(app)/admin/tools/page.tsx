import { Metadata } from "next";
import { AdminToolsPageClient } from "./page.client";
import { getAdminCacheStats } from "@/lib/minecraft/admin-service";

export const metadata: Metadata = {
  title: "Administration - Outils Minecraft | ShareX Manager",
  description: "Gestion des outils Minecraft et statistiques du cache",
};

export default function AdminToolsPage() {
  // Récupérer les statistiques du cache côté serveur
  const cacheStats = getAdminCacheStats();

  return <AdminToolsPageClient initialCacheStats={cacheStats} />;
}
