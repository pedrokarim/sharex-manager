import { StatsPageClient } from "./page.client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Statistiques des uploads | ShareX Manager",
  description: "Visualisez les statistiques de vos uploads ShareX",
};

export default function StatsPage() {
  return <StatsPageClient />;
} 