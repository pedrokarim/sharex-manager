import { Metadata } from "next";
import { MinecraftSkinPageClient } from "./page.client";

export const metadata: Metadata = {
  title: "Minecraft Skin Viewer - ShareX Manager",
  description:
    "Visualiseur de skins Minecraft avec rendu 3D interactif et rendus serveur",
};

export default async function MinecraftSkinPage({
  searchParams,
}: {
  searchParams: Promise<{ username?: string }>;
}) {
  const params = await searchParams;
  return <MinecraftSkinPageClient initialUsername={params.username} />;
}
