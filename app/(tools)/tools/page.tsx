import { Metadata } from "next";
import { ToolsPageClient } from "./page.client";

export const metadata: Metadata = {
  title: "Tools - ShareX Manager",
  description: "Outils et fonctionnalités supplémentaires",
};

export default function ToolsPage() {
  return <ToolsPageClient />;
}
