import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { themeDb } from "@/lib/theme/theme-db";
import ThemeAdminPageClient from "./page.client";

export const metadata: Metadata = {
  title: "Thème global",
  description: "Pilotez le thème global du site et préparez les futures extensions de branding.",
};

export default async function AdminThemePage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user || session.user.role !== "admin") {
    redirect("/");
  }

  const globalTheme = themeDb.getGlobalThemeConfig();

  return <ThemeAdminPageClient initialGlobalTheme={globalTheme} />;
}
