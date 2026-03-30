import type { Metadata } from "next";
import ThemeSettingsPageClient from "./page.client";

export const metadata: Metadata = {
  title: "ShareX Manager - Thème utilisateur",
  description:
    "Choisissez votre priorité de thème et personnalisez votre palette personnelle sans modifier le thème global du site.",
};

export default function ThemePage() {
  return <ThemeSettingsPageClient />;
}
