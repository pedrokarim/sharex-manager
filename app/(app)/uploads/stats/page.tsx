import { StatsPageClient } from "./page.client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Upload Statistics | ShareX Manager",
  description: "Visualize statistics of your ShareX uploads",
};

export default function StatsPage() {
  return <StatsPageClient />;
}
