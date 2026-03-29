import { Metadata } from "next";
import { MinecraftSkinPageClient } from "./page.client";

export const metadata: Metadata = {
  title: "Minecraft Skin Viewer - ShareX Manager",
  description: "Ce service a été migré vers mcinfo.ascencia.re",
};

export default function MinecraftSkinPage() {
  return <MinecraftSkinPageClient />;
}
