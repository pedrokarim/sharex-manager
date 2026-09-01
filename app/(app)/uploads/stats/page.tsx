import { StatsPageClient } from "./page.client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Statistiques d'upload",
  description: "Visualisez les statistiques de vos uploads ShareX",
};

export default function StatsPage() {
  return <StatsPageClient />;
}
