import { Metadata } from "next";
import { ToolsPageClient } from "./page.client";

export const metadata: Metadata = {
  title: "Outils — ShareX Manager",
  description:
    "Just Tools et MCInfo : les services annexes d'Ascencia, accessibles depuis ShareX Manager.",
};

export default function ToolsPage() {
  return <ToolsPageClient />;
}
