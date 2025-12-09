import { Metadata } from "next";
import { MinecraftSkinPageClient } from "./page.client";

export const metadata: Metadata = {
  title: "Minecraft Skin Renderer - ShareX Manager",
  description: "Générateur d'images de skins Minecraft en 2D et 3D avec rendu spatial",
};

export default function MinecraftSkinPage() {
  return <MinecraftSkinPageClient />;
}
