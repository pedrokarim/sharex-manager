import { Metadata } from "next";
import { MinecraftSkinApiDocClient } from "./page.client";

export const metadata: Metadata = {
  title: "Minecraft Skin API Documentation - ShareX Manager",
  description:
    "Documentation de l'API Minecraft Skin : endpoints pour rechercher des joueurs, generer des rendus et telecharger des textures",
};

export default function MinecraftSkinApiDocPage() {
  return <MinecraftSkinApiDocClient />;
}
