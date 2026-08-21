import { Metadata } from "next";
import { ToolsPageClient } from "./page.client";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Outils",
  description:
    "Just Tools et MCInfo, les deux services annexes d'Ascencia : outils de développement, données de serveurs et de skins Minecraft.",
  path: "/tools",
});


export default function ToolsPage() {
  return <ToolsPageClient />;
}
