import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { themeDb } from "@/lib/theme/theme-db";
import ThemeAdminPageClient from "./page.client";
import { loadAllIconSets } from "@/lib/icon-themes/server";

export const metadata: Metadata = {
  title: "Thème global",
  description: "Le mode, les couleurs et les icônes du site.",
};

export default async function AdminThemePage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user || session.user.role !== "admin") {
    redirect("/");
  }

  const globalTheme = themeDb.getGlobalThemeConfig();
  // Tous les jeux partent avec la page : changer de jeu ne télécharge rien,
  // l’aperçu remplace les icônes d’un seul coup.
  const iconSets = await loadAllIconSets();

  return (
    <ThemeAdminPageClient
      initialGlobalTheme={globalTheme}
      initialIconSet={themeDb.getIconSet()}
      iconSets={iconSets}
    />
  );
}
